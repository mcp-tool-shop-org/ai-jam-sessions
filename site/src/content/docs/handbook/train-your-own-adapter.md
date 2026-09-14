---
title: Train your own adapter
description: Run the verifier-rewarded RL loop on your own machine — the exact commands, what a run costs, what to expect, and the six traps that each cost us a paid run before we wrote them down.
sidebar:
  order: 10
---

Everything the [RL substrate](/ai-jam-sessions/handbook/rl-substrate/) page reports was produced
by code in this repository, and you can run the same loop yourself. This page is the how-to.
That page is the what-happened — **read it first if you want to know whether the result is worth
your electricity.** The honest summary: training buys a few points of pass rate, and a
fifty-line deterministic heuristic still beats the trained model.

Everything below is tracked in git. Nothing is fetched, nothing is gated, and there is no
account to create.

## What you need

| | |
|---|---|
| GPU | **~24 GB**. A measured run peaked at **22,946 MiB** at the settings below. A 24 GB card fits, without much room |
| Time | **~50 minutes** per training run (200 steps at ~14.8 s/step), plus ~35 min per evaluation |
| Python | the pinned environment in `experiments/rollout-arc/p2/trainer/requirements.lock.txt` |
| Node | for the verifier bridge — the repo's own `pnpm install` |

```bash
pip install --extra-index-url https://download.pytorch.org/whl/cu128 \
  -r experiments/rollout-arc/p2/trainer/requirements.lock.txt
```

The lock file pins `torch 2.11.0+cu128` and `trl 1.13.0`. **The TRL pin is load-bearing** — the
trainer reads behaviour out of TRL internals, and the flags described here move between
versions.

## 1. Start the verifier bridge

The bridge serves chord progressions and scores completions through the same voice-leading
checker the rest of the platform uses. It is the reward function.

```bash
pnpm exec tsx experiments/rollout-arc/scripts/p4-vl-server.mjs \
  --port 8766 --voices 2 --style common-practice --seed 20260913 \
  --fixture experiments/rollout-arc/p4/fixtures/progressions-v1.json \
  --require-pool 32
```

**`--fixture` and `--require-pool` are not optional, and leaving them off voided a paid run.**
Without a fixture the bridge builds its pool from `songs/library`, and a fresh clone ships 14
redistributable songs where a machine that has fetched the rest builds over a hundred. Our first
paid run served **14 rows to a trainer asking for 32** and its results were thrown away.
`--require-pool` turns that into a startup failure instead of a silent, smaller, *different*
experiment.

Check it came up with what you think:

```bash
curl -s localhost:8766/health
```

`pool_size` should be `32` and `pool_source` should be `fixture`.

## 2. Train

```bash
python experiments/rollout-arc/p2/trainer/train.py --no-tools \
  --base-url http://127.0.0.1:8766 \
  --steps 200 --num-generations 8 --per-device-batch 8 \
  --limit 32 --max-completion-length 384 \
  --seed 7 --prefix-mode none \
  --save-final-adapter runs/adapter-mine \
  --out runs/arm-mine
```

That writes a LoRA adapter and a `run.json` receipt recording the interpreter, the library
versions, the device, every config value TRL actually applied, and which metric series it
emitted. **Keep the receipt.** Most of the mistakes below are invisible in the loss curve and
obvious in the receipt.

## 3. Evaluate, unconditioned

```bash
python experiments/rollout-arc/p3/scripts/probe_generate.py \
  --prompts experiments/rollout-arc/p4/runs/prompts-heldout-v1.jsonl \
  --out runs/eval-mine.jsonl \
  --generations 64 --max-new-tokens 384 --seed 7 \
  --adapter runs/adapter-mine
```

75 held-out progressions the model never trained on. Score it with the readout scripts in
`experiments/rollout-arc/p4/scripts/` — `base-passrate.mts` for pass rate and coverage,
`prior-shape.mts` for what the output distribution actually looks like.

## What to expect

Measured over three runs differing only in seed:

- **Held-out pass rate: +4.71 points, 95% interval [+0.46, +11.03].** Real, and wide.
- **The output distribution gets narrower, not wider.** Training sharpens whatever the model
  already prefers. If you were hoping for more variety, this loop is the wrong tool.
- **46–76% of your training groups will produce no gradient at all.** When all eight rollouts
  for a prompt get the same reward, the group-relative advantage is identically zero. This is
  normal for a binary verifier and it is logged as `frac_reward_zero_std`.

## Six traps, each of which cost us something

**1. `--seed` does not control LoRA initialisation.** It is applied after the adapter is built,
so two runs at the same seed have *different* starting weights. They are independent draws, not
replicates. If you need real replicates, pin the initialisation by artifact:
`--save-init-adapter` once, then `--init-adapter` on every arm. We built a mechanism claim on
"same seed, opposite result, must be the platform" when it was ordinary run variance.

**2. One run tells you nothing.** Run-to-run spread on this task exceeds the effects worth
measuring. A single run produced +0.6 points; another produced +10.1. Three is a minimum, and
report an interval over runs rather than the best one.

**3. Pass the limit explicitly.** `--limit 32` is not a default. At 200 steps over 32 rows each
prompt is seen repeatedly, which is a real training choice — state it rather than discover it.

**4. If you swap to a base (non-instruct) checkpoint, check the stop token.** `Qwen3-4B-Base`
ships a chat template that ends turns with `<|im_end|>` and a `generation_config` that stops only
on `<|endoftext|>`. Generation never stops at the turn boundary, every sample runs to the length
cap, and the trailing text breaks the parser — which reads exactly like "the model cannot emit
the format". `probe_generate.py --eos-token-ids 151645,151643` overrides it.

**5. Unparseable output must score zero, and the bridge enforces it.** The voice-leading checker
will admit a realization with no sounding frames, so without a structure gate an *empty*
completion earns full reward and the policy learns to emit nothing. The bridge's `/score`
endpoint returns `reward: 0` for unparseable input; if you replace the reward, keep that.

**6. Read the receipt, not the request.** `run.json` records `loss_type`, `scale_rewards`,
`entropy_coef` and whether a KL series was actually emitted — read off the resolved config, not
off your command line. TRL defaults several of these, and a receipt that records only what you
*asked for* cannot tell you what ran.

## Before you rent a GPU

The two most useful things we learned cost nothing:

- **Ask the model for five options at once, with probabilities.** It returns roughly three
  genuinely different admissible openings — knowledge that single-sample decoding never shows
  you. That reframes "can it learn this" into "can training move probability onto what it
  already knows".
- **Measure the shape of the output distribution before trying to move it.** For months one
  number stood in for it. When we finally looked, the model was emitting fewer than two distinct
  openings per item out of sixteen valid ones. There was almost nothing to redistribute.

`prior-shape.mts` does the second one in minutes against generations you already have.

## The raw data

Every generation behind the published numbers — six training arms, the base-model probe, the
controls, the held-out prompts — is at
[`mcp-tool-shop/jam-rollout-arc-evals`](https://huggingface.co/datasets/mcp-tool-shop/jam-rollout-arc-evals),
unfiltered, so you can check our arithmetic before you trust our conclusions.
