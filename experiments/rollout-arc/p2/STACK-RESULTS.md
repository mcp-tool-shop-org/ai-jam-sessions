# The stack moved difficulty and not gradient — and the reason ends the arc

**Rule:** [`STACK-PREREG.md`](STACK-PREREG.md). **None of the four preregistered readings
fired**, because all four were framed around an accuracy target, and accuracy turns out not
to be the binding variable. Blackwell 6000, 128 steps, ≈ $1.00. Pod terminated, nothing
billing.

## Gates clean

`dataset_rows` 128, 128 distinct prompts, `clipped_ratio` **0.00 on all 128 steps**, and
`/health` echoing every knob: `octaves [1,2,3,4,5]`, `decoy_before_bound true`,
`vary_right_hand true`, `parallel_only true`, distances 1–3.

## The stack worked as a difficulty lever — twice as well as needed

| | accuracy | non-degenerate |
|---|---|---|
| parallel-only, n=400 | 0.958 | 0.065 [0.043, 0.094] |
| **all knobs stacked, n=128** | **0.835** | **0.062 [0.027, 0.119]** |

**Accuracy fell 12 points. The target was six.** And **non-degeneracy did not move at all.**

*k*-of-8 spread: `{0: 20, 6: 1, 7: 7, 8: 100}`. The stack moved 20 groups from all-right to
**all-wrong**. It moved essentially nothing into the middle.

## Why: ρ rises with difficulty, and cancels it exactly

My target calculation assumed ρ was fixed at the measured 0.714. **It is not — it is a
function of difficulty:**

| run | accuracy | **ρ** | effective draws of 8 | non-degenerate |
|---|---|---|---|---|
| parallel-only | 0.958 | 0.714 | 1.33 | 0.065 |
| D1 aggregate | 0.923 | 0.893 | 1.10 | 0.055 |
| **all knobs** | **0.835** | **0.947** | **1.05** | 0.062 |

At a *fixed* ρ = 0.714, accuracy 0.835 predicts non-degenerate **0.200** — comfortably in
band. At the **measured** ρ = 0.947 it predicts **0.038**; observed 0.063.

**Every point of difficulty bought is paid back in correlation.** Non-degeneracy is pinned
near 0.06 across the whole accuracy range 0.835–0.958 that this corpus can produce.

## The mechanism, measured on 528 groups

| | groups with **all 8 completions byte-identical** |
|---|---|
| parallel-only (n=400) | **352 / 400 = 88.0%** |
| all-knobs stack (n=128) | **118 / 128 = 92.2%** |
| — of its all-right groups | **100 / 100 = 100%** |
| — of its all-wrong groups | 18 / 20 = 90% |
| — of its split groups | 0 / 8 = 0% |

**At `temperature` 1.0, `top_p` 1.0, `top_k` disabled — fully unrestricted sampling — the
policy emits eight byte-identical completions in about nine groups out of ten.** Not the same
answer by coincidence: the same 603 characters.

The token-level entropy metric is elevated on hard cases (3.7× on all-wrong vs all-right),
but 3.7× of 1.5e-3 is still a point mass. **Elevated relative to nothing is nothing.**

## What this ends, and it is not the corpus

**GRPO's advantage is group-relative. It requires within-group variation. In ~90% of groups
there is none, at any difficulty this corpus can reach.**

That is a property of the policy's output distribution, not of the task — which is why every
corpus intervention produced the same ~0.06:

- distance 1–3 → 0.055 · distance 5–11 → 0.000
- D2/D3 → inert by construction · D1 aggregate → 0.055
- parallel-only at n=400 → 0.065 · **all four knobs stacked → 0.062**

**Seven configurations, one number.** The corpus was never the variable.

## Which reopens the sampling question, on different evidence

I ruled out raising `temperature` above 1.0 earlier, on the grounds that it *manufactures*
disagreement above the model's own distribution — lock §6 territory. **That argument was made
when I believed disagreement existed and was merely rare. It does not exist: 90% of groups
are byte-identical.**

The objection stands as a caution and is now weighed against a harder fact — **without
sampling diversity GRPO cannot function on this policy at all**, regardless of data. That is
a different trade than the one I declined, and it deserves to be argued on its own terms
rather than inherited from a ruling made under a wrong premise.

**Cheapest next measurement, if wanted:** the same stacked corpus at `temperature` 1.1 and
1.2, n=128, ≈$1 each. The question is narrow and answerable: **does any temperature produce
within-group variation without inflating the error rate faster than it produces splits?** If
not, the arc's answer is that this policy is not trainable by group-relative RL on this task,
and that is a real result.
