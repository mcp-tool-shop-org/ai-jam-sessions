# Preregistration — common-practice at 4 bars, G=16

**Written before the run. No 4-bar or G=16 data exists.**

## Why this cell, and why the previous recommendation was wrong

I recommended `film-ambient` because it had headroom (*p* 0.449 against common-practice's
0.160). **That recommendation violated my own gate 3.** Under film-ambient, `overlap`
accounts for **168 of 168** failures — the trainable task is collision avoidance, not
part-writing. I named that fact and kept recommending the cell anyway because the number
looked better. An external reviewer called it "gate 3 masquerading as gate 2" and that is
exactly what it was.

**common-practice is the honest target**: it relaxes nothing, so the difficulty is the full
chorale rulebook — parallels, hidden fifths, tendency-tone resolution, overlap, leap. Its
problem is that *p* = 0.160 [0.120, 0.210] has a lower bound under the 0.15 floor, and
non-degeneracy 0.250 at ρ 0.639 is ~1.4 effective draws of 8.

## The two mechanisms, and why neither relaxes the bar

**G = 8 → 16.** Changes nothing about the task, the prompt, the policy or the gate. At fixed
ρ, non-degeneracy is a function of G — the D1 mechanism, where G=2 gave 1/64 splits and G=8
gave 7/64 on *identical cases*. More draws, same population.

**8 bars → 4 bars.** Fewer transitions, so fewer opportunities to violate. **This raises *p*
by reducing exposure, not by relaxing standards: every surviving bar is judged by exactly the
same rulebook.** Stated here so it cannot later be claimed as gate-softening. Pool at 4 bars
with all four measures named: **55 songs**, ample for a 32-item draw.

**Rejected: raising temperature.** It would force splits, but it changes the policy's output
distribution — so the *p* measured afterwards is not the *p* that was characterised. Moving
the thing being measured while claiming the measurement held is the same error as relaxing
the gate, relocated.

## The funnel — this run must report it, not just the split rate

The randomized 8-bar film-ambient cell hid a defect the top-line numbers could not show:
among 115 passing completions, **80% opened on the identical `[0,1]` voicing**, and passers
were *less* diverse than failures (60% vs 77% unique signatures). A *p* can be arithmetically
true and practically useless if the model has found one crack in the verifier.

**Therefore every reading below is conditional on diversity, and the run reports
within-group uniqueness and the first-measure voicing distribution of passers alongside the
k-histogram.**

## Pre-committed readings

1. **TRAINABLE.** Non-degeneracy above 0.50 with density outside k=1, **AND** the funnel
   breaks — top first-measure choice below 50% of passers.
2. **SPLIT BUT COLLAPSED.** Non-degeneracy rises but `[0,1]` still takes >70% of passers.
   The model found a trick, not a representation of harmony. **Written plainly because it is
   the outcome I will be most tempted to report as a win: a split rate achieved by one
   dominant strategy is NOT a pass, and gate 3 fails on it.**
3. **BELOW BAND.** Non-degeneracy still under 0.25. The curriculum did not buy enough, and
   common-practice at this model size is not trainable without a different lever.

## Guards

- `voices = 2`, `bars = 4`, `style = common-practice`, `G = 16`, n = 32 items.
- The k-histogram is over **16**, not 8 — non-degeneracy at G=16 is NOT comparable to the
  G=8 figures without recomputation, and must never be quoted beside them unqualified.
- Population drawn by the same mulberry32 shuffle over the full pool; not a contiguous slice.
  The library is genre-ordered and a contiguous slice is a genre block.
- n = 32 at a 0.5 rate carries roughly ±0.17. No cell is quoted as pinned.

## Stated in advance

A pass here does **not** make the policy musically capable. The nearest-tone heuristic solves
the 8-bar film-ambient pool 32/32 for free, and no measurement in this arc has shown the
policy beating a deterministic solver at anything. What a pass would establish is that the
**reward landscape is dense enough to teach a known-solvable capability** — which is the
honest reason to run a training job at all.
