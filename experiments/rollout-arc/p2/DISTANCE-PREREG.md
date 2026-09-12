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

---

# VOID — and the amended rule (v2)

**The screen above is void. It ran 2 distinct prompts per cell, not 8.**

Found by reading the completions rather than the summary: all 16 completions in
`control` carry exactly **two** distinct prompts, each repeated four times. The
cause is in `train.py`, and it is the one line in the `--dry` block with no
explicit-flag guard:

```python
args.limit = args.limit or max(2, args.per_device_batch // max(1, args.num_generations) * 2)
```

Every other override in that block checks whether the caller asked for the value.
This one does not — it fires unless `--limit` was passed non-zero. At
`--per-device-batch 2 --num-generations 2` it evaluates to **2**, so `--steps 8`
cycled two rows four times and reported eight "groups."

**Why this matters more than the small n.** Eight groups over eight distinct
prompts is a weak measurement. Eight groups over *two* prompts is not a weak
measurement of difficulty — it is a measurement of two songs. The control cell's
tidy `acc 0.500` is one prompt answered right four times and one answered wrong
four times; the `0.000` non-degenerate rate is the same two answers repeating,
not a property of the population. No reading from the rule above can be applied.

**This is the arc's own failure class again**, in a third place: a number whose
population could not be read off the receipt. The `dataset_rows: 2` field was
sitting in `dry-run.json` the whole time and I wrote a prereg around "8 groups"
without checking it against the completions.

## Correction to the v1 header

The v1 header says the rule was written "before any reward from these arms was
read." That is **overstated and is corrected here rather than left standing.**
No parquet had been opened and treatment had produced nothing — both true, and
independently confirmed against file mtimes. But TRL logs `acc_joint` per step
to stdout, and I had read step 4's metrics line in the live log and quoted its
`acc_joint 0` before writing the rule. So v1 was **blind to treatment and
partially sighted on control.** A prereg that oversells its own blindness is
worth less than one that does not.

## v2 — what changes

1. **`--limit 32 --steps 32` on every cell.** 32 distinct prompts, 32 groups, 64
   completions per cell. `--limit` is now passed explicitly in the runner so the
   unguarded default can never fire again.
2. **Every cell's receipt must report `dataset_rows` equal to `--limit`**, and
   the distinct-prompt count in its parquets must equal it too. A cell failing
   that check is void before it is read. This is a harness check, not a result.
3. **A halt condition for the positive control**, which v1 lacked — raised by the
   peer before either of us had opened a cell. Readings 1–3 all compare treatment
   *against* control, and reading 3 requires control to have at most 1
   non-degenerate group, but nothing said what happens if control itself comes
   back wrong. That outcome is not a statement about distance at all; it means
   the premise is broken and all four cells measure something else.

   **Control must reproduce the abort's finding — at least 30 of 32 groups fully
   correct, at most 1 non-degenerate — or the screen is VOID and the next step is
   diagnosing the harness, not confirming at higher n.**

Readings 1–4, the truncation guard, the throughput guard and the population
guard from v1 carry forward unchanged, restated at n = 32: reading 1 becomes
64/64 correct in `treatment`, reading 2 becomes 0/64, reading 3 becomes at least
8 of 32 groups non-degenerate while control has at most 1.
