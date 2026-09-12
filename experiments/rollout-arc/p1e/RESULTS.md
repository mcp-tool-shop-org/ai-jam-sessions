# P1e — kebab-parity, then the same D0–D3 sweep

**Date:** 2026-09-11 · **Spend:** $0 · **Bars:** unchanged. Pin: [pin.json](pin.json). Report: [report.json](report.json).
P1d receipts are left in place. P2 is still held.

Same family, same pin, same bars. The only change: `id = kebab(title)` with a `Synth …` title, so a Bethena-style lookup hits `synth-d0-study-aac` instead of inventing `quiet-study-aac`. Schema `jam-actions-synth-v0/1.1.0`, not registered.

You probably expect distractor density to pull pass@1 down into the band. The measurement says the opposite.

## Curve

| level | n | pass@1 | pass@8 | in-band raw | in-band after leak | guess pass@8 | leaks | GO? |
|---|---|---|---|---|---|---|---|---|
| D0 | 32 | 0.477 | 0.688 | 9 | **6** | 0.313 | 10 | no |
| D1 | 32 | 0.645 | 0.781 | 4 | **4** | 0.219 | 7 | no |
| D2 | 32 | 0.566 | 0.813 | 10 | **7** | 0.344 | 11 | no |
| D3 | 32 | 0.684 | 0.969 | 7 | **5** | 0.313 | 10 | no |

Need ≥ 10 leak-free in-band **and** pass@1 < 0.80 at any single level. None clear both. **NO-GO.**

P1d was 1 hit in 1024. P1e is **607 hits**. Tools now help (pass@8 0.69–0.97 vs guess 0.22–0.34). Kebab-parity was the confound. It was not enough to put a level in the band.

D3 is easier than D0 (pass@1 0.68 vs 0.48; 24/32 above the band). Distractor density did not grade difficulty. Most mass sits **above** the band once the song is findable. Filtering D2’s 10 raw in-band cases after looking would be the error this phase refused.

## Search

Mean tool turns 2.45. Histogram: 0×48, 2×570, 3×286, 4×87, 5×33. Same paging shape as P1c.

## Verdict

The lookup confound is gone. The family as specified still fails the frozen bars: no level has a leak-free in-band population of 10. P2 does not start.
