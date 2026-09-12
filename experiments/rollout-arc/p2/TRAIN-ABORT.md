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

## The reusable lesson

**A learnability gate must run the exact artifact that will be trained — same weights, same
precision, same serving path.** Ours ran a GGUF through Ollama and trained an HF checkpoint in
bf16, and nothing in six phases of receipts caught it, because every phase inherited the pin
from the phase before and the pin was internally consistent the whole way down.
