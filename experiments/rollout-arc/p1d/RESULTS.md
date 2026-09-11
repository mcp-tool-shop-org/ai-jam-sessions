# P1d — synth-v0 generator. Sweep not run: local GPU is busy.

**Date:** 2026-09-11 · **Spend:** $0 · **Bars:** unchanged in `scripts/p0-report.mjs`.
Pin (written before any model call): [pin.json](pin.json).

P2 is still held. Comfy Cloud was not used: this eval is a local Ollama tool loop on the P1c pin, and the lock forbids spend.

## Smoke (the first task of the phase)

One synthetic `SongEntry` (`synth-smoke-one`) validates, is written into an isolated `AI_JAM_HOME/songs/` before `dist/mcp-server.js` starts, and comes back from a real `list_measures` call (`Measure 1`, left hand `C3`). The real library is not touched. L2 holds.

## Corpus (seed `20260911`, deterministic)

Distance pinned to 1–3. Difficulty is D0–D3 distractor confusability in the first 4-measure page. Schema `jam-actions-synth-v0/1.0.0`, not registered, nothing under `datasets/`.

| level | train | test | test clusters |
|---|---|---|---|
| D0 | 48 | 32 | 32 |
| D1 | 48 | 32 | 32 |
| D2 | 48 | 32 | 32 |
| D3 | 48 | 32 | 32 |
| **total** | **192** | **128** | **128** |

128 held-out songs is past the dispatch's ≥ 30 cluster floor.

## Sweep

**Not run.** The local 5090 is in use by another session. The pin names `qwen3:4b-instruct-2507-q4_K_M`, T=1, n=8, test split, same as P1c. Command when the GPU is free:

```text
pnpm exec tsx experiments/rollout-arc/scripts/synth-learnability.mjs --n 8 --split test
```

No D0–D3 curve yet. No GO / NO-GO against §6. The three pre-written outcomes stay unopened.

8 tests in `src/dataset/synth-v0` green, including the live MCP smoke.
