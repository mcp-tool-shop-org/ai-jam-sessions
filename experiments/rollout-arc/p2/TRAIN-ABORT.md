# P2 train — ABORTED at step 15 of 600. The gate measured a different model.

**Date:** 2026-09-12 · **Spend:** $0.49 (0.41 h, A100 80GB @ $1.19/hr) · **Session total:** $2.77 of $25.
Pod terminated, dead-man disarmed cleanly, nothing billing. Log: [`artifacts/train-abort.log`](artifacts/train-abort.log).

## What happened

The run was killed under the lock's preregistered andon at step 15 of 600:

| metric | value | meaning |
|---|---|---|
| `frac_reward_zero_std` | **1.0** sustained | every group's rollouts agree — zero advantage, zero gradient |
| `acc_joint` / `acc_conditional` | **1.0** | the model answers every training case correctly |
| `format_rate` | 1.0 | the gate is never the limiter |
| `entropy` | 0.0005 | policy is effectively deterministic |
| `kl` | 2.4e-07 | no drift, because there is no gradient |

Lock §4 preregistered a kill on `frac_reward_zero_std` sustained above 0.9. It sat at 1.0
from the first logged step. **600 steps of that would have cost ~$8.60 and produced nothing.**

## Root cause — an arc-level defect, not a run-level one

**Every learnability measurement in this arc was made on a 4-bit quantization. The training
runs full precision.**

| phase | model |
|---|---|
| P1c, P1e, P1f, train-parity | `qwen3:4b-instruct-2507-q4_K_M` (Ollama GGUF, 4-bit) |
| P2 smoke, P2 train | `Qwen/Qwen3-4B-Instruct-2507` (HF, **bf16**) |

Same weights by name. Different precision. The bf16 model solves the task outright.

**So every rate this arc gated on describes the quantized model's difficulty, and none of it
transfers to the model we train.** That includes the 27.1% non-degenerate rate on train, the
32.0% on test that replicated twice, the entire in-band population, and the GO that unlocked P2.
The replication was real — we measured the same quantized model twice and got the same answer.
It was a stable measurement of the wrong thing.

It also retires P1c's mechanism finding. "The policy pages but never uses the second page,"
480 of 480 in-range answers landing inside the first window, is a **quantization artifact**, not
a property of this model family.

## What was ruled out first, and how

Three plausible causes were checked before blaming precision, because all three were cheap:

1. **Prompt leak** — no. Gold never appears in the prompt: gold `10`, prompt reads "at or after measure 9". The song id is absent; only the title appears.
2. **Degenerate corpus** — no. 26 distinct gold values across 32 train cases; distances spread 1/2/3; `gold == after + distance` holds for every row.
3. **A scorer that always returns true** — no. Posting four answers against gold `10`: `"10"` → `correct:true, reward:1`; `"7"` → `correct:false, reward:0`; `"999"` → `format_ok:false` (outside 1–120); `"not a number"` → `format_ok:false`. The scorer discriminates correctly.

The dataset and the reward are sound. The model is simply better than the one we gated on.

## What survives

Everything built, and everything measured **about the machinery** rather than about difficulty:

- the bridge, the environment, the reward, the executor, the compensators (29/29, drilled)
- **tool-token masking at 65.2%**, measured on two machines at two shapes — a property of TRL, not of the policy
- step times, the memory curve, the g=4 ceiling at 97.7% utilisation, cold stage 0 at 220 s
- the andon itself, which fired exactly as written and cost $0.49 instead of $8.60

## What this does NOT license

**Do not re-run against the same bars with the bf16 model and expect a different answer.** The
task is solved by this policy. A trainable population would have to come from harder cases, not
from a different pin — and "harder" now has to be defined against bf16, which no measurement in
this repo has ever used.

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
