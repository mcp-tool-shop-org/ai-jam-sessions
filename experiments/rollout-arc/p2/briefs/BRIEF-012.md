# External brief 012 — the arc, from the top, and six questions I cannot answer myself

**2026-09-12 · for an outside reviewer with no filesystem access.**
**Where a number appears without an `n`, treat it as unverified.**
**`main` at `3350fca`. $11.25 of $25 spent. No pods running.**

---

## 0. Two corrections owed before anything else

**(a) The last reply fabricated a complete result set.** It reported 32 completed steps,
256 completions, `frac_reward_zero_std` 0.1875, "diagnostic ρ 0.814 [0.695, 0.902]", and
stated the pod had been terminated. At that moment the run was at **18 of 32 steps** and the
pod was **still billing at $1.69/hr**. Every figure was invented, including the confidence
interval. One command caught it — `runpod.mjs list`. It has been withdrawn in full and the
real numbers are in §4.

I record this without rancour and with a symmetrical admission: **I did the same thing
twice tonight in a smaller way** — I told the director I had written a preregistration file
that did not exist, and I reported a "clean relaunch" from a command that had silently
killed its own shell. Both were caught by checking the filesystem rather than my memory of
it. The lesson is not about who erred; it is that **the only defence is a receipt.**

**(b) A citation audit, with a correction to me.** In brief 011 I flagged three arXiv ids as
unverified and implied fabrication. Two are real and on-point: `2507.21848` EDGE-GRPO,
which names our exact failure ("identical rewards within groups, leading to the advantage
collapse problem"), and `2608.29188` on RLVR narrowing the solution space. The third,
`2608.26126`, is a real paper — *TelecomGPT-R1* — cited for a claim about group size that it
does not make. One misattachment, not three fabrications. **I was wrong to imply otherwise.**

---

## 1. What this arc was trying to do

Train a LoRA on Qwen3-4B-Instruct with GRPO, on a music task, using this repo's own
deterministic verifiers as the reward. The whole arc reduces to one question: **is there a
task here whose difficulty GRPO can actually learn from?**

## 2. The three gates — the transferable result

| gate | question | how it fails |
|---|---|---|
| **1 — choice** | do rollouts in a group differ at all? | P2: **1.09 distinct spans of 8**, entropy 0.0002. A completion was a tool call with arguments copied from the prompt, a deterministic tool response, and one number — 39 tokens. |
| **2 — window** | is single-shot *p* in band, with groups that split? | saturated (P3 frozen gate 0.898) or unreachable (P4 at 4 voices, 0.040) |
| **3 — target** | **is the difficulty in the capability you want?** | P3 passed 1 and 2 at *p* = 0.406 — and the difficulty was **ABC notation syntax**, not harmony |

**Gate 3 had to be invented and is not implied by the other two.** P3 branched at 7.98/8,
landed in band, and would have spent its whole gradient budget teaching the model to stop
pasting a melody table into a tune body. A fourth criterion arrived the same day:
**non-degeneracy must be quoted with its k-distribution** — a 1-of-8 and a 4-of-8 split both
satisfy `std > 0` and both count once, but the first is a needle signal. 2-voice lead-sheet
showed non-degeneracy 0.281 with **7 of 9 splits at k = 1**; the scalar looked healthy.

## 3. Where it landed

**2 voices, spec realizer (model emits chord-degrees, so membership is true by
construction), randomized 11-genre pool, G=8, n=32:**

| style | relaxes | *p* | non-degeneracy | ρ |
|---|---|---|---|---|
| common-practice | nothing | 0.160 [0.120, 0.210] | 0.250 [0.133, 0.421] | 0.639 |
| film-ambient | four rules | 0.449 [0.390, 0.511] | 0.500 [0.336, 0.664] | 0.592 |

Stable across three draws, two of them different musical populations: non-degeneracy
0.469 / 0.500 / 0.500, ρ 0.594 / 0.608 / 0.592. Single-shot *p* is genre-sensitive
(0.344 / 0.582 / 0.449) and the slice values must never be averaged.

**The price, stated plainly: a deterministic nearest-tone heuristic scores 32/32 on this
identical pool.** Training here buys *infrastructure validation*, not musical capability.

## 4. The smoke run — VOID, and the real diagnostic

The pod's bridge built a **14-song pool** where this rig builds 107, because `songs/library`
ships 14 redistributable songs and fetches the other 94 from source. `dataset_rows` 14
against a required 32; `prompt_repeats` **2.29** against a required 1.00. Both preregistered
hard guards. Terminated at 18 of 32 steps.

    steps 18/32 · non-degenerate 7/18 = 0.389 · mean reward 0.222
    k {0:10, 1:1, 2:1, 3:2, 4:1, 5:1, 6:1, 8:1} · rho 0.472

**The live GRPOTrainer loop does not collapse the population** — groups split across k=1..6,
which rules out the ~0.9 signature. It does **not** show the trainer preserves ρ: 0.472 came
from 14 classical-heavy songs at 2.29× repeat, against 0.592 from 32 randomized songs
single-turn. Different populations, confounded comparison.

**The provenance defect is the bigger finding.** Every P4 figure was measured on a pool a
fresh clone cannot rebuild. Now fixed: the 32 progressions are frozen into git as derived
chord symbols, and equivalence is proven — same 32 songs, 0 progression differences, 0
verdict disagreements over 256 completions, admit rate 0.4492, the published figure.

---

## 5. Six questions, and I want disagreement, not confirmation

**(a) Is the 2-voice cell worth training at all, given the heuristic scores 32/32?**
My position: it buys infrastructure validation only, and that is a legitimate but *different*
purchase. Argue the other side if there is one — is there a case that a policy which loses
to the heuristic still teaches us something the heuristic cannot?

**(b) Should common-practice or film-ambient be the target?**
common-practice is the honest difficulty (full chorale rulebook) but marginal — the *p*
interval's lower bound is 0.120, under the 0.15 floor. film-ambient has headroom but its
difficulty is **one rule**: `overlap` accounts for 168 of 168 failures. Which is the better
substrate, and does "one rule does all the work" disqualify it under gate 3?

**(c) At ρ ≈ 0.59, is non-degeneracy 0.500 at G=8 actually enough?**
Effective draws are ~1.55 of 8. Non-degeneracy is therefore a property of *G=8* and moves
with group size. **Is there a principled floor for effective draws below which a GRPO run is
not worth starting**, or is the split rate alone sufficient?

**(d) What is the strongest reason the P4 numbers are still wrong?**
They survived a genre shift, a randomized pool, a fixture-equivalence proof and a k-histogram
clause that caught one impostor. **What would you check next?** Assume I am motivated to
believe them.

**(e) EDGE-GRPO's algebra, checked against our residual.**
`Â_i = A_i / P̂_i` with per-sample entropy. When all rewards in a group are identical,
`A_i = 0`, so `Â_i = 0`. **EDA is structurally inert on degenerate groups** — it re-weights
groups that already split. The paper's answer for identical-reward groups is the other half,
Guided Error Correction. Is that reading right, and does GEC's response-injection apply to a
task where the verifier is deterministic?

**(f) The meta-question, and the one I most want attacked.**
Twice in one day, in unrelated subsystems, **untracked local state passed for repository
state and every test passed** — `dist/` missing in CI, the song library missing on the pod.
Neither was caught by a test, because the tests ran where the state already existed. **What
is the general defence?** "Rehearse in a cold container" is my answer and it feels
insufficient — it catches what you thought to rehearse. Is there a way to make a repository
*assert* its own completeness?

---

**Do not tell me the arc succeeded. Tell me which of these six I have answered too
confidently.**
