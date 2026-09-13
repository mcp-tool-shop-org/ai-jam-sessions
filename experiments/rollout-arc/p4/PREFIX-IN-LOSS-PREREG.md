# `--prefix-in-loss` — preregistered before the run exists

**2026-09-13, after the gate.** Three local runs, ~2.6h training + ~3.3h eval, **$0**.

## Why this arm, stated against what we now know rather than what we assumed this morning

The motivation I had at 09:00 is dead. I argued that forcing failed to move the prior because
the forced tokens were masked out of the loss, and that arm C moved it because it was unmasked.
`GATE-RESULTS.md` refuses that: three unforced runs all moved the prior the **wrong** way, and
arm C's -9.00pp is a single-run outlier. **P3 was falsified and is not being smuggled back.**

The surviving motivation is different and rests on two measured facts:

1. **The base model already knows admissible diverse openings and never samples them.**
   Verbalized Sampling elicits **2.96 distinct openings of 5** at pass rate **0.1045** against
   standard sampling's **0.1117** — the alternatives are about as valid as its favourite, and
   its first-listed choice sits at **0.9790** concentration, more locked than ordinary sampling.
   The capability is present and unexpressed.
2. **Plain GRPO sharpens rather than flattens.** Across three local runs, item-wise opening
   concentration moves **+2.44pp [+0.07, +4.82]**, excluding zero, positive. That is what
   GX-Chen et al. 2025 (arXiv:2510.20817, verified, both groundedness lenses SUPPORTED) predicts
   for a KL-regularised objective at low beta: the optimum is non-diverse by construction.

So: the model can produce valid diverse openings, and the training signal we have been using
drives it further from them. This arm is the one built mechanism that does both halves of the
job — **forcing visits the alternatives, and unmasked loss pays the policy for producing them.**
That is a mass-shifting argument, not an ossification story.

## Instrument check — done BEFORE this file was written

`--prefix-in-loss` had never been executed, not even in the build's dry runs. A 2-step dry run
(`runs/gate/dry-pil/dry-run.json`) confirms the flag genuinely unmasks:

| | masked path (PREFIX-BUILD.md) | `--prefix-in-loss` |
|---|---|---|
| `masked_prefix_tokens` | 256 | **0** |
| `prefix_tokens_total` | 256 | **256** (forcing still happens) |
| TRL mask probe `with_zero_span` | 16 of 16 | **0** |
| `zero_fraction` | 0.1385 | **0.0** |
| `openings_per_group` | 8..8 | 8..8 |

`STAGE C PASS`, peak 21,260 MiB of 32,579, headroom 11,319 MiB.

## Standards compliance (workflow-standards.md)

| standard | score | evidence |
|---|---|---|
| PIN_PER_STEP | **3** | Identical pin to `GATE-PREREG.md` plus one flag; `run.json` records interpreter, libraries, device, rows, repeats, and the full `prefix` block per run. |
| ANDON_AUTHORITY | **3** | New guard for this arm: a run is VOID unless `prefix_in_loss == true`, `prefix_tokens_total > 0` (forcing happened) **and** `masked_prefix_tokens == 0` (mask off). A silently-masked run is byte-indistinguishable from arm B in its metrics, so this is checked, not assumed. Plus `arm_guards.py`, the bridge pool gate, and `make_score_reward` raising on bridge failure. |
| NAMED_COMPENSATORS | **3** | Local only. `rm -rf runs/gate/adapter-PIL*` and the eval JSONL; new filenames, nothing overwritten. No publish, release, tag, or spend. |
| DECOMPOSE_BY_SECRETS | **2** | Inherits the gate's eval-driver duplication; same remediation, same owner. |
| UNCERTAINTY_GATED_HUMANS | **3** | No escalation condition fires automatically; a fourth seed requires a fresh decision, stated below. |
| EXTERNAL_VERIFIER | **3** | Deterministic rule-based scoring verifier. The statistic is computed by the same code that produced `GATE-RESULTS.md`, itself rehearsed against prior receipts. |

## Design

```
--prefix-mode heterogeneous --prefix-in-loss --no-tools
seeds 7, 8, 9      200 steps   G 8   --limit 32   max-completion 384
lr 1e-5  beta 1e-4  eps 0.2/0.28  LoRA r16 a32 all-linear
bridge --voices 2 --style common-practice --seed 20260913
       --fixture fixtures/progressions-v1.json --require-pool 32
venv p2/trainer/.venv (python 3.12.13)
eval: unconditioned, G=64, generation seed 7, held-out pool (n=75)
```

**Three seeds, not one.** The gate measured a within-cell run spread of 12.3pp on the
concentration statistic and 9.5pp on pass-rate lift. Any single-run comparison on this substrate
is one draw, and this arc has now published two conclusions that were exactly that.

**Comparisons are all local, all G=64, all against receipts already on disk:** base
(`mc64-heldout-base.jsonl`) and the three plain-GRPO runs (`mc64-heldout-C{7,8,9}L.jsonl`).
The pod arm-C run is excluded — different platform, and it is the concentration outlier.

## Pre-committed readings

**PRIMARY — the prior.** Across-run mean item-wise opening concentration delta vs base,
paired by item, bootstrap over **runs and items** (the wider estimator, as in the gate).

Baseline to beat: plain GRPO **+2.44pp [+0.07, +4.82]**, excluding zero, positive.

| reading | condition | meaning |
|---|---|---|
| **1 FLATTENS** | interval excludes zero, negative | forcing plus unmasked gradient shifts mass onto alternative openings. The first intervention in this arc to do so. |
| **2 RESISTS** | interval includes zero | it does not flatten, but it stops the sharpening plain GRPO produces. A real, smaller result. |
| **3 SHARPENS TOO** | interval excludes zero, positive | the intervention does not work; sharpening is a property of the objective, not of which tokens carry gradient. |
| **4 AMBIGUOUS** | anything else | reported as ambiguous; no combined verdict manufactured. |

**Arm-vs-arm is run too**: PIL minus C, paired by item, across runs. Two arm-vs-base numbers
that look far apart are not a difference between arms, and this arc has made that mistake once.

**SECONDARY — pass rate.** Across-run mean lift vs base, same estimator. Baseline: plain GRPO
**+4.71pp [+0.46, +11.03]**. Pre-committed: **a flattening bought by losing the verifier is not
a win.** If PIL flattens but its pass-rate lift is distinguishably below C's, the result is
reported as a trade, with both numbers, and not as a success.

## What would make me wrong, stated now

Reading 3 is a live outcome and it would end this line: if an arm with forced diverse openings
AND gradient on those openings still sharpens, then nothing in the scaffolding family is going
to move this prior, and the remaining lever is the objective itself (entropy term, divergence
choice, or the reward). I would report that as the answer rather than propose a fifth variant.

## What this cannot do

- **It cannot make the lift new capability.** Yue et al. 2025 (arXiv:2504.13837, verified):
  a pass-rate gain is consistent with re-weighting what the base model could already sample —
  and the VS control is direct local evidence that is exactly what is available to be re-weighted.
- **It cannot beat free code.** Nearest-tone scores **32/32** on the trained pool.
- **Three runs is still few.** The gate's own spread says a fourth seed would meaningfully narrow
  the interval. It is not authorised here; it needs a fresh decision after these three are read.
