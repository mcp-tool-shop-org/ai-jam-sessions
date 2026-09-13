# Rollout arc — handoff

> ⛔ **THE ARC IS CLOSED, 2026-09-13. The hypothesis failed; the experiment answered.**
>
> **Prefix forcing — the intervention the whole arc was built to test — contributes nothing.**
> On a correctly-constructed held-out pool of 75 never-trained songs at the trained cell,
> A−C is +0.8pp [−1.4, +3.2] and B−C is +1.8pp [−1.1, +4.8]: **not distinguishable, either
> pool, either direction.** Plain GRPO (arm C) does the same job.
>
> **What does work is small and loses to free code.** All three real-reward arms lift
> 2.0–3.8pp on unseen songs with intervals excluding zero; the **random-reward arm is flat**
> (+0.3pp [−1.3, +1.8]) despite taking **198 effective updates against B's 111**, so drift is
> not the explanation. But that is a model going 11% → 14% on a task where the nearest-tone
> heuristic scores **32/32 for free**, at **one seed**, with no replication.
>
> **The prior never moved.** `top_first_measure_share` 0.889 → 0.841/0.848/0.820, and the
> random-reward arm moved it **0.060 — more than either treatment.**
>
> Read `p4/MATCHED-CELL-RESULTS.md` for the close-out. Everything above it in this file is
> the road there, including three withdrawn readings, all bannered in place.
>
> **Do not reopen for seed 8 or 500 steps.** Those sharpen a result whose ceiling is "loses
> to fifty lines of deterministic code". Total spend **$16.73 of $25**; nothing billing.
>
> ⚡ **What transfers, and it is the reason the arc was not a waste:**
> [[feedback-rl-substrate-three-gates]] (gate 3 — is the difficulty in the capability you
> want) and [[feedback-checks-that-pass-for-the-wrong-reason]], now joined by the pathology
> that produced every error in the final session: **every one was a comparison against the
> wrong reference set**, and each produced a plausible number that shaped a reported
> conclusion before it was withdrawn.

**Written 2026-09-12; updated after the prefix-forcing BUILD session the same day.
~$11.25 of $25 spent, no pods running, `main` green, suite green, tsc clean.**
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

## The build is DONE — prefix forcing runs inside a live GRPO batch

`p4/PREFIX-BUILD.md`. Three local dry runs, `STAGE C PASS` on all three, $0, no pod.

**The only seam is `rollout_func`**, verified in the installed source rather than recalled:
`_tokenize_prompts` hardcodes `add_generation_prompt=True`, and transformers refuses it
together with `continue_final_message` (`tokenization_utils_base.py:3099`), so the
partial-assistant-message route cannot exist in TRL 1.13.0. The forced opening goes in
**`completion_ids`** so the reward judges it, with **`env_mask` 0 across every prefix token** so
no gradient lands on tokens the model did not choose. `--prefix-in-loss` selects the Prefix-GRPO
behaviour instead; both are defensible and only one is what we meant, so it is a flag with a
receipt field.

Measured, not asserted: `prefix_hits` **16/16** on every run; TRL's own mask probe saw a zero
span on **16 of 16** completions; `masked_prefix_tokens` **256** = `prefix_tokens_total` **256**;
the bridge's independent `first_measure_wrong` delta **0** over 48 scored rollouts;
`boundary_clean` true; `openings_per_group` **8..8** heterogeneous and **1..1** stratified.
13.25 s/step at G=8, 384-token completions, 21.3 GB reserved of 32.6 on a 5090.

**One documented contract was wrong and is now asserted.** `rollout_func`'s docstring says it
receives the prompt slice "with no duplication"; `_get_train_sampler` passes
`mini_repeat_count=num_generations` unconditionally, so off the vLLM path the prompts arrive
**already repeated G times**. Building to the docstring would have handed every rollout of a
group the same opening — silently, with healthy-looking metrics.

`pod_smoke_p4.sh` still runs the superseded no-forcing configuration and still must not be run
unchanged.

## The architecture fork, and the preregistered answer

Exploring starts break GRPO's group: the advantage is valid because all G rollouts share a
conditioning context, and G different openings are G different contexts. Opening difficulty is
real — **0.219 to 0.563, range 0.344, sd 0.101** on the fully-crossed run — so part of each
within-group advantage grades *which opening the rollout was handed*.

`stratified` mode fixes that by making the opening part of the group identity, where per-group
standardisation removes it exactly. Its risk is that a group sharing one opening may not split
at all. **Measured** (`p4/SAME-OPENING-RESULTS.md`, 512 completions, $0): non-degeneracy
**0.6250**, mean distinct completions per group **6.156 of 16**, conditional *p* **0.514**,
rho 0.528.

`p4/PREFIX-PREREG.md` required non-degeneracy >= 0.50 **and** distinct >= 8.0 for VIABLE. The
second failed; the DEAD thresholds were not met either. The reading is **3 — AMBIGUOUS**, whose
fixed consequence is **heterogeneous is the default and the ambiguity is reported as
ambiguity**. That is followed. The cost of the alternative is on the record too: stratified
leaves **12 of 32 groups (38%) with zero within-group reward variance** — rollouts the step
pays for and learns nothing from — against 2 of 32 under heterogeneous forcing.

Worth carrying separately: **pinning the opening produced MORE distinct completions per group
(6.156) than letting the policy choose it (4.906 unforced)**. The unforced collapse is a
collapse of the whole completion, not only of its first measure.

## THE RUN HAPPENED. The peak did not flatten.

`p4/FOUR-ARM-RESULTS.md`. RTX 5090, 4 arms x 200 steps at G=8, five unconditioned evals at
G=16, 2h50m, **$2.80**. Commit `7ec619c`.

**Primary outcome, preregistered before the pod existed: reading 3, NOTHING FLATTENS.**
`top_first_measure_share` unconditioned — base **0.889** (re-measured on the pod against 0.874
locally), A stratified **0.841**, B heterogeneous **0.848**, C unforced **0.820**, D
random-reward **0.829**. Flattening was pre-committed at **< 0.70**; every arm is above 0.80.

**The D veto is why this is decisive rather than merely negative.** Random binary rewards moved
`topFirst` by **0.060** — more than stratified's 0.048 and more than heterogeneous's 0.041. The
movement that occurred is what *any* gradient does to the prior over 200 steps. Exploring starts
made the policy better at completing from anywhere; they did not make it **choose** to start
anywhere.

**What did happen, and it is not the hypothesis.** Unconditioned pass rate 0.389 → **0.453 (A)**
and **0.500 (B)**, with **C 0.391** and **D 0.389**. A clean 2x2: training alone does nothing,
198 effective updates of pure noise do nothing (D's `frac_reward_zero_std` is 0.010 — a
maximally *active* null), and both forcing and the real verifier are needed for the lift. That
is the infrastructure validation that was preregistered as the honest purchase. Paired by item
(n=32, base and every arm ran the same items): **A +6.4pp [+0.8, +12.3], B +11.1pp
[+5.3, +17.8]**, both excluding zero; **C +0.2pp, D +0.0pp**, both flat.

**And then it did not survive held-out.** `p4/HELDOUT-RESULTS.md`, preregistered before it ran,
29 of 32 items unseen: **B fell from +11.1pp to +1.2pp** — between C's +0.6pp and D's +1.0pp
and not distinguishable from either. **Reading 2, MEMORISATION, fires: the secondary finding
does not survive.** B trained at `prompt_repeats` **6.25** and saw every eval item six times.
A retained **+3.7pp**, clearing its preregistered bar with 9 items better / 2 worse, but its
interval **includes zero** — consistent with partial generalisation and equally consistent with
nothing. A trained at `prompt_repeats` **0.39** and could not memorise a row, which is a
mechanism recorded *before* the run — and still confounded, because A differs from B in group
construction **and** repetition and nothing here separates them.

So: **not** musical capability (nearest-tone scores 32/32 for free), and on this evidence not a
capability that transfers either. What was bought is a working loop.

⚠ **The statistic was easy to get wrong in both directions.** 512 completions as 512
independent draws makes intervals ~3.5x too narrow at ρ 0.62–0.74; a design-effect correction
on *independent* samples gives n_eff ≈ 45 and ±20pp intervals that erase everything including
B's in-sample result. Both wrong — the evals are **paired on the same items**, so n = 32 and
item difficulty cancels. `p4/scripts/paired-readout.mts` is the statistic; the unpaired version
is kept beside it so the difference is visible rather than asserted.

**Tiebreak, preregistered: heterogeneous wins** — effective updates per GPU dollar, B **194** vs
A **160**, and B also wins on pass rate. **But the argument that set it up was wrong**: the
38%-vs-6% dead-group pair was measured at **G=16** and the run trained at **G=8**, where it is
**54.5% vs 44.5%** — 10 points, not 32. Trap 3 below says a rate at one `num_generations` is not
a rate at another; it was quoted across G anyway.

**Unexplained, and left that way:** A's *training* `acc_joint` was flat (0.235 → 0.242) while
B's and C's roughly doubled — yet A gained 6.4pp on eval and C gained nothing. Training and eval
accuracy moved in opposite directions for two different arms.

All four arms passed every hard guard. `openings_covered = 16` on both forced arms at G=8 is the
coprime-stride fix working in production; the build from two hours earlier would have read 8 and
every other number in the table would have been identical. 27/27 artifacts verified against
`artifacts.sha256`.

## Traps — do not re-enter them

0a. **ONE OUTPUT FILENAME FOR EVERY RUN OF A SCORING SCRIPT.** `score-curriculum.mts` wrote
   `runs/curriculum-summary.json` whatever it scored, so the last run won. The file committed at
   `f1ec03b` is **named for the curriculum cell and contained the exploring-starts numbers**, and
   the first draft of `PREFIX-PREREG.md` cited `top_first_measure_share` **0.874** from a file
   that said **0.078**. The citation would have passed review. Summaries are now per-run
   (`summary-<stem>.json`) and every one carries `generated_from`. **A derived artifact that
   cannot say which run produced it is not a receipt.**

0b. **A SCRIPT WILL PRINT ITS VERDICT ON A DESIGN IT WAS NOT WRITTEN FOR.**
   `opening-difficulty.mts` estimates opening difficulty from a **crossed** design, where every
   item contributes one rollout to every opening. Pointed at the same-opening run — where each
   opening is backed by 2 items and 16 correlated rollouts — it reported `range 0.688 sd 0.165
   SEVERE` against the crossed run's `0.344 / 0.101 MATERIAL`, nearly double, and confidently.
   It now refuses a verdict when the thinnest opening has fewer than 8 distinct items behind it.

0c. **On Windows set `PYTHONIOENCODING=utf-8` before `train.py --dry`.** TRL prints the
   completions table through rich, rich falls back to the legacy Windows console writer, and the
   first non-cp1252 character raises `UnicodeEncodeError` — **after step 1 has already run**, so
   the traceback points at `trainer.train()` and reads like a training bug. Linux pods never see
   it.

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

1. **The preregistered prefix-forced run**, and it needs a decision before it needs a pod:
   `--prefix-mode heterogeneous`, the cell from `SMOKE-PREREG.md` at the honest
   `common-practice` style, and the falsifier in `PREFIX-PREREG.md` Part 2 measured *after* it
   with `probe_generate.py --adapter`. `pod_smoke_p4.sh` must be updated to pass the forcing
   flags and the `--fixture` pool before it is run — as committed it validates the superseded
   no-forcing configuration.
2. **G=16 memory on the target card** — never measured. G=8 reserved 21.3 GB of 32.6 on a 5090;
   nothing here licenses extrapolating that to G=16, and the Blackwell is a different card.
3. **The Ollama/transformers divergence** — 3.75 distinct spans vs 1.09 on the same corpus at
   matched sampler settings, at both q4 and fp16. A curiosity, not a blocker.
   `p2/SPAN-RESULTS.md`.
4. **Distance 4** — never measured. The only untested point between "solved" and "unreachable".
5. **Stratified as an ablation.** It is implemented, it passes Stage C, and it is the only design
   under which opening difficulty is removed exactly rather than absorbed as a nuisance. It costs
   38% dead groups. Nothing measured decides which dominates during training, and only a training
   comparison would.

**Closed since the last handoff:** `train.py`'s `--limit` default (the dry block now sizes the
draw from `steps x prompts_per_step` and `prompt_repeats` halts on an unchosen repeat), and the
build that blocked everything.

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
