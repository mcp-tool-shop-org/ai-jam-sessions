# Rollout arc — research continuation (paste-ready, assumes no context)

**Repo:** `mcp-tool-shop-org/ai-jam-sessions` · `main` at `010b376`
**Budget:** $16.73 of $25 spent. **$8.27 remains.** No pods, nothing billing.
**Suite** 189 files green · tsc clean · working tree clean.

The Director reopened this after the advisor recommended closing it. That disagreement is
recorded in `HANDOFF.md` and is **not** re-litigated here: the ceiling on this task is a
problem a fifty-line heuristic solves perfectly, and what is being bought is knowledge plus a
**substrate that has now been validated with controls**. Proceed on that basis.

---

## Read this first — the pathology that produced every error in the last session

**Every one was a comparison against the wrong reference set, and every one produced a
plausible number that shaped a reported conclusion before it was withdrawn.**

1. **`prompt_repeats` counted ROWS**, and a row is an `(item, opening)` pair in the stratified
   design and an *item* in the heterogeneous one. 0.39 vs 6.25 looked like a 16x difference in
   epochs. **Item exposure was identical: 6.25 draws and 50 rollouts per item in both.** A
   whole "deconfounding run" was proposed to remove a variable that was never unequal.
2. **Arms were compared to BASE, and those deltas compared to each other in prose.** The
   direct arm-vs-arm test said *not distinguishable*. Two arm-vs-base numbers that look far
   apart are not a difference between arms.
3. **A held-out pool's "29 of 32 unseen" was computed against the OTHER EVAL POOL** instead of
   against the training fixture. It was 23 of 32. And **neither eval pool was the trained
   cell** — they were 4-chord and 5-chord progressions against arms trained on 8-bar, 6-8
   chord ones. A "memorisation" verdict was published off that and later withdrawn.

**The rule:** before any comparison, name the two sets explicitly and check membership
mechanically. `scripts/overlap-split.mts` exists because of this.

Also still live from earlier phases: **a rate measured at one `num_generations` is not a rate
at another**; **`bash -n` accepts a literal `\n`**; **`set -e` does not fire mid-`&&`**; **a
green suite on a dev rig is not evidence the repo is complete** (`songs/library` ships 14 of
108 songs).

---

## Settled. Do NOT re-test these.

| | |
|---|---|
| **prefix forcing** | contributes **nothing**. A−C +0.8pp [−1.4, +3.2], B−C +1.8pp [−1.1, +4.8] on 75 unseen songs. Dead. |
| **memorisation** | ruled out. The lift is as large on untrained songs as trained ones. |
| **drift** | ruled out. The random-reward arm took **198 effective updates against 111** and stayed flat (+0.3pp [−1.3, +1.8]). |
| **is the substrate trainable** | **yes** — 2.0–3.8pp held-out, intervals excluding zero, spread across `tendencySeventh`/`hidden`/`leap` rather than one gate. |
| **does the prior move at 200 steps** | **no.** `top_first_measure_share` 0.889 → 0.841/0.848/0.820, and the noise arm moved it **0.060 — more than either treatment**. |

Everything above is **one seed (7)**. That is the largest standing threat to all of it.

---

## What is already built, and it is most of the cost

- **Matched-cell pools, disjoint by construction.** One 107-progression pool, one shuffle
  (`mulberry32(20260913)`), one 8-bar window: `fixtures/progressions-v1.json` = slice `[0,32)`
  (trained), `fixtures/progressions-heldout-v1.json` = slice `[32,107)` (75 items, **overlap 0,
  verified**). Rebuild either with `SKIP`/`TAKE`/`OUT_NAME` on `emit-progression-fixture.mts`.
- **Prompts emitted from fixtures** through the bridge's own `vlCaseRow`
  (`emit-prompts-from-fixture.mts`), so eval and training prompts share one code path.
- **The statistic.** `matched-readout.mts` — paired by item, bootstrap + paired-t,
  arm-vs-base **and** arm-vs-arm. `failure-modes.mts` — which hard gate moves.
  `power.mts` — n needed for a given effect from the measured sd (~13pp/item; **n=75 resolves
  ~3pp**, n=32 resolves ~7pp).
- **Trainer.** `p2/trainer/train.py` with `--prefix-mode`, `--prefix-in-loss`,
  `--save-final-adapter`, `--random-reward`, `--no-tools`. Guards in
  `p4/scripts/arm_guards.py`. Pod script `p4/scripts/pod_train_p4.sh` (stage 0 proven twice).
- **Four trained adapters** from the last run, and the base-eval receipts.

**Evaluation is free.** It is generation plus scoring and the 5090 does it — only training
needs a pod. The last session's final three hours cost **$0**. Do not rent hardware to eval.

---

## The program, in order, with prices

### GATE — does it replicate? (~$1.60)

**Everything above is single-seed.** Re-run **arm C only** (`--prefix-mode none`, the simplest
arm and the one that carried the result) at **seeds 8 and 9**, 200 steps, same cell. Eval both
on the matched pools locally.

- **HOLDS** — both seeds lift on the held-out pool with intervals excluding zero. Proceed.
- **DOES NOT HOLD** — either seed's held-out interval includes zero. **Then the +2.0pp is a
  single-seed artifact, the "settled" table above is void, and the correct action is to stop
  and say so.** Write that down before running it.

Nothing below is worth spending on until this passes.

### MAIN LINE — can RL move a typicality prior at all? (~$2.80)

This is the better version of the question the arc was originally asking, and **forcing was
the wrong instrument for it**: exploring starts are a *rollout-collection* device: the terminal
objective never rewarded diversity, so there was never gradient pressure on the prior. The
policy learned to complete from anywhere and kept choosing `[0,1]`, which in hindsight is
exactly what that objective asks for.

Interventions that change the **objective** rather than the sampling:

| arm | change | one knob |
|---|---|---|
| control | plain GRPO, seed from the gate | — |
| **entropy bonus** | add a policy-entropy term | the objective |
| **diversity reward** | reward the group's distinct-signature count alongside admission | the reward |
| **beta = 0** | currently `1e-4` for KL logging; remove the anchor | the KL term |

Primary outcome is the one already built and already calibrated: **`top_first_measure_share`
on an unconditioned matched-cell eval, base 0.889, flattening pre-committed at < 0.70**, with
uniform-over-16-openings at 0.438 as the floor reference.

**A random-reward arm is mandatory.** It is what made the last run's conclusion unambiguous and
it is cheap. Do not drop it on the grounds that it was null last time — that justification
depended on the unforced control being null, which turned out to be false.

### Deferred, priced, not recommended yet

- **500 steps** (~$1.20). C saturated by step ~50; B was still climbing at 200. Does held-out
  lift grow, or is 2–4pp the ceiling? Interesting only if the gate holds.
- **A task with no free heuristic** (~unknown). The honest justification for the whole
  enterprise — "transfers to a task where no heuristic can be written" — is **untested**. This
  is the highest-value question in the arc and also the largest build.
- **The arm-A anomaly** (~$0.60). A's training `acc_joint` was flat (0.235 → 0.242) while B's
  and C's roughly doubled, yet A matched them on eval. **Three mechanisms proposed, three
  falsified** — including prefix-difficulty variance, which the data refuses: A's per-step sd
  is not the highest, C's is, and the sd ordering tracks group degeneracy exactly. Left open
  deliberately. Do not attach a fourth story without a control.

---

## Non-negotiables for any run

1. **Preregister before spending.** Thresholds, readings **per arm** (pair-level readings broke
   twice when arms split), and what would falsify the claim. `MATCHED-CELL-PREREG.md` is the
   template that worked.
2. **Matched cell, or it measures nothing.** Train and eval on the same window and chord
   shape. Check overlap against the **training fixture**, mechanically.
3. **Paired by item.** n = items, not completions. ρ is 0.6–0.75 here, so treating 512
   completions as independent makes intervals ~3.5x too narrow — and a design-effect
   correction on *independent* samples is equally wrong, because the pools are paired.
4. **Arm-vs-arm, not just arm-vs-base.**
5. **Dead-man armed BEFORE staging.** The pod bills from creation. Routing took **19.7 minutes**
   last time and three pods were killed prematurely on a 5-minute cap that came from a memory
   note describing a *warm* host — $0.245 wasted. Be patient; the dead-man is the real control.
6. **`PYTHONIOENCODING=utf-8` on Windows** for any local `train.py --dry`.

## What a positive result would and would not buy

It would not make this musical capability. Nearest-tone still scores **32/32** on the trained
pool for free, and the policy still opens `[0,1]` almost every time. What is on the table is a
question with no known answer — *can RL move a typicality prior, and at what cost* — measured
on a substrate that is now known to be trainable and known to be immune to drift. Say that in
the write-up and do not soften it afterwards.
