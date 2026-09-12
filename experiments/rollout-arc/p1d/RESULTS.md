# P1d — synth-v0 D0–D3 curve

**Date:** 2026-09-11 · **Spend:** $0 · **Bars:** frozen in `scripts/p0-report.mjs` (leak-free in-band ≥ 10 at any level, sampled pass@1 < 0.80).
Pin (written before the sweep): [pin.json](pin.json). Machine report: [report.json](report.json).

P2 is still held.

You probably expect distractor density to behave like distance did. The measurement says the curve is flat at zero.

## Sweep

`qwen3:4b-instruct-2507-q4_K_M`, think:false, T=1, n=8, seed 0+attempt, test split. 1024 guess-test calls + 1024 rollouts. One Ollama 500 on truncated tool-call JSON was treated as a failed attempt, not a crash; the rollout was then completed.

## Curve (every declared level)

| level | n | pass@1 | pass@8 | in-band after leak | guess pass@8 | leaks | verdict |
|---|---|---|---|---|---|---|---|
| D0 | 32 | 0.000 | 0.000 | **0** | 0.563 | 18 | NO-GO |
| D1 | 32 | 0.000 | 0.000 | **0** | 0.375 | 12 | NO-GO |
| D2 | 32 | 0.000 | 0.000 | **0** | 0.375 | 12 | NO-GO |
| D3 | 32 | 0.004 | 0.031 | **1** | 0.406 | 13 | NO-GO |

No level clears ≥ 10 leak-free in-band with pass@1 < 0.80. **synth-v0: NO-GO.**

Guess-test beats the tool loop at every level. Tools currently hurt.

## Did search happen?

| tool turns | n of 1024 |
|---|---|
| 0 | 10 |
| 1 | 1 |
| 2 | 655 |
| 3 | 275 |
| 4 | 59 |
| 5 | 24 |
| mean | 2.43 |

Search is happening (same shape as P1c). 38% of final answers are a catalog miss: the policy kebab-cases the title (`Quiet Study aac` → `quiet-study-aac`) and calls `song_info` / `list_measures` with an id that is not the `synth-…` slug. Those episodes never see the page, so D0–D3 were not actually graded as distractor confusability. The curve being flat at zero is still the result for the family as specified. Changing titles after looking would be the error this phase refused.

## Split

320 songs, 128 held-out clusters (32 per level). Past the ≥ 30 cluster floor.

## Verdict

All levels below the band. The third pre-written outcome: competence at distance 1–3 on real repertoire does not transfer to this generated family under the same pin. P2 does not start.
