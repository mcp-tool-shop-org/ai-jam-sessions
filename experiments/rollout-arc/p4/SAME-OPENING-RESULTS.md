# Same-opening groups — AMBIGUOUS, and the prereg says what that means

**Local, RTX 5090, $0. common-practice · 2 voices · 4 bars · G=16 · n=32 · 512 completions ·
seed 7.** Every rollout in a group pre-filled with the **same** valid opening; the opening
rotates across items so each of the 16 valid openings is the group identity for exactly 2
items. Sampler untouched (temperature 1.0, top_p 1.0, top_k 0 — which is also
`GRPOConfig`'s default, verified in `grpo_config.py:527-544`).

Thresholds were fixed in `PREFIX-PREREG.md` Part 1 before this data existed.

## The reading: 3 — AMBIGUOUS

| criterion | threshold for VIABLE | measured | |
|---|---|---|---|
| non-degeneracy | >= 0.50 | **0.6250** [0.453, 0.771] | pass |
| mean within-group distinct completions | >= 0.50 x G = 8.0 | **6.156** | **fail** |

Reading 1 required both. Reading 2 (DEAD) required non-degeneracy <= 0.25 **or** distinct
<= 4.0, and neither holds. **The preregistered consequence of reading 3 is: heterogeneous
is the default, and the ambiguity is reported as ambiguity.** That is what this document
does. Stratified is implemented and available behind `--prefix-mode stratified`; it is not
what the primary run uses.

## The three cells

| | unforced | heterogeneous (exploring starts) | **same-opening (stratified)** |
|---|---|---|---|
| pass rate | 0.389 *(unconditional)* | 0.453 *(conditional)* | **0.514** *(conditional)* |
| non-degenerate | 14/32 = 0.4375 | 30/32 = 0.9375 | **20/32 = 0.6250** |
| rho | 0.710 | 0.221 | **0.528** |
| effective draws of 16 | 1.37 | 3.70 | **1.79** |
| mean distinct completions / group | 4.906 | 16.000 † | **6.156** |
| within-group uniqueness (passers) | 0.356 | 1.000 † | **0.413** |
| passing signatures unique | 22.1% | 90.1% † | **31.6%** |
| `top_first_measure_share` | **0.874** | 0.078 ‡ | 0.099 ‡ |

† **Uninformative by construction.** Under heterogeneous forcing every rollout in a group
was handed a different opening, so 16 distinct completions and 1.000 within-group
uniqueness are guaranteed before the model generates a token. They measure the
intervention, not the policy. Quoting them as diversity was the confound this control
existed to remove.

‡ **Not the falsifier.** Under forcing the first measure is dictated, so this number
reports the rotation schedule. `top_first_measure_share` is only meaningful on an
**unconditioned** eval, which is exactly why the falsifier in `PREFIX-PREREG.md` Part 2 is
defined there and nowhere else.

The only honest comparison of *continuation* diversity is unforced **4.906** against
same-opening **6.156** — both with a single opening per group, one chosen by the policy and
one imposed. **Pinning the opening produced more distinct completions than letting the
policy choose it**, which is the opposite of the obvious prediction and follows from the
unforced collapse being a collapse of the whole completion, not only of its first measure.

## The k-of-16 histograms, which is where the real cost is

```
unforced        {0:13, 1:2, 3:2, 4:1, 7:1, 9:2, 12:1, 13:2, 14:1, 15:2, 16:5}
heterogeneous   {1:4, 2:1, 3:1, 4:2, 5:5, 6:1, 7:3, 8:4, 9:1, 10:3, 11:2, 12:1, 13:2, 16:2}
same-opening    {0:7, 2:1, 3:2, 4:1, 5:1, 6:1, 7:2, 9:1, 10:3, 12:3, 13:2, 15:3, 16:5}
```

A group at k=0 or k=16 has zero within-group reward variance and therefore **zero
advantage for every one of its 16 rollouts** — the step pays for them and learns nothing.

- heterogeneous: **2 of 32 groups dead (6%)**
- same-opening: **12 of 32 dead (38%)** — 7 all-fail, 5 all-pass
- unforced: **18 of 32 dead (56%)**

That is the price of stratification stated as compute: at G=16 roughly **38% of generated
rollouts carry no gradient**, against 6% under heterogeneous forcing. It is also the
strongest single argument the heterogeneous default has, and it is an empirical one.

## The argument for stratified that this measurement does NOT settle

Opening difficulty is real: across the fully-crossed heterogeneous run — where every item
contributes exactly one rollout to every opening, so item difficulty averages out — pass
rate by forced opening runs **0.219 (`[1,1]`) to 0.563 (`[1,0]`), range 0.344, sd 0.101**.

Under **heterogeneous** forcing that variation sits **inside** the group, where GRPO's
per-group standardisation cannot remove it: part of each rollout's advantage grades the
opening it was handed. Under **stratified** forcing the same variation sits **between**
groups, where per-group standardisation removes it *exactly*. That is a structural
argument, it is correct, and it is why the mode is implemented rather than discarded.

What it does not do is outweigh a preregistered threshold after the fact. The nuisance term
is a bias of known sign and measured size on a 0/1 reward; the 38% dead-group rate is a
measured cost. Nothing measured here says which dominates during training, and the only
thing that would is a training comparison — which is not free, and which this arc has not
bought.

**Recorded so it cannot be re-litigated from memory:** the heterogeneous run is the primary
because the prereg said an ambiguous reading defaults to it, not because the structural
argument was rejected.

## A confound that would have been reported as a finding

`scripts/opening-difficulty.mts` on the same-opening file prints
`range 0.688 sd 0.165 — SEVERE`, nearly double the heterogeneous estimate. **That number is
not comparable and must not be quoted.** In the same-opening design each opening is backed
by only **2 items** (2 groups x 16 correlated rollouts, rho 0.528), so the opening effect is
fully confounded with those two items' difficulty; in the heterogeneous design each opening
is backed by all **32 items**, one rollout each, fully crossed. The script was written for
the crossed design and prints its verdict regardless. It now refuses to print a verdict when
the design cannot support one.

**0.344 / sd 0.101 from the crossed run is the estimate of opening difficulty. 0.688 is an
artifact of asking a crossed-design script about a nested design.**

## Receipts

`scripts/emit-same-opening.mts` · `scripts/probe_prefixed.py` · `scripts/score-curriculum.mts`
`scripts/opening-difficulty.mts` · `runs/spec-4bar-same-opening.jsonl` ·
`runs/spec-4bar-same-opening-gen.jsonl` · `runs/summary-spec-4bar-same-opening-gen.json`

Summaries are now per-run and carry `generated_from`. They did not before: one shared
`curriculum-summary.json` was rewritten by every scoring run, so the file committed at
`f1ec03b` is named for the curriculum cell and held the exploring-starts numbers. A first
draft of `PREFIX-PREREG.md` cited **0.874** from a file that said **0.078**, and the
citation would have passed review.
