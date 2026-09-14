# Claude — RunPod research support (Grok owns the cell lock)

**From:** Grok (experiment lead)
**To:** Claude
**When:** 2026-09-13, after `1619f71`
**Status:** Director authorized **RunPod training only**, and **only after research**. Local 5090 is off-limits. **No pod exists. Do not create one.**

Literature pass is in. `/workflow` `deep-research` finished **Partial** (coverage gaps listed in the report; Q4 did not inspect our `run.json`). Four sourced agents plus that report. **Grok's current lock, pending your budget confirm and the Director's E-vs-DS call — not a prereg:**

- **Do not buy 8–14 more PIL seeds.** Prefix-GRPO (arXiv 2607.19395, fetched) evaluates free Avg@8/Pass@8 and never tests whether prefix-token gradients flatten the unconditioned opening prior. The 2025 GRPO field trains at K≈1. Remaining dollars likely cannot buy K=8 of PIL+eval on PRO 6000 anyway.
- **Next cell, if the ledger fits:** arm E = plain C pin + Skywork-OR1 adaptive entropy (`use_adaptive_entropy=True`, `entropy_target=0.2`, `entropy_coef_delta=0.005`, `entropy_coef` initial 0.0). That is a TRL 1.13.0 **flag**, not a build. K=3, seeds 7/8/9, 200 steps, G=8 train, **G=64** unconditioned eval. Control = existing local C (platform already not confounded on pass). Primary = concentration vs base **and** arm-vs-arm vs C (meaning is comparative). Secondary = pass; flattening that loses C's +4.71 is a trade.
- We already ran TRL `loss_type=dapo` (default, unset). `loss_type=dapo` is not a new arm. GX-Chen's collapse prediction is β / reward, not the DAPO length normalizer.
- Oracle-gate **before** they enter a prereg: 2607.19395, 2505.22312, 2503.14476. Existing load-bearing list does not include them.

You own receipts, pricing, pin holes, and the prereg **after** Grok confirms the ledger. Do not write the prereg before that.

---

## Do not

- Start a pod, a local train, a local eval, or a 2-step dry run that touches the 5090.
- Write `PREFIX-IN-LOSS` follow-up as a fifth scaffolding variant.
- Treat 8–14 runs of PIL as already chosen. That is one candidate, and the remaining budget may forbid it.
- Mix `GATE-RESULTS.md` intervals with `pil-readout.mts`. Sole source stays `pil-readout.mts`.

## Do (now, $0, no GPU)

### 1. Spend ledger

Recompute remaining dollars from receipts, not from the kickoff's `$8.27`. Kickoff/HANDOFF still say **$16.73 of $25 spent**. Confirm nothing billed since the four-arm pod. Output a three-line ledger: spent, remaining, last billed pod id / SKU / $/hr.

### 2. Price the wall we actually measured

From gate + PIL receipts (local 5090, same cell):

| | wall | mean step |
|---|---|---|
| C train | 47.6–50.8 min | ~14.3–15.2 s |
| PIL train | 29.0–29.8 min | ~8.7–8.9 s |
| G=64 eval (75 items) | ~39 min | — |
| peak reserved | **22.9 GB** C / **21.2–22.8 GB** PIL | 5090 32 GB |

Price **train+eval on RunPod** (Director: rig stays idle) for:

- RTX 6000 Ada 48 GB community (peak 23 GB fits; listed ~$0.74/hr community / ~$0.84 on-demand)
- RTX PRO 6000 96 GB (last arc SKU, ~$1.64–$1.69/hr community, ~$2.09 secure)

For each SKU, compute cost of: (i) 8 PIL train+eval, (ii) 14 PIL, (iii) 3 new-objective × 3 seeds train+eval, reusing local C as control. Flag any option that exceeds remaining budget **or** needs a dead-man cap above remaining budget.

### 3. Pin hole — `loss_type`

`train.py` constructs `GRPOConfig` without `loss_type`. Installed TRL **1.13.0** default is **`dapo`**. `run.json` does not record it. Independently confirm from the same venv (`p2/trainer/.venv`) and from TRL's changelog/docs when the default flipped. If the six local runs were DAPO, "switch to DAPO" is not a new arm. Add `loss_type` (and `entropy_coef`) to the receipt dump — that is a pin fix, not a cell.

### 4. Entropy flag is a flag, not a build

GATE-PREREG said the entropy bonus is a build. Installed TRL 1.13.0 already has:

- `entropy_coef` default `0.0` — positive value is an entropy bonus on mean per-token entropy
- `use_adaptive_entropy` / `entropy_target` default `0.2` (Skywork-OR1, HF 2505.22312) — help text says 0.2 almost never triggers
- `top_entropy_quantile`

Confirm by reading the installed `GRPOConfig` fields, not by running. If Grok names an entropy arm, you will expose `--entropy-coef` on `train.py` and ANDON that `run.json` recorded the requested value. Do not invent the coefficient.

### 5. Pod script gap

`p4/scripts/pod_train_p4.sh` still evals at **G=16**. The gate and PIL readouts are **G=64**. A new pod that evals at 16 cannot be compared to `1619f71`. Inventory what else in that script is still the four-arm cell (arms A–D, eval G=16, seed 7 only). Draft the delta as a comment list, not a rewrite, until the cell is named.

### 6. Compensators

P2 dead-man + babysit exist and were drilled. Size the dead-man to **remaining budget**, not the old $10 P2 ceiling. Community volume must not auto-create (LoRA playbook: it bills after the pod dies). Stage 0 still has to prove the frozen 32-item fixture (`--require-pool 32`), not a 14-song library.

---

## After Grok names the cell

Then, and only then: prereg with readings whose **meaning is entailed by the condition**; arm-vs-arm if the meaning is comparative; `loss_type` / `entropy_coef` / `beta` on the receipt; directional prefix ANDON; G=64 held-out; three seeds unless the named cell says otherwise. Push the prereg **before** any `runpod` create.

## Stop conditions

- Any GPU activity on the 5090 for this arc → halt and ping Grok.
- Remaining budget cannot buy the named cell at the priced SKU → halt; do not shrink G or n to fit.
- Research pack cites a paper that fails the existing oracle (`p4/research/verify-*.py`) → drop it, do not save it in the prereg.
