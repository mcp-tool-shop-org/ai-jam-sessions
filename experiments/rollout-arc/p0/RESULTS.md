# P0 — go/no-go on the existing four-draw corpus

**Date:** 2026-09-11 · **Spend:** $0 · **Director gate:** after this file.
**Dispatch:** [docs/rollout-layer-dispatch.md](../../../docs/rollout-layer-dispatch.md) §6 P0, §8 gate 1.
**Pin (written before the sampled run):** [pin.json](pin.json)
**Machine report:** [report.json](report.json)

## Verdict

**Existing corpus: NO-GO. New task family: GO-candidate.**

The bars were frozen in `scripts/p0-report.mjs` and its tests before any model call: a learnability population means ≥ 10 of 59 held-out cases with sample success rate in `[12.5%, 50%]` after dropping Kimi N=8 no-tool leaks, and sampled pass@1 below 0.80.

| Check | Need | Measured |
|---|---|---|
| in-band after leak-filter | ≥ 10 / 59 | **0** |
| sampled pass@1 | < 0.80 | 0.371 |

Headroom holds. The population does not. That is a complete, shippable P0, not a failed run.

Contrastive frame, as the dispatch wrote it: you probably expected this corpus to be the RL training set. The measurement says it is not. Acoustic is not a gradient source on this instrument, and every other family is either already at the ceiling once the gold tool transcript is in the prompt, or a no-tool leak.

## Pin

| | |
|---|---|
| model | `qwen2.5:7b` (Qwen2.5-7B-Instruct, Q4_K_M, Apache-2.0, already on the rig) |
| not this run | Qwen3-4B-Instruct-2507 (r52 base) — not installed locally |
| greedy | T=0, n=1, 59 calls, 20.1 s |
| sampled | T=1, n=8, seed=0+attempt, 472 calls, 84.5 s |
| guess-test | `/api/generate`, no tools, T=1, n=8, 472 calls, 10.9 s |
| gold | `data-4draw/gold-test.jsonl` n=59, sha `d9ab649e…` |
| majority baseline | 0.203 (`match`) |

## Sampled pass@1 / pass@8 (teacher-forced gold transcript)

pass@1 is c/8. pass@8 is 1 iff any of the 8 hits. The learnability histogram is over c/8, because Chen pass@8 at n=k=8 is binary and would empty the band by construction.

| family | n | pass@1 | pass@8 | below / in-band / above |
|---|---|---|---|---|
| acoustic | 36 | 0.003 | 0.028 | 35 / 1 / 0 |
| chord | 3 | 0.917 | 1.000 | 0 / 0 / 3 |
| ensemble | 3 | 1.000 | 1.000 | 0 / 0 / 3 |
| harmony | 6 | 1.000 | 1.000 | 0 / 0 / 6 |
| key_moments | 2 | 0.500 | 0.500 | 1 / 0 / 1 |
| measures | 3 | 1.000 | 1.000 | 0 / 0 / 3 |
| teaching_goals | 3 | 1.000 | 1.000 | 0 / 0 / 3 |
| transpose | 3 | 1.000 | 1.000 | 0 / 0 / 3 |
| **overall** | **59** | **0.371** | **0.390** | **36 / 1 / 22** |

Greedy `/api/chat` was 22/59 (37.3%), 36 blank. The 22 non-acoustic hits are almost all copies of a field already in the tool JSON. The one in-band sampled case (`acoustic:the-easy-winners:sharp_fail:3`, 1/8) is also a no-tool leak, so it drops out of the population.

## Guess-test (no tools, 8 attempts)

18 / 59 cases a toolless model already hits at least once. Those cannot count as tool-use learnability.

| leak class | n | what happened |
|---|---|---|
| acoustic `sharp_fail` | 12 | gold is `pitch_fail`; the toolless model emits `pitch_fail` as a default, so the whole subclass is a leak |
| harmony | 4 | some labels recoverable from the question |
| teaching_goals | 2 | same |

Chord, ensemble, measures, transpose, and one key_moments case stay at 0 without tools — they need execution. They are also the families that sit at 1.0 once the gold tool result is teacher-forced. That is §2a's "no policy": the sequence is authored, the answer is in the observation, and there is nothing for a reward to be about.

## Why acoustic is not a hidden GO

r52's Qwen3-4B *base* scored 12/36 greedy on acoustic through `predict_v1.py`. This P0 pin, through Ollama `/api/chat` with the 54-tool catalog, emitted empty `content` on 36/36 greedy acoustic cases (259/288 sampled attempts also blank). `ollama-grade.mjs` records `message.content` only, so a model that "answers" by issuing another tool call looks like a miss. That is a harness gap for P1, not a reason to spend RL on acoustic: even if a `--raw` path recovered r52's 12/36, SFT already ceilings the family at 36/36 for four dollars.

## What this authorises

- **P1** on a new task family (dispatch L1): bounded search over a song, constructible plant, unconstrained tool sequence.
- **Not** a paid run. P4 stays unreachable.
- **Not** wrapping acoustic, chord, harmony, or any other current family as the first environment.

P1 does not start until the director says so.
