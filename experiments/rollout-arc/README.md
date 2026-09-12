# Rollout arc

The RL environment the experiment contract was missing. Design lock:
[`docs/rollout-layer-dispatch.md`](../../docs/rollout-layer-dispatch.md).

> ⭐ **ARC REOPEN 2026-09-11 (director). Live phase: P1d, the `synth-v0` generated family —
> [`docs/rollout-arc-p1d-kickoff.md`](../../docs/rollout-arc-p1d-kickoff.md).**
> The closure below rested on a "task supply" argument that did not survive, and the
> cluster-count backup blocker dissolves the same way: a synthetic generator emits as many
> independent clusters as it is asked for. P1d holds `distance` fixed at 1–3, where the policy
> already scores 0.52–0.66, and grades difficulty by distractor confusability inside the page
> instead. Still $0, still gated, P2 still does not start without an in-band population.
>
> ⛔ **P0–P1c record (the three no-gos). Total spend $0. No GPU was ever rented.**
>
> Three families were measured against bars frozen before any model call, and all three
> failed. The mechanism for the last one: the policy pages but never uses the second
> page — all 480 in-range answers at distance ≥ 4 landed inside the *first* window — so
> distance is a step function with no trainable middle.
>
> ⚠ **The report's original "binding constraint is task supply" finding was WRONG and was
> corrected the same day.** `inferChord` and `detectChord` are pure functions over a
> string and a number array; neither needs the song library. The 18-occurrence ceiling
> came from `loadPublishableSongs()` — a *publishing* constraint the environment
> inherited by accident. A synthetic generator supplies unbounded scorable tasks.
> **The open question is narrower: whether difficulty can be graded inside the band where
> the policy already scores 0.52–0.66, instead of along an axis that steps to zero.**
>
> **Read [`docs/rollout-arc-closing-report.md`](../../docs/rollout-arc-closing-report.md) first** —
> verdict, mechanism, what survives the null, and the preregistered conditions that
> would reopen the arc. **P2 never started. No paid run was authorised.**

## Results

| Phase | Family | Bar | Measured | Receipt |
|---|---|---|---|---|
| P0 | existing four-draw corpus, 59 held-out | ≥ 10 in band | **0**, pass@1 0.371 | [`p0/RESULTS.md`](p0/RESULTS.md) |
| P1 | `search-v0` built; 12 occurrences, 7 train / 5 test | — | harness proven, split too small | [`p1/RESULTS.md`](p1/RESULTS.md) |
| P1b | windowed, unbounded observation, `qwen2.5:7b` | ≥ 10 / 47 | **4**, pass@1 0.029 | [`p1b/RESULTS.md`](p1b/RESULTS.md) |
| P1c | bounded observation, `qwen3:4b-instruct-2507` | ≥ 10 / 91 | **1**, pass@1 0.133 | [`p1c/RESULTS.md`](p1c/RESULTS.md) |
| P1d | `synth-v0` D0–D3, titles ≠ ids | ≥ 10 in-band at any level | **0 / 0 / 0 / 1** (lookup miss) | [`p1d/RESULTS.md`](p1d/RESULTS.md) |
| P1e | kebab-parity, same D0–D3 | ≥ 10 in-band at any level | **6 / 4 / 7 / 5**, all NO-GO | [`p1e/RESULTS.md`](p1e/RESULTS.md) |

P1b was an instrument fault, not a family result: `list_measures` defaulted to the whole
song, so 376 of 376 rollouts took a single turn and the no-tool guess-test *beat* tool use
(0.213 against 0.106). **P1c is the measurement of record** — bounded observation, preferred
base, cap 32. Search happened there (6 of 728 one-turn, mean 2.20 turns) and tools helped
(guess-test 0.088 against tool-using 0.154). The bars still failed.

## What this directory is for now

The instrument outlived the question. Before this arc the repo could not measure pass@k on
its own tasks, which is why two prior fine-tuning arcs found their corpus problems from paid
training runs instead of from a free measurement. These scripts answer it for $0 against any
local Ollama model, and P0 used them to establish something the supervised line still wants:
five existing families sit at ceiling once the gold tool transcript is in the prompt, and 18
of 59 held-out cases are answerable with no tools at all.

- `scripts/score-passk.mjs` — unbiased pass@k over multi-attempt predictions.
- `scripts/guess-test.mjs` — the Kimi N=8 no-tool leak detector.
- `scripts/p0-report.mjs` — the GO/NO-GO report; **the bars live in this file and its tests**, frozen before any run.
- `scripts/search-learnability.mjs` — pass@k through the rollout loop rather than the grader, which is required for any multi-turn family (the grader records `message.content` only, so a tool-calling turn reads as blank).
- `scripts/local-rollout.mjs` — single-episode proof of the loop against a local model.

The environment itself lives in `src/dataset/experiment/` (`env.ts`, `mcp-executor.ts`) and
`src/dataset/search-v0/`. It is tested and merged, and it is what a future arc would reuse.

## Reproducing the runs

P0, against the existing corpus:

```text
node experiments/coverage-v1-sft/scripts/ollama-grade.mjs \
  experiments/coverage-v1-sft/data-4draw/sft-test.jsonl qwen2.5:7b \
  --out experiments/rollout-arc/p0/preds-greedy.jsonl

node experiments/coverage-v1-sft/scripts/ollama-grade.mjs \
  experiments/coverage-v1-sft/data-4draw/sft-test.jsonl qwen2.5:7b \
  --n 8 --seed 0 --options temperature=1 --keep-alive 30m \
  --out experiments/rollout-arc/p0/preds-pass8.jsonl

node experiments/rollout-arc/scripts/guess-test.mjs \
  --sft experiments/coverage-v1-sft/data-4draw/sft-test.jsonl \
  --gold experiments/coverage-v1-sft/data-4draw/gold-test.jsonl \
  --model qwen2.5:7b --n 8 --seed 0 --options temperature=1 \
  --out experiments/rollout-arc/p0/preds-guess.jsonl

node experiments/rollout-arc/scripts/p0-report.mjs \
  --gold experiments/coverage-v1-sft/data-4draw/gold-test.jsonl \
  --greedy experiments/rollout-arc/p0/preds-greedy.jsonl \
  --sampled experiments/rollout-arc/p0/preds-pass8.jsonl \
  --guess experiments/rollout-arc/p0/preds-guess.jsonl \
  --pin experiments/rollout-arc/p0/pin.json \
  --out experiments/rollout-arc/p0/report.json
```

P1c, the `search-v0` configuration of record — first measure **at or after N** whose left
hand is a planted chord, `list_measures` bounded to a 4-measure page inside `SearchEnv`,
cap 32, 18 occurrences over 8 songs, 3 held-out song clusters:

```text
pnpm exec vitest run src/dataset/experiment src/dataset/search-v0
pnpm exec tsx experiments/rollout-arc/scripts/local-rollout.mjs
pnpm exec tsx experiments/rollout-arc/scripts/search-learnability.mjs --n 8 --split test
```

Gold is constructible in both families and re-derives from the engines at build time, so an
engine drift is a build failure rather than a silent relabel. No schema here is registered in
the published set and nothing was written under `datasets/`.
