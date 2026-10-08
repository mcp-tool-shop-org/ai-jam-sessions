# Making a sung exemplar: the method

How a hymn becomes a sung exemplar: a piano arrangement, a singer, and the interpretation
that makes it more than notes in time. The Director approved the first three made this way
(2026-10-08): *Battle Hymn of the Republic* ("perfect now"), *Amazing Grace* ("sounds great")
and *America the Beautiful* ("Perfect"). This page is the order of work. The pieces have
their own pages: [vocal-clock.md](vocal-clock.md) (the clock, the gates, placement),
[vocal-offrig.md](vocal-offrig.md) (rendering takes on a rented GPU) and
[vocal-soundcheck.md](vocal-soundcheck.md) (choosing the voice and key).

## Standards compliance

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 2 | The arranger's model, temperature, reasoning effort, system prompt and brief are recorded by sha256 in `src/vocal/arrangements/source/<id>/meta.json`. The SoulX-Singer commit and weights are pinned by the pod setup. Takes are recorded by target sha256. Not pinned: the OpenRouter provider behind a model id, which can change between calls. |
| ANDON_AUTHORITY | 2 | Each step stops on a defect. The arrangement stops if LilyPond reports any error or warning. The import stops if a verse's melody is not in the piano. The score clock refuses a sung note with no piano note under it. `sing_clock.py` refuses a stale take. |
| NAMED_COMPENSATORS | 2 | Table below. The two spends (OpenRouter and the pod) have no undo; their compensators bound the loss before it happens. |
| DECOMPOSE_BY_SECRETS | 2 | The arrangement (what is played), the hymn (what is sung), the interpretation (how it is shaped), placement and the mix live in separate modules, and each changes without the others. |
| UNCERTAINTY_GATED_HUMANS | 2 | The Director's ear is the gate where machines cannot judge: the arrangement (a piano-only preview before any take is rendered) and the finished mix. Spending past an approved estimate asks first. |
| EXTERNAL_VERIFIER | n/a | No specialized claims. The checks are mechanical (compile, melody match, timing and pitch gates). |

### Compensators

| Irreversible action | Undo | State after | Owner |
|---|---|---|---|
| An OpenRouter arrangement call (spends) | None once sent. Bounded first: `--yes` is required, the worst case is printed, `max_tokens` caps it. | The cost is recorded in meta.json; the answer is kept even when rejected. | The session running it; the Director approves the estimate. |
| `offrig_launch` (rents a pod) | `offrig_shutdown plan_id=<id>`; the watchdog terminates it at the plan's deadline. | Pod deleted, spend recorded. Fetch takes with `offrig_get` first: the pod's disk goes with it. | The session; the watchdog as backstop. |
| A local GPU job (scoring) | Stop it, then tell the Publisher "card free". | The card is free and the Publisher knows. | The session. |
| A merged PR wiring a hymn to its arrangement | A revert PR. | The hymn sings over its old bed again. | The session. |
| Publishing a recording on the landing page | Republish the previous audio and site data. | The page as before. | The Director decides publishing. |

## The steps

### 1. The hymn

The tune, its harmony and every stanza live in `src/vocal/hymns.ts`, each from a cited
public-domain source. The written key is `sourceKey`, and `transpose` moves it to the sung
key, chosen by ear in a sound check ([vocal-soundcheck.md](vocal-soundcheck.md)). The voice
is the SoulX-Singer zh prompt for all three hymns so far.

### 2. The arrangement

```bash
npx tsx scripts/arrange-hymn.ts --song <hymn id>          # write the brief, print the worst case
npx tsx scripts/arrange-hymn.ts --song <hymn id> --yes    # ask, compile, import, check
```

- The brief is generated from the hymn: the melody bar by bar in LilyPond, its chords,
  every stanza, a texture plan that builds from verse to verse, and rules a machine can
  read (no `\partial`, the melody in every pass at its written time).
- The arranger is Kimi-K3 (`moonshotai/kimi-k3`) on OpenRouter. The Director approved it
  for arrangements only on 2026-10-08. The key is `OPENROUTER_API_KEY`.
- Measured cost: Amazing Grace $0.30 (3 minutes), America the Beautiful $1.01 (9 minutes).
  The worst case at `max_tokens` 200,000 is $3.00.
- If the answer does not compile, fix it by hand in `<id>.ly`, describe the change in
  meta.json's `fixes`, and rerun with `--compile`. Amazing Grace's one fix: `\key g major`
  to `\key g \major`.
- Then set `arrangement: "<id>"` on the hymn.

### 3. The interpretation

The hymn's `interpretation` holds the research seat's values (`src/vocal/interpretation.ts`):
verse tempos, line length and arch, the stressed beats and their dB, the coda's end tempo.
Ask the research seat for a new hymn's values, giving its meter, written tempo, verse count and
character. A hymn with no `shape` gets the Battle Hymn's.

```bash
npx tsx scripts/build-score-clock.mjs --song <hymn id>      # the clock: refuses an unmatched sung note
npx tsx scripts/render-piano-bed.mjs --clock scores/<hymn id>.score-clock.v1.json --out <run>/piano-bed.wav
```

The bed is the Director's first listen: send it as an MP3 before any take is rendered.

### 4. The takes (rented GPU)

```bash
python scripts/export_soulx_target.py --clock scores/<hymn id>.score-clock.v1.json --out <run>/target.json \
    --syllable-words --segment-gap 0.3 --lead-pad 1.0
```

Then render 16 takes on an offrig `jam` pod, as in [vocal-offrig.md](vocal-offrig.md).
Several songs share one pod: chain each batch's songs in one command. Measured on
2026-10-08: about 165 s per 267 s Battle Hymn take on an RTX A6000, $0.30 for 16.

### 5. Scoring (local GPU, through the Publisher)

Tell the Publisher session first: what runs, how long, and the VRAM (about 25 GB peak for
the Qwen3-Omni listener). `sing_clock.py` scores, picks phrase by phrase, places and gates:

```bash
NLTK_DATA=E:/AI/SoulX-Singer/nltk_data python scripts/sing_clock.py --clock scores/<hymn id>.score-clock.v1.json \
    --bed <run>/piano-bed.wav --prompt-wav <zh_prompt.mp3> --prompt-meta <zh_prompt.json> --out-dir <run> \
    --takes 16 --segment-gap 0.3 --lead-pad 1.0 --aligner --by-phrase --warp
```

Tell the Publisher "card free" when it ends. It exits "NOT A MIX" until the transcript gates
exist; read the gates instead (below).

### 6. The mix

```bash
python scripts/vocal_clock.py mix --local --bed <run>/piano-bed.wav --vocal <run>/placed-local.wav \
    --plan <run>/plan.json --out-dir <run> --out-info <run>/mix.json --vocal-over-bed-db 4 --bed-gain-db -9
```

The mix applies the per-syllable emphasis from the clock. Placement holds a phrase's last
note into the rest after it and releases it over 180 ms, with 0.2 s of breath before the
next onset: phrase-final punctuation, in the KTH rules' terms. That hold is what turned the
Director's "it reads like a stutter" into "perfect".

### 7. What to read before the Director listens

- **Timing:** on the Battle Hymn, 283 of 414 syllables were within 40 ms. 120 of the misses
  were short notes that float on the singer's own timing by design (`WARP_MIN_ANCHOR_S`).
  Long notes missed 11 times.
- **Pitch:** notes off on both trackers (the Battle Hymn: 64 of 424, overall offset −3 cents).
- **The voice:** the air left at joins (the placement log) and the envelope at phrase ends,
  where a cut to digital silence would be heard as a stutter.
- **One voice** (`scripts/voice_gate.py`, or `sing_clock.py --voice-gate`): a speech-segmentation
  model (pyannote/segmentation-3.0, in its own environment `E:/AI/envs/pyannote`) marks voice in
  a rest apart from any note, two voices longer than a crossfade, and sung notes with no voice.
  Measured 2026-10-08 against the Director's listening marks of 2026-10-07: no flags on the four
  vocals he passed; its 3 voice-in-rest flags were all on his honk marks; it found a nearly
  silent "jah" (−42 dB) at 0:52 of the Battle Hymn. It catches only the honks in long rests (3 of
  20): in a short gap between phrases a honk is voice to it, and telling it from a held vowel
  needs pitch (`scripts/phrase_evidence.py`). It runs on the CPU in about 20 s a song.

### 8. Publishing

Wire the hymn, its clock, its recording and the landing page's data
(`npx tsx scripts/site-hymn-visual.ts`) in one PR, so the page's piano view and its audio
change together.
