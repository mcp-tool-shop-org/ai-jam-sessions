# P2 handoff — read this first

**Written 2026-09-12 at `7678ff6`, 61 commits into the session, $10.40 of $25 spent, no pods
running.** Everything below is measured and committed; every retraction is attached to the
file it retracts.

---

## The answer

**Corpus hardening is closed. The task is too easy for bf16 Qwen3-4B, and no knob in the
generator reaches the learnability band.**

| axis | result | file |
|---|---|---|
| distance 1–3 | non-degenerate 0.055 — degenerate at the top | `GRID-RESULTS.md` |
| distance 5–11 | accuracy **0.000**; policy will not page under any condition tested | `GRID-RESULTS.md`, `TURN-TAX.md` |
| D2 / D3 tiers | **inert by construction** — the gold check drops every case where the inversion is confusable (0/32 in every tier, verified with no model in the loop) | `LEVELS-RESULTS.md` |
| D1 parallel-only, n=400 | **0.065 [0.043, 0.094]** — below the 0.125 floor, interval excludes it | `PARALLEL-PIN-RESULTS.md` |
| all four knobs stacked | accuracy 0.835, non-degenerate 0.062 — 12 points of difficulty bought, **zero** gradient | `STACK-RESULTS.md` |

**Why more difficulty does not help:** ρ rises *with* difficulty and cancels it. 0.714 at
accuracy 0.958, 0.893 at 0.923, **0.947 at 0.835** — about 1.05 effective draws of 8. Cases
move from all-right to all-wrong, never to split.

**And the harness has been independently cleared**, which is the check that was missing the
first time I said this and had to retract it:

| | generic prompts | our task |
|---|---|---|
| GRPO, no tools | branches 0/64 | — |
| GRPO, **with tools** | **branches 0/64** | **collapses 92.2%** |

TRL is fine. The policy emits 1.09 distinct model spans per group of 8 on this task because
a completion is *a tool call whose arguments are copied from the prompt, a deterministic tool
response, and one number.* See `ARMC-RESULTS.md`, `TRL-REPRO-RESULTS.md`.

---

## The decision waiting for you

**Not a measurement — a choice about the algorithm.** I priced it wrong once and corrected it
(`ARMC-RESULTS.md`, final section):

| run | accuracy | all-wrong | advantage on all-right |
|---|---|---|---|
| parallel-only | 0.958 | 2.0% | +0.042 |
| **hardened stack** | 0.835 | **15.6%** | **+0.165** |

Under GRPO, ≈8 of 128 groups carry gradient. Under a value or batch-level baseline, **every**
group registers, weighted by \|r − baseline\|. I originally rejected this citing "2% of cases"
— that was computed on the wrong run.

**The surviving objection:** a cross-prompt baseline reintroduces prompt difficulty as a
nuisance variable, which is exactly what group-relative advantage removes. A real cost, not a
veto. There is **no evidence either way about whether it would train** — that is the point.

Other options, honestly weaker: a different (weaker) model, or a different task family. This
one is solved at 0.96 by the base model.

---

## Three traps that cost hours — do not re-enter them

1. **`--limit` truncates, it does not stratify.** Fixed in the bridge (round-robins across
   levels before applying the limit), but `train.py`'s `--dry` block still sets
   `args.limit = args.limit or max(2, …)` with no explicit-flag guard. **Always pass
   `--limit` explicitly.** The paid smoke run has `dataset_rows: 2`; its 38.5 s/step and
   65.2% mask figures are withdrawn.
2. **Every small sample overestimated difficulty.** Parallel-only across three draws of the
   *same construction*: n=11 → 0.273, n=65 → 0.092, **n=400 → 0.065.** Monotone. Assume a
   pilot is the hard tail until n is in the hundreds.
3. **A rate at one `num_generations` is not a rate at another.** G=2 gave 1/64 splits where
   G=8 gave 7/64 on identical cases. Accuracy is G-invariant; non-degeneracy is not.

---

## Operational

- **Pods:** `RUNPOD_GPU="NVIDIA RTX PRO 6000 Blackwell Workstation Edition"` — the L40S hosts
  carry driver 550, too old for the image's cu129 torch, and `nvidia-smi` looks perfectly
  healthy while `torch.cuda.is_available()` is `False`. **Always SSH one line to check CUDA
  before staging.** Retrying blind returns the same bad host.
- **Dead-man before staging**, not after. The pod bills from creation, and `runpod.mjs up`
  can exceed a 600 s timeout while still having created a pod.
- **Cost per run ≠ cost per hour.** Blackwell at $1.69/hr finished a cell in 16 min; the A100
  at $1.19/hr took 49 min for the same work and cost more.
- **The VRAM watchdog does not guard the P2 trainer venv.** Its `$targets` in
  `E:\AI\training\_watchdog.ps1` lists sd-scripts, trellis2-env, ComfyUI, ai-toolkit. It also
  fires on VRAM ≥31200 MiB, and this trainer legitimately runs at 31–32 GB — so adding the
  target without raising the ceiling would kill every local P2 run. **Director's call, not
  a default.**
- **Commit charge, not RAM%, is the metric that bites here.** G=8 took commit to 91.0 GB of a
  92.5 GB limit while RAM read a comfortable 69%.

---

## Unfinished, in priority order

1. **The Ollama/TRL divergence.** 3.75 distinct model spans vs 1.09, and accuracy 0.60–0.66
   vs 0.835, on the same corpus at matched sampler settings, at both q4 and fp16. Something
   makes the transformers path effectively sharper — chat template, a logits processor, or
   where temperature is applied. **A curiosity now, not a blocker**, since the trainer is the
   one that matters and it works. `SPAN-RESULTS.md`.
2. **Distance 4** — never measured. The boundary where 14 of 55 answers reached in the
   distance-5–11 cells. The only untested point between "solved" and "unreachable".
3. **`train.py`'s `--limit` default** — still unguarded. A one-line fix plus a
   `prompt_repeats` field in the receipt that refuses rather than records.

---

## What I would keep from this session

Three positions were held and retracted on evidence: *difficulty is the lever*, *the harness
is the lever*, *TRL is the bug*. **Not one was caught by thinking harder about data already
in hand — every one died to a cheap control**, and in two cases I had already committed the
conclusion. Eleven instances of one failure class are tracked through the files; five were
mine. The corrections are the finding.
