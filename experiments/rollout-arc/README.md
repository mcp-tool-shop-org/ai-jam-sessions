# Rollout arc

The RL environment the experiment contract was missing. Design lock:
[`docs/rollout-layer-dispatch.md`](../../docs/rollout-layer-dispatch.md).

> ⭐ **ARC REOPEN. Live phase: P1f — [`docs/rollout-arc-p1f-kickoff.md`](../../docs/rollout-arc-p1f-kickoff.md).**
> P1d/P1e ran the `synth-v0` sweep: kebab-parity fixed the lookup confound (607 hits of 1024,
> tools help), but **NO-GO on the frozen bar at all four levels**, and D3 came out *easier*
> than D0 — distractor density does not grade. P1f changes only n (32→64 per level) and adds a
> **second criterion declared before the run**: the dispatch has four findings on what a
> trainable case is (22 DAPO, 23 Foster, 26 Absolute Zero all say **non-degenerate**; 24
> INTELLECT-2 gives the narrow band) and **P0 froze the GO rule on 24 alone**. Recomputed from
> P1e receipts: leak-free in-band 22/128, leak-free non-degenerate **41/128**. A stopping rule
> is in the lock: if neither criterion clears, the arc ships the null and there is no P1g.
>
> **Superseded kickoffs, kept as record:** [P1d](../../docs/rollout-arc-p1d-kickoff.md)
> (the generator, and the "task supply" closure that did not survive).
> **Prior record:** [P0–P1c report](../../docs/rollout-arc-closing-report.md) — three
> frozen-bar no-gos, and a wrong conclusion drawn from them, both kept in place.
>
> **Running totals: $0. No GPU has ever been rented. P2 has never started.**

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
(0.213 against 0.106). P1d was a second instrument fault: song titles did not match their
kebab ids, so lookups missed and the sweep returned 1 hit in 1024.

**P1c and P1e are the two measurements of record.** P1c established the distance cliff: the
policy pages but answers from the first page, so that axis steps to zero rather than grading.
P1e established that distractor density does not grade either, and in fact runs backwards —
D3 is *easier* than D0. Both failed the frozen bar.

**P1e also surfaced a defect in the bar itself.** The dispatch carries four findings on what a
trainable case is. Findings 22 (DAPO), 23 (Foster) and 26 (Absolute Zero) all say
**non-degenerate**, meaning any case the policy neither always nor never solves. Finding 24
(INTELLECT-2) gives the narrow `[12.5%, 50%]` band, which is a selectivity filter for a
285,000-case pool. **P0 froze the GO rule on finding 24 alone.** Recomputed from P1e's own
receipts with its own leak filter, leak-free in-band is 22 of 128 while leak-free
non-degenerate is 41 of 128. P1f reports both, with the second declared before the run.

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
