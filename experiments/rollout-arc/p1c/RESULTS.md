# P1c — bounded observation, preferred base, cap 32

**Date:** 2026-09-11 · **Spend:** $0 · **Bars:** the same frozen P0 bars (min in-band after leak ≥ 10, sampled pass@1 < 0.80). Pin: [pin.json](pin.json). Machine report: [report.json](report.json).

P2 is still held.

P1b's addendum said search never happened (376/376 one tool turn) and the 7B quant was a confound. This run changes three things and re-measures. If it is still below the floor, that is a real NO-GO on the family.

## What changed

1. **Bound `list_measures` in `SearchEnv.envResponse`.** A call without `startMeasure` and `endMeasure`, or a span larger than 4, is not executed. The observation says so. The MCP tool is unchanged (L2). Threshold `max_list_window: 4` is on the task.
2. **Pin `qwen3:4b-instruct-2507-q4_K_M`.** Official Ollama tag for Qwen3-4B-Instruct-2507, the r52 small base. `think: false`. Not `qwen2.5:7b`.
3. **Cap 32.** 18 occurrences on 8 songs, windowed to 221 cases. Hold-out songs: bethena, the-easy-winners, peacherine-rag. Schema `jam-actions-search-v0/1.2.0`, not registered.

## Split

| | P1b (cap 16) | P1c (cap 32) |
|---|---|---|
| train | 58 / 4 songs | **130 / 5 songs** |
| test | 47 / 2 songs | **91 / 3 songs** |
| occurrences | 12 / 6 songs | **18 / 8 songs** |

Three test clusters is still small for the clustered bootstrap. It is the cap-32 shelf, not a hidden two-song eval.

## Did search happen? (the P1b failure mode)

728 rollouts.

| tool turns | n |
|---|---|
| 1 | **6** |
| 2 | 573 |
| 3 | 149 |
| mean | 2.196 |

6/728 one-turn, not 376/376. The bound did what it was for.

Guess-test pass@8 **0.088** vs tool-using pass@8 **0.154**. Tools now help. P1b had the opposite (0.213 guess > 0.106 tools) because the observation was a 219-measure dump.

## Frozen bars

| Check | Need | Measured |
|---|---|---|
| in-band after leak-filter | ≥ 10 / 91 | **1** |
| sampled pass@1 | < 0.80 | **0.133** |
| below / in-band / above | | 77 / 1 / 13 |
| no-tool leaks | | 8 |

**search-v0 under this pin: NO-GO.** Headroom holds. The population does not. This time the family was actually searched.

## Distance

| distance | n | pass@1 | in-band | above | leak |
|---|---|---|---|---|---|
| 1 | 7 | 0.661 | 0 | 5 | 1 |
| 2 | 7 | 0.518 | 0 | 4 | 4 |
| 3 | 7 | 0.554 | 1 | 4 | 2 |
| ≥ 4 | 70 | 0.000 | 0 | 0 | 1 |

Short windows sit above the band (too easy). Distance ≥ 4 is a floor of zeros (too hard). The in-band slice is one case. The L9 knob is sharp; it does not yield a trainable middle on this split.

Filtering to distance 1–3 after looking would be tuning the environment to the eval. The bars were frozen. The family as specified fails them.

## Null branch

The dispatch pre-wrote this as shippable: a real NO-GO after a bounded observation and the preferred base, with search actually occurring. P2 does not start. No paid run.

25 tests in `src/dataset/search-v0` + experiment env/mcp still green.

---

## Addendum — advisor, same day: the floor has a mechanism, and it is not difficulty

Re-derived from `preds-pass8.jsonl` + `gold.jsonl`, both already committed here.

| Band | Attempts | Format-ok | Correct | Tool turns |
|---|---|---|---|---|
| distance 1–3 | 168 | 148 | **97** | 2:115, 3:53 |
| distance 4–8 | 264 | 225 | **0** | 1:3, 2:206, 3:55 |
| distance 9+ | 296 | 255 | **0** | 1:3, 2:252, 3:41 |

The model pages at every distance. At distance ≥ 4 it takes a second or third turn in
all but 6 of 560 attempts, so it is not giving up early. It still never scores.

**The reason, and it is exact: every one of the 480 in-range answers at distance ≥ 4
fell inside the *first* window.** Offsets from the window start, over those 480
attempts:

| answer − window start | 0 | 1 | 2 | 3 | ≥ 4 |
|---|---|---|---|---|---|
| count | 41 | 128 | 160 | 151 | **0** |

Not once in 480 chances did it name a measure it could only have seen on a later
page. It looks again and then answers from the first look. The failure is an absence
of state across observations, not an inability to search and not a shortage of turns.

### Why this closes the L9 knob rather than asking for a better setting

`distance` indexes how many windows a policy must traverse, and windows are discrete.
For a policy that cannot carry anything across a window boundary, that index is a step
function: inside the first window it is near-solved (pass@1 0.52–0.66), past it the
probability is exactly zero. A step function has no middle. **No setting of this knob
produces a band for this policy**, so the one in-band case is sampling noise on a
boundary, not evidence of a reachable population.

It also explains why the band was never going to be found by widening: cap 16 → 32 and
47 → 91 cases moved the counts and left the shape untouched.

### Why this is a genuine RLVR no-go and not a shrug

The arc's own grounding predicts it. Yue et al. (arXiv:2504.13837) is that RLVR
sharpens what the base already does sometimes rather than adding what it never does.
Here the base does it **never** at distance ≥ 4: 560 attempts, zero successes, and the
recorded answers show the correct behaviour was never even approached. There is no
successful trajectory to reinforce, so every group past the first window is all-wrong,
carries zero advantage, and would be discarded by dynamic sampling (arXiv:2503.14476).
The gate is not being conservative. It is reporting that the gradient does not exist.

### Recommendation

**Ship the null.** Three families have now failed the same frozen bars, for three
different and fully diagnosed reasons: authored tool sequences with the answer already
in the observation (P0), an unbounded observation that made tools net-negative (P1b),
and a capability cliff with no middle (P1c).

**Do not spin a fourth family looking for one that lands in the band.** P1c already
refused the small version of that error, declining to filter to distance 1–3 after
looking. Generating families until one passes is the same error one level up, and it
would invalidate the bars exactly as thoroughly.

There is a structural reason to expect no fourth family would land, and it belongs in
the closing report. The [12.5%, 50%] band is imported from INTELLECT-2
(arXiv:2505.07291), which filtered **285,000** candidate tasks down to the slice that
sat in it. This repo's entire publishable shelf is 11 songs yielding 18 occurrences at
cap 32. A pool that small cannot be filtered into a band; the band would have to be
where the typical case happens to land. **The prerequisite RLVR needs is task supply,
and that is the finding** — not a defect in any one family.

Closing the arc is a director gate under dispatch §8. This addendum is the
recommendation, not the decision.
