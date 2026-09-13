# Rollout arc — handoff

**Written 2026-09-12, updated after the smoke attempt. ~$11.25 of $25 spent, no pods running, `main` green.**
Everything below is measured and committed; every retraction is attached to the file it retracts.

---

## Read this first — local state passing for repository state

**Twice in one day, in unrelated subsystems, untracked local state stood in for
repository state and every test passed.**

1. `dist/mcp-server.js` exists on a dev rig and not on a fresh runner. Three test
   files had been silently SKIPPING in CI for weeks, and a fourth hard-failed the
   suite. Local was green the whole time.
2. `songs/library` ships **14** redistributable songs; the other **94** are fetched
   from source and never enter git. This rig has all 108 from months of prior work,
   so P4's probe built a **107**-song pool. **A fresh clone builds 14.** The paid
   smoke run discovered it by serving 14 rows to a trainer asking for 32.

Neither was caught by a test, because **the tests ran where the state already
existed.** A green suite on a developer machine is not evidence that the repository
is complete. Before trusting any measurement, ask what it needs that is not in git,
and verify in a cold container.

Fixed for P4 by freezing the derived progressions into
`p4/fixtures/progressions-v1.json` — chord symbols only, no MIDI, nothing
licence-encumbered — and proving equivalence: same 32 songs, zero progression
differences, zero verdict disagreements over all 256 committed completions, admit
rate **0.4492**, the published figure. **P4's population is now rebuildable from git
alone.** The bridge additionally refuses to serve a short pool: `/cases` returns 409,
`--require-pool` fails at startup, and `/health` records `pool_source`.

---

## The answer

**2-voice part-writing is the one task family that clears all three gates — but pure GRPO
still fails on it, for want of EXPLORATION, and prefix forcing supplies it.**

Written in order, because the answer moved twice after this file was first drafted:

1. `film-ambient` looked best (*p* 0.449) and **violated gate 3**: `overlap` was 168 of 168
   failures, which is collision avoidance, not part-writing. I recommended it anyway because
   the number was better. That was wrong and is recorded in `p4/CURRICULUM-PREREG.md`.
2. `common-practice` at 4 bars, G=16 improved **every headline metric** — *p* 0.160 → 0.389,
   non-degeneracy 0.250 → 0.4375 — and **failed**. The funnel got worse: `[0,1]` opened
   **87.4%** of passers, passing signatures fell to 22.1% unique, within-group uniqueness to
   0.356. Shortening the horizon did not break the mode; it removed the chances to deviate
   from it. `p4/CURRICULUM-RESULTS.md`.
3. **Exploring starts fixed it.** Pre-fill each rollout with a different valid opening;
   sampler untouched. Non-degeneracy 0.9375, within-group uniqueness **1.000**, passing
   signatures 90.1% unique, and *p* HELD at 0.453 conditional. The policy completes correctly
   from openings it never chooses: `[0,1]` was a prior, not a ceiling.
   `p4/EXPLORING-STARTS-RESULTS.md`.

**A training run still buys infrastructure validation, not musical capability** — nearest-tone
scores 32/32 on the same pool for free.

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

## The smoke run: attempted, VOID, and what it did show

Run 2026-09-12 on a Blackwell, ~$0.85. **The cell is VOID** — the pod's bridge built a
14-song pool (see above), so `dataset_rows` was 14 against a required 32 and
`prompt_repeats` was **2.29** against a required 1.00. Both are preregistered hard
guards. It was terminated at 18 of 32 steps once the cause was known.

Recorded as a DIAGNOSTIC, not a baseline, on a population nobody chose:

    steps 18 of 32 · non-degenerate 7/18 = 0.389 · mean reward p = 0.222
    k histogram {0:10, 1:1, 2:1, 3:2, 4:1, 5:1, 6:1, 8:1} · rho 0.472

**The live GRPOTrainer loop does not collapse the population** — groups split, across
k = 1..6. That rules out the ~0.9 collapse signature. It does **not** establish that
the trainer preserves rho: 0.472 came from 14 classical-heavy songs at 2.29x repeat,
against 0.592 from 32 randomized 11-genre songs single-turn. **Those are different
populations and the comparison is confounded.** No population has been measured both
ways, which is exactly what the preregistered cell still has to do.

## The next work, and it is a BUILD not a run

**`pod_smoke_p4.sh` now validates a configuration that has been superseded.** It runs the
standard bridge with no prefix forcing, and `train.py` has no mechanism to consume per-rollout
prefixes. Running it would buy a receipt for a pipeline we are about to change.

Prefix-forced training needs: the bridge to serve per-rollout prefixes, and TRL to generate
from them. That is a session, not a $1 smoke.

**And preregister the falsifier BEFORE that run, because the pass rate is a trap here.** The
primary outcome is `top_first_measure_share` on an **unconditioned** eval — scaffolding off,
nobody handing the model an opening:

- stays near **0.874** → the model learned to finish sentences; the scaffold was load-bearing
  and the typicality peak never flattened.
- drops materially → the peak genuinely flattened and the policy explores unaided.

Pass rate will look fine either way, which is exactly why it must not be the primary metric.
**Nothing measured so far touches this question**: exploring starts established that the valid
region is *reachable*, not that training with the scaffold makes it *preferred* once removed.

## Traps — do not re-enter them

0. **ρ WAS MEASURING THE POLICY'S PRIOR, NOT THE TASK.** It fell **0.710 → 0.221** with no
   change to the task, gate, corpus or sampler — only to where rollouts started. When 87% of
   rollouts open identically their rewards correlate because they evaluate one narrow slice
   repeatedly. **This invalidates reasoning, not just figures.** Arguments in this arc that ran
   *from* ρ — whether G=8 sufficed, whether effective draws were too few, whether the band was
   reachable — were about the prior's grip. The measurements stand; the inferences need
   re-deriving. Every ρ here (0.592, 0.639, 0.710 in P4; 0.711–0.947 in P2) means "ρ under this
   policy's unforced sampling", never a constant of the environment.
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
7. **STAGING IS ITS OWN TEST SURFACE, and a local dry run does not cover it.** The
   local 2-step pass proved the TRAINING path end to end and could not prove the
   staging path, because staging does not exist locally. Seven defects followed on a
   billing pod, and **every one was reproducible in a CPU container**: missing
   `--extra-index-url` for a `+cu128` local version; a literal `\n` instead of a line
   continuation (`bash -n` accepted it); a missing Node install stage; a
   non-idempotent `git clone` on relaunch; `pkill -f` matching its own SSH command
   line; the image's torchvision compiled against a different torch
   (`operator torchvision::nms does not exist`); and mangled quotes in an import
   assertion. Rehearse stage 0 in `runpod/pytorch:1.1.0-cu1290-torch280-ubuntu2404`
   before paying for a GPU to find them.
8. **`set -e` does not fire mid-`&&`.** `a && b && c` exempts `a` and `b`, so a failed
   `corepack enable` printed "build done" over a build that never ran and only
   surfaced two stages later at a health check. Split setup chains so each command is
   the last of its own list.
9. **Never write script content through nested shell escaping.** `node -e` with quoted
   payloads mangled a pip flag, a python assertion and a bash edit — three separate
   failures in one session, after the lesson had been written down twice. Use a real
   patch file.
10. **Pods:** `RUNPOD_GPU="NVIDIA RTX PRO 6000 Blackwell Workstation Edition"`. L40S hosts carry
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
