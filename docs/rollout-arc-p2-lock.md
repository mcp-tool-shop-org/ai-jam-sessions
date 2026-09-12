# P2 — the first training run, and the one confound that would make it uninterpretable

**Date:** 2026-09-11 · **Status:** DESIGN LOCK. **Nothing built. No spend authorised.**
**Unlocked by:** [P1f](../experiments/rollout-arc/p1f/RESULTS.md) — primary clears at D0 (18) and D3 (14), secondary clears at all four levels.
**Design lock of record:** [rollout-layer-dispatch.md](rollout-layer-dispatch.md). **This document does not authorise a dollar.** §7 is the only spend gate and it is the director's.

---

## 0. Standards compliance (the six, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| **PIN_PER_STEP** | 3 | Every run pins base-model sha, LoRA config, generator seed, corpus sha, tool-catalog sha and `dist/mcp-server.js` sha into a receipt. §6 adds the replay test that P1d–P1f deferred, so this finally reaches 3. |
| **ANDON_AUTHORITY** | 3 | Four independent halts: the smoke gate (§5), the entropy/KL collapse monitor (§4), the dead-man cost cap (§7), and the format-gate floor (§3) which stops a run whose measurement would be uninterpretable. |
| **NAMED_COMPENSATORS** | 3 | §8. No skip. Inherits the v1 arc's proven pod pattern — babysitter auto-terminate plus dead-man cap, which ran $20.45 against a $25 ceiling with zero waste. |
| **DECOMPOSE_BY_SECRETS** | 3 | Generator, tool surface and trainer stay three modules. P1f proved the tool surface is untouched by scaling the corpus. |
| **UNCERTAINTY_GATED_HUMANS** | 3 | Two director gates, both on uncertainty: the §7 spend authorisation, and the §9 publish gate. Framed contrastively. |
| **EXTERNAL_VERIFIER** | 3 | Reward is the real MCP server, a separate process. Scoring is by program. The §3 separation exists precisely so the run cannot grade its own homework by counting formatting as skill. |

**18 / 18.**

---

## 1. What P1f actually licensed

**Not "the task got learnable."** The leak-free in-band rate moved 17.2% → 17.6%, which is
noise. The bar is a **count**, `n` doubled, and given P1e's rate the clearing was ~99% likely
before the run. The four prior NO-GOs and this GO are one family at two sample sizes.

**What it licensed is a replicated rate on an unbounded generator.** Three rates measured on
disjoint case sets one seed apart:

| Quantity | P1e | P1f |
|---|---|---|
| leak-free non-degenerate | 32.0% | **32.0%** |
| leak-free in-band | 17.2% | 17.6% |
| leak tax | 29.7% | 24.6% |

That is a stable property of the family, and the generator can produce arbitrarily many cases
carrying it. **That, not the count, is what P2 trains on.**

### Doctrine earned here, for every future arc

**A count bar applied to a generator is satisfiable by generating more.** P0's `≥ 10 cases` was
written for a fixed 59-case corpus and carried into a generator setting unchanged. With a
generator the gate must be a **rate with a confidence interval**, not a count. Fix this in the
dispatch before the next arc inherits it.

---

## 2. The training population

- **Pooled across D0–D3. Never selected by level.** P1f measured the level index's pass@1 rank correlation against P1e at **ρ = −0.60**; P1e's "D3 easier than D0" did not reproduce, and reversed. D0's 18 and D1's 6 are tails of one rate. **The level index is noise and must not be a population selector.**
- **Non-degenerate, not the narrow band.** Verified from primary source: NVIDIA's production DAPO implementation filters, verbatim, *"Filter prompt groups where `std > 0`."* That is `1 ≤ c ≤ 7`, our secondary criterion, not `[12.5%, 50%]`. INTELLECT-2's offline band exists to avoid wasting generation on a **fixed** 285k pool; with a generator plus online filtering there is nothing to pre-filter.
- **Generate fresh training cases at scale.** The P1f test split stays **sealed** and is never trained on. Train and test share no `song_id`.
- **Leak filter applies to training too.** A case a no-tool baseline solves in 8 attempts teaches guessing.

---

## 3. The format/skill separation — the reason this document exists

**716 of 2048 P1f attempts (35.0%) never produced a bare integer and scored zero.** A training
run will fix much of that fast, and formatting gains will look exactly like capability gains.

**This repo has already been burned by this once.** The acoustic arc measured a base model at
0.333 with 21 of 36 outputs unparseable; adding one system line listing the allowed verdicts
took it to 0.972. A comparison run without that line *"would have credited the adapter with
0.639 of gain that is entirely output formatting."*

**So P2 logs and reports three series, never one:**

| Series | Definition |
|---|---|
| `format_rate` | fraction of rollouts producing a parseable in-range verdict |
| `acc_conditional` | accuracy **given** `format_ok` — the skill signal |
| `acc_joint` | accuracy over all rollouts — what a naive report would show |

**The victory claim is on `acc_conditional` against a base model measured with the identical
prompt and gate. `acc_joint` is reported beside it and never alone.** A run that moves
`acc_joint` while `acc_conditional` is flat has taught formatting, and must be reported as
having taught formatting.

**ANDON:** if `format_rate` has not exceeded 0.90 by the end of training, the run is
**underpowered or badly explored**, and it cannot support a null claim about the method. Halt
and report that, rather than reporting a null.

---

## 4. What else must be logged per step

| Metric | Why |
|---|---|
| **non-degenerate yield** | 34 of P1f's 82 leak-free non-degenerate cases sit at `c=5`, one step from saturation. As the policy improves they migrate to `c=8` and vanish from the signal. Yield decay bounds how long training stays productive; it must be a measured series, not a surprise. |
| fraction of groups discarded, and generation batches per step | the online filter's real cost. At a 32% yield expect ~3× generation. NeMo caps this at 10 batches by default. |
| policy entropy | collapse detector |
| KL to base | a hard zero or an immediate spike past 10 is a failed run, not a trained one |
| mean tool turns | P1e 2.452, P1f 2.470. A drop toward 1 means the policy stopped searching and started guessing. |

---

## 5. Sequencing — cheapest check first, as every prior arc did

The acoustic pod ladder (`dry` → `smoke` → `train`) and P0's ordering both exist because a pod
bills from boot. Same shape here.

1. **`dry`, $0, local.** Generate the training corpus, run every gate, render and tokenise. No weights.
2. **`smoke`, minimal paid.** One pod, a handful of steps, purely to **measure** throughput, yield, generation multiplier and cost per step. **No result is claimed from a smoke run.**
3. **`train`.** Only after the smoke run produces a measured cost, and only under §7.

**Cost is derived from the smoke run, never estimated.** External scale figures offered during
design (500–1000 prompts, G 4–8, 30–100 steps, 5–6 GPU-hours) were **attributed to a citation
that does not contain them** and are not used here. The defensible in-repo anchors are our own
receipts: r52 spent ≈$4.00 for two SFT seeds at 3B–4B; the v1 arc spent $20.45 for five seeds
at 7B. Low tens of dollars is the right order of magnitude to expect, and the smoke run
replaces the expectation with a number.

---

## 6. Recipe inheritance

Inherit from the dispatch's §5 locks — they were citation-gated and none of them has been
falsified by P0–P1f:

- **RL from the instruct checkpoint, not SFT-then-RL.**
- **Reward is binary verdict behind a format gate, nothing else.** No length bonus, no low-weight tool-correctness blend.
- **Mask every tool turn from the loss.**
- **KL off for multi-turn** (DAPO), but logged as a diagnostic per §4.
- **Base:** `qwen3-4b-instruct-2507`, the P1c–P1f pin, Apache-2.0 and publish-safe.
- **Spurious-reward control is mandatory.** We train Qwen, and random rewards nearly match real ones on Qwen (+21.4pp vs +29.1pp, arXiv:2506.10947). **A random-reward arm runs alongside, or the result is unfalsifiable.**

**New in P2:** the replay test that P1d–P1f deferred. One pinned rollout must reproduce
byte-for-byte from its receipt. This is what takes PIN_PER_STEP from 2 to 3.

---

## 6a. The build — verified 2026-09-11, and it is much smaller than it looked

The blocker after P1f was that **no GRPO trainer exists in this repo** and our environment,
reward and tool executor are all TypeScript while training is Python. External advice
recommended writing a **custom PyTorch/Accelerate loop** because "no mainstream framework
natively supports multi-turn tool-use GRPO," marking TRL as a FAIL that "assumes standard text
generation with no environment interaction."

**Checked against the TRL documentation. That verdict is out of date, and acting on it would
have been the highest-risk path available.** GRPOTrainer now carries two relevant surfaces:

| Surface | Contract (verbatim from the docs) | LoRA |
|---|---|---|
| `environment_factory` | a class "whose public methods auto-register as discoverable tools — the trainer then handles the multi-turn generation loop for you"; `reset()` / `get_reward()`; `max_tool_calling_iterations` | ⚠ **CORRECTED 2026-09-11** — this cell originally read "fully compatible with `peft_config`" and attributed it to the docs. **That sentence could not be retrieved on re-check.** `peft_config` is a generic trainer argument, and TRL issue #6688 reports our exact configuration (Qwen3-4B, LoRA r32, environment_factory, colocate) collapsing 0.66→0.40 against the plain-generate arm. **Treat the combination as untested.** See the build handoff §0. |
| `rollout_func` | `(prompts: list[str], trainer) -> dict` returning `prompt_ids`, `completion_ids`, `logprobs`; "Any other fields are forwarded to the reward functions" | same |

**Both are marked experimental** — *"may change or be removed at any time without prior
notice."* That is a real risk for a paid run and the mitigation is the one PIN_PER_STEP already
requires: **pin the exact TRL version in the pod bundle and record it in the receipt.**

### The architecture this licenses

The external advice's *instinct* was right — keep the logic in TypeScript and let Python be a
tensor calculator — but it proposed bridging the **whole rollout** over HTTP and rebuilding the
training loop. With `environment_factory` the trainer owns the loop and the bridge shrinks to
two thin forwarders:

```
[TRL GRPOTrainer + peft_config]         Python: tensors, optimizer, LoRA
        │  environment_factory
        ▼
[wrapper class, 9 public methods]  ──stdio──>  [dist/mcp-server.js]   the REAL tool surface (L2)
        │  get_reward()
        └──────────HTTP───────────────────>  [Node scorer]  the REAL scoreReward (one impl)
```

**Why `get_reward()` must forward rather than reimplement.** Our reward is the L4 lock: binary
outcome behind a format gate, with the verdict extractor and the turn penalty already written
and tested in `src/dataset/experiment/env.ts`. A Python reimplementation is a **second
implementation that will drift**, which is the exact failure the experiment contract's template
README was written about. **One reward, in TypeScript, called over the boundary.**

### What we are not adopting, and why

**Hugging Face OpenEnv's `MCPEnvironment`** states our situation precisely — *"MCP earns its
complexity when the tool surface has to exist as a process boundary, not a function call"* — and
its `CallToolAction` / `ListToolsAction` shape is a clean fit. But its own docs say **"MCP
adoption in OpenEnv is still in flight,"** RFC 003 is **In Review**, and only a handful of envs
are MCP-backed. Its canonical path also builds a `FastMCP` server **in Python**, which is the
wrong direction for us: our tools already exist in Node. **Not a dependency for P2.** Revisit if
RFC 003 lands.

**Not writing a custom PyTorch GRPO loop.** Advantage computation, tool-token masking, PPO
clipping, LoRA wiring and checkpointing are each a place a paid run dies silently, and TRL has
all of them tested. Novel code is the thing we have the least budget for.

---

## 7. The spend gate — director only

**This document authorises nothing.** Before any pod:

1. The `dry` stage passes at $0.
2. The smoke run's cost is **measured** and presented with a projected full-run total.
3. The director gives an explicit yes to a stated ceiling.
4. Dead-man cap and babysitter auto-terminate armed before launch, per the v1 pattern.

**>20% drift from the projection halts and re-asks.**

---

## 8. Compensators (no skip)

| Action | Compensator | Owner |
|---|---|---|
| RunPod pod | babysitter API-terminates on ALL.DONE; absolute dead-man cap; `runpod.mjs down --all` re-lists what is still billing | P2 session |
| Synthetic corpus | isolated per-worker `AI_JAM_HOME`, removed on close; real library never written | P2 session |
| Adapter artifacts | stay local; **nothing published** without §9 | director |
| Schema | unregistered in the published set; nothing under `datasets/` | P2 session |

---

## 8a. The target, and the inversion check — added 2026-09-11

**Measure pass@8 before AND after, not just pass@1.** This is a new mandatory measurement and it
exists because of a paper found while *failing* to verify something else.

**Pass@k inversion is a named, published failure mode.** Zhou 2026, *When RLVR Shrinks the
Reasoning Boundary: Diagnosing Pass@k Inversion* (arXiv:2607.20543): RLVR can raise pass@1 **while
degrading pass@k**, an "absence-of-evidence failure" in which "rare correct trajectories may
disappear before RLVR samples and reinforces them often enough." Our entire evaluation plan was
pass@1 against a base. **A run that lifts pass@1 while dropping pass@8 has narrowed the model's
reach, and under the current plan we would have reported it as a win.**

**ANDON:** post-training pass@8 below the base's pass@8, pooled, is an **inversion result** — it
is reported as one, and it is not a victory regardless of what pass@1 did.

### The target is pooled, and it is a floor plus a ceiling — not a fraction

Our base, over P1f's 256 held-out cases:

| | pooled |
|---|---|
| base pass@1 | ≈ 0.557 |
| base pass@8 | ≈ 0.747 |
| headroom | ≈ 19 pts |

**Ceiling:** Yue et al. (arXiv:2504.13837) — RLVR concentrates probability inside the base's
reach rather than extending it, so **base pass@8 is the wall**, not a stretch goal.

**Floor:** the observed pooled gain must exceed seed noise. Hochlehnert et al. (arXiv:2504.07086)
measured 5–15 pp pass@1 std over 20 seeds and recommend ≥10 seeds. **A gain under ~5 pp pooled is
not distinguishable from a seed draw at any run size we can afford.**

**Not adopted: a preregistered "fraction of the gap closed."** A 60–85% closure range was
proposed externally with a concrete per-tier target table. The arithmetic checked; **the range
is not in the paper cited for it** (arXiv:2607.20543 reports no such figure, and is in fact the
inversion paper above), and the supporting "70% of gains are formatting" and "6–14 points true
capability" figures carried no citation at all. **We do not preregister an invented rate.**

**Per-tier targets are rejected on our own evidence.** The level index has never ordered
consistently across three independent draws (ρ = −0.60 between P1e and P1f; the train split
reordered it again). A per-tier bar treats noise as strata, and lock §2 already forbids it.
The D1 tier makes the point concretely: its headroom is 11.7 pts, so a 60%-closure target is
7 pts — inside the seed noise above, and uninterpretable by construction.

---

## 9. Reporting, and the two shippable nulls

Report `acc_conditional`, `acc_joint` and `format_rate` as three series against a base model
measured identically, with the random-reward arm beside them. Pre-written outcomes:

- **Win** — `acc_conditional` beats base beyond the random-reward arm. Publish gate is the director's.
- **Null, interpretable** — `format_rate` exceeded 0.90 and `acc_conditional` stayed flat. **This is a real result**: the method does not add capability on this task at this scale, and it ships as one.
- **Null, uninterpretable** — `format_rate` never cleared 0.90. Underpowered. **Not a finding.** Report the diagnostic, not a verdict.

---

## 10. Explicitly not doing

- **Not unlocking the octave range or the right-hand constant.** Both are correct one-parameter changes and both were greenlit, but they fix the **null branch of P1f, which did not fire**. The environment has a replicated trainable population as it stands. Changing a working environment to solve a problem the measurement says we do not have is the same error as closing the arc on a reason that did not hold, pointed the other way. Revisit if P2 shows the 24.6% leak tax or the answer space is the binding constraint.
- **Not selecting the population by difficulty level** (§2).
- **Not using the narrow band as the training filter** (§2).
- **Not claiming a result from a smoke run** (§5).
- **Not reporting `acc_joint` alone, ever** (§3).
