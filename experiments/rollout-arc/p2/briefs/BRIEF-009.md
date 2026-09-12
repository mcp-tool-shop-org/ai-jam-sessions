**Both your citations are real and both are on point — the first time that has happened here.
And read together they argue against your own recommendation.**

## Verified

**arXiv:2507.21848 — "EDGE-GRPO: Entropy-Driven GRPO with Guided Error Correction for
Advantage Diversity"** — Zhang, Wen, Wu, Huang, 29 Jul 2025. Abstract:

> *"GRPO … relies on sparse reward rules, often encounters the issue of **identical rewards
> within groups**, leading to the **advantage collapse problem**."*

**That is our finding with a name.** Seven configurations, one number ≈ 0.06, because ~90% of
groups carry identical rewards.

**arXiv:2605.30789 — "Smaller Models are Natural Explorers for Policy-Level Diversity in
GRPO"** — Xu, Ren, Lin et al., 29 May 2026, rev. 24 Jul 2026. Abstract:

> *"While GRPO relies on diverse rollouts, prevailing strategies primarily increase diversity
> by **injecting more token-level randomness** …"*

**That sentence is about the temperature sweep, and the paper is positioned against it.** It
proposes S2L-PO: a *smaller model* as explorer, giving policy-level rather than token-level
diversity, "maintaining logical consistency in trajectories."

## So I would not run the temperature sweep first

Not because the objection I raised earlier still stands — it doesn't, and you were right that
it was premised on disagreement existing. Because **the verified literature you supplied
calls token-level randomness the naive axis**, and because of a specific reason it will not
work here:

**EDGE-GRPO differentiates responses with identical *rewards* but different *content*. Our
groups have identical *content* — the same 603 bytes, 8 times.** Entropy-driven advantage has
nothing to differentiate. Temperature might break the tie; it would do so by degrading
trajectories rather than diversifying them, which is the distinction S2L-PO is drawing.

*(Caveat: abstracts only. I have not read either full paper and am not claiming their methods
transfer without checking.)*

## The connection that matters, and it closes this arc's loop

S2L-PO's premise is that a **smaller, weaker model generates the diverse rollouts** used to
train a larger one.

**We have one.** `qwen3:4b-instruct-2507-q4_K_M` — the 4-bit quantization that this entire
arc's original measurements were taken on, and which I declared void as "the wrong artifact."

On that model the measured non-degenerate rate was **27.1% train / 32.0% test** — *in band*,
replicated twice. Those numbers were correctly voided **as a claim about bf16**. But under
S2L-PO's framing they are not a defect at all: **they are the explorer's diversity, which is
the quantity that architecture wants.**

The arc's founding error may describe the literature's recommended method. **That is a
hypothesis, not a finding** — it needs the explorer/trainee split actually built and run, and
nothing here shows the q4 rollouts carry usable signal for bf16.

## Two questions back

1. **Does S2L-PO's explorer have to be a different *model*, or does a different *precision* of
   the same model qualify?** The mechanism they claim is structural/logical diversity rather
   than noise. A 4-bit quantization of the same weights is an unusual case: same policy,
   coarser. If they address that, cite the section.
2. **Does EDGE-GRPO's entropy-driven advantage do anything when completions are byte-identical
   rather than merely equally-rewarded?** If not, say so — it means the method addresses a
   milder failure than ours and should not be proposed as a fix.

Verified numbers, unchanged: accuracy 0.835 stacked, non-degenerate 0.062, ρ 0.947,
**88–92% of groups byte-identical at temperature 1.0.** Spend $8.80 of $25.
