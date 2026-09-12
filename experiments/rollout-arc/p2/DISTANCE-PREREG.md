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

---

# Amendment v3 — read accuracy, not degeneracy

**Written with `control` at 13 of 32 steps and the other three cells not started.
No grid reward has been read.** Prompted by the peer recovering the abort run's
actual metric rows, which contradict the abort receipt's headline and expose a
confound in the v1/v2 reading rules.

## What the abort log actually shows

`artifacts/train-abort.log` from line 7404 (the `1024 training rows` block), ten
logged steps, `clipped_ratio` 0 on all ten so this is not the truncation confound:

| step | acc_joint | frac_reward_zero_std | grad_norm | entropy |
|---|---|---|---|---|
| 1 | 1 | 1 | 0 | 2.9e-4 |
| **2** | **0.625** | **0** | **4.616** | 6.6e-3 |
| 3 | 1 | 1 | 5.5e-6 | 6.0e-2 |
| 4 | 1 | 1 | 1.2e-11 | 3.2e-4 |
| **5** | **0.5** | **0** | **0.986** | 8.9e-3 |
| 6–10 | 1 | 1 | 1e-7 … 3e-13 | ~3e-4 |

**Two of ten steps were non-degenerate with real gradients.** Mean
`frac_reward_zero_std` is **0.80, not 1.0**. TRAIN-ABORT.md's "1.0 sustained",
"sat at 1.0 from the first logged step" and "zero gradient on every step" are
wrong and are mine to correct.

**The abort itself is untouched** — eight of ten steps dead with gradients at
1e-11 to 1e-13 and entropy ~3e-4. Killing 600 steps of that was right.

## The claim that does not survive

Observed non-degenerate rate 2/10 = 0.200. Exact 95% intervals on every bf16
measurement we have:

| measurement | rate | 95% CI | contains the 0.271 gate figure? |
|---|---|---|---|
| abort run, n=10 | 0.200 | [0.025, 0.556] | **yes** |
| peer local, n=6 | 0.000 | [0.000, 0.459] | **yes** |
| my bf16-check, n=8 | 0.125 | [0.003, 0.527] | **yes** |

**Not one of them distinguishes bf16 from the 27.1% the arc gated on.** So
"every difficulty rate in this arc describes the wrong artifact" is overstated.
What the data supports is *bf16 is much stronger than q4, and most groups are
degenerate* — a methodology failure, not a demonstrated difficulty collapse.

## Two confounds that change how this grid must be read

**1. Generations. The grid runs `num_generations` 2; production and the abort run
use 8.** Non-degeneracy is not a property of the task alone —
P(degenerate) = *p*^G + (1−*p*)^G. At *p* = 0.90 that is 0.82 at G=2 and 0.43 at
G=8. **A non-degenerate rate measured at G=2 is not comparable to the 27.1% gate
figure, to the abort run's 2/10, or to the learnability band.** The v1 and v2
rules compared them anyway. That was wrong.

**Per-completion accuracy *p* is the G-invariant quantity.** So:

> **Read each cell on accuracy. Derive expected degeneracy at G=8 from it; never
> compare this grid's raw non-degenerate rate to a G=8 figure.**

Readings 1 and 2 (64/64 and 0/64) are accuracy statements and stand unchanged.
Reading 3 is restated: **treatment is a lever if its accuracy is materially below
control's**, with the degeneracy consequence computed from *p*, not measured
directly.

**2. Entropy. Degeneracy here may be driven by near-deterministic sampling rather
than by task difficulty.** Entropy is ~3e-4 on every degenerate step and 30x
higher (6.6e-3, 8.9e-3, 6.0e-2) on all three steps with a real gradient. At that
entropy, eight samples are eight copies, and **a group collapses regardless of how
hard the task is** — a harder corpus would produce all-wrong groups, which carry
exactly as little gradient as all-right ones. The trainer never sets
`temperature`; it takes TRL's default. **Entropy per cell is therefore recorded
and reported alongside accuracy, and no difficulty conclusion may be drawn from a
cell whose entropy is ~1e-4 without saying that sampling, not difficulty, may be
the binding constraint.**

## What this grid can no longer claim to settle

At n=32 the Wilson half-width on a rate near 0.235 is ±0.147. **This grid cannot
resolve 0.20 from 0.271.** Separating those needs n in the hundreds (±0.052 at
n=256). The grid answers the *distance and bound* questions it was built for. It
does not answer "is the pinned population already trainable for bf16", and must
not be reported as if it does.

## v3 addendum — the sampler hypothesis is dead; entropy becomes the diagnostic

**Written with `control` at 21 of 32 and the other three cells not started.**

The v3 section above floated that "sampling, not difficulty, may be the binding
constraint." **That is withdrawn.** Read directly off the installed
`GRPOConfig` (TRL 1.13.0):

| | default | set in train.py? |
|---|---|---|
| `temperature` | 1.0 | no |
| `top_p` | 1.0 | no |
| `top_k` | 0 (disabled) | no |
| `min_p` | None | no |
| `repetition_penalty` | 1.0 | no |

**There is no diversity suppression anywhere in the path.** The sampler draws
from the model's raw, untruncated distribution. So entropy ~3e-4 is not a
conservative sampler — it is the model's own output distribution being nearly a
point mass on those inputs. There is no sampler to have been measuring.

**And the data runs against the inference I drew from it.** I framed the
collapse as happening "regardless of task difficulty," which would make
difficulty the wrong lever. But entropy moved *with* the thing I called
irrelevant: 3e-4 on the eight degenerate steps, 6.6e-3 / 8.9e-3 / 6.0e-2 on the
three that produced a gradient — 30× to 200× higher, exactly where the group
disagreed. That is entropy **tracking** difficulty, not masking it, and it is
evidence *for* the difficulty knobs rather than against them. Caveat, stated with
it: a correlation over ten steps, three of them. Suggestive, not established. The
clean test is entropy per *case* against that case's difficulty, not per step.

**Raising `temperature` above 1.0 is therefore off the table as a fix**, and not
merely as unnecessary. Above the model's own distribution you manufacture
disagreement rather than reveal it, which trains the policy to avoid randomly
induced errors — not the capability we want, and adjacent to lock §6's
spurious-reward concern. If diversity is ever the lever it gets argued on its own
terms.

### What survives, and what the grid now tests

One piece of the worry stands and is not ruled out by anything above:
**confidently wrong.** If a harder case makes the model confidently *incorrect*,
entropy stays low, all samples agree on a wrong answer, and the group is
degenerate at zero — carrying exactly as little gradient as an all-right group.
None of the three gradient-producing steps shows this (all were partial, acc
0.5–0.625), but nothing observed rules it out either.

**So entropy is the diagnostic that separates the two hypotheses, and the
treatment cell is the test:**

| treatment shows | reading |
|---|---|
| accuracy down, **entropy up**, groups disagree | the knobs work — difficulty produces genuine uncertainty |
| accuracy down, **entropy flat at ~1e-4**, groups agree on wrong answers | **overshoot into confident wrongness** — reading 2, not a success |
| accuracy unchanged, entropy unchanged | distance is decoration — reading 1 |

This is pre-committed: **entropy per cell is reported beside accuracy, and the
middle row is a failure even though its accuracy looks like progress.**

## v3 addendum 2 — the rollouts are correlated, and it is not the sampler

**Written with `control` at 25 of 32 and the other three cells not started.**

An external review proposed that entropy collapse is the binding constraint and
that the fix is setting `temperature` to 0.7–0.9. **The mechanism is real and now
has hard evidence; the proposed fix is backwards and the arithmetic behind it
rests on a category error.**

### The category error

The review computed degeneracy as *p*^G + (1−*p*)^G with **p = 0.271**, calling
0.271 "measured base accuracy." It is not an accuracy. `groups-probe.sh:10` and
lock §84 both define it as a **group-level non-degenerate rate** — the fraction of
prompt groups whose rollouts disagreed. Feeding a group rate into a per-sample
formula is a type mismatch, and the "8.2% mathematical floor" it produced is void.

**Measured per-completion accuracy for bf16 is p = 0.9125** (mean `acc_joint`
over the abort run's ten logged steps). The floors that follow:

| | binomial floor | observed |
|---|---|---|
| G=8 | 0.481 degenerate | **0.800** |
| G=2 | 0.840 degenerate | — |

So the excess over the independence floor is **0.319**, not the 0.72 the review's
figure implies. The direction is right; the magnitude is not.

### The evidence that the rollouts are correlated

Stronger than the rate itself. Per-step `acc_joint` at G=8, as *k* of 8 correct:

`8, 5, 8, 8, 4, 8, 8, 8, 8, 8`

Under independent sampling at *p* = 0.9125 the most likely **non-perfect** outcome
is 7 of 8, at probability 0.369. **It occurred zero times in ten steps** —
P(zero) = 0.010. Nor did 6 of 8 (p = 0.124). The only non-perfect outcomes were
5/8 and 4/8, whose independent probabilities are 0.024 and 0.003.

Groups are not "eight draws, most of them right." They are **a few distinct
trajectories, each replicated** — 8×1, or 5+3, or 4+4. That is a direct
observation, not an inference from an aggregate rate.

### Why the proposed fix is backwards

`temperature` is **already 1.0**, with `top_p` 1.0, `top_k` disabled and
`min_p` None (verified against the installed `GRPOConfig`; `train.py` sets none
of them). Sampling is already from the raw, untruncated distribution.

**Setting temperature to 0.7 or 0.9 would sharpen the distribution and make
collapse worse, not better.** Only a value *above* 1.0 increases diversity — and
that is the option already ruled out above, because manufacturing disagreement
above the model's own distribution trains the policy against randomly induced
errors (lock §6). `do_sample` is not a lever here; TRL's GRPO always samples.

To answer the review's direct question: yes, there is a path —
`GRPOConfig.generation_kwargs` exists and is `None`, unset by `train.py`. The path
is open. It is the *direction* that is wrong, so **no pod spend is authorised for
this sweep as specified.**

### What this does to the difficulty question — unresolved, both ways

This does **not** restore "sampling, not difficulty, is the constraint." There is
no sampler restriction to relieve; the peakedness is the model's own, and the
peakedness is *input-dependent*. Both readings survive and the treatment cell
still separates them:

- The two steps that broke into 5/8 and 4/8 are the two with entropy 30–200×
  higher. On those inputs the model **did** produce varied trajectories — evidence
  that a harder case can generate genuine disagreement, which is the knobs working.
- Equally, a harder case the model is confidently *wrong* about would give 8×1
  at zero reward. Still not ruled out.

Unchanged: **read cells on accuracy, report entropy beside it, and treat
"accuracy down with entropy flat" as a failure.** The *k*-of-8 spread is added to
what each cell reports, since it distinguishes replication from independent error
more sharply than any rate does.
