# Rollout Arc — closing report (the null branch, shipped)

**Date:** 2026-09-11 · **Corrected same day** (§3 and §5.1 — the original "task supply is the binding
constraint" finding was wrong; the error and its replacement are kept in place rather than rewritten
away). · **Verdict:** the arc closes on a **NO-GO** on the three families measured. No
reinforcement-learning training run was authorised, and none is authorised now.
**Total spend: $0.** No GPU was rented at any point.
**Status of the underlying question after the correction:** narrower and still open — see §5.3.
Reopening is the director's decision and has not been made.
**Design lock:** [rollout-layer-dispatch.md](rollout-layer-dispatch.md) · **Closed by:** the director,
2026-09-11, under dispatch §8 gate 3.

---

## 1. What was asked, and what came back

The repo's experiment contract already owned two of the four parts of a reinforcement-learning
environment: `cases()` is a task generator with constructible gold, and the real MCP server is a
verifier. The arc set out to build the other two — a rollout loop and a scalar reward — and to
decide first, for nothing, whether training against them was worth paying for.

It decided. Three task families were measured against bars frozen before any model was called.
All three failed, each for a different and fully diagnosed reason.

| Phase | Family | Bar | Measured | Why it failed |
|---|---|---|---|---|
| **P0** | existing four-draw corpus, 59 held-out | ≥ 10 in band | **0**, pass@1 0.371 | tool sequences authored into the target; the answer already sits in the observation, and 18 of 59 are recoverable with no tools at all |
| **P1b** | `search-v0`, unbounded, 7B quant, 47 held-out | ≥ 10 in band | **4**, pass@1 0.029 | instrument, not family — `list_measures` defaulted to the whole song, so 376 of 376 rollouts took one turn and guess-test *beat* tool use (0.213 vs 0.106) |
| **P1c** | `search-v0`, bounded, 4B preferred base, 91 held-out | ≥ 10 in band | **1**, pass@1 0.133 | **the real one** — search happened, tools helped, and the population still is not there |

P1c is the measurement of record. All three of P1b's confounds were removed before it ran: the
observation was bounded to a four-measure page so iteration is required, the pin moved from
`qwen2.5:7b` Q4_K_M to `qwen3:4b-instruct-2507`, and the measure cap went to 32, taking the test
split from two song clusters to three. Search then happened — 6 of 728 rollouts took a single turn
rather than 376 of 376, mean 2.20 — and tools stopped hurting, with guess-test pass@8 at 0.088
against tool-using 0.154.

---

## 2. The mechanism, which is the part worth keeping

A no-go without a mechanism is a shrug. This one has a precise one.

| distance to the answer | n | pass@1 |
|---|---|---|
| 1 | 7 | 0.661 |
| 2 | 7 | 0.518 |
| 3 | 7 | 0.554 |
| ≥ 4 | 70 | **0.000** |

Past the first window the score is exactly zero across 560 attempts. The policy is not quitting
early — it pages at every distance, taking two or three turns in all but 6 of those attempts. It
simply never uses what the second page returns. **Every one of the 480 in-range answers at distance
4 or more fell inside the first window**, at offsets 0, 1, 2 and 3, and never once beyond.

It looks again, and answers from the first look. That is an absence of state across observations.

Two consequences follow, and they are why this closes the question rather than asking for a better
setting of the knob:

- **`distance` is a step function, not a slope.** It indexes how many windows must be traversed, and
  windows are discrete. For a policy that carries nothing across a window boundary the curve is
  near-solved inside the first page and exactly zero past it. A step function has no middle, so no
  value of the knob produces a trainable band. The single in-band case is noise on the boundary.
- **There is nothing to reinforce.** Group-relative methods learn from the spread within a group of
  rollouts on the same prompt. Past the first window every group is all-wrong, carries zero
  advantage, and would be discarded by dynamic sampling. This is the arc's own grounding arriving on
  schedule: Yue et al. (arXiv:2504.13837) is that reinforcement learning with verifiable rewards
  sharpens what a base model already does *sometimes*, and this base does it *never*.

Widening confirmed the shape rather than changing it. Going from cap 16 to cap 32, and from 47 held-out
cases to 91, moved the counts and left the curve where it was.

---

## 3. The transferable finding: a publishing constraint was inherited into a training environment

> **CORRECTED 2026-09-11, same day, after the director challenged it.** This section first claimed
> the binding constraint was task supply and that this corpus structurally lacks it. **That was
> wrong**, and the error is recorded here rather than quietly rewritten, because it is a better
> lesson than the claim it replaces.

The band the arc gated on, pass@8 in [12.5%, 50%], is imported from INTELLECT-2 (arXiv:2505.07291),
which reached it by filtering **285,000 candidate tasks** down to the slice inside it. Kimi k1.5
(arXiv:2501.12599) and DAPO (arXiv:2503.14476) oversample and discard by different means. A band is a
filter, and a filter needs a pool. That much holds.

What does **not** hold is the inference that this repo cannot supply one. `search-v0` draws its plants
from `loadPublishableSongs()`, giving 18 occurrences over 11 songs, and the first version of this
report treated that ceiling as the domain. It is not. **It is a publishing constraint, inherited by
accident.**

Both verifiers are pure functions over raw input:

| Verifier | Signature | Needs the library? |
|---|---|---|
| `inferChord` | `(leftHand: string) => string` | no |
| `detectChord` | `(midiNotes: number[]) => string \| null` | no |

Measured on eight invented voicings that touched no song: **7 of 8 produced agreeing, constructible
gold across 7 distinct chords.** The single miss was an enharmonic spelling, `Bb` against `A#`, which
is a filter case and not a failure.

So a synthetic measure generator emits unbounded sequences with planted chords, scored exactly by the
engines already in the tree. That is rule 1 of the experiment contract — build a known thing, perturb
it, the perturbation is the answer — and it never required a real song.

**The real lesson is about reuse.** Every prior corpus here was built to be *published*: checksummed,
licensed, allowlisted to a curated shelf. Reusing that pipeline to generate *training* tasks silently
imported an 11-song ceiling that the task never had. Dataset machinery and environment machinery look
alike and are not: one must be publishable, the other only has to be scorable.

**The question to ask is what the verifier can score, not what the corpus contains.** The verifier's
domain is the task domain. Asked that way, supply was never the blocker.

### The second blocker, which never had to fire

Worth recording because it would have bitten after the money was spent. Even a GO would have hit the
dispatch's own §9 constraint: the primary was specified as a paired comparison clustered by the leak
unit, and `splitKey` is `song_id`. P1c reached **three** test clusters. Miller (arXiv:2411.00640)
puts roughly 969 questions behind a three-point claim and finds clustered standard errors up to 3×
the naive ones; Hochlehnert et al. (arXiv:2504.07086) measured a floor near 30 seeds. A training run
would have produced a number no honest eval could resolve. **The arc had two independent blockers and
only one needed to fire.**

---

## 4. What survives the null

The dispatch's §1 deliverable was the missing half of the environment, and it exists, is tested, and
is merged.

- `src/dataset/experiment/env.ts` — the three-hook environment contract, mirroring `MultiTurnEnv` so
  the boundary stays portable, plus the L4 scalar reward and `runEpisode`.
- `src/dataset/experiment/mcp-executor.ts` — one real `dist/mcp-server.js` per worker under an
  isolated home, `play_song` never sent, tool errors truncated and returned as observations rather
  than terminating an episode, child-process leak assertion on close.
- `src/dataset/search-v0/` — a family whose gold is constructible and whose tool sequence is *not*
  authored, with a bounded-window action space.
- `src/dataset/experiment/split.ts` — `assertGoldVaries`, the constant-gold gate the v1 corpus paid a
  week to learn, now a function the contract offers instead of a lesson each family relearns.
- `experiments/rollout-arc/scripts/` — the sampled-evaluation instrument the repo did not have:
  `--n` sampling on the grader, an unbiased pass@k scorer, the no-tool guess-test, and a go/no-go
  report whose bars live in tested code.

**The instrument is the durable asset.** Before this arc the repo could not measure pass@k on its own
tasks, which is why two prior fine-tuning arcs discovered their corpus problems from training runs
instead of from a free measurement. It can now, and P0 used it to find that five of the existing
families sit at ceiling once the gold tool transcript is in the prompt while others are recoverable
with no tools at all. **That result is independently useful to the supervised line and was not the
question the arc asked.**

Also fixed in passing: `*.mjs` is now pinned to LF. A shebang followed by CRLF makes vitest's
transform throw, so three test files were red on every Windows checkout and green on CI forever —
the divergence direction CI cannot catch.

---

## 5. What would change the answer

Preregistered here so it cannot be moved later. The arc reopens if, and only if, one of these becomes
true:

1. ~~**Task supply.**~~ **WITHDRAWN 2026-09-11** — this condition said supply was the binding
   constraint and "a licensing and annotation project, not a reinforcement-learning one." Both halves
   are wrong; see §3. A synthetic generator over the existing pure-function verifiers supplies
   unbounded scorable tasks and is a small piece of work. **Supply is no longer a blocker and is no
   longer a reopening condition.**
2. **A base model that carries state across observations.** The distance cliff is a property of the
   policy, not of music. A base that answers correctly from a second page at any nonzero rate turns
   the step back into a slope, and the existing environment measures that in an afternoon for $0.
3. **A difficulty axis graded *inside* the policy's competence.** ⭐ **With §3 corrected, this is the
   whole remaining question.** Everything measured in this arc was deterministic given the case, and
   `distance` crosses the capability cliff rather than grading below it. A synthetic generator can
   vary difficulty on axes that stay inside the band where the policy already scores 0.52–0.66 at
   distance 1–3 — distractor density, near-miss voicings, enharmonic ambiguity — instead of on the
   one axis that steps to zero. **Whether such an axis produces a real in-band population is open,
   unproven, and cheap to measure with the equipment already merged.**

**Explicitly not a reopening condition: inventing further families until one lands in the band.** P1c
refused the small version of that error, declining to filter to distance 1–3 after seeing the
results. Generating families and keeping the one that passes is the same error a level up, and it
would void the frozen bars exactly as thoroughly. The bars were frozen to be binding, including when
they bind against the outcome we wanted.

---

## 6. Standards compliance at close

| Standard | Score | At close |
|---|---|---|
| PIN_PER_STEP | 2 | Every phase wrote its pin before the sampled run and committed the receipt. Still 2: the replay test belonged to P2, which correctly never started. |
| ANDON_AUTHORITY | **3** | The halt fired three times, on its own bars, against the outcome the arc was hoping for, and stopped the spend each time. |
| NAMED_COMPENSATORS | **3** | Nothing irreversible occurred. No pod was created, nothing was published, no schema was registered in the published set, nothing was written under `datasets/`. The compensator table went unused, which is the best outcome available to it. |
| DECOMPOSE_BY_SECRETS | **3** | Task, tool surface and trainer stayed separable throughout; the tool surface was imported and never reimplemented, which is what let P1c change the action space without touching the server. |
| UNCERTAINTY_GATED_HUMANS | **3** | Three director gates, each fired by uncertainty rather than step count, and the closing one framed contrastively and answered. |
| EXTERNAL_VERIFIER | **3** | The reward's verifier was the real server, a separate process. The design's citations were gated by a different model family, 31 checked with 0 fabricated. Every measurement was scored by a program, never by a model. |

**17 / 18**, unchanged, with the single 2 attached to a phase that was correctly never reached.

---

## 7. The honest summary

The arc spent nothing and returned a result. It built the missing half of an environment, built the
measuring instrument the repo lacked, used that instrument to rule out its own corpus and then a
purpose-built family, and diagnosed each failure to a mechanism rather than stopping at a number.

The dispatch pre-wrote the null as shippable precisely so this outcome could be reported without
embarrassment. It is reported.

It also got its own headline wrong on the first pass, and that correction is the most useful thing
here. The three families failed, and that stands. The stated *reason* — that this repo cannot supply
tasks — did not survive one challenge, because the verifiers are pure functions and the eleven-song
ceiling was a publishing constraint the environment inherited without anyone asking whether it
applied. What remains open is narrower and sharper than what the arc set out to test: not whether
tasks exist, but whether difficulty can be graded inside the band where the policy is already
competent, rather than along an axis that steps off a cliff.

The equipment to answer that is merged, tested, and costs nothing to run.

**P2 never started. No paid run was authorised. $0.**
