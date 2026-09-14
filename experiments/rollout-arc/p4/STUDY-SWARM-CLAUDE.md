# Claude study-swarm — the complementary four (C1–C4)

**2026-09-14, at `948d48d`. $0, no GPU, no pod, no prereg.** Answers
`STUDY-SWARM-CLAUDE-KICKOFF.md`. The other pack's four questions are not re-run; where a
source overlaps (`STUDY-SWARM-GROK.md` findings 1–7) it is noted rather than restated.

---

## Oracle status — CLEAN, and the gate is repaired

The two-provider gate failed last pass and failed again on the same two endpoints. Probing
showed the throttle is **endpoint-specific, not provider-specific**, so a new oracle
(`research/verify-multi.py`) queries four operators per paper:

| provider | status today | note |
|---|---|---|
| `api.openalex.org` | **UP** | independent aggregator |
| `api.datacite.org` | **UP** | **arXiv's actual DOI registrar** |
| `api.semanticscholar.org` (single GET) | 429 after ~3 calls | batch POST 429s immediately |
| `export.arxiv.org/api` | **429 throughout** | the endpoint the prism run timed out on |
| `api.crossref.org` | dead end — 404s every arXiv DOI | arXiv registers with DataCite, not Crossref |
| `dblp.org` | dead end — bot challenge | recorded so nobody retries it |

**Result: 26 of 27 ids CONFIRMED** by two independent registries with agreeing titles —
including **all eight** of the other pack's load-bearing ids except one:

`2511.05993` is **SINGLE-PROVIDER**. DataCite has it (*Revisiting Entropy in Reinforcement
Learning for Large Reasoning Models*, Jin Renren; Gao Pengzhi; Ren Yuqi; Han Zhuowen,
2025-11-08); **OpenAlex has NO RECORD**; the other two were 429. Existence is corroborated by
`arxiv.org/abs` (labelled third path). **It is not a fabrication — it is one registry short of
the standard.** That pack's finding 4 rests on the paper's *body* (δ=0.3657), which this gate
does not reach; the content claim stays with the pack that made it.

⚑ **A defect in my own oracle, found and fixed mid-pass.** The first version called
`2511.05993` **NOT-FOUND** on OpenAlex's silence alone — manufacturing a fabrication verdict
out of one provider's indexing gap, which is the same error class as reporting a 429 as
"missing". A negative now requires **two** registries to agree, exactly as a positive does.

**No halt-and-escalate is needed.** Groundedness by a different model family was not run — the
gate that matters here is retrieval, and it passed on two independent registries.

---

## Research grounding

### C1 — GX-Chen's actual algorithm vs our two flags

**All C1 quotes below I re-fetched and verified myself** at `arxiv.org/html/2510.20817v1`
(saved as `research/gx-chen-2510.20817.html`), not taken from the agent.

1. **The method is MARA — Mode Anchored Reward Augmentation — and it is a reward-preprocessing
   step, not a flag.** GX-Chen, Prakash, Guo, Fergus, Ranganath 2025 (arXiv:2510.20817). The
   name appears only in the body: "the method as Mode Anchored Reward Augmentation (MARA). See
   Algorithm 1 for pseudocode with minimal changes." Implication: **in scope at $20 by size**
   (~30 lines), but it needs per-sample reference log-probs, which TRL hands to the loss and
   not to a reward function — so it is a **trainer subclass**, the same shape as the advantage
   hook this arc already refused once. It is a build, and calling it a flag would be the
   `GATE-PREREG` entropy error in reverse.

2. **Mechanistically it is selective KL relief for passing samples.** Same paper: the
   augmentation "can be interpreted as selectively reducing the KL regularization for
   high-rewarding samples," and Algorithm 2 is "equivalent to Alg. 1 when using reverse KL
   regularization." Implication: MARA is a **KL intervention**, which places it in the same
   family as finding 17 below, not in the entropy family at all.

3. **The paper's own framing indicts this exact cell.** Same paper, abstract: "commonly used
   settings such as low regularization strength and equal verifiable rewards tend to specify
   unimodal target distributions, meaning the optimization objective is, by construction,
   non-diverse." Our cell is β=1e-4 and a binary verifier — both conditions, exactly.
   Implication: the measured +2.44pp sharpening is the predicted behaviour of the objective,
   and this is the single strongest theoretical statement either pack has retrieved.

4. **The paper argues an entropy bonus does not fix it.** Same paper: "Note this issue is
   identically present for entropy-only regularization." Implication: by the only theory paper
   both packs treat as load-bearing, **arm E is the weakest of the candidate levers.**

5. **Our β is 10× deeper into the collapse regime than the paper's "commonly used" value.**
   Same paper: "for a 0.1 difference in rewards, and a commonly used β=1e-3, the higher reward
   sample is pushed to be 2.6×10⁴³ times more likely." We run 1e-4. Implication: corroborates
   the measurement and points at β itself as the lever.

6. **MARA and β=0 are mutually exclusive.** The augmentation is
   `r̄ᵢ = R(z) + β(log π_ref(z) − log π_ref(yᵢ))` — **scaled by β**, so it is identically inert
   at β=0. Implication: MARA and β=0 cannot be one cell, and at β=1e-4 MARA's induced reward
   spread is ~1e-3, surviving **only** because `scale_rewards="group"` renormalises it
   (finding 15). C1 and C3 interlock here; neither states this alone.

7. **Nearest siblings, all CONFIRMED, all builds.** *Differential Smoothing Mitigates
   Sharpening and Improves LLM Reasoning* (arXiv:2511.19942) — a reward modification applied
   only to correct trajectories, and the closest-matched alternative to MARA by title alone;
   *Uniform-Correct Policy Optimization* (arXiv:2605.00365) — a loss-term build;
   *The Choice of Divergence* (arXiv:2509.07430) — swaps reverse-KL for mass-covering
   f-divergences, the closest thing to a flag, but TRL 1.13.0 has no forward-KL option;
   *Uncertainty-aware Advantage Shaping* (arXiv:2510.10649) — does not address zero-variance
   groups. Implication: **every diversity fix in this literature is a build.** There is no flag
   for this problem except the one in finding 17.

### C2 — dynamic sampling when silence is the majority

8. **DAPO's cost defence is a wall-clock argument in a long-tail regime, not a
   no-extra-generations claim.** Yu et al. 2025 (arXiv:2503.14476) §3.2: "this strategy does
   not necessarily impede training efficiency, because the generation time is typically
   dominated by the long-tail samples." Implication: that defence is valid for 20k-token CoT on
   128 GPUs and **inverted** for a 4B LoRA emitting ~100 tokens. The ANDON must count
   **generations**, never wall-clock.

9. **Silence RISES with accuracy.** Same paper, Fig. 3(b): the count of all-correct samples
   "continues to increase", so "the effective number of prompts in each batch keeps
   decreasing." Implication: a budget priced off the step-0 silence rate **under-prices the
   run**; the multiplier must be re-asserted per step.

10. **verl's cap default is UNBOUNDED — I verified this myself** in
    `verl/trainer/config/ppo_trainer.yaml`: `max_num_gen_batches: 0` with the comment
    "non-positive values mean no upper limit." NeMo-RL's `dynamic_sampling_max_gen_batches`
    defaults to 10 and "an error is raised" at the cap. Implication: a naive port inherits an
    **unbounded resample loop**; the cap is the first thing a prereg must name.
    (The same file shows `norm_adv_by_std_in_grpo: True` — verl ships C3's confound on too.)

11. **TRL states it outright: "Dynamic Sampling (⚠️ Not supported in TRL)."** HF TRL paper
    index. Corroborates my own read of the installed 1.13.0 source. Implication: the patch is
    ours to write, test and maintain — with no upstream to check it against.

12. **Measured multipliers exist and they are large.** *Improving Sampling Efficiency in RLVR
    through Adaptive Rollout and Response Reuse* (arXiv:2509.25808): "DAPO requires at least
    three times more response generation than standard GRPO." *Difficulty-Estimated Policy
    Optimization* (arXiv:2602.06375) Table 2: rollout **103.75 s/step (GRPO) → 192.16 s/step
    (DAPO)**, attributed to "the excessive over-sampling inherent in its dynamic sampling
    strategy." Implication: ~1.85× wall on a long-CoT setup, and generations ~3×.

13. **⭐ THE CRUX — on a FIXED 32-prompt pool most of our silence is an absorbing sink that
    resampling cannot escape.** If silence were a property of the **draw** (i.i.d., rate s),
    expected draws per surviving group is 1/(1−s): **s=0.61 → 2.56×, s=0.76 → 4.17×**. But
    per-prompt silence under a binary verifier is `p_j⁸ + (1−p_j)⁸`, which is **exactly 1.0**
    for any prompt at p_j = 0 or 1. DAPO resamples against DAPO-Math-17k and every retry draws
    a **fresh** prompt; our loop redraws **the same 32**. Implication: the multiplier is
    ~1/(1−s) on the genuinely stochastic remainder and **unbounded on the saturated fraction**,
    so DS buys a fraction of the problem at an uncapped price. This is the finding that changes
    my recommendation.

14. **The literature's actual fix is per-prompt difficulty selection, done offline.**
    Skywork-OR1 (arXiv:2505.22312) filters prompts at accuracy 0 or 1 offline and again between
    stages; *ThinkPrior* (arXiv:2609.09075) builds a zero-rollout difficulty prior precisely to
    avoid spending target-policy rollouts; DEPO filters "before the rollout phase";
    *Reinforce-Ada* (arXiv:2510.04996) "dynamically allocates inference budgets based on prompt
    difficulty" and contrasts itself with "passive filtering methods that discard low-signal
    prompts." Implication: a **$0 pre-step** — one 8-rollout pass over the 32 fixture
    progressions, evict p=0 and p=1 — captures most of what DS is for, with no trainer patch
    and no resample storm. It is, however, **a change to the cell's population**, which makes
    it a second lever unless it is applied identically to the control.

### C3 — `scale_rewards="group"`, unrecorded and on

15. **Dr. GRPO's objection is that std-division UP-weights near-unanimous groups — our exact
    regime.** Liu et al. 2025, *Understanding R1-Zero-Like Training* (arXiv:2503.20783):
    "Questions with lower standard deviations (e.g., those that are too easy or too hard, with
    the outcome rewards being almost all 1 or 0) are given higher weights during policy
    updates." Implication: with 46–76% near-unanimous groups we are running the exact
    configuration the paper names as biased, and the direction is **up**-weighting.

16. **std = 0 is numerically harmless — verified in our own installed source.**
    `grpo_trainer.py:2813`: `advantages = advantages / (std_rewards + 1e-4)`, and the numerator
    is exactly 0, so the result is 0. `is_std_zero` on the next line is annotated
    `# for logging`. Implication: no singularity, and `frac_reward_zero_std` is confirmed
    diagnostic-only.

17. **⭐ The KL term is NOT harmless, and the TRL maintainer says so.** TRL issue #5588,
    "Zero-std reward groups produce spurious KL gradients when `beta > 0`", closed
    **not_planned** 2026-05-22 by qgallouedec, whose closing comment states that the behaviour
    matches the canonical GRPO objective, where KL is applied per-token independently of the
    advantage; that with `beta > 0` and a zero-std group **only the KL term contributes**; and
    that **DAPO itself uses `beta = 0`** with oversampling, so the masking falls out naturally.
    Confirmed in our source: `grpo_trainer.py:3243`,
    `per_token_loss = per_token_loss + self.beta * per_token_kl`. Implication: on **46–76% of
    our groups the only live gradient is a pull toward the reference policy**, and we are
    running `loss_type="dapo"` with `beta=1e-4` — a hybrid that is **not what DAPO specifies.**

18. **The std question is genuinely contested, so it is not a free lever.** *Part I: Tricks or
    Traps?* (arXiv:2508.08221): dividing by a small std "can excessively amplify gradient
    updates, causing the model to overemphasize tasks of extreme difficulty." Against it,
    *Why GRPO Needs Normalization: A Local-Curvature Perspective* (arXiv:2601.23135) reports
    `no_std` **losing** ~3pp and ~7pp. *GRPO, Dr. GRPO, and DAPO Are Three Operations on One
    Number* (arXiv:2607.00152) shows DAPO's filter changes **which** groups contribute, **not
    how survivors are scaled** — measured silent-group rate 44% at G=8, in family with ours.
    Implication: **`scale_rewards` is a confound to pin at the control's value and record — not
    a lever, and not inert.** Flipping it inside any of these cells voids the one-lever rule.

19. **No paper ablates std-scaling against a diversity or modal-share metric.** Searched and
    found nothing. Implication: our primary is unmeasured territory in this literature; any
    diversity claim about `scale_rewards` would be ours to establish, not to cite.

### C4 — buying the control on the same machine

20. **The exact comparison has been run, and it moved accuracy by 4pp.** Hochlehnert et al.
    2025, *A Sober Look at Progress in Language Model Reasoning* (arXiv:2504.07086): Qwen2.5-
    Math-1.5B scored "7.3%±3.8 on AIME'24 on our cluster versus 11.3%±3.6 on Runpod"; also
    53.0% on A100 against 57.1% on H100 "despite identical software." Implication: local-vs-
    rented is a **documented** confound even on accuracy — the metric where our own reading 4
    found nothing.

21. **Numerics alone move token-level behaviour enormously.** *Understanding and Mitigating
    Numerical Sources of Nondeterminism in LLM Inference* (arXiv:2506.09501): BF16 gives
    std@acc **9.15pp** on AIME'24 against **0** at FP32, output-length std 9189 tokens, and
    100% of examples diverge. Thinking Machines 2025, *Defeating Nondeterminism in LLM
    Inference*: 1000 identical requests produced **80 unique completions**, first divergence at
    token 103. Implication: the sampling stack, not the policy, can move a distributional
    metric.

22. **⭐ The closest direct evidence says aggregate metrics are ~100× more stable than
    per-item ones across precision, GPU type and batch size.** *Dataset-Level Metrics Attenuate
    Non-Determinism* (arXiv:2604.13413): dataset-level accuracy std ≈ **0.001–0.003** while
    sample-level metrics show **0.30–0.50**; across numerical precision, GPU type and batch
    size, dataset-level accuracy stays highly stable while sample-level variability is
    "of similar magnitude to that observed for model-related factors." **Load-bearing caveat:
    diffusion language models, and "sample-level" is per-input stability, not opening-token
    modal share.** Implication: it points our way and it is not our setting; cite it as the
    nearest evidence, never as the answer.

23. **A seed-only split of ONE configuration produces "significant" differences.** Henderson et
    al. 2018 (arXiv:1709.06560): 10 trials, seed-only, split 5/5, "t=−9.0916, p=0.0016."
    Implication: **our +11.79pp [+8.79, +14.91] is exactly the artifact this produces.** A CI
    excluding zero is not evidence of a platform effect — which is what `POD-LEDGER.md` §8
    already said and is now sourced.

24. **SILENT — the strict question has no direct answer.** Nothing measures whether a
    distributional metric moves more than accuracy across machines for **autoregressive** RLVR.
    Finding 22 is the nearest and is a different model class. **SILENT again** on question 4: no
    checklist or reproducibility standard conditions the re-run requirement on the metric being
    distributional; Hochlehnert's standard (≥30 seeds, report mean+std, release outputs) is
    accuracy-framed. Implication: **own-C stays a methods requirement derived from our own
    +11.79pp receipt, not a citation** — which is exactly how the kickoff asked for it.

25. **Where the norm is stated, it is a matched same-environment control.** *When RLVR Shrinks
    the Reasoning Boundary* (arXiv:2607.20543) describes its matched GRPO baseline as using the
    same backbone, data, verifier, rollout budget, optimizer schedule, checkpoint rule and
    evaluation sampler, differing only in the one anchor under test. Yue et al. 2025
    (arXiv:2504.13837) fix temperature 0.6 / top-p 0.95 for **both** base and RLVR models for
    "a fair and unbiased comparison." Counter-note: the flagship entropy papers report **no
    run-to-run variance at all** — Cui et al. (arXiv:2505.22617) states no seed count and no
    variance on any entropy curve. Implication: the field's entropy results are single-run and
    would not pass this arc's own gate; own-C is the stricter standard and we should keep it.

---

## Withdrawn — my own inference in `POD-LEDGER.md` §4(a)

`POD-LEDGER.md` §4(a) established that TRL's entropy bonus is not multiplied by the advantage
and therefore produces gradient on silent groups. From that fact I wrote that it makes arm E
more live in our regime, not less. **That inference is withdrawn.**

Skywork-OR1 names the identical mechanism and treats it as a defect to remove. From the body
(`arxiv.org/html/2505.22312v2`, §3.1), zero-advantage samples do not contribute to the policy
loss "but may influence the KL loss or entropy loss, potentially leading to a more unstable
training process due to the implicitly increased relative weight of these losses" — and so
"our training batches include only groups with non-zero advantages."

The **fact** stands; the argument built on it does not. Liveness on a silent group is
un-anchored gradient, which is a reason to filter, not a reason to lean.

Two further facts from the same paper make arm E worse than either pack had it:

- **Skywork runs no KL at all.** Its §3.2.6 is titled "No KL Loss", on the finding that the KL
  penalty hinders further test-performance improvement during multi-stage training. Combined
  with finding 17 — DAPO also runs β=0 — **both papers this cell leans on run β=0, and we run
  β=1e-4.**
- **Their constant-coefficient ablation covers α ∈ {1e-4 … 1e-2} and every value fails**: at
  5e-4 and above "the entropy eventually rises sharply, leading to model collapse"; at 1e-4
  "while entropy does not exhibit a continuous rise, it still collapses, persistently
  decreasing toward zero." TRL's adaptive controller at `entropy_coef_delta=0.005` ramps to
  `entropy_coef_max=`**1.0** by step 200 — **two orders of magnitude past the largest
  coefficient Skywork tested, all of which collapsed the model.** `POD-LEDGER.md` §4(b) called
  this open-loop; it is worse than that.

---

## The lever neither pack asked about

Findings 3, 5, 6, 17 and Skywork's "No KL Loss" section converge on one place, and it is the
only candidate that is **a flag we already have**:

**β = 0.**

- It is one line in `GRPOConfig`, already exposed as `--beta` on `train.py`, already recorded
  in `run.json`. **One lever against C. No build.**
- It **removes** a forward pass: at `beta == 0.0` TRL skips the reference log-prob computation
  entirely (`grpo_trainer.py:2732`). It is the only candidate that makes the cell **cheaper**,
  not dearer. (The size of that saving is unmeasured and must not be quoted as a number.)
- It is what **DAPO** runs (finding 17) and what **Skywork** runs — we are currently a hybrid
  of neither.
- It removes the term that is the **only live gradient on 46–76% of our groups** (finding 17).
- It is the term GX-Chen's theorem is *about* (findings 3, 5). Their prediction is explicitly
  parameterised by β, and our β is 10× past their "commonly used" value.

**What it does not do, stated up front:** GX-Chen's eq. (20) shows the β→0 limit is not
automatically diverse — it hands the shape to the entropy coefficient instead — and at β=0
**MARA is identically inert** (finding 6). So β=0 forecloses MARA as a follow-on. That is a
real cost and it belongs in the decision, not in a footnote.

I am naming it, not locking it. The cell lock is not mine.

---

## The one sentence the kickoff asked for

**No — I withdraw DS as the first cell.** On a *fixed* 32-prompt pool the majority of our
silence is per-prompt rather than per-draw (finding 13), so resampling is an unbounded
generation cost that structurally cannot reach most of the problem, and verl ships the cap
defaulted to unlimited (finding 10); if the environment is still the target, the in-budget
version is the **$0 offline prompt filter** the literature actually uses (finding 14), not an
online resample loop.

---

## What this pack does not license

- **No prereg, no cell, no pod, no 5090.** Both packs are synthesized before planning.
- **No E+DS, and no β=0 + anything.** One lever per cell survives every finding above.
- **The $20 planning figure is untouched by this pass** and is not live spend; `948d48d`'s
  $8.3077 remains the measured remainder.
- **Finding 22 is not a result about our metric** — diffusion LMs, per-input stability. It is
  the nearest evidence and is labelled as such.
- **`2511.05993` must not enter a lock on this pack's authority.** One registry, plus a
  labelled third path.

## Receipts

`research/verify-multi.py` (four-provider oracle; negative verdict requires two registries) ·
`research/oracle-multi-2026-09-14.txt` · `research/ids-swarm-union-2026-09-14.txt` +
`ids-c3-extra.txt` · `research/gx-chen-2510.20817.html` · `research/sky-v2.html` ·
TRL issue huggingface/trl#5588 (closed not_planned 2026-05-22) ·
`verl/trainer/config/ppo_trainer.yaml` · installed `trl` 1.13.0 `grpo_trainer.py:2813, 2732,
3243` · `POD-LEDGER.md` (`948d48d`)
