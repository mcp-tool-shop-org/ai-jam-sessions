# Minimal reproduction — stock GRPO collapses, but my prompts were too easy

**RunPod Blackwell 6000, both arms, ≈$0.55. Pod terminated, nothing billing.**
Commit `dff16e4`. LoRA held constant at r16 all-linear; no MCP, no bridge, no
`environment_factory`, scalar reward, every `GRPOConfig` sampling field at default.

| arm | tools | groups | byte-identical | mean distinct of 4 |
|---|---|---|---|---|
| `--turns 1` | no | 8 | **5/8 = 62.5%** | 1.50 |
| `--turns 2` | yes (`echo`) | 8 | 2/8 = 25.0% | 2.38 |

## What this shows

**Stock single-turn GRPO collapses.** No MCP, no tools, no environment wrapper, a
three-line scalar reward — and 62.5% of groups return identical completions where plain
`transformers.generate` on the same weights returns 0%. **The bug is not in our environment,
not in multi-turn, and not in our tool surface.**

**And multi-turn makes it *better*, not worse** — 25% with a tool against 62.5% without. That
is the opposite of the hypothesis that multi-turn re-entry causes the collapse, and it
retires that mechanism.

## The confound, which is mine

**My prompts were "Name a colour that starts with the letter A. Answer with one word."**
That has almost no legitimate output entropy — a one-word answer from a small set. Four
samples landing on "Amber" four times is a property of the *question*, not necessarily of the
sampler. **62.5% is therefore an overestimate of the collapse by an unknown amount.**

It does not erase the finding — plain `transformers` on *its* prompts gave 8.00 distinct of
8, and every TRL run on real prompts gives 1.05–1.56 — but the two are not measured on the
same inputs, so the comparison inside this file is not clean.

## What an upstream-quality reproduction still needs

1. **A high-entropy prompt** — "write a sentence about X", not a one-word answer.
2. **A matched control on the identical prompts**: plain `transformers.generate` and
   `GRPOTrainer` over the same inputs, same sampler, same model. Right now they are compared
   across different prompt sets, which is exactly the kind of mismatch that has cost this arc
   repeatedly.
3. Both at n large enough to be a rate — 8 groups is not.

Until those, the honest statement is: **stock GRPO shows a large collapse that plain
`transformers` does not, on a setup with no project-specific components — and the size of it
is not yet established.**
