# Preregistration — the TRL integration smoke run

**Written 2026-09-12, before the run can be built. No pod exists and no smoke data exists.**

> ## BLOCKED — this run cannot be scripted yet, and that is recorded here first
>
> `train.py` has exactly two modes and both are tool-based:
> `{"tools": make_plain_tools(...)} if args.plain_tools else {"environment_factory": ...}`.
> The bridge's `/cases`, `/tool` and `/score` are all bound to **synth-v0** and `scoreReward`.
> **The P4 voice-leading task shares none of that** — it draws progressions from
> `progressionFromAnalysis`, makes no tool calls at all, and is scored by
> `verifyVoiceLeading`. There is no path from `train.py` to it.
>
> Three pieces must be built and locally verified first, all $0:
> 1. a voice-leading mode on the bridge (`/cases` over progressions, `/score` running
>    `parseSpecResponse -> renderSpecRealization -> verifyVoiceLeading(style)`);
> 2. a third, no-tool single-turn branch in `train.py`;
> 3. a local venv with TRL, for a 2-step dry pass that proves the script runs before a pod
>    bills for discovering it does not.
>
> This document exists now so the thresholds below cannot drift during that build.

## The question, and it is one question

**Does the population measured in P4 survive a live `GRPOTrainer` batch?**

Not "does it train". Every P3 and P4 figure is single-turn `model.generate` through
transformers. The live trainer adds a loss mask, a different sampling path, and TRL's batch
serialization. No measured branching statistic has ever been shown to survive into a training
batch — P2's training run aborted before producing one.

## The cell

P4 voice-leading · **2 voices** · `film-ambient` · randomized 11-genre pool, items 1–32 ·
Qwen3-4B-Instruct-2507 bf16.

```
--dry --steps 32 --num-generations 8 --per-device-batch 8
--limit 32 --max-completion-length 512 --seed 7
```

At the Blackwell's measured 15.2 s/step this is ~8 minutes, ≈ **$0.45**.

## Pre-committed readings

1. **SURVIVES.** Non-degeneracy lands in **[0.30, 0.70]** and ρ in **[0.45, 0.75]**. The
   single-turn estimates (0.500 and 0.592) sit comfortably inside both, and the intervals are
   wide because n=32 at one cell does not pin either quantity — they are set to distinguish
   "the trainer sees roughly this population" from "it does not", nothing finer.
2. **DOES NOT SURVIVE.** ρ near 0.90 with non-degeneracy at or below 0.10 — P2's regime. This
   would mean **every number in P3 and P4 describes a population the trainer never sees**, and
   the substrate search has to be redone inside the trainer rather than beside it. Written
   plainly because it voids two phases of work and will therefore be tempting to explain away:
   a collapse is a collapse, and "but the single-turn numbers were solid" is not a defence.
3. **AMBIGUOUS.** Anything between. n=32 is one cell; an ambiguous result is not a pass, and the
   correct response is a second cell, not a narrative.

## Hard guards — any failure voids the cell before its rewards are read

- `dataset_rows` **= 32** exactly.
- `prompt_repeats` **= 1.00** exactly. (Now enforced in `train.py` at `11d673d`, which halts on
  an unchosen repeat rather than recording one.)
- `clipped_ratio` **= 0** on all steps.
- The pod is terminated on fetch; the dead-man is armed BEFORE staging, because the pod bills
  from creation.

## Stated in advance because it will be tempting afterwards

A surviving cell is an **infrastructure validation** result. It proves the GRPO loop can
optimize against a structured constraint map. It does **not** advance musical capability: the
nearest-tone deterministic heuristic scores **32/32** on this identical pool, so a trained
policy here loses to free code already in this repo. That framing is the director's, agreed
before the spend, and must not be softened in the write-up.
