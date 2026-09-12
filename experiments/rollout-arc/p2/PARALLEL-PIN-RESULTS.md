# Parallel-only at n=400 — reading 2. The corpus-hardening line is closed.

**Rule:** [`PARALLEL-PIN-PREREG.md`](PARALLEL-PIN-PREREG.md), committed before the pod
existed, with the expected outcome written down in advance. Blackwell 6000, 400 steps in
1:29:04, ≈ **$2.85**. Pod terminated, dead-man disarmed, nothing billing.

## Gates — all clean

`dataset_rows` **400**, distinct prompts **400**, `/health` echoes `parallel_only: true` and
`levels: ["D1"]`, seed 2026091206, 8 generations, `clipped_ratio` **0.00 on all 400 steps**,
completions 37–168 against a 1024 budget.

## The result

| | value |
|---|---|
| accuracy | **0.958** |
| **non-degenerate** | **26 / 400 = 0.065**, 95% CI **[0.043, 0.094]** |
| all-wrong | 8 / 400 = 0.020 |
| all-right | 366 / 400 = 0.915 |
| overdispersion | 6.00, ρ ≈ 0.714, ~1.33 effective draws of 8 |

**Below the band floor of 0.125, and the interval excludes it.** My preregistered prior was
~0.092; the measured value is **0.065**, lower still, and inside the n=65 subset's old
interval [0.035, 0.190] at its lower end.

## The pattern across three samples of the same construction

| sample | n | accuracy | non-degenerate |
|---|---|---|---|
| pilot subset, seed …204 | 11 | 0.625 | 0.273 |
| pin subset, seed …205 | 65 | 0.862 | 0.092 |
| **parallel-only, seed …206** | **400** | **0.958** | **0.065** |

**Accuracy rises and non-degeneracy falls monotonically with n.** Every small sample in this
arc found the task harder than it is. That is the shape of sampling the hard tail and calling
it the population — and it is the single most repeated error of the night, now visible three
times in one construction.

## What is closed

**Corpus hardening, as a strategy, is finished — and this time it is measured rather than
asserted.** Every axis the generator offers has now been run on the exact artifact that
would be trained, at production `num_generations` 8, with clean guards:

| axis | result |
|---|---|
| **distance 1–3** | accuracy 0.92–0.96, non-degenerate 0.055 — degenerate at the top |
| **distance 5–11** | accuracy 0.000, and the policy will not page to reach it under any condition tested — degenerate at the bottom |
| **within-window confusability, D2/D3** | inert by construction: the gold check drops every case where the inversion is confusable, 0/32 in every tier |
| **within-window confusability, D1 aggregate** | 0.055 [0.022, 0.109] at n=128 — below band |
| **the sharpest sub-axis, parallel-only** | **0.065 [0.043, 0.094] at n=400 — below band** |

There is no remaining knob in this corpus that reaches the band. The earlier claim in
`LEVELS-G8-RESULTS.md` that D1 is trainable at 0.250 is superseded by `D1-PIN-RESULTS.md`
and closed here.

## What survives, and it is not nothing

**The mechanism is real and replicated.** Parallel major/minor is where this policy fails:
across both earlier samples it carried every all-wrong group and six of seven splits, at
Fisher p = 0.028. Two of three hand-inspected failures answered the *bound measure itself*,
unanimously — reading `F#m` and calling it `F#`. That is a genuine, well-posed harmonic
discrimination failure with uniquely determined gold.

**It is simply not frequent enough.** At 0.065, a 200-step run would contain about 13 groups
carrying gradient. The failure is real; the *rate* is the problem.

## What this leaves

The remaining levers are no longer about data:

1. **Algorithmic.** GRPO's advantage is group-relative, so an all-right or all-wrong group
   contributes nothing by construction. A baseline that registers those — value-based, or a
   batch-level rather than group-relative baseline — would extract signal from the 91.5% of
   groups this corpus currently throws away. **That is the lever the measurements point at.**
2. **A different model.** Every number here is Qwen3-4B-Instruct in bf16. A weaker policy
   would put this task in band; whether that is useful depends on what the LoRA is for.
3. **A different task family.** This one is solved at 0.96 by the base model.

**None of this restores the arc's original 27.1% / 32.0%.** Those were measured on a 4-bit
model and remain void.

---

# CORRECTION — "closed" is too strong, and the algorithmic pivot is not supported

Written after computing what the band actually requires. **Both the conclusion above and the
proposed pivot away from GRPO rest on an assumption neither of us checked.**

## How much harder does the task need to be?

At the **measured** ρ = 0.714 and G = 8, beta-binomial:

| accuracy | non-degenerate | in band? |
|---|---|---|
| **0.96** (what we have) | 0.056 | |
| **0.90** | **0.131** | **yes** |
| 0.85 | 0.185 | yes |
| 0.80 | 0.231 | yes |

*(model check: it predicts 0.059 at p = 0.958 against 0.065 measured — the fit is good)*

**The band needs accuracy ≈ 0.90. We are at 0.958. That is six points, not a chasm.**

I wrote "no configuration inside this corpus reaches the band" and it reads as though the gap
were hopeless. It is not. **It is the narrowest it has ever looked**, and I closed the line
without computing the target — the same over-claim shape as "harden the corpus is finished"
four hours ago, which the G=8 run then reversed.

## What has never been tried: combining knobs

Every axis was measured **alone**:

| knob | measured alone |
|---|---|
| `parallelOnly` | accuracy 0.958 |
| `decoyBeforeBound` | never measured at G=8 — the one 2×2 that tried was population-confounded, 3 of 32 shared cases |
| `octaves` (one chord name, several spellings) | **never measured at all, at any G** |
| `varyRightHand` | never measured at all |
| distance 4 — the boundary where 14 of 55 answers reached | **never measured** |

Four knobs exist, built and tested, and **three of them have never been run against bf16.**
Each is weak alone; nobody has asked what they do together. Six accuracy points is exactly
the scale at which stacking weak effects is worth one run.

## Why the pivot away from GRPO is not supported by these numbers

The premise is that GRPO "discards 91.5% of the corpus." What a batch-level or value baseline
would actually see on this run:

| | n | advantage each |
|---|---|---|
| all-right groups | 366 | **+0.042** — a push to keep doing what it already does |
| all-wrong groups | **8** | −0.958 |
| split groups | 26 | within-case contrast, which **GRPO already uses** |

**The extra signal is 8 cases out of 400 — 2.0%.** The other 366 contribute a nudge toward
the existing policy. And a cross-prompt baseline reintroduces prompt-difficulty as a nuisance
variable, which is the specific thing group-relative advantage removes.

So the pivot trades GRPO's variance reduction for signal concentrated in 2% of cases.
**That is not an obviously good trade, and it is a large change to a trainer that is
working.** It may become right if the corpus cannot be moved. It is not the next step.

## Restated honestly

**Not closed. Narrowed to a specific, cheap, unrun experiment:** all four difficulty knobs
on at once, at G = 8, against bf16 — targeting accuracy ≤ 0.90 rather than any particular
mechanism. If stacking cannot move 0.958 to 0.90, *then* the corpus is exhausted and the
algorithmic question is live on evidence rather than on assumption.
