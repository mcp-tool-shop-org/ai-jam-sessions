# Lever 1 — few-shot on the un-enveloped base checkpoint

**2026-09-14. Local RTX 5090, $0, no pod, no training, no adapters.** Scored against
`FORMAT-CLAUSE.md` (`e5c7846`), which was written before this run existed and is not amended
here. 75 held-out items, G=64, generation seed 7, cap 384 unchanged, no chat template — the
only difference from the no-template arm is **752 characters of worked example**.

The exemplar is `sweet-home-chicago` from the **trained** pool (the script halts if the chosen
item appears in the held-out pool), verifier-**correct**, `first_measure_ok` **true**, and uses
**6 distinct voicings across 8 measures**. The first candidate selected — shortest
verifier-correct completion — repeated one voicing eight times on a mostly-`N/C` progression
with `first_measure_ok` false, and was rejected: it would have taught degeneracy and scored as
a win.

---

## The clause, scored

| row | threshold | result | |
|---|---|---|---|
| unparseable | ≤ 20% | **2.0%** | ✓ |
| coverage (≥1 pass in 64) | ≥ 90% | **91%** | ✓ |
| distinct-passing | ≥ 2.0 | **2.79** | ✓ |

**All three pass. Lever 1 succeeds.**

The anti-collapse rows did their job and were not a formality: **support fell 16.87 → 8.48** and
**modal share rose 29.9% → 56.9%**. The few-shot *did* cost half the prior's width — exactly the
trade rows two and three exist to price — and the arm clears the bars anyway. Had coverage come
in under 90%, this would have been a **reject**, not a near-miss, by a sentence written before
the run.

## The full picture

| | support | distinct-passing | unparseable | pass@1 | coverage |
|---|---|---|---|---|---|
| **Base, no template + few-shot** | 8.48 | **2.79** | **2.0%** | **16.27%** | **91%** |
| Base, no template | 16.87 | 3.65 | 25.9% | 9.33% | 93% |
| Base + ChatML | 13.83 | 2.60 | 57.1% | 5.08% | 80% |
| Instruct (local) | 1.84 | 0.53 | 0.0% | 12.00% | 40% |
| C7 trained (β=1e-4) | 1.65 | 0.44 | 0.0% | 12.29% | 37% |
| B07 trained (β=0) | 1.56 | 0.39 | 0.0% | 12.88% | 33% |

## The contrast, with intervals

Paired by item against the **local** instruct baseline — not the pod's. Both files are named
`mc64-heldout-base.jsonl`; `prior-shape.mts` resolves `artifacts/` first, which is how a
duplicate row once got labelled "local rig". The few-shot arm ran on this rig, so the
same-platform baseline is the only honest one. n=75, 10,000 bootstrap, RNG seeded per
computation.

| contrast | mean | 95% | |
|---|---|---|---|
| pass rate | **+4.27pp** | [+0.44, +8.10] | **excludes 0** |
| **coverage** | **+50.67pp** | **[+38.67, +62.67]** | **excludes 0** |
| concentration | **−37.19pp** | [−41.56, −32.46] | **excludes 0** |

## What that means against six phases of this arc

The best replicated result the RL program produced was the gate's held-out pass lift:
**+4.71pp [+0.46, +11.03]**, over three training runs, on rented and local GPUs, after six
phases of design.

**A 752-character prompt change on a different checkpoint returns +4.27pp [+0.44, +8.10] — the
same effect, indistinguishable from it, for $0 and no training.**

And it moves two things the RL program never moved at all:

- **Coverage +50.67pp.** Training moved it the *wrong* way: instruct 40% → C7 37% → B07 33%.
- **Concentration −37.19pp.** Six phases fought over a prior that swung ±10pp and never
  resolved; `GATE-RESULTS.md` reports plain GRPO *sharpening* it by +2.44pp. This flattens it by
  nearly four times the largest effect the arc ever measured, in the direction the arc wanted,
  with an interval that excludes zero by a wide margin.

**The binding constraints were the checkpoint and the envelope, not the training.** That is not
"RL does not work" — it is that six phases optimised a pass rate on a substrate which had
already lost 60% of the item space, inside a wrapper that cost the rest.

## What this does not license

- **Not a training cell.** None is priced, and `2504.13837` holds that RLVR narrows support —
  training a support-8.48 prior back down is how the instruct checkpoint was made.
- **Not new capability.** Yue et al. still binds; this is re-weighting and re-enveloping what
  the base could already sample. The nearest-tone heuristic still scores 32/32 for free.
- **Not a runs-and-items interval.** These bootstraps resample **items only**. There is one
  generation seed and one run per arm, so the intervals price item heterogeneity and *not*
  generation-seed variance. A second seed is the cheap way to check that, and it is not claimed
  here.
- **Not a comparison to the trained arms at matched platform.** C7/B07 ran on the pod against
  the pod's base; the contrast above is local-against-local. Their levels are shown for context,
  not as a paired test.
- **Not lever 2.** The cap stayed at 384 throughout. Truncation is still 66% at cap against the
  no-template arm's 18% — the few-shot buys format and *costs* wall-clock, and whether raising
  or moving the stop recovers anything is a separate eval.

## Receipts

`scripts/fewshot-contrast.mts` (sole source of every interval above) · `scripts/prior-shape.mts`
· `scripts/base-passrate.mts` · `scripts/why-unparseable.mts` · `scripts/make-fewshot.mts` ·
`runs/fewshot-exemplar.txt` · `runs/mc64-heldout-q3base-fewshot.jsonl` · `runs/fewshot-probe.log`
· clause `e5c7846` · probe results `4f6de00` · study `26d788f`
