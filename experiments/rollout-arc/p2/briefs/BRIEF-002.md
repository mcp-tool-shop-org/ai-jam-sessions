**Don't summarize this back — I need a position with reasoning. One question.**

First, a correction: your last reply said the data points to "an optimal group size of
G=2 for efficiency." Nothing supports that. G=2 is a limitation of a local probe I'm
running, not a recommendation, and the correlation finding argues the opposite way. Please
drop it.

## The question

**Given that our GRPO rollouts within a group are strongly correlated, what group size G
and sample size n should we buy with the next ~$4?**

## What you need to know

We run GRPO on a tool-use task. Per optimizer step we take one prompt and sample G
rollouts; a group where all G agree yields zero advantage and zero gradient. TRL 1.13.0
has no dynamic sampling, so degenerate groups are kept and contribute nothing.

**The rollouts are not independent draws.** From a production run at G=8, correct-count per
group was `8,5,8,8,4,8,8,8,8,8`:

- mean p = 0.9125, observed variance 2.233 vs binomial 0.639
- **overdispersion 3.50, intra-group correlation ρ ≈ 0.357, ≈2.3 effective draws of 8**
- under independence, 7-of-8 is the likeliest non-perfect outcome (P = 0.369) — it occurred
  **zero times in ten groups** (P = 0.010)

Sampling is already unrestricted (temperature 1.0, top_p 1.0, top_k 0, nothing set by us),
so this is the model's own distribution being near a point mass. It is input-dependent:
entropy is ~3e-4 on collapsed groups and 30–200× higher on the ones that disagreed.

A separate local probe (G=2, different population) gives ρ ≈ 0.745.

**Costs, measured:** A100 80GB at $1.19/hr, 44.6 s/step at G=8 with one group per step.
A step's wall time is dominated by the rollouts, so cost scales roughly with G×steps.
Budget remaining: $22.23. We also have a timing probe: per *effective* update, g=1 costs
160.0 s, g=2 157.5 s, g=4 198.6 s, g=8 OOMs on our local card.

## What I actually need from you

1. **Take a position on G.** Larger G buys more chances of disagreement per prompt, but at
   ρ≈0.36 the marginal rollout is mostly a copy. Smaller G buys more distinct prompts for
   the same tokens. Where does that trade land, and what does the RL literature say about
   group sizing under correlated rollouts specifically?
2. **Give me an n.** For estimating a group-level non-degenerate rate, the effective sample
   size is groups, not rollouts — so does spending on G ever beat spending on more prompts?
3. **Name what would change your answer**, and whether any cheap measurement would settle
   it before we spend.

Cite specific work where it exists (DAPO, INTELLECT-2, Dr. GRPO, anything on group sizing
or advantage estimation under low-entropy policies). If the honest answer is "your ρ
estimate from 10 groups is too noisy to act on," say that — it's a real possibility and
I'd rather hear it than get a number.
