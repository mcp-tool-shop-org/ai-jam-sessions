# The point-mass finding was a harness artifact — the model branches fine

**This retracts the terminal conclusion of `STACK-RESULTS.md`.** Four configurations, same
question — does the policy emit identical completions from an identical prompt?

| stack | precision | byte-identical groups | mean distinct of 8 |
|---|---|---|---|
| Ollama | **q4_K_M** | **0 / 128** | 7.99 |
| Ollama | **fp16** | **0 / 128** | 8.00 |
| **plain `transformers.generate`** | **bf16** | **0 / 16** | **8.00** |
| **TRL GRPO, `environment_factory`** | bf16 | **92.2%** | ~1 |

All four at `temperature` 1.0, `top_p` 1.0, `top_k` 0 — matched deliberately, because every
earlier q4 measurement in this arc ran at Ollama's truncating defaults (`top_k` 40 /
`top_p` 0.9) and was compared against an untruncated bf16 run.

The `transformers` arm uses the exact kwargs TRL's own non-vLLM path builds
(`grpo_trainer.py:1126`: `do_sample=True`, temperature/top_p/top_k from config).

## What this kills, in order

**1. The q4-as-explorer hypothesis. Dead.** fp16 branches identically to q4 — 0/128 both,
accuracy 0.656 vs 0.657. **Precision is not the variable.** The idea that this arc's founding
"precision defect" had accidentally discovered a policy-level explorer was mine, it was
attractive, and it is wrong.

**2. "The policy is an empirical point mass." Retracted.** I committed that as the arc's
terminal structural finding, on 528 groups, three hours ago. The model branches in **every**
stack except ours. **It was never a property of the policy.**

**3. And it undermines the arc's founding correction too.** I wrote that the gate measured a
4-bit model while the trainer runs bf16, and voided six phases on it. The precision gap was
real, but **it is not what produced the 27.1%-vs-6% gap** — fp16 and q4 behave the same. The
gap was *Ollama vs TRL*. The void stands (the gate genuinely did not run the trained
artifact), but the mechanism I assigned to it was wrong.

## Where the collapse lives, and what is still unknown

It is in **TRL's rollout path**, not in the model, not in `transformers`, not in precision.
TRL repeats each prompt `num_generations` times into one batch
(`mini_repeat_count=self.num_generations`, lines 1240/1283) and generates them together —
which should sample independently per row, and under plain `transformers` with
`num_return_sequences=8` it does.

**I have not found the specific line, and I am not going to guess at one.** Candidates worth
checking: the `environment_factory` post-tool continuation path
(`_generate_single_turn`, called at 2164), batched left-padding interacting with sampling, or
something in the multi-turn re-entry that our environment triggers and a plain rollout does
not.

**One discriminator not yet run:** plain GRPO *without* `environment_factory`. That separates
"the environment path" from "TRL generally" and needs a short training run rather than a
generate call.

## Every difficulty measurement in this arc is now suspect

Seven corpus configurations returned non-degenerate ≈ 0.06. **That number was produced by a
harness that collapses rollouts**, so it measures the harness, not the corpus:

- distance 1–3 → 0.055 · distance 5–11 → 0.000 · D1 → 0.055
- parallel-only n=400 → 0.065 · all-knobs stack → 0.062

Against the same corpus through Ollama, **the same model family yields non-degenerate 0.46–0.54.**

**"Corpus hardening is closed" is withdrawn.** So is the algorithmic pivot argument that
followed from it — the premise that GRPO discards 91.5% of groups was measuring our own bug.

**Eleventh instance of this arc's failure class, and the largest: a number was recorded, and
nobody read what produced it.** This one is mine, it was the session's headline finding, and
it survived three hours and a committed conclusion before a $0 control caught it.

---

## Further isolation — three more candidates ruled out, one left standing

**Not the batching shape.** TRL does not use `num_return_sequences`; it repeats each prompt
`num_generations` times into the batch (`mini_repeat_count`, lines 1240/1283). Tested both
shapes in plain transformers:

| how the 8 samples are requested | byte-identical | distinct of 8 |
|---|---|---|
| `num_return_sequences=8` | 0 / 16 | 8.00 |
| **8 duplicate prompt rows** (TRL's actual shape) | **0 / 16** | **8.00** |

**Not a one-off.** Byte-identical rate across every TRL run in this arc:

| run | shape | groups | byte-identical | mean distinct |
|---|---|---|---|---|
| grid-v2 control / treatment | G=2 local | 32 / 32 | 75.0% / 78.1% | 1.25 / 1.22 |
| hint-probe | G=2 local | 32 | 78.1% | 1.22 |
| turnfix | G=2 local | 32 | 90.6% | 1.09 |
| levels | G=2 local | 64 | 95.3% | 1.05 |
| levels-g8 | G=8 pod | 64 | 67.2% | 1.56 |
| parallel-pin | G=8 pod | 400 | 88.0% | 1.16 |
| stack | G=8 pod | 128 | 92.2% | 1.09 |

**67–95%, both group sizes, both hardware types, eight runs.** Systematic.

**Not an apples-to-oranges comparison.** I checked what TRL actually stores as a
"completion": it is the **full multi-turn transcript** — tool calls, tool responses and the
final answer, 366 characters with 2 tool calls. That is the same kind of object my Ollama
probe concatenated. The comparison holds.

**Not tools or multi-turn as such** — the Ollama probe ran the same tool loop against the
same MCP server and produced 0/128 identical.

### What that leaves, stated as narrowly as the evidence allows

The collapse is specific to **TRL's `environment_factory` multi-turn generation path**. That
is now the only untested difference between the arms — but *untested* is the operative word:
**my transformers control was single-turn and tool-free.** I have not run GRPO with tools
passed through TRL's plain `tools` parameter instead of `environment_factory`, and until I
do, "environment_factory is the cause" remains the leading hypothesis rather than a result.

**The one discriminating run:** same task, same corpus, `tools=` instead of
`environment_factory=`, G=2, a handful of steps, local and free. If it branches,
`environment_factory` is the cause. If it collapses, the cause is in GRPOTrainer's generation
path generally and the fix is different.

## What I am not doing

An external reviewer's read of this was to **drop `environment_factory` and rewrite the
trainer** to pre-generate trajectories and score them through `reward_funcs`. **No** — not on
a hypothesis with one untested discriminator between it and a competing explanation. That is
a large rewrite of a trainer whose only demonstrated fault is a collapse nobody has yet
localised to a line.

The same reviewer called corpus hardening "completely vindicated." It is **reopened**, not
vindicated: we do not know what the difficulty numbers are through a harness that samples
properly, because that measurement has never been taken.

---

## The discriminator ran. `environment_factory` is NOT the cause.

Same corpus, same sampler, same G=2, 16 groups each. The only thing that moved is which TRL
multi-turn path drives the same nine bound methods.

| arm | byte-identical | mean distinct of 2 | accuracy |
|---|---|---|---|
| `environment_factory=` | **100%** | 1.00 | 0.938 |
| **`tools=`** | **100%** | **1.00** | 1.000 |

**Both collapse completely.** The leading hypothesis is refuted, and the external
recommendation built on it — *drop `environment_factory`, rewrite around pre-generated
trajectories* — **would not have fixed anything.** Testing it cost ~4 minutes and no money.

### What is established

- The collapse is in **`GRPOTrainer`'s generation path**, not in `environment_factory`, not
  in the environment wrapper, not in our tool surface.
- **Not precision**: q4 and fp16 both 0/128 identical, accuracy 0.657 vs 0.656.
- **Not the model**: plain `transformers.generate`, same weights, same sampler kwargs TRL
  builds — 0/16 identical, 8.00 distinct, under **both** `num_return_sequences` and
  duplicate-row batching.
- **Not tools or multi-turn**: Ollama ran the same tool loop against the same MCP server and
  branched fully.
- **Not our sampling config**: `GRPOConfig` is left at defaults — temperature 1.0, `top_p`
  1.0, `top_k` 0 — verified against the installed dataclass, and `train.py` overrides none of
  them.

### What is NOT established, and I am stopping rather than guessing

**The mechanism.** Candidates remain: RNG state shared across batch rows during multi-turn
re-entry, KV-cache reuse on the post-tool continuation, state rebuilt from a canonical
transcript rather than per-row, or an interaction with PEFT/gradient-checkpointing under
`generate`. **I have not read `_generate_single_turn`'s re-entry path closely enough to name
one, and a guessed mechanism in an upstream issue wastes a maintainer's time.**

There is also a possibility I have not excluded: **that some interaction of our own config
with TRL produces it**, rather than TRL alone. Ruling that out needs a minimal reproduction
with a stock model, stock reward and no MCP — which is the right next piece of work and is a
different job from this arc.

### Status of every difficulty number in this arc

**Unmeasured.** Not "closed", not "vindicated". Seven corpus configurations returned
non-degenerate ≈ 0.06 through a harness that collapses rollouts, and the same corpus through a
working sampler yields **0.46–0.54**. Nothing in this arc has yet measured task difficulty; it
measured the harness.
