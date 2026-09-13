# The matched-cell run — forcing does nothing, the verifier does something, the prior does not move

**2026-09-13. Local RTX 5090, $0** — the four adapters were already on disk and only training
ever needed rented hardware. Readings fixed in `MATCHED-CELL-PREREG.md` before any generation
existed.

Both pools come from one 107-progression pool, one shuffle (`mulberry32(20260913)`), one 8-bar
window: **trained = slice [0,32)**, **held-out = slice [32,107)**, overlap **0**, verified.
Prompts for both built by the bridge's own `vlCaseRow`. Unconditioned, G=16, seed 7.

---

## Held-out pool — 75 songs never trained on, same cell

base pass **0.1117**. Paired by item, bootstrap 95%.

| arm vs base | lift | 95% | items +/- | |
|---|---|---|---|---|
| A stratified | +2.8pp | [+1.1, +5.0] | 17/3 | **excludes 0** |
| B heterogeneous | +3.8pp | [+1.2, +7.1] | 16/5 | **excludes 0** |
| C unforced | +2.0pp | [+0.5, +3.8] | 13/4 | **excludes 0** |
| **D random reward** | **+0.3pp** | **[-1.3, +1.8]** | 12/6 | **includes 0** |

| arm vs arm | difference | 95% | |
|---|---|---|---|
| A - B | -0.9pp | [-3.7, +1.5] | not distinguishable |
| A - C | +0.8pp | [-1.4, +3.2] | not distinguishable |
| B - C | +1.8pp | [-1.1, +4.8] | not distinguishable |
| **D - B** | **-3.4pp** | **[-6.8, -0.6]** | **DISTINGUISHABLE** |
| D - C | -1.7pp | [-4.1, +0.5] | not distinguishable |

## Trained pool — the 32 items the arms trained on

base pass **0.1602**.

| arm vs base | lift | 95% | |
|---|---|---|---|
| A stratified | +7.2pp | [+1.2, +14.6] | excludes 0 |
| B heterogeneous | +8.8pp | [+2.7, +15.4] | excludes 0 |
| C unforced | +8.2pp | [+1.2, +15.4] | excludes 0 |
| **D random reward** | **+1.6pp** | **[-2.1, +5.5]** | **includes 0** |

Arm-vs-arm: A-B, A-C, B-C all **not distinguishable**. **D - C = -6.6pp [-13.1, -0.8],
DISTINGUISHABLE.** D - B = -7.2pp [-15.4, +0.4], not — the point estimates are the same size
and n=32 simply buys wider intervals than n=75.

---

## Three findings, in order of how much they cost to get

### 1. Prefix forcing contributes nothing measurable

A - C is **+0.8pp [-1.4, +3.2]** held-out and **-1.0pp** on the trained pool. B - C is
**+1.8pp [-1.1, +4.8]** and **+0.6pp**. Not distinguishable anywhere, on either pool, in
either direction.

**The exploring-starts scaffold — the intervention this entire arc was built to test — does
not beat plain GRPO.** `MATCHED-CELL-PREREG.md` reading **4** fires, and it named this exact
case in advance: *"including a held-out lift that excludes zero for a forced arm and for C.
Not a pass."*

This did not survive because the preregistration was generous to it. It was written when C
was believed to be a null anchor, and the run falsified that premise on its first table.

### 2. The verifier is doing real work, and noise does not reproduce it

**D took 198 effective updates against B's 111** — random binary rewards split a group of 8
almost every time (`frac_reward_zero_std` 0.010), so D is the arm with the *most* gradient
steps and all of them noise. It is the adversarial case for the drift explanation.

**D is flat on both pools**: +0.3pp [-1.3, +1.8] held-out, +1.6pp [-2.1, +5.5] trained. Every
real-reward arm beats it in point estimate on both pools, and two of the four real-vs-random
comparisons exclude zero — including **D - B held-out at -3.4pp [-6.8, -0.6]**, which is the
clean one-knob test: same heterogeneous forcing, reward is the only thing that differs.

**What this supports: 198 updates of noise at this seed on this cell did not produce the
lift.** It does not make the verifier "definitively" the cause — a random binary reward also
has a different *distribution* (mean ~0.5 against the real reward's 0.11-0.25), so D's
optimiser chases a differently-shaped target, not merely a scrambled one. The statement the
arm can carry is that **drift is not the explanation**.

### 3. The improvement transfers, and it is small

2.0-3.8pp on **75 songs never trained on**, intervals excluding zero, 13-17 items better
against 3-5 worse. In-sample 7-9pp attenuates to roughly a third.

**Which gates move, counted from the bridge's own verdicts** (`scripts/failure-modes.mts`,
held-out pool, failing gates per 100 completions, 1200 completions per arm):

| rule | base | A | B | C | **D** |
|---|---|---|---|---|---|
| `tendencySeventh` | 65.3 | **54.7** | 58.7 | 61.1 | **63.1** |
| `hidden` | 53.6 | 49.1 | **46.8** | 54.6 | **53.1** |
| `overlap` | 51.3 | 51.3 | 51.8 | 50.3 | 52.3 |
| `leap` | 23.6 | 20.7 | 22.0 | **20.4** | **23.1** |
| `tendencyLeadingTone` | 12.1 | 11.6 | 12.9 | 12.3 | 10.9 |
| `parallels` | 6.4 | 5.9 | 5.7 | 6.5 | 9.1 |
| **pass rate** | **11.2** | **14.0** | **14.9** | **13.2** | **11.5** |

The gain is spread across `tendencySeventh`, `hidden` and `leap` rather than concentrated in
one gate — the broader claim, not the film-ambient single-rule artifact. **And D barely moves
any gate** (`tendencySeventh` 63.1 against base 65.3, `leap` 23.1 against 23.6), which is the
same conclusion as its flat pass rate arriving through a different measurement.

Worth noting without a story attached: the dominant failure gate differs by pool —
`tendencySeventh` held-out (65.3) against `hidden` on the trained pool (58.4) — and the arms
reduce different gates from each other. Three arms, three profiles, one indistinguishable
pass rate.

**And the ceiling on that claim is low.** One task, one model, **one seed** — all four arms
ran seed 7 and no replication was attempted. A single-seed RL result is exactly the kind that
fails to reproduce. The honest form is: *the substrate is trainable and the effect transfers
on this cell at this seed.*

---

## What the arc set out to show, and what it showed

| | |
|---|---|
| **hypothesis** | exploring starts flatten the typicality prior and unlock a capability plain GRPO cannot reach |
| **prior did not flatten** | `top_first_measure_share` 0.889 base -> 0.841 / 0.848 / 0.820, and the **random-reward arm moved it 0.060 — more than either treatment** |
| **forcing unlocked nothing** | A - C and B - C not distinguishable on either pool |
| **plain GRPO did work** | C: +8.2pp trained, +2.0pp held-out, both excluding zero |
| **noise did not** | D: +1.6pp and +0.3pp, both including zero, on 198 effective updates |
| **value against free code** | nearest-tone scores **32/32** on the trained pool |

The policy still opens on `[0,1]` almost every time. It got a few points better at surviving
the rest of the rulebook, on a task a deterministic heuristic already solves perfectly.

## Receipts

`scripts/matched-readout.mts` · `scripts/failure-modes.mts` · `scripts/overlap-split.mts` ·
`scripts/arm-vs-arm.mts` · `scripts/power.mts` ·
`fixtures/progressions-heldout-v1.json` · `runs/prompts-{trained,heldout}-v1.jsonl` ·
`runs/mc-{trained,heldout}-{base,A,B,C,D}.jsonl`

Superseded readings are bannered in place: `HELDOUT-RESULTS.md` (reading 2 withdrawn),
`FOUR-ARM-RESULTS.md` (secondary superseded), `CORRECTION-the-pools-were-mislabelled.md`.
