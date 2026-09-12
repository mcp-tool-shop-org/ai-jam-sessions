# Arm C closes the matrix: TRL's tool path is fine. The task is the variable.

**RunPod Blackwell, all three arms in one process, 64 prompts × 4 generations, ≈$0.70
including the failed first attempt.** Pod terminated, nothing billing.
torch 2.11.0+cu128 · transformers 5.17.0 · trl 1.13.0 · peft 0.20.0.

| arm | byte-identical | mean distinct of 4 |
|---|---|---|
| A — `transformers.generate` | 0 / 64 | 4.00 |
| B — TRL `GRPOTrainer`, **no tools** | 0 / 64 | 4.00 |
| **C — TRL `GRPOTrainer`, with a tool** | **0 / 64** | **4.00** |

Same prompts, same sampler read off `GRPOConfig`, one process. **All three branch perfectly.**

## The matrix, complete

| | generic high-entropy prompts | our music task |
|---|---|---|
| GRPO, no tools | **branches** 0/64 | — |
| **GRPO, with tools** | **branches 0/64** | **collapses 92.2%** |

**TRL's tool-calling path does not constrain sampling.** The collapse requires our task.

## So there is no framework bug, and the point-mass finding stands after all

The conclusion I retracted three hours ago as "a harness artifact" was **right**, and the
retraction was wrong. Our policy really does emit near-identical rollouts on this task — 1.09
distinct model spans per group of 8 — and no part of that is TRL's doing.

**Why the task and not the framework:** a completion here is a tool call whose arguments are
*copied from the prompt* (song id, start measure), a deterministic tool response, and one
number. The model's genuinely free tokens are a handful. Under a generative prompt the same
weights in the same trainer produce 4.00 distinct of 4.

## The one thing still unexplained

**Ollama yields 3.75 distinct model spans on the same corpus where TRL yields 1.09**, and is
*less* accurate (0.60–0.66 vs 0.835) — at matched `temperature`/`top_p`/`top_k`, at both q4
and fp16.

Both differences point the same way: **a sharper effective sampling distribution in the
transformers/TRL path than in Ollama's.** Candidates remain the chat template shaping the
tool-call prefix, a logits processor present in one stack and not the other, or where
temperature is applied. **Unresolved, and it is now a curiosity rather than a blocker** —
because whichever stack is "right", the trainer is the one that matters and it is not broken.

## What this settles for the arc

**The difficulty measurements stand as originally taken.** Seven configurations returning
non-degenerate ≈ 0.06 were measuring the task, not a broken harness. Which restores:

- distance is bimodal, no middle · D2/D3 inert by construction
- D1 parallel-only at n=400: **0.065 [0.043, 0.094]**, below the band
- all four knobs stacked: accuracy 0.835, non-degenerate 0.062

**Corpus hardening is closed after all** — and this time the harness has been independently
cleared, which is the check that was missing the first time I said it.

---

## Correction to my own rejection of the algorithmic pivot

I rejected a baseline-based method earlier on the grounds that *"the extra signal is 8 of 400
cases — 2.0%."* **That was computed on the parallel-only run, which is the wrong one.**

| run | accuracy | all-wrong | advantage on all-right | advantage on all-wrong |
|---|---|---|---|---|
| parallel-only, n=400 | 0.958 | **2.0%** | +0.042 | −0.958 |
| **all-knobs stack, n=128** | 0.835 | **15.6%** | **+0.165** | −0.835 |

**The hardened corpus has nearly 8× the negative-advantage mass.** And under a baseline
scheme every group registers something, weighted by |r − baseline|, against **≈8 of 128**
groups under GRPO.

So the pivot is **more defensible than I said**, and the objection that still stands is the
narrower one: a cross-prompt baseline reintroduces prompt-difficulty as a nuisance variable,
which is the specific thing group-relative advantage removes. That is a real cost, not a veto.

**It is also a decision, not a measurement** — it changes the algorithm rather than answering
a question, and this arc has no evidence about whether it would train. Which makes it exactly
the kind of thing that belongs to the director, not to me or to an external reviewer.

## Three corrections to the external summary

- **HEAD is `76362e6`**, not `5fcef57` — roughly fifteen commits stale.
- **Spend is ≈$10.40**, not $9.70; the arm-C attempt that died on my config bug still billed.
- **"Sign off on the archive when ready"** — that is the director's call. The receipts are
  committed; whether the arc closes is not mine to declare.
