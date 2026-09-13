# The replication gate — preregistered before any run exists

**2026-09-13. Written before a single local training step has been taken.** Supersedes the
gate described in `KICKOFF-research-continuation.md`, whose rule is retained below and
reported first, but is no longer the decision.

**Cost: $0.** Training runs on this rig's RTX 5090, the same device class the four-arm run
rented, with the five locked libraries matching exactly. The pod was an unexamined default,
not a constraint.

---

## Standards compliance (workflow-standards.md)

| standard | score | evidence |
|---|---|---|
| PIN_PER_STEP | **3** | Every arm pins model, steps, G, seed, style, voices, fixture, venv and commit. `train.py` writes `versions.{python,torch,transformers,trl,peft,accelerate,cuda,device}` into `run.json`, so the receipt records the interpreter rather than the intention. The venv is pinned explicitly because two exist on this rig at different Python versions. |
| ANDON_AUTHORITY | **3** | `arm_guards.py` halts an arm on a population or forcing mismatch before rewards are read; the bridge returns 409 and refuses startup on a short pool (`--require-pool 32`); `make_score_reward` raises on bridge failure rather than returning 0.0, because a silent zero is indistinguishable from a wrong answer. |
| NAMED_COMPENSATORS | **3** | See the table below. No irreversible external action occurs — no publish, no release, no tag push, no spend. |
| DECOMPOSE_BY_SECRETS | **2** | Statistic, fixture generation, prompt emission and scoring are separate modules sharing one code path (`vlCaseRow`, `scoreVoicing`). Not 3: the eval driver still duplicates generation-loop logic that `probe_generate.py` owns. Remediation: fold into one runner — owner advisor, next session. |
| UNCERTAINTY_GATED_HUMANS | **3** | The single human checkpoint fires on an uncertainty condition, not a step count: a fourth run is authorised only under the named ambiguity cell below. Contrastive framing required in the write-up. |
| EXTERNAL_VERIFIER | **3** | The research grounding passed a two-stage external check: a deterministic retrieval oracle (arXiv, Crossref, Semantic Scholar — no LLM) and two groundedness lenses from model families outside the synthesiser's lineage, reasoning stripped. Receipts in `research/`. The experiment's own scoring verifier is deterministic rule-based code, not a model. |

**Compensators.** Every action is local and reversible.

| action | compensator | post-rollback state | owner |
|---|---|---|---|
| write adapters to `runs/gate/adapter-C{7,8,9}L` | `rm -rf` that directory | disk as before; adapters re-derivable by re-running | advisor |
| write eval JSONL to `runs/mc64-*` | delete those files | prior receipts untouched — new filenames, nothing overwritten | advisor |
| commit prereg / results | `git revert` | history preserved | advisor |
| start the local bridge on :8766 | kill the PID in `runs/gate/bridge.pid` | port released | advisor |

No `npm publish`, no `gh release`, no tag push, no pod. Nothing here can spend money.

---

## Research grounding (the gate's empirical floor)

Every citation below resolved through a retrieval oracle and was rated SUPPORTED by **two
groundedness lenses from different model families**, reasoning stripped.

1. **A conjunction of per-run significance tests is a named statistical error.** Gelman &
   Stern 2006 (doi:10.1198/000313006X152649, *The American Statistician*) — the difference
   between "significant" and "not significant" is not itself significant. *Implication: the
   kickoff's "both seeds must exclude zero" rule is replaced as the decision. It is still
   reported, as a display.*
2. **In the few-run regime, report interval estimates aggregated over the run dimension and a
   robust aggregate, not per-run point estimates or binary thresholds.** Agarwal et al. 2021
   (arXiv:2108.13264). *Implication: the primary estimator is the across-run mean lift with a
   bootstrap over runs and items.*
3. **RLVR improves pass@1 while losing to the base model at large k.** Yue et al. 2025
   (arXiv:2504.13837). *Implication: a pass-rate lift is not licensed to be called new
   capability, and the write-up says so.*
4. **High-k pass@k is structurally biased against RLVR; restricting updates to problems with
   no observed success can lift Pass@256 above base.** Yuan et al. 2026 (arXiv:2606.15455).
   *Implication: finding 3 is contested and is reported as contested.*
5. **Under KL-regularized RL the optimal policy is by construction non-diverse at low KL
   coefficient.** GX-Chen et al. 2025 (arXiv:2510.20817). *Implication: the unmoved
   `top_first_measure_share` is the expected behaviour of the objective we ran, not a failed
   run. Any prior-flattening arm must change the objective's family, not add a bonus.*
6. **Prolonged RL over thousands of steps expands the boundary, with the largest gains where
   the base model is weakest.** Liu et al. 2025 (arXiv:2505.24864). *Implication: "we
   under-trained" is a live competing hypothesis, sharpened by the effective-update count
   below; our base is weak (11.2%), the regime where expansion is most likely.*
7. **Group-mean-centred advantage is exactly zero when a group is homogeneous, and a
   fixed-reference Sign advantage A=2r−1 substantially outperforms it at small group size.**
   Nie et al. 2026 (arXiv:2605.07689). *Implication: not used in this gate — recorded because
   it prices the main line.*
8. **Mode collapse can be substantially mitigated at inference time by prompting alone.**
   Zhang et al. 2025 (arXiv:2510.01171). *Implication: a $0 control that must run before any
   paid prior-flattening arm.*
9. **Random rewards produced large gains on Qwen math models and did not transfer to other
   families.** Shao et al. 2025 (arXiv:2506.10947). *Implication: our model is Qwen-family, so
   the flat random-reward arm is evidence, not proof, and is described that way.*

**Rated PARTIAL or weaker — background only, never load-bearing.** Miller 2024
(arXiv:2411.00640), He et al. 2026 (arXiv:2605.21125), Hochlehnert et al. 2025
(arXiv:2504.07086), Henderson et al. 2018 (arXiv:1709.06560), Colas et al. 2018
(arXiv:1806.08295), Cui et al. 2025 (arXiv:2505.22617), Chen et al. 2021 (arXiv:2107.03374),
Chen et al. 2025 (arXiv:2509.04784), Hu et al. 2025 (arXiv:2509.26209).

**Named limitation of the gate that produced those verdicts:** the lenses saw only abstracts.
NOT_SUPPORTED on a body-level empirical detail means "the abstract does not establish this",
not "the paper does not say it" — the Codex pass@k estimator is the clearest case. These are
demoted, not denied. Promoting any of them later requires a full-text check.

**One citation withdrawn during verification.** Nie et al. was initially cited for the claim
that a reward term constant across a group has zero gradient. Its abstract shows the failure
mode is homogeneous-group starvation — adjacent, not the same. The group-constant claim
stands on `grpo_trainer.py:2811` directly and needs no citation.

---

## What changed from the kickoff, and why

| | kickoff | here | why |
|---|---|---|---|
| decision rule | both seeds' intervals exclude zero | across-run mean lift, interval over runs and items | findings 1, 2 |
| power vs a true 2.0pp | **42%** | **98.4%** | the rule voted DOES-NOT-HOLD on its own point estimate more often than not |
| eval generations | G=16 | **G=64**, base and arms | 80% of per-item lift variance at G=16 is binomial noise (`gate-variance.mts`); generation is free |
| runs | seeds 8, 9 | **seeds 7, 8, 9, all local** | the pod was Linux/driver 580, this rig is Windows 11/driver 616; training new seeds here against a pod baseline varies platform alongside seed |
| hardware | pod, ~$1.60 | local, **$0** | same device class, five locked libraries identical |

---

## The design

**Training — three runs, identical but for `--seed`.**

```
venv     E:/AI/ai-jam-sessions/experiments/rollout-arc/p2/trainer/.venv   (python 3.12.13)
arm      --prefix-mode none --no-tools          (plain GRPO: arm C)
steps    200   G 8   per-device 8   --limit 32
lr 1e-5  beta 1e-4  eps 0.2/0.28  max-completion 384  LoRA r16 a32 all-linear
bridge   --voices 2 --style common-practice --seed 20260913
         --fixture fixtures/progressions-v1.json --require-pool 32
seeds    7 (platform anchor), 8, 9
```

Two venvs exist here — `.venv-p4` at python 3.11.15 and the trainer venv at 3.12.13. **The
trainer venv is pinned**, putting us patch-level from the pod's 3.12.3 rather than a minor
version away. `run.json` records which one ran.

`--seed` changes data order *and* LoRA init together: `GRPOConfig.seed` is applied after
`get_peft_model`, so init is not seed-controlled and no arm here pins it. That is the right
nuisance to resample for "does this hold across runs", and it is named rather than hidden.

**Evaluation — local, $0, unconditioned, G=64, generation seed held at 7.**

Held-out pool `fixtures/progressions-heldout-v1.json`, slice [32,107), n=75, overlap with the
training fixture 0, verified mechanically. Base is re-evaluated at G=64 because one base eval
is shared by every comparison and its noise never averages away. Trained pool [0,32) is a
secondary at G=16 against existing receipts.

Holding the generation seed fixed makes generation noise common across arms, which is what a
paired comparison wants. It also means we measure **one draw** of generation noise — a
limitation, not a control, and stated as such.

## Power

From the measured per-item variance in the seed-7 receipts (`gate-design-power.mts`):

| estimator | se | excludes 0 above | P(detect a true 2.0pp) | P(1.5pp) |
|---|---|---|---|---|
| across-run mean, K=3, G=64 | 0.488pp | 0.96pp | **98.4%** | 86.8% |
| kickoff rule, both of 2, G=16 | 0.857pp | 1.68pp | 42% | 17% |

**This power figure is itself computed from a single-seed variance estimate and is therefore
optimistic** — a σ from a small pilot is biased low. It is reported because it changes the
design decision by a factor of two, not because it is precise.

## Pre-committed readings

Lift = arm − base, paired by item, on the **held-out** pool. Intervals are a 10k bootstrap
resampling items, and for the across-run estimator, runs and items jointly.

1. **REPLICATES.** The across-run mean lift over {7L, 8L, 9L} has an interval excluding zero.
   The seed-7 result is not a single-run artifact.
2. **DOES NOT REPLICATE.** The across-run interval includes zero. The +2.0pp does not survive
   replication, the handoff's "settled" table is void, and that is reported as the finding —
   including that the arc's trainability claim rested on one run.
3. **REPLICATES SMALLER.** Interval excludes zero but its upper bound is below the pod-7
   point estimate of 2.0pp. The effect is real and the original magnitude was optimistic.
4. **PLATFORM CONFOUNDED.** local-7 vs pod-7, arm-vs-arm paired (base cancels), is
   distinguishable. Local and pod runs may not be pooled; readings 1–3 hold for local only.

**Per-run intervals are reported as a table and are explicitly NOT the decision.** A split
between runs is displayed as a split; no conjunction is taken over them.

**A fourth run (seed 10) is authorised only if** the across-run interval includes zero *and*
its point estimate is at or above 1.5pp — the ambiguous-but-promising cell. Any other outcome
ends the gate at three runs. Fixed now so it cannot be chosen after seeing the data.

## What this gate deliberately does not test

- **The typicality prior.** `top_first_measure_share` is recorded as a secondary with no
  threshold attached. Finding 5 says the objective we run has a non-diverse optimum by
  construction; asking this gate to move a prior would be asking the wrong run.
- **The Sign advantage** (finding 7), the entropy bonus, or any diversity reward. Each is a
  main-line arm and each is a build, not a flag: TRL exposes no advantage hook, and the
  kickoff's group-level diversity term would have had exactly zero gradient.
- **Effect versus effective-update count.** Measured from the run log, arm C ran with **72.5%
  of groups contributing no gradient — 55 effective updates of 200.** Every claim about "200
  steps" in this arc is, for arm C, a claim about 55.
- **Musical capability.** Nearest-tone scores 32/32 on the trained pool for free. That
  sentence stays in every write-up this gate produces.
