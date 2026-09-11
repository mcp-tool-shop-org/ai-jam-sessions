# P1d — `synth-v0`: a generated family, graded inside the competence band

**Paste target:** a fresh Grok-Build session. **Date:** 2026-09-11. **Spend: $0. No GPU.**
**Status:** arc REOPENED by the director. Design locked here; nothing built.
**Design lock of record:** [rollout-layer-dispatch.md](rollout-layer-dispatch.md) — L2, L3, L4, L6, L7 and L9 all still bind.
**Prior phases:** [P0–P1c report](rollout-arc-closing-report.md) · receipts under `experiments/rollout-arc/`.

---

## 0. Standards compliance (the six, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| **PIN_PER_STEP** | 2 | Pin written before the sweep, carrying model tag, generator seed, corpus sha, tool-catalog sha and `dist/mcp-server.js` sha. Not 3 until the replay test lands, which belongs to P2 and P2 does not start here. |
| **ANDON_AUTHORITY** | 3 | The frozen bars in `scripts/p0-report.mjs` halt the phase on their own verdict, as they did three times already. A generator whose gold fails re-derivation halts the build rather than labelling from the recipe. |
| **NAMED_COMPENSATORS** | 3 | §7. Nothing irreversible occurs: no pod, no publish, no registry entry, no write under `datasets/`. |
| **DECOMPOSE_BY_SECRETS** | 3 | The generator changes; the tool surface does not (§3 proves synthetic songs reach the *real* `list_measures`); the trainer is untouched and unstarted. |
| **UNCERTAINTY_GATED_HUMANS** | 3 | One director gate, on the §6 verdict, framed contrastively in §8. |
| **EXTERNAL_VERIFIER** | 3 | Gold is re-derived by two independent engines and dropped on disagreement. Scoring is by program, never by a model. The policy is scored by the real server. |

**17 / 18.**

---

## 1. Why this phase exists, in one paragraph

P1c produced a real result on one axis: along `distance`, the policy pages and then answers
from the first page anyway, so the axis steps off a cliff at the window boundary instead of
grading. The arc was then closed on the theory that no other axis was reachable because the
corpus could not supply tasks. **That theory was wrong.** `inferChord` takes a string,
`detectChord` takes an array of numbers, and neither touches the song library; the eleven-song
ceiling came from `loadPublishableSongs()` and is a *publishing* constraint. So the open
question is not whether tasks exist. It is whether difficulty can be graded **inside** the
band where the policy is already competent, rather than along the one axis that steps to zero.

**P1d builds a generator to answer exactly that, and nothing more.**

---

## 2. The design

**Task shape.** Unchanged in kind from `search-v0`, so the merged environment, reward and
executor are reused rather than rebuilt: *"In `<title>`, what is the first measure at or after
measure N whose left hand is `<chord>`? Answer with a single integer."*

**What is held fixed, and why.** `distance = M − N` is pinned to **1–3**. That is deliberate
and it is the whole point: P1c measured pass@1 between 0.52 and 0.66 there, so the policy is
demonstrably competent, and every case therefore sits *inside* the capability envelope rather
than straddling it. **Distance is no longer the difficulty knob. It is a control.**

**The difficulty axis is distractor confusability inside the visible page.** The policy pages
once, sees four measures, and must decide which one is the target. Graded levels:

| Level | What else is in the page | Why it is harder |
|---|---|---|
| **D0** | target plus unrelated chords | nothing to confuse |
| **D1** | one distractor sharing 2 of 3 pitch classes with the target | partial overlap |
| **D2** | a distractor that is an **inversion** of the target (same pitch classes, different bass) | both engines name a chord **by its bass**, so this is genuinely hard and is not a trick |
| **D3** | D2 plus a distractor one semitone away | two confusions at once |

**Answer range stays wide.** Generate songs of 40–120 measures and draw N at random, so the
gold integer is unpredictable and guessing is weak. This matters: P1b and P1c both found
no-tool leaks where the model emitted a small integer and got lucky. A small closed verdict set
would make that worse, not better.

**Gold is constructible and re-derived, and disagreement is a drop.** Build the measure, then
run both engines. Keep the case only when `inferChord` and `detectChord` agree. The measured
enharmonic class — `Bb` against `A#` — is a **drop**, not a label and not a difficulty level.
This is rule 2 of the experiment contract and `rederivePlant` already models it.

**Clusters are now free, and this closes the arc's second blocker.** One synthetic song is one
independent cluster. Generate **≥ 30 held-out songs** so the clustered bootstrap the dispatch
requires can actually run. P1c reached three clusters and would have failed the eval-resolution
constraint even on a GO.

---

## 3. The integration path, already verified — do not redesign it

**Verified by reading the code path on 2026-09-11. Synthetic songs reach the real MCP tool
surface without reimplementing a single tool, so L2 holds.**

```
stateHome()        reads AI_JAM_HOME (absolute; created on first use)   src/state-home.ts
userSongsDir()     -> <AI_JAM_HOME>/songs                               src/state-home.ts
server startup     initializeFromLibrary(libraryDir, userDir)           src/mcp-server.ts
  userDir branch   loadSongsFromDir(userDir) -> registerSong(song)      src/songs/library.ts
getSong(id)        same registry that list_measures reads               src/songs/registry.ts
McpStdioExecutor   already sets an isolated AI_JAM_HOME per worker      src/dataset/experiment/mcp-executor.ts
```

**So: write synthetic `SongEntry` JSON files into `<AI_JAM_HOME>/songs/` before the executor
spawns the server.** The isolated home means the real library is untouched.

`registerSong` calls `validateSong` and **throws** on invalid or on a duplicate id. Required
fields, read from `src/songs/registry.ts`:

| Field | Constraint |
|---|---|
| `id` | kebab-case, `^[a-z0-9-]+$` — **namespace every synthetic id `synth-…`** so it can never collide with a library song |
| `title` | non-empty string |
| `genre` | one of `GENRES` |
| `difficulty` | one of `DIFFICULTIES` |
| `key` | non-empty string |
| `tempo` | number within `MIN_TEMPO`–`MAX_TEMPO` |
| `timeSignature` | `"N/N"` |
| `durationSeconds` | positive number |

**First task of the phase is to make one synthetic song validate and come back out of a real
`list_measures` call.** If that does not work, stop and report; everything else depends on it.

---

## 4. What to build

1. `src/dataset/synth-v0/generate.ts` — the generator. Seeded and deterministic; same seed, same corpus. Emits `SongEntry` objects plus the case list.
2. `src/dataset/synth-v0/task.ts` — `defineTask`, schema **`jam-actions-synth-v0/1.0.0`**, **not** registered in the published set, `splitKey` is `song_id`.
3. `src/dataset/synth-v0/env.ts` — subclass or reuse `SearchEnv`. The bounded 4-measure page and the parallel cap stay exactly as P1c set them; changing them invalidates the comparison.
4. Tests, mirroring the gates the contract already enforces: gold re-derives from both engines, gold varies on both splits, no `splitKey` straddles the split, the prompt names neither the measure nor the song id, and the schema version is not a published owner's.
5. `experiments/rollout-arc/scripts/synth-learnability.mjs` — the sweep. Reuse `search-learnability.mjs` wholesale where possible; it already runs pass@k **through the rollout loop** rather than the grader, which is mandatory for a multi-turn family.

---

## 5. What to run

Pin first, then sweep. Same model as P1c so the comparison holds: **`qwen3:4b-instruct-2507-q4_K_M`**, `think: false`, T=1, n=8, seed 0+attempt, test split only.

Per difficulty level D0–D3, report:

- sampled pass@1 and pass@8
- the no-tool guess-test at n=8, and the leak count it removes
- the **leak-free in-band count** against the band `[12.5%, 50%]`
- mean tool turns, to confirm search is still happening as it was in P1c

**The deliverable is a curve across D0–D3, not a single number.**

---

## 6. The bars, frozen and unchanged

Reuse `scripts/p0-report.mjs`. Do not edit the bars.

| Check | Need |
|---|---|
| leak-free in-band cases, at **any single** difficulty level | **≥ 10** |
| sampled pass@1 at that level | **< 0.80** |

**GO** if some level clears both. **NO-GO** if none does.

### Why selecting a level here is not the error the arc refused twice

This distinction is load-bearing, so it is written down rather than left to judgement.

- **Refused, and still refused:** generating new task *families* until one happens to pass. That is selection on outcome and it voids the bars.
- **Refused, and still refused:** filtering P1c's `distance` to 1–3 *after seeing* which slice scored well.
- **This phase, which is different:** a single preregistered family with a difficulty axis declared *before* any measurement, swept across its declared levels, reporting every level. Keeping the in-band slice of a measured pass-rate distribution **is the literature's own method** — DAPO's dynamic sampling (arXiv:2503.14476), Kimi k1.5's prioritized sampling (arXiv:2501.12599) and INTELLECT-2's offline pass@8 filter (arXiv:2505.07291) all do precisely this.

The rule that keeps it honest: **D0–D3 are declared in the lock before the sweep runs, and all four are reported whatever they say.**

---

## 7. Compensators (no skip)

| Action | Compensator | Owner |
|---|---|---|
| Synthetic songs written to `<AI_JAM_HOME>/songs/` | isolated per-worker home, deleted on teardown; real library never touched | P1d session |
| MCP server process per worker | explicit kill plus the existing leak assertion on close | P1d session |
| New `schemaVersion` | not registered in the published set; if ever registered, remove the `registerPublishedSchema` line and `published-set.test.ts` re-derives from disk | P1d session |
| GPU spend | **none authorised.** P4 remains unreachable | director only |

Nothing here writes under `datasets/`, publishes anything, or spends money.

---

## 8. Reporting back

Write `experiments/rollout-arc/p1d/RESULTS.md` with the pin, the D0–D3 curve, the leak counts,
the tool-turn distribution, and the verdict against §6. Commit the receipts beside it.

Frame the verdict contrastively, as the dispatch requires:

> *"You probably expect distractor density to behave like distance did. The measurement says X."*

**Three outcomes, all shippable, all pre-written:**

- **GO at some level** → that level is the training population. P2 unlocks *then*, not before, and still under a director gate.
- **All levels above the band** → the family is saturated once distance is controlled, and distance was the only hard axis. A real finding.
- **All levels below the band** → the policy's competence at distance 1–3 does not survive any confusion at all, which sharpens the P1c mechanism considerably.

---

## 9. Do not

- Do not start P2. No replay receipt, no Echo-Trap monitor, no spurious-reward harness until there is an in-band population to train on.
- Do not rent a pod or spend a dollar.
- Do not reimplement any of the 54 tools. The whole of §3 exists so you do not have to.
- Do not change the bounded page size, the parallel cap, or the pinned model. Those are controls.
- Do not edit the bars in `p0-report.mjs`.
- Do not register the schema in the published set or write under `datasets/`.
- Do not label a case whose two engines disagree. Drop it.
- Do not report only the level that looks best.

---

## 10. Known risk, stated up front

**Synthetic-to-real transfer is unproven.** A model that learns to discriminate confusable
voicings in generated measures may not transfer to real repertoire. That is a genuine
limitation and it is deliberately out of scope: this phase asks only whether a trainable
gradient exists anywhere in this task shape. If the answer is yes, transfer becomes the next
question and it is answerable against the existing 11-song shelf as a held-out set — which is,
at last, the right job for a shelf that size.
