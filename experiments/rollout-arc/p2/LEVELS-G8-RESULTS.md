# D0–D3 at production G=8 — the cell this arc never ran

**RunPod, RTX PRO 6000 Blackwell, 1,116 s total, ≈ $0.62.** Pod terminated, dead-man
disarmed, `No pods. Nothing is billing.` Commit pinned: `aab18b2`.

**Same 64 cases, same seed (2026091204), same shape as the local G=2 run. Only
`num_generations` moved, 2 → 8.**

## Guards — all clean

`dataset_rows` **64** (the paid smoke run said 2), 64 distinct prompts, **16 per tier**,
`clipped_ratio` **0.00 on all 64 steps**, completions 37–135 against a 1024 budget, peak
38.1 GB of 97.2 GB.

## The G=2 conclusion was an artifact, as suspected

| | non-degenerate |
|---|---|
| **G=2** (local) | 1 / 64 = **0.016** |
| **G=8** (pod) | **7 / 64 = 0.109** |

**Seven times higher on identical cases.** The self-correction was right: "one split in 64"
measured the group size, not the task. Nothing about the corpus changed.

## The result — one tier carries the signal

| tier | distractor | accuracy | **non-degenerate** | *k*-of-8 spread |
|---|---|---|---|---|
| D0 | none | 0.945 | 0.062 | one 1/8, fifteen 8/8 |
| **D1** | **shares 2 of 3 pitch classes** | **0.719** | **0.250** | **three 0/8, one 4/8, two 5/8, one 6/8**, nine 8/8 |
| D2 | inversion of target | 0.953 | 0.062 | one 2/8, fifteen 8/8 |
| D3 | semitone + inversion | 0.992 | 0.062 | one 7/8, fifteen 8/8 |

**D1 is 4× every other tier**, and its splits are *graded* — 4/8, 5/8, 5/8, 6/8 — genuine
within-group disagreement rather than a lone outlier. D0, D2 and D3 each produce exactly one
split, and each is a near-unanimous 1/8, 2/8 or 7/8.

The gradients follow:

| tier | mean entropy | mean `grad_norm` on split steps | n split |
|---|---|---|---|
| D0 | 2.96e-3 | 1.04 | 1 |
| **D1** | **1.69e-2** | **6.40** | **4** |
| D2 | 6.90e-3 | 0.83 | 1 |
| D3 | 1.75e-2 | 1.42 | 1 |

**D1 produces four times the splits and six times the gradient per split.**

## This reverses the conclusion I drew four hours ago

I wrote that *"harden the corpus is finished as a strategy."* **It is not.** D1 lands at:

- **accuracy 0.719**
- **non-degenerate 0.250**, 95% CI **[0.073, 0.524]** — inside the INTELLECT-2 learnability
  band [0.125, 0.50], and containing the **27.1%** this arc originally gated on

D1 versus the other three tiers pooled (3 of 48) is **Fisher exact p = 0.059** — suggestive at
n = 16 per tier, not established. The *direction* is supported by three independent signals
that agree: split count, split gradedness, and gradient magnitude.

## Why the arc could not see this

Three separate defects hid the one working tier, each verified:

1. **`--limit` truncation.** Every cell drew D0 + D1 and left **D2 and D3 at n = 0**.
2. **The survivorship filter.** D2 and D3 plant an inversion of the *target*; if the engines
   recognise it, gold moves and the case is dropped. **0/32 in every tier** has a non-gold
   window measure re-deriving to the target — so D2 and D3 are D0 with extra notes, and
   their 0.953 / 0.992 accuracy here confirms it. **D1 survives because its distractor is a
   different chord that never competes for gold.**
3. **G=2.** The only tier measurement ever taken locally used a group size that suppresses
   splits sevenfold.

## What is now actionable

**A corpus built from D1-style distractors — a different chord sharing 2 of 3 pitch classes,
planted in the same window, at distance 1–3 — is a trainable population for bf16 at G=8.**
It needs no paging, which is the thing the policy will not do, and it sits in the band.

**Next, and it is a measurement not a build:** D1-only at n ≈ 128 to tighten
[0.073, 0.524]. At the Blackwell's measured 15.2 s/step that is ~32 min ≈ **$0.90**.


---

# Corrections and a mechanism — after independent replication

The peer rebuilt the table from the raw `run.log` by parsing per-step levels out of the
completions tables and pairing them to the metric dicts. **It reproduces to the digit** — but
only after they caught their own alignment error: their first pass paired each table with the
metrics dict *before* it and got D1 3/16, D3 3/16, a tie and no signal. They tested the
alignment instead of assuming it (zero title hits before the first dict, two immediately
after; TRL prints dict then table, shift = +1). **The replication is real and it nearly
published the opposite answer.**

Three corrections to my write-up, all verified here, all mine:

## 1. "Six times the gradient" is one outlier

D1's four split-step `grad_norm` values: **1.02, 1.91, 4.15, 18.52.** The mean of 6.40 is
carried entirely by the 18.52. **Median is 3.03**, and the lowest two sit inside the other
tiers' range (0.83, 1.04, 1.42).

> **The defensible claim is ~2.9× on the median with one outlier, not 6×.**

## 2. "Three independent signals" is one signal viewed three ways

`grad_norm` is only measured *on split steps*. Under std-normalised advantages the total
advantage mass peaks at *k* = G/2, so a 4/8 split carries more mass than a 1/8 split **by
construction** — magnitude is partly determined by gradedness, which is determined by split
count. And D0, D2 and D3 have **exactly one split step each**, so their "mean `grad_norm`" is
a single observation with no error bar. The three measures agree in direction; they are not
three times the evidence.

## 3. D1's floor cluster — which I omitted, and which is the mirror of my own mechanism

**All three all-wrong groups in the entire 64-step run are D1** — steps 28, 39, 55. D0, D2
and D3 have zero. So D1 is not "0.250 trainable"; it is **9 solved / 4 learnable / 3
unreachable**.

The reason is my own survivorship finding running the other way. D2 and D3 lose their
confusable cases because the planted inversion moves gold. **D1 survives that filter
precisely because its distractor never competes for gold — which means nothing removes the
D1 cases where the distractor genuinely defeats the policy.**

### The $0 check, and what it found

The peer asked whether those three have ambiguous gold. **They do not.** Gold re-derives
uniquely in all three. And the mechanism is visible:

| case | target | distractor at the bound measure | all 8 answers |
|---|---|---|---|
| `abx` | **F#** | m15 = **F#m** | `15` ×8 |
| `ach` | **B** | m27 = **Bm** | `27` ×8 |
| `acl` | **Am** | m81 = **A** | `84` ×8 |

**Parallel major/minor — same root, third flipped.** Two of the three answer the bound
measure itself, unanimously: the policy reads `F#m` and calls it `F#`.

### D1 is two populations, and only one of them is hard

`share2` picks any chord sharing 2 of 3 pitch classes, which is **53% parallel** (same root)
and 47% relative (`A` vs `C#m`, `D` vs `Bm`). Splitting D1's cells by which one they drew:

| distractor | n | accuracy | non-degenerate | all-wrong |
|---|---|---|---|---|
| **parallel** (same root) | 11 | **0.625** | 3/11 = 0.273 | **3** |
| other share-2 | 5 | 0.925 | 1/5 = 0.200 | 0 |

**All the unreachable cases are parallel, and so is all the difficulty.** n = 11 and 5, so
this is directional, not established — but it says the axis is *parallel major/minor
discrimination*, not "shares 2 of 3 pitch classes", and a parallel-only corpus is the sharper
instrument.

## 4. Overdispersion on D1, and what it does and does not change

D1's *k*-of-8 variance is 9.93 against a binomial 1.62 at p = 0.719 — **ratio 6.14, ρ ≈ 0.735,
about 1.3 effective draws per group of eight.** Roughly twice the ρ measured on the earlier
population.

**So 0.250 is a floor on D1's learnable fraction at G=8, not an estimate of it.** The
1/64 → 7/64 jump is the empirical demonstration that non-degeneracy is strongly G-dependent
under correlation, and it has not saturated.

**It does not break the power analysis.** The unit for non-degeneracy is the *case*, cases are
independent draws from the generator, and Wilson at n = 128 remains the right interval. What
it changes is the wording: **n = 128 pins D1-at-G=8, not "D1's learnable fraction."**

## Provenance of the truncation defect

The peer notes `/cases` is theirs, that they audited `--limit` in `train.py`, found the
hardcoded step-count defect, held the fix so my four cells would run identical code — and
never checked what `/cases?limit=` actually drew. **Holding for comparability preserved four
cells that were identical and all drawing half the corpus.** They also caught that my
stratification guard `n < picked.length` does not fire when the limit equals the split size,
which is this run's exact shape at `--limit 64` on 64 rows: benign, since a full draw takes
everything and TRL shuffles, but **a no-op at full draw rather than a guarantee.**
