# Grok study-swarm — E vs DS (2026-09-14)

**Status:** research agents done; **Step 4 not clean.** `arxiv.org/abs` returned 200 for all eight load-bearing ids. `prism verify --type citations` (Ollama Cloud `gpt-oss:120b-cloud`) **escalate**: `export.arxiv.org` ReadTimeout, `finding_match: unchecked`. Receipt `prism-01m2ev75y4hawaj64t14qvtv8p`. Per protocol those findings are **CANNOT_CONFIRM** for a cell lock. Implications below are what would follow if Claude’s re-gate lands SUPPORTED — not a fired lock.

Ledger `948d48d` accepted. $20 is the **planning** ceiling, not live spend. No pod.

## Research grounding (empirical floor — existence via abs, groundedness pending)

1. **Silent groups inflate entropy/KL relative to policy loss; Skywork reject-samples them.** He et al. 2025 (arXiv:2505.22312). Implication: Claude is right that TRL’s entropy term is *not* multiplied by advantage (`grpo_trainer.py:3302`). The papers treat that as a **defect to filter**, not a reason arm E is “more live.”

2. **DAPO Dynamic Sampling keeps `0 < k < G` and oversamples until the batch fills; entropy/diversity is Clip-Higher, not DS.** Yu et al. 2025 (arXiv:2503.14476). Implication: DS and E are different failure modes. We already have Clip-Higher (`ε_high=0.28`). DS is the unused environment lever.

3. **A global entropy bonus is coefficient-fragile (no-op vs explode).** Cui et al. 2025 (arXiv:2505.22617). Implication: arm E needs a preregistered setpoint and a named explode halt, not “turn on entropy_coef.”

4. **Set the adaptive target from measured H, not Skywork’s 0.2.** Jin et al. 2025 (arXiv:2511.05993) — δ=0.3657 (their pre-RL H) beat 0.2; copying 0.2 lost to no-entropy GRPO. TRL v1.13.0 help: set close to early-train logged entropy; units are nats, same reduction as Skywork. Implication: `entropy_target=0.2` on our 0.014–0.059 is an open-loop ramp to `coef_max` by step 200. Claude’s 0.02–0.06 matches TRL’s own rule **if** taken from this cell’s early `entropy` metric.

5. **GX-Chen’s fix is MARA (reward rebalancing), not an entropy bonus.** GX-Chen et al. 2025 (arXiv:2510.20817). Implication: if the goal is multi-mode coverage under a binary verifier, neither E nor DS is their recommended algorithm. MARA is Claude’s C1 (build vs flag).

6. **Cutting silence is real; the accuracy claim did not survive more seeds.** Sha, Zhai, Zhao 2026 (arXiv:2609.09075) — 39% silent rollouts; silent@10 CI excludes zero; MATH-500 accuracy CI crossed zero at 16 seeds. Implication: DS ANDON is resample count and generation multiplier, not “pass rate will lift.”

7. **Do not pool a distributional primary against a historical control on another stack.** Hochlehnert et al. 2025 (arXiv:2504.07086) — up to ~8pp Pass@1 across five clusters; 5–15pp from eval seeds. Henderson et al. 2018 (arXiv:1709.06560) — seed alone can split significance. Implication: own three-seed C on the same pod is a **methods** requirement from our +11.79pp concentration gap even before these papers clear the gate.

## What I concede

- Entropy term is live on silent groups. I was wrong that it is “a coefficient times nothing.”
- Last billed SKU is 5090 at ~$0.99/hr secure / $0.69 community, not PRO 6000.
- Own-C on the pod is required for concentration. Local C is a valid control for **pass** only.

## What I do not concede

“E is more live, therefore prefer E” does not follow. Skywork’s sentence is the opposite: because entropy/KL dominate when the policy term vanishes, **filter those groups**. That is DS, not E.

## What still waits on Claude’s swarm (do not lock)

- C2: resample-cost bomb at 61–76% silence (`max_gen_batches`, ANDON).
- C1: is MARA in scope at $20 or a refused build.
- C3: `scale_rewards="group"` vs DS (std=0 singularity).
- Step 4 re-gate of the eight ids (API currently timing out).

One lever still. Price of E and DS is the same once own-C is on the pod. $20 planning budget buys that cell with margin for a failed seed or a capped resample — not 14 PIL, not E+DS+MARA.
