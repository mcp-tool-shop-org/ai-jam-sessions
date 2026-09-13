# Rollout arc — handoff

**Written 2026-09-12. $10.40 of $25 spent, no pods running, `main` green.**
Everything below is measured and committed; every retraction is attached to the file it retracts.

---

## The answer

**The substrate search is over. 2-voice part-writing is the one task family in this repo that
clears all three gates, and a training run on it buys infrastructure validation, not musical
capability.**

---

## The three gates — the transferable result

This arc spent its first two phases failing for reasons the first two gates could not see. The
third gate is the one that had to be invented, and it is the thing worth carrying to any other
RL substrate search.

| gate | question | fails when |
|---|---|---|
| **1 — choice** | do rollouts in a group differ at all? | the completion is copied from the prompt; P2 got 1.09 distinct spans of 8, entropy 0.0002 |
| **2 — window** | is single-shot *p* in band, with groups that split? | the task is saturated (P3 frozen gate, 0.898) or unreachable (P4 at 4 voices, 0.040) |
| **3 — target** | **is the difficulty located in the capability you want?** | P3 passed 1 and 2 at *p* = 0.406 — and the difficulty was **ABC notation syntax**, not harmony |

**Gate 3 is not implied by the other two.** P3 is the proof: it branched beautifully (7.98/8),
landed in band, and would have spent its entire gradient budget teaching the model to stop
pasting a melody table into a tune body. Add gate 3 to any substrate checklist.

A fourth criterion earned the same day: **non-degeneracy must be quoted with its k-distribution.**
A 1-of-8 split and a 4-of-8 split both satisfy `std > 0` and both count once. Under
std-normalised advantage a 1-of-8 group hands its single correct rollout +2.65 and seven wrong
ones -0.38 each — a *needle* signal, and the regime where a policy reinforces whatever else sat
in that one lucky rollout. 2-voice lead-sheet showed non-degeneracy 0.281 with **7 of 9 splits at
k = 1**; the scalar looked fine and the histogram caught it.

---

## What was measured

| phase | surface | result | file |
|---|---|---|---|
| P2 | synth lookup, distance 1-3 | *p* 0.958, non-degenerate 0.065 — **variance collapse** | `p2/GRID-RESULTS.md` |
| P2 | synth lookup, distance 5-11 | *p* 0.000, max answer offset +4 — **execution wall**, will not page even when told (0.016) | `p2/GRID-RESULTS.md`, `p2/TURN-TAX.md` |
| P2 | corpus hardening, every knob | rho rises with difficulty and cancels it: 0.711 at *p* 0.958 to 0.938 at *p* 0.835 | `p2/STACK-RESULTS.md` |
| P2 | TRL harness | **cleared** — generic prompts branch 4.00/4 with tools and without | `p2/ARMC-RESULTS.md` |
| P3 | ABC reharmonization | gates 1+2 pass, **gate 3 fails** — difficulty is notation | `p3/RESULTS.md` |
| P4 | voice-leading, direct pitch | 0/200 — `chordMembership`, a defect S2 already retired | `p4/RESULTS.md` |
| **P4** | **voice-leading, spec, 2 voices** | **all three gates pass** | `p4/RESULTS.md` |

**The two P2 deadlocks are structurally different and must not be merged.** Distance 1-3 is
variance collapse (the policy nearly always succeeds, groups do not split). Distance 5-11 is an
execution wall (accuracy 0.000, it will not page). No knob reaches between them: the maximum
offset answered anywhere is +4, with nothing at 5-11.

---

## The recommended cell, and its honest price

**2 voices, randomized 11-genre pool, G=8, n=32:**

| style | *p* | non-degeneracy | rho |
|---|---|---|---|
| common-practice (relaxes nothing) | 0.160 [0.120, 0.210] | 0.250 [0.133, 0.421] | 0.639 |
| film-ambient (relaxes four rules) | 0.449 [0.390, 0.511] | 0.500 [0.336, 0.664] | 0.592 |

Both are in band. **common-practice is the honest target** — the difficulty there is the full
chorale rulebook — but it is marginal, with the *p* interval's lower bound under the 0.15 floor.
film-ambient has more headroom and narrower difficulty: `overlap` accounts for 168 of 168
failures, so its trainable task is "write two voices that do not overlap".

Stability across three draws, two of them different musical populations: non-degeneracy
0.469 / 0.500 / 0.500, rho 0.594 / 0.608 / 0.592. Single-shot *p* is genre-sensitive
(0.344 / 0.582 / 0.449) and **the two slice values must never be averaged into a pool figure.**

**The price, stated plainly: the nearest-tone deterministic heuristic scores 32/32 on this
identical pool.** Training here produces a policy that loses to free code already in the repo.
That is a legitimate purchase as *infrastructure validation* — proof the GRPO loop can optimize
against a structured constraint map, transferable to a larger model or to a task where no
heuristic can be written. It is not a musical-capability purchase and must not be written up as
one.

---

## The next spend, and it is $1

**Nothing in P3 or P4 touches the trainer path.** Every figure is single-turn `model.generate`
through transformers. The live `GRPOTrainer` adds a loss mask, a tool loop and a different
sampling path, and no measured branching statistic has been shown to survive into a training
batch — P2's run aborted before producing one.

The smoke run's job: **confirm rho ~ 0.59 and non-degeneracy ~ 0.50 hold inside a live batch.**
If they do not, every number in P4 describes a population the trainer never sees.

---

## Traps — do not re-enter them

1. **`--limit` truncates, it does not stratify.** Fixed in the bridge. `train.py`'s dry block
   still hardcodes a step count into its default; always pass `--limit` explicitly. The paid
   smoke run has `dataset_rows: 2`; its 38.5 s/step and 65.2% mask figures are withdrawn.
2. **Every small sample overestimated difficulty.** D1 across three draws of one construction:
   n=11 to 0.273, n=65 to 0.092, n=400 to 0.065 — monotone. P4 4-voice: n=7 gave 0.000,
   n=24 gave 0.042. Assume a pilot is the hard tail until n is in the hundreds.
3. **A rate at one `num_generations` is not a rate at another.** G=2 gave 1/64 splits where G=8
   gave 7/64 on identical cases. Accuracy is G-invariant; non-degeneracy is not. rho is the
   invariant; the observed split rate is what moves with G.
4. **THE SONG LIBRARY IS ORDERED BY GENRE.** A contiguous index slice is not a random sample —
   items 1-32 are classical/jazz/pop, items 33-64 are rock/rnb/soul. This corrupted my first
   replication and moved *p* from 0.344 to 0.582. Shuffle over the full pool.
5. **Blocklist validators fail open and fail quiet.** The P3 well-formedness regex shipped with a
   literal 0x08 byte where a word boundary belonged; half the pattern was inert, and the only
   symptom was a higher pass rate. Use a total tokenizer that must consume every character —
   `src/maker/abc-syntax.ts` is the pattern, with a dead-branch test per token type.
6. **Local green lies.** `dist/` exists on a dev rig and not on a fresh runner. CI now builds
   before it tests; three test files that had been silently skipping now execute there.
7. **Pods:** `RUNPOD_GPU="NVIDIA RTX PRO 6000 Blackwell Workstation Edition"`. L40S hosts carry
   driver 550, too old for the image's cu129 torch, and `nvidia-smi` looks healthy while
   `torch.cuda.is_available()` is False. SSH one line to check CUDA before staging. Dead-man
   armed BEFORE staging — the pod bills from creation.

---

## Unfinished, in priority order

1. **The $1 TRL smoke run** (above). Blocks everything.
2. **The Ollama/transformers divergence** — 3.75 distinct spans vs 1.09 on the same corpus at
   matched sampler settings, at both q4 and fp16. A curiosity, not a blocker.
   `p2/SPAN-RESULTS.md`.
3. **Distance 4** — never measured. The only untested point between "solved" and "unreachable".
4. **`train.py`'s `--limit` default** — still unguarded. A one-line fix plus a `prompt_repeats`
   receipt field that refuses rather than records.

---

## What I would keep

Four positions were held and retracted on evidence this session: *difficulty is the lever*, *the
harness is the lever*, *TRL is the bug*, and *the spec path will branch less than the direct
path*. Not one was caught by thinking harder about data already in hand — every one died to a
cheap control, and in two cases the conclusion was already committed. The strict gate's own
well-formedness regex was published broken and found by a cross-check, not by its tests. The
first replication design was corrupted by an assumption about the item pool that a single genre
histogram destroyed in seconds.

**The corrections are the finding.**
