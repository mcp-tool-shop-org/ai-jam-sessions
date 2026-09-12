# P1f — the primary bar clears, and it clears on supply

**Date:** 2026-09-11 · **Spend:** $0 · **No GPU rented.** Pin: [pin.json](pin.json). Report: [report.json](report.json).
Lock: [`docs/rollout-arc-p1f-kickoff.md`](../../../docs/rollout-arc-p1f-kickoff.md). P1d/P1e receipts are left in place.

Two changes, both declared in the lock before the run: **n 32 → 64 test songs per level** on a
fresh generator seed (`2026091102`), and a **second criterion reported beside the primary one**
— non-degenerate, `1 ≤ c ≤ 7` of 8, findings 22 / 23 / 26. Nothing else moved: same model pin
(`qwen3:4b-instruct-2507-q4_K_M`, `think:false`), T=1, n=8, seed 0+attempt, the bounded
4-measure page, the parallel cap, distance 1–3, the D0–D3 definitions, the format gate, the
reward, `applyLeakFilter`, and the band constants. 2048 rollouts, 2048 guess generations,
27 minutes on the local 5090.

**You probably expect the headline to be that the family finally got learnable.** It is not.
The leak-free in-band **rate** is 17.6% against P1e's 17.2% — unchanged inside noise. What
changed is that 17.6% of 64 crosses a bar written as a count of 10, and 17.2% of 32 did not.
The bar cleared on **supply**, exactly as §1 of the lock preregistered it would.

## Curve

| level | n | pass@1 | pass@8 | leaks | guess pass@8 | leak-free in-band | leak-free non-degenerate | primary | secondary |
|---|---|---|---|---|---|---|---|---|---|
| D0 | 64 | 0.553 | 0.813 | 12 | 0.188 | **18** | **30** | **GO** | CLEAR |
| D1 | 64 | 0.477 | 0.594 | 14 | 0.219 | 6 | **12** | no | CLEAR |
| D2 | 64 | 0.654 | 0.813 | 21 | 0.328 | 7 | **16** | no | CLEAR |
| D3 | 64 | 0.545 | 0.766 | 16 | 0.250 | **14** | **24** | **GO** | CLEAR |
| **all** | **256** | — | — | **63** | — | **45 (17.6%)** | **82 (32.0%)** | | |

Primary: ≥ 10 leak-free in-band at some single level **and** that level's pass@1 < 0.80.
**D0 (18, pass@1 0.553) and D3 (14, pass@1 0.545) both clear. Primary = GO.**
Secondary: ≥ 10 leak-free non-degenerate on the same terms. **All four levels clear.**

All four levels are reported whatever they say. D1 and D2 fail the primary and are here.

## Was clearing the bar ever in doubt?

This is the number that decides how the GO must be read. Taking P1e's own measured rate
(17.2%) as the prior, and the bar as written (≥ 10 at **any single** one of four levels):

| n per level | E[leak-free in-band] | P(≥ 10 at one level) | P(≥ 10 at any of four) |
|---|---|---|---|
| 32 (P1d, P1e) | 5.5 | 0.038 | **0.142** |
| 59 (the lock's stated minimum) | 10.2 | 0.574 | 0.967 |
| **64 (P1f)** | **11.0** | **0.681** | **0.990** |

At n = 32 the bar was ~86% certain to fail on a family with this rate; at n = 64 it was ~99%
certain to pass. Measured per-level counts were 18, 6, 7, 14 — mean 11.25 against a predicted
11.0. **The prediction was exact.** The four prior NO-GOs and this GO are the same family
measured at two sample sizes, not a family that changed.

That is not a reason to discount the GO: the rule was frozen at P0, the lock preregistered the
n, and 64 was derived from P1e's rate before the run rather than chosen after it. It is a
reason to state what the GO is about. **It is a statement about corpus size, not about task
difficulty.** A director unlocking P2 on "D0 has 18" should know that 10 is near the median of
this distribution (sd 3.05), and that D1's 6 and D0's 18 are the tails of one rate.

## Did the secondary replicate?

**Yes, and on the specific claim the lock asked about.** The disclosure in §0 was that the
secondary already cleared at D2 (11) and D3 (12) on P1e's data. On 256 fresh cases it clears
at **D2 (16) and D3 (24)** — and at D0 (30) and D1 (12) as well.

The pooled rate replicated to the decimal: **32.0% in P1e, 32.0% in P1f.** So did the primary's
(17.2% → 17.6%) and the leak tax (29.7% → 24.6%). Three rates measured on disjoint case sets,
one generator seed apart, all stable. The instrument is measuring a property of the family.

## The c/8 histogram

| level | c=0 | 1–4 | 5–7 | c=8 |
|---|---|---|---|---|
| D0 | 12 | 19 | 14 | 19 |
| D1 | 26 | 9 | 6 | 23 |
| D2 | 12 | 10 | 12 | 30 |
| D3 | 15 | 17 | 13 | 19 |
| **all** | **65** | **55** | **45** | **91** |

Exact buckets, because §2 of the lock said the primary-versus-secondary argument reduces to a
single one of them:

| c of 8 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| all | 65 | 2 | 4 | 23 | 26 | **42** | 1 | 2 | 91 |
| leak-free | 49 | 2 | 1 | 19 | 23 | **34** | 1 | 2 | 62 |

It does. Leak-free `c=5` holds 34 cases; `c=6` and `c=7` hold three between them. The whole
82-versus-45 gap is **34 + 1 + 2 = 37**, so the question the two criteria disagree about is
still, precisely, *does 62.5% count as gradient-bearing.* At `c=5` the GRPO advantages are
+0.775 and −1.29 — well-scaled, nothing resembling collapse. The lumpiness P1e reported
replicates too: spikes at 0, 3, 4, 5 and 8, with 1, 2, 6 and 7 nearly empty. 39.1% of all cases
(100 of 256) sit in the interior.

## The difficulty axis still carries no stable signal

Within P1f the four levels do differ more than one common rate explains — in-band χ²(3) = 10.65,
p = 0.031; non-degenerate χ²(3) = 13.99, p = 0.0073. But the **ordering does not survive a change
of case set**:

| | D0 | D1 | D2 | D3 |
|---|---|---|---|---|
| pass@1 P1e | 0.477 | 0.645 | 0.566 | 0.684 |
| pass@1 P1f | 0.553 | 0.477 | 0.654 | 0.545 |
| leak-free in-band rate P1e | 18.8% | 12.5% | 21.9% | 15.6% |
| leak-free in-band rate P1f | 28.1% | 9.4% | 10.9% | 21.9% |

Rank correlation of pass@1 between the two runs is **ρ = −0.60**. P1e concluded that distractor
density "did not grade, and in fact runs backwards — D3 is easier than D0." P1f does not
reproduce that reversal either: here D3 is *harder* than D0 and D2 is the easiest. The honest
statement is stronger and simpler than P1e's: **D0–D3 is not a difficulty axis in either
direction.** Level-to-level variation is a property of the draw. Whatever P2 trains on, it
should not be the level index.

## Search

Mean tool turns **2.470** (P1e: 2.452). Histogram `0×131, 1×2, 2×1082, 3×533, 4×207, 5×93`.
Per level 2.61 / 2.41 / 2.49 / 2.37.

This doubles as the check on the one thing doubling n changes that the lock does not name:
one song per case means the isolated library grew from 320 songs to 448. Search did not change
shape — same 2-turn mode, same tail to the 5-turn cap. Lookup is by kebab id, so library size
is not the operative variable, and the histogram says so rather than the argument saying so.

## Diagnostics (post-hoc — not criteria, and not used to adjudicate anything above)

Slices computed after the fact, offered only because a director gate is next.

**By distance**, which is pinned to 1–3 and is *not* one of the reported axes:

| distance | n | pass@1 | leaks | leak-free in-band | leak-free non-degenerate |
|---|---|---|---|---|---|
| 1 | 88 | 0.563 | 21 (24%) | 15 | 28 |
| 2 | 79 | 0.608 | 31 (39%) | 10 | 16 |
| 3 | 89 | 0.507 | 11 (12%) | **20 (22%)** | **38 (43%)** |

Distance 3 carries the cleanest trainable population on both criteria and the lowest leak rate,
which is the opposite of what the guess-test's N+1/N+2/N+3 structure would suggest if the leak
were purely positional. This is exploratory. It did not enter the verdict.

**Format gate:** 716 of 2048 rollouts (35.0%) ended without a bare-integer verdict and scored 0
(P1e: 32.5%). 131 rollouts (6.4%) used no tool at all (P1e: 4.7%). 93 hit the 5-turn cap.
1141 of 2048 attempts were correct (55.7%).

## Verdict

**The primary criterion clears at D0 and D3. Under §3 of the lock, that is the first branch:
GO — P2 unlocks under a director gate, on that level's population.** The secondary clears at
all four levels and replicated its P1e rate exactly, so the second branch's report is also
true, and is subsumed.

Three things belong in front of the director with it, none of which change the verdict:

1. **The GO is about n, not about the task.** The learnable fraction did not move (17.2% →
   17.6%); the bar is a count and n doubled. Given P1e's rate, this outcome was 99% likely
   before the run.
2. **The level index is not a population selector.** Its ordering anti-correlates across runs
   (ρ = −0.60). D0's 18 is the top of a distribution centred at 11, not a property of D0.
3. **A 10-case population is the floor the bar names, not a training set.** D0 and D3 together
   hold 32 leak-free in-band cases and 54 leak-free non-degenerate ones, from 448 generated
   songs at $0. The generator is unbounded; if P2 wants more, more is a re-run, not a redesign.

**P1f does not start P2.** §6 of the lock forbids it, and the branch it landed on ends at a
director gate either way.

§7 of the lock — the task-shape directions to take if the arc shipped the null — did not fire
and is moot. It stays on the record unexecuted.

## Compensators (§5)

| Action | Compensator | Held |
|---|---|---|
| Synthetic songs in `<AI_JAM_HOME>/songs/` | isolated `mkdtemp` home per executor, `rmSync` on close; real library never written | ✅ 448 songs written to the temp home only; `songs/` in the repo is untouched |
| MCP server per worker | explicit kill plus the existing post-close liveness assertion | ✅ `exec.close()` ran in `finally`; no orphan process |
| Schema version bump | not registered in the published set; nothing under `datasets/` | ✅ `jam-actions-synth-v0/1.1.0` unchanged and still unregistered |
| GPU spend | none authorised | ✅ $0, local Ollama, no pod |

## Receipts

`pin.json` (written before the sampled run) · `gold.jsonl` (256) · `preds-guess.jsonl` (2048) ·
`preds-pass8.jsonl` (2048) · `report.json` (both criteria, both histograms, per-level and
pooled). Reproduce with:

```text
pnpm exec tsx experiments/rollout-arc/scripts/synth-learnability.mjs --n 8 --split test --songs 64
```
