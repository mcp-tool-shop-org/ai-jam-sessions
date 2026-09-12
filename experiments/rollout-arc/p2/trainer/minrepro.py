"""Minimal GRPOTrainer collapse reproduction — and a bisect, not just a repro.

MEASURED so far, same weights throughout (Qwen3-4B-Instruct-2507, bf16):

    plain transformers.generate, both batching shapes   0% byte-identical, 8.00 distinct
    Ollama q4_K_M and fp16, same tool loop, same MCP    0% byte-identical
    TRL GRPOTrainer, environment_factory=              67-95% across 8 runs; 100% at G=2
    TRL GRPOTrainer, tools=                            100% byte-identical

So the collapse is inside GRPOTrainer's generation. Unknown: the mechanism, and
whether TRL alone causes it or some interaction with OUR config does.

This strips the setup to its studs and varies ONE thing — whether the rollout is
multi-turn. Everything else is stock:

    no MCP, no bridge, no tools, no environment_factory,
    a scalar reward function, GRPOConfig left at defaults for every sampling field.

LoRA IS KEPT, deliberately. It is not a variable under test: the collapse appears
in every LoRA run, and plain transformers.generate on the same weights branches
fine with no trainer at all. Holding it constant keeps this comparable to the runs
it is explaining — and dropping it is not a simplification, it turns a LoRA job
into a full fine-tune of a 4B model in bf16 (~48 GB of optimizer state).

    --turns 1   single-turn GRPO, the simplest thing TRL can do
    --turns 2   same, with one trivial always-available tool the model may call

If --turns 1 collapses, the bug is in core single-turn GRPO generation and this
file is the upstream reproduction. If it branches and --turns 2 collapses, the
bug needs multi-turn re-entry and the reproduction is the second arm.

  python minrepro.py --turns 1 --steps 8 --gens 4
"""

from __future__ import annotations

import argparse
import glob
import json
from pathlib import Path

import pandas as pd
import torch
from peft import LoraConfig
from trl import GRPOConfig, GRPOTrainer
from datasets import Dataset

MODEL = "Qwen/Qwen3-4B-Instruct-2507"


def reward_len(completions, **_):
    """A scalar reward with no external dependency. Its values are irrelevant to
    the question — the question is whether the completions differ at all."""
    out = []
    for c in completions:
        text = c if isinstance(c, str) else "".join(m.get("content") or "" for m in c)
        out.append(min(len(text) / 100.0, 1.0))
    return out


def echo(word: str) -> str:
    """Echo a word back. A trivial always-available tool, present only so the
    rollout has a second turn.

    Args:
        word: anything.
    """
    return f"echo: {word}"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--model", default=MODEL)
    p.add_argument("--turns", type=int, default=1, choices=[1, 2])
    p.add_argument("--steps", type=int, default=8)
    p.add_argument("--gens", type=int, default=4)
    p.add_argument("--out", default=None)
    a = p.parse_args()

    out = Path(a.out or (Path(__file__).resolve().parents[1] / "runs" / "minrepro" / f"turns{a.turns}"))
    out.mkdir(parents=True, exist_ok=True)

    prompts = [f"Name a colour that starts with the letter {c}. Answer with one word." for c in "ABCDEFGH"]
    ds = Dataset.from_dict({"prompt": [[{"role": "user", "content": q}] for q in prompts]})

    cfg = GRPOConfig(
        output_dir=str(out / "hf"),
        max_steps=a.steps,
        per_device_train_batch_size=a.gens,
        num_generations=a.gens,
        logging_steps=1,
        save_strategy="no",
        report_to="none",
        bf16=torch.cuda.is_available(),
        max_completion_length=64,
        log_completions=True,
        num_completions_to_print=0,
        # Every sampling field left at its GRPOConfig default on purpose:
        # temperature 1.0, top_p 1.0, top_k 0, min_p None.
    )

    kwargs = {}
    if a.turns == 2:
        kwargs["tools"] = [echo]

    trainer = GRPOTrainer(
        model=a.model,
        reward_funcs=[reward_len],
        args=cfg,
        train_dataset=ds,
        # Matched to the runs this is explaining. Not a variable under test.
        peft_config=LoraConfig(r=16, lora_alpha=32, lora_dropout=0.0,
                               target_modules="all-linear", task_type="CAUSAL_LM"),
        **kwargs,
    )
    trainer.train()

    files = sorted(glob.glob(str(out / "hf" / "completions" / "*.parquet")))
    if not files:
        print("NO COMPLETIONS LOGGED")
        return 1
    df = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
    tot = ident = dis = 0
    for _, d in df.groupby("step"):
        n = len(set(str(x) for x in d["completion"]))
        tot += 1
        dis += n
        ident += n == 1
    summary = {
        "model": a.model,
        "turns": a.turns,
        "tools": a.turns == 2,
        "peft": "LoRA r16 all-linear (held constant)",

        "num_generations": a.gens,
        "groups": tot,
        "byte_identical_groups": ident,
        "byte_identical_rate": ident / tot,
        "mean_distinct": dis / tot,
        "reference": {
            "plain_transformers": 0.0,
            "ollama_q4_and_fp16": 0.0,
            "trl_environment_factory": 0.922,
            "trl_tools": 1.0,
        },
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    print("\n" + json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
