# ASPIRE for ai-jam-sessions: the plan

**Status: design only.** No pods, no GPU and no spend until the Director says go.
This plan is modelled on aspire-si's run plans (`docs/runs/2026-10-07-next-runs-plan.md`
in aspire-si): each run has what it measures, a decision rule written before it runs,
and stop conditions.

The Director chose two tracks (2026-10-07):
- **(b) symbolic jam moves**, judged mostly by rules;
- **(a) vocal choices**, judged by the gates, the listener and the human ear.

## Standards compliance

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 1 | Planned, not yet enforced. Each run pins the student, the teachers, the item manifest (sha256), the rule-scorer version and the seed. Enforcement lands with the code in section 4. Remediation: the item-builder and rule-scorer PRs write a manifest that the run refuses to start without (owner: this session, before Run 1). |
| ANDON_AUTHORITY | 2 | Every run has stop conditions that halt it: the scorer error rate, the parse failure rate, an unmeasurable score spread, the offrig deadline. Run 0 can stop the whole track before any GPU time. |
| NAMED_COMPENSATORS | 2 | See the compensators table below. |
| DECOMPOSE_BY_SECRETS | 2 | The rule scorers and item builders stay in ai-jam-sessions, which owns the music and the licences. The trainer changes go to aspire-si. Each side tests its own half. |
| UNCERTAINTY_GATED_HUMANS | 2 | The Director gates the spend, once per run, on the run's offrig_plan worst case. Human ears come in only where the rules cannot decide: detection of audible problems. |
| EXTERNAL_VERIFIER | n/a | No specialized claims. The rule judges are deterministic code with tests. |

### Compensators

| Irreversible action | Undo | State after undo | Owner |
|---|---|---|---|
| `offrig_launch` (rents a pod) | `offrig_shutdown plan_id=<id>`; the watchdog terminates the pod at the plan's deadline | Pod deleted, spend recorded | The session running the run |
| Merging a code PR (either repo) | `git revert` the merge commit, by PR | Previous behaviour | The PR's author |
| Pushing run exports to a public repo | Delete the files by PR (history keeps them, so a derived-content check runs before every push) | Exports gone from the tip | The session running the run |
| Publishing figures | None after readers see them. Nothing is published until the hard rules in section 6 are checked. | n/a | The Director |

## 0. What we know going in

From aspire-si's runs, as its docs state them:
- **Critics mostly learn the mean.** In 2026-10-06-pod-run.md, critics approach the error of always predicting the mean, and one ranks a wrong answer above the right one.
- **Fine-tuning the student first did not help the critic.** 2026-10-07-sft-then-aspire.md, pairwise accuracy: control composite 0.866 vs SFT 0.646; control local 0.724 vs SFT 0.638. One run per condition.
- **The student is not trained toward better answers.** The policy-gradient term is issue #11, planned for aspire-si 1.3.0. Until then, "does the student get better" cannot be tested, and this plan does not test it.
- **The integration surface is text only.** It has a `BaseTeacher` and a `CompositeTeacher` (vote, storing each member's score). It has no programmatic-teacher interface and no human-label loader. It has no predict-the-mean baseline in code. The 9 evaluation dimensions are fixed, and `max_new_tokens` is fixed at 256.

From ai-jam-sessions:
- **Exact rule scores already exist** for reharmonization. `verifyHarmony` (`src/maker/verify-harmony.ts`) applies hard gates for chord fidelity and melody consonance and returns ratios. `verifyVoiceLeading` (`src/compose/voice-leading.ts`) runs 10 rules. `keyConsistency` is in `src/analysis/proxies.ts`.
- **The E-R eval** (`src/maker/er-gate.ts`) has 22 frozen items. Recorded results: Claude 19/22, qwen2.5:7b base 2/22, fine-tunes 0/22.
- **Usable songs: 13.** 15 songs carry a redistributable arrangement licence (Public-Domain or CC-BY-SA-3.0-DE), and two of them are in `EXCLUDED_SONG_IDS`. There are also the two hymn exemplars in `src/vocal/hymns.ts`.
- **The vocal pipeline writes per-syllable labels:** timing (`receipt.json`), per-note cents (`pitch.json`), listener intelligibility (`phrase-scores.json`) and human review marks with reviewer levels (`scripts/review_marks.py`).

## 1. The tracks

### Track (b): symbolic jam moves (reharmonization)

**Task.** Given a melody and its source harmony over N measures (4 to 8), write a reharmonization: one `{intendedChord, voicing}` per measure. This is E-R's own format, so every rule judge applies unchanged.

**Student.** Qwen2.5-1.5B-Instruct, 4-bit with LoRA r16, the same as aspire-si's runs, so the results compare. A 7B student is the fallback if Run 0 shows the 1.5B never produces a gradable answer. Output is JSON text, one object per measure. 8 measures need about 300 tokens, so the fixed 256 has to go (section 4).

**Judges, combined as hard constraints first:**
1. **Rules (exact).** `R` in [0, 10], a fixed formula over:
   - chord fidelity ratio;
   - melody consonance ratio;
   - voice-leading violations (per rule, from `verifyVoiceLeading`);
   - key consistency;
   - "differs from the source on enough measures" (E-R's own condition).

   The formula is written and tested before Run 1 and pinned by version.
2. **Taste (teacher).** `T` in [0, 10] from a local panel (Qwen2.5-32B and Gemma-4-31B, both 4-bit, the panel aspire-si used), asked only about musicality and style fit. The teacher sees only answers that pass the hard gates: an answer that fails a gate gets `R` alone, capped at 4. This keeps the teacher judging taste, not spelling.
3. **Human ears (evaluation only, never training).** A sample of held-out answers is rendered to audio with the existing piano renderer and marked on the review page.
   - A listener's mark counts for detection (something sounds off here).
   - A musician's or professional's category counts for diagnosis, with the reviewer-level weights in `review_marks.py`.

   Humans are too few to train on. They tell us whether the critic's low scores are where people hear problems.

**Data and licence.**
- Items come only from the 13 usable songs plus the two hymns. Every item is built through `evidenceRefusal` (`src/dataset/package-public.ts`), and the builder refuses anything else.
- Windows of 4 to 8 measures, each transposed to all 12 keys. Transposition keeps the rules exact and multiplies the items.
- Withheld songs, quarantined songs and `EXCLUDED_SONG_IDS` never enter an item, a prompt, an export or a log.
- Item files with note content are committed only if they pass the derived-content guard (`src/dataset/derived-content.test.ts`).

**Held-out sets (both are reported):**
- **E-R's 22 frozen items, untouched.** They come from 10 of the 13 songs: Bach BWV 846, Bethena, Elite Syncopations, Maple Leaf Rag, Mozart K545, Peacherine, Pineapple, Solace, The Easy Winners and The Entertainer. Training windows must not overlap any held-out measure, with a 4-measure buffer on each side, **in any of the 12 transpositions**. A training window that is a held-out passage in another key is still a leak.
- **A song-level hold-out.** Two whole songs (proposed: Solace and Bethena) never appear in training. This is the stricter test of generalization. Holding out by song for every E-R song would leave too little to train on.

### Track (a): vocal choices (which take sings each phrase)

**Task.** A text model cannot hear, so the student gets each candidate take's measurements for one phrase as text, and chooses a take with a one-line reason. The measurements per candidate are:
- per-syllable timing errors and the aligner's cross-check;
- per-note cents and the pitch-gate statuses;
- the listener's transcript and intelligibility;
- the stretch the warp placement would need.

This is the decision `rank_phrases` makes by hand today.

**Student.** The same 1.5B, output `{"take": "take-07", "reason": "..."}`.

**Judges:**
1. **Rules (exact).** The chosen take's gate result on that phrase, read from the receipts:
   - syllables inside the 40 ms gate;
   - both-off syllables;
   - pitch fails;
   - mean |cents|;
   - stretches outside 0.67 to 1.5.

   Combined by a fixed, tested formula into `R` in [0, 10]. Every candidate's `R` is known in advance, so this is the second exact target.
2. **Taste.** The listener's intelligibility. It is already measured, and the plan treats it as a teacher, not a gate: it can fill in a famous line from memory.
3. **Human ears.** Review marks on rendered phrase picks, joined by `review_marks.py report`, used only to evaluate. The 37 marks so far found two placement defects that no gate saw: replayed and skipped audio at joins, and noise in the rests between rendered segments.

**Data and licence.**
- Today there are 2 songs × 16 takes × 36 phrases, which makes 576 choice items. That is too few, with too few songs to hold out.
- Before (a) runs, more public-domain hymns get exemplars, built the way `src/vocal/hymns.ts` builds Materna and New Britain, with the melody checked against a cited source. Each gets 16 takes rendered on the offrig jam lane. The aim is at least 8 songs, which makes 2 held out by song possible.
- The takes are our own renders.
- Nothing from the aligner's private validation sets enters this data (see section 6).

**Held-out set.** Two whole songs, never in training.

## 2. What we test (decision rules written before anything runs)

**Test 1, the clean test: can the critic predict a score we can compute exactly?**
- Run on track (b), with the rule teacher alone, so the target `R` is exact and noise-free.
- On the held-out sets the critic **passes** if all of these hold:
  - MAE ≤ 0.8 × the MAE of always predicting the training mean;
  - Spearman ρ ≥ 0.5;
  - pairwise accuracy ≥ 0.70, with the bootstrap 95 % lower bound above 0.5 (`pairwise_accuracy` and `bootstrap_ci` from aspire-si's examples/sft-experiment/lib.py; prompts resampled, ties count half).
- **Reference.** A ridge probe on the same frozen hidden states, fitted to `R`. If the probe passes and the critic fails, the critic's training is the problem. If both fail, the 1.5B's representation does not carry the score, and the student must grow before anything else is learned.
- **Fail rule.** If the critic fails while the probe passes, stop. Report it to aspire-si as the cleanest form of the "learns the mean" finding, and do not spend on Test 2 until the critic is changed.
- The same test is repeated on track (a)'s exact `R`.

**Test 2: do rule and taste judgments separate in the geometry?**
- Train with a composite teacher whose members are the rule teacher and the taste panel. The geometry export then gives one score-rise direction per teacher (`evaluators.professors`).
- **Separate:** |cos(rule, taste)| ≤ 0.5.
- **One axis:** ≥ 0.8.
- **Unmeasurable:** if `R` and `T` correlate above 0.8 across items, report that and draw no conclusion.
- Seeds 42, 43 and 44. The verdict stands only if all three seeds agree.

**Test 3: do detection and diagnosis separate?**
- **Detection half (runnable now):** does the critic's score predict where a listener marks a problem? Items with a listener mark against items without, over the rendered held-out sample.
  - **Passes** if AUC ≥ 0.65 and its bootstrap 95 % lower bound is above 0.5.
  - **Too small to decide** below 20 marked and 20 unmarked items. Today's 37 marks come from 4 mixes of 2 songs, so they are nowhere near this.
- **Diagnosis half (deferred):** it needs a second reviewer at the musician or professional level. Until one exists, it is not run, and the plan says so in every report rather than claiming it.

**Not tested:** whether the student gets better. That needs aspire-si #11. When #11 lands, a Test 4 is written the same way, before it runs.

## 3. Order

**(b) first, then (a), as the Publisher suggested, for these reasons:**
- (b)'s exact scores exist today in tested code.
- (b) needs no audio on the pod.
- (b)'s data needs no new renders.

**One change:** start building (a)'s data while (b) runs. Hymn exemplars and their takes are cheap on the jam lane (about 26 s per take on an A40, $0.10 to $0.13 per 16 takes measured today). Song count is what limits (a), and it does not depend on (b)'s results.

**What (a) reuses from (b):**
- the external-teacher bridge;
- the critic-versus-mean report;
- the geometry reading;
- the item and manifest conventions.

**Run 0 comes before both, at no GPU cost.** Sample the base student's answers on 50 track (b) items and score them with the rules on the CPU. If the rule score's spread (SD) is below 0.5, Test 1 cannot be measured and the student size is changed first. aspire-si's runs found three bugs that only a real run showed, so a rehearsal is worth more than it costs.

## 4. Code needed before any GPU time (each a tested PR)

**ai-jam-sessions:**
1. **Item builder:** `scripts/aspire/build-er-items.ts`.
   - Usable songs only, through `evidenceRefusal`.
   - 12-key transposition.
   - Both hold-outs plus the overlap buffer.
   - A manifest with sha256 per item.
   - Tests:
     - a withheld song is refused;
     - no training window touches a held-out measure or its buffer;
     - no transposed training window is a transposition of a held-out passage.
2. **Rule scorer CLI:** `scripts/aspire/rule-score.ts`. It reads an item and an answer as JSON and writes `R` plus every component as JSON. Tests pin known answers to known scores: E-R's gold and Claude answers, and malformed JSON, which scores 0 and is never a silent default.
3. **Taste rubric and prompt** for the local panel. It gives a deterministic text rendering of the measures and parses strict JSON. A parse failure is an error, never the 5.0 fallback aspire-si's runs found.
4. **Track (a):**
   - `scripts/aspire/choice-items.py` turns receipts into per-phrase prompts.
   - `choice-score.py` computes the exact `R` from the receipts.
   - Hymn exemplars for at least 6 more public-domain hymns.

**aspire-si** (aspire-si's maintainer owns these; filed there as issues, not written from here):
1. **An `ExternalTeacher`.** `evaluate` runs a command and reads its JSON score. `challenge` turns the first failing rule into a challenge, for example "measure 3: the voicing does not spell Am7". The rule teachers in integrations/code and integrations/isaac show the pattern, but they use their own interfaces, not `BaseTeacher`.
2. **Domain dimensions.** Configurable score dimensions instead of the fixed 9-member enum, so the geometry names rule and taste directions honestly.
3. **A configurable `max_new_tokens` for the student's generation in the trainer.** It is still fixed at 256 in `aspire/dialogue/generator.py` on main. `eval_heldout` is already configurable.
4. **A critic report on held-out items:** MAE against the mean baseline, Spearman, pairwise accuracy with bootstrap CI, written into the run's exports.
5. **A `--seed` CLI flag, for convenience only.** Configs already take a top-level `seed:`, which reaches `torch.manual_seed` and the dialogue seed, and `seed_configs.py` is on main (5ffbbc9).

## 5. The offrig lane

**Lane rules:**
- the lane alias is `offrig-ai-jam-sessions`, with tunnel port 11500;
- start the side-car with `OFFRIG_SIDECAR_PORT` and `OFFRIG_EXPECT_PROJECT=E:/AI/ai-jam-sessions`;
- check that `offrig_status` reports that project;
- pass `plan_id` to put, exec and get;
- run one live plan at a time;
- never call port 11439;
- never touch another lane's pod.

| Run | What | Profile | Teacher on the pod |
|---|---|---|---|
| 0 | Base student's score spread | none (CPU, local) | none |
| 1 | Test 1 on (b), rule teacher only, 3 seeds | `jam` (A40 first, 48 GB) | rule scorer (Node on the pod) |
| 2 | Test 2 on (b), rule + taste panel, 3 seeds | `job` (1× RTX PRO 6000, 96 GB, $2.09/hr as aspire-si measured) | rule scorer + 2 × ~31B at 4-bit |
| 3 | (a) data: hymn takes | `jam` | none (SoulX-Singer) |
| 4 | Tests 1 and 2 on (a) | `jam` for rule only, `job` with the listener | rule scorer; Qwen3-Omni Q4 for taste |

**Budget.** These runs need their own cap in this project (`offrig budget` in E:/AI/ai-jam-sessions, set by the Director). The cap the Director approved for aspire-si's own plan does not cover them. The cap is set after Run 0 and the code in section 4 are done, priced from `offrig_plan`.

**Hours and cost.** aspire-si has no per-step costs yet. Its measured runs:
- about 50 min for a local-teacher run and 80 min for a composite run, on 32 prompts;
- its next-runs plan expects about 2.9 h and $6.1 per pod.

This plan prices nothing until those per-step costs exist. Each run's expected and worst case comes from `offrig_plan` at that point, and the Director approves on the worst case. One thing is certain from the measured rates: rule-only runs on the `jam` profile cost a fraction of `job` runs.

**Stop conditions (every run):**
- the offrig deadline, which the watchdog enforces;
- the rule scorer erroring on more than 1 % of answers;
- answer JSON failing to parse on more than 5 %;
- the rule score's spread on the first 50 scored answers below 0.5 (Test 1 would be unmeasurable);
- the plan's worst case reached;
- the geometry export not written after the first epoch. A run that cannot be read is not worth finishing.

## 6. Hard rules

- **Nothing from the aligner's private validation sets is published:** no figures, items, exports, logs or reports.
- **Withheld songs stay out.** Only songs that pass `evidenceRefusal`, minus `EXCLUDED_SONG_IDS`, plus the public-domain hymn exemplars, may enter an item. Quarantined songs never do.
- **The derived-content guard runs before anything is committed or pushed:** items, exports, reports. Note-level or measurement-level content keyed to an uncleared song is a stop.
- **No Ollama Cloud.** Teachers are local models or models on the pod.
- **No spend without the Director's go,** per run, on the `offrig_plan` worst case.
