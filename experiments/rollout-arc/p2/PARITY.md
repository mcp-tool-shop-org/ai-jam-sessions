# P2 dry — train/test parity

**Date:** 2026-09-11 · **Spend:** $0 · **Generator seed `2026091103`** (fresh; shares no case with P1f).
Receipts: [`train-parity-full/`](train-parity-full/) — 192 cases, 1536 rollouts + 1536 guess generations.
Superseded: [`train-parity/`](train-parity/) — see §3, a flawed sample kept as the record of the error.

## Why this ran

The lock's §2 trains on the **train** split while every rate in the arc was measured on **test**.
If the two splits are drawn differently, the population P2 trains on is not the one P1f gated.

## Result — both criteria replicate

| Quantity | Test (P1f, n=256) | **Train (n=192)** | Δ | SE of Δ | Verdict |
|---|---|---|---|---|---|
| leak-free **non-degenerate** | 32.0% | **27.1%** (52) | −4.9 pp | 4.3 pp | 1.13 SE — replicates |
| leak-free **in-band** | 17.6% | **15.6%** (30) | −2.0 pp | 3.5 pp | 0.57 SE — replicates |
| leak tax | 24.6% | **23.4%** (45) | −1.2 pp | — | replicates |
| mean tool turns | 2.470 | **2.391** | −0.08 | — | same paging shape |

Neither difference approaches significance. **The splits are drawn from the same distribution.**

**But note the direction.** All three rates sit *below* their test counterparts. Individually
that is noise; consistently it is worth recording, because projections should use the **train**
number when sizing a training population, not the more flattering test one.

**Corrected projection.** The dry report's `projected.expected_trainable` used the 32.0% test
prior and read ~328 from 1024 generated cases. **At the measured train rate of 27.1% it is ~278**,
with a generation multiplier of **3.7×** rather than 3.1×. Still ample, and the generator is
unbounded — but the dry report's figure is optimistic by ~15% and should be read with this file.

## The level index is noise for a third time

| | D0 | D1 | D2 | D3 |
|---|---|---|---|---|
| pass@1, P1e (test) | 0.477 | 0.645 | 0.566 | 0.684 |
| pass@1, P1f (test) | 0.553 | 0.477 | 0.654 | 0.545 |
| **pass@1, train** | **0.552** | **0.479** | **0.721** | **0.771** |
| leak-free in-band, train | 12 | 7 | 6 | **5** |

Three independent draws, three different orderings. P1f measured the P1e-vs-P1f rank correlation
at ρ = −0.60; the train draw makes D3 the *easiest* level while P1f had it second-hardest, and
D3's in-band count is now the lowest of the four. **Lock §2 stands and is reinforced: pool the
population, never select it by level.**

## §3 — the superseded run, kept deliberately

The first parity attempt passed `--limit 64`. `selectedCases` does `all.slice(0, limit)` and the
cases are ordered by level, so it drew **D0 (48) and D1 (16) and nothing else** — D2 and D3 got
`n=0`. It reported 26.6% in-band, inflated because D0 carried the highest in-band rate in P1f.

That was an error in the invocation, not in the harness, and it is kept because the failure mode
is reusable: **`--limit` truncates, it does not stratify.** Any future sampled run over a
level-partitioned corpus must either take the whole split or stratify explicitly.

## Verdict

**Parity holds.** The train split carries the same non-degenerate and in-band rates as the test
split within sampling error. The population P2 trains on is the population P1f gated.

**$0. No pod. This authorises nothing** — the build handoff is still a build task, and the smoke
run is still gated on a measured local step time.
