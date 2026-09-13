# Curriculum cell — the numbers all improved and the result is a FAILURE

**Local, RTX 5090, $0. common-practice · 2 voices · 4 bars · G=16 · n=32 · 512 completions.**
Preregistered in `CURRICULUM-PREREG.md` before the data existed. The scorer computes the
reading mechanically from the prereg thresholds, so the label was assigned before it could be
narrated: **reading 2, SPLIT BUT COLLAPSED — not a pass.**

## Every headline metric improved

| | 8-bar, G=8 | **4-bar, G=16** |
|---|---|---|
| single-shot *p* | 0.160 [0.120, 0.210] | **0.389** [0.347, 0.432] |
| non-degenerate | 0.250 | **0.4375** [0.282, 0.607] |
| k histogram | `1,1,1,1,2,3,4,4` | `0:13 1:2 3:2 4:1 7:1 9:2 12:1 13:2 14:1 15:2 16:5` |

*p* more than doubled. Non-degeneracy nearly doubled. **Both were bought, and neither means
what it looks like.**

## The funnel got worse, which is the actual result

| | 8-bar, G=8 | **4-bar, G=16** |
|---|---|---|
| passing completions | 115 | 199 |
| distinct passing signatures | 60.0% unique | **22.1%** |
| within-group uniqueness | 0.721 | **0.356** |
| top first-measure share | 0.800 | **0.874** |

`[0,1]` — root plus third — opens **174 of 199** passing completions.

**Shortening the horizon did not break the mode; it removed the opportunities to deviate from
it.** Four bars is four decisions, so the prior's favourite opening covers a larger fraction
of the whole answer. The extra passes came almost entirely from the strategy that was already
dominant. The task got easier in precisely the way that teaches nothing.

## And the compute bought nothing

**ρ rose to 0.710, so effective draws are 1.37 of 16** — worse than ~1.4 of 8 at the previous
cell. Doubling the group size returned sixteen samples of nearly the same thing. Whatever is
wrong here, **it is not a compute problem**, and no further widening of G will fix it.

## What this establishes

Three surfaces have now failed gate 3, each differently:

| surface | passes | fails on |
|---|---|---|
| P3 ABC reharmonization | gates 1, 2 | difficulty was **notation**, not harmony |
| P4 2-voice film-ambient | gates 1, 2 | difficulty was **one rule** — `overlap`, 168/168 failures |
| P4 2-voice common-practice, 4 bars | gates 1, 2, and the rulebook | **representation** — the full chorale gate is satisfied 39% of the time by playing root-and-third almost every time |

The last is the sharpest. The gate is honest — nothing is relaxed — and the model clears it
without learning harmony, because **the base policy's prior is narrow enough that one voicing
covers most of the admissible space.**

**Note the funnel exists at ZERO optimisation pressure.** No gradient has ever been applied to
this task. The 87.4% share is a property of the base model's priors, not a hack it learned. That
is worse news than a learned exploit: gradient would *deepen* an existing channel rather than
have to carve one, and the reward can only reinforce what the policy actually samples.

KL is not the mechanism. `beta = 1e-4` (the flag's own comment: "NOT 0, purely so KL is
logged") and observed `kl: 0`. The prior's pull needs no anchoring term — if 87% of passers
are `[0,1]`, then `[0,1]` collects most of the positive advantage mass by arithmetic alone.

## The conclusion this cell forces

**Pure GRPO fails on this task for want of exploration, not for want of signal, difficulty or
compute.** The verifier is dense and honest, the population is in band, the groups split — and
the policy satisfies the gate with one voicing. The next lever is not G, not the horizon, and
not the style preset. It is a mechanism that puts solutions into the batch which the policy
would never sample on its own.

## Receipts

`CURRICULUM-PREREG.md` · `scripts/score-curriculum.mts` · `scripts/passing-diversity.mts`
`runs/spec-prompts-4bar-random.jsonl` · `runs/spec-4bar-g16.jsonl` · `runs/curriculum-summary.json`
