# Addendum 2 — the held-out eval, preregistered before it runs

**2026-09-13, written after the four-arm run finished and BEFORE any held-out generation
exists.** The pod is still up. The primary outcome is already settled and this does not
touch it.

## Why this is a control and not a fishing trip

The four-arm run's **primary** outcome is decided: reading **3, NOTHING FLATTENS**
(`PREFIX-PREREG-AMENDMENT.md` §5). That is not reopened here.

Its **secondary** finding carries a limitation I have to state plainly: **the eval pool IS
the training pool.** All 32 items of `spec-prompts-4bar-random.jsonl` are the same 32 items
in `fixtures/progressions-v1.json` that every arm trained on, and arms B/C/D saw each of
them 6.25 times. So the unconditioned pass-rate lift — base 0.389 to **0.453 (A)** and
**0.500 (B)**, with both controls null — is measured **in-sample** and is equally consistent
with memorisation.

Measuring a limitation I have already written down is a control. It is not the same as
adding an outcome after seeing the data, and the distinction is only honest if the reading
is fixed first. So it is fixed here, before the run.

## The cell

`runs/spec-prompts-v2-holdout.jsonl` — 32 items, **29 of them never trained on** (3 overlap:
`stormy-monday`, `sweet-home-chicago`, `dream-on`). Unconditioned, G=16, same sampler, same
scorer. Five evals: base, A, B, C, D.

**The pools are NOT the same cell** — the held-out items carry 5 named chords against the
trained pool's 4. Absolute rates therefore do not transfer between pools, and no comparison
across pools is made. **Only the within-pool difference (arm minus base, both on the
held-out pool) is read.**

## Pre-committed readings

In-sample lifts to beat: **A +6.4pp, B +11.1pp** over base.

1. **GENERALISES.** Both forced arms clear **half** their in-sample lift on the held-out
   pool — A >= **+3.2pp**, B >= **+5.6pp** over the held-out base — while C and D stay within
   +/-2pp. The secondary finding survives: forcing plus the real verifier taught something
   that transfers to unseen items.
2. **MEMORISATION.** Either forced arm's held-out lift is **<= 0**, or it is not
   distinguishable from C and D. **The secondary finding does not survive**, the in-sample
   gain is 32 items seen repeatedly, and the four-arm run bought a working loop and nothing
   about the task. Written plainly because it will be tempting to explain away: the arms
   still differ in-sample, and "but the controls were null in-sample" is not a defence of a
   held-out null.
3. **AMBIGUOUS.** Anything between. Not a pass. n = 32 items at one cell.

**The primary outcome is unaffected by all three.** Reading 3 (nothing flattens) stands
whatever the held-out numbers say; `top_first_measure_share` is reported on the held-out
pool as a secondary, and a low value there would be a property of a *different pool*, not
evidence that the peak flattened on the trained one.

## Cost

~55 min on a pod already running, ~$0.91, taking the session's total to roughly $4.00 of
the $20 authorised. The alternative is downloading 490 MB of adapters and re-uploading them
to answer the same question later at the same price plus the staging.
