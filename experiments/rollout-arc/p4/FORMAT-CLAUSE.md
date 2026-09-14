# The missing clause — written before the next eval, not after

**2026-09-14.** `BASE-MODEL-STUDY.md` §7 fixed three conditions that **did not partition the
space**, and arm B landed in the gap (support 16.87 clears ≥6; unparseable 25.9% is neither
≤20% nor ≥50%). That defect is recorded in `BASE-PROBE-RESULTS.md` and the 20% threshold is
**not** being moved now that the number is known. This file writes the clause that was missing,
before any eval it would score.

## The cell this governs

**$0 format work on `Qwen3-4B-Base`, no template. Generation only — no training, no LoRA, no
pod, no adapters.** Same 75 held-out items, G=64, generation seed 7, same verifier. One lever
per run.

## Success, fixed now

An arm **succeeds** only if **all three** hold:

| | threshold | why it is here |
|---|---|---|
| **unparseable** | **≤ 20%** | the bar from `26d788f`, unmoved. Baseline to beat: **25.9%** |
| **coverage** (items with ≥1 pass in 64) | **≥ 90%** | the thing actually being bought. Baseline: **93%**, against instruct's 39% |
| **distinct-passing** | **≥ 2.0** | Baseline **3.65**, instruct **0.53** |

**The second and third rows exist because of the obvious way to cheat the first.** A few-shot
exemplar can buy format compliance by teaching the model to imitate one answer — which is
instruct's collapse, re-purchased at the prompt layer. **Format bought at the cost of coverage
is not a success, it is the same failure with better JSON.** If unparseable falls below 20% and
coverage drops under 90%, that arm is **REJECTED**, and it is rejected by this sentence, written
before it ran.

**Neither a partial pass nor a near-miss is a pass.** If an arm lands in a gap again, that is
reported as a gap, as arm B was.

## What the failures actually are — measured, free, from the files already on disk

`scripts/why-unparseable.mts`, no GPU. Arm B's 25.9% decomposes:

| | share of the 25.9% | in points |
|---|---|---|
| truncated at the 384-token cap | **36.5%** | ~9.5pp |
| stopped on its own and still unparseable | **63.5%** | ~16.4pp |

And the non-truncated failures are not gibberish. Sampled verbatim, they are:

1. **Correct content, wrong container** — a comma-separated run of valid
   `{"measure":…, "degrees":[0,3], "bassOctave":3, "dur":4}` objects that never opens an array.
2. **The model continuing the prompt instead of answering it** — emitting more instruction text
   ("Additionally, provide an explanation of YOUR Voice leading choices…").
3. The same: echoing the task description back.

**That is the textbook base-model behaviour — document completion, not instruction following —
and it is exactly what a few-shot exemplar addresses.** It is not a capability failure.

For contrast, arm A (ChatML) is 66% truncation and its non-truncated failures are genuinely out
of distribution — Java, Chinese text, markdown tables. **The envelope, not the checkpoint, is
what produced that**, which is why arm A already fired the unbuyable clause and is closed.

## The levers, ordered by cost, one per run

1. **Few-shot: one valid exemplar** (or a bare schema line) prepended to the no-template
   prompt. Targets the ~16.4pp. Highest expected value; one eval.
2. **Stop / cap**: raise `--max-new-tokens`, or stop at the first complete JSON value. Targets
   the ~9.5pp. Arm B is already at 18.2% at-cap against instruct's 0.0%, so this is real but
   smaller. One eval, or free if folded into lever 1 as a second run.
3. **Constrained decoding — NOT AVAILABLE WITHOUT A BUILD.** Checked, not assumed: `outlines`,
   `lm-format-enforcer`, `guidance`, `xgrammar` and `jsonformer` are all **absent** from
   `p2/trainer/.venv`; `transformers` 5.17.0 exposes `LogitsProcessorList`, so a grammar
   processor is something we would write and maintain. **It is a build and it is out of scope
   until levers 1 and 2 are read.**

## What this does not license

- **No GRPO cell on any checkpoint.** 25.9% unparseable on top of 46–76% silent groups is a
  dead-advantage factory, and `2504.13837` holds that RLVR narrows support — training a
  support-16.87 prior back down is how you manufacture another instruct.
- **No claim that base is the better model.** Per-sample pass is worse (9.33% vs 11.73%).
  Coverage is better (93% vs 39%). Those are different sentences and only the second is claimed.
- **No transfer of Phase C's 9% → 50% → 91%.** That is the same *pattern* (base + verifier +
  best-of-n) measured on **E-R**, a different pool. Those percentages do not belong to this one.
- **Qwen-Music / MIDI-LLM remain out of scope.** Wrong alphabet; this probe did not make them
  relevant.
- **`distinct-passing` is the column against the 16-opening alphabet.** Base is covering
  **items**, not the alphabet. 3.65 against 0.53 is the useful-width result; `support` 16.87
  counts emitted openings, admissible or not.

## Receipts

`scripts/why-unparseable.mts` · `scripts/prior-shape.mts` · `scripts/base-passrate.mts` ·
`runs/mc64-heldout-q3base-{chatml,raw}.jsonl` · `BASE-PROBE-RESULTS.md` (`4f6de00`) ·
`BASE-MODEL-STUDY.md` (`26d788f`, whose §7 rule this repairs)
