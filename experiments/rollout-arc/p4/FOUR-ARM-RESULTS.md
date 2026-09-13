# The four-arm run — the peak did not flatten, and the controls are why we know

**2026-09-13. RunPod RTX 5090 (driver 580.126.20, 32607 MiB — the same card every local
measurement was taken on), Qwen3-4B-Instruct-2507 bf16, torch 2.11.0+cu128, TRL 1.13.0.
Commit `7ec619c`. 2h 50m wall, $2.80. Four arms x 200 steps at G=8, five unconditioned
evals at G=16.**

Readings were fixed in `PREFIX-PREREG-AMENDMENT.md` §5 before the pod existed. They are
applied here without reinterpretation.

---

## The reading: 3 — NOTHING FLATTENS

**Primary outcome: `top_first_measure_share` on an unconditioned eval.** Scaffolding off,
nobody handing the model an opening. 32 items, G=16, 512 completions per arm.

| arm | `topFirst` | pass rate | non-degenerate | rho | passing sigs unique |
|---|---|---|---|---|---|
| **base** (untrained, measured on this pod) | **0.889** | 0.3887 | 15/32 = 0.4688 | 0.739 | 24.1% |
| **A** stratified | **0.841** | 0.4531 | 15/32 = 0.4688 | 0.623 | 19.4% |
| **B** heterogeneous | **0.848** | 0.5000 | 14/32 = 0.4375 | 0.702 | 16.4% |
| **C** unforced control | **0.820** | 0.3906 | 14/32 = 0.4375 | 0.689 | 24.0% |
| **D** heterogeneous + random reward | **0.829** | 0.3887 | 12/32 = 0.3750 | 0.742 | 24.6% |

Pre-committed: flattening is **below 0.70**. "Did not flatten" is **above 0.80**. Every arm
is above 0.80. Reading **3** fires: *the scaffold was load-bearing and the competence is
conditional.*

**The D veto is what makes this decisive rather than merely negative.** Random binary
rewards moved `topFirst` by **0.060** — *more* than stratified's 0.048 and more than
heterogeneous's 0.041. The movement that did occur is what any gradient does to the prior
over 200 steps. There is no exploration effect here to attribute to forcing, and the
amendment's own words apply: this must not be rescued by pointing at pass rate.

**The base re-measurement was worth its five minutes.** 0.889 on this pod against 0.874 on
the local 5090 — close enough to confirm the published figure transfers, and the arc has
already lost six phases of receipts to assuming exactly that without checking.

`[0,1]` — root-and-third — opened **177** of the base's 199 passers, **195** of A's 232 and
**217** of B's 256. In absolute terms the forced arms produced *more* `[0,1]` passers, not
fewer. The share fell a little because the total rose.

## What DID happen, and it is not the thing that was hypothesised

| | base | **A** stratified | **B** heterogeneous | **C** unforced | **D** random reward |
|---|---|---|---|---|---|
| unconditioned pass rate | 0.389 | **0.453** (+6.4pp) | **0.500** (+11.1pp) | 0.391 (+0.2pp) | 0.389 (0.0pp) |

A clean 2x2. **C** says training alone does nothing. **D** says 198 effective updates of
pure noise do nothing (`frac_reward_zero_std` 0.010 — random binary rewards split a group of
8 almost every time, so D is a *maximally* active null). Both forcing and the real verifier
are necessary for the lift.

That is the **infrastructure-validation** result the amendment preregistered as the honest
purchase: the reward landscape is dense enough to teach a known-solvable capability through
a live GRPO loop. **It is not musical capability.** The nearest-tone deterministic heuristic
scores 32/32 on this pool for free, and a trained policy here still loses to code already in
the repo.

**And it is in-sample.** `spec-prompts-4bar-random.jsonl` *is* `fixtures/progressions-v1.json`
— the same 32 items every arm trained on, seen 6.25 times each by B/C/D. Preregistered
separately in `HELDOUT-PREREG.md` and measured on 29 unseen items; see that file's reading.

## The design tiebreak — and a correction to the argument that set it up

Both A and B landed in reading 3, so the preregistered tiebreak applies: **effective updates
per GPU dollar**, `(1 - frac_reward_zero_std) x steps / GPU-dollars`.

| arm | `frac_reward_zero_std` | effective updates of 200 | wall | **eff / $** |
|---|---|---|---|---|
| A stratified | 0.545 | 91.0 | 2071 s | **160** |
| B heterogeneous | 0.445 | 111.0 | 2084 s | **194** |
| C unforced | 0.725 | 55.0 | 3552 s | 56 |
| D random reward | 0.010 | 198.0 | 2138 s | 337 † |

† noise by construction; listed for completeness, not comparison.

**B wins**, by 21%, and also wins on unconditioned pass rate. Heterogeneous — what
`PREFIX-PREREG.md` authorised before any of this — survives its own test.

**But the reasoning used to justify it does not.** `SAME-OPENING-RESULTS.md` priced
stratification at **38% dead groups against 6%**, and that pair was measured at **G=16**
while this run trained at **G=8**, where it measures **54.5% against 44.5%** — a 10-point
gap, not 32. This arc's own trap list says it in as many words: *"a rate at one
`num_generations` is not a rate at another. Accuracy is G-invariant; non-degeneracy is
not."* The figure was quoted across G anyway. The conclusion stands; the margin behind it
was a third of what was claimed, and the claim is corrected here rather than in a footnote.

Also worth recording against the structural argument (arXiv `2605.08817` §3.3, which forms
one GRPO group per (prompt, prefix) pair): **stratified's unbiased baseline did not convert
into a better outcome on any measured axis.** It was not worse in kind — it lifted pass rate
too — it was simply less efficient and no better at the thing both designs were built for.

## One thing that is not explained

**A's training `acc_joint` was flat — 0.235 over the first 50 steps, 0.242 over the last 50 —
while B's and C's roughly doubled** (0.168 -> 0.328 and 0.163 -> 0.340). Yet on the
unconditioned eval A *gained* 6.4pp and C gained nothing.

Training accuracy and eval accuracy moved in opposite directions for two different arms. No
mechanism is offered for that here. A story built now would be fitted to data already in
hand, which is the failure mode this arc has a memory entry about; the honest record is that
it is unexplained and would need its own cheap control to resolve.

## Every hard guard passed

| | A | B | C | D |
|---|---|---|---|---|
| `dataset_rows` | 512 | 32 | 32 | 32 |
| `prompt_repeats` | 0.391 | 6.25 | 6.25 | 6.25 |
| rollouts / `prefix_hits` | 1600 / **1600** | 1600 / **1600** | n/a | 1600 / **1600** |
| `openings_covered` | **16** | **16** | n/a | **16** |
| `openings_per_group` | **1..1** | **8..8** | absent | **8..8** |
| `masked_prefix_tokens` | 25600 | 25600 | 0 | 25600 |
| bridge `first_measure_wrong` delta | **0** | **0** | n/a | **0** |
| guards | **ok** | **ok** | **ok** | **ok** |

`openings_covered: 16` on both forced arms at G=8 is the coprime-stride fix working in
production. The version shipped two hours earlier would have read **8** here and every other
number in this table would have been identical.

27 of 27 artifacts verified against `artifacts.sha256` after fetch.

## Cost

| | |
|---|---|
| four arms + five evals, 2h 50m | **$2.80** |
| three pods terminated before their image finished pulling | **$0.245** |
| held-out eval on the same pod | ~$0.38 |
| **total** | **~$3.43 of $20 authorised** |

The $0.245 was mine: routing took 19.7 minutes and I killed three pods on a 5-minute cap
taken from a memory note that described a *warm* host. The same note says cold stage 0 is
220 s against a warm 17 s. The warm/cold distinction was written down and applied to the
wrong stage.

## What the arc now knows

- **The loop works.** Prefix forcing runs inside a live `GRPOTrainer` batch, the verifier
  scores what was pinned, the injected tokens stay out of the loss, and 200 steps move a
  real metric.
- **The exploration hypothesis is not supported.** Exploring starts made the policy better
  at completing from anywhere; they did not make it *choose* to start anywhere. The
  typicality peak is a property of the prior that survives 200 steps of gradient against it.
- **Both group designs work and heterogeneous is cheaper.** The structural argument for
  stratification is sound and did not pay.
- **Nothing here is musical capability**, and the free heuristic still wins.
