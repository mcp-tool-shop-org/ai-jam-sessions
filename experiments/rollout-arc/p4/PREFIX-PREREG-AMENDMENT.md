# Amendment 1 to PREFIX-PREREG.md — the threshold was built wrong, and the fix is to run both

**2026-09-12, written AFTER the same-opening data existed and after an external review by a
different model family (Gemini).** That is stated first because it is the thing that matters
about this document: **a preregistration amended after seeing its own data has spent most of
its authority.** `PREFIX-PREREG.md` is NOT rewritten. Its reading stands exactly as recorded —
**3, AMBIGUOUS → heterogeneous** — and the run it authorised is still in the plan below, as an
arm, so the original commitment is honoured rather than quietly replaced.

What this document does: names a construction flaw in the original threshold, records the
external evidence, and preregisters the **training** run's readings before that run exists.

---

## 1. What was actually wrong with the criterion

Two things. Both are identifiable without reference to which side the data landed on, which is
the only kind of post-hoc criticism worth acting on.

**(a) It ANDed a diversity diagnostic with a gradient criterion.** VIABLE required
non-degeneracy >= 0.50 **and** mean within-group distinct completions >= 0.50 x G. Those are
not two measures of the same thing:

- **non-degeneracy** is whether a group's rewards differ at all. Below it there is no advantage
  and no gradient. It is a *precondition*.
- **distinct completions** is whether the policy is exploring. A group can carry full gradient
  with duplicate completions (10 identical passers and 6 identical failers still split).

Requiring both let a diagnostic veto a design whose precondition **passed** — 0.6250 against a
0.50 bar. The question the measurement was built to answer was "does a same-opening group have
any gradient to offer", and the answer was yes.

**(b) And a worse slip, which is mine alone and which no reviewer caught: I double-counted one
number as both sides of a trade.** `SAME-OPENING-RESULTS.md` reports non-degeneracy **0.6250**
as a passed criterion and "**12 of 32 groups (38%) dead**" as stratification's cost. Those are
the same measurement. 12/32 dead = 0.625 non-degenerate, exactly. Presenting them as a pass and
a separate penalty made stratified look worse than the data says, in my own write-up, in the
same document.

**What does NOT change:** the dead-group rate is still real and still the honest cost.
Stratified leaves 37.5% of rollouts carrying no gradient against heterogeneous's 6.25%. It is
one fact, not two, and it is a cost.

## 2. The external evidence, verified against arXiv rather than taken on trust

**The decisive citation, and it was found by checking rather than supplied by the review.**

> **"How You Begin is How You Reason: Driving Exploration in RLVR via Prefix-Tuned Priors"** —
> Yifan Xu, Junren Chen, Yifan Chen, arXiv **2605.08817**, submitted 9 May 2026. §3.3:
> *"If multiple prefix identities are assigned to the same prompt, each prompt-prefix pair
> (x, z) defines its own GRPO group."*

That is the stratified design, stated as the construction, in the one published work doing this
exact intervention (prefix-conditioned exploration in RLVR against entropy collapse; reports
+11.60% Pass@4, +10.57% Avg@4).

**One difference, recorded so it cannot be over-claimed later.** IMAX's prefixes are *soft,
learned embeddings and they ARE updated* — its objective optimises a trainable prefix pool with
the backbone frozen. Ours are *hard, enumerated, valid-by-construction token strings that are
NOT updated* (`env_mask` 0; the backbone is what trains). **The group-formation rule transfers.
The gradient rule is the opposite of ours, deliberately**, and `--prefix-in-loss` exists so the
other choice is one flag away rather than one rewrite away.

Supporting, same check:

> **"Prefix Grouper: Efficient GRPO Training through Shared-Prefix Forward"** — Liu, Yue, Tang,
> Guo, Cai, Liu, Chen, Liu, arXiv **2506.05433**, 5 June 2025. GRPO computes *"gradients from
> relative comparisons among candidate outputs that share a common input prefix"* — the shared
> prefix is the canonical definition of the group, not an implementation detail of it.

**The review's own two citations, checked:**

- **DRA-GRPO** (Chen, Zhu, Qiu, Dong, Wang, Wu, Li, Sotiras, Wang, Razi; arXiv **2505.09655**,
  14 May 2025, rev. 12 June 2026) is real, and its claim is **reward non-injectivity** —
  *"distinct reasoning paths receive identical rewards"*, so the policy collapses toward
  dominant strategies. It was cited for "the base model lacks the entropy to explore diverse
  semantic spaces unprompted." **That is a neighbouring claim, not that one.** The paper is
  about the reward failing to distinguish diverse paths, not about the sampler failing to
  produce them. Useful, and not evidence for the threshold argument it was offered for.
- The "Preference Mode Collapse" link is an aggregator topic page, not a primary source. Not
  used.

## 3. Where this amendment does NOT defer to the review

**"Stratified is mathematically required" overstates it, and the review did not price the other
side.** Stratified buys an unbiased baseline and pays a **37.5% dead-group rate** against
heterogeneous's **6.25%**. That is bias against effective sample size — the oldest trade in
estimation, not a theorem. The literature picks stratified and that is strong evidence; it is
not proof, and nothing measured in this arc says which term dominates **during training**,
because nothing in this arc has trained.

The review also asked to decide the design before spending. That is backwards here: the dispute
is entirely empirical, a budget now exists, and this arc's own record is that **every position
it held and lost, lost to a cheap control rather than to more argument** — four of them in one
session. So the amendment is not "switch to stratified". It is:

## 4. The amendment: four arms, one shape

| arm | `--prefix-mode` | reward | what it isolates |
|---|---|---|---|
| **A** | `stratified` | real | the literature's construction; unbiased baseline |
| **B** | `heterogeneous` | real | what `PREFIX-PREREG.md` authorised; broader opening coverage per step |
| **C** | `none` | real | **training itself.** Without C, a flattened peak cannot be attributed to forcing |
| **D** | `heterogeneous` | `--random-reward` | **the verifier.** If random rewards flatten it too, the reward taught nothing (lock §6; Qwen is the model family where spurious rewards nearly matched real ones, arXiv 2506.10947) |

Same model, same 32-item frozen pool, same style (`common-practice`, 2 voices, 4 bars), same
sampler, same G, same steps, same seed. One knob per arm.

**Stated because it is intrinsic and cannot be equalised away:** at equal steps the arms see
different numbers of distinct conditioning contexts — B and C revisit 32 items many times, A
draws from 512 (item, opening) rows. That difference *is* the design difference; it is reported,
not corrected.

## 5. Preregistered readings for the training run — fixed before it exists

**Primary outcome: `top_first_measure_share` on an UNCONDITIONED eval** (scaffolding off, 32
items, G=16, same sampler, `probe_generate.py --adapter`). Base policy = **0.874**
(`runs/summary-spec-4bar-g16.json`).

1. **FORCING FLATTENS THE PEAK.** At least one of A/B drops **below 0.70** AND the unforced
   control **C stays above 0.80**. This is the only pattern that attributes flattening to
   forcing rather than to training.
2. **TRAINING FLATTENS IT AND FORCING IS NOT THE CAUSE.** C also drops below 0.70. The
   exploring-starts story is then unsupported by this run, whatever A and B did.
3. **NOTHING FLATTENS.** All of A/B/C stay above 0.80. The scaffold was load-bearing and the
   competence is conditional. **This is a real result and must not be rescued by pointing at
   pass rate.**
4. **AMBIGUOUS.** Anything else — including a forced arm landing between 0.70 and 0.80. Not a
   pass; the correct response is a second cell, not a narrative.

**D is a veto, not a reading.** If D flattens as much as A/B, readings 1 and 2 are void: the
change is what any gradient does to the prior, not what this verifier taught.

**Design tiebreak (the review's question), pre-committed:** A vs B is decided on the primary
outcome first. If both land in the same reading, the tiebreak is **effective updates per GPU
dollar** — (non-degenerate groups x steps) / GPU-seconds — reported for both. Not raw step time,
which flatters whichever arm generates shorter completions.

**Secondary, always reported, never substituted for the primary:** unconditioned non-degeneracy,
unconditioned rho, the first-measure histogram, pass rate, and the training curves.

## 6. Hard guards — any failure voids that arm before its rewards are read

- forced arms: `prefix_hits == rollouts`, bridge `first_measure_wrong` delta **0**,
  `openings_covered == 16`, `masked_prefix_tokens == prefix_tokens_total`.
- `dataset_rows` **32** for B/C/D, **512** for A. `prompt_repeats` recorded on every arm; the
  asymmetry in §4 is expected, an unexplained value is not.
- pool served from `fixtures/progressions-v1.json` with `--require-pool 32`; `/health` records
  `pool_source: fixture`.
- the dead-man is armed BEFORE staging, because the pod bills from creation.

## 7. What a positive result still does not buy

Unchanged from `PREFIX-PREREG.md`, and unchanged by any arm coming back well:
**infrastructure and representation validation, not musical capability.** The nearest-tone
deterministic heuristic scores **32/32** on this identical pool for free. Do not write it up as
musical capability.
