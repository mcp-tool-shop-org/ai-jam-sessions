---
license: apache-2.0
task_categories:
  - text-generation
language:
  - en
tags:
  - rlvr
  - grpo
  - music
  - verifiable-rewards
  - reproducibility
pretty_name: AI Jam Sessions — rollout arc raw generations
size_categories:
  - 1K<n<10K
configs:
  - config_name: base_probe
    default: true
    data_files:
      - split: chatml
        path: local-base-probe/mc64-heldout-q3base-chatml.jsonl
      - split: raw
        path: local-base-probe/mc64-heldout-q3base-raw.jsonl
      - split: fewshot
        path: local-base-probe/mc64-heldout-q3base-fewshot.jsonl
      - split: fewshot_s8
        path: local-base-probe/mc64-heldout-q3base-fewshot-s8.jsonl
  - config_name: local_gate
    data_files:
      - split: base
        path: local-gate/mc64-heldout-base.jsonl
      - split: c7l
        path: local-gate/mc64-heldout-C7L.jsonl
      - split: c8l
        path: local-gate/mc64-heldout-C8L.jsonl
      - split: c9l
        path: local-gate/mc64-heldout-C9L.jsonl
      - split: pil7l
        path: local-gate/mc64-heldout-PIL7L.jsonl
      - split: pil8l
        path: local-gate/mc64-heldout-PIL8L.jsonl
      - split: pil9l
        path: local-gate/mc64-heldout-PIL9L.jsonl
      - split: vs_base
        path: local-gate/vs-heldout-base.jsonl
  - config_name: pod_b0cell
    data_files:
      - split: base
        path: pod-b0cell/mc64-heldout-base.jsonl
      - split: c7
        path: pod-b0cell/mc64-heldout-C7.jsonl
      - split: c8
        path: pod-b0cell/mc64-heldout-C8.jsonl
      - split: c9
        path: pod-b0cell/mc64-heldout-C9.jsonl
      - split: b07
        path: pod-b0cell/mc64-heldout-B07.jsonl
      - split: b08
        path: pod-b0cell/mc64-heldout-B08.jsonl
      - split: b09
        path: pod-b0cell/mc64-heldout-B09.jsonl
  - config_name: prompts
    data_files:
      - split: heldout
        path: prompts/prompts-heldout-v1.jsonl
---

# Rollout arc — raw generations

Every model generation behind the write-ups in
[`mcp-tool-shop-org/ai-jam-sessions`](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
under `experiments/rollout-arc/p4/`.

**Two things you can do with this.**

**Check our arithmetic.** The repo has the readout scripts, the preregistrations and the
intervals — but the generations they were computed from are ~51 MB and were never committed, so
a clone got the conclusions and no way to recompute them. These are those files, unfiltered.

**Or run the loop yourself.** The trainer, the verifier bridge and the frozen progression set are
all in the repo, and none of it is gated or fetched.
[**Train your own adapter**](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/train-your-own-adapter/)
is the step-by-step: three commands, ~50 minutes on a 24 GB card, and the six traps that each
cost us a run before we wrote them down.

## The task

A 4B model proposes two-voice keyboard accompaniments for a fixed chord progression. A
deterministic voice-leading checker grades each proposal against the full common-practice
rulebook — parallel fifths and octaves, tendency-tone resolution, voice overlap, leaps,
doubling. Reward is binary: admissible or not. No reward model, no judge, no human preference.

Every eval here is **unconditioned** (no scaffolding, nothing handed to the model), sampled
**G=64** on the same **75 held-out progressions**, generation seed 7 unless noted.

## Layout

Four configs, one per experiment family. Every split is the same 75 held-out items, 64 samples
each — 1,500 rows in total.

| config | split | what it is |
|---|---|---|
| **`base_probe`** *(default)* | `chatml` | `Qwen3-4B-Base` under a ChatML wrapper |
| | `raw` | `Qwen3-4B-Base`, no chat template |
| | `fewshot` | no template + one worked example, seed 7 |
| | `fewshot_s8` | the same, seed 8 — the replication |
| **`local_gate`** | `base` | untrained `Qwen3-4B-Instruct-2507` |
| | `c7l` `c8l` `c9l` | plain GRPO, seeds 7 / 8 / 9 |
| | `pil7l` `pil8l` `pil9l` | the `--prefix-in-loss` arm, seeds 7 / 8 / 9 |
| | `vs_base` | Verbalized-Sampling control, G=8 × K=5 |
| **`pod_b0cell`** | `base` | untrained, on the rented RTX 5090 with its own matched control |
| | `c7` `c8` `c9` | β=1e-4, seeds 7 / 8 / 9 |
| | `b07` `b08` `b09` | β=0, seeds 7 / 8 / 9 |
| **`prompts`** | `heldout` | the 75 prompts, with progression and the system/user text |

`prompts/fewshot-exemplar.txt` is the single worked example the few-shot arm was given. It is a
plain text file rather than a config — download it directly.

## Loading

```python
from datasets import load_dataset

# the headline arm: base checkpoint, no chat template, one worked example
d = load_dataset("mcp-tool-shop/jam-rollout-arc-evals", "base_probe", split="fewshot")
print(len(d), len(d[0]["completions"]))      # 75 items, 64 samples each

# the checkpoint it is measured against
load_dataset("mcp-tool-shop/jam-rollout-arc-evals", "local_gate", split="base")
```

## Row format

```json
{"itemId": "...", "songId": "...", "completions": ["...", ...], "lengths": [...],
 "distinct_exact": 64, "distinct_stripped": 64, "mean_entropy": null}
```

`completions` holds all 64 samples verbatim, including the ones that fail to parse. **Nothing is
filtered.** The unparseable rate is itself a reported measurement in the base-probe arms
(57.1% under ChatML, 25.9% un-enveloped, 2.0% with one worked example), so removing them here
would delete a finding.

The `prompts` config is the one exception to that row shape: it carries `itemId`, `songId`,
`genre`, `chords`, `progression`, and the `system` / `user` strings as they were sent.

## Models

- `Qwen/Qwen3-4B-Instruct-2507` — the instruction-tuned checkpoint the arc trained on
- `Qwen/Qwen3-4B-Base` — the pretrained sibling used in `base_probe`
- LoRA adapters are **not** published: they come from a cell whose own result was *unresolved*,
  and weights for a null are a download cost rather than a contribution. The how-to above
  produces your own in about fifty minutes.

## The headline the data supports

Coverage — the fraction of items where **at least one** of 64 samples is admissible — is the
quantity that matters when a verifier is in the loop, because best-of-n needs one hit:

| | pass rate | items with ≥1 pass |
|---|---|---|
| instruct (trained on) | 11.7% | **39%** |
| after GRPO training | 12.3–12.9% | **37% / 33%** |
| base, no chat template | 9.3% | **93%** |
| base + one worked example | 16.2% | **92%** |

Training moved coverage the wrong way. The instruct checkpoint emits fewer than two distinct
openings per item out of sixteen admissible ones, so on 61% of items no amount of sampling
reaches an admissible answer.

**What this does not show:** new capability (it is re-weighting what the base could already
sample), that a prompt replaces training (those are different comparisons), or robustness to the
choice of worked example (one exemplar was tried; the sampling seed was drawn twice, the
exemplar was not). A fifty-line deterministic heuristic still scores 32/32 on the trained pool.

## If you are going to train

Read the [how-to](https://mcp-tool-shop-org.github.io/ai-jam-sessions/handbook/train-your-own-adapter/)
first — it has the commands and the measured costs (22,946 MiB peak, ~50 min at 14.8 s/step).
The short version of what bit us:

- **`--seed` does not control LoRA initialisation.** Two runs at one seed are independent draws,
  not replicates. Pin by artifact (`--save-init-adapter` / `--init-adapter`).
- **One run tells you nothing.** The same configuration produced +0.6 and +10.1 points.
- **Start the bridge with `--fixture` and `--require-pool`.** Otherwise a fresh clone builds a
  14-song pool where a fetched machine builds a hundred — our first paid run was voided by
  exactly that, having served 14 rows to a trainer asking for 32.
- **Unparseable output must score zero.** The checker admits a realization with no sounding
  frames, so without a structure gate an *empty* completion earns full reward and the policy
  learns to emit nothing.
- **Expect 46–76% of groups to produce no gradient.** With a binary verifier, all-pass and
  all-fail groups have identically zero advantage.

## Reproducing the published numbers

Clone the repo, drop these files into `experiments/rollout-arc/p4/runs/` (and `artifacts/` for
`pod_b0cell`), then run the readouts — `prior-shape.mts`, `base-passrate.mts`,
`seed-stability.mts`, `why-unparseable.mts`, `pil-readout.mts`. Every bootstrap seeds its RNG
**per computation**, because a module-level generator consumed in call order once produced two
different published intervals for the same quantity.

## Licence

Apache-2.0, matching the repo and the base models. The prompts are chord-symbol charts and
measure numbers already published in the source repository; the completions are model output.
