# Preregistration — the information-vs-capability probe

**Written with `control-hint` at 9 of 32 and `treatment-hint` not started. No probe reward
has been read.**

## Why this probe is worth more than the grid it follows

**It is the first population-controlled contrast in this arc.** The `--system-hint` flag
never enters `generateCorpus` — verified from the two `/health` receipts, which report
identical `generator_seed` (2026091204) and identical difficulty settings. So `control-hint`
runs *the same 32 cases* as `control`, and `treatment-hint` the same 32 as `treatment`, with
exactly one thing different: the system prompt.

Every other contrast in grid-v2 failed this test — the decoy axis shared only 3 of 32 cases
with control. **Here the pairing is exact**, so a difference is attributable.

## The question

The policy never answers beyond **+4** from the bound (0 of 121 across two populations),
while having turns and tokens to spare. Two explanations the grid could not separate:

- **capability** — it cannot sustain multi-page search
- **information** — it does not know it *should* page, because `list_measures` describes
  itself as "an overview of **all** measures in a song" while the environment caps it at 4

The hint states the cap and that the answer may lie past the first window. It contains no
distance, no measure number, no page index, no song length.

## Readings, in order of precedence

**Reading 0 — the hint is a tax. Check this FIRST.** If `control-hint` accuracy falls
materially below control's **0.719**, the hint costs something even when the answer is
already in the first window — instruction overhead, or paging the policy did not need. That
contaminates any reading of `treatment-hint`, and the probe reports the tax before it reports
the gain. *This is the cell an outside reviewer correctly insisted on, and the reason both
arms carry the hint.*

**Reading 1 — informational breakout.** `treatment-hint` accuracy strictly between 0 and 1
**and at least one non-degenerate group**. Distance is a real difficulty axis once the
information defect is repaired, and the +4 ceiling was ours, not the model's.

**Reading 2 — degeneracy overshoot.** `treatment-hint` accuracy near 1. Paging is trivial
once instructed. **Not a success**: distance is then exhausted as a lever, degenerate at the
top instead of the bottom. Same trap as reading 2 of the distance prereg.

**Reading 3 — capability wall.** `treatment-hint` stays at or near 0.000. Information was
not the binding constraint.

## The diagnostic that separates "ignored the hint" from "tried and failed"

Accuracy alone cannot distinguish these, and reading 3 is worthless without it. **Three
quantities are reported for every cell regardless of outcome:**

| quantity | "ignored the hint" | "tried and lost its place" |
|---|---|---|
| **max answer offset** (grid: +4, always) | still ≤ +4 | moves past +4 |
| `mean_tool_turns` (grid: 2.0–4.0) | unchanged | rises |
| `turn_cap_rate` (grid far cells: **0.00**) | stays 0.00 | rises above 0 |

A policy that now exhausts its turns and still misses is a **capability** result. A policy
whose turn usage does not move read the hint and did not act on it — which is a prompt
problem, not a model one, and would mean the probe tested the wrong thing.

## Standing guards

Unchanged from the distance prereg and they bind here too: any cell with
`completions/clipped_ratio` > 0 is **void for accuracy**; `dataset_rows` and distinct-prompt
count must both equal 32 or the cell is void before it is read; no local step time is a
throughput number.

**And the n caveat is unchanged: 32 groups gives a ±0.147 half-width.** This probe can
resolve 0.000 from something, and near-1 from something. It cannot resolve 0.30 from 0.45,
and no number from it goes into a design decision without a larger run.
