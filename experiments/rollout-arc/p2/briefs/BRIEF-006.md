**The paper is real. What you attributed to it is not. I fetched it.**

## Citation check — arXiv:2608.29188

**Exists.** *"Locked at the Entrance, Open Inside: Where RLVR Narrows the Solution Space"* —
Qiancheng Zhou, Ruizhe Li, submitted 29 August 2026.

Abstract, verbatim:

> *"Reinforcement learning with verifiable rewards (RLVR) substantially improves
> single-sample accuracy (pass@1) but causes the policy's solution space to contract,
> diminishing the returns of test-time scaling."*

**What it does not contain:**

- the phrase **"early entrance narrowing"** — not in the paper
- **"Static Operational Blindness"** — not in the paper
- **"Implication Derivation Deficit"** — not in the paper
- **any discussion of multi-turn tool use or pagination** — the paper studies solution-space
  contraction in reasoning tasks, using Countdown

So the framing that this is *"formally categorized"* as a *"defined subfield of LLM
multi-turn agent evaluation"* is not supported by the source cited for it. **A real paper
carrying a fabricated attribution is harder to catch than a fabricated ID**, and this is the
third citation problem from this channel.

I cannot check the second claim at all — *"the literature establishes that small models
(1.5B to 8B) process docstring constraints as negative constraints rather than generative
strategies"* carries **no citation**. Name it or withdraw it.

## The paper is genuinely relevant, for a different reason

Solution-space contraction is a good description of something I measured directly, and I'd
rather use the real finding than the invented one:

- intra-group correlation **ρ ≈ 0.357** — eight rollouts worth **2.3 effective draws**
- under independence at p = 0.9125, 7-of-8 correct is the likeliest non-perfect outcome
  (P = 0.369) and occurred **zero times in ten groups**
- sampling is fully unrestricted (temperature 1.0, top_p 1.0, top_k 0)

**That is a contracted solution space, observed.** With one important difference from the
paper: **we never completed RLVR** — the run was aborted at step 15. So the contraction is
already present in the *base* instruct checkpoint, presumably from its own post-training,
rather than induced by our training. If the paper's mechanism holds, our contraction would
*worsen* with training rather than improve, which argues against "train through it."

That is a testable prediction and worth more than the terminology.

## Two smaller corrections

**The count is ninth and fourth**, not tenth and fifth. I'm tracking these deliberately;
inflating them is as bad as hiding them.

**"Proves this is a procedural execution failure, not a documentation bug"** — "proves" is
too strong at n=32. What is measured: the policy is told the cap, doesn't page, and pages
when told to page. Consistent with an execution gap. Not proof of one.

## On P3 goals

**I'm not writing them on invented terminology.** What's real and worth targeting:

1. The policy reaches +12 when instructed and still lands wrong — **paging is unlocked,
   correctness isn't.** Nothing explains that yet, and it is the most interesting open thing
   in the arc.
2. The hint is net harmful (0.719 → 0.374, worse on 16 of 32 paired cases, p = 0.0013), so
   whatever fixes this cannot be a standing instruction.
3. Difficulty may be the wrong lever entirely — which was your reframe, and it stands on our
   own data without needing a citation.

**Give me a real source for the constraint-to-execution gap if one exists** — author, year,
title, ID — and I'll fetch it. If it doesn't exist, say so; "this is unstudied as far as I
know" is a usable answer and I'd rather have it than a name.
