"""TRL GRPOTrainer returns near-identical completions where transformers.generate does not.

Self-contained reproduction. No project code, no MCP, no tools, no environment —
a stock model, a three-line scalar reward, and the SAME prompts through both
paths in one process so the comparison cannot drift.

WHAT IT SHOWS

    arm A  transformers.generate, N duplicate prompt rows
    arm B  TRL GRPOTrainer, num_generations=N, log_completions

Both arms use the SAME prompts and the SAME sampler values — and the sampler
values are READ OFF the constructed GRPOConfig rather than hardcoded, so arm A
cannot silently drift from whatever TRL actually does.

WHY THE PROMPTS LOOK LIKE THIS

An earlier version asked "name a colour starting with A, one word". That has
almost no legitimate output entropy, so identical completions were partly a
property of the question. These prompts are open-ended and ~40 words, where a
healthy sampler should essentially never repeat itself.

    python trl_collapse_repro.py --prompts 64 --gens 4
"""

from __future__ import annotations

import argparse
import glob
import json
from pathlib import Path

import pandas as pd
import torch
from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import GRPOConfig, GRPOTrainer

MODEL = "Qwen/Qwen3-4B-Instruct-2507"

SUBJECTS = [
    "an unexpected storm", "a lighthouse keeper", "a misplaced key", "the last train",
    "a stubborn goat", "an unfinished letter", "a cartographer's error", "a borrowed coat",
    "the quietest room", "a clock that runs backwards", "an unmarked door", "a rival baker",
    "the tide going out", "a forgotten password", "an argument about soup", "a dog on a roof",
]


def prompts_for(n: int) -> list[str]:
    return [
        f"Write a unique, creative 40-word story about {SUBJECTS[i % len(SUBJECTS)]}. "
        f"Make it different from anything obvious. (variation {i})"
        for i in range(n)
    ]


def reward_len(completions, **_):
    """Scalar reward with no external dependency. Its values do not matter here —
    the question is whether the completions differ at all."""
    out = []
    for c in completions:
        text = c if isinstance(c, str) else "".join(m.get("content") or "" for m in c)
        out.append(min(len(text) / 200.0, 1.0))
    return out


def rate(groups: list[list[str]]) -> dict:
    ident = sum(1 for g in groups if len(set(g)) == 1)
    return {
        "groups": len(groups),
        "byte_identical_groups": ident,
        "byte_identical_rate": ident / len(groups),
        "mean_distinct": sum(len(set(g)) for g in groups) / len(groups),
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--model", default=MODEL)
    p.add_argument("--prompts", type=int, default=64)
    p.add_argument("--gens", type=int, default=4)
    p.add_argument("--max-new-tokens", type=int, default=96)
    p.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "runs" / "trl-repro"))
    a = p.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    prompts = prompts_for(a.prompts)

    # Build the config FIRST so arm A can read its sampler values. Hardcoding
    # them would let the control drift from what TRL actually uses.
    cfg = GRPOConfig(
        output_dir=str(out / "hf"),
        max_steps=a.prompts,
        per_device_train_batch_size=a.gens,
        num_generations=a.gens,
        max_completion_length=a.max_new_tokens,
        logging_steps=1,
        save_strategy="no",
        report_to="none",
        bf16=torch.cuda.is_available(),
        log_completions=True,
        num_completions_to_print=0,
    )
    sampler = {
        "temperature": cfg.temperature,
        "top_p": cfg.top_p,
        "top_k": cfg.top_k,
        "min_p": cfg.min_p,
        "repetition_penalty": cfg.repetition_penalty,
    }
    print(f"[repro] sampler read off GRPOConfig: {sampler}")

    # ── arm A: plain transformers, N duplicate rows (TRL's own batching shape) ──
    tok = AutoTokenizer.from_pretrained(a.model)
    model = AutoModelForCausalLM.from_pretrained(a.model, dtype=torch.bfloat16, device_map="cuda")
    model.eval()
    arm_a: list[list[str]] = []
    for text in prompts:
        enc = tok.apply_chat_template([{"role": "user", "content": text}],
                                      add_generation_prompt=True, return_tensors="pt", return_dict=True)
        ids = enc["input_ids"].to("cuda").repeat(a.gens, 1)
        with torch.no_grad():
            gen = model.generate(ids, max_new_tokens=a.max_new_tokens, do_sample=True,
                                 pad_token_id=tok.pad_token_id or tok.eos_token_id, **sampler)
        arm_a.append([tok.decode(g[ids.shape[1]:], skip_special_tokens=True) for g in gen])
    del model
    torch.cuda.empty_cache()
    a_stats = rate(arm_a)
    print(f"[repro] arm A transformers.generate: {a_stats}")

    # ── arm B: GRPOTrainer over the SAME prompts ───────────────────────────────
    ds = Dataset.from_dict({"prompt": [[{"role": "user", "content": q}] for q in prompts]})
    GRPOTrainer(model=a.model, reward_funcs=[reward_len], args=cfg, train_dataset=ds).train()

    files = sorted(glob.glob(str(out / "hf" / "completions" / "*.parquet")))
    if not files:
        print("NO COMPLETIONS LOGGED")
        return 1
    df = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
    arm_b = [[str(x) for x in d["completion"]] for _, d in df.groupby("step")]
    b_stats = rate(arm_b)

    summary = {
        "model": a.model,
        "dtype": "bfloat16",
        "prompts": a.prompts,
        "generations_per_prompt": a.gens,
        "sampler_read_off_GRPOConfig": sampler,
        "arm_A_transformers_generate": a_stats,
        "arm_B_TRL_GRPOTrainer": b_stats,
        "versions": {},
    }
    import transformers, trl, peft  # noqa: E402
    summary["versions"] = {"torch": torch.__version__, "transformers": transformers.__version__,
                           "trl": trl.__version__, "peft": peft.__version__}
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    print("\n" + json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
