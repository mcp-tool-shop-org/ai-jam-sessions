---
title: Reinforcement learning on the substrate
description: Six phases of RL on a deterministic music verifier, and the free measurement that explained all of them — the model we were training could only ever reach 39% of the problems.
sidebar:
  order: 9
---

The [training dataset](/ai-jam-sessions/handbook/training-dataset/) page covers supervised
fine-tuning on tool-use traces. This page covers the other question: what happens when you point
**reinforcement learning with a verifiable reward** at this platform's own deterministic music
verifier, and let the rulebook — not a preference model — decide what counts as correct.

It ran for six phases. The training worked, slightly, and replicated. Then a measurement that
cost nothing explained why none of it mattered much: **the model being trained could only ever
reach 39% of the problems, no matter how many times it tried.** Swapping the checkpoint and
removing a prompt wrapper took that to 92%.

Both halves are reported here with equal weight, which is the same rule the fine-tuning page
follows.

## The setup

A 4B model proposes two-voice keyboard accompaniments for a fixed chord progression. The
platform's own voice-leading checker grades every proposal against the full common-practice
rulebook — parallel fifths and octaves, tendency-tone resolution, voice overlap, leaps,
doubling. The reward is binary: the passage is admissible or it is not. No human preference, no
reward model, no judge.

Training is GRPO with LoRA, 200 steps, 8 rollouts per prompt, on 32 progressions. Evaluation is
on **75 held-out progressions the model never trained on**, sampled 64 times each, with the
overlap between pools checked mechanically rather than assumed.

## What the training did

Three runs differing only in seed produced a held-out improvement of **+4.71 percentage points,
95% interval [+0.46, +11.03]**. The interval excludes zero, so the effect is real. It is also
wide: the same configuration produced anything from +0.6 to +10.1 points depending on nothing
but a random seed — and in this trainer, the seed does not even control how the adapter is
initialised.

A later cell removed the KL regularisation term entirely and compared it against a matched
control on the same machine. That came back **unresolved** — and, more usefully, the
measurement showed the design could not have resolved anything smaller than about 13 points,
because one control run swung 10 points on its own. *"The result is null"* and *"this experiment
could never have answered the question"* are different findings, and only the second one tells
you whether buying more runs is worth anything.

**Four predictions were written down and timestamped before any evaluation existed. All four
were wrong.** They are recorded as failures rather than quietly revised, which is the point of
writing them down.

## The measurement that explained everything

For six phases, one number stood in for the model's output distribution: how often it opens a
passage the same way. That number was **93%**, and the whole programme argued about whether
training moved it.

Nobody had asked what kind of distribution 93% actually was. It costs nothing to check, and
the answer reframed the arc:

- Across 64 samples, the model emits **fewer than two distinct openings per item** — out of
  **16 admissible ones**.
- Its single favourite opening is **inadmissible on 64% of items**.
- Fewer than **one** distinct opening per item ever produces a passing passage.

The distribution was not concentrated with a tail to redistribute. It was **degenerate**. Every
phase had been trying to move probability mass that was not there, and the entire ±10-point
range the programme spent months measuring was movement between "1.5 distinct openings" and
"2.0 distinct openings".

It also explains a free control run earlier in the arc: asked to *enumerate* five candidate
openings in one call, the same model produced **2.96 genuinely different admissible ones**. It
knew several valid answers. It simply never sampled them.

## The number that matters: coverage

Aggregate pass rate hides the thing that decides whether a verifier is useful. With a checker
in the loop you only need **one** passing sample — so the question is not "how often does it
pass" but "**on how many problems can it ever pass at all**".

| | pass rate | **items with ≥1 passing sample in 64** |
|---|---|---|
| Instruct model (what we trained) | 11.7% | **39%** |
| After RL training | 12.3–12.9% | **37% / 33%** |
| Base checkpoint, no chat template | 9.3% | **93%** |
| Base + one worked example | **16.2%** | **92%** |

The instruct model buys its respectable pass rate by solving a minority of problems repeatedly.
On the other 61% it does not merely do worse — it never gets there, in 64 tries, and more
sampling cannot help, because its entire output distribution on those items is one wrong answer.

**Training made this worse**, not better: 39% → 37% → 33%. Reinforcement learning sharpens an
existing distribution; it does not widen one. Six phases were spent optimising a pass rate on a
model that had already lost 60% of the problem space before training began.

## What actually moved it

Two changes, neither of which is training, measured against the same baseline on the same
machine and paired item by item:

| | change | 95% interval |
|---|---|---|
| Problems reachable | **+51 points** | [+38.7, +62.7] |
| Opening concentration | **−37 points** | [−41.6, −32.5] |
| Pass rate | +4.3 points | [+0.4, +8.1] |

The changes were: use the **pretrained checkpoint instead of the instruction-tuned one**, drop
the chat-template wrapper, and prepend **one worked example** — about 750 characters. No
training, no GPU rental, no adapters.

The example matters more than it looks. Without it the base model's output fails to parse 26% of
the time; with it, **2%**. And the example has to be chosen carefully: the first candidate our
selector returned was a technically-valid answer that repeated one voicing eight times, which
would have taught the model to collapse while scoring as a success.

The whole result was written against a pass/fail rule fixed **before** the run — format under
20%, coverage above 90%, and a third condition specifically to catch "bought format by
destroying diversity". It was then repeated on a second sampling seed, where the two runs landed
within a tenth of a point of each other.

## What this does not mean

- **It is not new musical capability.** The gain is consistent with re-weighting and
  re-enveloping answers the base model could already produce. The enumeration result above is
  direct evidence that exactly such material was sitting there unused.
- **It does not show a prompt can replace the training.** Those were two different comparisons —
  one measured training on a fixed model, the other measured changing the model. Similar
  magnitudes across different comparisons are a coincidence of scale, not a substitution test.
- **The base model is not simply "better".** Its per-sample pass rate is *lower*. It reaches
  more problems. Those are different sentences and only the second one is claimed.
- **It still loses to free code.** A deterministic nearest-tone heuristic — about fifty lines —
  scores **32 out of 32** on the same progressions, instantly, for nothing.
- **Robust to one thing, unmeasured on another.** Repeating the run on a second sampling seed
  changed nothing. Changing the *worked example* has never been tried, and that is the larger
  untested knob.

## The transferable part

The arc's most expensive lesson was not about reinforcement learning. It was that **a single
summary statistic can stand in for a distribution for months without anyone noticing**. "Opens
the same way 93% of the time" and "can only ever produce two different openings" are the same
number describing very different situations, and only one of them is a problem training could
have fixed.

The check that settled it took minutes and cost nothing, and it was available from the first
phase onward.

## Receipts

Preregistrations, sealed predictions, per-run receipts, the statistics, and the scripts that
reproduce every figure above live under
[`experiments/rollout-arc/p4/`](https://github.com/mcp-tool-shop-org/ai-jam-sessions/tree/main/experiments/rollout-arc/p4)
— including the decision rules fixed before each run, the failed predictions, and the
retractions attached to the paragraphs they retract.
