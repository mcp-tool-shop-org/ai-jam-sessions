# Base vs instruct — probe results

**2026-09-14. Local RTX 5090, $0, no pod, no training.** Generation only, against the decision
rule fixed in `BASE-MODEL-STUDY.md` §7 (`26d788f`) before the download started. Two arms of
`Qwen/Qwen3-4B-Base`, 75 held-out items, G=64, generation seed 7 — the same pool, shape and
seed as every number this arc has published.

Arm A carried `--eos-token-ids 151645,151643`. That was not optional: `Qwen3-4B-Base` ships
`generation_config.eos_token_id = 151643` alone while the ChatML template it also ships closes
turns with `<|im_end|>` (151645). Un-overridden, every rollout runs to the 384-token cap and
trails past the JSON — a stop-token failure that reads exactly like a capability failure. The
run log records the override firing and what it prevented.

---

## The shape of the prior

`support` = distinct first-chords **emitted**, parseable only (can exceed the 16-opening
alphabet, since an emitted opening need not be admissible). `distinct-passing` is the column
to read against that alphabet.

| | support | modal | **distinct-passing** | mode admissible | unparseable |
|---|---|---|---|---|---|
| **Base + ChatML** | 13.83 (med 13) | 25.6% | **2.60** | 39% | **57.1%** |
| **Base + no template** | **16.87 (med 16)** | 29.9% | **3.65** | **55%** | **25.9%** |
| Instruct | 1.84 (med 2) | 92.6% | 0.53 | 36% | 0.0% |
| C7 trained (β=1e-4) | 1.65 (med 1) | 95.4% | 0.44 | 35% | 0.0% |
| B07 trained (β=0) | 1.56 (med 1) | 95.9% | 0.39 | 33% | 0.0% |

**The hypothesis is confirmed on the axis it was about.** The base checkpoint reaches **6.9×**
as many distinct *passing* openings as the instruct model (3.65 against 0.53), at a quarter the
modal share. Six phases of RL moved support between 1.56 and 2.01; the checkpoint swap moves it
to 16.87.

**Removing the chat template improves every column at once.** Arm B against arm A: support
13.83 → 16.87, distinct-passing 2.60 → 3.65, mode-is-admissible 39% → 55%, and unparseable
**57.1% → 25.9%**, less than half. That reproduces Dr. GRPO (arXiv:2503.20783) on our task:
Qwen base checkpoints are not blank, they are *differently* enveloped, and our ChatML wrapper
is a mismatch that costs both format and diversity.

## Pass rate — and the row that matters

| | pass | **items with ≥1 pass in 64** | concentration (all-completions form) |
|---|---|---|---|
| Base + ChatML | 5.08% | **80%** | 0.5706 |
| **Base + no template** | 9.33% | **93%** | **0.2779** |
| Instruct | **11.73%** | **39%** | 0.9256 |
| C7 trained | 12.29% | 37% | 0.9540 |
| B07 trained | 12.88% | 33% | 0.9585 |

> **The instruct model has the higher per-sample pass rate and reaches an admissible answer on
> 39% of items. The base model, un-enveloped, reaches one on 93%.**

The instruct model buys its aggregate rate by nailing a **minority of items repeatedly**. On
the other 61% it is not merely worse — it never gets there at all, in 64 draws, and no amount
of additional sampling changes that, because its support on those items is one wrong answer.

**For a verifier envelope, coverage is the quantity, not per-sample rate.** Best-of-n needs one
passing sample. Instruct caps out at **39% of items solvable** however many you draw. Base
un-enveloped solves **93%**. That is a **2.4× increase in the reachable item space**, and it is
what `support 1.84` was hiding all along.

It also reframes six phases retrospectively: the arc was optimising pass rate on a checkpoint
that had already lost **61% of the item space before training began**. The +2–5pp held-out
gains were real, replicated, and squeezing a model that could never solve most of the pool.

## Scoring against the pre-committed rule — and a defect in it

`BASE-MODEL-STUDY.md` §7 fixed three clauses before the run:

| clause | arm B (base, no template) |
|---|---|
| support ≥ 6 **and** unparseable ≤ 20% → price a train cell | support 16.87 ✓, unparseable **25.9%** ✗ — **does not fire** |
| support ≈ 2 → hypothesis dies in this family | no |
| unparseable ≥ 50% → unbuyable at this verifier | no (25.9%) |

**No clause fires for arm B.** The three conditions do not partition the space, and arm B landed
in the gap — support far past the bar, format missing the bar by 5.9pp.

> **That is a defect in my own precommitment, and it is the same class as `1fae03e`:** a rule
> whose conditions do not cover the outcomes it will meet. The threshold is **not** being moved
> after seeing the number. The honest report is that the rule did not decide this, and the
> decision is therefore a Director call informed by the numbers rather than a fired reading.

Arm A **does** fire the third clause (57.1% ≥ 50%): **base through our current ChatML envelope
is unbuyable at this verifier.** That much the rule settled.

## What this licenses, and what it does not

**Does not license a training cell on any checkpoint.** None was priced, 25.9% unparseable
still puts a quarter of every group in the reward-0 bucket on top of the 46–76% silent groups
already measured, and `2504.13837` still holds that RLVR narrows support rather than adding to
it — which on a support-16.87 checkpoint is an argument for *not* training it back down.

**Does not license "base is better."** Per-sample pass rate is **lower** (9.33% vs 11.73%). The
claim is narrower and stronger: base covers 93% of items, instruct covers 39%.

**Does not answer what 2507's post-training did.** `Qwen3-4B-Base` is the pretrained sibling of
the *original* Qwen3-4B, not a pre-SFT ablation of the 2507 recipe. There is no checkpoint that
would run that comparison.

**What it does make obvious is a $0 inference-time move**, and it is the pattern this studio
already ships (Phase C: base + deterministic verifier + best-of-n, 9% → 50% → 91% on E-R).
Base + no template + the existing voice-leading verifier reaches an admissible answer on 93% of
held-out items against the instruct model's 39%. No training, no pod, no adapters. Whether that
is worth building is a Director call; the measurement is done and it cost nothing.

**The remaining gap is format, and format is tractable by prompt engineering rather than by
gradient.** Removing one wrapper took unparseable from 57.1% to 25.9%. A few-shot exemplar, a
stop sequence, or constrained decoding are all $0 experiments against that 25.9%, and none of
them is a cell.

## Receipts

`scripts/base_probe_local.sh` · `scripts/prior-shape.mts` · `scripts/base-passrate.mts` ·
`runs/mc64-heldout-q3base-{chatml,raw}.jsonl` · `runs/base-probe.log` (records the eos override
firing) · `p3/scripts/probe_generate.py` (`--eos-token-ids`, `--no-chat-template`; default path
byte-unchanged) · study `26d788f` · prior shape `f921785` / `d1116ab` / `3fea548`

**Raw generations published** (the files this section cites are ~51 MB and not in git):
https://huggingface.co/datasets/mcp-tool-shop/jam-rollout-arc-evals
