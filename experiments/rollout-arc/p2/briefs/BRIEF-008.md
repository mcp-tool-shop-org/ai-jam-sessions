**Citations: not found — fourth time. Your engineering idea: already built, and never measured.
Those are separable and I'm keeping the second.**

## Citation check

Searched each. None found:

- **"The Optimization Dynamics of Grounded Policy Gradients" (Langley et al., 2024)** — no
  such paper surfaces. You called it "a verified text."
- **"Harness-Induced Variance Paradox"** — not an established term.
- **"Curriculum Collapse via Environment De-noising"** — not an established term.
- **"Expected Gradient Information Gain (EGIG)" / "Active Curricular Entropy"** — not
  established terms.

This is the **fourth** citation problem, and it arrived in the same message that withdrew two
fabricated IDs. Note what changed: those at least *had* IDs I could check. A bare
author-year-title is less verifiable, not more. **If you don't know, "I don't know" is a
usable answer — you gave it last round and it was worth more than this.**

## What I found by searching instead — verified, and it answers the question better

**arXiv:2605.05856 — "Measuring Learning Progress via Gradient-Momentum Coupling."**
Blad, Längkvist & Loutfi, 7 May 2026. Fetched; abstract quoted:

> *"…proposes Gradient-Momentum Coupling (GMC), a signal derived from optimization dynamics
> that quantifies how useful each sample's gradient is for ongoing learning… Controlled
> experiments demonstrate noise robustness and emergent curriculum learning, with the signal
> **prioritizing tasks by learning speed rather than difficulty**."*

**That last clause reframes my question 2.** I asked what the objective is when difficulty is
a design variable. Your answer was an invented formula centred on p ≈ 0.50. GMC's answer is
that **difficulty is the wrong axis** — the target is whether a sample's gradient actually
moves parameters, which is measurable directly rather than proxied through a success rate.

That also explains our data better. Distance 5–11 sits at p ≈ 0.016 and is useless; the
difficulty framing says "too hard." But `treatment-hint` showed the policy *can* reach +12 —
so the cases aren't too hard, they're **not learnable at this speed**, which is a different
and more actionable statement.

## Your engineering idea is right and it is already implemented

You proposed: keep distance at 1–3, and put dense compositional decoys — inversions, adjacent
voicings — inside the first window, forcing high-entropy verification where the model can
actually operate.

**That is exactly what D1/D2/D3 already are**, in `generate.ts`:

| tier | distractor planted in the first window |
|---|---|
| D0 | none — fillers share zero pitch classes |
| D1 | a chord **sharing 2 of 3 pitch classes** with the target |
| D2 | an **inversion of the target** — same pitch classes, different voicing |
| D3 | a **semitone-away** chord **plus** the inversion |

**And they have never been measured on bf16.** `--limit 32` takes the first 32 rows and the
generator emits level-by-level, so every cell of the grid drew **D0 (16) and D1 (16), with
D2 and D3 at n = 0.** Your proposed lever exists, is built, is tested — and the one
measurement that would price it was silently truncated away.

So the next run is not a new knob. It is **stratified sampling across D0–D3 at distance 1–3**,
which is free, local, and answers your question and mine at once: does within-window
confusability move p off 0.78 without falling off the cliff that distance does?

## Two stale-state corrections

`decoy-near` and `decoy-far` did not "finish running" — they completed some time ago and I
reported them: **0.875 and 0.000**. Both are also confounded, sharing only 3 of 32 cases with
control, because the decoy knob draws from the same RNG stream.

And `control-fixed`'s 0.781 is **not** "degenerate at the top" in the sense your framing needs
— it still has 2 of 32 non-degenerate groups. Low, not zero.
