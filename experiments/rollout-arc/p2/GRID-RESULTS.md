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

## A seventh gate the harness did NOT have — `--limit` does not stratify

**Found after the control cell was read. Every cell in this grid measures D0 and D1 only.**

`GET /cases?limit=32` takes the **first** 32 rows, and the generator emits level by level.
With `trainPerLevel` 16 the train split is 64 rows ordered D0,D0…D1,D1…D2,D2…D3,D3 — so
`--limit 32` takes exactly D0 and D1 and drops D2 and D3 entirely. Confirmed from the
parquets, by parsing the level out of each distinct prompt's song title:

    distinct prompts: 32     level distribution: {'D0': 16, 'D1': 16}

**D2 = 0, D3 = 0.** D0 and D1 are the *least* confusable distractor tiers — the two easiest
levels in the family.

This defect was already known in this arc: the first train-parity run drew D0 (48) and D1
(16) with D2/D3 at n=0. **I passed `--limit` explicitly to fix the v1 dataset bug and
walked straight into the stratification bug it has always had.** Sixth instance of a
population assumed rather than read, and the second one I have caused personally.

**Consequence:** all four cells share the same truncation, so the grid's **internal**
contrasts remain valid — they compare like with like on D0/D1. But nothing here describes
the D0–D3 family, and the control cell is **not** a positive control for the abort run,
which saw all four levels across 1024 rows. The bridge to the arc's numbers was already
void; this is a second, independent reason.

The grid is being allowed to finish rather than restarted, on the same reasoning as before:
changing the row selection mid-grid would make cells 1–2 and 3–4 incomparable, which is the
one property the 2×2 has. Stratified selection is a fix for the follow-up run, not for this
one.

## Control result — bf16, distance 1–3, D0/D1 only, `num_generations` 2, 32 groups

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

**bf16 scores 0.719 with 4 of 32 groups non-degenerate on the two easiest distractor tiers
of a distance-1–3 population.** That is not "solves the task outright." And the direction is
worth noting: D0/D1 are the *least* confusable tiers, yet this scored **lower** than the
abort run's 0.9125 across all four levels. Either the level labels do not track difficulty
for bf16, or the seed difference dominates them. Both are measurable; neither is measured.

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
