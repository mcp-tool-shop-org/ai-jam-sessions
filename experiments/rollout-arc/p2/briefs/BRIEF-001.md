# External brief 001 — rollout-arc P2
**2026-09-12 · for an outside reviewer with no filesystem access.**

You are reviewing an RL (GRPO/RLVR) arc that trains a LoRA on a music-library
tool-use task. You cannot read our files, so everything you need is below.
**Where a number appears without an `n`, treat it as unverified.**

---

## 1. Glossary — read this first

These have caused two category errors already.

| term | what it means here | what it is NOT |
|---|---|---|
| **non-degenerate rate** | fraction of prompt *groups* whose rollouts disagreed (`std > 0`), so the group yields gradient | **not** an accuracy |
| **27.1% / 32.0%** | non-degenerate **rates** (train/test), measured on the 4-bit model | **not** `p`, never valid in `p^G+(1-p)^G` |
| **`acc_joint`** | per-completion accuracy — this *is* `p` | — |
| **`p`** | per-completion solve probability. G-invariant | — |
| **G** | `num_generations`, rollouts per prompt group. Production 8; current grid 2 | — |
| **degenerate group** | all rollouts agree → zero advantage → zero gradient. **All-wrong is as degenerate as all-right** | — |
| **D0–D3** | distractor-confusability tiers in the generated corpus. D0 easiest | not verified to track difficulty for bf16 |
| **distance** | measures from the prompt's bound to the gold measure. Pinned 1–3 | — |

## 2. Hard constraints

- TRL 1.13.0 has **no dynamic sampling** — no resample loop, no `std>0` filter. Degenerate groups are kept and contribute nothing.
- `max_list_window` = 4 measures per tool call; `max_turns` = 5; `max_parallel` = 2.
- Sampling is **unrestricted**: `temperature` 1.0, `top_p` 1.0, `top_k` 0, `min_p` None. Nothing is set by our trainer. **Lowering temperature would deepen collapse, not relieve it.**
- Local GPU is an RTX 5090, 32,579 MiB. bf16 4B + LoRA + GRPO **overcommits at the smallest shape we run** and Windows spills to shared memory rather than failing, at ~3.5× cost. **No local step time is a valid throughput number.**
- Budget: **$2.77 spent of $25.** Nothing billing.

## 3. Established

- **The gate ran the wrong artifact.** Learnability was measured on `qwen3:4b-instruct-2507-q4_K_M` (Ollama GGUF, 4-bit); the trainer loads `Qwen/Qwen3-4B-Instruct-2507` in **bf16**. Same name, different model. This is the arc's central defect and is not in dispute.
- **The abort was correct.** Killed at step 15/600 for $0.49 against ~$8.60. Eight of ten logged steps had gradients of 1e-11 to 1e-13.
- **Rollouts are correlated, not independent.** From *k*-of-8 `8,5,8,8,4,8,8,8,8,8`: overdispersion **3.50**, ρ ≈ **0.357**, **2.29 effective draws of 8**. Under independence at p=0.9125, 7-of-8 is the likeliest non-perfect outcome (P=0.369) and occurred **zero times** (P=0.010).
- **The model is not confidently wrong.** Control cell entropy by outcome: all-right 3.64e-3 (n=21), **all-wrong 7.88e-3** (n=7), non-degenerate 9.42e-3 (n=4). When it fails it is also uncertain.
- **Tool-token masking mechanism** — every completion carries a zero span (4/4, 64/64). A TRL property.

## 4. Retracted — do not reason from these

| claim | status |
|---|---|
| "bf16 solves the task outright" | **overstated.** Its 95% CI [0.025, 0.556] contains 27.1% |
| "zero gradient on every step" | **false.** 2 of 10 steps non-degenerate, grad_norm 4.616 and 0.986 |
| "every difficulty rate describes the wrong artifact" | **overstated.** Unverified for bf16, not disproven |
| 65.2% masking "two machines, two shapes" | **withdrawn.** That run had `dataset_rows: 2` |
| 38.5 s/step smoke figure | **withdrawn.** 2-prompt sample |
| all 5090 step times | **withdrawn as throughput.** Measured in memory spill |
| "P1c's paging finding is a quantization artifact" | **inference, not measurement.** bf16 has never run at distance ≥ 4 |

**Only surviving throughput figure: A100 44.6 s/step**, 10 distinct prompts, G=8, 1024 tokens.

## 5. Live

Four-cell grid, local, free. Identical seed (2026091204), shape, model, 1024-token budget; only two flags move.

| | decoy OFF | decoy ON |
|---|---|---|
| distance 1–3 | `control` **done** | `decoy-near` queued |
| distance 5–11 | `treatment` running | `decoy-far` queued |

**Control result:** p = **0.719**, 21/32 all-right, 7/32 all-wrong, **4/32 non-degenerate**, ρ ≈ 0.745. Truncation ruled out (`clipped_ratio` 0, completions 79–175 tokens).

**Two caveats that void any bridge to the arc's numbers:**
1. The pre-registered halt condition **fired** — control needed ≥30/32 all-right and ≤1 non-degenerate. Diagnosis: my rule compared across *different seeds* (abort ran `…103`, grid runs `…204`). Those populations differ measurably: p 0.9125 vs 0.7190, cluster-adjusted **z=2.04, p=0.041**.
2. **`--limit` truncates, it does not stratify.** Every cell measures **D0 and D1 only; D2 and D3 are n=0.**

Internal cell-to-cell contrasts are still valid (all cells share both defects). Nothing here describes the D0–D3 family.

## 6. Open questions where outside input changes what we do

1. **Is the pinned population already trainable for bf16, or does the corpus need hardening?** Every bf16 measurement so far (n=10, n=6, n=8, and now n=32 on D0/D1 only) has intervals containing 27.1%. Cost to settle at n=256, G=8: **3.2 h, $3.77**.
2. **Given ρ ≈ 0.36–0.75, what is the right G?** More generations buy less than the binomial suggests. We have a measured probe: g=1 160.0 s/effective, g=2 157.5, g=4 198.6, g=8 OOM.
3. **Does difficulty raise entropy enough to produce real disagreement?** Control says the model is uncertain when wrong — encouraging. `treatment` tests it directly.

## 7. Already ruled out — please don't re-propose

- **Lowering temperature.** Already 1.0 and unrestricted; lowering deepens collapse.
- **Raising temperature above 1.0.** Manufactures disagreement above the model's own distribution — trains the policy against randomly induced errors. Adjacent to our spurious-reward control.
- **Selecting cases that resemble the high-entropy steps.** Conditioning on the outcome. Also not executable: the pod run saved no completions and the log has no per-step prompts.
- **Deriving G=8 degeneracy from `p^G+(1-p)^G`.** Assumes independence; ρ≈0.357 makes it understate by 0.254 at G=8 vs 0.057 at G=2 — biased toward flattering the production shape.
