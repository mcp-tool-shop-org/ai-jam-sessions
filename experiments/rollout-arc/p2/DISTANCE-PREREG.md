# Preregistration — the 2×2 distance × decoy screen

**Written 2026-09-12, before any reward from these arms was read.** At the time of
writing the control arm was at 6 of 8 steps and the treatment arm had not started.
The peer asked for this explicitly: *"decide now what result would make you say the
distance pin is decoration rather than a lever, because that is a judgement that
gets easier to bend after seeing four cells."* They are right, and this arc has
already been invalidated once by a number nobody pinned down in advance.

## The question

P1c found that the policy "pages but never uses the second page." That finding is
why distance is pinned to 1–3. It was measured on a 4-bit GGUF through Ollama.
**bf16 has never been run at distance ≥ 4.** Is the distance pin a lever on
difficulty, or a decoration?

## Design

Identical seed (2026091204), shape (8 test + 8 train per level), model
(`Qwen/Qwen3-4B-Instruct-2507`, bf16), token budget (1024), and scorer. Only two
flags move.

| | decoy OFF | decoy ON |
|---|---|---|
| **distance 1–3** | `control` — reproduces the pinned population | `decoy-near` — bound live, one page |
| **distance 5–11** | `treatment` — gold 2–3 pages out, bound still inert | `decoy-far` — needs both |

`--max-list-window` is 4, so distance 5–11 puts gold two or three pages past the
bound. The decoy cells exist because of the peer's point, verified deterministically
on 2048 of 2048 cases: with the decoy off, an unbounded scan from measure 1 still
lands on gold, so the distance arms test **paging** and not the bound.

## What this screen can and cannot decide

**It is a screen, not the measurement.** 8 steps × 2 generations = **8 groups and 16
completions per cell.** A rate estimated from 8 Bernoulli trials carries a 95%
interval of roughly ±0.3. This design cannot distinguish a 25% non-degenerate rate
from a 15% one, and **no rate from this screen may be written into a design decision
or compared against the [12.5%, 50%] learnability band.** Its only job is to decide
which cells earn a higher-n confirmation run.

With `num_generations = 2`, a group is non-degenerate iff exactly one of its two
completions is right. If per-prompt solve probability is *p*, the non-degenerate rate
is 2*p*(1−*p*) — maximised at 0.5 when *p* = 0.5, and zero at both *p* = 0 and *p* = 1.
**Both failure modes are degenerate.** All-right and all-wrong produce identical zero
gradient, which is the trap this rule exists to name in advance.

## Pre-committed readings

Only the extremes are decidable at n = 8. Each of these is a statement about the
*screen*, and each names its follow-up rather than a conclusion.

1. **Distance does not break the task** — if `treatment` returns 16/16 correct.
   Under a true solve rate of 0.75 that outcome has probability 0.01, so it is
   decidable at this n. **Reading: the distance pin is decoration for bf16**, P1c's
   mechanism does not reproduce on the model we would train, and distance is not the
   axis to spend on. Next: the decoy cells carry the difficulty hypothesis alone.

2. **Distance overshoots** — if `treatment` returns 0/16 correct with `format_rate`
   1 and `clipped_ratio` 0. **Reading: not a success.** An all-wrong population is
   exactly as degenerate as an all-right one and would produce zero gradient. Next:
   bisect distance between 3 and 5 rather than declaring a win.

3. **Distance is a lever** — if `treatment` lands strictly between, with at least 3
   of 8 groups non-degenerate while `control` has at most 1. Next: **32-step
   confirmation at the same settings before any number is quoted**, because 3-of-8
   is not a rate.

4. **Anything else** — inconclusive at this n. No reading. Re-run at 32 steps.

## Guards against reading it wrong

- **Truncation.** Any cell with `completions/clipped_ratio` > 0 or `format_rate` < 1
  is void for accuracy, not interpreted. This is the confound that made a 0.69 look
  like a falsification of the bf16 finding; it was the token budget, not the model.
- **Throughput.** No step time from any of these runs means anything. Reserved memory
  crosses this card's physical total and Windows spills to shared memory — the peer's
  receipt shows the crossing step costing 117 s against a 14.4 s under-commit mean.
  Accuracy is unaffected, which is the only reason these arms are valid at all.
- **Population.** Each cell's `/health` records its own difficulty flags. The receipt
  says which population it measured; nothing is inferred from a launch string. This
  is the defect that invalidated six phases of this arc.
- **Generalisation.** These are four cells at one seed and one shape. Nothing here
  licenses a claim about the corpus at production scale.
