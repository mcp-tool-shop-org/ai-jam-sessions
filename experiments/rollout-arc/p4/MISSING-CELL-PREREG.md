# The missing cell — preregistered before the run exists

**2026-09-13.** The four-arm run left a 2x2 with one cell empty, and that cell is the only
thing separating two explanations of the single largest effect this arc has measured on the
typicality prior. Cost: **$0**, local, ~100 minutes for the minimum design.

## The matrix, as measured (item-wise opening concentration vs base, held-out, n=75)

| | masked opening | unmasked opening |
|---|---|---|
| **real reward** | A +1.58pp [-0.83, +3.83], B +2.33pp [+1.00, +3.83] | **C -9.00pp [-12.00, -6.00]** |
| **random reward** | D -4.92pp [-7.92, -1.92] | **NEVER RUN** |

Main effects from the three filled cells: unmasking **-10.96pp**, random reward **-6.88pp**,
additive prediction for the missing cell **-15.88pp**.

**Why it cannot be reasoned out instead of run.** The obvious story — that masking the opening
tokens froze the prior — is refused by the matrix: D is masked and still moved -4.92pp. C
differs from D on *two* knobs at once, so no comparison among the filled cells isolates either
one. This is the same error class as comparing two arm-vs-base numbers to each other, which
this arc has already made once.

## Standards compliance (workflow-standards.md)

| standard | score | evidence |
|---|---|---|
| PIN_PER_STEP | **3** | Identical to `GATE-PREREG.md`'s pin, one flag changed. `run.json` records interpreter, library versions, device, rows, repeats and prefix mode per run. |
| ANDON_AUTHORITY | **3** | `arm_guards.py` halts on population or forcing mismatch; bridge refuses a short pool; `make_score_reward` raises rather than returning 0.0. |
| NAMED_COMPENSATORS | **3** | Local only. `rm -rf runs/gate/adapter-E` and the eval JSONL; new filenames, nothing overwritten. No publish, release, tag or spend. |
| DECOMPOSE_BY_SECRETS | **2** | Inherits the gate's eval-driver duplication. Same remediation, same owner. |
| UNCERTAINTY_GATED_HUMANS | **3** | Tier 2 fires only on a named condition (below), fixed in advance. |
| EXTERNAL_VERIFIER | **3** | The scoring verifier is deterministic rule-based code. The statistic is computed by `opening-2x2.mts`, which reproduces the published `top_first_measure_share` figures as a method check. |

## The design

**Arm E — one knob from C:**

```
--prefix-mode none --random-reward      (C is --prefix-mode none, real reward)
seed 7, 200 steps, G 8, --limit 32, max-completion 384, lr 1e-5, beta 1e-4, LoRA r16 a32
bridge: --voices 2 --style common-practice --seed 20260913
        --fixture fixtures/progressions-v1.json --require-pool 32
venv: p2/trainer/.venv (python 3.12.13)
```

**Evaluation at G=16, not G=64, and that is deliberate.** The contrast partners (A, B, C, D)
exist at G=16, and the bootstrap half-width on this statistic at G=16 is ~3pp against candidate
separations of ~5pp. The statistic is item-wise opening concentration over ALL completions — it
does not depend on the pass filter, so the G=64 precision the pass-rate gate needs is not
needed here.

**Tier 1 (minimum, ~100 min).** Train E locally; evaluate E **and local C7L** at G=16 on the
held-out pool. E vs C7L is then a within-platform, matched-G contrast isolating the reward knob.

**Tier 2 (~3.75h, fires only on the named condition).** Additionally train local masked/real
and local masked/random arms so the whole 2x2 is local. **Fires if and only if** the gate's
platform check (`GATE-PREREG.md` reading 4) comes back DISTINGUISHABLE, meaning pod-trained
A/B/D may not sit in a table beside a locally-trained E. Fixed now so it is not chosen later.

## Pre-committed readings

Both contrasts are **arm-vs-arm, paired by item** — base cancels. Intervals are a 10k bootstrap
over items. E - C isolates the **reward** knob (both unmasked). E - D isolates the **masking**
knob (both random reward).

| reading | E - C | E - D | meaning |
|---|---|---|---|
| **1 BOTH MATTER** | negative, excludes 0 | negative, excludes 0 | the effects are additive; unmasking and reward each contribute |
| **2 UNMASKING CARRIES IT** | includes 0 | negative, excludes 0 | adding random reward to an unmasked arm changes nothing; unmasking is the lever, and `--prefix-in-loss` is the right main-line arm |
| **3 REWARD CARRIES IT** | positive, excludes 0 | includes 0 | unmasking adds nothing over reward type; the `--prefix-in-loss` recommendation weakens and I say so |
| **4 AMBIGUOUS** | anything else | | reported as ambiguous; no combined verdict manufactured |

The additive prediction is **E = -15.88pp vs base**, so reading 1 expects E - C near -6.9pp and
E - D near -11.0pp. Those are stated so the result can be compared against a number fixed in
advance rather than against a story assembled afterwards.

## What this cannot do

- **It is one seed.** E is seed 7 so the contrasts are within-seed, which is right for
  isolating a knob and wrong for estimating how much the knob varies run to run. Seeds 7 and 8
  already differ more from each other in training dynamics than seed 7 differs across
  platforms, so a single-seed reading here is a direction, not a magnitude.
- **It does not test the pass rate.** The gate owns that. This arm is expected to be flat on
  pass rate — D was — and a flat pass rate is not evidence against a prior movement.
- **It does not make the prior a capability.** Nearest-tone still scores 32/32 on the trained
  pool for free.
