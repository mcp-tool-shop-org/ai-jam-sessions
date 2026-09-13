# Preregistration — the voice-count sweep, and what counts as a pass

**Written with 3-voice at 22 of 32 and 2-voice not started. No full-sweep data exists.**

## Why the sweep exists

Every P4 measurement so far ran at **4 voices — SATB, the hardest setting counterpoint has.**
The nearest-tone heuristic on the same progressions moves 0.87 → 0.50 → 0.17 (common-practice)
as voices go 2 → 3 → 4, so voice count is a *purely musical* difficulty dial with large range.
Concluding "no musical task lands in band" from the 4-voice corner alone would be an inference,
not a measurement.

## The governing metric

**Non-degeneracy governs, not single-shot *p*.** GRPO's optimizer is fed only by groups with
`std > 0`; a population at *p* = 0.097 whose groups fracture is arithmetically operational,
while a saturated population at *p* = 0.9 is not. A strict `p >= 0.15` gate would exclude the
exact zone where the policy is on the cusp and has headroom.

## But the scalar is not sufficient — the k-distribution is part of the gate

A 1-of-8 split and a 4-of-8 split both satisfy `std > 0` and both count once toward
non-degeneracy. They are not the same signal. Under std-normalised advantage a 1-of-8 group
hands its single correct rollout **+2.65** and each of seven wrong ones **−0.38**: a *needle*
signal, and precisely the regime where the policy reinforces whatever else happened to sit in
that one lucky rollout, incidental token choices included. A 4-of-8 group carries the maximum
advantage mass and a balanced contrast.

**Pre-committed reading, written before the data:**

1. **PASS — graded.** Non-degeneracy in [0.125, 0.50] **and** the k-histogram shows density in
   the middle brackets (k ∈ [3, 5]), not only at k = 1 and k = 7. This is a trainable population.
2. **WEAK — needle-only.** Non-degeneracy in band but the splits sit almost entirely at k = 1
   (or k = 7). The model is throwing an occasional outlier into an otherwise monostable
   corridor. **This is the outcome I am most likely to want to round up into a pass, so it is
   written plainly: needle-only is NOT a pass**, and it gets reported as a negative result.
3. **FAIL — below band.** Non-degeneracy under 0.125 at every voice count. The axis is closed
   and the substrate search is closed with it for this model class.

## Guards

- 3-voice and 2-voice are scored with `VOICES` matching the prompt set; a mismatch voids the cell.
- The k-histogram is published beside every rate, never underneath it.
- 2 voices may overshoot into *top* degeneracy (the heuristic is at 0.87 there). If it does, that
  is a saturation finding and does not become a pass by being "closer to the band" than 4 voices.
- n = 32 groups per cell. The interval on a 0.3 non-degeneracy rate at n = 32 is roughly ±0.16 —
  wide. No cell is quoted as pinned.

---

# Replication addendum — written before the holdout run

**The measured cell:** 2 voices, `film-ambient`, *p* = 0.3438 [0.288, 0.404], non-degeneracy
15/32 = 0.469 [0.309, 0.636], k-histogram `0:13 1:3 2:4 3:1 5:2 6:3 7:2 8:4`.

**Why a fresh sampling seed alone would not be a replication.** P4's items are real library
songs, not a seeded corpus, so re-running the same 32 with a different `torch.manual_seed`
tests SAMPLER variance while holding the population fixed. Population variance is what killed
D1 (0.250 on a pilot → 0.065 on a fresh draw). This run therefore uses **disjoint items 33–64
of the 107 qualifying songs — zero overlap, verified — plus sampling seed 7.**

**Pre-committed readings:**

1. **REPLICATED.** Non-degeneracy point estimate stays **above 0.30** with density outside
   k = 1 (at least a third of splits at k ≥ 2). The substrate search is over.
2. **NOT REPLICATED.** Point estimate falls below 0.30, or the splits collapse to k = 1. The
   first cell was a favourable draw, exactly as D1's was. **Written plainly because it is the
   reading I would be most inclined to argue around: a drop below 0.30 means the cell does not
   hold, and no amount of "but the interval still overlaps" changes that.**
3. **OVERSHOOT.** *p* above 0.85 or non-degeneracy near zero from saturation — would mean the
   holdout songs are materially easier than the first 32, and the item pool is not homogeneous.

**Stated in advance, because it will be tempting to skip afterwards:** the nearest-tone
deterministic heuristic scores **30/30** at 2-voice film-ambient. A replicated cell means the
model can be TRAINED on a task an existing deterministic solver already solves perfectly. That
is a real strategic question — this repo's own recurring finding is that capability lives in the
verifier envelope, not the policy — and it is the director's call, not a measurement.

---

# Randomized-pool addendum — written before the run, and correcting my own design

**The flaw being fixed.** The holdout used a CONTIGUOUS index slice (items 33–64), and this
library is ordered by genre. Items 1–32 are classical 10 / jazz 10 / pop 9 / blues 3; items
33–64 are rock 10 / rnb 9 / soul 9 / blues 4. The "replication" therefore compared two different
musical populations, not two draws of one. Single-shot *p* moved 0.344 → 0.582 accordingly.
**That was my design error, not a property of the task**, and the prereg's own reading 3 had
named the diagnosis in advance without my noticing it applied to the slice I had chosen.

**What survived it anyway.** Non-degeneracy 0.469 → 0.500 and ρ 0.594 → 0.608, graded both
times. The gradient-yielding property held across a genre shift, which is a stronger robustness
statement than a same-population re-draw would have made. Single-shot *p* did not, and the
pool-wide rate remains unmeasured.

**This run.** A deterministic shuffle (mulberry32, seed 20260913) over the FULL 107-song pool,
first 32 taken. Genres: film 5, ragtime 5, jazz 4, rnb 3, pop 3, rock 3, classical 2, latin 2,
blues 2, soul 2, new-age 1 — eleven genres against the slices' three or four. Sampling seed 7.

**Pre-committed readings:**

1. **POOL-WIDE ESTIMATE STANDS.** Non-degeneracy above 0.30 with at least a third of splits at
   k ≥ 2. Single-shot *p* is reported as the pool figure and the two slice values are recorded
   as genre-conditional, never averaged into it.
2. **NOT A STABLE POPULATION.** Non-degeneracy below 0.30, or splits collapsing to k = 1.
   **Written plainly: this would mean both prior cells were draws, and the cell does not hold.
   The two earlier numbers agreeing would not rescue it — they were the same design error twice.**
3. **The k-distribution clause is itself unstable at n = 32.** 2-voice lead-sheet was needle-only
   on the first slice (7 of 9 splits at k = 1) and well-spread on the second. Whatever this run
   says about a cell's k-profile is a third sample of a volatile statistic, not a verdict.

**Not pre-committed, and stated so it cannot be claimed afterwards:** nothing in this run
measures the trainer path. Every P3 and P4 figure is single-turn `model.generate` through
transformers. The live GRPOTrainer adds a loss mask, a tool loop and a different sampling path,
and no measured branching statistic has ever been shown to survive into a training batch —
P2's training run aborted before producing one.
