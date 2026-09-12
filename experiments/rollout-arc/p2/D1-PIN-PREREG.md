# Preregistration — the D1 precision pin

**Written before the pod is created. No D1-at-n=128 data exists.**

## What this is, and what it is not

At G=8 on 16 D1 cases, non-degenerate came back **0.250, 95% CI [0.073, 0.524]**. That
interval contains the learnability band's floor and its ceiling-ish; it establishes almost
nothing on its own. This run tightens it.

**It is a replication, not a re-measure.** Fresh seed **2026091205**, so these are **128 new
D1 cases**, not the same 16 with more samples. If 0.250 survives a different draw, it is a
property of the D1 *construction*. If it does not, the first number was the draw.

## Power

**n = 128 at G=8.** Wilson half-width at p ≈ 0.25 is **±0.075**. That separates "in the
[0.125, 0.50] band" from "below it" — which is the only question that matters here. It does
not pin 0.25 versus 0.30, and no such claim will be made.

## Pre-committed readings

1. **Confirmed trainable.** Non-degenerate lands in **[0.125, 0.50]** with the interval
   excluding 0.125. D1 is a stable trainable population for bf16 at production G, and the
   corpus question is answered.
2. **Below band.** Point estimate under 0.125, or an interval that cannot exclude it. The
   0.250 was a small-sample artifact, the same way my "1 in 64" was a group-size artifact.
   **This is the outcome I am most inclined to argue away, so it is written first in plain
   terms: below the band means D1 does not carry the arc.**
3. **Above 0.50.** Would mean accuracy sits near 0.5 and nearly every group splits. Not
   expected from the 0.719 accuracy already measured; if it happens, suspect the population,
   not the luck.

## Guards, unchanged and binding

- `dataset_rows` must equal **128**, distinct prompts **128**, and `/health` must echo
  `levels: ["D1"]`. Any mismatch voids the cell before its rewards are read.
- `clipped_ratio` > 0 flags the cell against accuracy.
- No pod step time is quoted as a rig figure, and no rig step time is a throughput number.
- **Pod is terminated immediately on fetch**, dead-man armed before launch.

## Stated in advance because it will be tempting afterwards

A confirmed D1 population **does not** mean the arc's original claims are restored. The
27.1% and 32.0% were measured on a 4-bit model and stay void. This would be a **new**
measurement of a **new** population on the **right** artifact — not a rehabilitation of the
old numbers, and it must not be written up as one.
