"""Does bf16 through PLAIN transformers branch, or is it TRL's rollout path?

The measured gap is large and I do not know its cause, so this isolates one
candidate at a time:

    q4   + Ollama          0/128 groups byte-identical
    fp16 + Ollama          0/128 groups byte-identical   <- precision ruled out
    bf16 + TRL/transformers  92% of groups byte-identical

Precision is not the variable. What remains is the serving path. This script
takes TRL out of it: same weights, same sampler settings TRL builds
(do_sample=True, temperature/top_p/top_k from GRPOConfig), one batched
generate() call for N sequences, exactly as TRL's non-vLLM path does.

  * If this branches, the collapse lives in TRL's rollout/environment path, not
    in the model or in transformers.
  * If this is byte-identical, the collapse is transformers-vs-Ollama and the
    model genuinely does not branch under HF generation.

Deliberately NO tools and NO environment: the question is whether the policy
emits identical token sequences from an identical prompt, which needs neither.

  python gen_diversity.py --n 8 --prompts 16
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen3-4B-Instruct-2507"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--model", default=MODEL)
    p.add_argument("--n", type=int, default=8, help="sequences per prompt, as num_generations")
    p.add_argument("--prompts", type=int, default=16)
    p.add_argument("--max-new-tokens", type=int, default=128)
    p.add_argument("--mode", default="return-sequences", choices=["return-sequences", "duplicate-rows"],
                   help="how the N samples are asked for: one prompt with num_return_sequences=N (my first test), "
                        "or N duplicate prompt rows in a batch (what TRL actually does, mini_repeat_count)")
    p.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "runs" / "precision" / "bf16-transformers.json"))
    a = p.parse_args()

    tok = AutoTokenizer.from_pretrained(a.model)
    model = AutoModelForCausalLM.from_pretrained(a.model, dtype=torch.bfloat16, device_map="cuda")
    model.eval()

    # The same shape of question the corpus asks, without the tool loop.
    prompts = [
        f'In "Synth D1 Study {i:03d}", what is the first measure at or after measure '
        f"{7 + i} whose left hand is C#? Answer with a single integer."
        for i in range(a.prompts)
    ]

    groups = []
    for text in prompts:
        msgs = [
            {"role": "system", "content": "You are operating AI Jam Sessions, a music education platform."},
            {"role": "user", "content": text},
        ]
        enc = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt", return_dict=True)
        ids = enc["input_ids"].to("cuda")
        # TRL does NOT use num_return_sequences. It repeats the prompt N times into
        # the batch (grpo_trainer.py:1240/1283, mini_repeat_count=num_generations)
        # and generates the rows together. Those are different code paths through
        # transformers, and this flag tests whether that difference is the cause.
        if a.mode == "duplicate-rows":
            ids = ids.repeat(a.n, 1)
        kwargs = dict(
            max_new_tokens=a.max_new_tokens,
            # EXACTLY the kwargs TRL's non-vLLM path builds (grpo_trainer.py:1126)
            do_sample=True,
            temperature=1.0,
            top_p=1.0,
            top_k=0,
            pad_token_id=tok.pad_token_id or tok.eos_token_id,
        )
        if a.mode == "return-sequences":
            kwargs["num_return_sequences"] = a.n
        with torch.no_grad():
            out = model.generate(ids, **kwargs)
        completions = [tok.decode(o[ids.shape[1]:], skip_special_tokens=True) for o in out]
        distinct = len(set(completions))
        groups.append({"distinct": distinct, "identical": distinct == 1})

    n = len(groups)
    ident = sum(g["identical"] for g in groups)
    summary = {
        "model": a.model,
        "dtype": "bfloat16",
        "stack": f"transformers.generate ({a.mode}), no TRL, no tools",
        "sampling": {"do_sample": True, "temperature": 1.0, "top_p": 1.0, "top_k": 0, "num_return_sequences": a.n},
        "prompts": n,
        "byte_identical_groups": ident,
        "byte_identical_rate": ident / n,
        "mean_distinct": sum(g["distinct"] for g in groups) / n,
        "reference": {
            "bf16_TRL_byte_identical_rate": 0.922,
            "fp16_ollama_byte_identical_rate": 0.0,
            "q4_ollama_byte_identical_rate": 0.0,
        },
    }
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps({"summary": summary, "groups": groups}, indent=2))
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
