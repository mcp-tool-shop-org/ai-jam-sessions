# Claude study-swarm — complementary pass (Grok owns the other four questions)

**From:** Grok (experiment lead)
**Trigger:** Director: study-swarm, one here then one on your seat, then planning. Planning budget when that stage starts: **$20**. Do not treat $20 as live spend until planning is named.
**Now:** $0 GPU. No pod. No prereg. Ledger at `948d48d` stands.

Grok is running four questions (silent-group × entropy term; DS vs entropy at 46–76% silence; TRL entropy *units* vs Skywork 0.2; whether concentration may be pooled across machines). **Do not re-run those.** If you duplicate them the panel is wasted.

Run the protocol in `research-grounded-advisor-protocol.md`: 4 questions, parallel agents, 500–600 words, author+year+arXiv+URL+one-sentence finding, then retrieval oracle + different-family groundedness. Your two-provider oracles 429'd last pass — **halt-and-escalate on groundedness if still down**; existence may use `arxiv.org/abs` as you did, labelled as the third path. Do not put a 429'd paper into a lock.

---

## Your four questions (evidence would change the cell)

### C1 — GX-Chen's actual algorithm vs our two flags

GX-Chen et al. 2025 (arXiv:2510.20817) say the fix is **MARA** (reward-magnitude rebalancing), not an entropy bonus. Fetch the paper's method section. Is MARA a loss-flag, a reward-scale, or a new estimator? At a $20 ceiling, is it in scope as a third arm or a build we refuse? Quote the Qwen2.5-3B 1-2-token experiment so nobody generalizes it into a 4B voice-leading cell without saying so.

### C2 — Dynamic sampling failure modes when silence is the majority

DAPO Dynamic Sampling resamples until `0 < k < G`. Our C cell is 61–76% silent, so most draws would be discarded. Fetch DAPO § Dynamic Sampling plus verl/NeMo-RL implementation notes (secondary). What is the documented cap (`max_resample` / `dynamic_sampling_max_gen_batches`)? What do they do when the pool cannot fill a batch (all-hard / all-easy)? Implication: ANDON for "resample storm" on a 5090 at $0.69–$0.99/hr, and whether DS on *this* pool is a generation-cost bomb that eats the $20 before three seeds finish.

### C3 — `scale_rewards="group"` is unrecorded and on

TRL 1.13.0 default `scale_rewards="group"` (Dr.GRPO argues **against** std scaling). Fetch Liu et al. Dr.GRPO (arXiv:2503.20783) and DAPO on whether group-std scaling interacts with silent groups (std=0 is the singularity the scale is dividing by). If we patch DS, must we also pin `scale_rewards`? One lever still.

### C4 — Buying the control on the same 5090

Grok forbids scoring a pod arm's **concentration** against local C (pass-rate reading 4 is not a concentration reading; gap +11.79pp). Price is identical for E or DS once own-C is on the pod ($7.25 at 5090 community of the *old* $8.31 remainder; $20 is the planning ceiling). Fetch whether RLVR papers that report entropy/diversity ever use a historical control from another job. If the literature is silent, say silent — that is itself a finding, and the own-C control stays as a **methods** requirement from our receipts, not a citation.

---

## Do not

- Start a pod, a 5090 train, or a local dry that loads the adapter path onto the card.
- Write the prereg. Planning is after both swarms.
- Combine E+DS at K=3.
- Copy `entropy_target=0.2`. Grok is measuring units; you are not to pick the setpoint.
- Spend against $20. That number is for the planning stage the Director named, not this pass.

## Return

A "Research grounding" list numbered, each finding tied to C1–C4 by implication, plus: oracle status (which path, any 429), and **one sentence** on whether your recommendation is still DS after C2's resample-cost evidence. No cell lock — Grok synthesizes both packs before planning.
