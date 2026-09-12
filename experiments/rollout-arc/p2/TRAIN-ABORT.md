# P2 train — ABORTED at step 15 of 600. The gate measured a different model.

**Date:** 2026-09-12 · **Spend:** $0.49 (0.41 h, A100 80GB @ $1.19/hr) · **Session total:** $2.77 of $25.
Pod terminated, dead-man disarmed cleanly, nothing billing. Log: [`artifacts/train-abort.log`](artifacts/train-abort.log).

## What happened

The run was killed under the lock's preregistered andon at step 15 of 600:

> **CORRECTED 2026-09-12.** The table in this section originally read
> `frac_reward_zero_std` **1.0 sustained**, `acc_joint` **1.0** — "the model answers every
> training case correctly" — and said it "sat at 1.0 from the first logged step." **That is not
> what the run did**, and the error is the receipt author's. The log was re-read line by line
> after the peer flagged the discrepancy. The corrected numbers are below; the abort itself is
> unaffected and the original wording is quoted here rather than deleted.

Every logged step from `artifacts/train-abort.log` line 7404 onward (the `1024 training rows`
block — the training stage, at `num_generations` 8, one group per step):

| step | `acc_joint` | `frac_reward_zero_std` | `grad_norm` | `entropy` | `clipped_ratio` |
|---|---|---|---|---|---|
| 1 | 1 | 1 | 0 | 2.9e-4 | 0 |
| **2** | **0.625** | **0** | **4.616** | 6.6e-3 | 0 |
| 3 | 1 | 1 | 5.5e-6 | 6.0e-2 | 0 |
| 4 | 1 | 1 | 1.2e-11 | 3.2e-4 | 0 |
| **5** | **0.5** | **0** | **0.986** | 8.9e-3 | 0 |
| 6 | 1 | 1 | 1.1e-7 | 1.2e-3 | 0 |
| 7 | 1 | 1 | 1.4e-12 | 9.5e-3 | 0 |
| 8 | 1 | 1 | 2.2e-12 | 3.3e-4 | 0 |
| 9 | 1 | 1 | 3.2e-13 | 2.7e-4 | 0 |
| 10 | 1 | 1 | 8.8e-9 | 4.7e-4 | 0 |

| metric | corrected value | meaning |
|---|---|---|
| `frac_reward_zero_std` | **0.80 mean**, 1.0 on 8 of 10 steps | **two steps were non-degenerate**, not zero |
| `grad_norm` on those two | **4.616 and 0.986** | real gradients, against 1e-11 to 1e-13 elsewhere |
| `acc_joint` | **0.9125 mean**, 1.0 on 8 of 10 | the model does **not** answer every case correctly |
| `format_rate` | 1.0 | the gate is never the limiter |
| `entropy` | 2.9e-4 to **6.0e-2** | ~3e-4 when degenerate, 30–200× higher on the two live steps |
| `clipped_ratio` | 0 throughout | **not** the truncation confound |

**The abort stands.** Eight of ten steps carried gradients between 1e-11 and 1e-13 against
entropy ~3e-4 — arithmetically zero updates. Lock §4's kill is on `frac_reward_zero_std`
sustained above 0.9, and steps 6–10 were five consecutive steps at 1.0. **600 steps of that
would have cost ~$8.60 and produced nothing.** Killing it for $0.49 was correct.

**What does not survive is the headline.** The observed non-degenerate rate is **2/10 = 0.200**,
and its exact 95% interval is **[0.025, 0.556]** — which *contains* the 27.1% this arc gated on.
So does every other bf16 measurement taken since:

| measurement | non-degenerate | 95% CI (Clopper–Pearson) | contains 0.271? |
|---|---|---|---|
| this run, n=10 | 0.200 | [0.025, 0.556] | **yes** |
| local reproduction, n=6 | 0.000 | [0.000, 0.459] | **yes** |
| `runs/bf16-check`, n=8 | 0.125 | [0.003, 0.527] | **yes** |

**Not one of them distinguishes bf16 from the rate the arc gated on.** The supportable claim is
*bf16 is much stronger than the 4-bit model and most groups are degenerate* — a methodology
failure, which is real and is the subject of the next section. A demonstrated collapse of the
difficulty rates is **not** established, and "every difficulty rate in this arc describes the
wrong artifact" is overstated wherever it appears. Settling it needs n in the hundreds: at
n=32 the half-width on a rate near 0.235 is ±0.147; at n=256 it is ±0.052.

**One further observation, from the same ten rows.** As *k* of 8 correct they read
`8, 5, 8, 8, 4, 8, 8, 8, 8, 8`. Under independent sampling at p = 0.9125 the most likely
non-perfect outcome is 7 of 8, at probability 0.369 — **it occurred zero times** (P = 0.010),
as did 6 of 8. The only non-perfect outcomes were 5/8 and 4/8. The eight rollouts in a group are
not eight draws; they are **a few trajectories replicated**. Sampling is unrestricted
(`temperature` 1.0, `top_p` 1.0, `top_k` disabled, none set by `train.py`), so this is the
model's own distribution being near a point mass on these inputs — and it is input-dependent,
since the two steps that broke apart are the two with 30–200× the entropy.

## Root cause — an arc-level defect, not a run-level one

**Every learnability measurement in this arc was made on a 4-bit quantization. The training
runs full precision.**

| phase | model |
|---|---|
| P1c, P1e, P1f, train-parity | `qwen3:4b-instruct-2507-q4_K_M` (Ollama GGUF, 4-bit) |
| P2 smoke, P2 train | `Qwen/Qwen3-4B-Instruct-2507` (HF, **bf16**) |

Same weights by name. Different precision.

**The defect is that the gate never ran the artifact we train.** That is measured, it is not in
dispute, and it is the whole lesson of this document. Everything below is about how far the
consequence can be pushed, and the answer is: less far than this section originally claimed.

> **CORRECTED 2026-09-12.** This section originally read *"The bf16 model solves the task
> outright"* and *"every rate this arc gated on describes the quantized model's difficulty, and
> none of it transfers to the model we train … a stable measurement of the wrong thing."*
> **Both are overstated** — see the correction at *What happened* above. bf16's measured
> non-degenerate rate is 2/10 = 0.200 with a 95% interval of [0.025, 0.556], which **contains**
> the 27.1% the arc gated on; so do the other two bf16 measurements (0/6 and 1/8). The rates may
> or may not transfer. **Nothing measured so far can tell us**, and settling it needs n in the
> hundreds. The original wording is quoted rather than deleted.

What the precision mismatch licenses is that the 27.1% on train, the 32.0% on test, the in-band
population and the GO that unlocked P2 were all **measured on a model nobody will train** — so
they are unverified for bf16, not disproven. The replication was real: we measured the same
quantized model twice and got the same answer.

> **CORRECTED 2026-09-12.** This paragraph originally said the mismatch *"retires P1c's
> mechanism finding"* — that "the policy pages but never uses the second page" is *"a
> quantization artifact, not a property of this model family."* **That is inference, not
> measurement**, and the peer flagged it before the correction above was written. Every case in
> this corpus is pinned to distance 1–3, so the answer is inside the first window **by
> construction** and answering from page one is correct behaviour, not a defect. **bf16 has
> never been run at distance ≥ 4.** The honest status is *unverified for the model we would
> train*, not *retired as an artifact*. It matters because the distance pin exists because of
> that finding. See the fuller treatment in *Independently reproduced* below.

## What was ruled out first, and how

Three plausible causes were checked before blaming precision, because all three were cheap:

1. **Prompt leak** — no. Gold never appears in the prompt: gold `10`, prompt reads "at or after measure 9". The song id is absent; only the title appears.
2. **Degenerate corpus** — no. 26 distinct gold values across 32 train cases; distances spread 1/2/3; `gold == after + distance` holds for every row.
3. **A scorer that always returns true** — no. Posting four answers against gold `10`: `"10"` → `correct:true, reward:1`; `"7"` → `correct:false, reward:0`; `"999"` → `format_ok:false` (outside 1–120); `"not a number"` → `format_ok:false`. The scorer discriminates correctly.

The dataset and the reward are sound. The model is simply better than the one we gated on.

## What survives

Everything built, and everything measured **about the machinery** rather than about difficulty:

- the bridge, the environment, the reward, the executor, the compensators (29/29, drilled)
- **tool-token masking — the mechanism**, a property of TRL rather than of the policy: every
  completion carried a zero span, 4/4 and 64/64. **The 65.2% figure itself is weak** and the
  earlier "measured on two machines at two shapes" is withdrawn: that run had `dataset_rows: 2`,
  so it is an average over **two distinct prompts**, and masked fraction moves with how many
  pages a rollout fetches. The mechanism survives; the percentage does not.
- the memory curve, the g=4 ceiling at 97.7% utilisation, cold stage 0 at 220 s
- **step times, with one qualification**: the A100's **44.6 s/step** over 10 distinct prompts at
  `num_generations` 8 is the only throughput figure here that means anything. The 5090's local
  times are **withdrawn as throughput** — reserved memory crosses the card's physical total and
  Windows spills to shared memory rather than failing, at 3.5× the cost. The smoke's 38.5 s/step
  is likewise a 2-prompt sample.
- the andon itself, which fired exactly as written and cost $0.49 instead of $8.60

## What this does NOT license

**Do not re-run against the same bars and treat the old numbers as still standing.** They were
measured on a model nobody will train, so every bar in this arc is unverified until re-measured
against bf16 — which no measurement in this repo has ever used.

> **CORRECTED 2026-09-12.** This section originally read *"The task is solved by this policy"*
> and concluded that a trainable population *"would have to come from harder cases."* **Not
> established.** bf16 answered 0.9125 of completions and left 2 of 10 groups non-degenerate;
> that is consistent with the task being solved, and equally consistent with the 27.1% the arc
> gated on. Harder cases are **one** hypothesis. The other is that the pinned population already
> carries a usable rate and was never measured properly against bf16 — which is cheaper to test
> than to rebuild the corpus, and is the live question.

## Independently reproduced, on different hardware — 2026-09-12

The claim above invalidates six phases of receipts, so it was checked rather than accepted.
Reproduced on the rig's RTX 5090 against a local bridge, through the same `train.py` path, on
**train** cases from the same corpus:

| completion budget | prompts | result |
|---|---|---|
| 256 tokens | 8 | acc_joint **0.69**, `frac_reward_zero_std` 0.875 — one non-degenerate group |
| **1024 tokens** (the production budget) | 6 | acc_joint **1.0** on every step, `frac_reward_zero_std` **1.0**, tool turns 2–3 |

**The 256-token run looked like a falsification and was not one.** Its two failures were
`format_rate` 0 with `completions/clipped_ratio` 1 — the model was truncated mid-answer, so
those were an artifact of the test's token budget, not the model missing the case. At the
production budget the effect vanishes and the finding above reproduces exactly: bf16 solves
these cases, every group degenerate, on a second machine and a second GPU architecture.

That is worth keeping for its own sake, because it is lock §3's confound in miniature: at 256
tokens this model's apparent accuracy is 0.69 and at 1024 it is 1.0, and **none of that
difference is skill.**

### One claim above is inference, not measurement

> *"It also retires P1c's mechanism finding … a quantization artifact, not a property of this
> model family."*

**Plausible, and not established.** What is measured is that bf16 answers *these* cases
correctly. P1c's finding was about **distance ≥ 4**, where the answer lies outside the first
4-measure page — and every case in this corpus is pinned to distance 1–3, so the answer is
*inside* the first page by construction. Answering from the first page is correct behaviour
here, not a defect.

**bf16 has never been run at distance ≥ 4.** Whether it pages properly is untested, and the
honest status of P1c's mechanism is *unverified for the model we would train*, not *retired as
an artifact*. The distinction matters because that finding is load-bearing: the distance pin of
1–3 exists because of it, and relaxing the pin is one of the few routes to "harder cases"
this document says a future population would need.

## A second, independent hole: the prompt's bound was never load-bearing

Checked 2026-09-12 while reviewing the `decoyBeforeBound` knob, because the rationale behind it
is a claim about **every corpus this arc measured**. It is true, and stronger than it was put.

Deterministic re-derivation — no model involved — asking whether a policy that **ignores** "at or
after measure N" and scans from measure 1 lands on the same measure as the bounded search:

| corpus | pin | same answer ignoring the bound |
|---|---|---|
| v0 default | seed 20260911 | **320 / 320 (100%)** |
| P1f test | seed 2026091102, 64/level | **448 / 448 (100%)** |
| P2 train | seed 2026091103, 256/level | **1280 / 1280 (100%)** |

Zero cases discriminate, on any pin, ever. The cause is in `makeSong`: every measure outside the
planted 4-measure page takes a filler voicing drawn with `shared(v.pcs, target.pcs) === 0`, so
**nothing before the bound can match the target chord**. The clause is unfalsifiable by
construction.

The task the arc actually measured was *"find the first measure whose left hand is chord X"* —
the bound was decoration, and **instruction-following was never under test**. This is
independent of the precision defect: even with the pin correct, the task had this second hole,
and a policy that ignored half the prompt would have scored identically.

It also sharpens what P1c's mechanism can mean. "Answers from the first window" was never
evidence about paging on these corpora, because the first window is both where the answer is
*and* where an unbounded scan would find it.

## The reusable lesson

**A learnability gate must run the exact artifact that will be trained — same weights, same
precision, same serving path.** Ours ran a GGUF through Ollama and trained an HF checkpoint in
bf16, and nothing in six phases of receipts caught it, because every phase inherited the pin
from the phase before and the pin was internally consistent the whole way down.
