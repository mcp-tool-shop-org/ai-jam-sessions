# P1b — windowed search-v0, then the P0 instrument through the rollout loop

**Date:** 2026-09-11 · **Spend:** $0 · **Bars:** frozen in `scripts/p0-report.mjs` before this run (min in-band after leak ≥ 10, sampled pass@1 < 0.80). Pin: [pin.json](pin.json). Machine report: [report.json](report.json).

P2 is still held.

## Split (the number P1 omitted)

| | occurrences (P1) | windowed (P1b) | song clusters |
|---|---|---|---|
| train | 7 | **58** | 4 |
| test | 5 | **47** | **2** |
| total | 12 | **105** | 6 |

Window: every N in `1..M-1` for a plant at measure M. Question is "first measure at or after N". Gold is still M. Verdicts stay `1`–`16`. `distance = M-N` is on the case. Schema `jam-actions-search-v0/1.1.0`, not registered, nothing under `datasets/`.

Two test clusters is still too few for the clustered bootstrap the dispatch locked. Windowing multiplies cases, not songs. That limit is stated here rather than omitted.

## Learnability (rollout loop, not ollama-grade)

Pin: `qwen2.5:7b`, T=1, n=8, seed 0+attempt, test split only, 376 guess-test calls + 376 rollouts, 453 s wall.

| Check | Need | Measured |
|---|---|---|
| in-band after leak-filter | ≥ 10 / 47 | **4** |
| sampled pass@1 | < 0.80 | **0.029** |
| sampled pass@8 | (reported) | 0.106 |
| below / in-band / above | | 42 / 5 / 0 |
| no-tool leaks | | 10 |

**search-v0 under this pin: NO-GO.** Headroom holds. The population does not. Most groups are all-wrong, which is as untrainable as acoustic's all-correct. A zero is not a green light.

Guess-test pass@8 (0.213) is *higher* than the tool-using rollout (0.106). Short-distance windows leak by echoing a nearby integer (10 leaks, 9 of them distance 1–4).

## Distance (the L9 knob, not a schedule)

| distance | n | pass@1 | in-band | leak |
|---|---|---|---|---|
| 1 | 5 | 0.125 | 2 | 1 |
| 2 | 5 | 0.075 | 1 | 4 |
| 3 | 5 | 0.025 | 1 | 2 |
| 4 | 5 | 0.000 | 0 | 3 |
| 5 | 5 | 0.050 | 1 | 0 |
| 6–12 | 22 | 0.000 | 0 | 0 |

Hits concentrate at distance 1–3. Distance ≥ 6 is a floor of zeros. The knob works. Filtering to the short end does not produce 10 leak-free in-band cases on this split.

## What this does not authorise

- **Not P2.** The training machinery still has no in-band population.
- **Not a paid run.**
- **Not** "the 7B cannot search, therefore RL." That was the P1 framing this measurement was built to replace.

25 tests in `src/dataset/search-v0` + `src/dataset/experiment` still green after the generator change.

---

## Addendum — advisor diagnosis, same day (2026-09-11)

**The NO-GO above is sound as a measurement and should not be read as a verdict on
the family. This instrument never exercised search.** Re-derived from
`preds-pass8.jsonl`, which the run already recorded:

| Quantity | Value |
|---|---|
| Rollouts taking exactly one tool turn | **376 of 376** |
| Attempts passing the format gate | 202 of 376 |
| In range but wrong | 191 |
| Format-gate failures | 174 |
| All-wrong cases with at least one in-range attempt | 41 of 42 |
| Most frequent answer among in-range attempts | `5`, 65 times |

Nothing ever took a second turn against a budget of five. The cause is in the tool:
`list_measures` defaults `startMeasure` to 1 and `endMeasure` to the last measure,
so a single call on bethena returns all **219** measures. The episode is therefore
one dump followed by one guess. That is long-context needle extraction, not bounded
search, and it is the same one-shot shape P0 ruled out, only harder.

**The decisive evidence is already in the table above this addendum.** Guess-test
pass@8 of 0.213 exceeds tool-using pass@8 of 0.106. Handing the model the song made
it *worse* than handing it nothing. A search task whose observation is net negative
has not been tested; its tool has been.

The answer concentration on `5` points the same way. A model reading 219 measures
does not converge on one integer a third of the time; a model guessing does.

### What this authorises

- **Not P2.** That still holds, for the reason the run gives.
- **Not closing search-v0.** The family has not been measured on the mechanic it was built for.
- **A P1c re-measure, $0**, changing three things and re-running against these same frozen bars:
  1. **Bound the observation so iteration is required.** Clamp or require the measure window in `SearchEnv.envResponse`. The environment defines its action space; this does not reimplement a tool and so does not breach L2. This is the load-bearing change and it should be recorded in the lock, because it changes what the policy observes.
  2. **Re-pin the base model.** P0 and P1b both measured `qwen2.5:7b` Q4_K_M. r52 established Qwen3-4B-Instruct-2507 as the better small base and P0's own pin notes it was not installed. Two no-gos on one un-preferred quant is a confound worth ten minutes to remove.
  3. **Widen song clusters, not case counts.** Windowing multiplied cases and left two test clusters. Raising the measure cap from 16 to 32 takes plants from 6 songs to 8 (12 → 18 occurrences before windowing), which is the only lever that moves the cluster count the dispatch's eval depends on.

If P1c still returns below-floor with a bounded observation and the preferred base,
that is a real NO-GO on the family and the arc should report it as the shippable
null branch the dispatch pre-wrote.
