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
