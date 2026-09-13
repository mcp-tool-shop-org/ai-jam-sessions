# P4 — voice-leading is the first substrate to clear all three gates

**Local, RTX 5090, $0. No pod, nothing billed. Spend unchanged at $10.40 of $25.**
Qwen3-4B-Instruct-2507, bf16, transformers — the trainer's path. Sampler read off the P2
`GRPOConfig`: temperature 1.0, top_p 1.0, top_k 0, 512 max new tokens. G=8 throughout.

Task: the **spec realizer** — the model emits DEGREES (which chord note each voice takes) for a
fixed progression, so `chordMembership` is true by construction and the gate is entirely
counterpoint. Output is JSON, so notation cannot confound it the way ABC syntax confounded P3.

## Why the direct-pitch path is not the surface

The direct realizer (model writes pitch names) admits **0 / 200 at every style**, because it
adds notes that are not in the chord — `Csus2` voiced as `C3 D3 F3 G3`. `chordMembership` is in
no style's relax set, correctly. This reproduces Session 2's membership finding on a different
model and precision (Qwen3-4B bf16 / transformers vs qwen2.5:7b / Ollama) and is **a defect the
repo already retired**, not a difficulty to train against.

## The voice sweep

| voices | style | *p* | non-degenerate | k-of-8 |
|---|---|---|---|---|
| 4 | common-practice | 0.040 | 0/25 = 0.000 | `0:24 8:1` |
| 4 | lead-sheet | 0.040 | 0/25 = 0.000 | `0:24 8:1` |
| 4 | film-ambient | 0.045 | 1/25 = 0.040 | `0:23 1:1 8:1` |
| 3 | common-practice | 0.082 | 4/32 = 0.125 | `0:27 1:1 2:1 4:1 6:1 8:1` |
| 3 | lead-sheet / film | 0.137 | 7/32 = 0.219 | `0:24 1:2 4:2 5:1 6:2 8:1` |
| 2 | common-practice | 0.070 | 6/32 = 0.188 | `0:25 1:5 5:1 8:1` |
| 2 | lead-sheet | 0.086 | 9/32 = 0.281 | `0:22 1:7 2:1 5:1 8:1` |
| 2 | film-ambient | 0.344 | 15/32 = 0.469 | `0:13 1:3 2:4 3:1 5:2 6:3 7:2 8:4` |

**Four voices — SATB — is the hardest setting counterpoint has, and every earlier P4 figure was
measured there.** The nearest-tone heuristic moves 0.17 → 0.50 → 0.87 (common-practice) as
voices go 4 → 3 → 2, so voice count is a purely musical dial with large range. Concluding
"no musical task lands in band" from the 4-voice corner would have been an inference, not a
measurement.

## MY DESIGN ERROR, and what survived it

The first replication used a CONTIGUOUS index slice (items 33–64). **This library is ordered by
genre**, so that compared two different musical populations rather than two draws of one:

| slice | genres |
|---|---|
| items 1–32 | classical 10, jazz 10, pop 9, blues 3 |
| items 33–64 | rock 10, rnb 9, soul 9, blues 4 |

Single-shot *p* moved 0.344 → 0.582 accordingly. The prereg's own reading 3 had named this
diagnosis in advance and I wrote the slice that caused it. The fix was a deterministic shuffle
over the full 107-song pool (mulberry32, seed 20260913) — eleven genres.

**Non-degeneracy and ρ held flat through the genre shift anyway**, which is a stronger
robustness claim than a same-population re-draw would have made:

| 2v film-ambient | classical/jazz | rock/rnb/soul | **randomized 11-genre** |
|---|---|---|---|
| non-degeneracy | 0.469 | 0.500 | **0.500** [0.336, 0.664] |
| ρ | 0.594 | 0.608 | **0.592** |
| single-shot *p* | 0.344 | 0.582 | **0.449** [0.390, 0.511] |

Single-shot *p* is genre-sensitive; the randomized figure lands between the two slices, as a
mixed pool should. **The two slice values must never be averaged into a pool figure.**

## The randomized pool — and the strictest style also lands in band

| style | relaxes | *p* | non-degeneracy | k-of-8 |
|---|---|---|---|---|
| **common-practice** | **nothing** | **0.1602** [0.120, 0.210] | **0.250** [0.133, 0.421] | `0:21 1:4 2:1 3:1 4:2 8:3` |
| lead-sheet | parallels, tendency-7th | 0.2578 | 0.438 [0.282, 0.607] | `0:14 1:6 2:4 4:2 5:1 7:1 8:4` |
| film-ambient | + hidden, leading-tone | 0.4492 | 0.500 [0.336, 0.664] | `0:9 1:5 3:2 4:3 5:2 6:2 7:2 8:7` |

An earlier draft of this file said the passing cell "is the loosest one available, not a strict
one." **That is no longer true.** At two voices the full chorale rulebook — parallel fifths,
hidden fifths, tendency-tone resolution, all gated — puts the model at *p* = 0.160 with
non-degeneracy 0.250 and splits at k = 1,1,1,1,2,3,4,4. It is **marginal, not established**: the
*p* interval's lower bound is 0.120, under the 0.15 floor. But a strict-style target exists.

## Gate controls, matched to the randomized pool

| voicer, 2 voices | common-practice | lead-sheet | film-ambient |
|---|---|---|---|
| nearest-tone | 27/32 = 0.84 | **32/32 = 1.00** | **32/32 = 1.00** |
| root-position (naive floor) | 10/32 = 0.31 | 10/32 = 0.31 | 10/32 = 0.31 |

The gate discriminates: a good algorithm scores 1.00, a naive one 0.31. Whatever the model
returns is a statement about the model, not a degenerate gate. These controls were re-run on the
randomized pool; carrying them over from the contiguous slice would have repeated the confound.

## What binds, in the passing cell

Under `film-ambient`, `parallels` / `hidden` / `tendencySeventh` / `tendencyLeadingTone` are
demoted to warnings, so the rules that actually gate are **`overlap` (168 of 168 failures)** and
`leap` (67, co-occurring). Both are the style-invariant floor: voices must not cross over time,
and must not leap wildly. **That is genuine part-writing, not notation compliance — gate 3
passes.** State it precisely though: one rule does essentially all the work. The trainable task
at film-ambient is "write two voices that don't overlap", not "write good counterpoint". The
common-practice cell is the one where the difficulty is the full rulebook.

## Two things that did not improve

**ρ ≈ 0.59, stable across all three draws — about 1.55 effective draws per group of 8**, against
P3's 2.28. Non-degeneracy is therefore a property of **G=8** and may never be quoted without it:
ρ is the invariant, and the observed split rate is what moves with G. This is the D1 mechanism
(1/64 at G=2 became 7/64 at G=8 on identical cases).

**Film-ambient's 0.500 sits exactly ON the band ceiling [0.125, 0.50]**, not inside it. One more
splitting group would put it out the top.

## What this buys, and what it does not

The substrate search is done. P4 at two voices is the first configuration in this arc to clear
all three gates — musical difficulty, in band, graded splits, no notation confound.

**And the nearest-tone heuristic scores 32/32 on this identical pool.** A training run here buys
**infrastructure validation** — proof the GRPO loop can optimize against a structured constraint
map — and produces a policy that loses to free deterministic code sitting beside it in this
repo. That is a legitimate purchase. It is not a musical-capability purchase, and it must not be
written up as one.

**Nothing measured here touches the trainer path.** Every P3 and P4 figure is single-turn
`model.generate` through transformers. The live `GRPOTrainer` adds a loss mask, a tool loop and a
different sampling path, and no measured branching statistic has ever been shown to survive into
a training batch — P2's training run aborted before producing one. The $1 smoke run that P3 hard
restriction 2 demands is the next spend, and its job is to check whether ρ ≈ 0.59 and these split
rates hold in a live batch.

## Receipts

`scripts/emit-vl-prompts.mts` · `scripts/emit-spec-prompts.mts` · `scripts/score-vl-probe.mts` ·
`scripts/score-spec-probe.mts` · `VOICE-SWEEP-PREREG.md`
`runs/spec-g8.jsonl` (4v) · `runs/spec-g8-v3.jsonl` · `runs/spec-g8-v2.jsonl` ·
`runs/spec-g8-v2-holdout.jsonl` · `runs/spec-g8-v2-random.jsonl` · `runs/vl-g8.jsonl` (direct control)
