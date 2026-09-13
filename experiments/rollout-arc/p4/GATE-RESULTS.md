# The replication gate — results

**2026-09-13. Local RTX 5090, $0.** Readings fixed in `GATE-PREREG.md` (commit `0844288`)
before any run existed; predictions sealed in `GATE-SEALED-PREDICTIONS.md` (`758c75f`,
pushed 13:46:21Z with `runs/mc64-*` verified empty).

Three local runs of arm C (plain GRPO, `--prefix-mode none`), seeds 7/8/9, 200 steps, G=8,
n=32, evaluated unconditioned at **G=64** on the 75-item held-out pool, generation seed 7.

---

## PRIMARY — reading 1, REPLICATES

| run | held-out lift | bootstrap 95% | items +/- |
|---|---|---|---|
| C7L | +0.60pp | [-0.60, +2.04] includes 0 | 11/14 |
| C8L | +10.08pp | [+4.42, +15.75] excludes 0 | 37/10 |
| C9L | +3.44pp | [+0.44, +6.81] excludes 0 | 29/14 |
| **across-run mean** | **+4.71pp** | **[+0.46, +11.03] EXCLUDES 0** | |

base pass **0.1200** at G=64 (0.1117 at G=16 — two draws of the same quantity, 0.83pp apart).

Items-only bootstrap gives [+2.24, +7.37]. The runs-and-items bootstrap is the preregistered
reading and it is nearly five times wider, because the runs disagree by 9.5pp. **Both exclude
zero, so the verdict is the same either way — but at K=2 they disagreed** ([+2.49, +8.27] vs
[-0.19, +14.02]), and the prereg committed in advance to the wider one.

**Reading 3 does not fire** — the interval's upper bound (+11.03) is far above the pod seed-7
point estimate of +2.00pp. The effect is not smaller than published. It is **more than double**,
with uncertainty an order of magnitude wider than the original single run suggested.

## Reading 4 — platform: NOT confounded

local seed 7 minus pod seed 7, paired, base cancels: **-0.56pp [-2.38, +1.23]**, not
distinguishable. Pod-trained and locally-trained runs may be compared. The missing cell
(`MISSING-CELL-PREREG.md`) therefore takes its Tier 1 path, ~100 min, not the 7.5h rebuild.

## SECONDARY — the prior SHARPENS, it does not flatten

Item-wise opening concentration (composition-immune), paired vs base, base **0.9296**:

| run | delta |
|---|---|
| C7L | **+2.92pp** [+1.69, +4.48] excludes 0 |
| C8L | **+3.27pp** [-0.02, +6.44] |
| C9L | **+1.15pp** [-1.02, +3.31] |

All three positive. Pod arm C's **-9.00pp** appears in none of them. On four unforced runs the
score is three sharpenings and one outlier, and the outlier is the one the arc published.

This aligns with the single verified theoretical citation that survived the gate: GX-Chen et al.
2025 (arXiv:2510.20817), *KL-Regularized Reinforcement Learning is Designed to Mode Collapse* —
at low KL coefficient the optimum is non-diverse **by construction**. Plain GRPO digs the groove
deeper. That is the expected behaviour of the objective, not a failure of the run.

## Sealed predictions: 0 of 4

| | claim | outcome |
|---|---|---|
| **P1** | (Gemini) seed 8's entropy collapse is overfitting; it generalises WORSE than seed 7 | **FALSIFIED** — +10.08pp vs +0.60pp, the best of the three |
| **P2** | (advisor) held-out lift uncorrelated with training `acc_joint`; lift spread narrower in relative terms | **FALSIFIED** — lift spread ~17x against `acc_joint`'s 1.65x, far wider not narrower |
| **P3** | (advisor) if the -9.00pp opening drop is caused by unmasking it must appear in ALL three seeds | **FALSIFIED** — all three moved the other way |
| **P4** | (advisor) Verbalized Sampling moves concentration <9pp and loses pass rate to inadmissible candidates | **FALSIFIED** — 41pp move, pass rate 0.1045 vs 0.1117, and the candidates are admissible |

**P3 is the expensive one.** The masking mechanism — that arm C moved its prior because it was
the only arm whose opening tokens carried gradient — was load-bearing for recommending the
`--prefix-in-loss` arm. Three unforced runs refuse it. The masking **fact** stands
(`masked_prefix_tokens 25600 == prefix_tokens_total 25600` on A/B/D); the **inference** does not.

Why the framing misled: `--seed` does not control LoRA init (`GRPOConfig.seed` is applied after
`get_peft_model`, stated in `GATE-PREREG.md` and then not applied in my own reasoning). Pod-7 and
local-7 were never replicates — they are independent runs sharing a data order. I was treating a
draw from a distribution as a fixed effect.

## A two-point pattern that did not survive the third point

After C7L and C8L, effective updates appeared to predict held-out lift (48 -> +0.60pp,
61 -> +10.08pp). **C9L breaks it**: 77 effective updates, the most of any run, and a middling
+3.44pp. Seeds 8 and 9 have near-identical final `acc_joint` (0.542, 0.535) and lifts differing
threefold.

| run | dead groups | effective updates | `acc_joint` end | held-out lift |
|---|---|---|---|---|
| local 7 | 0.760 | 48 | 0.328 | +0.60pp |
| local 8 | 0.695 | 61 | 0.542 | +10.08pp |
| local 9 | 0.615 | 77 | 0.535 | +3.44pp |

## What the arc may now claim, and what it may not

**MAY:** the substrate is trainable and the effect replicates across independent runs at
**+4.71pp [+0.46, +11.03]** held-out — larger than the published +2.0pp, with far wider
uncertainty. Platform is not a confound. Plain GRPO sharpens the opening prior.

**MAY NOT:** call it new capability. Yue et al. 2025 (arXiv:2504.13837, verified, both lenses
SUPPORTED) is why — a pass-rate lift is consistent with re-weighting what the base model could
already sample. The Verbalized Sampling control is direct local evidence for that reading: the
base model **already produces admissible, structurally varied openings** when asked to list them
(2.96 distinct of 5, pass rate 0.1045 against standard's 0.1117) and simply never samples them.

**MAY NOT:** claim musical capability. Nearest-tone scores **32/32** on the trained pool for free.

## The honest summary

Run-to-run variance on this substrate is larger than the effect the arc spent six phases
measuring. A single run can land at +0.60pp or +10.08pp on the same configuration, changing
nothing but a seed that does not even control the initialisation. **Every single-seed number in
this arc's history should be read as one draw from that spread**, including the +2.0pp that
justified continuing, and including the -9.00pp prior movement that justified a mechanism.

## Receipts

`runs/mc64-heldout-{base,C7L,C8L,C9L}.jsonl` · `runs/gate/arm-C{7,8,9}L/run.json` ·
`scripts/gate-readout.mts` · `scripts/opening-2x2.mts` · `scripts/base-g16-vs-g64.mts` ·
adapters verified distinct by SHA-256, each eval log naming its own adapter and 504 lora tensors.
