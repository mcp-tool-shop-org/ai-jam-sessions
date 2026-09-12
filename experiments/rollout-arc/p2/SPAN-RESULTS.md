# The gap is real — serialisation explained part of it, not most of it

Comparing **model-authored spans only**: assistant prose plus the tool *arguments* it chose,
keys sorted, all JSON punctuation and every tool response stripped. Same corpus
(seed 2026091207, all knobs), same sampler settings, G=8.

| | full-text identical | **model-span identical** | mean distinct spans of 8 |
|---|---|---|---|
| Ollama fp16 (n=32) | 0 / 32 = 0.000 | **8 / 32 = 0.250** | **3.75** |
| **TRL bf16** (n=128) | 92.2% | **92.2%** | **1.09** |

**TRL's rates are identical to the decimal before and after stripping** — its collapsed
groups are collapsed in the tokens the model chose, not in deterministic tool output.

**Ollama's moved**: 0% → 25% identical, 8.00 → 3.75 distinct. So my instrument *was*
overcounting, exactly as the serialisation concern predicted. **But 3.75 distinct spans is
not 1.09, and 25% identical is not 92%.** The gap narrowed and did not close.

## What is now established

1. **TRL is not buggy in general.** 64 high-entropy prompts, both arms in one process,
   sampler read off `GRPOConfig`: 0/64 identical and 4.00 distinct of 4 in *both*.
2. **The task is not intrinsically deterministic.** The same corpus through Ollama yields
   3.75 distinct model spans per group.
3. **On this task, our TRL setup yields 1.09.** That is a real behavioural difference, not a
   formatting artifact.

## A second difference, in the same direction

| stack | accuracy on this corpus |
|---|---|
| Ollama q4 | 0.657 |
| Ollama fp16 | 0.656 (n=128) / 0.598 (n=32) |
| **TRL bf16** | **0.835** |

**TRL is consistently more accurate and less diverse.** Both are what a *sharper effective
sampler* looks like — despite `temperature` 1.0, `top_p` 1.0, `top_k` 0 being verified on
both sides. Precision is ruled out as the cause: q4 and fp16 sit together at ≈0.66.

## The missing cell

Four configurations, one hole:

| | generic high-entropy prompts | our music task |
|---|---|---|
| GRPOTrainer, **no tools** | **branches** (0/64) | — |
| GRPOTrainer, **tools** | **?** | **collapses** (both `tools=` and `environment_factory=`) |

**The untested cell is GRPOTrainer + tools + high-entropy prompts.** The `--turns 2` arm of
`minrepro` was exactly this, but on one-word-answer prompts, so its 25% is uninterpretable.

- If that cell **collapses** → TRL's tool-calling path constrains sampling, independent of task.
- If it **branches** → the collapse needs our task's structure *and* TRL's tool path together.

It is one arm added to `trl_collapse_repro.py` — same script, same parity guarantees, one pod
run at roughly **$0.35**.

## Leading hypothesis, unverified

**The effective sampling distribution differs between the two stacks despite matched nominal
parameters.** Candidates: a different chat template shaping the tool-call prefix, a logits
processor applied in one and not the other, or temperature applied at a different point in
the pipeline. **Not established, and not to be written up as though it were** — the accuracy
gap is consistent with it, and consistent with several other things.
