# Grid v2 — control cell, and a fired halt condition

**Rule:** [`DISTANCE-PREREG.md`](DISTANCE-PREREG.md), committed before any cell ran.
**Status: the pre-registered halt condition FIRED. The screen's bridge to this arc's
pinned numbers is VOID.** Written on the control cell alone; the other three cells had
not been read.

## Harness gates — passed

| gate | required | control |
|---|---|---|
| `dataset_rows` | 32 | **32** |
| distinct prompts in parquets | 32 | **32** |
| `completions/clipped_ratio` | 0 | **0 on all 32 steps** |
| completion length vs 1024 budget | well under | **79–175 tokens** |

The `--limit` defect that voided v1 is fixed and verified. **Truncation is ruled out**, so
the accuracy below is valid — this is not the confound that made a 0.69 look like a
falsification.

## Control result — bf16, distance 1–3, `num_generations` 2, 32 groups

| | |
|---|---|
| accuracy (per completion) | **0.719** |
| groups all-right | 21 / 32 |
| groups all-wrong | 7 / 32 |
| groups non-degenerate | **4 / 32 = 0.125** |
| *k*-of-2 spread | `{0: 7, 1: 4, 2: 21}` |
| overdispersion | 1.75 (ρ ≈ 0.745) |
| `format_rate` | 1.0 on 31 of 32 steps |

## The halt condition, and why it fired

The rule required: *control must reproduce the abort's finding — at least 30 of 32 groups
fully correct, at most 1 non-degenerate — or the screen is VOID and the next step is
diagnosing, not confirming at higher n.*

**Control returned 21 fully correct and 4 non-degenerate.** It did not reproduce.

**The diagnosis is a defect in my rule, not in the harness.** The abort ran seed
**2026091103** at `trainPerLevel` 256. This grid runs seed **2026091204** at
`trainPerLevel` 16. **They are different populations**, and I wrote a halt condition
demanding one reproduce the other. Comparing the two bf16 accuracies with a cluster
adjustment for the correlated rollouts:

| run | *p* | n | design effect | n_eff | 95% CI |
|---|---|---|---|---|---|
| abort, seed …103, G=8 | 0.9125 | 80 | 3.50 | 22.9 | [0.797, 1.028] |
| control, seed …204, G=2 | 0.7190 | 64 | 1.75 | 36.7 | [0.574, 0.864] |

Difference 0.194, SE 0.095, **z = 2.04, p = 0.041.** The two populations differ — the fresh
seed is measurably harder for bf16 than the one the abort ran on. Nominally the same
generator settings; not the same difficulty.

**This is the fifth time in this arc a population was assumed rather than read** — the q4
pin, the 2-row dataset, the 2-prompt smoke, the independence assumption, and now a
positive control specified against a corpus it was never going to match.

## What this does and does not void

- **VOID: any bridge from this grid to the arc's pinned numbers.** No cell here may be
  compared to the 27.1%, to the abort's 2/10, or to the learnability band. A true positive
  control has to run at seed **2026091103**, and it has not.
- **NOT void: the grid's internal comparisons.** All four cells share seed 2026091204 and
  shape; only the difficulty flags move. Treatment against control remains a valid
  controlled contrast, and the remaining cells are being allowed to finish on that basis
  rather than discarded for a rule-specification error.

## The finding that does not depend on the halt

**bf16 scores 0.719 on a distance-1–3 population with 4 of 32 groups non-degenerate.**
That is not "solves the task outright." Whatever else this grid shows, the pinned-distance
family is *not* uniformly trivial for the model we would train.

**And the model is not confidently wrong.** Entropy by group outcome:

| group outcome | n | mean entropy |
|---|---|---|
| all-right | 21 | 3.64e-3 |
| **all-wrong** | 7 | **7.88e-3** |
| non-degenerate | 4 | 9.42e-3 |

The prereg's middle row — *accuracy down, entropy flat at ~1e-4, groups agreeing on a wrong
answer* — is **not** what happens here. When this model is wrong it is also uncertain, at
more than twice the entropy of the cases it gets right. Confident wrongness was the failure
mode that would have made the difficulty knobs useless, and control shows no sign of it.
