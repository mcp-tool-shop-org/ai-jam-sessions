# The vocal sound check: a timing footprint before the song

**Job (Director, 2026-10-06):** before a sung song is rendered, let the voice do a
sound check, so the pipeline gets a baseline for that voice, timing included. The
same voice, backend and prompt sing a short calibration phrase several times at
the song's tempo. The vowel onsets are dated with the 40 ms gate's own instrument
(`vocal_clock.measure_events`), so the sound check measures exactly what the gate
will judge.

Stage 1 (this page) is the timing component. Pitch range and key fit, the timbre
baseline and the local transcript gates follow, in that order.

## Why timing is a footprint, not an offset

[`vocal-clock.md`](vocal-clock.md) found that SoulX-Singer's syllable placement
is random from render to render (about ±150 ms), not a steady delay, and that
feeding measured errors back into the next target did not converge. A sound
check that computed one offset and applied it would only add noise. Instead it
reports what kind of error this voice makes and plans around it:

| Output | How | Used for |
|---|---|---|
| Bias and scatter per consonant group | Errors grouped by what precedes the vowel: none, stop, fricative, sonorant | A group is corrected only if its lead is steady: \|mean\| ≥ 10 ms, spread ≤ 20 ms (half the gate), and the same sign in every take. Otherwise nothing is applied, and the reason is recorded. |
| Held vs short notes | The phrase alternates the song's median note length with half of it | Shows whether fast passages miss more than held ones |
| Takes needed | Per length class, the share of syllables within the gate (Laplace-smoothed), then a union bound over the song's syllables | How many takes the word picker needs so every syllable has at least one within 40 ms, at 95 % confidence, known before the song is rendered |
| Detector error | The detector's onsets against vowel onsets marked by ear | What the 40 ms gate can actually promise about the true onset |

## The calibration phrase

Sixteen monosyllables, four per consonant group, at the song's median pitch (so
range does not confound timing), alternating held and short notes so every group
sits on two of each. No two neighbours share a group.

| Group | Words | What the vowel waits behind |
|---|---|---|
| none | oh, all, eye, on | nothing: the syllable starts on the vowel |
| stop | day, key, go, two | a short burst |
| fricative | see, few, show, zoo | a long hiss |
| sonorant | low, may, new, row | a voiced onset that blurs into the vowel |

The phrase is an ordinary score clock (`ai-jam-sessions/score-clock/v1`), so
`export_soulx_target.py` and `soulx_take.py` render it unchanged.

## Two instruments, no hand calibration

The word picker selects takes with the same energy detector the gate then grades
with, so on its own the gate partly checks the detector against itself. A first
version measured the detector against vowel onsets marked by ear, once per voice.
The Director rejected it: anything calibrated by hand has to be redone whenever the
voice, the backend or the song changes. The professional answer is two
instruments of different kinds, one of them validated once against annotated
singing:

| Instrument | What it reads | Role |
|---|---|---|
| **Singing forced aligner** (`onset_aligner.py`, HubertFA, ONNX) | The lyrics are known, so every phoneme is placed; the vowel onset is where the word's first vowel phoneme begins | Primary |
| **Energy detector** (`vocal_clock.measure_events`) | Where the vowel band's energy crosses half its peak | Cross-check, and what the picker places clips by today |

- **The offset between them is measured, not assumed.** The detector reads a little
  later by definition: half-way up the rise, against the phoneme boundary. Each run
  takes the median gap on stop and fricative words, where both should work, and
  judges agreement after removing it.
- **Agreement within ±20 ms is trusted; anything else is flagged** as `disagree`,
  `aligner-only`, `detector-only` or `neither`. The ±20 ms is **provisional** until the
  aligner is validated against hand-annotated singing.
- **Takes needed** is reported both ways: syllables the detector can place, and
  placements both instruments confirm.

The aligner runs from its own environment (`E:/AI/HubertFA`; model v0.0.7 under
`E:/AI-Models/HubertFA`). Its frames are 10 ms, and it hears through a Chinese HuBERT
encoder, with English through its bundled CMU dictionary. Its accuracy on English
singing is a validation question, not an assumption. The validation runs privately
on human-annotated corpora, and no figures from them are published until their
licences are settled (Director, 2026-10-06).

## First run: America the Beautiful, SoulX-Singer, 2026-10-06

Three takes of the calibration phrase at 80 BPM and MIDI 69 (A4), the exemplar's
own prompt voice (`en_prompt`), measured with both instruments. Receipt:
[`scores/receipts/america-the-beautiful/soundcheck.receipt.json`](../scores/receipts/america-the-beautiful/soundcheck.receipt.json).

| Group | Aligner dated | Detector dated | Agree | Median gap | Primary mean | Spread |
|---|---|---|---|---|---|---|
| none (vowel first) | 12/12 | 8/12 | 1/8 | 79 ms | −62 ms | 72 ms |
| stop | 12/12 | 11/12 | 11/11 | 2.5 ms | +51 ms | 82 ms |
| fricative | 12/12 | 12/12 | 10/12 | 3.6 ms | +47 ms | 33 ms |
| sonorant | 12/12 | 12/12 | 7/12 | 18.7 ms | +17 ms | 29 ms |

- **The instruments agree on clean consonants.** The detector reads +11.7 ms from the
  aligner by definition (measured over 23 stop and fricative syllables). After that,
  the median gap is 2.5–3.6 ms.
- **The aligner dates every vowel,** including "on", which the detector never found. On
  "oh", sung from silence, the aligner sits at the note while the detector reads
  93–138 ms late, waiting for half the peak of a slow swell.
- **Both instruments put "all" early** (aligner −121 to −191 ms). SoulX really slides in
  from "key"; it is not a measuring error.
- **Disagreements cluster where they were expected**: vowel-first and sonorant words,
  plus three detector outliers ("row" −274 ms, "zoo" +234 ms, "few" against the
  aligner's +85 ms). They are flagged, not trusted.
- **Takes needed: 4** for every syllable to be placeable, which is the number the exemplar
  passed with. **7** if every placement must be confirmed by both instruments.
- **Timing is still a footprint, not an offset.** With the aligner as primary the spread
  narrows (sonorants 97 → 29 ms, fricatives 64 → 33 ms, once the detector's outliers
  are gone). Every group is still beyond half the gate, so nothing is corrected and the
  picker's placement stays the tool (finding 7).

### A detector defect found on the way (fixed in #70)

`vocal_clock.rise_onset` calls a window silent only when its envelope peak is exactly
zero. A near-silent window, from band-filter ringing or a noise floor, is dated as a
vowel: a dropped syllable would be placed as a clip of nothing. The defect is pinned by a
strict `xfail` in `scripts/test_soundcheck.py`. The fix changes the gate's instrument,
so it is a separate change.

## Research grounding

From the 2026-10-06 study-swarm (four retrieval-only research lanes). Findings
marked *snippet* came from search text and carry no weight on their own.

1. **Accompanists synchronise to the singer's vowel onset, not the consonant, and
   the lead varies with tempo.** Sundberg & Bauer-Huppmann 2007, *When does a sung
   tone start?*, J. Voice 21(3), https://pubmed.ncbi.nlm.nih.gov/16564674/.
   → The vowel is what the gate dates, and the sound check runs at the song's tempo.
2. **Singing synthesizers treat the gap between the written note and the sung
   onset as something to learn.** Hono et al. 2021, *Sinsy*, arXiv:2108.02776;
   Nishihara et al. 2023, arXiv:2301.02262. No paper gives the lead per consonant
   in milliseconds. → The consonant lead is measured per voice, not assumed.
3. **Listeners noticed ~38 ms synchrony differences in sung ensembles and missed
   ~10 ms.** D'Amario, Daffern & Bailes 2019, PLOS ONE,
   doi:10.1371/journal.pone.0218162. → 40 ms is a defensible gate.
4. **Professional quartets scatter 24–28 ms in asynchrony; the spread matters,
   not only the mean.** Wing et al. 2014, https://pmc.ncbi.nlm.nih.gov/articles/PMC4196478/.
   → Scatter is reported per group, and a correction needs a spread within half the gate.
5. **Singing is the hardest onset class for automatic detection** (MIREX 2016,
   *snippet*). → The detector is measured against the ear.
6. **The chance that at least one of k samples is acceptable follows pass@k.**
   Chen et al. 2021, arXiv:2107.03374. → Takes needed: N ≥ ln((1 − q)/S) / ln(1 − p)
   for S syllables at confidence q.
7. **Stochastic duration predictors draw new rhythm on every synthesis** (VITS,
   Kim et al. 2021, arXiv:2106.06103, *snippet*). → The measured scatter is the
   model's nature, so selection, not correction.

## Commands

```bash
PY=E:/AI/SoulX-Singer/.venv/Scripts/python
$PY scripts/soundcheck.py clock  --song scores/america-the-beautiful.score-clock.v1.json --out tmp/soundcheck/america/clock.json
$PY scripts/soundcheck.py render --clock tmp/soundcheck/america/clock.json --takes 3 --out-dir tmp/soundcheck/america     --prompt-wav E:/AI/SoulX-Singer/example/audio/en_prompt.mp3 --prompt-meta E:/AI/SoulX-Singer/example/audio/en_prompt.json
$PY scripts/soundcheck.py analyze --clock tmp/soundcheck/america/clock.json --takes "tmp/soundcheck/america/take-*/take-48k.wav"     --aligner --receipt tmp/soundcheck/america/soundcheck.json
$PY -m pytest scripts/test_soundcheck.py -q
```

`render` needs the SoulX checkout and the local GPU. When g2p_en cannot find its
NLTK data, set `NLTK_DATA` to the folder that holds `corpora/cmudict`.
