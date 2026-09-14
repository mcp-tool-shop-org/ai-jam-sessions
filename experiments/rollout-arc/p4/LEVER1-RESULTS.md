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

**The finding is coverage.**

- **Coverage +50.67pp [+38.67, +62.67].** The RL program never moved this at all, and what
  movement there was went the *wrong* way: instruct 40% → C7 37% → B07 33%. Six phases of
  training reduced the fraction of items the model can reach. A checkpoint change plus an
  envelope change plus 752 characters raised it by fifty-one points.
- **Concentration −37.19pp [−41.56, −32.46].** Six phases fought over a prior that swung ±10pp
  and never resolved; `GATE-RESULTS.md` reports plain GRPO *sharpening* it by +2.44pp. This
  flattens it by nearly four times the largest effect the arc ever measured, in the direction
  the arc wanted.

**Pass@1 is the small row, and the comparison I first drew on it was wrong.**

> ⚠ **Retracted, same day, before anything was built on it.** The first version of this section
> read: *"A 752-character prompt change on a different checkpoint returns +4.27pp — the same
> effect, indistinguishable from it, for $0 and no training,"* set against the gate's
> **+4.71pp [+0.46, +11.03]**.
>
> **Those are not the same contrast.** The gate's +4.71pp is **trained instruct minus
> instruct** — a training effect on a fixed substrate. This +4.27pp is **few-shot base minus
> instruct** — a substrate and envelope change. The intervals overlap because the magnitudes
> happen to be similar, and **similar magnitude across two different contrasts is a coincidence
> of scale, not a substitution test.** Nothing here shows a prompt can stand in for the
> training, because nothing here ran the training on this substrate.
>
> What survives is narrower and does not need the comparison: pass@1 rises **+4.27pp
> [+0.44, +8.10]** over the local instruct baseline, for $0.

**The defensible sentence is about the binding constraint, not about substitution.** Six phases
optimised a pass rate on a substrate that had already lost 60% of the item space, inside a
wrapper that cost the rest. That is a statement about what was limiting, and it does not
require the RL effect and the prompt effect to be commensurable — they are not.


## What this does not license

- **Not a training cell.** None is priced, and `2504.13837` holds that RLVR narrows support —
  training a support-8.48 prior back down is how the instruct checkpoint was made.
- **Not new capability.** Yue et al. still binds; this is re-weighting and re-enveloping what
  the base could already sample. The nearest-tone heuristic still scores 32/32 for free.
- **Not a runs-and-items interval.** These bootstraps resample **items only**, so they price
  item heterogeneity and *not* generation-seed variance. ⚑ **Superseded in part:** a second
  generation seed was drawn after this section was written — see *Second seed* below. It does
  not convert these into runs-and-items intervals (K=2 estimates no variance), but it does
  remove the specific worry that 91% coverage was a lucky draw.
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

---

## Second seed — the replicate the first run could not price

`FORMAT-CLAUSE.md` puts coverage at **≥ 90%** and seed 7 came in at **91%**, one point above the
bar, on an **items-only** interval that prices item heterogeneity and *not* generation-seed
variance. One draw could not tell a stable 91% from a lucky one. So a second was drawn: the same
arm, the same 752-char exemplar, the same `--gen-chunk 16`, **one change — generation seed 8.**

### The clause, scored again

| row | bar | seed 7 | **seed 8** | |
|---|---|---|---|---|
| unparseable | ≤ 20% | 2.0% | **1.7%** | ✓ |
| coverage | ≥ 90% | 91% | **92%** | ✓ |
| distinct-passing | ≥ 2.0 | 2.79 | **2.72** | ✓ |

**All three pass again, and the bar-adjacent row moved the good way.**

The rest of the arm is near-identical across seeds: support 8.48 → 8.53, modal 56.9% → 56.6%,
pass@1 16.27% → 16.19%, concentration 0.5577 → 0.5573.

### Against the same local instruct baseline

| | seed 7 | seed 8 |
|---|---|---|
| pass rate | +4.27pp [+0.44, +8.10] | **+4.19pp [+0.29, +8.04]** |
| coverage | +50.67pp [+38.67, +62.67] | **+52.00pp [+40.00, +64.00]** |
| concentration | −37.19pp [−41.56, −32.46] | **−37.23pp [−41.58, −32.54]** |

All six intervals exclude zero.

### Seed 8 minus seed 7, paired by item

| contrast | mean | 95% | |
|---|---|---|---|
| pass rate | **−0.08pp** | [−1.06, +0.92] | includes 0 |
| coverage | **+1.33pp** | [−6.67, +9.33] | includes 0 |
| concentration | **−0.04pp** | [−2.00, +1.94] | includes 0 |

**The two draws land on top of each other.** Pass@1 moved eight hundredths of a point,
concentration four hundredths. That is what the second draw was bought to establish, and it
establishes it: **91% was not luck.**

⚑ Not "seed variance is negligible" — that phrasing was used here first and is withdrawn. It
reads as a variance estimate and none is available: the seed-vs-seed intervals above resample
**items**, and the coverage one resamples a 0/1 indicator per item. Neither is a run-level σ.
Two coincident point estimates are the claim; a spread is not.

> **K=2, and no variance is claimed from it.** Two seeds cannot estimate a spread; the table
> above is the spread, shown as a spread, with items-only intervals on the paired difference.
> What it licenses is narrow and sufficient — the two point estimates land within 0.08pp,
> 1.33pp and 0.04pp of each other, which is a demonstration of stability, not a variance
> estimate.

### Still unpriced, after two seeds

- **Lever 2.** The cap stayed 384 on both. Truncation is unchanged and still the cost the
  few-shot bought format with. A separate eval, unrun.
- **⚑ The exemplar itself.** One exemplar was tried — `sweet-home-chicago`, 6 distinct voicings,
  verifier-correct, `first_measure_ok`. A *different* valid exemplar is an entirely unmeasured
  knob, and the first candidate the selector returned would have taught degeneracy. Nothing here
  says the result is robust to exemplar choice; it says it is robust to **generation seed**.
- **One pool, one verifier, one style.** 75 held-out items, common-practice, 2 voices.

**Raw generations published** (the files this section cites are ~51 MB and not in git):
https://huggingface.co/datasets/mcp-tool-shop/jam-rollout-arc-evals
