# External brief 011 — the substrate moved, and four things in your last reply did not survive

**2026-09-12 · for an outside reviewer with no filesystem access.**
**Where a number appears without an `n`, treat it as unverified.**

---

## 0. Corrections to your last reply, in the order they matter

**(a) You called the new gate "a rigorous, programmatic alignment... not a post-hoc
hyperparameter hack." You were right about the design and wrong about the output, through no
fault of your own.** The figures you endorsed — single-shot 0.625, non-degenerate 0.773 — were
produced by a detector with a literal `0x08` byte where a word boundary belonged. Half the
pattern could never match. Corrected: **0.489** and **0.705**. The design judgement stands; the
numbers it was rendered on do not. **Endorsement of a method is not verification of its output**,
and neither of us caught it — a cross-check against an independent count did.

**(b) "The bimodal cliffs are entirely gone." They are not.** On the corrected k-of-8 histogram
`0:6 1:6 2:4 3:5 4:5 5:4 6:2 7:5 8:7`, **13 of 44 groups (30%) are still degenerate** — 6
all-wrong and 7 all-right. What is true is far weaker and still decisive: degeneracy fell from
93.5% to 30%.

**(c) "The substrate problem is solved."** The substrate *gates* are met. **No optimizer step has
been run.** Nothing measured here says the policy would improve; it says the gradient is no
longer structurally absent. Those are different claims and the arc has been killed once already
by merging them.

**(d) Your citation audit — and I owe you a correction too.** I flagged your three arXiv IDs as
unverified and implied they were likely fabricated. **Two of three are real and directly
on-point**, and I was wrong to imply otherwise:

| id | status |
|---|---|
| `2507.21848` EDGE-GRPO — *Entropy-Driven GRPO with Guided Error Correction for Advantage Diversity* | **real, and names our exact failure**: "identical rewards within groups, leading to the advantage collapse problem" |
| `2608.29188` — *Locked at the Entrance, Open Inside: Where RLVR Narrows the Solution Space* | **real, on-topic** |
| `2608.26126` — cited for "a production group size of 8 will naturally yield non-degenerate groups" | **real paper, wrong paper.** It is *TelecomGPT-R1: A Unified Open-Source Reasoner for the Telecom Stack*. It says nothing about group size or learnability bands. |

So: one misattachment, not three fabrications. By this arc's running count that is the sixth
citation failure — but a 2-of-3 hit rate is the best round yet, and **EDGE-GRPO is a lead we
should have found ourselves.**

---

## 1. What changed since brief 010

P2 is closed. Corpus hardening cannot reach the learnability band on the lookup task, and the
reason is mechanical: **ρ rises with difficulty and cancels it.** Measured, same corpus family:

| run | accuracy | ρ | effective draws of 8 | non-degenerate |
|---|---|---|---|---|
| parallel-only, n=400 | 0.958 | 0.711 | 1.34 | 0.065 |
| all knobs stacked, n=128 | 0.835 | 0.938 | 1.06 | 0.062 |

Cases move from all-right to all-wrong without passing through split. The two deadlocks are
structurally different and must not be merged: **distance 1–3 is variance collapse** (0.958, no
splits, gradient starved); **distance 5–11 is an execution wall** (0.000, maximum answer offset
+4, will not page even when told to — 0.016 under explicit instruction).

TRL was cleared as a cause: generic high-entropy prompts branch 4.00/4 with tools and without.
The collapse required our task, where a completion is a tool call with arguments copied from the
prompt, a deterministic tool response, and one number — 39 tokens, entropy 0.0002.

---

## 2. The P3 substrate probe, corrected figures

Same weights (Qwen3-4B-Instruct-2507, bf16, transformers, the trainer's own path), same sampler.
New task: **write a reharmonized ABC lead sheet** for an 8-bar section. 44 items × G=8 = 352
completions, local, $0.

| | P2 lookup | P3 reharmonization |
|---|---|---|
| distinct spans per group of 8 | 1.09 | **7.977 / 8.00** |
| mean token entropy | 0.0002 | **0.107** |
| single-shot pass rate | 0.958 / 0.000 | **0.489** [0.437, 0.541] |
| non-degenerate groups | 0.065 | **0.705** [0.558, 0.818] |
| ρ | 0.711–0.947 | **0.409** |

The gate is deterministic: chord fidelity is true by construction, so **melody consonance plus a
non-triviality guard** (≥ 1/3 of bars must differ from the source harmony) do the work, plus an
ABC well-formedness check added because the frozen gate never verified that the model wrote a
lead sheet at all — 47% of completions pasted the prompt's melody table into the tune body and
passed.

---

## 3. What I want from you, and it is narrow

**(a) Does P3 dissolve the P2 algorithmic question, or defer it?** Brief 009's open decision was
group-relative advantage versus a batch-level or value baseline, motivated by "≈8 of 128 groups
carry gradient." At 0.705 non-degenerate that motivation largely evaporates. My reading is that
the substrate fix makes the algorithm change unnecessary rather than wrong. Argue the other side
if you can.

**(b) What does EDGE-GRPO actually buy at ρ = 0.409?** Its entropy-driven advantage targets
identical-reward groups. We still have 30% degenerate. Is the mechanism worth the complexity at
this ρ, or is it a fix for the regime we just left? **Cite the paper's own numbers, not its
abstract's framing** — and if you have not read past the abstract, say so.

**(c) Name the strongest reason the 0.489 is an artifact.** It rests on a gate I added after
seeing the frozen one at ceiling. I have disclosed that as post-hoc and specified a real ABC
parser to replace the regex. What else would you check before spending on a training run?

**Do not tell me the substrate problem is solved. Tell me what would have to be true for it not
to be.**
