# Correction — both eval pools were mislabelled, and "memorisation" does not survive the direct test

**2026-09-13, found while answering a reviewer's question about expanding the held-out
pool.** It supersedes the reading in `HELDOUT-RESULTS.md` and the secondary reading in
`FOUR-ARM-RESULTS.md`. The primary outcome — reading 3, nothing flattens — is untouched.

---

## What the three pools actually are

| | songs | shape | overlap with the TRAINED songs |
|---|---|---|---|
| **trained on** — `fixtures/progressions-v1.json` | 32 | **8 bars, 6-8 named chords** | — |
| called "in-sample" — `spec-prompts-4bar-random.jsonl` | 32 | **4 chords** | **15 of 32** |
| called "held-out" — `spec-prompts-v2-holdout.jsonl` | 32 | **5 chords** | **9 of 32** |

**Neither label was right.**

The pool I called **in-sample** shares only **47%** of its songs with training, and even those
are at a different window with a different chord count. Arms did not see it 6.25 times; they
saw 8-bar progressions of 15 of its songs.

The pool I called **held-out** is **72%** unseen, not the 91% stated in `HELDOUT-PREREG.md`.
That "29 of 32, 3 overlap" figure came from comparing the holdout against **the other eval
pool** instead of against the training fixture. I checked the wrong reference set and wrote
the number into a preregistration.

## The consequence: the memorisation verdict was a between-pool inference

Reading 2 fired because B scored +11.1pp on pool 1 and +1.2pp on pool 2. That is a comparison
**between two pools that differ in chord count as well as in overlap**, so it cannot separate
"saw these songs" from "4 chords versus 5".

**Both pools contain trained and untrained songs**, so the claim is testable *within* each pool,
where chord count is held constant. `scripts/overlap-split.mts`, paired by item:

### Pool 1 (4 chords) — 15 trained songs, 17 untrained

| arm | lift on TRAINED songs | lift on UNTRAINED songs | gap |
|---|---|---|---|
| A stratified | +5.8pp [+0.9, +10.8] | **+7.0pp** [-4.5, +18.5] | **-1.2pp** |
| B heterogeneous | +12.1pp [+2.9, +21.3] | **+10.3pp** [-0.4, +21.0] | **+1.8pp** |
| C unforced | +3.3pp [-2.0, +8.7] | -2.6pp [-10.2, +5.1] | +5.9pp |
| D random reward | +2.1pp [-7.5, +11.7] | -1.8pp [-5.0, +1.3] | +3.9pp |

### Pool 2 (5 chords) — 9 trained songs, 23 untrained

| arm | lift on TRAINED songs | lift on UNTRAINED songs | gap |
|---|---|---|---|
| A stratified | +11.1pp [-5.5, +27.7] n=9 | +0.8pp [-2.3, +3.9] | +10.3pp |
| B heterogeneous | +2.1pp [-15.9, +20.1] n=9 | +0.8pp [-0.1, +1.7] | +1.3pp |
| C unforced | +5.6pp [-3.9, +15.0] n=9 | -1.4pp [-6.8, +4.1] | +6.9pp |
| D random reward | +2.1pp [-7.8, +12.0] n=9 | +0.5pp [-2.5, +3.6] | +1.5pp |

**Memorisation would put the lift on the trained-songs column and nothing on the other.
On pool 1 the lift is as large on untrained songs as on trained ones** — B +10.3pp against
+12.1pp, A +7.0pp against +5.8pp — while both controls sit at or below zero on untrained
songs. That is the opposite of a memorisation signature.

**Reading 2 is withdrawn.** It was inferred from a between-pool difference that conflates at
least two variables, and the within-pool test that isolates the variable in question does not
support it.

## What is NOT thereby established

The generalisation claim is **not** rescued by this. It is unresolved:

- B's untrained-song lift on pool 1 is **+10.3pp [-0.4, +21.0]** — it includes zero, barely.
- A's is **+7.0pp [-4.5, +18.5]** — comfortably includes zero.
- On pool 2, no arm shows anything on untrained songs: +0.8, +0.8, -1.4, +0.5.
- The pools differ in chord count (4 and 5) from each other and from training (6-8), and
  nothing here explains why a 4-chord pool would show transfer and a 5-chord pool would not.

n = 17 and n = 23 untrained items. The power analysis already said 32 items resolves nothing
below ~7pp; 17 and 23 resolve less.

## What was actually broken, and what fixes it

**The pool size was never the problem.** The problem is that **no eval pool was ever built at
the cell the arms trained on, split cleanly by whether the song was trained.** Every eval so
far has varied chord count and overlap at the same time.

The fix costs nothing and existed all along. `emit-progression-fixture.mts` built a pool of
**107** progressions at 8 bars, shuffled with `mulberry32(20260913)`, and took the **first 32**
as the training fixture. **The remaining 75 are the correct held-out set**: identical window,
identical shape, identical construction, and disjoint from training *by the slice itself*
rather than by set arithmetic that can be done against the wrong reference.

And the evaluation needs **no pod**. The four trained adapters are on disk and the training
card is on the desk; only training ever needed rented hardware.

Recorded because it is the general lesson: **`held-out` is a claim about a relationship between
two sets, and it must be checked against the set that was actually trained on.** Both times I
got this wrong, the number I checked against was the nearest file with a plausible name.
