# P3 substrate probe — the collapse was the task, and a generative surface clears both gates

**Local, RTX 5090, 710 s, $0. No pod, nothing billed. Spend unchanged at $10.40 of $25.**
Qwen3-4B-Instruct-2507, bf16, transformers 5.13.0 / torch 2.11.0+cu128 — the trainer's path,
not Ollama, because the Ollama/transformers span divergence is still unexplained.
Sampler read off the P2 `GRPOConfig`: temperature 1.0, top_p 1.0, top_k 0, seed 0, 1024 max new tokens.

44 E-R items (`selectERItems`, `itemsPerGenre: 4`, 8 bars, non-classical genres — disjoint from
the jam-actions-v0 training set by construction) × G=8 = **352 completions**.

> ## CORRECTION — the first publication of this file carried a broken detector
>
> `fc30025` reported the strict gate at **0.625** and non-degeneracy at **0.773**. Both were
> wrong. The well-formedness regex had a literal `0x08` byte where its word boundary belonged —
> a heredoc ate the escape — so the duration-suffix alternative **could never match** and the
> test caught only pitch stacks. Corrected figures are below; every number in this file is from
> the fixed detector. The verdict is unchanged and *p* moved **closer to the centre** of the
> target window, but the figures in `fc30025`'s message and in the director's sign-off are void.
>
> | | as published in `fc30025` | corrected |
> |---|---|---|
> | well-formed ABC | 0.682 | **0.528** |
> | strict single-shot *p* | 0.625 | **0.489** |
> | strict non-degenerate | 34/44 = 0.773 | **31/44 = 0.705** |
> | ρ | 0.287 | **0.409** |
> | effective draws | 2.66 | **2.07** |
>
> This is a first-hand instance of exactly the instability **P3 hard restriction 1** exists to
> retire, found within the hour by cross-checking the scorer against an independent count.
> Gate 1 is untouched: it is a generation-side measurement with no gate in the path.

## Gate 1 — the choice threshold. Passes.

| | P2 synth lookup | P3 reharmonization |
|---|---|---|
| distinct model spans per group of 8 | 1.09 | **7.977 / 8.00** |
| mean token entropy | 0.0002 | **0.10697** |
| completion length | constant 39 | 113–402, varying *within* group |

Same weights, same precision, same trainer path, same sampler. **The point-mass collapse
documented across the whole P2 arc is a property of the task, not of the model, the framework,
or the corpus.** P2 arm C showed generic prompts branch 4.00/4; this shows the platform's own
generative surface branches 7.98/8.

## Gate 2 — the learning window [0.15, 0.85]. Passes only under the strict gate.

| gate | single-shot *p* | 95% CI | in window |
|---|---|---|---|
| frozen E-R gate | 0.8977 | [0.862, 0.925] | **no — above ceiling** |
| **+ ABC well-formedness** | **0.4886** | [0.437, 0.541] | **yes** |

Decomposition of the frozen gate: chords parsed 1.000, non-triviality 1.000, consonance 0.8977.
Chord fidelity is true by construction (`renderReharmonization`), so **consonance alone binds**.
Well-formed ABC: **0.528** [0.476, 0.580].

### Group structure under the strict gate

- **non-degenerate 31/44 = 0.705**, Wilson CI **[0.558, 0.818]** — against P2's best of 0.065
- **ρ = 0.409**, effective draws **2.07** of 8 — against P2's 0.711–0.947 and 1.05–1.34
- k-of-8: `0:6  1:6  2:4  3:5  4:5  5:4  6:2  7:5  8:7`

The frozen gate for comparison: non-degenerate 23/44 = 0.523, ρ 0.054, k-of-8 `4:1 5:3 6:4 7:15 8:21`.

P2's hardened stack produced eight splits in 128 groups and **seven of the eight were 7-of-8**.
This produces a spread across the entire range. That difference — not the split *count* but the
split *shape* — is the thing the P2 corpus could never buy at any difficulty setting.

## The two P2 deadlocks, recorded separately

The lookup task was choked from both ends by two structurally different failures, and merging
them into one phrase hides that:

| | measured | failure |
|---|---|---|
| **distance 1–3** | accuracy **0.958**, non-degenerate 0.065 | **variance collapse.** The policy nearly always succeeds, groups do not split, and the gradient is starved. |
| **distance 5–11** | accuracy **0.000**, max answer offset **+4**, 0/32 | **execution wall.** The policy will not page — not with turns restored, not when told explicitly (0.016). |

Neither is a corpus-difficulty problem, and no knob reaches between them: the maximum offset
answered anywhere is +4, with nothing at 5–11. See `GRID-RESULTS.md`, `TURN-TAX.md`, `HINT-RESULTS.md`.

## Why the frozen gate is at ceiling, and the disclosure that goes with it

`parseAbcChords` extracts only the quoted chord symbols; `renderReharmonization` then makes chord
fidelity true by construction. **The frozen gate never checks that the model wrote a lead sheet.**
47% of completions pasted the prompt's melody table back into the ABC body — pitch stacks and
duration suffixes that are not ABC note syntax — and passed.

**Disclosure: the well-formedness check was added after the frozen gate was observed at ceiling
on a 2-item smoke. That is post-hoc.** Its rationale is independent of the number — the prompt
says "write a REHARMONIZED ABC lead sheet" and the gate did not check that it got one — and its
direction was published before the full run. It is nonetheless a gate change, and `er-gate.ts`
states in its own header that these thresholds are proposals the director signs ex ante.
**Signed off by the director 2026-09-12** (on the pre-correction figures; the gate is unchanged,
its measured rate is not).

## Corpus failure-mode census (all 352 completions)

| property | count |
|---|---|
| complete X/T/M/L/K headers | 352 / 352 |
| body present after `K:`, with bar lines | 352 / 352 |
| code-fenced, or prose in body | 0 / 352 |
| exactly 8 quoted chords (one per measure) | 337 / 352 |
| melody-table tokens pasted into body | **165 / 352** |

Headers and bar lines are never the problem; **the body is.** A validator that checks only header
presence would pass 100% and measure nothing.

## P3 HARD RESTRICTIONS — binding on the next phase

1. **Parser upgrade.** The current well-formedness test is a regex proxy and is unstable in both
   directions — it has already failed once, silently, in this very file. It MUST be replaced by a
   real ABC syntax validator — header structure, bar-line termination, valid pitch/octave
   characters — before any training run launches. See `ABC-VALIDATOR-SPEC.md`.
2. **Rate-mismatch guard.** This was single-turn generation: no tool calls, no loss mask, no GRPO
   step. The arc's own lesson is that a rate measured one way is not a rate measured another
   (G=2 gave 1/64 where G=8 gave 7/64 on identical cases). The first smoke run MUST confirm that
   the live `GRPOTrainer` environment preserves these branching statistics before any cell is read.
3. **n is 44.** The non-degeneracy interval is [0.558, 0.818]. Do not quote 0.705 as a pinned
   figure; it is a first measurement on a small item set.

## What this does NOT establish

That the policy would improve. Nothing here runs an optimizer step. What is established is that
the gradient is no longer structurally absent — P2 died because 92–98% of groups could not split
at any corpus setting, and on this surface 70% of them do.

## Receipts

`scripts/emit-er-prompts.mts` · `scripts/probe_generate.py` · `scripts/score-er-probe.mts`
`runs/er-prompts.jsonl` · `runs/er-items.json` · `runs/er-g8.jsonl` · `runs/er-probe-summary.json` · `runs/smoke.jsonl`
