# External review packet — prefix forcing, group design, and a preregistered training run

**Repo:** `mcp-tool-shop-org/ai-jam-sessions` · `experiments/rollout-arc/`
Every figure below is read at emit time out of the committed summary named in its block.
Nothing is retyped. Regenerate with `npx tsx p4/scripts/emit-review-packet.mts`.

**What changed since the review that prompted this packet:** the threshold criticism was
accepted, a second flaw the review did not catch was found, the review's two citations were
checked (one supports a neighbouring claim, one is not a primary source), two stronger
citations were found by checking, and the design question was converted from an argument
into a four-arm run. Details in `p4/PREFIX-PREREG-AMENDMENT.md`, reproduced at the end.

---

## 1. The three measured cells

Same 32 items, same G=16, same sampler (temperature 1.0, top_p 1.0, top_k 0 — which is also
`GRPOConfig`'s default, verified in `grpo_config.py:527-544`), same style
(`common-practice`, 2 voices, 4 bars), same seed. 512 completions each. Qwen3-4B-Instruct-2507
bf16 on an RTX 5090. Base policy, untrained, no optimisation pressure anywhere.

| | UNFORCED (no prefix) | HETEROGENEOUS (G different openings per group) | STRATIFIED (one opening per group) |
|---|---|---|---|
| receipt | `spec-4bar-g16.jsonl` | `spec-4bar-explore.jsonl` | `spec-4bar-same-opening-gen.jsonl` |
| pass rate | 0.3887 [0.3474, 0.4316] | 0.4531 [0.4105, 0.4964] | 0.5137 [0.4704, 0.5567] |
| non-degenerate | 14/32 = 0.4375 [0.282, 0.607] | 30/32 = 0.9375 [0.799, 0.983] | 20/32 = 0.6250 [0.453, 0.771] |
| dead groups (k=0 or k=16) | 18/32 = 0.5625 | 2/32 = 0.0625 | 12/32 = 0.3750 |
| rho | 0.71 | 0.221 | 0.528 |
| effective draws of 16 | 1.37 | 3.7 | 1.79 |
| mean distinct completions / group | 4.906 | 16 | 6.156 |
| within-group uniqueness (passers) | 0.356 | 1 | 0.413 |
| passing signatures unique | 22.1% | 90.1% | 31.6% |
| top_first_measure_share | 0.874 | 0.078 | 0.099 |

**Two columns are uninformative by construction and must not be read as diversity:** under
heterogeneous forcing every rollout in a group was handed a different opening, so 16 distinct
completions and 1.000 within-group uniqueness are guaranteed before the model emits a token.
And `top_first_measure_share` is only meaningful UNFORCED — under forcing it reports the
rotation schedule, not the policy.

**Dead groups and non-degeneracy are the same measurement**, stated two ways: a group at k=0
or k=G has zero within-group reward variance and therefore zero advantage for all G of its
rollouts. An earlier draft reported one as a passed criterion and the other as a separate
cost. It is one number.

## 2. The k-of-16 histograms

The scalar hides the shape. A 1-of-16 and an 8-of-16 split both satisfy `std > 0` and both
count once toward non-degeneracy; under std-normalised advantage the first is a needle.

```
UNFORCED (no prefix)
  0:13  1:2  3:2  4:1  7:1  9:2  12:1  13:2  14:1  15:2  16:5
HETEROGENEOUS (G different openings per group)
  1:4  2:1  3:1  4:2  5:5  6:1  7:3  8:4  9:1  10:3  11:2  12:1  13:2  16:2
STRATIFIED (one opening per group)
  0:7  2:1  3:2  4:1  5:1  6:1  7:2  9:1  10:3  12:3  13:2  15:3  16:5
```

## 3. Opening difficulty — the nuisance term, from the CROSSED design only

`p4/scripts/opening-difficulty.mts` on `spec-4bar-explore.jsonl`, where every item contributes
exactly one rollout to every opening, so item difficulty averages out:

```
  pass rate by forced opening, 32 completions each, fully crossed
  [1,0] 0.563   [0,1] 0.438   [3,1] 0.313   [1,1] 0.219
  spread: min 0.219  max 0.563  range 0.344  sd 0.101   -> MATERIAL
```

Run against the same-opening file the same script reports `range 0.688 sd 0.165 SEVERE`.
**That number is not comparable and is not used.** In the nested design each opening is backed
by 2 items and 16 correlated rollouts (rho 0.528), so the opening effect is confounded with
those two items' difficulty. The script now refuses a verdict when the thinnest opening has
fewer than 8 distinct items behind it.

Incidentally `[0,1]` — the prior's favourite, opening 87.4% of unforced passers — sits BELOW
average at 0.438. The model does not prefer it because it works better.

## 4. What the build already asserts (so the review need not re-derive it)

Three local dry runs, `STAGE C PASS`, $0. `prefix_hits` 16/16 every run; TRL's own mask probe
saw a zero span on 16/16 completions against `batches: 0` unforced; `masked_prefix_tokens` ==
`prefix_tokens_total`; the bridge's independent `first_measure_wrong` delta 0 over 48 scored
rollouts; `boundary_clean` true. Full receipt: `p4/PREFIX-BUILD.md`.

## 5. The questions actually open

The threshold criticism is accepted and is not what is being asked. What would help:

1. **Is the four-arm design the right cut?** A stratified / B heterogeneous / C unforced
   control / D heterogeneous with `--random-reward`. Is C sufficient to attribute a flattened
   peak to forcing rather than to training, or is a fifth arm needed?
2. **Is D specified correctly as a veto?** The claim is that if random rewards flatten the
   typicality peak as much as real ones, readings 1 and 2 are void. Qwen is the family where
   spurious rewards nearly matched real ones (arXiv 2506.10947). Is "as much as" the right
   bar, and what would a partial result mean?
3. **Are 0.70 and 0.80 defensible?** The primary outcome is `top_first_measure_share` on an
   UNCONDITIONED eval, base 0.874, uniform-over-16-openings would be 0.438. Flattening is
   pre-committed as < 0.70; "did not flatten" as > 0.80.
4. **Is the tiebreak gameable?** If A and B land in the same reading, the tiebreak is
   effective updates per GPU dollar = (non-degenerate groups x steps) / GPU-seconds. Raw step
   time was rejected because it flatters whichever arm writes shorter completions.
5. **Does anything here justify NOT running C and D** to save roughly half the budget?

---

## Appendix A — `p4/PREFIX-PREREG.md`, Part 1 (the original, unmodified)

## Part 1 — the architecture decision, and why it cannot be reasoned out

Exploring starts fixed the funnel by handing every rollout in a group a different valid
opening (`EXPLORING-STARTS-RESULTS.md`). That intervention breaks something GRPO relies
on, and the breakage is measured, not speculated: **pass rate by forced opening ranges
0.219 (`[1,1]`) to 0.563 (`[1,0]`), range 0.344, sd 0.101** (`scripts/opening-difficulty.mts`).
GRPO's advantage is `(r - mean_group) / std_group`, valid because all G rollouts share a
conditioning context. With 16 different openings in one group, part of the within-group
advantage grades **which opening the rollout was handed** rather than how it completed.

There are exactly three designs, and the first is already rejected:

| design | group is | advantage validity | opening coverage per step |
|---|---|---|---|
| **unforced** | one prompt, G rollouts | exact | collapses — `[0,1]` opens 87.4% of passers |
| **heterogeneous** | one prompt, G rollouts, G different openings | **nuisance term inside the group** | G openings x 1 rollout |
| **stratified** | one (item, opening), G rollouts sharing both | **exact** | 1 opening x G rollouts |

Stratified restores exact advantage validity by making the opening part of the group
identity instead of a within-group variable. It costs coverage: a step sees 1/G as many
openings, and — the load-bearing risk — **every rollout in the group now starts from the
same place, so the group splits only if the policy varies measures 2-4.**

**Nothing measured so far bears on that.** The 1.000 within-group uniqueness reported for
exploring starts is confounded by construction: each rollout had a different prefix, so of
course the completions differ. Whether a group sharing ONE opening still splits is
unmeasured, and it decides the architecture. If it does not split, stratified has no
gradient at all and the choice is heterogeneous-plus-disclosure.

### The measurement

**Same-opening groups.** 32 items, G=16, common-practice, 2 voices, 4 bars, sampler
unchanged (temperature 1.0, top_p 1.0, top_k 0) — identical to the exploring-starts cell
in every respect except one: **all 16 rollouts of an item are handed the SAME opening.**
The opening varies across items (item *i* takes valid opening *i* mod |valid|) so the
result is not a property of one lucky voicing. Local, RTX 5090, $0.

Compared against the exploring-starts cell (heterogeneous, same items, same G, same
sampler) and the unforced cell (`spec-4bar-g16.jsonl`).

### Pre-committed readings

1. **STRATIFIED VIABLE — use it.** Non-degeneracy **>= 0.50** AND mean within-group
   distinct completions **>= 0.50 x G**. Groups split on the continuation alone, so the
   opening can be moved into the group identity and the nuisance term disappears with no
   loss of gradient. This is the design the training run uses.
2. **STRATIFIED DEAD — use heterogeneous and disclose.** Non-degeneracy **<= 0.25** OR mean
   within-group distinct **<= 0.25 x G**. The prior clamps the continuation as hard as it
   clamped the opening; a same-opening group is one completion repeated and there is no
   signal to learn from. The training run is heterogeneous, the nuisance term is named in
   the write-up, and `openings_per_group` is recorded on every receipt.
3. **AMBIGUOUS — anything between.** Not a pass. Heterogeneous is the default (it is what
   was actually measured to break the funnel) and the ambiguity is reported as ambiguity.

A fourth quantity is reported with every reading and never averaged away: **the
k-of-16 histogram.** A 1-of-16 and an 8-of-16 split both satisfy `std > 0` and both count
once toward non-degeneracy; under std-normalised advantage the first is a needle signal.

### What this measurement cannot do

It cannot say which design *trains* better. It is a rollout-collection statistic on a
frozen base policy, and both designs remain scaffolding for collection — the terminal
objective is unconditioned in both cases. It decides only whether stratified has any
gradient to offer, which is a precondition, not a result.

---

---

## Appendix B — `p4/PREFIX-PREREG-AMENDMENT.md` (the full amendment)

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

