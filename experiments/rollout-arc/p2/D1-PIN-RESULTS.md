# The D1 precision pin — reading 2 fired. It did not replicate.

**Rule:** [`D1-PIN-PREREG.md`](D1-PIN-PREREG.md), committed before the pod existed.
**Outcome: reading 2 — below band.** Pod terminated, dead-man disarmed, nothing billing.
A100 80GB, 128 steps in 48:52, ≈ **$1.20**.

## Gates — all clean

`dataset_rows` **128**, distinct prompts **128**, `/health` echoes `levels: ["D1"]`, seed
**2026091205**, 8 generations per prompt, `clipped_ratio` **0.00 on all 128 steps**,
completions 37–156 against a 1024 budget.

## The result

| | pilot, n=16 | **pin, n=128** |
|---|---|---|
| accuracy | 0.719 | **0.923** |
| **non-degenerate** | 0.250 **[0.073, 0.524]** | **0.055 [0.022, 0.109]** |
| all-wrong | 0.188 | 0.047 |
| all-right | 0.562 | 0.898 |

**0.055, and the interval excludes the band floor of 0.125.** The pilot's 0.250 was the
draw. This is the outcome I wrote down first, in plain terms, precisely because I knew I
would want to argue it away — so: **D1 does not carry the arc.**

Two seeds of the same construction gave accuracy **0.719** and **0.923**. The D1 generator
does not reliably produce hard cases; it produces a distribution whose difficulty swings
hard between draws, and n=16 sampled the easy tail of one and the hard tail of the other.

## The parallel/relative mechanism DID replicate — in direction, not in size

The split found in the pilot holds on 128 fresh cases. The parallel fraction is even
identical: **53% in both seeds.**

| distractor | n | accuracy | non-degenerate | all-wrong |
|---|---|---|---|---|
| **parallel** (same root, third flipped) | 65 | **0.862** | **6/65 = 0.092** [0.035, 0.190] | **6 (0.092)** |
| other share-2 (relative etc.) | 63 | 0.986 | 1/63 = 0.016 | **0** |

- **All six all-wrong groups are parallel. Zero from the other half.** Fisher **p = 0.028.**
- **Six of the seven non-degenerate groups are parallel.** Fisher p = 0.115 — directional,
  not established.

So the mechanism is real and now replicated: **parallel major/minor is where this model
fails, and the other share-2 pairs are nearly free (0.986).** The pilot's magnitude was not
real: parallel's non-degenerate rate is **0.092, not 0.273**.

**Even a parallel-only corpus sits below the band** at 0.092 — though its interval
[0.035, 0.190] *contains* 0.125, so that one is not decisively excluded the way the D1
aggregate is.

## Correlation, restated per the peer's correction

D1 overdispersion at n=128 is **7.25, ρ ≈ 0.893, ~1.10 effective draws of 8.** Higher than
the pilot's 0.735. So **0.055 remains a floor at G=8, not an estimate of the learnable
fraction** — but it is a floor that is now measured on 128 independent cases rather than 16,
and the case is the unit, so the interval stands.

## What this closes and what it leaves

**Closed:** "D1 is a trainable population at 0.250" — withdrawn. It was one draw of sixteen.
The corresponding line in `LEVELS-G8-RESULTS.md` is superseded by this file.

**Left standing:** the *mechanism*. Parallel major/minor discrimination is the only axis in
this corpus that reliably produces failure on bf16, it needs no paging, and it concentrates
all of the unreachable cases. At 53% of D1 by accident, it has never been the population —
only a contaminant in one.

**The honest next question is cheap and it is not a pod run:** a generator that plants *only*
parallel distractors has never been built or measured. The pilot suggested it might reach the
band; the pin says the version diluted with relative pairs does not. Whether a pure parallel
corpus clears 0.125 is unmeasured, and its interval here — [0.035, 0.190] — is too wide to
call either way.
