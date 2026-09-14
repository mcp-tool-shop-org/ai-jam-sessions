# B0 vs C — results

**2026-09-14. RunPod RTX 5090 community, $0.69/hr.** Readings fixed in `B0-PREREG.md`
(`5f3f0df`) before any pod existed. Executable `1b28a1a`. One lever: `--beta`. Control C is
`1e-4` (the arc's pin). Treatment B0 is `0.0` (TRL's library default). Six trains, seeds
7/8/9 per arm, 200 steps, G=8, n=32 frozen fixture, `--prefix-mode none`. Seven unconditioned
evals at **G=64** on the 75-item held-out pool, generation seed 7, including one base eval
on the same pod.

**Every interval in this file comes from one script, `scripts/b0-vs-c.mts`**, RNG seeded
**per computation**. Point estimates and verdicts below are from that run.

---

## The cell ran. That is asserted, not assumed.

Pod `7bsth3b01ilw9l`, image `runpod/pytorch:1.1.0-cu1290-torch280-ubuntu2404`, GPU
`NVIDIA GeForce RTX 5090` 32,607 MiB, `/workspace` fstype **xfs** (container disk, not a
network volume). Checkout `1b28a1a94e8e5f7a669ab2f0415dd1ca09907df3`. `trl` 1.13.0.

| check | C7 / C8 / C9 | B07 / B08 / B09 |
|---|---|---|
| `config.beta` | `1e-4` | `0.0` |
| `trl_metrics.kl_logged` | **true** | **false** |
| `loss_type` / `scale_rewards` | `dapo` / `group` | identical |
| `entropy_coef` / adaptive | `0.0` / false | identical |
| `dataset_rows` | 32 | 32 |
| `arm_guards.py none 32` | ok | ok |
| `beta_guards.py arm` | ok | ok |

`beta_guards.py cell` on the pod: **6 adapters, 6 distinct SHA-256**, every eval 75 × 64,
**0/4800 empty**. Re-run locally on the fetched receipts: all six arms pass; the pre-fix
local `arm-C7L` still VOIDs (no `trl_metrics`).

Babysitter checksums **VERIFIED**, pod terminated, dead-man disarmed. Live account after:
balance **$14.70**, `currentSpendPerHr` **0**, **0 pods, 0 volumes**.

**Spend.** Pre-create balance $18.56. After: $14.70. **~$3.86**, of which ~$0.17 is the
first create (`jvdjl9ybmbeok6`) that sat RUNNING with no SSH because `dockerStartCmd=sleep
infinity` replaced the image start. The cell itself was **5.13 h** GPU (`stage-timings.jsonl`
elapsed 18479 s) at $0.69/hr. Priced at $7.25 because evals were assumed at the local 39 min
wall; they ran ~14 min.

---

## PRIMARY — B0 minus C, opening concentration

Item-wise, paired by item, bootstrap over **runs and items**. Positive = B0 is MORE
mode-locked than C.

| contrast | mean | 95% | |
|---|---|---|---|
| **B0 − C** | **+3.45pp** | **[−3.42, +12.10]** | **includes 0** |

Arm vs base (reported, **not** the decision):

| arm | mean | 95% | |
|---|---|---|---|
| C (`β=1e-4`) | −1.67pp | [−10.13, +4.60] | includes 0 |
| B0 (`β=0`) | +1.78pp | [−1.35, +5.06] | includes 0 |

---

## Scoring against `B0-PREREG.md`

| reading | condition on **B0 − C** | fired |
|---|---|---|
| 1 STOPS THE PULL | excludes 0, negative | no |
| **2 UNRESOLVED** | **includes 0** | **YES** |
| 3 SHARPENS ANYWAY | excludes 0, positive | no |

**Reading 2 fires.** B0 and C are not distinguishable on the prior at K=3. That does **not**
mean β is inert. It is the outcome the prereg named as modal for any true effect below ~3pp.

The trade clause does **not** fire. It was conditional on reading 1.

---

## SECONDARY — held-out pass rate

| contrast | mean | 95% | |
|---|---|---|---|
| C vs base | +2.32pp | [−0.03, +5.89] | includes 0 |
| B0 vs base | **+3.79pp** | **[+0.25, +9.34]** | **excludes 0** |
| B0 − C | +1.47pp | [−3.43, +7.17] | includes 0 |

B0's lift vs base is the one interval that excludes zero. It is **not** distinguishable from
C. The local-C gate figure of +4.71pp is a different platform and a different receipt pin
and is not this cell's control.

---

## Per-run (display only — a conjunction over these is not the reading)

Item-wise concentration vs this pod's base:

| run | Δ conc | 95% |
|---|---|---|
| C7 | +2.83pp | [+0.92, +4.81] excludes 0 |
| C8 | +3.00pp | [−0.48, +6.33] includes 0 |
| **C9** | **−10.83pp** | **[−14.00, −7.88] excludes 0** |
| B07 | +3.29pp | [+1.27, +5.19] excludes 0 |
| B08 | +3.44pp | [−0.02, +6.71] includes 0 |
| B09 | −1.38pp | [−3.19, +0.19] includes 0 |

Pass lift vs base:

| run | Δ pass | 95% |
|---|---|---|
| C7 | +0.56pp | [−0.38, +1.79] includes 0 |
| C8 | +5.35pp | [+2.56, +8.52] excludes 0 |
| C9 | +1.04pp | [−0.69, +3.15] includes 0 |
| B07 | +1.15pp | [−0.23, +2.90] includes 0 |
| B08 | +9.19pp | [+5.17, +13.60] excludes 0 |
| B09 | +1.04pp | [+0.06, +2.21] excludes 0 |

**C9 flattened −10.83pp on this pod**, the same shape as the earlier pod-C −9.00pp. C7 and C8
sharpened. Own-C was not optional: scoring B0 against the local three-run C cluster (all
same sign, +1.15 to +3.27) would have been a different experiment. B0 produced no C9-sized
flatten. That is display. It is not reading 1.

---

## PLATFORM — by-product, G=64 bases

Pod-base minus local-base concentration, same 75 items, paired: **−0.40pp [−1.13, +0.27]**,
includes 0. Means 0.9256 vs 0.9296. **The bases agree.** The trained-run gap is still a
draw-vs-machine mixture; this number only says the *untrained* prior is not a platform
effect at G=64. Arm-vs-arm is unaffected either way — both arms are on this pod.

---

## What this does not license

- **Not “β is inert.”** Reading 2 is unresolved at K=3, which the power table priced in
  (arm-vs-arm MDE 2.61 / 6.66 / 9.04pp depending on a spread we could not know until B0
  existed; C9's −10.83pp says this cell's C spread is not the tight 1.14pp row).
- **Not a pass-rate win for B0 over C.** B0 vs base excludes zero; B0 − C includes it.
- **Not a fifth variant, not entropy on top of β=0, not MARA** (foreclosed at β=0), not a
  fourth seed. The prereg does not authorise more seeds; a new n or a build is a fresh
  decision with a fresh price.
- **Not new capability.** Yue still binds. Nearest-tone is still 32/32 on the trained pool.

GX-Chen still binds as the *prediction* for reading 3, which did not fire. The silent-group
KL pull was removed (`kl_logged` false on all three B0 receipts). Removing it did not produce
a distinguishable move of the unconditioned prior at this K.

---

## Receipts

`scripts/b0-vs-c.mts` (sole source of every interval above) ·
`artifacts/mc64-heldout-{base,C7,C8,C9,B07,B08,B09}.jsonl` ·
`artifacts/arm-{C7,C8,C9,B07,B08,B09}.json` · `artifacts/cell-guards.txt` ·
`artifacts/stage-timings.jsonl` · `artifacts/babysit.log` ·
`scripts/beta_guards.py` · `scripts/arm_guards.py` ·
prereg `5f3f0df` · exec `1b28a1a` · pod `7bsth3b01ilw9l`

---

## Independent verification (advisor seat, after the fact)

Re-run on the fetched receipts, not on the pod's word:

- **`beta_guards.py arm` re-run locally on all six** — C7/C8/C9 as `C`, B07/B08/B09 as `B0`:
  six `ok`. `kl_logged` is `true` on all three C receipts and `false` on all three B0
  receipts, so the directional ANDON did the job it was built for and neither direction
  passed by accident.
- **`b0-vs-c.mts` re-executed** — every interval in this file reproduces to the last decimal,
  including the per-run tables and the platform by-product. The RNG is seeded per computation
  (a different seed per contrast, which is a different convention from `pil-readout.mts`'s
  single seed per computation; both reproduce, and the two files' bounds are therefore not
  bit-comparable to each other).
- **Spend reconciles against the live account, not the estimate.** $18.5577 → $14.7011 =
  **$3.8566**. 0 pods, 0 network volumes, `currentSpendPerHr` 0.
- **Wall reconciles**: `stage-timings.jsonl` ends at elapsed 18479 s = 5.13 h.

### The realised power, now that it is knowable

`B0-PREREG.md` fixed three MDE rows before the runs and said which one obtained was not
knowable until B0 existed. It is knowable now, and **the cell landed below every row**:

| | runs (Δ conc vs pod base) | sd |
|---|---|---|
| C (`β=1e-4`) | +2.83 / +3.00 / **−10.83** | **7.94pp** |
| B0 (`β=0`) | +3.29 / +3.44 / −1.38 | 2.74pp |
| pooled | | **5.94pp** |

**Realised arm-vs-arm MDE at K=3, 80% power, two-sided 0.05: 13.58pp.** The prereg's rows were
2.61 / 6.66 / 9.04. The observed **+3.45pp is 25% of what this cell could resolve**, so
reading 2 was all but fixed the moment C9 landed. For scale, the local C cluster's sd was
**1.14pp — 7.0× tighter than this pod's C.**

That is the honest reading of the null: **not "β does nothing", and not even "K=3 cannot
tell" in the abstract — this particular K=3, with a control arm that threw a −10.83pp run,
could not have resolved anything smaller than about 13pp.**

### Three measured corrections to things I wrote before the run

1. **β=0's cost saving is ~2.8%, not a reason.** B0 trains 2083 s against C's 2144 s
   (10.41 vs 10.71 s/step). `POD-LEDGER.md` and `B0-PREREG.md` listed "the only candidate
   that makes the cell cheaper" among five reasons for β=0, with the size explicitly
   unmeasured. It is measured now and it is nearly nothing — under PEFT, TRL reverts the
   adapter rather than running a separate reference model, so the pass it skips was already
   cheap. **One of the five reasons is withdrawn.**
2. **The local wall over-prices a pod run by roughly 1.9×.** Pod 10.71 s/step against local
   14.76; pod G=64 eval **833 s** against local **2373 s** (2.8×). `pod-ledger.py` carries
   `POD_FACTOR = 1.072` derived from the four-arm pod's 15.83 s/step — wrong in sign and
   magnitude for this cell, which is why $7.25 became $3.86. **The rented 5090 is faster than
   this rig's**, and local wall is a conservative-by-2× estimator, not a neutral one.
3. **`LAUNCH-b0.md` step 1 cost $0.17 and it was my defect.** It prescribed creating the pod
   with `sleep infinity` so nothing would stage before the dead-man was armed. On
   `runpod/pytorch`, `dockerStartCmd` **replaces** the image's start command — including
   sshd — so pod `jvdjl9ybmbeok6` sat RUNNING and unreachable until it was killed. The image
   already idles with sshd up; the "idle CMD" solved a problem that did not exist.

### One latent compensator defect, which did not bite

`deadman-b0cell.log` shows the first dead-man disarmed by a cancel file at 23:05:29 and the
second armed at 23:06:55 **with the same label and therefore the same cancel path**. It
survived the full 5 h 13 m, so the stale file was cleared between those two lines — by hand,
not by anything in the design. **Had it not been, the second dead-man would have exited at its
first tick and the whole cell would have run uncovered.** A reused label inherits the previous
run's disarm. The fix is a per-pod label (`b0cell-<podid>`) or an explicit delete in the arm
step; recorded here rather than left to be discovered by an uncovered run.
