# Exploring starts — the funnel breaks, and ρ was never a property of the task

**Local, RTX 5090, $0. common-practice · 2 voices · 4 bars · G=16 · n=32 · 512 completions.**
Every rollout's assistant turn pre-filled with a different valid opening voicing. Sampler
unchanged (temperature 1.0, top_p 1.0, top_k 0) — the intervention changes the CONDITIONING,
not the sampling.

Each item has exactly 16 valid openings and G=16, so **a group spans the opening space
completely — one rollout per opening, by construction rather than by luck.**

## The result

| | unforced (4-bar, G=16) | **exploring starts** |
|---|---|---|
| pass rate | 0.389 *(unconditional)* | **0.453** *(CONDITIONAL)* |
| non-degenerate | 14/32 = 0.4375 | **30/32 = 0.9375** [0.799, 0.983] |
| ρ | 0.710 | **0.221** |
| effective draws | 1.37 of 16 | **3.70 of 16** |
| passing signatures unique | 22.1% | **90.1%** |
| within-group uniqueness | 0.356 | **1.000** |
| k-of-16 | `0:13` plus clusters | `1:4 2:1 3:1 4:2 5:5 6:1 7:3 8:4 9:1 10:3 11:2 12:1 13:2 16:2` |

**The policy does not crash when dropped where it would never go.** It completes correctly 45%
of the time from openings it never chooses. The competence is real and was simply never
expressed: `[0,1]` was a prior, not a ceiling.

**Within-group uniqueness is 1.000** — every passing rollout in every group is a distinct
solution. Not one duplicate among 232 passers.

**Only 2 of 32 groups remain degenerate**, against 13 unforced. The starvation is gone.

## ρ was measuring the prior's grip, not the task's structure

This is the finding with the longest reach. **ρ fell 0.710 → 0.221 with no change to the task,
the gate, the corpus or the sampler** — only to which part of the state space the rollouts
started from.

Since D1 this arc has treated ρ as a property of the *task*, and reasoned from it: effective
draws, whether G=8 was enough, whether non-degeneracy could ever reach the band. Those
arguments were measuring **how tightly the policy's prior clamps its own rollouts**. When 87%
of rollouts open identically, of course their rewards correlate — they are evaluating one
narrow slice of the space repeatedly.

**Every ρ figure in this arc must be re-read as "ρ under this policy's unforced sampling,"
never as a constant of the environment.** That includes 0.592, 0.639 and 0.710 in the P4
records and 0.711–0.947 in P2's.

## Three things this is not

**0.453 is a conditional.** `P(correct | forced opening)`. It answers "can it complete from
anywhere", not "how hard is this task". The unconditioned figure remains **0.389** and the two
must never share a table without that label. Forcing changes what is measured exactly as
raising temperature would; the defence is disclosure, not exemption.

**Non-degeneracy 0.9375 is ABOVE the band's 0.50 ceiling.** Nearly every group splits. That is
the expected consequence of forcing coverage and confirms exploring starts is a
rollout-collection device, not a difficulty setting. It is not a "better" learnability number.

**n = 32.** 0.9375 carries [0.799, 0.983]. Not pinned.

## Provenance of the method

Sutton & Barto, *Reinforcement Learning: An Introduction*, ch. 5 — exploring starts assume
episodes begin from a randomly selected state-action pair so every part of the space is
visited with probability > 0 regardless of how deterministic the current policy is.

The LLM form was published as **Prefix-GRPO** — arXiv `2607.19395`, *"From Trajectories to
Prefixes: Reusing Teacher Trajectories via Replayed Prefixes and Online Continuation"*, Wang,
Guan, Sun, Huang, Wu, Zhao. **Verified against arXiv, not taken on trust.** One difference
worth recording: Prefix-GRPO replays prefixes from a *teacher*, so its prefixes carry a
competence signal. This run samples the opening space **exhaustively and uniformly**, which is
nearer the classical formulation — better for measuring coverage, probably worse for training
efficiency. The nearest-tone heuristic could supply teacher prefixes later, which is where this
method and the GEC proposal meet.

## What it changes, and what it does not

Three surfaces failed gate 3 in this arc — P3 on notation, film-ambient on one rule,
common-practice on representation. **This is the first intervention that fixed one instead of
relocating it**, and it did so without touching the gate, the sampler or the rulebook.

It does **not** establish that a trained policy would explore on its own. Exploring starts is
scaffolding for rollout collection; the terminal objective is unchanged and the evaluation must
still be unconditioned, with nobody handing the model an opening. Whether the flattened
distribution survives the removal of the scaffold is an open question this run cannot answer.

## Receipts

`scripts/emit-exploring-starts.mts` · `scripts/probe_prefixed.py` · `scripts/score-curriculum.mts`
`runs/spec-4bar-prefixed.jsonl` · `runs/spec-4bar-explore.jsonl`
