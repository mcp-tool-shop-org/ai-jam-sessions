# P1 — environment interface and local rollout harness

**Date:** 2026-09-11 · **Spend:** $0 · **Dispatch:** §6 P1, L1–L4, L6–L7.

## What landed

- `src/dataset/experiment/env.ts` — three hooks + L4 reward + `runEpisode`.
- `src/dataset/experiment/mcp-executor.ts` — one `dist/mcp-server.js` per worker, isolated `AI_JAM_HOME`, play_song never sent, errors truncated to the last line, kill + leak assert on close.
- `src/dataset/search-v0/` — new family: first measure whose left hand is a planted chord. Gold is the plant. No authored tool sequence. Split by `song_id`. Closed verdicts `1`–`16`.
- Schema `jam-actions-search-v0/1.0.0` is **not** registered in the published set. Nothing was written under `datasets/`.

## Gates

| Gate | Result |
|---|---|
| Gold is constructible and re-derives from inferChord + detectChord | pass |
| User prompt does not name the measure or the song id | pass |
| No song straddles train/test | pass (hold-out: bethena, the-easy-winners) |
| Gold varies on both splits | pass |
| schemaVersion is not a published owner's | pass |
| `ensemble_now` with no audio device | pass (`Nothing is playing`, `isError: false`) |
| `play_song` never reaches the server | pass |
| Parallel cap 2 drops extras as observations | pass |
| Child pid dead after `close()` | pass |
| Scripted policy finds solace Gaug @ 6, reward 1 | pass |

24 new tests green (`src/dataset/experiment` + `src/dataset/search-v0`).

## Local Ollama loop

`pnpm exec tsx experiments/rollout-arc/scripts/local-rollout.mjs qwen2.5:7b` completed. The 7B guessed `42` after one `list_measures` call (format_ok false — 42 is outside 1–16). That is the harness working, not a capability result. Receipt: [local-rollout.json](local-rollout.json).

P2 (reward tests-per-clause already started in `env.test.ts`; replay receipt + Echo-Trap still open) does not start until the director says so.
