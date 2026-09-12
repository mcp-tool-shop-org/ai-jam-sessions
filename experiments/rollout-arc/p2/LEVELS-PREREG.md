# Preregistration — D0–D3 within-window confusability

**Written with the run at 33 of 64 steps. No reward has been read.**

## The question

Distance is dead as a difficulty lever: 1–3 gives 0.781 (too easy), 5–11 gives 0.000 and the
policy will not page to reach it under any condition tested. **The corpus's other axis has
never been measured on bf16** — `--limit` truncation drew D0 and D1 only, leaving D2 and D3
at n = 0 in every cell of the grid and the probe.

D0–D3 vary *within-window* confusability at distance 1–3, so the answer is always in the
first page and the policy never has to page:

| tier | distractor planted in the same 4-measure window |
|---|---|
| D0 | none — fillers share zero pitch classes with the target |
| D1 | a chord sharing **2 of 3** pitch classes |
| D2 | an **inversion of the target** — same pitch classes, different voicing |
| D3 | a **semitone-away** chord **plus** the inversion |

## Power — read this before any number

**16 cases per tier. Wilson half-width is ±0.245 at p ≈ 0.5 and ±0.196 at p ≈ 0.8.**
This run can detect a tier landing at 0.0 or 1.0, and a large monotone trend across four
tiers. **It cannot distinguish 0.60 from 0.75.** No single tier's rate is a result on its own.

## Pre-committed readings

**Reading A — the tiers work.** Non-degenerate rate rises materially from D0/D1 to D2/D3
*and* accuracy falls without reaching 0. Within-window confusability is a usable difficulty
axis, it does not require paging, and it is the lever to build on. The monotone shape across
four tiers matters more than any single value, since the trend has more power than the points.

**Reading B — immune to composition.** All four tiers return substantially the same accuracy
and non-degenerate rate. The policy's confidence on this vocabulary is unaffected by
inversions and near-misses, and the corpus has **no** working difficulty axis: distance is
dead, confusability is inert. That is the outcome that ends the "harden the corpus" line
entirely.

**Reading C — overshoot, and it is NOT a success.** D3 (or D2) collapses to ≈ 0.000 with zero
non-degenerate groups. Degenerate at the bottom is exactly as gradient-free as degenerate at
the top. Same trap named in the distance prereg, which distance then walked straight into.

**Reading D — non-monotone.** Tiers do not order as D0 ≥ D1 ≥ D2 ≥ D3. Then the tier labels
do not track difficulty for bf16, which is itself worth knowing — it would mean the D-levels
were designed against a model that no longer describes ours, the same defect as the 4-bit pin.

## Reported for every tier regardless of outcome

Accuracy, non-degenerate rate, *k*-of-2 spread, ρ, mean entropy split by group outcome, and
`grad_norm` on non-degenerate steps. **Entropy and grad_norm are the discriminators**, not
accuracy: `control-fixed` showed non-degenerate steps carrying `grad_norm` 14.3 and 1.14
against a degenerate median of 2.5e-14, so a tier producing even a few live groups is doing
something no rate alone shows.

## Guards

`dataset_rows` must equal 64 and the draw must be **16 per tier** — verified before launch:
`limit=32` returns `{D0:8, D1:8, D2:8, D3:8}`. Any cell with `clipped_ratio` > 0 is flagged
against its accuracy. No local step time is a throughput number.

**And the population caveat that has bitten this arc repeatedly:** these tiers come from one
seed at one shape. A tier difference here is a difference *in this corpus*, not a property of
the difficulty concept.
