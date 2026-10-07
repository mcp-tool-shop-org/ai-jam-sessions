# Vocal timing as a scientific instrument — the score clock

**Job (Director, 2026-09-04):** make the Comfy vocal *land on the piano*.
Voice quality is out of scope. Gate: every lyric's vowel onset within
**40 ms** of the clock, or the run fails. Executed 2026-09-05 (Fable).

**Result: PASS.** 14/14 events, worst error **5.6 ms** ("a"), the other
thirteen within **1.1 ms**. One speaker, words in clock order, vocal stem and
piano bed both exactly **1,680,000 samples** (35.000 s @ 48 kHz).
Receipt: [`scores/receipts/amazing-grace/vocal-clock.receipt.json`](../scores/receipts/amazing-grace/vocal-clock.receipt.json).

```
id   lyric    t_score  t_vowel   err_ms  stt_ms method  result
v00  A         2.1333   2.1333     -0.0     5.7 rise    PASS
v01  ma        3.2000   3.1999     -0.1       - rise    PASS
v02  zing      6.4000   6.4001      0.1       - rise    PASS
v03  grace     7.0000   7.0000     -0.0   -40.0 rise    PASS
v04  how       8.6000   8.6000     -0.0   -21.0 rise    PASS
v05  sweet    10.2000  10.2000     -0.0   -81.0 rise    PASS
v06  the      13.4000  13.4000     -0.0    39.0 rise    PASS
v07  sound    14.2000  14.2001      0.1  -261.0 rise    PASS
v08  that     17.4000  17.4000     -0.0    40.0 rise    PASS
v09  saved    18.2000  18.1999     -0.1    -1.0 rise    PASS
v10  a        19.8000  19.8056      5.6  -321.0 rise    PASS
v11  wretch   21.4000  21.4001      0.1   -41.0 rise    PASS
v12  like     23.0000  22.9989     -1.1    59.0 rise    PASS
v13  me       24.6000  24.6000      0.0  -701.0 rise    PASS
  onset_abs_ms    PASS  gate 40 ms, worst 5.57 ms
  order           PASS  one_voice PASS (speaker_0)  fits_timeline PASS
  length_match    PASS  vocal 1680000 = bed 1680000 = clock 1680000
```

## The three clocks (measured, not vibes)

The kickoff said two clocks were mixed as one. There were three.

| clock | bar length | source | what it is |
|---|---|---|---|
| **MIDI tick map** | 2.400 s, every bar | `songs/library/folk/amazing-grace.mid`: 384 ppq, 3/4, 75 BPM | the arrangement as written; melody on track `TUBULARBEL` (Bb3 pickup at tick 768) |
| **session-nominal** | 3.2 / 3.8 / 3.2 / 4.0 / 4.0 / 3.2 / 3.2 / 3.2 / 3.2 / 4.0 s | `Session.play`: both hands run per measure, next measure starts when the longer hand finishes | **the piano the Director hears from this repo** |
| hymn grid (`bar.dur/3`) | same bars as above, beats = bar/3 | `realizeVocalTune` | neither of the two |

`bar.dur/3` does **not** equal the MIDI tick map (the kickoff asked for that
proof before using it): the ingest turns 2.4 s bars into 3.2–4.0 s bars, and
hands disagree inside a measure (m2: right 3.8 s, left 3.2 s). That is a
real ingest defect — **out of scope here, reported, not fixed** — the clock
maps where the music *is*, which is the session's timeline.

The kickoff's piano table (3.2, 6.4, 7.0, 8.6, **9.4**, 12.6, 13.4, 16.6 …)
came from `extractMelodyNotes`, which walks right-hand beats only and never
re-aligns to the measure. From m4 on it runs 0.8 s early of what the
session plays (m4 chord at **10.2**, not 9.4). `sessionSchedule` in
`src/vocal/score-clock.ts` is the same arithmetic the player uses, and the
offline bed proves it: every event's piano note-on was issued at exactly its
clock time (0.000 ms late, all 13; render receipt).

## The instrument

```
scores/amazing-grace.score-clock.v1.json      the ONE clock (committed, drift-checked)
pnpm exec tsx scripts/build-score-clock.mjs   derive it (--check = CI drift guard)
pnpm exec tsx scripts/render-piano-bed.mjs    bounce the bed offline, exactly total_samples
python scripts/vocal_clock.py bed-check       piano note-ons vs clock (render receipt + acoustic latency)
python scripts/vocal_clock.py transcribe      fx-dub transcribe graph (ElevenLabs scribe_v2, diarized)
python scripts/vocal_clock.py plan            vowel onsets in the take → cut spans + leads (local, $0)
python scripts/vocal_clock.py place           one Comfy job: Trim + place_exact shape per syllable + AudioMix
python scripts/vocal_clock.py verify          gate the downloaded ARTIFACT → receipt (exit 1 on any FAIL)
python scripts/vocal_clock.py mix             upload bed, fx-dub mix_dialogue_anchored, headroom-staged
```

**Clock derivation.** Each syllable of the lyric is a note of the MIDI melody
track; its `t_sec` is the session-nominal onset of the *same pitch in the
same measure* (nearest position-within-measure; ambiguity fails closed).
Every non-pickup event therefore sits on a piano note-on (`anchor:
piano-onset:m5:left:beat1`). The m1 pickup is the one exception: the ingest
parks it at t = 0 in front of a 2.4 s hole, so the vocal takes it one hymn
beat before the m2 downbeat, inside the piano's rest (`t = 2.1333`, the
Director's placement). `total_seconds` = end of measure 10 = 35.000 s =
the bed = the vocal timeline; `me` holds to the next melody pickup (30.2 s).

**Vowel onset = sung tone start** (Sundberg 2007). Measured as the last
upward crossing of −6 dB below the syllable peak in a **400–3000 Hz band**
(F1–F2). Nasal murmur, stop closures and fricatives all sit 10–20 dB below
the vowel there, which is what makes "ma", "me", "the", "saved a" datable
when the wide-band envelope is flat through them. A legato fallback
(steepest ≥3 dB rise, `method: slope`) exists and was not needed on this
take. The per-event method is recorded in the plan and re-applied on the
artifact, with the measurement window opening 12 ms after the clip's own
cut so the cut edge is never what gets dated.

**Place like fx-dub, stricter.** Seed is a bag of takes. Each syllable is a
`TrimAudioDuration` span (fx-dub's splice primitive) followed node-for-node
by the `place_exact` shape (lead `EmptyAudio` → `AudioConcat` → tail
`EmptyAudio` → `AudioConcat`, so every track is *exactly* `total_seconds`),
summed by `AudioMix` at unity, one job. Nothing passes through a model.
Clips never overlap (10 ms air). `clip_seconds` is what the cloud trimmed,
and the gate measures the downloaded FLAC, not the plan.

## What the run taught (keep)

- **The transcriber is not a 40 ms instrument.** Scribe dated the Seed
  take's "a" 170 ms late, and on the sparse placed stem it put "sound",
  "a" and "me" 260–700 ms early (it lumps words across silence). The
  `stt_ms` column is a cross-check for *order* and *one voice*; the gate is
  energy. Widening the rise search back to the previous word's start is
  what made "a" datable.
- **The oscillator piano sounds 8.2 ms after note-on** (linear attack ramp
  from zero gain; measured at −40 dBFS on the from-silence onsets). The
  Salamander pack is not installed on this rig (`resolvePianoSamplesDir()`
  → null), so the bed is the tuned oscillator grand — the same engine
  `play-comfy-over-piano.mjs` falls back to here. Timing is engine-agnostic;
  the renderer picks the sampled grand automatically where a pack exists.
- **The mix bus sums.** The first mix boosted the vocal +15 dB to sit 4 dB
  over the bed and clipped at 1.0. `mix` now stages from a meter with a
  headroom rule (bed peak + vocal peak ≤ 0.9): bed −9 dB, vocal +5 dB,
  peak 0.61.
- **Live playback is not on the clock.** `Session.play` sleeps beat by beat
  (`setTimeout`), so a recording of it inherits timer jitter; the bed is an
  `OfflineAudioContext` bounce of the same schedule (`suspend(t)` per
  render quantum; every event time is a multiple of 128 samples, so 0.000
  ms late). Both engines accept an injected `audioContext` for this.
- **`tunes.ts` is wrong for this arrangement** (several pitches and
  beats differ from the MIDI melody) — irrelevant to timing, relevant to
  the day pitch is gated (optional P1: F0 cents at the vowel nucleus).

## Second run: held takes (bag of takes), 2026-09-05

The Director heard the first mix and said the voice keeps cutting out. It
does: Seed sang each syllable at speech length (0.2–2 s) into slots of
0.6–5.6 s. Two more Seed takes were generated from the same Kokoro lock at
`speech_rate −50` (0.5x) with a "hold every syllable as a long sustained
note" instruction (`vocal_clock.py seed-take`), each planned leniently (a
take may fail to date a syllable and simply not offer it), and merged per
event by longest clip (`vocal_clock.py merge`; cuts now carry their own
`source_key`, and the place graph loads one `LoadAudio` per take).
Receipts: [`scores/receipts/amazing-grace/held/`](../scores/receipts/amazing-grace/held/).
Gate: **PASS**, worst 4.8 ms; clips now fill 9 of 14 slots.

**Finding (Director, second listen): still breaking up, and the melody is
wrong.** Seed Audio 1.0 is a speech model: no melody input, no note
durations, will not hold a vowel for 3 s, and its pitches are speech
intonation. Prompt wording is not the lever. The clock pipeline places
what a take contains; it cannot put a tune into a take that has none.
Next route (Director-approved): a guide track on the clock from the
repo's score-locked singer, re-voiced by ElevenLabs Speech-to-Speech on
Comfy Cloud, with a pitch gate added — pending an Opus study-swarm on the
September-2026 state of singing models, since the June ruling ("only
DiffSinger honors MIDI") may be stale.

## Third run: SoulX-Singer, score-conditioned, local (2026-09-05) — BOTH GATES PASS

Director's go after the study-swarm ([research grounding](vocal-singing-study-2026-09.md)):
the singer is **SoulX-Singer** (Apache-2.0, MIDI score + lyrics, zero-shot
timbre), run locally on the 5090 (`E:/AI/SoulX-Singer`, uv venv Python 3.10,
torch 2.11 cu128; one local patch: `load_wav` falls back to soundfile because
torchaudio ≥ 2.9 needs torchcodec/FFmpeg on Windows — `scripts/patches/`).

```
pnpm exec tsx scripts/build-score-clock.mjs                      # the clock (unchanged)
<venv> scripts/export_soulx_target.py --clock … --out target.json  # 16 notes tiling 35.000 s
<venv> scripts/soulx_take.py --target … --prompt-wav … --out-dir … # 5.5 s of GPU for 35 s
python scripts/vocal_clock.py verify   (energy gate on the raw take)
python scripts/vocal_clock.py upload / transcribe / repin / place / transcribe / verify
<venv> scripts/vocal_clock.py pitch --verify-receipt … --cross-check
python scripts/vocal_clock.py mix
```

**Raw take** (prompt = the repo's English example voice): pitch gate PASS at
once (global −4.2 c, 14/14 within 50 c) — the tune is New Britain; timing
loose, 9/14 vowels off by up to 182 ms (an SVS sings rubato and puts
consonants where it likes). **Re-pinned** (`repin`: cut 120 ms before each
measured vowel, `place_exact` on `t_sec`): timing PASS worst 31.9 ms, order
PASS, one voice, lengths exact; pitch PASS 14/14 with no warnings, global
−3.7 c, scatter 8.9 c. Receipts: [`scores/receipts/amazing-grace/soulx-01/`](../scores/receipts/amazing-grace/soulx-01/).

Instrument lessons from this run (kept):
- **SwiftF0 is biased on vibrato** (+20.6 c mean on a ±40 c synthetic, clipped
  swing) — pYIN reads +2.8 c with the full swing, so pYIN is the primary
  tracker and SwiftF0 a cross-check column.
- **The next syllable's voiced consonant is already at the next pitch.** A
  nasal /m/ starts ~150 ms before its vowel; the nucleus window now stops
  150 ms before the next onset or "A" reads as an octave split.
- **Valley-based syllable cutting is for speech.** On a sung 1 s vowel it
  cut the wrong place; `repin` cuts a fixed lead-in before the measured
  vowel instead.
- Mix gain landed at vocal −9 dB (the SVS take is hot, peak 0.91); peak 0.36.

Open: timbre — this is the example prompt's voice, not a cast one. The
prompt needs SoulX metadata (lyrics + notes of the reference clip), so the
Kokoro lock or any female clip must go through SoulX's preprocess (its
weights are a separate download) or a hand-written prompt JSON.

### The Director listened, twice — and the joins became the work

"Very good, but the voice breaks a couple of times" → "still breaks at
about 3 seconds in." Measured: the first placement was butt-cut with 10 ms
of air; the second had 15 ms fades but the "A"→"ma" join still jumped,
because the take sings "A-ma" as a **portamento** (Bb3→Eb4 over 180 ms, no
dip) and re-pinning "ma" 152 ms early cut through it. Three things fixed it,
all in `scripts/vocal_clock.py` / `export_soulx_target.py`:

1. **Crossfade splices** (`place --local`, `XFADE_S` 50 ms): the earlier
   clip keeps running from its own source under the next one, never past
   the next syllable's lead-in; the measurement window opens after the
   overlap.
2. **Cut only where the singer articulates.** `export_soulx_target.py
   --syllable-words` writes every syllable as its own word with its own
   phonemes (maximal-onset split: `A | M-EY1 | Z-IH0-NG`), so the model
   re-articulates instead of gliding and a cut between syllables is a word
   boundary. (`repin --candidate` without it picks whole words — the right
   mode when legato inside a word is wanted and the take is tight enough.)
3. **Pick by clarity, then by least shift.** Every measured onset now
   carries `dip_db` (how far the envelope drops in the 100 ms before the
   rise); the picker prefers onsets with ≥ 12 dB of dip, then the take that
   needs the smallest move. Feeding measured errors back into the next
   target was tried and does **not** converge — the singer's placement is
   stochastic (± ~150 ms per syllable between renders), not biased.

**Syllable run (6 takes, `scores/receipts/amazing-grace/soulx-syllables/`):**
timing PASS worst **6.05 ms**, no gaps at any join, order PASS, one voice,
lengths exact; pitch PASS 14/14 (two WARNs at +28 c), global **−2.7 c**,
scatter 14 c. `scripts/sing_clock.py` runs the whole chain in one command.

## A whole song: held syllables, rests and segments (2026-10-07)

The clocks above are one phrase, sung legato: every note is held to the next
onset. A whole song (several verses with the piano between them) needs three
more things, all off by default so the phrase clocks derive byte for byte as
before:

- **Held syllables.** A `_` token in `--lyrics` holds the previous syllable
  onto the next melody note: `A-ma-zing _ grace` sings "zing" across two notes,
  as New Britain does. The clock keeps one event per syllable (one vowel onset,
  so the timing gate and the picker are unchanged) and lists the extra notes
  in the event's `melisma`. The exporter sends them as SoulX continuation
  notes (note_type 3, same phonemes), and the pitch gate judges each note
  against its own pitch (`v03`, `v03.1`, ...).
- **Notated rests.** `build-score-clock.mjs --rests` ends each note where the
  melody track's own note ends (its ticks scaled into the bar's session length;
  not the piano's, which holds its chords through a singer's breath), so a
  breath or an interlude is silence on the clock (`clock.durations: "notated"`), and the exporter writes `<SP>` there.
  A rest inside a held syllable is refused.
- **Segments.** `export_soulx_target.py --segment-gap S` splits the target at
  every rest of at least S seconds. The segments tile the clock, with each
  boundary in the middle of its rest on a 20 ms frame, so the model's merged
  output still lands on the clock. SoulX renders a segment at a time, so its
  memory grows with the phrase, not the song (one 35 s phrase: 2.8 GB to load,
  3.4 GB reserved to render, measured on the RTX 5090).

## The whole-song exemplars (2026-10-07)

The first exemplars sang one phrase each, and both phrases had the wrong
melody. America's arrangement script had written a melody that is not
*Materna*, and Amazing Grace's sung line (`src/vocal/tunes.ts`) leaves *New
Britain* after its fourth note. The pitch gate could not see either: it checks
the singer against our own score. The remake starts from the tunes themselves.

| | Tune | Key, tempo | Form | Sources |
|---|---|---|---|---|
| `america-the-beautiful-materna` | *Materna* (Ward, 1882) | B♭, 92 BPM, 4/4 | piano intro, 4 verses (Bates), held ending: 75 bars, 3:16 | *The One Hundred and One Best Songs* (1919) for melody, chords and verses; *The Everyday Song Book* (1927) cross-check |
| `amazing-grace-new-britain` | *New Britain* | G, 72 BPM, 3/4 | piano intro, 4 verses (Newton 1779 ×3, *Sacred Ballads* 1790), held ending: 66 bars, 2:45 | the Amazing Grace article's engraving and quotations |

Both melodies match Hymnary.org's incipits (`src/vocal/hymns.test.ts` checks
the first 15 notes as scale degrees). The settings are this project's own
block chords, dedicated to the public domain; America's follows the 1919
book's chords. They are not in the song library, which feeds the datasets,
the audited song count and the npm ship list, and no exemplar MIDI file is
committed (the derived-content guard admits a tracked MIDI only as a cleared
library song's): the clock builder and the bed renderer build the arrangement
in memory from `src/vocal/hymns.ts`, which is deterministic.

The arrangement is written for the engine: each piano hand is a gapless chain
of chords (the melody with a chord tone under it, or the bar's chord where the
singer rests; a bass and a tenor per chord), and `realizeHymn` refuses
anything else. So the session clock is the score. The sung line breathes for
half a beat at every phrase end while the piano holds.

```bash
pnpm exec tsx scripts/build-score-clock.mjs --song amazing-grace-new-britain --track MELODY --measures 1-66 --rests
pnpm exec tsx scripts/render-piano-bed.mjs --clock scores/amazing-grace-new-britain.score-clock.v1.json --out <run>/piano-bed.wav
$PY scripts/export_soulx_target.py --clock scores/amazing-grace-new-britain.score-clock.v1.json --out <run>/target.json --syllable-words --segment-gap 0.3
```

(America: `--measures 1-75`.) The clocks: America 224 syllables, 16 breaths,
20 phrase segments; Amazing Grace 112 syllables with 28 held notes, 12
breaths, 16 phrase segments; each has 3 piano passages between verses. Pass
`--segment-gap 0.3` to `sing_clock.py` as well, so its target matches the one
the takes were rendered from.

The first full render (offrig `jam` pod, A40, 2026-10-07: 16 takes in 7
minutes, $0.13 with setup) taught two lyric rules. A word whose dictionary
syllables differ from its notes is sung as one held syllable, so its second
note has no vowel onset to date: America sings "ev-'ry", as the 1919 book
prints it. And a vowel sung straight out of another vowel cannot be dated by
the energy detector: America breathes after the first "A-mer-i-ca!", or its
second "A" was undated in 7-8 of 8 takes and the picker could not place it. The library's own
`america-the-beautiful` is now one verse of the same tune and setting
(`scripts/create-america-the-beautiful.ts`).

## The second instrument in the gate (2026-10-07)

The detector that dates vowel onsets for the gate is the same one the picker
places with, so the gate partly checks the detector against itself, and it is
weakest exactly where a stitched whole-song stem is hardest: phrase ends and
vowels sung out of vowels. `verify --aligner` reads every syllable a second
way, with the singing forced aligner (`onset_aligner.align_phrases`: the clock
split at its rests, each phrase aligned with its known words, each word's vowel
phones mapped onto its syllables).

| Detector | Aligner (after the measured offset) | Syllable |
|---|---|---|
| within 40 ms | anything | PASS (an aligner reading beyond 40 ms is marked `disputed`) |
| beyond 40 ms or undated | within 40 ms | PASS, `rescued` |
| beyond 40 ms or undated | beyond 40 ms | FAIL, `both_off` |
| beyond 40 ms or undated | no answer | FAIL, `unconfirmed` |

The offset between the instruments' definitions (the phoneme boundary vs half
way up the energy rise) is measured on every run from the syllables the
detector passes: 14.8 ms on Amazing Grace, 16.2 ms on America, in line with the
~12 ms the sound check measured. The aligner never fails a syllable on its own:
on whole songs it has gross errors of its own (up to 1.4 s on long phrases, and
a 45 ms median on America's vowel-first syllables).

First whole-song renders, cross-checked: Amazing Grace's two misses ("snares"
+94 ms, "come" +286 ms) are rescued (aligner −14 and +1 ms): timing PASS.
America: "feet", "self" and "ful" rescued; 7 syllables both instruments call
off, all in "stress" and the "A-mer-i-ca" passages.

## The phrase-by-phrase pick (2026-10-07)

The Director heard the first whole-song mixes as jittery at times. The
word-level pick switches takes at almost every word, and each switch is a
crossfade between two renders with slightly different tone and level.
`repin --by-phrase` takes each phrase whole from one take. Syllables are still
moved onto the clock, but only within that take.

Takes are ranked per phrase (`rank_phrases`):

1. **intelligibility**: the share of the phrase's words a local listener heard,
   in order (`phrase_scores.py`: Qwen3-Omni Q4 through `llama-server`, the
   phrase's audio and no lyrics, temperature 0);
2. the fewest notes the pitch gate would fail, then the smallest mean |cents|:
   a wrong note stays audible, while timing is moved onto the clock afterwards
   (ranking timing first took Amazing Grace from 8 pitch fails to 14);
3. syllables already within the gate in the raw take (the fewest moves).

The first take in that order that sings every word of the phrase inside the
word limit is used. A phrase no single take can sing falls back to the
word-level pick, and the plan's `phrases` records each choice.

The listener was checked for reciting from memory before it was trusted to
rank. Half a phrase came back as that half, and swapped halves came back
swapped. But on unclear singing it can fill in a famous line ("America the
beautiful" for "may God thy gold refine"), which is why it ranks and never
gates. Measured on the first renders (one placed vocal each): Amazing Grace
89% of words heard in order, America 75%.

## The listening review (2026-10-07)

The gates measure timing and pitch syllable by syllable, and both picks of the
16-take run cleared most of them. The Director still heard stuttering at times,
and a general report of stuttering gives the next fix nothing to aim at. The listening review
turns an ear into data:

```bash
python scripts/review_marks.py page --run tmp/vocal-clock/sing/<song> --variant phrase16     --variant word16 --out tmp/vocal-clock/review
python -m http.server 8766 --bind 127.0.0.1 --directory tmp/vocal-clock/review
python scripts/review_marks.py report --review tmp/vocal-clock/review --marks review-marks.json
```

The page plays the mix (or the vocal alone, with V), and M drops a mark: the song
pauses, the reviewer picks what it sounded like (stutter, click, wrong word, off
pitch, early or late, volume jump, voice change, breath or noise) and writes a
note, and Enter carries on. The overview shows the switches between takes, and
the close-up shows each syllable coloured by the take it came from. Marks live in
that browser's localStorage. `?test` uses a separate store, so a check of the page
never touches real marks, and Export downloads them.

`report` joins each mark to the second before it (a listener presses after the
sound): the syllables sung there and their takes, any join nearby (a switch
between takes, or air that placement left, from `placed.json`), and the timing
and pitch rows of those syllables. A mark that none of these explains points at
the render itself, and the report names the raw take and span to listen to.

**What the first marks found** (the Director, Amazing Grace phrase pick, 21 marks).
The stutters are made by placement, not by the singer. Each syllable is cut and
moved onto the clock on its own, so neighbours from the same take move by
different amounts (32 joins move the next syllable later, 45 earlier). A clip
runs on in its own source until just after the next one starts. When the next
syllable was moved later, that run-on already holds its start, which then plays
twice. When it was moved earlier, the difference is skipped.
- The marks named this exactly: "Gr Grace" where the join replays 202 ms of
  "grace", "G-God" where it replays 116 ms, and "Amazinmisses grace" where it
  skips 113 ms.
- All seven "honk" findings sit within 250 ms of one of the 15 switches between
  takes, where the outgoing take runs on under the incoming one.
- Joins are dense, so being near one proves little by itself. The evidence is
  that each named sound matches its join's direction (replay or skip).

**Who is listening** (the Director: his ear is a non-musician's, and a trained
ear, human or AI, should carry more weight). Every mark records the reviewer's
name and level, and the report weighs two questions apart:

| level | where it sounds off | what it is |
|---|---|---|
| listener (no music training) | 1.0 | 0.25 |
| musician | 1.0 | 0.6 |
| vocal or audio professional | 1.0 | 1.0 |
| AI listener, unvalidated | 0.4 | 0.2 |

Anyone in the audience can say where something sounds off, and these songs are
for an audience. Naming the cause takes training. An AI listener earns higher
weights by validation against human marks; until then it counts for little.
Marks from several reviewers within 1 s become one finding: "heard" combines
their detection weights (one vote per reviewer), and the categories are voted
with diagnosis weights.

## Warp placement (2026-10-07)

The first review marks (above) traced the stutters to how syllables were placed.
`place --warp` (and `sing_clock.py --warp`) keeps each run of syllables from one
take as one continuous piece of that take and time-warps it, so nothing is cut
inside the run:

- **The map.** Each vowel onset still lands where the plan puts it
  (`src_vowel_onset` plus the clip's shift). The run's edges keep their own
  clips' shifts, and time between anchors stretches linearly (`warp_map`).
- **The stretch.** WSOLA (Verhelst & Roelands 1993) does the stretching: 40 ms
  frames, each slid up to 10 ms to continue the last frame's waveform, added at
  50 % overlap. Pitch and timbre are kept.
- **Between takes.** Runs meet at phrase boundaries. The outgoing take ends at
  its own last syllable and fades, and two takes overlap for no more than one
  50 ms crossfade.

Phrase picks from 16 takes, cut against warp:

| | AG cut | AG warp | America cut | America warp |
|---|---|---|---|---|
| joins inside takes that replay / skip | 32 / 45 | 0 / 0 | 80 / 86 | 0 / 0 |
| stretches outside 0.67-1.5 | - | 0 | - | 13 |
| pitch-gate fails | 5 | 1 | 0 | 2 |
| pitch scatter SD | 27.3 c | 17.0 c | 17.8 c | 18.3 c |
| both_off syllables (timing) | 2 | 2 | 5 | 5 |

**Honks were the singer's.** The second review (Amazing Grace from 21 marks to
6) left honks, and an A/B of raw take / placed vocal / mix put every one in the raw
take, at a boundary between two phrase segments, which a whole song is rendered
in. A run that played on to the next syllable's lead-in carried the noise of that
rest in. A run now also ends at every rest of `WARP_REST_S` in the score, and is
silent after its last note plus `WARP_RELEASE_S` (0.15 s, with a 60 ms fade): a
rest belongs to the bed.

Timing is unchanged, because the vowels land in the same places. The
both-off syllables are the ones neither instrument dates within 40 ms.
America's 13 large stretches sit mostly around breaths and held notes ("A-mer-i-ca").

## Pitch with two trackers (2026-10-07)

The pitch gate used pYIN alone. On a +/-40 c vibrato pYIN reads +1.1 c with the full swing,
but it takes about 3 minutes over a whole take. A three-way check on the R&D seat's advice
(entry 2026-10-07-singing-pitch-trackers in mcp-tool-shop-org/research-and-development)
compared it with SwiftF0 and FCPE:

| | pYIN | SwiftF0 | FCPE |
|---|---|---|---|
| vibrato: mean, swing | +1.1 c, ±40 | +5.7 c, −22..+33 (clipped) | +0.3 c, ±42 |
| 721 real hymn notes: median abs diff from pYIN | — | 8.0 c | 2.7 c |
| notes over 25 c from pYIN | — | 4.0% | 1.0% |
| time per take | 160–190 s | 2–3 s | 0.2 s |

FCPE now reads every note. pYIN re-reads only the notes FCPE puts off (FAIL, untrackable,
unvoiced), over each note's window plus 0.25 s. A note fails only when both trackers put it
off. A WARN does not decide the verdict, so it is not re-read. On the two passed performances
the gate counts what pYIN alone counted, plus one America note (v44 "thy", 108 c sharp on both
trackers), in 11–13 s instead of about 3 minutes.

## Standards compliance

| standard | score | evidence |
|---|---|---|
| PIN_PER_STEP | 2 | Graphs are pure dicts written next to their outputs (`placed-graph.json`); Seed `seed: 42`, scribe `seed: 1`, `temperature: 0`; every artifact carries a sha256 and its cloud key; the clock file is regenerable and drift-checked (`--check`). Model versions are pinned inside the fx-dub builders. |
| ANDON_AUTHORITY | 3 | `plan` refuses when words are out of order or a vowel has no onset; `place` refuses a clip that does not fit; `verify` exits 1 on any FAIL and prints the table; `mix` refuses mismatched lengths; `bed-check` refuses a receipt whose sha256 is not the bed's. Tests cover the refusals. |
| NAMED_COMPENSATORS | 2 | Irreversible calls are Comfy Cloud spends (transcribe ×2, place, mix ×2 this run). Undo = none for credits; the artifacts are content-addressed cloud keys and local files under `tmp/vocal-clock/` (delete to roll back locally; owner: the session that ran it). No publish, no push, no PR in this workflow. |
| DECOMPOSE_BY_SECRETS | 2 | Clock derivation (TS, tested) / bed render (TS) / measurement + gate (Python, tested) / cloud transport (`comfy_rest.py`) / graph shapes (fx-dub) each change for different reasons and live apart. |
| UNCERTAINTY_GATED_HUMANS | 2 | The Director's ear-gate is the only human checkpoint and it comes *after* the mechanical gate passes; the receipt frames what was chosen against the kickoff's table (contrastive: "you probably thought m4 was at 9.4; the player puts it at 10.2 because…"). |
| EXTERNAL_VERIFIER | 2 | The generator (Seed) never verifies itself: onsets are measured by a deterministic detector on the cloud artifact, and order / one-voice by a different model family (ElevenLabs scribe). The energy detector is the same code on take and artifact — an independent second onset method (F0 voicing onset) is the named remediation, owner: the P1 pitch-gate session. |

## Files

- Clock: `scores/amazing-grace.score-clock.v1.json` · derivation `src/vocal/score-clock.ts` (+ tests)
- Receipts: `scores/receipts/amazing-grace/` — verify receipt, bed check, render receipt, plan, placed/mix job records, both transcripts
- Artifacts (gitignored `tmp/vocal-clock/`): `piano-bed.wav`, placed stem `d456b44d…flac`, mix `6b8c08da…flac`, listening copies `amazing-grace-vocal-on-clock-mix.wav` / `amazing-grace-vocal-placed.wav`
- Source take: `tmp/kokoro-lock/amazing-grace-seed.flac` (cloud key `f5cdf630…flac`, 35.04 s)
