# Planning lock — first RunPod cell after both study-swarms

**2026-09-14.** Packs: Grok `STUDY-SWARM-GROK.md`, Claude `c894a6c`. Ledger `948d48d`. **No pod until the prereg is pushed.**

## Money

Live RunPod balance **$18.56**. Honest cell (3 treatment + 3 own-C, 5090 community) **$7.25**. **Do not add funds.** Dead-man **$12**, not the whole balance. SKU: community 5090 (measured wall in this arc). Secure 5090 is the fallback if community is out, still under $12 for the six-run cell.

## First cell — one lever

| | control C | treatment B0 |
|---|---|---|
| `--beta` | `1e-4` (current pin) | **`0.0`** |
| everything else | identical: prefix-mode none, 200 steps, G=8 train, n=32 frozen fixture, ε 0.2/0.28, `loss_type` dapo (pin it), `entropy_coef` 0, `scale_rewards` group (pin it) | same |
| seeds | 7 / 8 / 9 | 7 / 8 / 9 |
| eval | unconditioned G=64, 75 held-out, generation seed 7 | same |
| platform | **same pod**, same image | **same pod** |

Primary: item-wise opening concentration, runs-and-items, **arm-vs-arm required** (meaning is comparative). Secondary: pass rate; flattening that loses C’s replicated lift is a trade.

Readings on B0 − C concentration (condition must entail the meaning):

| reading | condition | meaning |
|---|---|---|
| 1 STOPS THE PULL | excludes 0, negative | removing silent-group KL stops the sharpening |
| 2 UNRESOLVED | includes 0 | not distinguishable at K=3 |
| 3 SHARPENS ANYWAY | excludes 0, positive | GX-Chen’s β→0 limit: the reward maximizer is still unimodal |

ANDON: `run.json` records `beta` exactly; B0 has no KL term applied (TRL skips the ref log-prob forward at `beta == 0.0`); `dataset_rows=32`; eval G=64; six distinct adapters.

## Not this cell

- PIL / a fifth prefix variant
- Dynamic sampling (absorbing sink on a fixed 32)
- Entropy_coef / adaptive entropy (Skywork’s constant-α grid collapsed at every tested value; adaptive at 0.2 ramps to 1.0)
- MARA (build; inert at β=0)
- Offline prompt filter (changes the population; new fixture + new C; a later cell)
- Scoring against local C for concentration

## Foreclosed, stated now

β=0 makes MARA identically inert. If this cell does not move the prior, the next question is the **environment** (offline in-band filter, new n) or a **build**, not “add entropy on top of β=0.”

Jin et al. arXiv:2511.05993 stays out of this lock (single-provider at the re-gate).
