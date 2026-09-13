# Addendum 3 — the matched-cell eval, preregistered before it runs

**2026-09-13, written before any generation against either new prompt file exists.**
Supersedes `HELDOUT-PREREG.md`, whose pools were mislabelled
(`CORRECTION-the-pools-were-mislabelled.md`).

## What is different this time

Every earlier eval varied **two things at once** — song overlap *and* chord count — against
arms trained on 8-bar, 6–8-chord progressions. Neither pool was built at the training cell
and neither label was checked against the training fixture.

Both pools here come from **one pool, one shuffle, two disjoint slices**:

| | fixture | slice | n | chords/item | overlap with training |
|---|---|---|---|---|---|
| **TRAINED** | `progressions-v1.json` | `[0, 32)` | 32 | 6–8 | by definition all |
| **HELD-OUT** | `progressions-heldout-v1.json` | `[32, 107)` | **75** | 4–8 | **0, verified** |

Same emitter, same `mulberry32(20260913)`, same 8-bar window. Disjointness is a property of
the slice, not of set arithmetic performed afterwards against a file with a plausible name.
Prompts are built by the bridge's own `vlCaseRow`, the same code path that built every
training prompt.

Unconditioned, G=16, temperature 1.0 / top_p 1.0 / top_k 0, `common-practice`, 2 voices,
max 384 new tokens, seed 7. Arms: **base, A stratified, B heterogeneous, C unforced**, from
the adapters already on disk. **Local 5090, $0** — only training ever needed a pod.

D (random reward) is dropped: it was a maximally active null on every measure and its job —
vetoing the `topFirst` movement — is done. Recorded so its absence is a choice, not a gap.

## Power

Measured paired sd is ~13pp per item. At **n = 75** the 95% half-width is ≈ **3.0pp**, against
≈ 6.4pp at n = 32. This resolves effects of about 3pp and up. It does **not** resolve 1–2pp,
and a null here still will not mean "no effect", only "nothing at or above ~3pp".

## Pre-committed readings

Lift = arm − base, paired by item, within each pool. Intervals are bootstrap 95% over items.

1. **GENERALISES.** At least one forced arm's **held-out** lift excludes zero, **and** the
   unforced control C's held-out lift does not. The capability transfers to unseen songs at
   the trained cell.
2. **MEMORISATION.** Both forced arms' **trained-pool** lifts exclude zero **and** both
   held-out lifts include zero with point estimates below **half** their trained-pool lift.
   The lift is about the 32 items and not about the task.
3. **NO EFFECT ANYWHERE.** No arm's trained-pool lift excludes zero. Then the in-sample
   result reported on the 4-chord pool was a property of that pool, and there is nothing to
   transfer in the first place.
4. **AMBIGUOUS.** Anything else — including a held-out lift that excludes zero for a forced
   arm *and* for C. Not a pass.

**Readings are per arm, and a split is reported as a split.** `HELDOUT-PREREG.md` wrote
pair-level verdicts, the arms split, and the document could not describe its own result. If A
and B disagree here, both are reported with their own intervals and no combined verdict is
manufactured.

**The arm-vs-arm test is run too**, not only arm-vs-base. Two arm-vs-base numbers that look
far apart are not a difference between arms, and that mistake has already been made once in
this arc.

## What this cannot do

It cannot revisit the **primary** outcome. Reading 3 of `PREFIX-PREREG-AMENDMENT.md` —
`top_first_measure_share` did not flatten, and the random-reward arm moved it more than either
treatment — stands and is not reopened. `topFirst` is reported on both pools as a secondary.

It cannot separate stratified from heterogeneous as *designs*: both arms saw identical item
exposure (6.25 draws, 50 rollouts per item), so a difference between them here would be about
group construction, but the arms were never distinguishable from each other on any pool so
far and n = 75 is unlikely to change that.

And whatever it returns, it is still **infrastructure validation, not musical capability** —
nearest-tone scores 32/32 on the trained pool for free.
