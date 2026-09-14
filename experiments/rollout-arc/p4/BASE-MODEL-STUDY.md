# Base vs instruct — does a blanker checkpoint give RL something to move?

**2026-09-14, $0, no GPU, no pod.** Study-swarm on the Director's hypothesis: *the instruction
tuning is what concentrated the prior, and a pretrained-only checkpoint would have more room to
be specialized.* Three research lanes, every citation through the four-provider oracle, and the
two decisive claims re-verified by hand rather than taken from an agent.

**Oracle status: 12 new ids, 11 CONFIRMED by two independent registries, 1 SINGLE-PROVIDER**
(`2503.24290`, Open-Reasoner-Zero — DataCite has it, OpenAlex does not; nothing below rests on
it alone). Appended to `research/oracle-multi-2026-09-14.txt`.

⚑ **One agent's PDF fetch fabricated quotes.** Its first read of `2607.01465` returned four
fluent, perfectly on-topic sentences about JSON parse failures and all-zero reward groups, plus
a model name (`Qwen3.5-72B`) that does not appear in the paper. The agent caught it on re-fetch
and discarded them, and said so. **Every quote in this file is either from a full-text fetch I
performed myself, or is marked as the agent's fetch.** Treat any single-source PDF summary in
this arc as unverified until re-fetched — this is now the second retrieval-integrity failure
this arc has caught, after the arXiv 429-as-fabrication one.

---

## The short version

**The mechanism is real and well-measured. The remedy is doubtful, and the risk is quantified.**
The hypothesis is worth exactly **one generation probe** — which needs no training, no prereg,
and answers it outright.

---

## 1. The Director's mechanism is correct, and it is mostly SFT's doing

**Post-training destroys roughly three quarters of a model's output diversity, in stages.**
Zhang et al. 2025, *Verbalized Sampling* (arXiv:2510.01171) — the paper this arc already treats
as load-bearing — measures Tulu-70B diversity at **45.4% base → 20.8% after SFT → 10.8% after
DPO**. Verbalized Sampling recovers **66.8%** of base diversity against 23.8% for direct
prompting.

Kirk et al. 2023 (arXiv:2310.06452) corroborates the direction on LLaMA-7B across three
independent diversity metrics: RLHF substantially decreases per-input diversity relative to SFT.
*(Direction only — the magnitudes live in figures the agent could not transcribe.)*

**So "instruction tuning concentrated the prior" is not a hunch. It is measured, and most of the
damage is done by SFT rather than by RL.** That also exonerates our GRPO: a verifier-only reward
carries no typicality bias, so our training is not what collapsed the prior — Qwen's
post-training was.

## 2. But Qwen base checkpoints are not blank

Verified by me, full text of Liu et al. 2025, *Dr. GRPO* (arXiv:2503.20783, §2.2):

> "Qwen-2.5 base models get an immediate ∼60% improvement by not using template, making us
> hypothesize that they may pretrain on concatenated question-answer texts"

and, decisively:

> "we shall be more careful about using Qwen2.5 models to reproduce DeepSeek-R1-Zero, since
> **the base models are already SFT-like without templates**."

The hypothesis wants a blank slate. Within the Qwen family the base checkpoints are the
literature's canonical example of *not* being one. Whether Qwen3-4B-Base inherits that is
unmeasured — and is exactly what the probe in §6 measures.

## 3. The direction of the argument runs against the literature

Yue et al. 2025 (arXiv:2504.13837) hold that RLVR **narrows** an existing distribution rather
than adding to it — base models beat their RLVR-trained children at large k, and the base is
treated as an upper bound. The paper names **distillation**, not RL, as the thing that genuinely
expands coverage.

Under that reading, "a blanker model gives RL more room to specialize" is backwards: RL would
*narrow* the base's wider support, not widen it. That is also exactly what this arc measured six
times — every training arm reduced support (base 1.84 → C7 1.65 → B07 1.56).

## 4. The risk is a hard zero, and it is quantified

**This is the finding that would kill a cell.** Dr. GRPO Table 1, transcribed by me from the
fetched HTML — Qwen2.5-Math-7B **base**, by template:

| template | AIME24 | AMC | MATH500 | Minerva | Olympiad | **Avg** |
|---|---|---|---|---|---|---|
| 4-shot prompting | 3.3 | 22.5 | 61.6 | 10.7 | 20.9 | 23.8 |
| **R1 template** | **0.0** | **0.0** | **0.0** | **0.0** | **0.1** | **0.0** |
| Qwen template | 16.7 | 38.6 | 50.6 | 9.9 | 16.6 | 26.5 |
| **No template** | 0.2 | 45.8 | 69.0 | 21.3 | 34.7 | **38.2** |

> "Applying templates in fact destroys the capability before RL reconstructs it."

**A base model under the wrong envelope scores literally zero.** Our verifier returns reward 0
for unparseable output, and a group of eight zeros has *identically zero* advantage. An all-zero
reward field is not a weak signal — it is no gradient at all, on every step.

Three corroborations, all CONFIRMED:
- **JSONSchemaBench** (arXiv:2501.10868): unconstrained schema coverage falls to **21%** on
  JSONSchemaStore and **13%** on GitHub-Hard *for instruct models*.
- **SimpleRL-Zoo** (arXiv:2503.18892): strict `\boxed{}` format rewards caused model collapse on
  Llama-3.1-8B; weaker checkpoints needed *relaxed* prompts to train at all — and relaxing the
  output contract is the one thing a deterministic verifier cannot do.
- **Advantage Collapse** (arXiv:2605.21125): 28–45% of batches already collapse across
  Qwen2.5 0.5B–14B. We measure 46–76%. A base start pushes toward the all-incorrect corner where
  that rate goes to 100%.

**What we would be risking is measured: `unparseable` is 0.0% on every arm of the B0 cell.**
Perfect format compliance is precisely what the instruction tuning bought.

## 5. What practice actually does, sorted by what the reward gates on

| | starting checkpoint | output contract |
|---|---|---|
| R1-Zero (arXiv:2501.12948) | base | free-text math — and it still produced "poor readability, and language mixing", fixed in R1 by **cold-start SFT plus a language-consistency reward** |
| DAPO (arXiv:2503.14476) | Qwen2.5-32B base | free-text math, no format reward |
| Open-Reasoner-Zero (arXiv:2503.24290) | Qwen2.5-7B/32B base | free text; format solved by *prompt engineering*, "even unaligned base model can yield well-formatted responses" |
| Skywork-OR1 (arXiv:2505.22312) | **R1-Distill (SFT'd)** — deliberately, saying most prior work used base | long CoT |
| Atlassian tool-use (arXiv:2607.01465) | **prompted instruct**, Qwen3-1.7B / Qwen3.5-4B | **strict schema, deterministic trace verifier** |

**The split is not base-vs-instruct. It is free-text-vs-strict-contract.** Every result that
gates on a strict output contract starts warm. The closest published twin to this cell — 4B, a
deterministic schema verifier, GRPO — chose instruct.

## 6. Two mechanical facts I checked myself, one of which corrects me

**⚠ Correction. I told the Director that switching to a base checkpoint is "a prompt redesign,
not a flag." That is wrong for the natural candidate.** Fetched from the Hub just now:

| | `chat_template` | `eos_token` | template closes with |
|---|---|---|---|
| `Qwen/Qwen3-4B-Base` | **present, 4116 chars** | `<\|endoftext\|>` | `<\|im_end\|>` |
| `Qwen/Qwen3-4B-Instruct-2507` | present, 2630 chars | `<\|im_end\|>` | `<\|im_end\|>` |

`Qwen3-4B-Base` **exists**, is **Apache-2.0**, and **ships a full ChatML template**, so
`apply_chat_template` at `probe_generate.py:64` and `train.py:192` will not raise. The pipeline
needs no redesign for this candidate. (It *would* for `SmolLM3-3B-Base` and `OLMo-2-7B`, which
ship none.)

**And the landmine that correction uncovered:** the Base checkpoint's `eos_token` is
`<|endoftext|>` while the template it ships closes every turn with `<|im_end|>`. **Generation
would not stop at the turn boundary** — every rollout would run to the 384-token cap and trail
continuation text past the JSON. That is a silent route to exactly the all-zero-reward failure
§4 describes, arriving through tokenizer config rather than through model capability. It is
checkable before any spend and it is now checked.

## 7. The probe — one measurement, and it is not a training cell

Nothing above settles the Director's question, because nobody has published base-vs-instruct
support numbers for Qwen3-4B on anything, let alone this task. **The question is empirical and
cheap.** `scripts/prior-shape.mts` already computes the two numbers that decide it.

| arm | what it answers |
|---|---|
| **A** `Qwen3-4B-Base`, same ChatML prompt, 75 items, G=64 | does a base checkpoint have wider support under our actual envelope? |
| **B** `Qwen3-4B-Base`, **no template** (raw completion prompt) | Dr. GRPO says this is where Qwen bases really live; does support widen when the envelope comes off? |
| C | already measured — instruct: **support 1.84 of 16, unparseable 0.0%** |

**Decision rule, fixed now rather than after seeing it:**

- **support ≥ 6 of 16 and unparseable ≤ 20%** → the hypothesis has legs and a training cell is
  worth pricing.
- **support ≈ 2** → the hypothesis dies here. Qwen bases are SFT-like as Dr. GRPO says, and no
  swap inside this family helps.
- **unparseable ≥ 50%** → the hypothesis may be true and is unbuyable at our verifier: no
  gradient, on every step. Arm B then becomes a question about redesigning the envelope, which
  is a different project.

**Cost.** Generation only — no training, no adapters, no prereg, because nothing is being
claimed, only measured. One ~8 GB download, then two evals: **~70 min and $0 on this rig**, or
**~0.6 h and ~$0.41** on a 5090 community pod. Pre-flight: assert the eos/template mismatch is
handled before either arm runs.

**This needs the Director's go, because the 5090 was put off-limits for this arc.** It is an
eval, not a train, and it is the cheapest thing that can answer the question he asked.

## What this study does not license

- **No training cell on any checkpoint.** §4 says the all-zero-reward risk is real and §6 found
  a mechanical route to it. Measure first.
- **No claim that the hypothesis is wrong.** §1 says the mechanism is real and measured. What is
  doubtful is whether *this family's* base checkpoint recovers it, and §2 is the reason to doubt.
- **`2503.24290` is SINGLE-PROVIDER** and carries none of the argument alone.
- **The Yue argument (§3) cuts both ways** and is not a veto: it says RL narrows support, which
  is an argument for starting wide — and simultaneously an argument that RL will not *give* us
  width. Both readings survive the probe; only the numbers settle which matters.

## Receipts

`research/verify-multi.py` · `research/oracle-multi-2026-09-14.txt` ·
`research/ids-basemodel-2026-09-14.txt` + `ids-m1m4-2026-09-14.txt` ·
`research/drgrpo-2503.20783.html` (Table 1 transcribed by hand) ·
Hub `tokenizer_config.json` for `Qwen/Qwen3-4B-Base` and `Qwen/Qwen3-4B-Instruct-2507` ·
`scripts/prior-shape.mts` (`d1116ab`) · `B0-RESULTS.md` (`c8b2823`)
