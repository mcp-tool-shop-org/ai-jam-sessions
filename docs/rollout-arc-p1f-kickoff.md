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

## 7. Reporting back

`experiments/rollout-arc/p1f/RESULTS.md`, receipts committed beside it, verdict framed
contrastively as the dispatch requires. State plainly whether the secondary replicated at D2
and D3 on fresh cases, since that is the specific claim this run exists to test.
