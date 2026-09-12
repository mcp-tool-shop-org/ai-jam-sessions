# The point-mass finding was a harness artifact — the model branches fine

**This retracts the terminal conclusion of `STACK-RESULTS.md`.** Four configurations, same
question — does the policy emit identical completions from an identical prompt?

| stack | precision | byte-identical groups | mean distinct of 8 |
|---|---|---|---|
| Ollama | **q4_K_M** | **0 / 128** | 7.99 |
| Ollama | **fp16** | **0 / 128** | 8.00 |
| **plain `transformers.generate`** | **bf16** | **0 / 16** | **8.00** |
| **TRL GRPO, `environment_factory`** | bf16 | **92.2%** | ~1 |

All four at `temperature` 1.0, `top_p` 1.0, `top_k` 0 — matched deliberately, because every
earlier q4 measurement in this arc ran at Ollama's truncating defaults (`top_k` 40 /
`top_p` 0.9) and was compared against an untruncated bf16 run.

The `transformers` arm uses the exact kwargs TRL's own non-vLLM path builds
(`grpo_trainer.py:1126`: `do_sample=True`, temperature/top_p/top_k from config).

## What this kills, in order

**1. The q4-as-explorer hypothesis. Dead.** fp16 branches identically to q4 — 0/128 both,
accuracy 0.656 vs 0.657. **Precision is not the variable.** The idea that this arc's founding
"precision defect" had accidentally discovered a policy-level explorer was mine, it was
attractive, and it is wrong.

**2. "The policy is an empirical point mass." Retracted.** I committed that as the arc's
terminal structural finding, on 528 groups, three hours ago. The model branches in **every**
stack except ours. **It was never a property of the policy.**

**3. And it undermines the arc's founding correction too.** I wrote that the gate measured a
4-bit model while the trainer runs bf16, and voided six phases on it. The precision gap was
real, but **it is not what produced the 27.1%-vs-6% gap** — fp16 and q4 behave the same. The
gap was *Ollama vs TRL*. The void stands (the gate genuinely did not run the trained
artifact), but the mechanism I assigned to it was wrong.

## Where the collapse lives, and what is still unknown

It is in **TRL's rollout path**, not in the model, not in `transformers`, not in precision.
TRL repeats each prompt `num_generations` times into one batch
(`mini_repeat_count=self.num_generations`, lines 1240/1283) and generates them together —
which should sample independently per row, and under plain `transformers` with
`num_return_sequences=8` it does.

**I have not found the specific line, and I am not going to guess at one.** Candidates worth
checking: the `environment_factory` post-tool continuation path
(`_generate_single_turn`, called at 2164), batched left-padding interacting with sampling, or
something in the multi-turn re-entry that our environment triggers and a plain rollout does
not.

**One discriminator not yet run:** plain GRPO *without* `environment_factory`. That separates
"the environment path" from "TRL generally" and needs a short training run rather than a
generate call.

## Every difficulty measurement in this arc is now suspect

Seven corpus configurations returned non-degenerate ≈ 0.06. **That number was produced by a
harness that collapses rollouts**, so it measures the harness, not the corpus:

- distance 1–3 → 0.055 · distance 5–11 → 0.000 · D1 → 0.055
- parallel-only n=400 → 0.065 · all-knobs stack → 0.062

Against the same corpus through Ollama, **the same model family yields non-degenerate 0.46–0.54.**

**"Corpus hardening is closed" is withdrawn.** So is the algorithmic pivot argument that
followed from it — the premise that GRPO discards 91.5% of groups was measuring our own bug.

**Eleventh instance of this arc's failure class, and the largest: a number was recorded, and
nobody read what produced it.** This one is mine, it was the session's headline finding, and
it survived three hours and a committed conclusion before a $0 control caught it.
