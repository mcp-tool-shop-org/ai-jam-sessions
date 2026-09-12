# D0–D3 within-window confusability — result

**Rule:** [`LEVELS-PREREG.md`](LEVELS-PREREG.md), committed at 33 of 64 before any reward was
read. **Outcome: reading D (non-monotone) on the tiers, and reading B on the thing that
matters.**

## Guards — all clean

`dataset_rows` **64**, distinct prompts **64**, draw exactly **16 per tier**,
`clipped_ratio` **0.00 on all 64 steps**, completions 37–154 against a 1024 budget. The
stratification fix is verified working: no tier is missing, unlike every prior cell.

## The tiers do not order by difficulty

| tier | distractor in the window | accuracy | non-degenerate | *k*-of-2 spread |
|---|---|---|---|---|
| D0 | none | 0.938 | 0.000 | 15 both-right, 1 both-wrong |
| **D1** | chord sharing **2 of 3** pitch classes | **0.625** | 0.000 | 10 both-right, **6 both-wrong** |
| D2 | **inversion of the target** | 0.938 | 0.000 | 15 both-right, 1 both-wrong |
| D3 | **semitone-away + inversion** | **0.969** | 0.062 | 15 both-right, 1 split |

**The tier built to be hardest is the easiest.** D3 (0.969) beats D0 (0.938), and D1 — the
*mildest* distractor — is the only tier that moves accuracy at all.

## Why: the gold check removes exactly the hard cases from D2 and D3

D2 plants an **inversion of the target chord**: same pitch classes, different voicing. If the
two chord engines recognise that inversion as the target, then the *inversion* becomes the
first match at-or-after the bound — gold moves — and the generator drops the case.

So the construction-time check that keeps gold well-defined **systematically filters out every
case where the inversion is confusable.** Verified directly across all 128 cases at this seed:

    cases where a NON-gold measure in the window re-derives to the target chord:
      D0: 0/32    D1: 0/32    D2: 0/32    D3: 0/32

**Zero, in every tier, by construction.** D2 and D3 are not inversion-distractor tiers in
practice — they are D0 with extra notes in the window.

D1 survives the filter for the opposite reason: its distractor is a **different chord** that
merely shares pitch classes, so it never competes for gold and never gets dropped. **D1 is the
only tier whose distractor actually functions**, which is exactly why it is the only tier that
moves accuracy.

## The finding that outranks all of it

**Across all 64 groups: 8 both-wrong, 1 split, 55 both-right. One non-degenerate group in 64.**

Difficulty *is* controllable — D1 moves accuracy from 0.938 to 0.625, a real and large effect.
**But it moves cases from "both right" to "both wrong". It never moves them to "split".**

| tier | mean entropy | max `grad_norm` |
|---|---|---|
| D0 | 3.07e-3 | 1.69e-07 |
| D1 | 8.13e-3 | 1.57e-03 |
| D2 | 9.38e-3 | 4.85e-09 |
| D3 | 5.76e-3 | **6.30e-01** |

Three of four tiers produce gradients between 1e-9 and 1e-3 — arithmetically nothing. The one
real gradient in the entire run, 0.63, comes from the single split group.

## What this settles for the arc

**The binding constraint is not task difficulty. It is that the policy does not disagree with
itself on a given case.** It is bimodal per case — confidently right or confidently wrong —
and neither axis the corpus offers breaks that:

- **distance** goes 0.781 → 0.000 with nothing in between, and the policy will not page
  regardless of turns, tokens, or being told the window size
- **within-window confusability** moves accuracy where it functions at all (D1), and produces
  **zero** additional splits

**"Harden the corpus" is finished as a strategy.** Both of its axes are now measured on bf16
with clean guards, and neither produces the disagreement GRPO needs. A harder corpus moves
groups from degenerate-at-the-top to degenerate-at-the-bottom, which is what distance 5–11
already demonstrated at n=64.

**Caveat, stated because this arc has been bitten by it repeatedly:** one seed, one shape,
16 per tier (±0.245 at p≈0.5). The *non-monotonicity* and the *1-in-64 split rate* are large
enough to read at this n. The individual tier rates are not.
