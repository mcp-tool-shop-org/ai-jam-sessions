# There is no TRL bug. The reproduction cleared it.

**RunPod Blackwell, both arms in one process, 64 prompts × 4 generations, ≈$0.35.**
Pod terminated, nothing billing. torch 2.11.0+cu128 · transformers 5.17.0 · trl 1.13.0 ·
peft 0.20.0.

Sampler read off the constructed `GRPOConfig` and passed to both arms:
`temperature 1.0, top_p 1.0, top_k 0, min_p None, repetition_penalty 1.0`.

| arm | byte-identical | mean distinct of 4 |
|---|---|---|
| A — `transformers.generate`, duplicate rows | **0 / 64** | **4.00** |
| B — **TRL `GRPOTrainer`** | **0 / 64** | **4.00** |

**Identical prompts, identical sampler, one process. Both branch perfectly.**

## What this retracts — mine, again

**"The collapse is inside `GRPOTrainer`'s generation path."** Withdrawn. Stock GRPO on
high-entropy prompts branches as cleanly as raw transformers. **There is no framework bug to
file.**

**And the earlier 62.5% was the confound I had already flagged.** The `minrepro` prompts —
*"name a colour starting with A, one word"* — have almost no legitimate output entropy. I
suspected it inflated the number; it *was* the number.

## Which reopens the retraction I made three hours ago

I retracted **"the policy is an empirical point mass"** as a harness artifact. That retraction
now looks premature in one direction and still open in another:

- **TRL is cleared.** The 92% byte-identical rate on our corpus is not TRL collapsing rollouts.
- **So our task may genuinely have near-zero output entropy.** Look at what a completion
  actually contains: a tool call whose arguments are *copied from the prompt* (song id, start
  measure), a deterministic tool response, and one number. The model's free choices are a
  handful of tokens. Identical completions may be the honest behaviour of a nearly
  deterministic task.

## The thing I have to check before claiming either way

**My Ollama probe and TRL may not have measured the same string.** TRL logs the full
transcript. My probe built `text = content + JSON.stringify(tool_calls)`. If Ollama's
tool-call serialisation varies at all between samples — key order, whitespace, a differently
phrased preamble — my probe counts "distinct" where TRL would count "identical", and the
0%-vs-92% gap is a **measurement artifact in my instrument**, not a behavioural difference.

I checked earlier that both are multi-turn transcripts and called them comparable. **That was
a claim about kind, not about serialisation, and it is not sufficient.**

**The check is free:** compare only the *model-authored* spans — the final answer and the tool
arguments — across both stacks, discarding tool responses and formatting entirely. If Ollama
still branches on those and TRL does not, the difference is real. If both collapse, the task
is the explanation and the arc's difficulty numbers stand as originally measured.

## Standing state

**Nothing about the corpus is settled.** Three positions have now been held and each was
retracted on evidence: difficulty is the lever, the harness is the lever, TRL is the bug.
The one durable finding is the method — every one of those was caught by a cheap control, and
the cheapest control of all is still outstanding.
