# Rollout arc — paste-ready kickoff for the next session

> ⛔⛔ **THE ARC IS CLOSED, 2026-09-13. There is no next session for it.** Prefix forcing
> contributes nothing (A-C +0.8pp, B-C +1.8pp on 75 unseen songs, neither distinguishable);
> plain GRPO does the same job; the random-reward arm is flat so drift is not the
> explanation; the prior never flattened. Read `p4/MATCHED-CELL-RESULTS.md`. Do not reopen
> for seed 8 or 500 steps. $16.73 of $25 spent, nothing billing.

> ⛔ **SUPERSEDED 2026-09-12 at `5648f2c`. The build this file asks for is DONE.** Prefix
> forcing runs inside a live `GRPOTrainer` batch, asserted against all five silent failures,
> three local dry runs at `STAGE C PASS`, $0. The architecture fork it leaves open —
> heterogeneous vs stratified groups — was settled by a preregistered measurement, not by
> taste. **Read `HANDOFF.md` (rewritten), then `p4/PREFIX-PREREG.md`, `p4/PREFIX-BUILD.md`
> and `p4/SAME-OPENING-RESULTS.md`.** What survives below unchanged: the three gates, the
> numbers, the falsifier and the five failure modes — which are now assertions with receipts
> rather than warnings. `main` at `5648f2c`, suite 189 files / 4,125 tests green, tsc clean,
> spend still $11.25 of $25, no pods.

**Repo:** `mcp-tool-shop-org/ai-jam-sessions` · **`main` at `6edfd89`** (plus this file)
**Spend:** $11.25 of $25 · no pods · suite 188 files / 4,116 tests green · tsc clean
**Read `experiments/rollout-arc/HANDOFF.md` first — it opens with the two traps that cost the most.**

---

## Where this stands in one paragraph

Four phases looked for a music task whose difficulty GRPO can learn from. P2's synth lookup
failed both ends (variance collapse at distance 1–3, an execution wall at 5–11). P3's ABC
reharmonization passed the first two gates and failed the third — its difficulty was *notation*,
not harmony. P4's voice-leading found a trainable population at 2 voices, then failed the third
gate again on **representation**: the model cleared the full chorale rulebook 39% of the time by
opening on root-and-third (`[0,1]`) in **87.4%** of passing completions. **Exploring starts
fixed it** — pre-fill each rollout with a different valid opening and the funnel breaks
completely. The substrate is trainable. Nothing has been trained.

## The three gates (the transferable result)

| gate | question |
|---|---|
| 1 — choice | do rollouts in a group differ at all? |
| 2 — window | is single-shot *p* in band, with groups that split? |
| 3 — target | **is the difficulty located in the capability you want?** |

Gate 3 is not implied by the other two and had to be invented. Three surfaces failed it
differently: **notation** (P3), **one rule** (film-ambient — `overlap` was 168 of 168 failures),
**representation** (common-practice — one voicing satisfies the honest gate).

A fourth criterion: **non-degeneracy must always be quoted with its k-distribution.** A 1-of-8
and a 4-of-8 split both satisfy `std > 0` and both count once. 2-voice lead-sheet showed 0.281
non-degeneracy with 7 of 9 splits at k=1 — the scalar looked healthy and the histogram caught it.

## The numbers that matter

**Unconditioned, common-practice, 2 voices, 4 bars, G=16, n=32:**
*p* 0.389 · non-degeneracy 0.4375 · ρ 0.710 · `[0,1]` opens 87.4% of passers · within-group
uniqueness 0.356

**Same cell with exploring starts (every rollout a different valid opening):**
*p* **0.453 (CONDITIONAL)** · non-degeneracy **0.9375** · ρ **0.221** · within-group uniqueness
**1.000** · passing signatures **90.1% unique**

**The conditional and the unconditional must never share a table unlabelled.** 0.453 answers
"can it complete from anywhere", not "how hard is this task".

## THE NEXT BUILD — and how it fails without an error

Wire prefix forcing into training: the bridge must serve per-rollout prefixes, and TRL must
generate from them. `pod_smoke_p4.sh` as it stands validates a **superseded** configuration —
standard bridge, no forcing — so running it would produce a green receipt for an architecture
that has been abandoned. Do not run it unchanged.

**Five ways this build fails silently. None throw. All leave the headline metrics looking good.**

1. **THE GROUP IS NO LONGER A GROUP — measured, not speculated.** GRPO's group-relative
   advantage is valid because all G rollouts share a prompt. Different prefixes make the group
   16 different conditioning contexts, and openings are **not** equally hard:
   pass rate ranges **0.219 (`[1,1]`) to 0.563 (`[1,0]`)**, range 0.344, sd 0.101 — MATERIAL.
   The within-group advantage then partly grades *which opening the rollout was handed*.
   Receipt: `p4/scripts/opening-difficulty.mts`. **Decide deliberately**: either normalise
   advantage within opening-strata, or accept the nuisance term and say so in the write-up.
   (Incidentally `[0,1]`, the prior's favourite, sits BELOW average at 0.438 — the model does
   not prefer it because it works better.)
2. **Prefix tokens in the loss.** If the forced opening's tokens receive gradient, you train the
   model to *produce* the diversity you injected — reinforcing a choice it never made.
   Prefix-GRPO (arXiv `2607.19395`) deliberately DOES update prefix tokens; decide which you
   want and assert it, because both are defensible and only one is what you meant.
3. **TRL restarts instead of continuing.** If the prefix lands in the prompt rather than as a
   partial assistant turn, the chat template may open a fresh assistant header and the model
   composes its own opening. Forcing silently does nothing and `[0,1]` returns.
   **Assert that the completion STARTS WITH the prefix.**
4. **The prefix escapes scoring.** If the reward sees only the continuation, a rollout that
   violates on the forced measure is judged on the rest and rewards inflate. The local probe
   scores `prefix + continuation`; a TRL path must redo that. **Assert it.**
5. **Right padding.** Different-length prefixes need `padding_side="left"` or continuations
   begin after pad tokens. `probe_prefixed.py` sets it; a new path must too.

## THE FALSIFIER — preregister it before training, because pass rate is a trap

Primary outcome is **`top_first_measure_share` on an UNCONDITIONED eval** — scaffolding off,
nobody handing the model an opening:

- stays near **0.874** → the model learned to finish sentences. The scaffold was load-bearing
  and the typicality peak never flattened.
- drops materially → the peak flattened and the policy explores unaided.

**Pass rate will look fine either way.** Nothing measured so far bears on this: exploring starts
established the valid region is *reachable*, not that training makes it *preferred* once the
scaffold is removed.

## What a training run buys, stated before anyone spends

**Infrastructure and representation validation — not musical capability.** The nearest-tone
deterministic heuristic scores **32/32** on this identical pool, for free. A trained policy here
would lose to code already in the repo. The honest justification is the one an external reviewer
gave: it proves the reward landscape is dense enough to teach a known-solvable capability, which
transfers to a larger model or a task where no heuristic can be written. Do not write it up as
musical capability.

## Two traps above all others

**ρ was measuring the policy's prior, not the task.** 0.710 → 0.221 with no change to task, gate,
corpus or sampler. **This invalidates reasoning, not just figures** — arguments that ran *from* ρ
(whether G=8 sufficed, whether effective draws were too few, whether the band was reachable) were
about the prior's grip. Measurements stand; inferences need re-deriving.

**Checks that pass for the wrong reason cost more than failures.** `bash -n` accepting a literal
`\n`; `set -e` skipping the middle of an `&&` chain; `pkill -f` matching its own command line; a
well-formedness regex half-inert from a `0x08` byte; a green suite running where the missing
state already existed. A failing test stops you. A test that passes for the wrong reason lies,
and the lies compound.

## Housekeeping that is done

- **Population frozen in git**: `p4/fixtures/progressions-v1.json`, 32 progressions, derived
  chord symbols only. Equivalence proven — same songs, 0 progression diffs, 0 verdict
  disagreements over 256 completions, admit rate 0.4492 = the published figure.
  (`songs/library` ships 14 of 108 songs; the rest are fetched and not in git. A fresh clone
  built a 14-song pool and voided a paid run.)
- **Pool gate**: `/cases` 409s rather than truncating, `--require-pool` fails at startup,
  `/health` records `pool_source`.
- **Reward hack closed**: `verifyVoiceLeading` admits a realization with no sounding frames, so
  an unparseable completion scored **1.0**. Structure gate added; asserted in stage 0 of the pod
  script before any weights load.
- **`train.py --limit`** sized from the run; `prompt_repeats` halts on an unchosen repeat.
- **`--no-tools`** third branch for single-turn tasks; Stage C gates inverted on that path.
- **CI builds before it tests** — three test files had been silently skipping.
