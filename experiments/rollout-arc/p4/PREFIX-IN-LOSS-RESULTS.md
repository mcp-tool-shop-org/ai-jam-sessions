# `--prefix-in-loss` — results

**2026-09-13. Local RTX 5090, $0.** Readings fixed in `PREFIX-IN-LOSS-PREREG.md` (`1fae03e`)
before any run existed. Three runs, seeds 7/8/9, `--prefix-mode heterogeneous
--prefix-in-loss`, 200 steps, G=8, n=32, evaluated unconditioned at G=64 on the 75-item
held-out pool, generation seed 7, against the same base eval the gate used.

**Every interval in this file comes from one script, `scripts/pil-readout.mts`**, whose RNG is
seeded **per computation** rather than once per module. That matters: a module-level generator
is consumed in call order, so the same contrast computed by two scripts returns slightly
different bounds, and this arc published two of them for one quantity (C's pass lift as
`[+0.46, +11.03]` in `GATE-RESULTS.md` and `[+0.51, +11.09]` from a later script). The 0.05pp
is not a finding; **two published intervals for one contrast would be.** Numbers below are the
post-fix values and reproduce under re-execution. Where they differ in the last decimal from
`GATE-RESULTS.md`, that file predates the fix; the point estimates and every verdict are
identical.

---

## The arm ran. That is asserted, not assumed.

| check | PIL7L / PIL8L / PIL9L |
|---|---|
| `prefix_in_loss` | true |
| `prefix_tokens_total` | 25600 |
| `masked_prefix_tokens` | **0** — gradient reached the forced opening |
| `prefix_hits / rollouts` | 1600 / 1600 |
| `openings_per_group` | 8..8, alphabet of 16 covered |
| `boundary_clean` | true |
| `first_measure_wrong` | 1648 → 1648 (did not rise) |

Six adapters, six distinct SHA-256 prefixes, 504 LoRA tensors each; every G=64 log is 75 rows
and names its own adapter.

**Historical andon:** PIL7L trained correctly and was then VOIDED by the pre-existing
`arm_guards.py`, which asserted `masked == total` unconditionally because every forced arm that
existed when it was written masked the prefix. The message — *"prefix tokens took gradient"* —
described the entire point of this arm. `c25867c` made the check directional and strict in both
directions. Re-running it on the same receipt is clean. **The run was always valid; the guard's
contract had expired.**

---

## PRIMARY — opening concentration vs base (positive = MORE mode-locked)

Runs-and-items bootstrap, the preregistered estimator.

| arm | mean | 95% | |
|---|---|---|---|
| C plain GRPO | +2.44pp | [+0.07, +4.82] | excludes 0 |
| **PIL forced + gradient** | **+0.84pp** | **[−3.38, +5.09]** | **includes 0** |

## ARM-VS-ARM — PIL minus C (the comparative test; base cancels)

| contrast | mean | 95% | |
|---|---|---|---|
| concentration | −1.60pp | [−6.14, +2.69] | includes 0 |
| pass rate | −3.37pp | [−9.60, +1.35] | includes 0 |

## SECONDARY — held-out pass-rate lift vs base

| arm | mean | 95% | |
|---|---|---|---|
| C plain GRPO | +4.71pp | [+0.50, +11.07] | excludes 0 |
| PIL forced + gradient | +1.34pp | [−0.64, +4.03] | includes 0 |

---

## Scoring against `1fae03e`

| reading | condition | fired |
|---|---|---|
| 1 FLATTENS | excludes 0, negative | no |
| **2 RESISTS** | **includes 0** | **YES, by the condition column** |
| 3 SHARPENS TOO | excludes 0, positive | no |
| 4 AMBIGUOUS | anything else | no — a real interval containing 0 is reading 2 |

**Reading 2 fired. Its stated meaning is refused, and the refusal is required by the same
preregistration.**

Reading 2's meaning column says the arm *"stops the sharpening plain GRPO produces."* That is a
**comparative** claim. The condition that fired is a **non-comparative** CI-includes-zero. C
excluding zero while PIL includes it is not evidence that PIL differs from C — that is Gelman &
Stern 2006 (doi:10.1198/000313006X152649), which `GATE-PREREG.md` already made load-bearing.
The comparative test was run, as the prereg demanded, and returned **−1.60pp [−6.14, +2.69]**:
**PIL is not distinguishable from plain GRPO on the prior.**

> **This is a defect in `1fae03e`, not a save.** A reading's *meaning* must be entailed by its
> *condition*. If the meaning is comparative, the condition has to be the arm-vs-arm test. A
> document written specifically to block Gelman & Stern put Gelman & Stern in its own meaning
> column. That is the transferable lesson from this run.

**The secondary clause did not fire.** It was conditional on flattening ("if PIL flattens but
its pass-rate lift is distinguishably below C's, report a trade"). PIL did not flatten. What is
reportable is narrower: **C's gain is not recovered** — C's +4.71pp excludes zero, PIL's
+1.34pp includes it, and the direct contrast also includes zero. That is not "PIL costs pass
rate," which the data do not support.

**Reading 3 did not fire.** Reading 3 was the precommitted trigger to end the scaffolding
family. It is idle.

---

## The finding that is actually in the data

Two runs of one configuration produced significant effects **in opposite directions**, with
non-overlapping intervals (n=75 items, each run treated as fixed):

| run | concentration | |
|---|---|---|
| **PIL8L** | **+4.69pp [+2.02, +7.33]** | **sharpened** |
| PIL7L | +1.04pp [−1.75, +3.65] | neutral |
| **PIL9L** | **−3.21pp [−5.79, −0.35]** | **flattened** |

Per-run pass lifts: +0.79 / +2.94 / +0.29, all containing zero. None is C8L's +10.08pp.

**A conjunction over per-run verdicts is not the reading** — the same banner the gate carries.
The opposite-signed pair is a PIL fact: C's three runs are all the same sign (+2.92 / +3.27 /
+1.15), and two of those three contain zero.

**Between-run spread is a description of these three draws, not a tested claim.** C sd 1.14pp,
PIL sd 3.95pp, ratio 3.47×. F = 12.05 on (2,2) df against F_crit(0.05) = 19.00 — **equality of
variances cannot be rejected at K=3.** The non-overlapping opposite intervals above are the
defensible statement; the ratio is not.

This does retroactively make sense of the pod arm-C run's −9.00pp, which cost a mechanism claim
this morning: on this substrate a single run can land significantly in either direction. **P3
stays falsified** and masking-as-lever is not reinstated.

## The mechanism-shaped fact: the trajectory moved, the prior did not

| | C 7/8/9 | PIL 7/8/9 |
|---|---|---|
| dead groups | 76 / 70 / 62% | **46 / 39 / 48%** |
| effective updates of 200 | 48 / 61 / 77 | **109 / 122 / 104** |
| mean train entropy | 0.0149 / 0.0137 / 0.0149 | **0.0594 / 0.0460 / 0.0517** (~3.7×) |
| wall | ~48–51 min | ~29–30 min |
| eval concentration | all one sign | +1 / +5 / −3 pp |

Forcing visited the alternatives (1600/1600 hits), unmasked loss paid for producing them
(`masked=0`), groups split nearly twice as often, and training entropy ran ~3.7× higher. Then
the adapter samples free and the prior is a draw from a wide run distribution.
**PIL8L had the most effective updates (122) and the sharpest eval (+4.69pp)** — more gradient
on diverse openings did not predict flattening, the same lesson C9L taught on pass rate.

Scaffolding can change the training trajectory without moving the quantity it was built to move.

## What it would cost to answer the question

One-sample vs 0, 80% power, two-sided 0.05, from the measured between-run spread:

| effect | n (pooled sd 2.91pp) | n (PIL's own sd 3.95pp) |
|---|---|---|
| 3pp | 8 | 14 |
| 2pp | 17 | 31 |
| 1pp | 67 | 123 |

**Three sentences belong next to that table, not under it.** Arm-vs-arm needs roughly **2×**
these n per arm. The pooled column is pulled down by C's tight cluster, so PIL's own column is
the honest one for this arm. And σ is estimated from **three points** — its own 95% interval is
roughly 2–25pp, so every n here is a point estimate sitting on a wildly uncertain σ.

For scale: 5pp would have been reachable at K=3, and was — C's pass lift resolved, and C's
concentration just resolved with a lower bound of +0.07. PIL's mean did not.

## What this does not license

- **Not new capability.** Yue et al. 2025 (arXiv:2504.13837) still binds: a pass-rate gain is
  consistent with re-weighting what the base could already sample.
- **GX-Chen et al. 2025 (arXiv:2510.20817) still binds for plain GRPO** — its +2.44pp sharpening
  is what a KL-regularised optimum is predicted to do. It does not explain PIL, which is
  unresolved rather than sharpening.
- **Nearest-tone still scores 32/32** on the trained pool, for free.
- **No fifth scaffolding variant.** That refusal is the part of the prereg's "what would make me
  wrong" that still applies even though reading 3 is idle.

## The open question, and whose call it is

**"Can forcing plus unmasked prefix gradient move the unconditioned prior" is unanswered at
three runs per arm.** Answering it on this substrate costs 8–14 runs per arm for a 3pp mean,
roughly double that arm-vs-arm, with σ itself poorly estimated. A fourth seed will not settle
it; a fifth prefix variant will not settle it.

The alternative is a different question — the objective family (entropy term, divergence choice,
reward shape), which is where GX-Chen points. **That is a change of question, not a result, and
reading 3 did not fire.**

**Closing the scaffolding family is a Director decision justified by "K=3 cannot answer this,"
not something `1fae03e` scored.** The prereg's own leftover says a fourth seed "needs a fresh
decision after these three are read." This is that decision point.

## Receipts

`scripts/pil-readout.mts` (sole source of every interval above) ·
`runs/mc64-heldout-{base,C7L,C8L,C9L,PIL7L,PIL8L,PIL9L}.jsonl` ·
`runs/gate/arm-{C,PIL}{7,8,9}L/run.json` · `scripts/arm_guards.py` (`c25867c`, directional) ·
prereg `1fae03e` · gate `f09f20f` · sealed predictions `758c75f`
