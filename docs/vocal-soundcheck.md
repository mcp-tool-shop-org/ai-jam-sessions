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

## Measuring the detector against the ear

The word picker chooses takes with the same detector the gate then grades with.
Without an independent reference the gate partly checks the detector against
itself. Automatic onset detection is weakest on singing (finding 5), so the
calibration phrase is hand-marked once per voice and backend:

1. `soundcheck.py label-page` writes one self-contained HTML file with the takes
   embedded. It shows a spectrogram and waveform around each syllable and plays
   the window. **Neither the score time nor the detector's answer is shown**, so
   neither can pull the ear.
2. Click where the vowel starts, nudge with the arrow keys, and mark "can't tell"
   where it is unclear. Marks save in the browser; *Download labels* writes the file.
3. `soundcheck.py detector-error` compares the two and reports the mean, spread
   and maximum of detector minus ear, and the *effective* gate:
   40 ms − (|mean| + 2 × spread).

## First run: America the Beautiful, SoulX-Singer, 2026-10-06

Three takes of the calibration phrase at 80 BPM and MIDI 69 (A4), the exemplar's
own prompt voice (`en_prompt`). Receipt:
[`scores/receipts/america-the-beautiful/soundcheck.receipt.json`](../scores/receipts/america-the-beautiful/soundcheck.receipt.json).

| Group | Dated | Clear onset | Mean error | Spread | Raw within 40 ms |
|---|---|---|---|---|---|
| none (vowel first) | 8/12 | 2/12 | −55 ms | 149 ms | 0/12 |
| stop | 11/12 | 11/12 | +56 ms | 83 ms | 5/12 |
| fricative | 12/12 | 11/12 | +67 ms | 64 ms | 5/12 |
| sonorant | 12/12 | 4/12 | −34 ms | 97 ms | 8/12 |

- **Takes needed: 4.** That is how many the word picker needs for every one of the
  song's 14 syllables to have a datable vowel, at 95 % confidence. It is exactly the
  number of takes the exemplar was built from when it passed. Six are needed if every
  syllable must have a *clear* onset, and fourteen if placement were not there
  (raw timing within 40 ms).
- **What usable means.** The picker moves each clip so its vowel lands on the clock
  (`repin_words`), so raw offsets do not fail the gate. A syllable is usable when its
  vowel can be dated, and preferred when the onset is clear (a dip of 12 dB or more).
  Raw offsets are still reported, as the consonant lead and the size of the shift:
  79 ms on average, 274 ms at most here.
- **Consonant lead.** Stops and fricatives land late, as the consonant pushes the vowel
  back. Every group scatters far beyond half the gate, so nothing is corrected and
  selection stays the tool (finding 7).
- **The risk is the vowel-first word.** "on" was never dated in three takes, and the
  vowel-first and sonorant words are mostly unclear: a legato voice blurs into the
  vowel with no dip before it.
- **Readings to settle by ear.** Several vowel-first words read 150–234 ms *early*
  ("all", "eye"), which is implausible for a vowel. The hand marks will show whether
  the detector dated the previous syllable's tail.

### A detector defect found on the way

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
$PY scripts/soundcheck.py render --clock tmp/soundcheck/america/clock.json --takes 3 --out-dir tmp/soundcheck/america \
    --prompt-wav E:/AI/SoulX-Singer/example/audio/en_prompt.mp3 --prompt-meta E:/AI/SoulX-Singer/example/audio/en_prompt.json
$PY scripts/soundcheck.py analyze --clock tmp/soundcheck/america/clock.json --takes "tmp/soundcheck/america/take-*/take-48k.wav" \
    --receipt tmp/soundcheck/america/soundcheck.json
$PY scripts/soundcheck.py label-page --clock tmp/soundcheck/america/clock.json --takes "tmp/soundcheck/america/take-*/take-48k.wav" \
    --out tmp/soundcheck/america/label.html
$PY scripts/soundcheck.py detector-error --clock tmp/soundcheck/america/clock.json --takes "tmp/soundcheck/america/take-*/take-48k.wav" \
    --labels soundcheck-labels.json --receipt tmp/soundcheck/america/detector-error.json
$PY -m pytest scripts/test_soundcheck.py -q
```

`render` needs the SoulX checkout and the local GPU. When g2p_en cannot find its
NLTK data, set `NLTK_DATA` to the folder that holds `corpora/cmudict`.
