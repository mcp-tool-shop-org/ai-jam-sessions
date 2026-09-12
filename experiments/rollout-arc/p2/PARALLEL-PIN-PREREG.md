# Preregistration — parallel-only at n=400

**Written before the pod exists.** Director chose the measurement over the training run.

## The question

D1 aggregate came back **0.055 [0.022, 0.109]** at n=128 — below the band, interval excluding
0.125. Splitting it by distractor subtype:

| | n | accuracy | non-degenerate | all-wrong |
|---|---|---|---|---|
| **parallel** (same root) | 65 | 0.862 | **0.092 [0.035, 0.190]** | 6 |
| other share-2 | 63 | 0.986 | 0.016 | 0 |

**Parallel's interval is the only one in this arc that still contains 0.125.** n = 400 gives
a half-width of ±0.028, which settles it either way.

## The honest prior

**I expect ~0.092 and therefore a result below the band.** The parallel subset has already
been measured at n=65; this is not a new population, it is the same construction sampled
properly. A point estimate near 0.09 with an interval like [0.064, 0.120] excludes 0.125 and
**closes the corpus-hardening line for good.**

Writing that down because the alternative — telling the story afterwards as though a
below-band result was the expected outcome all along — is the failure this arc keeps
producing. **If it lands above 0.125, that is a genuine surprise and I will say so.**

## Pre-committed readings

1. **Clears the floor.** Interval lower bound above 0.125. Parallel-only is a trainable
   population; the next step is a training run on it.
2. **Below the floor.** Interval upper bound below 0.125. **Corpus hardening is closed** —
   both axes (distance, confusability) and the sharpest sub-axis have now been measured on
   the right artifact at production G, and none reaches the band. The remaining levers are
   algorithmic (a baseline that registers all-right and all-wrong groups) or a different
   model.
3. **Straddles.** Interval contains 0.125 even at n=400. Then the rate is not the right
   decision variable and the next move is the training run, which costs the same.

## What will NOT be claimed either way

- **The band itself is borrowed.** [12.5%, 50%] is a pass@8 figure from INTELLECT-2; our
  quantity is a G=8 non-degenerate rate under ρ ≈ 0.89. They are not the same measurement and
  the comparison is a heuristic, not a test.
- **0.092 is a floor, not an estimate**, per the correlation correction: ~1.1 effective draws
  of 8 means an 8/8 group is weak evidence that a case is solved.
- **Nothing here restores the arc's original 27.1% / 32.0%.** Those were measured on a 4-bit
  model and stay void.

## Guards

`dataset_rows` **400**, distinct prompts 400, `/health` must echo `parallel_only: true` and
`levels: ["D1"]`. `clipped_ratio` > 0 flags the cell. all-wrong reported as its own line, not
folded into "degenerate". Dead-man armed before launch; pod terminated on fetch.

**Budget:** ~$3.03 at the measured 22.9 s/step, against $20.40 remaining.
