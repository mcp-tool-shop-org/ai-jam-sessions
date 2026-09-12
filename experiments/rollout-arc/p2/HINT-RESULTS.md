# The information-vs-capability probe — result

**Rule:** [`HINT-PREREG.md`](HINT-PREREG.md), committed before any cell finished.
**The pairing is exact: 32 of 32 prompts shared on both axes.** This is the first
population-controlled contrast in this arc — the only thing that differs is the system
prompt.

| cell | accuracy | non-degen | max answer offset | answers ≥ +5 | `turn_cap_rate` | `mean_tool_turns` | `clipped_ratio` |
|---|---|---|---|---|---|---|---|
| control | **0.719** | 0.125 | 14 | 2 | 0.50 | 2.0–4.0 | 0.0 |
| control-hint | **0.374** | 0.031 | 12 | **22** | **1.00** | 2.0–**5.5** | 0.0 |
| treatment | **0.000** | 0.000 | **4** | **0** | 0.00 | 2.0–4.0 | 0.0 |
| treatment-hint | **0.016** | 0.031 | **12** | **13** | **0.50** | 2.0–4.5 | 0.0 |

Every cell passed the harness gates: 32 rows, 32 distinct prompts, `clipped_ratio` 0.

## Reading 0 fired, and it is reported first because the rule said so

**The hint is a tax, and a large one.** On the *same 32 cases*, accuracy fell from **0.719
to 0.374**. Paired per case: the hint made the policy **better on 2, worse on 16**, unchanged
on 14 — sign test **p = 0.0013**.

The mechanism is visible: `control-hint` answers ≥ +5 jumped from 2 to **22**, and
`turn_cap_rate` went from 0.50 to **1.00** — every step now exhausts its turns. **Told it
might need to page, the policy pages past answers that were already in front of it.**

This is the cell the external reviewer insisted on, and the reason both arms carried the
hint. Without it, the treatment result would have been read as a clean gain.

## The +4 ceiling was informational — reading 3 is refuted

The pre-registered diagnostic was built to separate "ignored the hint" from "tried and
failed," because accuracy alone cannot. It answers unambiguously:

| | grid | with hint |
|---|---|---|
| max answer offset | **+4** | **+12** |
| answers at ≥ +5 | **0 of 121** | **13** |
| `turn_cap_rate` | 0.00 | 0.50 |

**The policy can answer beyond +4. It simply did not know it should.** The wall was ours —
`list_measures` describing itself as "an overview of all measures in a song" while the
environment caps it at 4. **This is the eighth instance of this arc's failure class and the
first that is an environment bug rather than a measurement bug**, and it means P1c's
"pages but never uses the second page" describes our description layer, not any model — under
bf16 *and* under the original 4-bit measurement.

## But reading 1 was not achieved — repairing the information does not repair the task

`treatment-hint` accuracy is **0.016**: one correct completion in 64. Paired, the hint was
better on 1 case and worse on 0 — **p = 1.0, indistinguishable from no effect.**

**Paging is unlocked and correctness is not.** The policy now searches the second and third
pages, reaches +12, exhausts its turns on half the steps — and still lands on the wrong
measure. Distance 5–11 remains unsolved for a reason that is *not* the search bound.

## What this settles

1. **The +4 ceiling was an environment defect, not a model limit.** Refuted the capability
   hypothesis outright.
2. **The hint as written is net harmful** and must not ship. It buys paging at distance and
   costs accuracy everywhere else, at roughly 2:1 against.
3. **Distance 5–11 is still not a usable difficulty axis** — 0.016 is degenerate at the
   bottom exactly as 0.000 was. The overshoot reading from the distance prereg stands, now
   for a better-understood reason.
4. **The real defect to fix first is the tool description**, not the corpus. A policy told
   the truth about its own search surface — "this returns at most 4 measures of N" — would
   not need a system-prompt hint, and would not over-page when the answer is already in hand.

## What it does not settle

n = 32 groups, ±0.147. And the tax confounds magnitude: `treatment-hint`'s 0.016 is a
*net* of a paging gain and an over-paging cost, and this probe cannot separate them. The
clean version is to fix the `list_measures` description and re-measure with **no** system
hint at all — which costs nothing and removes both the confound and the tax.
