# B0 vs C — preregistered before any pod exists

**2026-09-14.** The first RunPod cell after both study-swarms. Cell fixed in
`PLANNING-LOCK.md`; this document fixes the readings, the guards and the compensators, and is
pushed to `main` **before** any `runpod create`. Ledger `948d48d`, packs `c894a6c` +
`STUDY-SWARM-GROK.md`.

**One lever: `--beta`.** Control C is `1e-4`, the pin every run in this arc has used.
Treatment B0 is `0.0`, which is **TRL's own default** — the arc moved off it deliberately, and
the reason it moved is the finding this cell tests.

---

## Standards compliance (workflow-standards.md)

| standard | score | evidence |
|---|---|---|
| PIN_PER_STEP | **3** | `train.py` now writes `loss_type`, `scale_rewards`, `num_iterations`, `entropy_coef`, `use_adaptive_entropy`, `entropy_target`, `top_entropy_quantile` into `run.json` **read off the resolved `GRPOConfig`**, alongside the existing `versions.{python,torch,transformers,trl,peft,accelerate,cuda,device}`. Every prior run in this arc omitted the loss formulation entirely. Commit and pod image are pinned by `P4_COMMIT`; the venv is named explicitly because two exist on this rig. |
| ANDON_AUTHORITY | **3** | `beta_guards.py` halts an arm before its rewards are read, and every check is **directional** — B0 must have no `kl` series, C must have one. Tested in both directions on synthetic receipts and against a real pre-fix receipt **before any pod exists** (see §ANDON). `arm_guards.py` still enforces population and forcing; the bridge refuses startup on a short pool (`--require-pool 32`); `make_score_reward` raises rather than returning 0.0. |
| NAMED_COMPENSATORS | **3** | Full table in §Compensators, with command-to-undo, post-rollback state and owner, for the three irreversible actions (`runpod create`, the git push of this file, the adapter fetch). Dead-man armed **before** staging, because the pod bills from creation. |
| DECOMPOSE_BY_SECRETS | **2** | The objective pins (`beta_guards.py`) are separated from the population/forcing pins (`arm_guards.py`) because they change for different reasons; readout is `pil-readout.mts`'s successor and is the sole interval source. Not 3: the pod script is still one file mixing staging, training and eval. Remediation: owner Claude, next cell. |
| UNCERTAINTY_GATED_HUMANS | **3** | The gate is the minimum-detectable-effect table in §Power, fixed before the runs: this cell can resolve ~2.6pp only if B0's between-run spread resembles C's, and nothing under ~9pp if it resembles PIL's. Reading 2 (UNRESOLVED) is named as the modal outcome for a true effect below ~3pp **in advance**. The Director's checkpoint is `runpod create`, which does not happen until this file is on `main`. |
| EXTERNAL_VERIFIER | **3** | The reward is a deterministic voice-leading checker, not a model. The citation floor was gated by a four-provider retrieval oracle (`verify-multi.py`), 26 of 27 ids confirmed by two independent registries; the one exception is excluded from this lock by name. |

---

## Research grounding (this cell's empirical floor)

Every id below is CONFIRMED by two independent registries (`research/oracle-multi-2026-09-14.txt`).
**Jin et al. arXiv:2511.05993 is excluded by the lock** — single-provider at the re-gate — and
nothing here rests on it.

1. **With `beta > 0`, a zero-std group contributes nothing to the policy term and its KL term
   still carries gradient.** huggingface/trl#5588, closed **not_planned** 2026-05-22; the
   maintainer's closing position is that this matches the canonical GRPO objective, where KL
   is applied per-token independently of the advantage, and that DAPO itself runs `beta = 0`.
   Confirmed in installed source: `grpo_trainer.py:3243`,
   `per_token_loss = per_token_loss + self.beta * per_token_kl`. **46–76% of this cell's groups
   are zero-std.** *This is the mechanism the cell removes.*

2. **Our `beta=1e-4` was an observability choice, not a regularisation one.** `p2/BUILD.md:254`
   records that TRL's default is `0.0` and that `1e-4` was set so a `kl` series would be
   logged at all (R4.9/R4.18). *So B0 is a return to the library default and C is the
   deviation — which is the opposite of how the arms read.*

3. **A KL-regularised RL optimum is non-diverse by construction at low β with equal verifiable
   rewards.** GX-Chen, Prakash, Guo, Fergus, Ranganath 2025 (arXiv:2510.20817), abstract:
   commonly used settings such as low regularization strength and equal verifiable rewards
   tend to specify unimodal target distributions. Our cell is β=1e-4 and a binary verifier —
   both conditions. *This predicts C's measured +2.44pp sharpening and makes β the named term.*

4. **The same paper's β→0 limit is not automatically diverse.** Its eq. (20) hands the shape of
   the optimum to the entropy coefficient once β is gone. *This is why reading 3 exists and is
   not a throwaway: SHARPENS ANYWAY is a predicted outcome, not a failure mode.*

5. **Skywork-OR1 omits KL entirely** (§3.2.6, on the finding that the KL penalty hinders
   further test-performance improvement during multi-stage training), and **DAPO runs β=0**
   (finding 1). *Both papers this cell leans on run the treatment arm's setting.*

6. **An entropy bonus is not the alternative.** GX-Chen state the issue is identically present
   for entropy-only regularization; Skywork's constant-coefficient grid collapses the model at
   every value from 1e-4 to 1e-2; TRL's adaptive controller at `entropy_coef_delta=0.005` ramps
   to `entropy_coef_max=1.0` by step 200. *Arm E is excluded by the lock and this is why.*

7. **Dynamic sampling cannot reach most of our silence.** Per-prompt silence under a binary
   verifier is `p⁸+(1−p)⁸`, exactly 1.0 at p=0 or 1; DAPO (arXiv:2503.14476) resamples against
   a 17k pool while ours is a frozen 32. verl ships `max_num_gen_batches: 0` — unbounded.
   *Arm DS is excluded by the lock and this is why.*

8. **A distributional primary may not be scored against a control from another machine.**
   Hochlehnert et al. 2025 (arXiv:2504.07086) measured a local cluster against Runpod at
   7.3%±3.8 vs 11.3%±3.6 on identical software; *Dataset-Level Metrics Attenuate
   Non-Determinism* (arXiv:2604.13413) reports dataset-level accuracy std ≈0.001–0.003 against
   sample-level 0.30–0.50 across precision, GPU type and batch size (**caveat: diffusion
   language models**). *This is why the cell buys its own C. It is not the only reason —* see
   finding 9.

9. **Our own local C receipts could not serve as this cell's control even on the same machine.**
   Run `beta_guards.py arm runs/gate/arm-C7L/run.json C` today and it VOIDs: the receipt
   predates the `trl_metrics` capture and records none of `loss_type`, `scale_rewards`,
   `num_iterations`, `entropy_coef`, `use_adaptive_entropy`. *A control whose objective pins
   are unrecorded cannot be shown identical to the treatment on anything but β.*

10. **A seed-only split of one configuration can produce a "significant" difference.** Henderson
    et al. 2018 (arXiv:1709.06560): 10 trials, seed-only, split 5/5, t=−9.0916, p=0.0016. And
    in this arc `--seed` does not control LoRA init. *This is why per-run verdicts are display
    only and the conjunction over them is never the reading.*

11. **Aggregate over the run dimension; do not compare significances.** Agarwal et al. 2021
    (arXiv:2108.13264) prescribes interval estimates aggregated over runs; Gelman & Stern 2006
    (doi:10.1198/000313006X152649) is the error of reading "A excludes zero, B does not" as a
    difference. *This is the defect `1fae03e` shipped and §Readings is written to prevent.*

---

## The design

| | control **C** | treatment **B0** |
|---|---|---|
| `--beta` | `1e-4` | **`0.0`** |
| `--prefix-mode` | `none` | `none` |
| steps / G train / n | 200 / 8 / 32 frozen fixture | identical |
| ε / ε_high | 0.2 / 0.28 | identical |
| `loss_type` / `scale_rewards` | `dapo` / `group` (pinned, now recorded) | identical |
| `entropy_coef` / `use_adaptive_entropy` | `0.0` / `False` | identical |
| seeds | 7, 8, 9 | 7, 8, 9 |
| eval | unconditioned **G=64**, 75 held-out items, generation seed 7 | identical |
| platform | **the same pod, the same image, the same session** | same |

Plus **one base eval** (no adapter, G=64, same 75 items) on that pod. It anchors each arm's
vs-base number, and it is the first clean cross-platform comparison of **concentration** at
matched G — `platform-concentration.mts` could only do that at G=16 by subsampling.

**Six adapters, six evals, one base eval.** Priced at **$7.25** on 5090 community (both arms
charged at C's measured wall, which over-prices B0: at `beta == 0` TRL skips the reference
log-prob forward pass, `grpo_trainer.py:2732`, and the saving is deliberately not modelled
because it has never been measured on this cell).

---

## Power — fixed before the runs, not discovered after

Minimum detectable effect at K=3, 80% power, two-sided 0.05. The primary is **arm-vs-arm**, a
difference of two K-run means, so it carries `sqrt(2/K)` and not `1/sqrt(K)`:

| between-run sd assumed | one-sample | **ARM-VS-ARM** |
|---|---|---|
| C's own measured 1.14pp | 1.84pp | **2.61pp** |
| pooled C+PIL 2.91pp | 4.71pp | **6.66pp** |
| PIL's own 3.95pp | 6.39pp | **9.04pp** |

**Three sentences belong beside that table, not under it.** Which row obtains is not knowable
until the runs exist — B0 is a new arm and its spread is unmeasured. **Reading 2 (UNRESOLVED)
is the modal outcome for any true effect below ~3pp**, and that is stated here rather than
discovered afterwards. σ is estimated from three points in every row, so each figure is a point
estimate on a wildly uncertain σ.

---

## Pre-committed readings

**PRIMARY: B0 − C, item-wise opening concentration, paired by item, runs-and-items bootstrap,
95%.** Positive = B0 is MORE mode-locked. This is the comparative test, so the comparative
meaning is entailed by it — the defect `1fae03e` shipped was a comparative meaning hung on a
non-comparative condition, and it is not repeated.

| reading | condition on **B0 − C** | meaning |
|---|---|---|
| **1 STOPS THE PULL** | excludes 0, **negative** | removing the silent-group KL term flattens the prior relative to the control |
| **2 UNRESOLVED** | **includes 0** | B0 and C are not distinguishable on the prior at K=3. Nothing further is claimed; in particular this does **not** mean β is inert |
| **3 SHARPENS ANYWAY** | excludes 0, **positive** | GX-Chen's β→0 limit (finding 4): the reward maximiser is unimodal without the KL term too |

**SECONDARY: B0 − C held-out pass rate, same estimator.** Reported in every case. A flattening
that loses C's replicated lift is a **trade**, and the word for it is "trade" — this clause is
conditional on reading 1 firing and on the pass-rate interval excluding zero and being negative.
If reading 1 does not fire, no trade is reported, because there is no flattening to trade against.

**Each arm vs base is reported and is NOT the decision.** Per-run intervals are printed as a
table and are explicitly not the reading; no conjunction is taken over them (findings 10, 11).

**PLATFORM, as a by-product:** pod-base minus local-base on concentration, G=64, same 75 items,
paired. Reported with its interval. If it excludes zero, `POD-LEDGER.md` §8 is upgraded from
"cannot separate machine from draw" to a measured platform effect on the base model — and the
arm-vs-arm primary is unaffected either way, because both arms are on the same pod.

**No fourth seed** is authorised by this document. If the primary includes zero, that is
reading 2 and the cell ends at K=3; buying more seeds is a fresh decision with a fresh price.

---

## ANDON — what voids an arm before its rewards are read

`beta_guards.py arm <run.json> <C|B0>` — every check directional:

- `config.beta` is exactly `1e-4` (C) or `0.0` (B0).
- **`trl_metrics.kl_logged` is `True` for C and `False` for B0.** `beta` records the request;
  this records the consequence. TRL appends the `kl` series only when `beta != 0`
  (`grpo_trainer.py:3360`) and skips the reference forward pass on the same condition (`:2732`).
  A B0 run that logged `kl` is not B0. **A C run that did not log `kl` is a second B0**, and
  voiding only one direction is exactly the bug `c25867c` fixed in `arm_guards.py`.
- `entropy_coef_logged` is `False` on both arms — no entropy bonus is live.
- `loss_type=dapo`, `scale_rewards=group`, `num_iterations=1`, `entropy_coef=0.0`,
  `use_adaptive_entropy=False`, `num_generations=8`, `epsilon=0.2`, `epsilon_high=0.28`,
  `dataset_rows=32`, `trl==1.13.0` — all recorded, all identical across arms.

`beta_guards.py cell <runs-dir>` — **six adapters with six distinct SHA-256 digests** (a reused
run is caught by bytes, not by filename), and every `mc64-heldout-*.jsonl` is 75 rows wide with
exactly 64 completions per item.

`arm_guards.py <run.json> none 32` still runs, unchanged, for population and forcing.

**Tested before any pod exists**, which is the point of the file being separate from the pod
script: `beta_guards.py` passes both arms on synthetic receipts, VOIDs a B0 fixture that
silently kept its KL term, VOIDs each arm's receipt when labelled as the other, and VOIDs the
real `arm-C7L/run.json` for having no `trl_metrics` block and none of the four objective pins.

---

## Compensators

| irreversible action | command to undo | post-rollback state | owner |
|---|---|---|---|
| `runpod create` | `deadman-p2.ps1 -PodId <id> -CapSeconds <cap> -Label b0cell`, armed **before** staging; babysitter terminates on `ALL.DONE` | pod terminated, billing stops, container disk discarded | Claude |
| this prereg pushed to `main` | `git revert <sha>` — never a force-push; a prereg that vanished is worse than one that was wrong | the document stands with its retraction attached | Claude |
| adapter fetch to this rig | `rm -rf runs/pod-b0/adapter-*` | local disk only; nothing billed, nothing published | Claude |

**Dead-man, derived from the Director's $12 ceiling** (not the $18.56 balance, not the $8.31
project remainder), holding back $0.20 for the termination tail measured in `948d48d` and
$0.014/hr for container storage:

| SKU | cap | worst case |
|---|---|---|
| **RTX 5090 community $0.69** (the cell) | **16 h / 57600 s** | $11.46 |
| RTX 5090 secure $0.99 (fallback) | **11 h / 39600 s** | $11.24 |

⚠ **Stated plainly:** the cell costs **$7.25** on community and **$10.40** on secure. The
secure fallback therefore exceeds the **$8.3077** project remainder recorded in `948d48d`,
though it stays inside the $12 ceiling and the $18.56 balance. The ceiling is the Director's
and it is higher than the old remainder; that is a deliberate raise and is recorded here so
nobody discovers it from a bill.

**No funds are to be added.** **No network volume** — the account has none today and an
auto-created one keeps billing after the pod dies. Container disk only. Stage 0 keeps
`--require-pool 32` against the frozen fixture; a 14-song library pool is what voided the first
paid smoke run.

---

## What this cell deliberately does not test

- **Whether β=0 is *better*.** It tests whether removing the term changes the prior, on this
  substrate, at K=3. Reading 2 is a real and likely answer.
- **Entropy, dynamic sampling, MARA, a fifth prefix variant, an offline prompt filter.** All
  excluded by the lock; findings 6 and 7 are why for the first two, and the last changes the
  population, which would need a new fixture and a new control.
- **Anything at β strictly between 0 and 1e-4.** Two points, one lever.

**Foreclosed, stated now:** β=0 makes MARA identically inert (its augmentation is β-scaled). If
this cell does not move the prior, the next question is the environment or a build — it is
**not** "add entropy on top of β=0".

## What would make me wrong

- B0's between-run spread comes in wide (like PIL's 3.95pp). Then the MDE is ~9pp, reading 2
  fires on almost any real effect, and this cell will have bought a null that means little.
  That is priced into the readings above, not discovered after.
- The `kl_logged` ANDON is a proxy: it proves TRL took the `beta == 0` branch, not that no
  reference computation happened anywhere. If a future TRL logs `kl` unconditionally, this
  guard silently inverts — which is why `trl == 1.13.0` is itself asserted.
- Reading 3 firing would be the interesting outcome and the one that ends the objective family
  the way reading 3 of `1fae03e` was meant to end the scaffolding family. It is written as a
  real reading, not a formality.

## Receipts

`PLANNING-LOCK.md` · `scripts/beta_guards.py` · `scripts/pod-ledger.py --ceiling 12` (sole
source of every dollar and every MDE figure) · `scripts/arm_guards.py` (`c25867c`) ·
`p2/trainer/train.py` (`trl_metrics` capture + four config pins) ·
`research/oracle-multi-2026-09-14.txt` · `POD-LEDGER.md` (`948d48d`) ·
`STUDY-SWARM-CLAUDE.md` (`c894a6c`) · `STUDY-SWARM-GROK.md` · huggingface/trl#5588 ·
installed `trl` 1.13.0 `grpo_trainer.py:2732, 3243, 3360`
