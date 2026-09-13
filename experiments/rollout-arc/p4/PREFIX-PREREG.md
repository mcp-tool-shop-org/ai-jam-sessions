# Preregistration — prefix forcing inside the trainer

**Written 2026-09-12, BEFORE any generation for it exists.** No same-opening data has
been collected, no trainer change has been written, no pod exists. This document fixes
two things that would otherwise be decided after seeing numbers: **which group design
the training run uses**, and **what would falsify the run's claim**.

---

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

## Part 2 — the falsifier, fixed before the run that would be tempted to reinterpret it

**Primary outcome: `top_first_measure_share` on an UNCONDITIONED eval.** Scaffolding off,
no prefix, nobody handing the model an opening; the same 32 items; G=16; the same sampler.
Base policy's value is **0.874** (`runs/summary-spec-4bar-g16.json`).

> Written first as a citation of `runs/curriculum-summary.json`, which was wrong and is
> recorded here rather than quietly corrected. `score-curriculum.mts` wrote one shared
> summary filename for every input, so the last run won: the file committed at `f1ec03b`
> is named for the curriculum cell and contained the exploring-starts numbers, where
> `top_first_measure_share` is **0.078**. Citing 0.874 from it would have passed review
> and pointed at a file saying 0.078. Summaries are now per-run and carry a
> `generated_from` field; the shared name is repaired and kept only for older receipts.

- **Stays near 0.874** → the model learned to finish sentences. The scaffold was
  load-bearing, the typicality peak never flattened, and prefix forcing trained a
  conditional competence that vanishes when the condition is removed.
- **Drops materially** → the peak flattened and the policy explores unaided.

**Pre-committed threshold: a drop below 0.70 is the only reading that counts as
flattening.** (0.874 → 0.70 is roughly a third of the way to the 0.438 that uniform
sampling over the 16 valid openings would give; anything smaller is inside the noise of a
32-item eval.)

**Pass rate is not the primary metric and will look fine either way.** Both outcomes above
are compatible with a pass rate that rises. Reporting a pass-rate improvement as evidence
of exploration is the specific mistake this section exists to prevent.

Secondary, reported always, never substituted for the primary: unconditioned non-degeneracy,
unconditioned rho, the first-measure histogram, and the conditional pass rate under forcing.

**rho is not a task constant.** It fell 0.710 → 0.221 under forcing with no change to task,
gate, corpus or sampler. Every rho in this document means "rho under this policy's sampling
in this condition" and the condition is always named.

---

## Part 3 — five ways the build fails silently, and the assertion that closes each

None of these throw. All leave the headline metrics looking good. Each one is closed by a
named assertion that halts the run, not by a comment saying it was considered.

| # | silent failure | assertion |
|---|---|---|
| 1 | **The group is no longer a group.** Different prefixes make one group G conditioning contexts; the advantage partly grades the prefix. | Decided by Part 1 above, not asserted. `prefix_mode` and `openings_per_group` are recorded on every receipt so no run is ambiguous about which design produced it. |
| 2 | **Prefix tokens in the loss.** Gradient on tokens the model did not choose reinforces the diversity that was injected. Prefix-GRPO (arXiv `2607.19395`) deliberately DOES update them; both are defensible, only one is what we mean. | `env_mask` is 0 across every prefix token by default. **A1:** the masked-token count equals the prefix token count exactly (and equals 0 under `--prefix-in-loss`). Recorded as `prefix_tokens_in_loss`. |
| 3 | **TRL restarts instead of continuing.** If the prefix lands in the prompt the template may open a fresh assistant header; forcing silently does nothing and `[0,1]` returns. | **A2:** every decoded completion starts with its own prefix string. Halt on the first violation, reporting the item and the first 80 characters actually produced. |
| 4 | **The prefix escapes scoring.** A reward that sees only the continuation judges a rollout that violated on the forced measure by the rest of its answer. | The prefix is inside `completion_ids`, so the decoded completion the reward receives contains it. **A3:** the text handed to `/score` starts with the prefix. Independently, the bridge's structure gate fails a realization whose first measure is missing, so a dropped prefix collapses the reward instead of inflating it. |
| 5 | **Right padding.** Different-length prefixes need `padding_side="left"` or continuations begin after pad tokens. | Generation pads left explicitly. **A4:** subsumed by A2 — a right-padded batch produces completions that do not start with their prefix. |

A sixth, found while reading the installed TRL rather than its documentation, and recorded
because it would have been assumed otherwise: **`chat_template_kwargs={"continue_final_message": True}`
cannot work here.** `_tokenize_prompts` hardcodes `add_generation_prompt=True`, and
transformers raises on both being set (`tokenization_utils_base.py:3099`). The only seam
that can force a prefix in TRL 1.13.0 is `rollout_func`, which owns tokenisation and
generation and returns `prompt_ids` / `completion_ids` / `logprobs` — and whose `env_mask`
extra field becomes `tool_mask`, multiplied into `loss_mask` at `grpo_trainer.py:2519`.

**And a seventh, asserted because the documentation and the code disagree.** The
`rollout_func` docstring says it "receives the raw per-process prompt slice with no
duplication". `_get_train_sampler` passes `mini_repeat_count=self.num_generations`
unconditionally, so on the non-vLLM path the prompts arrive **already repeated G times**.
**A5:** the incoming prompts must be exactly `n_groups` runs of G identical prompts; if the
deduplicated shape ever arrives instead, halt rather than assign prefixes to the wrong
rollouts.

---

## What a training run buys, stated before anyone spends

**Infrastructure and representation validation. Not musical capability.** The nearest-tone
deterministic heuristic scores **32/32** on this identical pool, for free; a trained policy
here loses to code already in the repo. The honest claim is that the reward landscape is
dense enough to teach a known-solvable capability, which transfers to a larger model or to
a task where no heuristic can be written. That framing is the director's, agreed before the
spend, and must not be softened afterwards.

---

## Standards compliance (workflow-standards.md, scored 0-3)

| standard | score | evidence |
|---|---|---|
| PIN_PER_STEP | **2** | Model, sampler, seed, G, style, voices, bars and the prefix mode are all CLI-pinned and written into the receipt; the population is frozen in git at `fixtures/progressions-v1.json` with equivalence proven over 256 completions. Not 3: the prefix strings themselves are derived at run time from the renderer rather than committed as a fixture. |
| ANDON_AUTHORITY | **3** | Five named assertions (A1-A5) halt the run rather than record a defect; the bridge refuses a short pool with a 409 and `--require-pool` fails at startup; `prompt_repeats` halts on an unchosen repeat. Every one of these was earned by a failure that shipped. |
| NAMED_COMPENSATORS | **2** | This session's irreversible actions are git commits only (compensator: `git revert <sha>`, owner: this session). **The pod run is the irreversible one and its compensators are owned by `pod_smoke_p4.sh`**: dead-man armed before staging, pod terminated on artifact fetch, `artifacts.sha256` written before `ALL.DONE`. No `npm publish`, no release, no external write is in scope here. Not 3: the pod table lives in the shell script rather than in one audited place. |
| DECOMPOSE_BY_SECRETS | **3** | The P4 bridge is a separate file from the P2 bridge precisely because they share no machinery and entangling them would put P2's committed receipts at risk; prefix construction lives with the renderer that decides validity, G lives with the trainer, and the reward is never reimplemented in Python. |
| UNCERTAINTY_GATED_HUMANS | **2** | The architecture fork is gated on a measurement with thresholds fixed before the data exists, and the paid run is gated on the director. Not 3: the gate is a preregistered threshold rather than an interactive contrastive checkpoint. |
| EXTERNAL_VERIFIER | **2** | No model verifies its own output here — the verifier is deterministic code (`verifyVoiceLeading`) that the generator cannot see, which is stronger than a cross-family judge for this task. A separate model family (Gemini) reviews the design and the write-up. Not 3: that review is not yet a committed receipt. |

Compensators are at 2 with the pod table held in the pod script; the remediation is to lift
it into this document if a second pod script appears. Owner: this arc, next pod session.
