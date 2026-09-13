# Sealed predictions — written before any G=64 eval exists

**2026-09-13, ~14:00 UTC.** Seeds 7 and 8 have finished TRAINING and their training-dynamics
receipts are on disk. Seed 9 is still running. **No held-out eval at G=64 exists for any local
run.** These predictions are recorded now so they can be scored rather than rationalised.

Training dynamics available at the time of writing:

| run | dead groups | effective updates | `acc_joint` first50 -> last50 | entropy first50 -> last50 |
|---|---|---|---|---|
| pod seed 7 | 0.725 | 55 | 0.163 -> 0.340 | 0.0150 -> 0.0142 (-3%) |
| local seed 7 | 0.760 | 48 | 0.147 -> 0.328 | 0.0153 -> 0.0148 (-3%) |
| local seed 8 | 0.695 | 61 | 0.228 -> 0.542 | 0.0166 -> 0.0108 (-35%) |

---

## P1 — the overfitting prediction (Gemini, different model family)

**Claim:** seed 8's higher training `acc_joint` is an illusion cast by its -35% entropy
collapse — it fell into a rewarding local minimum early and narrowed onto it — so **seed 8 will
perform WORSE than seed 7 on the G=64 held-out lift**, having overfit the 32-item training cell.

**Scored as:** seed 8's held-out lift point estimate below seed 7's. A stronger form, that the
difference excludes zero in a paired arm-vs-arm test, is recorded separately.

**Prior context that bears on it:** this arc already has one decoupling of training accuracy
from held-out lift — arm A's `acc_joint` was flat (0.235 -> 0.242) while B's and C's roughly
doubled, and A still matched them on eval. So the training->eval link is not reliable here in
either direction.

## P2 — the advisor's prediction: no relationship

**Claim:** held-out lift will be **uncorrelated with training `acc_joint` across the three
seeds.** The training-dynamics spread (0.328 vs 0.542) will be much larger than the held-out
lift spread.

**Scored as:** the three per-run held-out lifts spanning a range narrower, in relative terms,
than the 65% relative gap in final `acc_joint`.

## P3 — THE ONE THAT CAN FALSIFY MY OWN MECHANISM CLAIM

I have claimed that arm C's opening-concentration drop (-9.00pp item-wise, [-12.00, -6.00])
is **mechanistic**: C is the only arm whose opening tokens were not masked out of the loss
(`prefix_in_loss=False`, `masked_prefix_tokens 25600 == prefix_tokens_total 25600` on A, B, D),
so it is the only arm that could move its own opening distribution.

**If that mechanism is right, the drop should appear in ALL THREE local seeds**, because all
three are unforced and all three therefore carry gradient on the opening. Seed does not change
which tokens are masked.

**The competing explanation is entropy dynamics** — that the drop is a by-product of how much
the policy sharpened, not of what carried gradient. Seed 8 collapsed entropy 12x harder than
seed 7. Under the entropy explanation, **seed 8 should show a SMALLER opening-concentration
drop, or none, or a reversal.**

| outcome | reading |
|---|---|
| all three seeds show a drop, intervals excluding zero | mechanism (unmasking) supported |
| seed 8's drop is materially smaller or absent | entropy dynamics compete; the mechanism claim weakens and I say so |
| the drops vary without tracking entropy | neither explanation is carried by this data; both stay open |

**This is the prediction I most want to be wrong about if it is wrong**, because the masking
mechanism is currently load-bearing for recommending the `--prefix-in-loss` arm, and it rests
on one seed.

## P4 — Verbalized Sampling

The base model is **93.3% concentrated within a single prompt** on the item-wise statistic.
Zhang et al. 2025 (arXiv:2510.01171) report 1.6-2.1x diversity recovery from prompting alone,
but on open-ended generation, not on a task with a hard verifier and a rigid output schema.

**Claim:** VS will move the item-wise opening concentration by **less than the 9pp arm C
achieved with training**, and its pass rate will fall relative to standard sampling, because
asking for five spanning candidates pushes the model toward openings the rulebook admits less
often.

**Scored as:** two numbers, both already computed by `score-vs.mts` — item-wise opening
concentration, and pass rate over realizations.

**If VS beats 9pp, the main line changes**: a free prompt-side intervention would outperform
every RL arm measured so far, and any prior-flattening arm would have to be priced against it.

---

## What makes this a sealed prediction and not a note

No G=64 eval exists for any local run at the time of writing; `runs/mc64-*` is empty. The
gate's readings are fixed independently in `GATE-PREREG.md` and are **not** modified by this
file — these are predictions about what the preregistered readings will return, recorded so
that a later "we expected that" can be checked instead of asserted.
