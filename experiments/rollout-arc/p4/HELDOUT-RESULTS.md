# Held-out — reading 2, MEMORISATION. The secondary finding does not survive.

**2026-09-13, same pod, 29 of 32 items never trained on.** Readings were fixed in
`HELDOUT-PREREG.md` before any held-out generation existed. They are applied here as
written.

---

## The numbers, paired by item

Pairing is by **item**, which is the unit of independence: base and every arm were
evaluated on the same 32 items, so item difficulty is common to both sides and cancels.
n = **32**, not 512. Intervals are a paired-t and a 10k bootstrap over items.

**IN-SAMPLE** (the eval pool *is* the training pool), base 0.3887:

| arm | lift | paired t 95% | bootstrap 95% | items +/-/= | prereg |
|---|---|---|---|---|---|
| A stratified | **+6.4pp** | [+0.2, +12.6] | [+0.8, +12.3] | 14/3/15 | clears, **excludes 0** |
| B heterogeneous | **+11.1pp** | [+4.4, +17.9] | [+5.3, +17.8] | 15/1/16 | clears, **excludes 0** |
| C unforced | +0.2pp | [-4.4, +4.8] | [-4.5, +4.5] | 7/6/19 | within control band |
| D random reward | +0.0pp | [-4.5, +4.5] | [-4.3, +4.5] | 7/9/16 | within control band |

**HELD-OUT**, base 0.1680:

| arm | lift | paired t 95% | bootstrap 95% | items +/-/= | prereg |
|---|---|---|---|---|---|
| A stratified | **+3.7pp** | [-1.1, +8.5] | [-0.6, +8.6] | 9/2/21 | clears +3.2pp, **INCLUDES 0** |
| B heterogeneous | **+1.2pp** | [-3.2, +5.5] | [-3.3, +5.1] | 6/1/25 | **MISSES +5.6pp**, includes 0 |
| C unforced | +0.6pp | [-4.0, +5.2] | [-3.7, +5.1] | 4/4/24 | within control band |
| D random reward | +1.0pp | [-2.2, +4.2] | [-2.0, +4.1] | 5/4/23 | within control band |

## The reading

Reading 1 (GENERALISES) required **both** forced arms to clear half their in-sample lift.
A clears; **B misses by a factor of four**. Reading 1 does not fire.

Reading 2 (MEMORISATION) fires when *either* forced arm's held-out lift is <= 0 **or is not
distinguishable from C and D**. **B's +1.2pp sits between C's +0.6pp and D's +1.0pp.** It is
not distinguishable from the controls by any reading of those three numbers.

**Reading 2 fires. The secondary finding does not survive.**

The preregistration anticipated the argument that would be made here and refused it in
advance: *"the arms still differ in-sample, and 'but the controls were null in-sample' is
not a defence of a held-out null."* That still holds.

## What each arm actually did, without rescuing anything

**B collapsed completely.** +11.1pp in-sample, +1.2pp held-out — 89% of the effect gone,
and what remains is inside the control band. B trained on 32 items at `prompt_repeats`
**6.25**: it saw every eval item six times. That is what memorisation looks like and there
is no other reading of it.

**A retained about 58% of its lift and still cannot be called real.** +6.4pp in-sample,
+3.7pp held-out. It clears its preregistered +3.2pp bar and its item record is 9 better
against 2 worse. But **the interval includes zero** — [-0.6, +8.6] bootstrap — so at n = 32
items the honest statement is that A's result is *consistent with partial generalisation and
equally consistent with nothing*. It is a point estimate, not a finding. Clearing an
effect-size threshold and excluding zero are different claims, and only the second is about
whether an effect exists.

A trained at `prompt_repeats` **0.39** — it drew 200 of 512 (item, opening) rows, each at
most once. **It could not memorise a row.** That is a mechanism consistent with the numbers,
and it was written down in `PREFIX-PREREG-AMENDMENT.md` §4 *before* the run ("B and C revisit
32 items many times, A draws from 512 rows... that difference IS the design difference; it
is reported, not corrected"), so it is not a story fitted after the fact.

**It is still confounded, and that is the important part.** A differs from B in **two** ways
at once: group construction (stratified vs heterogeneous) *and* effective repetition over
distinct contexts (0.39 vs 6.25). Nothing here separates them. If A's effect is real, it
could be entirely the low repetition and nothing to do with stratification. The arm that
would disentangle it — heterogeneous at matched low repetition, e.g. over an expanded item
pool — was not run.

## `top_first_measure_share` on the held-out pool

base **0.988**, A **1.000**, B **0.989**. The primary outcome is untouched by any of this
and was never in question here: the peak did not flatten on the trained pool and it is, if
anything, tighter on an unseen one. A held-out pool is a different cell (5 named chords
against 4), so these are not comparable to the 0.889/0.841/0.848 in-sample figures and no
comparison across pools is made.

## A flaw in my own preregistration

**The readings were written as pair-level verdicts and the data split.** Reading 1 needs
both forced arms to clear; reading 2 triggers on either arm failing. A cleared and B failed,
so reading 2 fires on B's behalf while A's own number sits above its own bar — a state the
document did not contemplate and therefore describes awkwardly.

The verdict is unaffected: reading 2's trigger is explicit and it is met. But a
preregistration that assumes two arms will behave alike is under-specified, and next time
the readings should be **per-arm**, with a separate rule for what a split means.

## Receipts

`scripts/paired-readout.mts` (the paired statistic) · `scripts/heldout-readout.mts` (the
unpaired one, kept because the comparison is instructive — see below) ·
`runs/held-{base,A,B,C,D}.jsonl` · `runs/summary-held-*.json`

**A note on the statistic, because getting it wrong in either direction was easy.** Treating
512 completions as 512 independent draws makes every interval about 3.5x too narrow at
rho 0.62-0.74. Correcting that with a design effect and comparing two *independent* samples
gives n_eff ~ 45 and intervals of +/-20pp, which would declare every result here — including
B's in-sample +11.1pp — indistinguishable from nothing. Both are wrong. The evals are
**paired on the same items**, so the item-level difference is the statistic and the
clustering that drives rho never enters. `heldout-readout.mts` computes the over-conservative
unpaired version and is kept alongside so the difference is visible rather than asserted.
