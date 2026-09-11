# Rollout arc

The RL environment the experiment contract is missing. Design lock:
[`docs/rollout-layer-dispatch.md`](../../docs/rollout-layer-dispatch.md).

Nothing here authorises GPU spend. P4 is unreachable until P0 returns GO and
the director authorises.

## P0 — go/no-go ($0, local Ollama)

Sampled evaluation the existing graders did not have.

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

GO on the existing corpus requires ≥ 10 held-out cases with pass@8 in
`[12.5%, 50%]` after dropping Kimi N=8 no-tool leaks, and sampled pass@1
below 0.80. Those bars live in `scripts/p0-report.mjs` and its tests; they
were frozen before the sampled run.

**P0 result (2026-09-11):** existing corpus **NO-GO** (0 in-band after leak-filter).
See [`p0/RESULTS.md`](p0/RESULTS.md).

## P1 — environment + local harness ($0)

New family `search-v0`: first measure **at or after N** whose left hand is a
planted chord. 12 occurrences windowed to **105 cases** (train 58 / test 47,
4 / 2 song clusters). Verdicts stay `1`–`16`. `distance = M-N` is the L9 knob,
not a curriculum.

```text
pnpm exec vitest run src/dataset/experiment src/dataset/search-v0
pnpm exec tsx experiments/rollout-arc/scripts/local-rollout.mjs qwen2.5:7b
pnpm exec tsx experiments/rollout-arc/scripts/search-learnability.mjs --model qwen2.5:7b --n 8 --split test
```
