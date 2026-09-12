"""P2 Stage B/C — the GRPO trainer.

$0 by default. This file trains nothing until it is pointed at a GPU and given
steps, and `--dry` is the Stage C proof that the loop closes: 2 prompts, 2
generations, no vLLM, 2 optimizer steps, and an assertion that the tool mask is
real.

Everything here was checked against the installed TRL (1.13.0) rather than
against documentation or recall. The four mechanisms in TRL issue #6688 that
describe our exact configuration are mitigated explicitly and named where they
are handled:

  (a) merge/unmerge bf16 drift   — only on the vLLM path, which `--dry` and the
                                   first smoke arm do not take (`use_vllm=False`).
  (b) LoRA init is not seed-controlled — `--save-init-adapter` / `--init-adapter`
                                   make both arms start from identical weights.
  (c) sequence-level IS masks long rollouts — the default really is
                                   `vllm_importance_sampling_mode="sequence_mask"`
                                   with `vllm_importance_sampling_clip_max=3.0`
                                   (verified in grpo_config.py). We set
                                   `token_truncate`.
  (d) the vLLM+PEFT+IS tests are skipped upstream — hence build order:
                                   correctness on HF generate first, vLLM earned later.

Usage (Stage C, $0, local):
    python train.py --dry --out ../dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import time
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from env import COUNTERS as ENV_COUNTERS, make_environment_factory  # noqa: E402
from reward import make_random_reward, make_score_reward  # noqa: E402

DEFAULT_BASE_URL = os.environ.get("P2_ENV_URL", "http://127.0.0.1:8765")
DEFAULT_MODEL = "Qwen/Qwen3-4B-Instruct-2507"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="P2 GRPO trainer (rollout arc)")
    p.add_argument("--dry", action="store_true", help="Stage C: 2 prompts, 2 generations, 2 steps, no vLLM")
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--base-url", default=DEFAULT_BASE_URL)
    p.add_argument("--out", default=str(HERE.parent / "runs" / "dry"))
    p.add_argument("--steps", type=int, default=200, help="R2.10: 200-500 is the consistent window")
    p.add_argument("--num-generations", type=int, default=8)
    p.add_argument("--per-device-batch", type=int, default=8, help="completions per device step, not prompts")
    p.add_argument("--grad-accum", type=int, default=1)
    p.add_argument("--lr", type=float, default=1e-5, help="R2.6: LoRA LR is 10x the full-finetune rate")
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    p.add_argument("--beta", type=float, default=1e-4, help="R4.18: NOT 0, purely so KL is logged")
    p.add_argument("--epsilon", type=float, default=0.2)
    p.add_argument("--epsilon-high", type=float, default=0.28, help="R2.9: clip-higher (DAPO)")
    p.add_argument("--max-completion-length", type=int, default=1024)
    p.add_argument("--max-tool-iterations", type=int, default=5, help="default is unbounded; #6688 saw 46")
    p.add_argument("--limit", type=int, default=0, help="cap the training rows (0 = all)")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--use-vllm", action="store_true", help="earned, never a default (see module docstring)")
    p.add_argument("--random-reward", action="store_true", help="lock §6 spurious-reward control arm")
    p.add_argument("--save-init-adapter", default=None, help="write the step-0 adapter here (#6688b)")
    p.add_argument("--init-adapter", default=None, help="load a step-0 adapter so both arms share LoRA init")
    return p.parse_args()


def load_cases(base_url: str, split: str, limit: int = 0) -> list[dict]:
    """The bridge owns the corpus, so the library the tools serve and the
    prompts the trainer sees cannot disagree about the generator seed."""
    url = f"{base_url.rstrip('/')}/cases?split={split}" + (f"&limit={limit}" if limit else "")
    res = httpx.get(url, timeout=120.0)
    res.raise_for_status()
    rows = res.json()["cases"]
    # Keep only what reset() and the reward need. Every surviving column is
    # passed to reset(**row) AND to the reward function as a kwarg.
    keep = ("id", "gold", "song_id", "level", "distance", "prompt")
    return [{k: r[k] for k in keep} for r in rows]


def assert_tool_calling_template(processing_class) -> str:
    """Stage B step 4, before anything else.

    TRL refuses `environment_factory` unless the chat template can render a full
    user -> assistant(tool_calls) -> tool conversation, and it silently swaps in
    a training template when the tokenizer's own is not prefix-preserving. Both
    facts are load-bearing, so both are asserted rather than assumed.
    """
    from trl.chat_template_utils import supports_tool_calling

    if not supports_tool_calling(processing_class):
        raise SystemExit(
            "HALT: this chat template cannot render a tool-calling conversation. "
            "environment_factory requires it; nothing below would be measuring the right environment."
        )
    convo = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "find it"},
        {"role": "assistant", "content": "", "tool_calls": [
            {"type": "function", "function": {"name": "list_measures", "arguments": {"id": "x", "startMeasure": 1, "endMeasure": 4}}}
        ]},
        {"role": "tool", "name": "list_measures", "content": "# x - Measures 1 to 4"},
        {"role": "assistant", "content": "3"},
    ]
    rendered = processing_class.apply_chat_template(convo, tokenize=False)
    for needle in ("list_measures", "Measures 1 to 4"):
        if needle not in rendered:
            raise SystemExit(f"HALT: the round-tripped template dropped {needle!r}; the transcript would not survive training.")
    return rendered


def main() -> int:
    args = parse_args()
    if args.dry:
        # --dry picks a shape small enough to close the loop in minutes, but it
        # must not silently override a shape the caller asked for: the same
        # harness measures step time at the production shape, which is what
        # prices the smoke run.
        explicit = {a.split("=", 1)[0] for a in sys.argv[1:] if a.startswith("--")}
        if "--steps" not in explicit:
            args.steps = 2
        if "--num-generations" not in explicit:
            args.num_generations = 2
        if "--per-device-batch" not in explicit:
            args.per_device_batch = args.num_generations
        if "--grad-accum" not in explicit:
            args.grad_accum = 1
        if "--max-completion-length" not in explicit:
            args.max_completion_length = min(args.max_completion_length, 256)
        args.limit = args.limit or max(2, args.per_device_batch // max(1, args.num_generations) * 2)
        args.use_vllm = False

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    import torch
    import transformers
    import trl
    import peft
    import accelerate
    from datasets import Dataset
    from peft import LoraConfig
    from transformers import AutoTokenizer, TrainerCallback
    from trl import GRPOConfig, GRPOTrainer

    health = httpx.get(f"{args.base_url.rstrip('/')}/health", timeout=60.0).json()
    print(f"[p2-train] bridge ok: library={health['library_songs']} tools={len(health['tools'])} limits={health['limits']}")

    rows = load_cases(args.base_url, "train", args.limit)
    if not rows:
        raise SystemExit("HALT: the bridge returned no training rows")
    dataset = Dataset.from_list(rows)
    print(f"[p2-train] {len(dataset)} training rows, columns={dataset.column_names}")

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    assert_tool_calling_template(tokenizer)
    print("[p2-train] chat template round-trips user -> assistant(tool_calls) -> tool")

    # ── mask probe: Stage C step 7 ───────────────────────────────────────────
    mask_stats: dict[str, float] = {"batches": 0, "completions": 0, "with_zero_span": 0, "zeros": 0, "ones": 0}

    class MaskProbeTrainer(GRPOTrainer):
        """`_generate` returns the tool_mask TRL will multiply into the loss
        (verified: grpo_trainer.py line 2345). Reading it here is the only way
        to prove the mask is real rather than all-ones, and an all-ones mask
        means we are training on our own MCP server's output."""

        def _generate(self, prompts):
            result = super()._generate(prompts)
            tool_mask = result[2]
            if tool_mask is not None:
                mask_stats["batches"] += 1
                for mask in tool_mask:
                    mask_stats["completions"] += 1
                    zeros = sum(1 for v in mask if v == 0)
                    mask_stats["zeros"] += zeros
                    mask_stats["ones"] += len(mask) - zeros
                    if zeros:
                        mask_stats["with_zero_span"] += 1
            return result

    step_times: list[float] = []

    class StepTimer(TrainerCallback):
        """The measured local step time is what prices the smoke run. It
        replaces every estimate, per the handoff's §4."""

        def __init__(self) -> None:
            self._t0: float | None = None

        def on_step_begin(self, *_a, **_k):
            self._t0 = time.perf_counter()

        def on_step_end(self, *_a, **_k):
            if self._t0 is not None:
                step_times.append(time.perf_counter() - self._t0)

    reward_funcs = [make_random_reward(args.seed) if args.random_reward else make_score_reward(args.base_url)]

    config = GRPOConfig(
        output_dir=str(out / "hf"),
        max_steps=args.steps,
        per_device_train_batch_size=args.per_device_batch,
        gradient_accumulation_steps=args.grad_accum,
        num_generations=args.num_generations,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        logging_steps=1,
        save_strategy="no",
        report_to="none",
        seed=args.seed,
        bf16=torch.cuda.is_available(),
        gradient_checkpointing=True,
        beta=args.beta,
        epsilon=args.epsilon,
        epsilon_high=args.epsilon_high,
        max_completion_length=args.max_completion_length,
        max_tool_calling_iterations=args.max_tool_iterations,
        use_vllm=args.use_vllm,
        vllm_mode="colocate",
        # #6688c: the default masks out any sequence whose IS ratio exceeds 3.0,
        # which silently zeroes long rollouts. Clip per token instead.
        vllm_importance_sampling_mode="token_truncate",
        log_completions=True,
        num_completions_to_print=2 if args.dry else 0,
    )

    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.0,
        target_modules="all-linear",  # R2.6: attention-only significantly underperforms
        task_type="CAUSAL_LM",
    )

    trainer = MaskProbeTrainer(
        model=args.model,
        args=config,
        train_dataset=dataset,
        processing_class=tokenizer,
        peft_config=peft_config,
        reward_funcs=reward_funcs,
        environment_factory=make_environment_factory(args.base_url),
        callbacks=[StepTimer()],
    )

    # #6688b: GRPOConfig.seed is applied well after get_peft_model, so LoRA init
    # is not seed-controlled. Pin it by artifact instead of by seed.
    if args.init_adapter:
        from peft import set_peft_model_state_dict
        from safetensors.torch import load_file

        state = load_file(str(Path(args.init_adapter) / "adapter_model.safetensors"))
        set_peft_model_state_dict(trainer.model, state)
        print(f"[p2-train] loaded step-0 adapter from {args.init_adapter}")
    if args.save_init_adapter:
        Path(args.save_init_adapter).mkdir(parents=True, exist_ok=True)
        trainer.model.save_pretrained(args.save_init_adapter)
        print(f"[p2-train] saved step-0 adapter to {args.save_init_adapter}")

    t0 = time.perf_counter()
    trainer.train()
    wall = time.perf_counter() - t0

    # Re-read the bridge AFTER training: the counters are the proof that the
    # rollouts actually went through the real MCP server and the one scoreReward,
    # rather than through anything reimplemented in Python.
    health_after = httpx.get(f"{args.base_url.rstrip('/')}/health", timeout=60.0).json()

    receipt = {
        "stage": "dry" if args.dry else "train",
        "shape": {
            "prompts_per_step": args.per_device_batch // max(1, args.num_generations),
            "generations_per_prompt": args.num_generations,
            "completions_per_step": args.per_device_batch * args.grad_accum,
        },
        "spend": 0 if args.dry else None,
        "model": args.model,
        "steps_requested": args.steps,
        "steps_timed": len(step_times),
        "step_seconds": [round(s, 3) for s in step_times],
        "mean_step_seconds": round(sum(step_times) / len(step_times), 3) if step_times else None,
        "wall_seconds": round(wall, 3),
        "mask": {
            **{k: int(v) for k, v in mask_stats.items()},
            "zero_fraction": round(mask_stats["zeros"] / max(1.0, mask_stats["zeros"] + mask_stats["ones"]), 4),
        },
        "config": {
            "num_generations": args.num_generations,
            "per_device_train_batch_size": args.per_device_batch,
            "gradient_accumulation_steps": args.grad_accum,
            "learning_rate": args.lr,
            "beta": args.beta,
            "epsilon": args.epsilon,
            "epsilon_high": args.epsilon_high,
            "max_completion_length": args.max_completion_length,
            "max_tool_calling_iterations": args.max_tool_iterations,
            "use_vllm": args.use_vllm,
            "vllm_importance_sampling_mode": config.vllm_importance_sampling_mode,
            "vllm_importance_sampling_clip_max": config.vllm_importance_sampling_clip_max,
            "lora": {"r": args.lora_r, "alpha": args.lora_alpha, "target_modules": "all-linear", "dropout": 0.0},
            "random_reward_arm": args.random_reward,
        },
        "versions": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "transformers": transformers.__version__,
            "trl": trl.__version__,
            "peft": peft.__version__,
            "accelerate": accelerate.__version__,
            "cuda": torch.version.cuda,
            "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
            "capability": list(torch.cuda.get_device_capability(0)) if torch.cuda.is_available() else None,
        },
        "bridge": {
            "before": health["counters"],
            "after": health_after["counters"],
            "library_songs": health["library_songs"],
            "generator_seed": health["generator_seed"],
            "schema_version": health["schema_version"],
            "tools": health["tools"],
            "limits": health["limits"],
        },
        "environment": dict(ENV_COUNTERS),
        "dataset_rows": len(dataset),
    }
    (out / "dry-run.json" if args.dry else out / "run.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"[p2-train] shape {receipt['shape']} -> {receipt['mean_step_seconds']}s/step")
    print(json.dumps(receipt["mask"], indent=2))
    print(f"[p2-train] steps={len(step_times)} mean_step={receipt['mean_step_seconds']}s wall={receipt['wall_seconds']}s")
    print(f"[p2-train] bridge tool_calls={health_after['counters']['tool_calls']} scored={health_after['counters']['scored']} "
          f"env instances={ENV_COUNTERS['instances']} resets={ENV_COUNTERS['resets']}")

    if args.dry:
        # The two Stage C gates. A dry run that "passes" without these has
        # proved only that the process exited 0.
        if len(step_times) < 2:
            raise SystemExit(f"HALT: {len(step_times)} optimizer steps completed; step 2 is where OOM appears (R3.15)")
        if mask_stats["with_zero_span"] == 0:
            raise SystemExit("HALT: tool_mask is all ones — the loss would include our own MCP server's output")
        if health_after["counters"]["tool_calls"] <= health["counters"]["tool_calls"]:
            raise SystemExit("HALT: the bridge served no tool calls — the rollouts never reached the real MCP server")
        if health_after["counters"]["scored"] <= health["counters"]["scored"]:
            raise SystemExit("HALT: the bridge scored nothing — the reward did not come from scoreReward")
        if ENV_COUNTERS["resets"] == 0:
            raise SystemExit("HALT: reset() was never called; the pooled-environment contract does not hold here")
        print("[p2-train] STAGE C PASS — two optimizer steps, non-trivial tool mask")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
