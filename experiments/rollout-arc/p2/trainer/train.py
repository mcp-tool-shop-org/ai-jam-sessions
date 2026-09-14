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

ON WINDOWS, SET `PYTHONIOENCODING=utf-8`. `--dry` sets
`num_completions_to_print=2`, and TRL prints that table through rich, which falls
back to the legacy Windows console writer and raises `UnicodeEncodeError` on the
first non-cp1252 character in a completion. The failure lands AFTER step 1 has
already run, so the traceback points at `trainer.train()` and looks like a
training bug rather than a console encoding one. Pods are Linux and never see it.
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

from env import COUNTERS as ENV_COUNTERS, make_environment_factory, make_plain_tools  # noqa: E402
from prefix_rollout import make_prefix_rollout, new_stats as new_prefix_stats  # noqa: E402
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
    # TRL's own default is 0.0. This arc moved off it to 1e-4 for OBSERVABILITY (R4.9/R4.18,
    # p2/BUILD.md:254) -- so that TRL would emit a `kl` series at all. The side effect was not
    # costed at the time: with beta > 0 a zero-std group contributes NOTHING to the policy term
    # and its KL term still carries gradient (huggingface/trl#5588, closed not_planned by the
    # maintainer as the specified objective), and 46-76% of this cell's groups are zero-std.
    # The default stays 1e-4 so the control arm is byte-identical to every prior run; the
    # treatment arm passes --beta 0.0 explicitly.
    p.add_argument("--beta", type=float, default=1e-4,
                   help="R4.18: 1e-4 is an OBSERVABILITY choice, not a regularisation one")
    p.add_argument("--epsilon", type=float, default=0.2)
    p.add_argument("--epsilon-high", type=float, default=0.28, help="R2.9: clip-higher (DAPO)")
    p.add_argument("--max-completion-length", type=int, default=1024)
    p.add_argument("--max-tool-iterations", type=int, default=5, help="default is unbounded; #6688 saw 46")
    p.add_argument("--limit", type=int, default=0, help="cap the training rows (0 = all)")
    p.add_argument(
        "--no-tools",
        action="store_true",
        help=(
            "single-turn: pass NEITHER tools nor environment_factory. For the P4 "
            "voice-leading surface, where the completion is the answer and there is "
            "no tool loop to mask. Scoring still goes through --base-url /score."
        ),
    )
    p.add_argument(
        "--prefix-mode",
        choices=("none", "heterogeneous", "stratified"),
        default="none",
        help=(
            "exploring starts. `heterogeneous`: every rollout in a group is pre-filled "
            "with a DIFFERENT valid opening, so the group spans the opening space. "
            "`stratified`: one opening per group, carried in the group identity, so the "
            "group-relative advantage stays exactly valid. PREFIX-PREREG.md Part 1 fixes "
            "which one a run uses and why; the measured default is heterogeneous."
        ),
    )
    p.add_argument(
        "--prefix-in-loss",
        action="store_true",
        help=(
            "let the forced opening's tokens receive gradient (Prefix-GRPO, arXiv "
            "2607.19395). OFF by default: training on tokens the model did not choose "
            "reinforces the diversity that was injected. Recorded on the receipt either way."
        ),
    )
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--use-vllm", action="store_true", help="earned, never a default (see module docstring)")
    p.add_argument("--random-reward", action="store_true", help="lock §6 spurious-reward control arm")
    p.add_argument(
        "--plain-tools",
        action="store_true",
        help="drive the same nine tools through TRL's `tools=` path instead of "
        "`environment_factory=`. The rollout-collapse discriminator: everything "
        "else is held identical.",
    )
    p.add_argument("--save-init-adapter", default=None, help="write the step-0 adapter here (#6688b)")
    p.add_argument(
        "--save-final-adapter",
        default=None,
        help=(
            "write the TRAINED adapter here when training finishes. `save_strategy=\"no\"` "
            "means nothing else does, so without this a run that trains perfectly leaves no "
            "weights and its own preregistered falsifier -- top_first_measure_share on an "
            "UNCONDITIONED eval -- cannot be measured at all. Caught before the spend, not after."
        ),
    )
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
    #
    # REQUIRED is the contract every bridge must satisfy; OPTIONAL is per-task
    # metadata that rides along when the bridge supplies it. The old fixed tuple
    # hard-coded the synth corpus (level/distance) and raised KeyError on any other
    # task, which is what the P4 voice-leading bridge hit on its first dry pass.
    required = ("id", "gold", "prompt")
    # `openings` / `prefixes` ride along from the P4 bridge for prefix forcing. They
    # are ignored entirely when --prefix-mode is none.
    optional = ("song_id", "level", "distance", "voices", "style", "chords", "openings", "prefixes")
    missing = [k for k in required if not rows or k not in rows[0]]
    if missing:
        raise SystemExit(
            f"HALT: the bridge at {base_url} returned rows without {missing}. "
            f"Every /cases row needs id, gold and prompt."
        )
    return [{k: r[k] for k in required + optional if k in r} for r in rows]


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
    # Which flags the operator actually typed. Hoisted out of the dry block: the
    # prompt-repeat guard below needs it, because a repeat the operator CHOSE (an
    # explicit --limit, i.e. multiple epochs over a deliberate draw) is legitimate
    # training, while a repeat produced by a DEFAULT is the defect that recorded
    # dataset_rows: 2 on the paid smoke run.
    explicit = {a.split("=", 1)[0] for a in sys.argv[1:] if a.startswith("--")}

    if args.dry:
        # --dry picks a shape small enough to close the loop in minutes, but it
        # must not silently override a shape the caller asked for: the same
        # harness measures step time at the production shape, which is what
        # prices the smoke run.
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
        # The old default here was `max(2, per_device_batch // num_generations * 2)`.
        # Two lines above, per_device_batch is set EQUAL to num_generations, so that
        # expression is max(2, 1 * 2) = 2 — ALWAYS 2, whatever --steps says. The paid
        # smoke run recorded dataset_rows: 2 and cycled the same pair of prompts for
        # every step. Size the draw from the run instead.
        prompts_per_step = max(1, args.per_device_batch // max(1, args.num_generations))
        args.limit = args.limit or max(2, args.steps * prompts_per_step)
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
    # Two bridges speak this contract now and their /health shapes differ: the synth
    # bridge reports library_songs/limits, the P4 voice-leading bridge reports a task,
    # a pool_size and an EMPTY tool list. Print what is there rather than assuming one.
    if "library_songs" in health:
        print(
            f"[p2-train] bridge ok: library={health['library_songs']} "
            f"tools={len(health.get('tools', []))} limits={health.get('limits')}"
        )
    else:
        print(
            f"[p2-train] bridge ok: task={health.get('task')} pool={health.get('pool_size')} "
            f"tools={len(health.get('tools', []))} voices={health.get('voices')} style={health.get('style')}"
        )

    rows = load_cases(args.base_url, "train", args.limit)
    if not rows:
        raise SystemExit("HALT: the bridge returned no training rows")

    # ── prefix forcing (exploring starts) ────────────────────────────────────
    # The base policy opens 87.4% of its passing completions on the same voicing,
    # so a group of G is one strategy sampled G times. Pre-filling each rollout's
    # assistant turn with a valid opening it would not have chosen breaks that.
    # PREFIX-PREREG.md fixes which group design a run uses, and why.
    prefix_stats = new_prefix_stats() if args.prefix_mode != "none" else None
    pool_items = len(rows)
    openings_hist: dict[int, int] = {}
    if args.prefix_mode != "none":
        if not args.no_tools:
            raise SystemExit(
                "HALT: prefix forcing pre-fills a single assistant turn and owns generation; "
                "it cannot share a batch with the tool loop. Pass --no-tools."
            )
        if "prefixes" not in rows[0]:
            raise SystemExit(
                "HALT: --prefix-mode needs a `prefixes` column on every /cases row and this "
                "bridge served none. The P4 voice-leading bridge derives the opening alphabet "
                "by RENDERING each candidate; a trainer that guessed it would be guessing at "
                "chord cardinality."
            )
        for r in rows:
            n = len(r.get("prefixes") or [])
            if n == 0:
                raise SystemExit(f"HALT: item {r['id']!r} has no valid opening; it cannot be forced")
            openings_hist[n] = openings_hist.get(n, 0) + 1

        if args.prefix_mode == "stratified":
            # One dataset row per (item, opening), so the opening is part of the GROUP
            # IDENTITY and the group-relative advantage compares rollouts that share a
            # conditioning context exactly. `gold` is untouched: the bridge still looks
            # the progression up by song id.
            expanded = []
            for r in rows:
                for j, pfx in enumerate(r["prefixes"]):
                    row = {k: v for k, v in r.items() if k not in ("prefixes", "openings")}
                    row["id"] = f"{r['id']}#o{j}"
                    row["prefix"] = pfx
                    row["opening_index"] = j
                    expanded.append(row)
            rows = expanded
    # `openings` is receipt metadata, not training data: summarised above and dropped
    # so it never reaches a reward kwarg or a completions table.
    rows = [{k: v for k, v in r.items() if k != "openings"} for r in rows]

    dataset = Dataset.from_list(rows)
    print(f"[p2-train] {len(dataset)} training rows, columns={dataset.column_names}")

    # A run that asks for more prompt-slots than it has rows silently REPEATS prompts,
    # and every repeat is a group the optimizer sees twice. prompt_repeats is recorded on
    # EVERY run, because the failure is invisible in the metrics: the loss curve of a 2-row
    # dataset cycled 32 times looks exactly like training. It HALTS when nobody chose the
    # repeat, and warns when an explicit --limit says the operator did.
    prompts_per_step = max(1, args.per_device_batch // max(1, args.num_generations))
    slots = args.steps * prompts_per_step
    prompt_repeats = slots / len(dataset)
    print(f"[p2-train] prompt_repeats={prompt_repeats:.2f} ({slots} slots / {len(dataset)} rows)")
    if slots > len(dataset):
        if "--limit" in explicit:
            # The operator sized the draw. Repeats are epochs, which is a real training
            # choice — record it loudly and proceed.
            print(
                f"[p2-train] WARNING: {slots} prompt slots over {len(dataset)} rows — "
                f"each prompt is seen {prompt_repeats:.2f}x. Chosen via explicit --limit."
            )
        else:
            raise SystemExit(
                f"HALT: {args.steps} steps x {prompts_per_step} prompts/step = {slots} prompt "
                f"slots but only {len(dataset)} rows were drawn "
                f"(prompt_repeats={prompt_repeats:.2f}). Nobody chose this — the split is "
                f"smaller than the run needs. Pass --limit explicitly to accept the repeat, "
                f"or lower --steps."
            )

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    # TRL refuses environment_factory unless the chat template can render a tool
    # call, so this assertion is a precondition of THAT path — not of training in
    # general. A single-turn run emits one assistant message and never renders a
    # tool call, so asserting here would fail a valid configuration.
    if not args.no_tools:
        assert_tool_calling_template(tokenizer)
    if not args.no_tools:
        print("[p2-train] chat template round-trips user -> assistant(tool_calls) -> tool")
    else:
        print("[p2-train] single-turn: no tools, no environment_factory, no loss mask to check")

    # ── mask probe: Stage C step 7 ───────────────────────────────────────────
    mask_stats: dict[str, float] = {"batches": 0, "completions": 0, "with_zero_span": 0, "zeros": 0, "ones": 0}

    class MaskProbeTrainer(GRPOTrainer):
        """`_generate` returns the tool_mask TRL will multiply into the loss
        (verified: grpo_trainer.py line 2345). Reading it here is the only way
        to prove the mask is real rather than all-ones, and an all-ones mask
        means we are training on our own MCP server's output."""

        def _generate_and_score_completions(self, inputs):
            # The rollout function needs the dataset ROW behind each rollout — the
            # prompts alone cannot carry a prefix, and two rows of a stratified run
            # share a prompt while differing in their forced opening. TRL hands the
            # rows only to this method, so this is where they are recorded; they stay
            # aligned 1:1 with the prompts `_generate` receives, which the rollout
            # function asserts rather than assumes.
            self._batch_inputs = inputs
            return super()._generate_and_score_completions(inputs)

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
    step_peak_mib: list[float] = []

    class StepTimer(TrainerCallback):
        """The measured local step time is what prices the smoke run. It
        replaces every estimate, per the handoff's §4.

        It also records PEAK RESERVED VRAM per step, and that was a gap the
        first smoke run walked straight into: we measured step time and mask
        coverage, then the very next question was how many prompt groups the
        card could hold, and the receipt could not answer it. `nvidia-smi`
        sampled after the fact reads ~0 because the process has exited; the
        only honest number is torch's own high-water mark, reset each step so
        the figure is per-step rather than cumulative.

        Reserved, not allocated: the allocator's reservation is what actually
        has to fit, and OOM is thrown against it."""

        def __init__(self) -> None:
            self._t0: float | None = None

        def on_step_begin(self, *_a, **_k):
            if torch.cuda.is_available():
                torch.cuda.reset_peak_memory_stats()
            self._t0 = time.perf_counter()

        def on_step_end(self, *_a, **_k):
            if self._t0 is not None:
                step_times.append(time.perf_counter() - self._t0)
            if torch.cuda.is_available():
                step_peak_mib.append(torch.cuda.max_memory_reserved() / (1024 ** 2))

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
        # Three modes, not two. --no-tools passes NEITHER key: vanilla GRPO over a
        # single assistant turn. The P4 voice-leading task needs this — its completion
        # is a JSON array of voicings with no tool call anywhere, so an
        # environment_factory would wrap a loop that never runs and a `tools` list
        # would advertise tools the prompt never mentions.
        **(
            {}
            if args.no_tools
            else {"tools": make_plain_tools(args.base_url)}
            if args.plain_tools
            else {"environment_factory": make_environment_factory(args.base_url)}
        ),
        # Prefix forcing owns tokenisation AND generation, because TRL cannot be asked
        # to continue a partial assistant turn: `_tokenize_prompts` hardcodes
        # `add_generation_prompt=True` and transformers refuses it together with
        # `continue_final_message` (tokenization_utils_base.py:3099). `rollout_func` is
        # the only seam, and its `env_mask` is what keeps the injected tokens out of
        # the loss (grpo_trainer.py:2519).
        **(
            {}
            if args.prefix_mode == "none"
            else {"rollout_func": make_prefix_rollout(args.prefix_mode, args.prefix_in_loss, prefix_stats)}
        ),
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

    # The trained weights, written BEFORE the receipt and before any gate can halt:
    # a run whose guards fail is still a run whose adapter is worth keeping, and a
    # halt that also discarded the weights would turn one bad arm into a repeat.
    if args.save_final_adapter:
        Path(args.save_final_adapter).mkdir(parents=True, exist_ok=True)
        trainer.model.save_pretrained(args.save_final_adapter)
        print(f"[p2-train] saved trained adapter to {args.save_final_adapter}")

    # Re-read the bridge AFTER training: the counters are the proof that the
    # rollouts actually went through the real MCP server and the one scoreReward,
    # rather than through anything reimplemented in Python.
    health_after = httpx.get(f"{args.base_url.rstrip('/')}/health", timeout=60.0).json()

    # Which metric series TRL actually emitted. This is the ONLY mechanical proof that the
    # reference-KL path did or did not execute: `grpo_trainer.py:3360` appends the `kl` series
    # only `if self.beta != 0.0`, and `:2732` skips the reference log-prob forward pass on the
    # same condition. A receipt that recorded only `beta` would record the REQUEST; this
    # records the CONSEQUENCE. `entropy_coef` appears only when an entropy bonus is enabled
    # (`:3338`), which is the matching assertion for any future entropy arm.
    _logged = sorted({k for e in trainer.state.log_history for k in e})
    trl_metrics = {
        "logged_series": _logged,
        "kl_logged": any(k == "kl" or k.endswith("/kl") for k in _logged),
        "entropy_coef_logged": any(k.endswith("entropy_coef") for k in _logged),
        "log_history_entries": len(trainer.state.log_history),
    }

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
        # Peak RESERVED VRAM, per step and at the high-water mark, against the
        # card's own total. `headroom_mib` is the number that decides how many
        # prompt groups fit — the first smoke run could not answer that because
        # it recorded no memory at all.
        "memory": {
            "peak_reserved_mib_per_step": [round(m, 1) for m in step_peak_mib],
            "peak_reserved_mib": round(max(step_peak_mib), 1) if step_peak_mib else None,
            "total_mib": round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 2), 1)
            if torch.cuda.is_available()
            else None,
            "headroom_mib": round(
                torch.cuda.get_device_properties(0).total_memory / (1024 ** 2) - max(step_peak_mib), 1
            )
            if (step_peak_mib and torch.cuda.is_available())
            else None,
        },
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
            # Read off the resolved GRPOConfig, not off args: these were never passed, so the
            # receipt has to record what TRL APPLIED. `loss_type` has silently defaulted to
            # "dapo" for every run in this arc and was never written down -- a receipt that
            # omits the loss formulation is not replayable, which is what PIN_PER_STEP is for.
            "loss_type": config.loss_type,
            "scale_rewards": config.scale_rewards,
            "num_iterations": config.num_iterations,
            "entropy_coef": config.entropy_coef,
            "use_adaptive_entropy": config.use_adaptive_entropy,
            "entropy_target": config.entropy_target,
            "top_entropy_quantile": config.top_entropy_quantile,
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
            "before": health.get("counters"),
            "after": health_after["counters"],
            "library_songs": health.get("library_songs"),  # None on non-synth bridges
            "generator_seed": health.get("generator_seed"),
            "schema_version": health.get("schema_version"),
            "tools": health.get("tools", []),
            "limits": health.get("limits"),
        },
        "trl_metrics": trl_metrics,
        "environment": dict(ENV_COUNTERS),
        "dataset_rows": len(dataset),
        "rollout_mode": ("no-tools" if args.no_tools else "plain-tools" if args.plain_tools else "environment-factory"),
        "prompt_repeats": round(prompt_repeats, 4),
        "final_adapter": args.save_final_adapter,
        # Prefix forcing, recorded on EVERY run including the unforced ones, so no
        # receipt is ever ambiguous about which group design produced its numbers.
        # `openings_per_group` is the discriminator: G under heterogeneous forcing,
        # 1 under stratified, absent when nothing was forced.
        "prefix": {
            "mode": args.prefix_mode,
            "prefix_in_loss": args.prefix_in_loss,
            "pool_items": pool_items,
            "openings_per_item": {str(k): v for k, v in sorted(openings_hist.items())},
            **{
                k: (sorted(v) if isinstance(v, set) else v)
                for k, v in (prefix_stats or {}).items()
            },
            "openings_covered": len(prefix_stats["opening_indices_seen"]) if prefix_stats else 0,
        },
    }
    (out / "dry-run.json" if args.dry else out / "run.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"[p2-train] shape {receipt['shape']} -> {receipt['mean_step_seconds']}s/step")
    print(json.dumps(receipt["mask"], indent=2))
    print(f"[p2-train] steps={len(step_times)} mean_step={receipt['mean_step_seconds']}s wall={receipt['wall_seconds']}s")
    _mem = receipt["memory"]
    if _mem["peak_reserved_mib"] is not None:
        print(
            f"[p2-train] peak_reserved={_mem['peak_reserved_mib']} MiB of {_mem['total_mib']} MiB"
            f"  headroom={_mem['headroom_mib']} MiB"
            f"  ({receipt['shape']['completions_per_step']} completions/step)"
        )
    _ca = health_after.get("counters", {})
    if args.no_tools:
        print(f"[p2-train] bridge scored={_ca.get('scored')} unparsed={_ca.get('unparsed')} (single-turn: no tool calls by design)")
    else:
        print(f"[p2-train] bridge tool_calls={_ca.get('tool_calls')} scored={_ca.get('scored')} "
              f"env instances={ENV_COUNTERS['instances']} resets={ENV_COUNTERS['resets']}")

    # ── forcing gates, on every run and not only --dry ───────────────────────
    # Each of these closes a failure that throws nothing. They run after the receipt
    # is written so a halt still leaves the evidence behind.
    if args.prefix_mode != "none":
        if prefix_stats["rollouts"] == 0:
            raise SystemExit(
                "HALT: --prefix-mode was set and the rollout function never ran. TRL took a "
                "different generation path and NOTHING was forced; the run is unforced and "
                "its numbers are not what the flag claims."
            )
        # A2 again, at the level of the whole run rather than the batch.
        if prefix_stats["prefix_hits"] != prefix_stats["rollouts"]:
            raise SystemExit(
                f"HALT: {prefix_stats['prefix_hits']} of {prefix_stats['rollouts']} completions "
                f"started with their forced prefix."
            )
        # A3, and INDEPENDENT of the rollout function's own decode: the bridge counts
        # completions whose first parsed measure is not the progression's first named
        # measure. A forced run cannot produce one unless the prefix was lost between
        # generation and scoring, which is the failure that would otherwise inflate
        # rewards silently.
        fmw_before = (health.get("counters") or {}).get("first_measure_wrong")
        fmw_after = (health_after.get("counters") or {}).get("first_measure_wrong")
        if fmw_before is None or fmw_after is None:
            raise SystemExit(
                "HALT: the bridge does not report `first_measure_wrong`, so there is no "
                "independent check that the forced opening reached the scorer. Update the "
                "bridge rather than trusting the trainer's own decode."
            )
        if fmw_after > fmw_before:
            raise SystemExit(
                f"HALT: the bridge scored {fmw_after - fmw_before} completion(s) whose first "
                f"measure is not the progression's first. Under forcing that is impossible "
                f"unless the prefix escaped scoring — the reward judged everything except the "
                f"measure that was pinned."
            )
        print(
            f"[p2-train] prefix forcing OK: mode={args.prefix_mode} "
            f"rollouts={prefix_stats['rollouts']} groups={prefix_stats['groups']} "
            f"openings/group={prefix_stats['openings_per_group_min']}..{prefix_stats['openings_per_group_max']} "
            f"masked_prefix_tokens={prefix_stats['masked_prefix_tokens']} "
            f"first_measure_wrong delta=0"
        )

    if args.dry:
        # The two Stage C gates. A dry run that "passes" without these has
        # proved only that the process exited 0.
        if len(step_times) < 2:
            raise SystemExit(f"HALT: {len(step_times)} optimizer steps completed; step 2 is where OOM appears (R3.15)")
        _cb = health.get("counters", {})
        # The bridge must have scored, on EVERY path: it is the only proof the reward
        # came from the real verifier rather than a default.
        if _ca.get("scored", 0) <= _cb.get("scored", 0):
            raise SystemExit("HALT: the bridge scored nothing — the reward did not come from the verifier")
        if args.no_tools:
            # THE TOOL GATES ARE NOT SKIPPED HERE, THEY ARE INAPPLICABLE. A single-turn
            # run has no tool loop to mask, no MCP server to reach and no pooled
            # environment to reset; asserting them would fail a valid configuration.
            # What replaces them is the inverse assertion: nothing tool-shaped ran.
            if _ca.get("tool_calls", 0) != 0:
                raise SystemExit("HALT: --no-tools but the bridge served tool calls; this is not a single-turn run")
            if ENV_COUNTERS["instances"] != 0:
                raise SystemExit("HALT: --no-tools but an environment was instantiated")
            print("[p2-train] STAGE C PASS (single-turn) — two optimizer steps, bridge scored, no tool path touched")
        else:
            if mask_stats["with_zero_span"] == 0:
                raise SystemExit("HALT: tool_mask is all ones — the loss would include our own MCP server's output")
            if _ca.get("tool_calls", 0) <= _cb.get("tool_calls", 0):
                raise SystemExit("HALT: the bridge served no tool calls — the rollouts never reached the real MCP server")
            if ENV_COUNTERS["resets"] == 0:
                raise SystemExit("HALT: reset() was never called; the pooled-environment contract does not hold here")
            print("[p2-train] STAGE C PASS — two optimizer steps, non-trivial tool mask")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
