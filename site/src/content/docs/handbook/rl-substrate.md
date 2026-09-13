---
title: Reinforcement learning on the substrate
description: What GRPO actually does to a small model on a deterministic-verifier music task — a replicated gain, a prior that moves the wrong way, four failed predictions, and a heuristic that still beats all of it.
sidebar:
  order: 9
---

The [training dataset](/ai-jam-sessions/handbook/training-dataset/) page covers supervised fine-tuning on
tool-use traces. This page covers the other question: what happens when you point
**reinforcement learning with a verifiable reward** at this platform's own deterministic
music verifier, and let the rulebook — not a preference model — decide what counts as correct.

The short version: **it works, it is smaller than it looks, it does the opposite of what we
expected to the model's output distribution, and a fifty-line heuristic still beats it.**
All four of those are reported here with equal weight, which is the same rule the fine-tuning
page follows.

## The setup

A 4B model proposes two-voice keyboard accompaniments for a fixed chord progression. The
platform's own voice-leading checker grades every proposal against the full common-practice
rulebook — parallel fifths and octaves, tendency-tone resolution, voice overlap, leaps,
doubling. The reward is binary: the passage is admissible or it is not. No human preference,
no reward model, no judge.

Training is GRPO with LoRA, 200 steps, 8 rollouts per prompt, on 32 progressions. Evaluation
is on **75 held-out progressions the model never trained on**, drawn from the same pool by one
shuffle and a disjoint slice, with the overlap checked mechanically rather than assumed.

## What replicated

Three independent training runs, differing only in seed:

| run | held-out improvement |
|---|---|
| 1 | +0.60pp |
| 2 | +10.08pp |
| 3 | +3.44pp |
| **combined** | **+4.71pp, 95% interval [+0.46, +11.03]** |

The base model passes 12.0% of the time; training takes it to roughly 16.7% on unseen
progressions. The interval excludes zero, so the effect is real.

**But look at the spread.** The same configuration, same data, same number of steps, produced
anything from +0.6 to +10.1 points depending on nothing but a random seed — and in this
trainer, the seed does not even control how the adapter is initialised. An earlier single run
of this experiment reported +2.0pp; it turned out to be the weakest of four runs, and it had
been treated as the result.

**The honest interval is the wide one.** Bootstrapping over items alone gives a reassuring
[+2.24, +7.37]. Bootstrapping over *runs and items* gives [+0.46, +11.03]. The second is the
one that accounts for how much runs differ from each other, and it is the one that was
committed to in writing before the runs happened. With only two runs finished the two methods
actually disagreed about whether there was an effect at all.

## What went the other way

Going in, the interesting question was whether training would broaden the model's output —
whether it would stop reaching for the same voicing every time.

It did the opposite. The model's tendency to open a passage the same way **increased** in all
three runs. Measured per-progression, the base model already plays its favourite opening 93%
of the time, and training pushed that up by about 2.4 points.

That is not a broken run. It is what the objective asks for: a policy rewarded only for
passing the checker finds one safe path and deepens it. The theoretical result that predicts
this — that reinforcement learning regularised toward its starting point has a *non-diverse*
optimum by construction — was published in 2025 and matches what we measured.

## The finding that came from a free experiment

The most useful result of the whole exercise cost nothing and took eighty minutes.

Instead of training, we simply **asked the model for five options at once**, with probabilities.
It produced, on average, **2.96 genuinely different openings out of 5** — and those alternatives
passed the rulebook at essentially the same rate as its favourite (10.5% against 11.2%).

So the model is not missing the knowledge. It knows several valid ways to open a passage. It
just never samples them: when asked for its single best answer, its first choice was *more*
locked-in than ordinary sampling, and it assigned all five candidates an identical probability
rather than expressing a real preference.

**The capability is present and unexpressed.** That reframes the problem from "can it learn
this" to "can training move probability onto things it already knows are correct" — a much
more tractable question, and one we would not have asked without the free control.

## What this does not mean

- **It is not new musical capability.** A pass-rate gain is consistent with re-weighting
  answers the model could already produce, and the five-options result above is direct local
  evidence that exactly such material is sitting there. Claiming otherwise would need a
  different test than a bigger pass rate.
- **It loses to free code.** A deterministic nearest-tone heuristic — about fifty lines —
  scores **32 out of 32** on the same progressions the model was trained on, instantly, for
  nothing. The trained policy does not come close. What was bought here is knowledge about the
  method, not a better accompanist.
- **Four predictions were written down in advance and all four were wrong.** They were
  committed to a public timestamp before any evaluation existed, and they are recorded as
  failures rather than quietly revised. That is the point of writing them down.

## Receipts

Preregistrations, sealed predictions, per-run receipts, the statistics, and the scripts that
reproduce every figure above live under
[`experiments/rollout-arc/p4/`](https://github.com/mcp-tool-shop-org/ai-jam-sessions/tree/main/experiments/rollout-arc/p4)
— including `GATE-PREREG.md` (the decision rules, fixed before the runs),
`GATE-SEALED-PREDICTIONS.md` (the four failures), and `GATE-RESULTS.md` (the readout).
