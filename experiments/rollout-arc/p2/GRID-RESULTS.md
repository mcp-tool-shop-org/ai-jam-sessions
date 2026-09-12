# Grid v2 — control cell, and a fired halt condition

**Rule:** [`DISTANCE-PREREG.md`](DISTANCE-PREREG.md), committed before any cell ran.
**Status: the pre-registered halt condition FIRED. The screen's bridge to this arc's
pinned numbers is VOID.** Written on the control cell alone; the other three cells had
not been read.

## Harness gates — passed

| gate | required | control |
|---|---|---|
| `dataset_rows` | 32 | **32** |
| distinct prompts in parquets | 32 | **32** |
| `completions/clipped_ratio` | 0 | **0 on all 32 steps** |
| completion length vs 1024 budget | well under | **79–175 tokens** |

The `--limit` defect that voided v1 is fixed and verified. **Truncation is ruled out**, so
the accuracy below is valid — this is not the confound that made a 0.69 look like a
falsification.

## A seventh gate the harness did NOT have — `--limit` does not stratify

**Found after the control cell was read. Every cell in this grid measures D0 and D1 only.**

`GET /cases?limit=32` takes the **first** 32 rows, and the generator emits level by level.
With `trainPerLevel` 16 the train split is 64 rows ordered D0,D0…D1,D1…D2,D2…D3,D3 — so
`--limit 32` takes exactly D0 and D1 and drops D2 and D3 entirely. Confirmed from the
parquets, by parsing the level out of each distinct prompt's song title:

    distinct prompts: 32     level distribution: {'D0': 16, 'D1': 16}

**D2 = 0, D3 = 0.** D0 and D1 are the *least* confusable distractor tiers — the two easiest
levels in the family.

This defect was already known in this arc: the first train-parity run drew D0 (48) and D1
(16) with D2/D3 at n=0. **I passed `--limit` explicitly to fix the v1 dataset bug and
walked straight into the stratification bug it has always had.** Sixth instance of a
population assumed rather than read, and the second one I have caused personally.

**Consequence:** all four cells share the same truncation, so the grid's **internal**
contrasts remain valid — they compare like with like on D0/D1. But nothing here describes
the D0–D3 family, and the control cell is **not** a positive control for the abort run,
which saw all four levels across 1024 rows. The bridge to the arc's numbers was already
void; this is a second, independent reason.

The grid is being allowed to finish rather than restarted, on the same reasoning as before:
changing the row selection mid-grid would make cells 1–2 and 3–4 incomparable, which is the
one property the 2×2 has. Stratified selection is a fix for the follow-up run, not for this
one.

## Control result — bf16, distance 1–3, D0/D1 only, `num_generations` 2, 32 groups

| | |
|---|---|
| accuracy (per completion) | **0.719** |
| groups all-right | 21 / 32 |
| groups all-wrong | 7 / 32 |
| groups non-degenerate | **4 / 32 = 0.125** |
| *k*-of-2 spread | `{0: 7, 1: 4, 2: 21}` |
| overdispersion | 1.75 (ρ ≈ 0.745) |
| `format_rate` | 1.0 on 31 of 32 steps |

## The halt condition, and why it fired

The rule required: *control must reproduce the abort's finding — at least 30 of 32 groups
fully correct, at most 1 non-degenerate — or the screen is VOID and the next step is
diagnosing, not confirming at higher n.*

**Control returned 21 fully correct and 4 non-degenerate.** It did not reproduce.

**The diagnosis is a defect in my rule, not in the harness.** The abort ran seed
**2026091103** at `trainPerLevel` 256. This grid runs seed **2026091204** at
`trainPerLevel` 16. **They are different populations**, and I wrote a halt condition
demanding one reproduce the other. Comparing the two bf16 accuracies with a cluster
adjustment for the correlated rollouts:

| run | *p* | n | design effect | n_eff | 95% CI |
|---|---|---|---|---|---|
| abort, seed …103, G=8 | 0.9125 | 80 | 3.50 | 22.9 | [0.797, 1.028] |
| control, seed …204, G=2 | 0.7190 | 64 | 1.75 | 36.7 | [0.574, 0.864] |

Difference 0.194, SE 0.095, **z = 2.04, p = 0.041.** The two populations differ — the fresh
seed is measurably harder for bf16 than the one the abort ran on. Nominally the same
generator settings; not the same difficulty.

**This is the fifth time in this arc a population was assumed rather than read** — the q4
pin, the 2-row dataset, the 2-prompt smoke, the independence assumption, and now a
positive control specified against a corpus it was never going to match.

## What this does and does not void

- **VOID: any bridge from this grid to the arc's pinned numbers.** No cell here may be
  compared to the 27.1%, to the abort's 2/10, or to the learnability band. A true positive
  control has to run at seed **2026091103**, and it has not.
- **NOT void: the grid's internal comparisons.** All four cells share seed 2026091204 and
  shape; only the difficulty flags move. Treatment against control remains a valid
  controlled contrast, and the remaining cells are being allowed to finish on that basis
  rather than discarded for a rule-specification error.

## The finding that does not depend on the halt

**bf16 scores 0.719 with 4 of 32 groups non-degenerate on the two easiest distractor tiers
of a distance-1–3 population.** That is not "solves the task outright." And the direction is
worth noting: D0/D1 are the *least* confusable tiers, yet this scored **lower** than the
abort run's 0.9125 across all four levels. Either the level labels do not track difficulty
for bf16, or the seed difference dominates them. Both are measurable; neither is measured.

**And the model is not confidently wrong.** Entropy by group outcome:

| group outcome | n | mean entropy |
|---|---|---|
| all-right | 21 | 3.64e-3 |
| **all-wrong** | 7 | **7.88e-3** |
| non-degenerate | 4 | 9.42e-3 |

The prereg's middle row — *accuracy down, entropy flat at ~1e-4, groups agreeing on a wrong
answer* — is **not** what happens here. When this model is wrong it is also uncertain, at
more than twice the entropy of the cases it gets right. Confident wrongness was the failure
mode that would have made the difficulty knobs useless, and control shows no sign of it.

---

# Treatment cell — P1c's mechanism reproduces on bf16

**Distance 5–11, decoy off, D0/D1 only, G=2.** Read after the control cell, under the
pre-registered rule.

## Guards — all passed, so the result is not an artifact

| guard | treatment | control |
|---|---|---|
| `completions/clipped_ratio` | **0.000 on all steps** | 0.000 |
| completion length vs 1024 budget | 79–171 mean, **209 max** | 79–175 |
| `turn_cap_rate` | **0.00 — never hit the 5-turn cap** | 0.50 max |
| `mean_tool_turns` | 2.00–4.00 | 2.00–4.00 |

**The model had the tokens and the turns and did not use them.** Control actually hit the
turn cap; treatment never did.

## Result

**Accuracy 0.000. Every group entirely wrong.** By the pre-registered rule this is
**reading 2 — overshoot — and it is explicitly NOT a success**: an all-wrong population is
exactly as degenerate as an all-right one and carries the same zero gradient.

## Where the wrong answers land — the finding

Answer offset from the prompt's bound, with gold at +5, +7, +9 or +11:

| offset | n | |
|---|---|---|
| +0 | 5 | inside the first page |
| +1 | 4 | inside the first page |
| +3 | 32 | inside the first page |
| **+4** | **14** | first measure of the *second* page |
| ≥ +5 | **0** | — |

- **41 of 55 numeric answers (74.5%) land inside the first 4-measure page.**
- **The maximum offset answered anywhere is +4.**
- **0 of 55 land at a legal gold distance.**

**P1c's mechanism reproduces on the model we would train.** "The policy pages but never
uses the second page" was recorded as a 4-bit finding and marked *unverified for bf16* after
the precision defect surfaced — correctly, because every case in the pinned corpus sits
inside the first page by construction, so bf16 had never been tested past it. **It has now.**
The refinement is that the policy pages at most once and never answers beyond +4, while
having both turns and tokens to spare.

## What this settles, and what it costs

1. **The distance pin at 1–3 is load-bearing and survives the precision correction.** It is
   not a quantization artifact.
2. **Distance is not a usable difficulty lever.** It goes from solved (0.719) to unsolvable
   (0.000) with nothing between at 5–11. That is the overshoot the rule named in advance.
3. **The boundary is at +4, and it is measurable.** 14 of 55 answers reached +4, so the
   second page is not wholly out of reach — the model gets one measure into it. **Distance
   4, and possibly 5, is the only place a learnable band could live**, and it is a free
   local probe.

## On correlation — the question the external review asked

Entropy is **higher** in treatment than control: mean 9.86e-3 against 5.29e-3, nearly 2×.
**The model is not confidently wrong; it is uncertain and wrong.** So the confident-wrongness
failure mode is absent here too.

But ρ **cannot be estimated from this cell**: with every group at 0/2 correct there is no
variance in the correct-count, and the overdispersion ratio is undefined. The rollouts do
vary — they disagree about *which* wrong answer to give — but that diversity never crosses
into correctness. **Diversity without correctness buys nothing**, and it means a larger G
here would purchase more varied wrong answers, not more gradient.

## Caveat on the treatment finding — the environment misinforms the policy

> **CORRECTED — the description does NOT lie to the policy.** This section originally said the
> policy is misinformed because `list_measures` describes itself as *"an overview of **all**
> measures in a song."* **That string is in `src/mcp-server.ts`, which the policy never
> reads.** TRL registers tools from the docstrings in `experiments/rollout-arc/p2/trainer/env.py`,
> and that docstring says: *"Get an overview of measures in a song… **This environment pages at
> most 4 measures per call.**"* It has said so since commit `33abf85` — present for every cell
> of the grid and the probe. **The policy was always told the cap, accurately.**
>
> **Ninth instance of this arc's failure class, and the fourth I have caused**: I read a
> property off one surface and attributed it to a subject that reads a different surface —
> the same shape as measuring a 4-bit model and attributing the result to bf16.
>
> **What the finding becomes.** The policy *knows* the window is 4 and still stops after one
> page. The hint's effect came from what it **added** — *"the measure you are looking for may
> lie beyond the first window; page forward until you find it"* — not from correcting a lie.
> So this is not a documentation bug with a cheap fix. It is a gap between **stating a
> constraint and prompting the search behaviour the constraint implies**, which is a
> substantially more interesting result and a harder one to engineer away.
>
> The `mcp-server.ts` inconsistency is real but is a *product* matter: there the server
> genuinely returns all measures, so its description is correct and must not be changed to
> claim a cap that only this experiment's wrapper imposes.



Raised by the director: *is there a knowledge base informing the policy during training, and
isn't that a crucial lever?* There is, and checking it exposed a confound in the finding above.

**The KB is the MCP-served song library**, reached through nine tools (`list_songs`,
`song_info`, `list_measures`, `detect_chord`, `verify_harmony`, and four audio tools
irrelevant here). It is complete: it contains the answer to every case. **Knowledge is not
the bottleneck. Search persistence is.**

But the policy's *model* of that KB is wrong, and we made it wrong:

| what the policy is told | what is true here |
|---|---|
| `list_measures` — *"Get an overview of **all** measures in a song"* (the tool's own description, `mcp-server.ts:691`) | the environment refuses any window > **4** (`boundListMeasures`) |
| `endMeasure` — *"End measure (1-based, default: **last**)"* | a default-last call is rejected |
| system prompt, in full: *"You are operating AI Jam Sessions, a music education platform. Use the tools to inspect the library. Your final turn is the answer alone, with no explanation."* | never mentions the 4-measure cap, that paging may be required, or how long the song is |

The song's length is discoverable **only by triggering an out-of-range error**. Nothing in
the normal path tells the policy the answer might lie beyond the window it just fetched — and
its tool description says that window *was* the whole song.

**So the +4 ceiling has two competing explanations and this grid cannot separate them:**

1. **Capability** — the policy cannot sustain multi-page search. (What the finding above assumed.)
2. **Information** — the policy does not know it *should* page, because the tool description
   says it already has everything and nothing states the cap up front.

If (2), then "distance is not a usable difficulty lever" is wrong, P1c's mechanism is an
artifact of *our environment's* description layer rather than of any model, and the same
confound sits under the original 4-bit P1c measurement too.

**The discriminating probe is free and local:** re-run the treatment cell unchanged except
for a system prompt that states the 4-measure cap, that the answer may lie past the first
window, and the song's measure count. If accuracy moves off 0.000, the ceiling is
informational.

**This does not touch the control cell or the decoy cells** — their answers lie inside the
first window, so the cap never binds on them.

### The environment layer as a difficulty lever

Independent of the confound, the director's framing is right and this arc has not used it.
`MAX_LIST_WINDOW` is **ours**, imposed in the environment rather than in the MCP server —
the unbounded server would dump all 219 measures of `bethena`, which was the P1b failure
(one observation, one guess, no search). It is a continuous dial on search depth that is
**orthogonal to the corpus**: narrowing it makes even distance 1–3 require paging; widening
it makes distance 5–11 reachable in one call. Difficulty has been treated as a property of
the generated data for this whole arc. Half of it lives in the environment.

---

# All four cells — and the 2×2 is not a controlled 2×2

| cell | distance | decoy | accuracy | non-degenerate | all-right | all-wrong | harness |
|---|---|---|---|---|---|---|---|
| control | 1–3 | off | 0.719 | 0.125 | 21/32 | 7/32 | OK |
| treatment | 5–11 | off | **0.000** | 0.000 | 0/32 | 32/32 | OK |
| decoy-near | 1–3 | **on** | **0.875** | 0.062 | 27/32 | 3/32 | OK |
| decoy-far | 5–11 | **on** | **0.000** | 0.000 | 0/32 | 32/32 | OK |

All four passed every harness gate: 32 rows, 32 distinct prompts, `clipped_ratio` **0.000**
on every step of every cell, completions far inside the 1024 budget.

## The cells are not comparable to each other

`decoy-near` scored **higher** than control — 0.875 against 0.719 — when planting a decoy
before the bound was supposed to make it *harder*. The explanation is not a surprising
result about decoys. **It is that the two cells ran different cases.**

Generated both populations at the identical seed and shape and compared the case keys:

    shared cases between control and decoy-near: 3 / 32

**Three.** The decoy knob draws its decoy measure from the shared RNG stream and rejects any
case with `after < 2`, so the stream shifts and a different 32 cases come out. The distance
knob does the same — past 3 it draws a free `targetSlot` — and changing the distance set
necessarily changes which measures are gold anyway.

**So neither axis of this 2×2 is controlled.** Every cell-to-cell rate comparison in the
table above is confounded with population, and the 0.875-vs-0.719 difference is exactly the
size that confounding produces. It is not interpretable.

**This is the eighth instance of this arc's failure class and the third I have caused.** It
is also the same mechanism as the `rhOffset` bug I caught before committing — a knob that
moves the population rather than only the property — except there it was a bug and here it
is *inherent to how the knobs are built*, which I did not think through.

**The design fix** is to separate case *selection* from song *construction*: draw the case
set once from a stream the knobs cannot touch, then apply decoy / right-hand / octave as a
post-hoc transformation of the same cases. A distance contrast needs a further step — hold
`(song, chord, after)` fixed and vary only the gold offset — otherwise "same case" is not
even definable across distances.

## What survives, because it is not a rate comparison

**The policy never answers beyond +4 from the bound.** Answer offsets, gold at +5/+7/+9/+11:

| cell | numeric answers | inside first page | at +4 | **at ≥ +5** |
|---|---|---|---|---|
| treatment | 59 | 45 (76%) | 14 | **0** |
| decoy-far | 62 | 45 (73%) | 17 | **0** |

**0 of 121, across two independently-drawn populations.** This is an absolute statement
about where answers land, not a comparison of rates between cells, so the population
confound does not touch it. Both far cells had `turn_cap_rate` **0.00** — the policy never
exhausted its 5 turns — and `clipped_ratio` 0. **It had the turns and the tokens and stopped
anyway.**

That replication is what makes the P1c mechanism finding stand: the policy pages at most
once and never answers past the first measure of the second page.

## Entropy — consistent across all four cells

| cell | all-right | all-wrong | non-degenerate |
|---|---|---|---|
| control | 3.64e-3 (21) | 7.88e-3 (7) | 9.42e-3 (4) |
| decoy-near | 2.03e-3 (27) | 3.36e-3 (3) | 2.13e-2 (2) |
| treatment | — | 1.50e-2 (32) | — |
| decoy-far | — | 7.79e-3 (32) | — |

**Ordering holds everywhere it can be measured: all-right < all-wrong < non-degenerate.**
And the two far cells, where the policy fails completely, carry the highest mean entropy of
any cell — treatment at 1.50e-2 is nearly 3× control.

**The policy is most uncertain exactly where it fails hardest. It is never confidently
wrong.** Since entropy is not confounded by *which* cases were drawn in the way a rate is —
it is measured per step against that step's own outcome — this is the most robust signal in
the grid.

**But ρ is undefined on both far cells.** With every group at 0 of 2 correct there is no
variance in the correct-count. The rollouts do diversify — entropy says so — they just never
diversify *into correctness*. **Diversity that never crosses into a correct answer buys no
gradient**, so a larger G on this population would purchase more varied wrong answers.
