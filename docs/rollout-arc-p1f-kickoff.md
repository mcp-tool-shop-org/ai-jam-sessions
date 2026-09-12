# P1f — same family, more cases, and the criterion the dispatch froze too narrowly

**Paste target:** a fresh Grok-Build session. **Date:** 2026-09-11. **Spend: $0. No GPU.**
**Predecessor:** [P1e](../experiments/rollout-arc/p1e/RESULTS.md) (commit `67732fb`) — kebab-parity fixed the lookup confound, 607 hits of 1024, tools help, **NO-GO on the frozen bar at all four levels.**
**Design lock:** [rollout-layer-dispatch.md](rollout-layer-dispatch.md). **P2 remains held.**

---

## 0. Why there is a P1f and not a null report

P1e is a clean result and its NO-GO stands. Nothing below moves a bar, relaxes the format
gate, changes the pin, changes the page size, changes the distance pin, or puts the song id in
the prompt. All of those stay exactly as P1e set them.

What changed is that re-deriving P1e's own receipts surfaced a **defect in the instrument, and
the evidence for it predates every run in this arc.**

The dispatch's research grounding contains **four** findings about which cases are worth
training on. P0 froze its GO rule on one of them and dropped the other three without comment:

| Finding | Source | What it says a trainable case is |
|---|---|---|
| **22** | DAPO (arXiv:2503.14476) | a group whose rollouts **do not all agree**; degenerate groups are discarded and the batch refilled. The dispatch's own implication line reads "the batch refills until it holds a fixed number of **non-degenerate groups**." |
| **23** | Foster et al. (arXiv:2502.12272) | score by learnability **p(1−p)**, which is zero only at p ∈ {0,1} |
| **26** | Absolute Zero (arXiv:2505.03335) | `r_propose = 0 if mean solve rate ∈ {0,1}, else 1 − mean solve rate` — again zero only at the ends |
| **24** | INTELLECT-2 (arXiv:2505.07291) | pass@8 in **[12.5%, 50%]**, an *offline* filter applied to **285,000** candidates |

Three of the four say **non-degenerate**. One gives a narrow band, and it is a selectivity
filter for a pool three orders of magnitude larger than ours. **P0's GO rule used only finding
24.** That is the bar this arc has now failed four times.

Both quantities, recomputed from P1e's committed receipts with its own leak filter:

| Level | n | leak-free **in-band** (frozen bar) | leak-free **non-degenerate** (findings 22/23/26) |
|---|---|---|---|
| D0 | 32 | 6 | 9 |
| D1 | 32 | 4 | 9 |
| D2 | 32 | 7 | **11** |
| D3 | 32 | 5 | **12** |
| **all** | **128** | **22 (17.2%)** | **41 (32.0%)** |

**Full disclosure, because it decides how P1f must be read: the secondary criterion below
already clears at D2 and D3 on P1e's existing data.** It is written into this lock *before*
P1f runs anyway, so that P1f is an honest **replication on fresh cases at double n**, not a
discovery announced from the run that motivated it. If it fails to replicate, it fails.

### On P1e's "contradiction" finding

P1e argues that first-page competence and a weak integer guess-test cannot both hold, because
gold is always N+1, N+2 or N+3 with N in the prompt. **That is correct and it is not being
waved away.** It costs 38 of 128 cases, a 30% leak tax. The response is that a tax is not a
wall: 32% of cases survive as leak-free and gradient-bearing, and an unbounded generator is
exactly the instrument for paying a fixed-rate tax.

---

## 1. What to change — only two things

1. **n: 32 → 64 test songs per level.** Preregistered from P1e's measured rates, not chosen after the fact. At the frozen bar's 17.2%, expected leak-free in-band per level is **11.0**; the rate needs n ≥ 59 to expect 10, so 64 is the smallest round n that clears it. At the non-degenerate 32.0%, expected is **20.5**.
2. **Report the secondary criterion alongside the primary**, at every level.

**Everything else is a control and must not move:** pin `qwen3:4b-instruct-2507-q4_K_M`
(`think: false`), T=1, n=8, seed 0+attempt, bounded page of 4, parallel cap, distance pinned
1–3, D0–D3 definitions, the format gate, the reward, and the bars in `p0-report.mjs`.
Use a **fresh generator seed** so the cases are new, and record it in the pin.

---

## 2. The two criteria, both frozen here, both reported

| | Rule | Bar |
|---|---|---|
| **Primary** (unchanged from P0) | leak-free cases with pass@8 in **[12.5%, 50%]** | **≥ 10** at some single level, and sampled pass@1 **< 0.80** |
| **Secondary** (declared here, first use) | leak-free cases with **1 ≤ c ≤ 7** of 8 — non-degenerate, positive learnability under findings 22/23/26 | **≥ 10** at some single level, and sampled pass@1 **< 0.80** |

Leak filter is unchanged: `applyLeakFilter` in `p0-report.mjs`, a case the no-tool baseline
solves within 8 attempts is dropped. Do not re-implement it and do not re-tune it.

**Report all four levels for both criteria whatever they say.** Reporting only the level that
looks best is the error this arc has refused at every phase.

---

## 2a. Source check and the measured histogram — neither changes a criterion above

**Citation verified 2026-09-11, against the paper rather than the blog.** INTELLECT-2's own
HTML §3.3.1 reads *"filtering out problems in which the base model's pass@8 rate was above 50%,
and below 12.5%"*. **Finding 24 quotes it correctly and the primary bar is faithful to its
source.** The Prime Intellect blog's looser phrasing — *"only use problems with a solve rate of
75% or lower"* — is **not** corroborated by the paper, so **no 75% bound is adopted here.**

Worth recording because it is the honest half of the same check: the rationale the blog gives
for filtering is *"problems for which all completions have received the same reward carry no
training signal."* **That rationale justifies excluding only c=0 and c=8.** The paper's 50%
upper bound is tighter than its own stated reason requires, which is exactly the gap §0
describes. Both facts now sit on the record; the bar does not move.

**The exact `c/8` histogram over P1e's 128 cases**, leak-free row computed by scoring guess
answers against gold:

| c of 8 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| all | 24 | 2 | 0 | 17 | 11 | **26** | 1 | 2 | 45 |
| leak-free | 16 | 2 | 0 | 14 | 6 | **17** | 1 | 1 | 33 |

Two things follow, and both are diagnostic rather than decisive.

**The distribution is lumpy, not smooth.** Spikes at 0, 3, 5 and 8 with near-empty buckets at
2, 6 and 7. A graded difficulty axis would not look like this. A small number of discrete
policy behaviours over a three-way positional choice would, which is independent support for
P1e's contradiction finding.

**The entire primary-versus-secondary argument reduces to `c=5`.** Buckets 6 and 7 hold three
cases between them, two of them leak-free, so pure non-degeneracy `[1,7]` and a hypothetical
`[1,6]` differ by **one case**. `c=5` holds 26 raw and 17 leak-free. So the real question is
not "does 87.5% dilute the gradient" but **"does 62.5% count."** At c=5 the GRPO advantages are
`+0.775` for each correct rollout and `−1.29` for each incorrect one — well-scaled, and nothing
resembling collapse. **P1f reports the buckets separately so this stays answerable from the
data rather than from argument.**

---

## 3. The stopping rule, declared now

This arc has iterated four times. A stopping rule belongs in the lock, not in a later argument.

- **Primary clears** → GO. P2 unlocks under a director gate, on that level's population.
- **Primary fails, secondary clears** → report it as exactly that: *this task shape carries a trainable gradient under the criterion three of the dispatch's four findings specify, and does not carry the narrow INTELLECT-2 band.* The decision to train on the secondary is a **director gate**, not Grok's and not the advisor's.
- **Both fail** → **the arc ships the null. There is no P1g.** The shape is wrong, not the knob.

---

## 4. What to run

```text
pnpm exec tsx experiments/rollout-arc/scripts/synth-learnability.mjs --n 8 --split test --songs 64
```

Extend `p0-report.mjs` with the secondary count as an **additional reported field**. Do not
alter `applyLeakFilter`, the band constants, or the existing primary logic — add beside, never
edit. Its tests must still pass unchanged, and add one for the secondary counter.

Report per level: pass@1, pass@8, the full `c/8` histogram with `c=0`, `1–4`, `5–7`, `c=8`
broken out separately, leak count, guess pass@8, leak-free in-band, leak-free non-degenerate,
and the tool-turn histogram to confirm search still happens as it did in P1e (mean 2.45).

---

## 5. Compensators (no skip)

| Action | Compensator | Owner |
|---|---|---|
| Synthetic songs in `<AI_JAM_HOME>/songs/` | isolated per-worker home, deleted on teardown; real library untouched | P1f session |
| MCP server per worker | explicit kill + existing leak assertion on close | P1f session |
| Schema version bump | not registered in the published set; nothing under `datasets/` | P1f session |
| GPU spend | **none authorised**; P4 unreachable | director only |

---

## 6. Do not

- Do not start P2 on your own verdict. Both branches above end at a director gate.
- Do not edit the primary bar, the band constants, or `applyLeakFilter`.
- Do not change the pin, the page size, the distance pin, the format gate or the reward.
- Do not drop a level from the report because it looks bad.
- Do not treat the secondary criterion as the "real" bar. It is a second, separately reported measurement whose first use is this run.
- Do not rent a pod or spend a dollar.

---

## 7. If the stopping rule fires — task-shape directions, with what our data already says

Recorded so a null hands the director something evaluated rather than a blank page. **None of
this is authorised by this lock, and none of it happens if P1f clears either criterion.**
Four directions were proposed externally (Google, 2026-09-11) on the premise that the task is
all-or-nothing once the song is found. Our own receipts already rule on three of them.

| Direction | Our evidence | Verdict |
|---|---|---|
| **Decoy overlap** — distractors sharing the search signature, forcing cross-examination | **This is exactly D1–D3.** P1e measured it and it runs *backwards*: D3 pass@1 0.68 against D0's 0.48. Confusability made the root-position target the odd one out. | **Already falsified.** Do not rebuild it. |
| **Structural multi-hop** — distance between two unindexed anomalies | Requires holding one find while making another. P1c measured that capability as absent: **480 of 480** in-range answers at distance ≥ 4 came from the first window. | **Predicted floor of zeros.** Would reproduce P1c, not escape it. |
| **Combinatorial target** — compound answer over several retrieved facts | Same dependency as above wherever the components span pages. Survives *only* if every component is visible in one page. | **Conditionally viable**, single-page only. |
| **Transposition layer** — ask about a hypothetically mutated piece | Gold stays constructible (mutate, then re-derive with the same two engines), and no lookup can shortcut it. Cost: it stops being a *search* task and becomes a transformation task. | **Viable, but a different question.** A new arc, not a knob. |

**The premise itself needs correcting.** "All-or-nothing once the song is found" is partly an
artifact of how P0 binned, not a property of the task. The full `c/8` histogram over P1e's 128
cases is `c=0` 24, `1–4` 30, `5–7` 29, `c=8` 45. **Forty-six percent of cases sit in the
interior** and carry gradient. The narrow band sees 23% of them. A shape that looks bimodal
under finding 24's bins is substantially graded under findings 22, 23 and 26 — which is the
whole reason §2 reports both.

**The one genuinely open design problem** is the one P1e named and Google reached
independently: guess-resistance wants a large answer space, and single-page competence wants a
small one. Pinning distance to 1–3 satisfies the second and breaks the first. Any future shape
has to widen the answer space without spanning pages — a value *read from* the found measure
rather than its position. Note the tension is real but bounded: it costs a 30% leak tax, and
32% of cases survive it.

### Structural value-read — the leading candidate, and the number it has to beat

Proposed externally after the arithmetic objection landed: *"find the first measure containing
X, read the highest pitch in that measure, output its note name."* Conditional extraction, no
offsets, no modulo, single page. **The mechanism is right and it is the best external
contribution to this arc.** It is recorded here as the leading candidate if the stopping rule
fires. It also does not work as stated, for a reason specific to our generator.

**Priced against `generate.ts` as it exists.** The catalog is 9 agreeing pitch classes × major
and minor, all built by `triadMidi(pc, minor, octave = 3)` at **a single octave**. Root-position
tops are `root + 7` over 9 roots; the once-inverted tops are `root + 12`. The union is about
**13 distinct highest-note values**. A uniform guesser over 13 gets pass@8 ≈ **48%** — *worse*
than the 30% positional leak it was proposed to fix. Note names are only a wide answer space in
a corpus with a wide tessitura, and ours has one octave.

**The fix is in the generator, not the task shape, and the parameter already exists.**
`triadMidi` takes `octave` and defaults to 3. Spanning octaves 1–5 takes the top-note vocabulary
past 40 values and a uniform guesser to roughly 18%. Reading a full voicing string rather than a
single note widens it further, at the cost of a harder format gate.

**What it still would not do on its own.** Widening the answer space reduces *leaks*; it does
not by itself move probability mass into the band. Those are separate failures and P1e has both.
There is a plausible mechanism by which it might — with two independent ways to fail, locating
the measure and reading it, the success rate becomes a product and the lumpy 0/3/5/8 histogram
could smooth — but that is a hypothesis, not a result, and it would need its own preregistered
measurement.

---

## 8. Reporting back

`experiments/rollout-arc/p1f/RESULTS.md`, receipts committed beside it, verdict framed
contrastively as the dispatch requires. State plainly whether the secondary replicated at D2
and D3 on fresh cases, since that is the specific claim this run exists to test.
