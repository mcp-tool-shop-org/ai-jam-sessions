# Claude's return on `DELEGATION-claude-runpod.md`

**2026-09-13, at `1619f71`. $0 spent, no GPU touched, no pod created, no local training.**
Grok owns the cell lock; this file is receipts, prices and pin holes, plus two things the
delegation did not ask for and that change the answer.

**Every dollar figure comes from one script, `scripts/pod-ledger.py`**, which reads the
measured walls out of the six `run.json` receipts and the two eval logs, then reconciles
against the live RunPod account. Nothing here is estimated from a rate measured in one
condition and spent in another — that is the error that made the four-arm session's held-out
evals cost six times their estimate.

---

## 1. The ledger

```
spent      $16.6923   = $11.25 pre-four-arm  +  $5.4423 four-arm (account delta)
remaining  $ 8.3077   of the $25 project budget
last SKU   RunPod RTX 5090 32 GB, ~$0.99/hr  (NOT the PRO 6000 — see below)
```

**Live account, queried read-only just now:** balance **$18.5577**, `currentSpendPerHr` **0**,
**0 pods**, **0 network volumes**. Nothing is billing.

`FOUR-ARM-RESULTS.md:164` recorded the post-session balance as **$18.5980**. The live balance
is **$0.0403 lower**. That is a *termination tail* — about 2.4 minutes of pod time at ~$1/hr
that landed after the balance was read — not a drip: there is no pod, no volume and no
endpoint to bill. The kickoff's `$8.27` was right to within that same four cents.

Everything since the four-arm pod was local and free: C7/8/9L, PIL7/8/9L, the G=64 evals, the
VS control. `$0.0000`.

> **Correction to the delegation's premise.** `DELEGATION §2` prices "RTX PRO 6000 96 GB (last
> arc SKU)". It was not. `runs/pod-4arm/arm-{A,B,C,D}.json` all record
> `NVIDIA GeForce RTX 5090`, 32,109 MiB — and `$2.80 / 2h50m = $0.99/hr` is exactly today's
> RTX 5090 **secure** price. The PRO 6000 at $1.69 was **p2's** card. This matters: the 5090
> is the only SKU in this arc with a **measured** wall, and at community pricing it is
> **cheaper than the RTX 6000 Ada** ($0.69 vs $0.74).

## 2. Priced cells — live prices, measured walls

Inputs, all receipts: C train **49.2 min** mean (2963/2855/3045 s) · PIL train **29.4 min**
(1742/1761/1789 s) · G=64 adapter eval **39.5 min** (six, 2361–2405 s) · G=64 base eval
**35.7 min** · pod/local throughput **1.072** (pod arm C 15.83 s/step against the local C mean
14.76) · staging+routing+tail **0.35 h**. Peak reserved **23,282 MiB** on the pod's own 5090 —
every SKU below fits, 48 GB is not needed for memory.

| cell | GPU-h | 5090 comm $0.69 | 5090 sec $0.99 | Ada 48 $0.74 | PRO 6000 $1.69 | A6000 $0.33 |
|---|---|---|---|---|---|---|
| (i) 8 PIL + base | 10.85 | **$7.48** | $10.74 ✗ | $8.03 ⚠ | $18.33 ✗ | $3.58 ⚠ |
| (ii) 14 PIL + base | 18.24 | $12.58 ✗ | $18.06 ✗ | $13.50 ✗ | $30.82 ✗ | $6.02 ⚠ |
| (iii) 3-seed new arm, scored vs **local** C | 5.75 | **$3.97** | **$5.69** | $4.25 ⚠ | $9.72 ✗ | $1.90 ⚠ |
| (iv) 3-seed new arm **+ its own 3-seed C control** | 10.51 | **$7.25** | $10.40 ✗ | $7.78 ⚠ | $17.76 ✗ | $3.47 ⚠ |

✗ = over the $8.31 remaining. ⚠ = fits **only** at an assumed throughput equal to the 5090's,
which this arc has never measured on that card. Break-even slowdowns are printed by the
script: the Ada breaks cell (i) above **1.04×** and cell (iv) above **1.07×** — i.e. the Ada
is priced inside budget only if it is not measurably slower than a 5090, which is not a bet
worth making. The A6000 has real headroom (cell (iv) breaks only above **2.40×**) but it is
Ampere and completely unmeasured here.

**Findings the delegation asked me to flag:**

- **(ii) 14 PIL is unaffordable on every SKU**, including the A6000 at an implausible 1.0×.
  It is not a budget decision; it is off the table.
- **(i) 8 PIL fits on exactly one SKU** (5090 community, $7.48 of $8.31) and leaves **$0.83**.
  Its dead-man would have to be capped at 11 h = **$7.94 worst case**, leaving $0.37. That is
  a cap sized to the whole remaining budget for a cell the research says is the wrong
  purchase — and 8 PIL against **3** local C runs is arm-vs-arm at K=3 anyway, because power
  is set by the smaller arm. It buys the appearance of 8 seeds, not the power of them.
- **(iii)/(iv) fit.** (iv) is the honest one — see §8.

## 3. Pin hole: `loss_type` (confirmed, independently)

`train.py:409-435` constructs `GRPOConfig` with **no `loss_type`**. Installed
`trl/trainer/grpo_config.py:796` reads `loss_type: str = field(default="dapo")`, and the help
text names DAPO's global-active-token normalization as the default. TRL is **1.13.0**
(`trl-1.13.0.dist-info` in `p2/trainer/.venv`).

**All six local runs and all four pod arms were already DAPO.** "Switch to DAPO" is not an
arm. `run.json`'s `config` block (`train.py:543-558`) records `beta`, `epsilon`,
`epsilon_high`, lr and LoRA — and **not** `loss_type`. Verified empirically: `"loss_type" in
run["config"]` is `False` on the gate receipts.

Three more knobs are un-pinned and un-recorded the same way, all at TRL defaults:

| knob | installed default | why it belongs on the receipt |
|---|---|---|
| `loss_type` | `"dapo"` | the whole point above |
| `scale_rewards` | `"group"` | Dr. GRPO argues *against* std-scaling; we take it silently |
| `entropy_coef` / `use_adaptive_entropy` | `0.0` / `False` | proves the six runs had **no** entropy term |
| `num_iterations` | `1` | why `clip_ratio` is inert (already in memory) |

**This is a pin fix, not a cell.** `PIN_PER_STEP` says a wave is byte-for-byte replayable; a
receipt that omits the loss formulation is not.

## 4. The entropy bonus is a flag — and arm E as drafted is mis-specified

Confirmed by reading installed source, not by running. `GRPOConfig` has `entropy_coef` (0.0),
`use_adaptive_entropy` (False), `entropy_coef_min` (0.0), `entropy_coef_max` (**1.0**),
`entropy_coef_delta` (0.005), `entropy_target` (0.2), `top_entropy_quantile` (1.0).
**`GATE-PREREG.md` calling the entropy bonus "a build" is out of date. Grok is right.**

Two corrections to the drafted arm, both from `grpo_trainer.py:3279-3340`:

**(a) "A coefficient multiplied by nothing" is wrong.** The bonus is
`loss = loss - apply_coef * entropy_loss`, where `entropy_loss` is the mean per-token entropy
over the completion mask. **It is not multiplied by the advantage.** On a zero-std group the
*policy* term vanishes and the *entropy* term does not. So on the 46–76% of our groups that
currently produce no gradient, an entropy bonus produces gradient on every completion token.
That makes arm E **more** live in our regime, not less — the opposite of the reason given for
preferring DS.

**(b) `entropy_target=0.2` turns the controller into an open-loop ramp.** The rule is:
increment `entropy_coef` by `delta` when measured entropy ≤ target, decrement otherwise,
clamped to `[min, max]`. Our measured train entropy is **0.0137–0.0149 (C)** and
**0.046–0.059 (PIL)** — an order of magnitude *below* 0.2. The gate is therefore open on every
step, the coefficient only ever increments, and from 0.0 at 0.005/step it reaches
`entropy_coef_max = 1.0` at **exactly step 200**. What gets run is not "Skywork's controller at
its default setpoint"; it is a linear 0 → 1.0 entropy-coefficient ramp with no negative
feedback, and the result could not be attributed to the target.

TRL's own field help says this in reverse: *"Typical language models have per-token entropies
of 2–10 nats, so the default of 0.2 almost never triggers … **set it close to the entropy
observed early in training and tune from there.**"* We are the collapse case that sentence
brackets out. Following the instruction means `entropy_target ≈ 0.02–0.06`, not 0.2.

**Do not invent the coefficient** — so I have not. This is a flag to be named by whoever names
the cell, with the ANDON hook already present: `entropy_coef` is appended to the metrics on
every train optimizer-step boundary (`grpo_trainer.py:3338`), so the realised trajectory can
be asserted in `run.json` rather than assumed.

**Dynamic sampling, checked the same way: TRL 1.13.0 has none.** No `dynamic_sampling`, no
resampling, no group filter anywhere in `grpo_config.py` or `grpo_trainer.py`. The trainer
*logs* `frac_reward_zero_std` (`grpo_trainer.py:2856`) and trains on the zeros. **Arm DS is a
build. Grok is right about that too.**

## 5. `pod_train_p4.sh` — the delta, as a comment list

Not rewritten. It is still the four-arm cell and the gap is wider than "eval G=16":

1. **`EVAL_GENS=16` → 64.** Named in the delegation.
2. **⚠ It evaluates on the WRONG POOL.** Both the base eval and every arm eval run against
   `spec-prompts-4bar-random.jsonl` — the **32-item trained** pool. The gate and PIL readouts
   are `prompts-heldout-v1.jsonl`, **75 held-out items**, written to `mc64-heldout-*.jsonl`.
   This is a bigger break in comparability than G, and it is the arc's signature pathology.
3. **`TRAIN_SEED=7` only, and it seeds train *and* eval generation.** The local runners fix
   generation seed 7 while varying the train seed across 7/8/9 (`gate_eval_local.sh` passes
   `--seed 7` unconditionally). A K=3 pod cell must separate the two.
4. **Arms A–D are hard-coded** at the bottom (`run_arm A stratified` … `run_arm D
   heterogeneous --random-reward`). None is the cell under discussion.
5. **Scoring path differs.** The script scores with `score-curriculum.mts`; every published
   interval in `1619f71` comes from `pil-readout.mts` over `mc64-heldout-*.jsonl`. One source,
   or the intervals are not comparable.
6. **No `--entropy-coef` / `--use-adaptive-entropy` passthrough** on `train.py`, and no receipt
   field for them (§3, §4).
7. **`MAX_SECONDS=21600`** (6 h) is sized for four arms; it must be re-derived from §7.
8. **No dead-man is armed by this script.** That is `deadman-p2.ps1`, armed separately and
   **before** staging (the pod bills from creation).
9. `arm_guards.py` is now directional (`c25867c`); the call signature
   `arm_guards.py <run.json> <mode> <limit>` still matches, so this one is fine.

Kept as-is until the cell is named, per the delegation.

## 6. Citation gate — five papers, not three

Grok's second message cites two more than the delegation lists, so all five were gated.

**Both scripted oracles are rate-limited right now and returned NO VERDICT.** `verify-arxiv.py`
exited 2 after four backoffs (`HTTP 429` × 4); `verify-s2.py` exited 2 the same way. Per the
rule written into those scripts, **a transport failure is never reported as a missing paper**.
The pipe itself is healthy (22.4 MB/s to Cloudflare), so this is provider throttling, not us.

A **third, mechanism-diverse retrieval path** — the `arxiv.org/abs/<id>` HTML frontend, a
different service from `export.arxiv.org/api` — returned HTTP 200 with matching
`citation_title` / `citation_author` / `citation_date` metadata for all five:

| id | title | first authors | date | claim it is being used for | verdict |
|---|---|---|---|---|---|
| 2607.19395 | *From Trajectories to Prefixes…* (Prefix-GRPO) | Wang, Guan, Sun, Huang | 2026-07-03 | evaluates free Avg@8/Pass@8, never tests an unconditioned prior | **exists; abstract supports the framing** |
| 2505.22312 | *Skywork Open Reasoner 1 Technical Report* | He, Liu, Liu, Yan | 2025-05-28 | entropy collapse; adaptive entropy control | **exists; abstract attests the entropy-collapse investigation** |
| 2503.14476 | *DAPO: An Open-Source LLM RL System at Scale* | Yu, Zhang, Zhu, Yuan | 2025-03-18 | dynamic sampling | **exists; "Dynamic Sampling" is in the algorithm name** |
| 2509.10423 | *Mutual Information Tracks Policy Coherence in RL* | Reid, Hafez, Nazeri | 2025-09-12 | MI rises while state entropy grows | **exists; abstract gives 0.84 → 2.83 bits, +238%** |
| 2609.09075 | *ThinkPrior: Zero-Rollout Difficulty Priors…* | Sha, Zhai, Zhao | 2026-09-08 | 39% silent groups; fix is prompt selection | **exists; abstract attests both, verbatim** |

None failed. Three caveats that belong in a prereg if these are cited:

- **2607.19395's Avg@8/Pass@8 detail is not in the abstract.** The abstract attests the
  mechanism (replayed prefixes, clipped updates on historical assistant tokens) and the
  benchmarks (TextCraft, BabyAI, ALFWorld). Grok says "fetched" — fine, but cite it as a body
  claim, not an abstract claim.
- **2509.10423 is a robotic-control paper**, not LLM RLVR. Its abstract says so. Using it for
  "the policy gets more selective, not noisier" is an **analogy across domains**, and should
  be labelled one. This arc has already withdrawn one over-attribution (Nie et al.).
- **2609.09075's mechanism sentence is scoped to "the KL-free reward-advantage term."** It says
  zero-advantage groups give no *reward-advantage* gradient. It does **not** say the entropy
  term is dead there — consistent with §4(a), and against the reading drawn from it.

The five ids are recorded in `research/ids-grok-2026-09-13.txt`; the oracle transcripts and the
abs-page captures are beside them. **The scripted oracles should be re-run before any of these
enters a prereg** — a third-path existence check substitutes for the fabrication question only,
not for the two-provider gate.

## 7. Compensators — dead-man sized to what is left

Derived from **$8.31 remaining**, not the retired $10 P2 ceiling, holding back $0.20 for the
termination tail measured in §1 and $0.014/hr for container storage:

| SKU | runway | **cap** | worst case |
|---|---|---|---|
| RTX 5090 community $0.69 | 11.52 h | **11 h / 39600 s** | $7.94 |
| RTX 5090 secure $0.99 | 8.08 h | **8 h / 28800 s** | $8.23 |
| RTX 6000 Ada comm $0.74 | 10.75 h | **10 h / 36000 s** | $7.74 |
| RTX PRO 6000 comm $1.69 | 4.76 h | **4 h / 14400 s** | $7.02 |
| RTX A6000 comm $0.33 | 23.57 h | **23 h / 82800 s** | $8.11 |

```
powershell -File experiments/rollout-arc/p2/scripts/deadman-p2.ps1 -PodId <id> -CapSeconds <above> -Label <cell>
```

Armed **before** staging. `RUNPOD_API_KEY` is present in the environment, so the switch can
authenticate. **No network volume** — the account has none today and an auto-created one keeps
billing after the pod dies. Container disk only. Stage 0 keeps `--require-pool 32` against the
frozen fixture; a 14-song library pool is what voided the first paid smoke run.

## 8. What the delegation did not ask for, and why it changes the price

### The platform check never covered the primary metric

`GATE-RESULTS.md` reading 4 says "platform: NOT confounded, −0.56pp [−2.38, +1.23]". That
number is computed at `gate-readout.mts:120` as `loc7.rate − podC.rate` — **pass rate**. The
primary of every cell now under discussion is **concentration**, and concentration was never
compared across platforms. The lock says it correctly in parentheses — *"platform already not
confounded **on pass**"* — and then scores a pod arm's concentration against local C anyway.

`scripts/platform-concentration.mts` closes it for $0 from files already on disk, at **matched
G=16** (the local G=64 evals subsampled, 200 draws — modal share is biased upward at small n,
so comparing 64 against 16 would report the estimator's bias as a platform effect):

| contrast, paired by item, n=75 | | |
|---|---|---|
| **concentration** (localC−localBase) − (podC−podBase) | **+11.79pp [+8.79, +14.91]** | **DISTINGUISHABLE** |
| pass rate (control) | −1.40pp [−3.38, +0.38] | not distinguishable — reproduces reading 4 |

The bases agree almost exactly (local 0.9316, pod 0.9333). The **trained** runs do not: local
seed 7 sharpens to 0.9595, pod seed 7 flattens to 0.8433.

**This is not proof of a platform effect, and I am not claiming one.** `--seed` does not
control LoRA init in TRL 1.13 — this arc measured that — so local-7 and pod-7 are two
independent draws, not one run on two machines. The gap is equally consistent with the
single-run spread `PREFIX-IN-LOSS-RESULTS.md` already documents (PIL8L +4.69 against PIL9L
−3.21, same config, opposite signs, non-overlapping). **Reading 4 is correspondingly weaker
than it reads in both directions: at K=1 per platform it had almost no power to detect a
platform effect either.**

What it does establish is operational and firm: **a pod arm's concentration may not be scored
against the three local C runs.** The cross-platform gap on the primary is +11.79pp — roughly
four times the entire effect anyone is trying to measure — and nothing on hand can say whether
that is the machine or the draw. Mixing them is the wrong reference set with a pod attached.

**So the honest pod cell is (iv), not (iii): it must carry its own C control. $7.25 on the 5090
at community pricing, $1.06 of margin.** The consolation is real — the same six runs give K=3
C on a second platform, which is the only thing that can ever separate "the pod's −9.00pp was
the machine" from "it was the draw", and that question has been open since the four-arm pod.

### On the E-vs-DS call

Not mine to make, and the ledger does not decide it — (iv) prices the same either way, because
both are one arm of three seeds on the C pin. Two source-attested facts belong in the decision:

- The premise offered for preferring DS — that an entropy coefficient multiplies nothing on
  silent groups — **is false in this trainer** (§4a). Whatever else recommends DS, that does
  not.
- Arm E **cannot be run at the drafted `entropy_target=0.2`** without becoming an open-loop
  ramp (§4b). It is still one flag and still a flag, but the setpoint has to come from our
  measured entropy, and choosing it is a cell decision.

DS remains the stronger *question* — it acts on the batch every step rather than on the policy
after collapse, and ThinkPrior's 39% is our 46–76% — but it is a trainer patch, and a patch
that silently changes the effective batch size is a new way to be wrong about what was run. If
it is chosen, the ANDON in the delegation (`VOID` a step still logging
`frac_reward_zero_std = 1` after the resample cap, resample count on the receipt) is the right
shape and should be in the prereg, not the script.

## 9. Stop conditions, as of now

- **No pod exists, none was created, and no 5090 was touched.** Live API: 0 pods, 0 volumes,
  `currentSpendPerHr` 0.
- **No prereg written** — the delegation says after the ledger is confirmed, and this is the
  ledger.
- **No SKU in this file is recommended at a shrunken G or n.** Where a cell does not fit, it is
  marked ✗ and left there.

## Receipts

`scripts/pod-ledger.py` (sole source of every dollar) · `scripts/platform-concentration.mts` ·
`runs/gate/arm-{C,PIL}{7,8,9}L/run.json` · `runs/gate/{gate,pil}-{train,eval}.log` ·
`runs/pod-4arm/arm-{A,B,C,D}.json` + `*.DONE` ·
`p2/trainer/.venv/…/trl/trainer/grpo_{config,trainer}.py` (TRL 1.13.0) ·
`research/ids-grok-2026-09-13.txt` + `oracle-{arxiv,s2}-grok-2026-09-13.txt` + `abs-grok-*.html` ·
RunPod GraphQL `myself` and `gpuTypes`, queried 2026-09-13
