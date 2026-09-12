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

---

# Treatment cell — P1c's mechanism reproduces on bf16

**Distance 5–11, decoy off, D0/D1 only, G=2.** Read after the control cell, under the
pre-registered rule.

## Guards — all passed, so the result is not an artifact

| guard | treatment | control |
|---|---|---|
| `completions/clipped_ratio` | **0.000 on all steps** | 0.000 |
| completion length vs 1024 budget | 79–171 mean, **209 max** | 79–175 |
| `turn_cap_rate` | **0.00 — never hit the 5-turn cap** | 0.50 max |
| `mean_tool_turns` | 2.00–4.00 | 2.00–4.00 |

**The model had the tokens and the turns and did not use them.** Control actually hit the
turn cap; treatment never did.

## Result

**Accuracy 0.000. Every group entirely wrong.** By the pre-registered rule this is
**reading 2 — overshoot — and it is explicitly NOT a success**: an all-wrong population is
exactly as degenerate as an all-right one and carries the same zero gradient.

## Where the wrong answers land — the finding

Answer offset from the prompt's bound, with gold at +5, +7, +9 or +11:

| offset | n | |
|---|---|---|
| +0 | 5 | inside the first page |
| +1 | 4 | inside the first page |
| +3 | 32 | inside the first page |
| **+4** | **14** | first measure of the *second* page |
| ≥ +5 | **0** | — |

- **41 of 55 numeric answers (74.5%) land inside the first 4-measure page.**
- **The maximum offset answered anywhere is +4.**
- **0 of 55 land at a legal gold distance.**

**P1c's mechanism reproduces on the model we would train.** "The policy pages but never
uses the second page" was recorded as a 4-bit finding and marked *unverified for bf16* after
the precision defect surfaced — correctly, because every case in the pinned corpus sits
inside the first page by construction, so bf16 had never been tested past it. **It has now.**
The refinement is that the policy pages at most once and never answers beyond +4, while
having both turns and tokens to spare.

## What this settles, and what it costs

1. **The distance pin at 1–3 is load-bearing and survives the precision correction.** It is
   not a quantization artifact.
2. **Distance is not a usable difficulty lever.** It goes from solved (0.719) to unsolvable
   (0.000) with nothing between at 5–11. That is the overshoot the rule named in advance.
3. **The boundary is at +4, and it is measurable.** 14 of 55 answers reached +4, so the
   second page is not wholly out of reach — the model gets one measure into it. **Distance
   4, and possibly 5, is the only place a learnable band could live**, and it is a free
   local probe.

## On correlation — the question the external review asked

Entropy is **higher** in treatment than control: mean 9.86e-3 against 5.29e-3, nearly 2×.
**The model is not confidently wrong; it is uncertain and wrong.** So the confident-wrongness
failure mode is absent here too.

But ρ **cannot be estimated from this cell**: with every group at 0/2 correct there is no
variance in the correct-count, and the overdispersion ratio is undefined. The rollouts do
vary — they disagree about *which* wrong answer to give — but that diversity never crosses
into correctness. **Diversity without correctness buys nothing**, and it means a larger G
here would purchase more varied wrong answers, not more gradient.
