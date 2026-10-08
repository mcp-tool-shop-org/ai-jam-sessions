---
title: Vocals — sing a whole song on the clock
description: How Amazing Grace and America the Beautiful were sung — a score clock, sixteen takes from a score-conditioned singer, one take per phrase, warp placement, two-instrument timing and pitch gates, and a person listening last.
sidebar:
  order: 4
---

AI Jam Sessions can sing a whole song on top of its own piano, every verse,
with each vowel on its beat and each note checked against the score — and it
**proves it** with receipts before anyone calls it a mix. Amazing Grace and
America the Beautiful, on the [landing page](../../#listen), were made this way
and passed by ear. This page is the route, the levers, and what was measured
along the way.

## The idea in one paragraph

A generator's timestamps are not a clock. Speech models sing at their own rate
and do not hold notes; song models will not take a melody. So the route
separates the jobs: a **clock** says where every syllable and pitch must be,
derived from the song's arrangement on the piano's own timeline; a
**score-conditioned singer** ([SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer),
Apache-2.0) sings from that clock, many times over; the takes are
**assembled** phrase by phrase; and **gates** measure the result — the
artifact, never the plan. Then a person listens. The research behind the
choices is in
[`docs/vocal-singing-study-2026-09.md`](https://github.com/mcp-tool-shop-org/ai-jam-sessions/blob/main/docs/vocal-singing-study-2026-09.md),
and the engineering record in
[`docs/vocal-clock.md`](https://github.com/mcp-tool-shop-org/ai-jam-sessions/blob/main/docs/vocal-clock.md).

## Setup (once)

```bash
# the singer: SoulX-Singer, Apache-2.0, ~2.8 GB weights, about 4 GB of VRAM while it sings
git clone https://github.com/Soul-AILab/SoulX-Singer E:/AI/SoulX-Singer
cd E:/AI/SoulX-Singer
uv venv .venv --python 3.10
uv pip install --python .venv/Scripts/python.exe torch torchaudio --index-url https://download.pytorch.org/whl/cu128
uv pip install --python .venv/Scripts/python.exe "numpy<2" soundfile omegaconf tqdm scipy accelerate "transformers==4.41.2" librosa einops g2p_en nltk huggingface_hub torchfcpe pyworld
hf download Soul-AILab/SoulX-Singer --local-dir pretrained_models/SoulX-Singer
git apply E:/AI/ai-jam-sessions/scripts/patches/soulx-singer-load_wav-soundfile.patch   # Windows: no torchcodec
```

`pyworld` (the WORLD vocoder, MIT) is only for `scripts/planter.py`'s pitch-slip plants,
which shift one note with its spectral envelope kept.

Two more instruments, each in its own place:

- **The aligner** — [HubertFA](https://github.com/wolfgitpr/HubertFA) (Apache-2.0
  code), a singing forced aligner, checks every vowel onset the timing gate
  dates. Its checkout and ONNX model are found through `HFA_ROOT` and
  `HFA_MODEL` (see `scripts/onset_aligner.py`).
- **The listener** — Qwen3-Omni-30B-A3B (Q4 GGUF) through llama.cpp's
  `llama-server`, about 24 GB of VRAM while it runs. It transcribes each phrase
  of each take without the lyrics, so the picker can prefer the takes it
  understood. `QWEN_OMNI_DIR` and `LLAMA_SERVER` point at it, and
  `phrase_scores.py --start-server` starts and stops it for the run.

Rendering can also run on a rented GPU through offrig, so the local card stays
free: [`docs/vocal-offrig.md`](https://github.com/mcp-tool-shop-org/ai-jam-sessions/blob/main/docs/vocal-offrig.md).
On an A40 a full take is about 40 seconds.

## The sound check, before the song

The singer places syllables differently on every render, about ±150 ms, so
the number of takes a song needs is a property of the voice. A sound check
measures it before any GPU time goes to the song: the same voice, backend and
prompt sing a sixteen-word calibration phrase at the song's tempo, four words
for each kind of consonant (none, stop, fricative, sonorant), held and short
notes alternating.

```bash
$PY scripts/soundcheck.py clock   --song scores/<song>.score-clock.v1.json --out tmp/soundcheck/<song>/clock.json
$PY scripts/soundcheck.py render  --clock tmp/soundcheck/<song>/clock.json --takes 3 --out-dir tmp/soundcheck/<song> --prompt-wav … --prompt-meta …
$PY scripts/soundcheck.py analyze --clock tmp/soundcheck/<song>/clock.json --takes "tmp/soundcheck/<song>/take-*/take-48k.wav" --aligner --receipt tmp/soundcheck/<song>/soundcheck.json
```

The receipt gives each consonant group's bias and spread (corrected only when it
is steady), held against short notes, and **takes needed**: how many takes give
every syllable at least one reading within 40 ms, at 95% confidence. It is
measured with the gate's own instruments, the onset detector and the aligner.
On its first run, for America the Beautiful, it predicted four takes, the number
the exemplar had actually needed. The method and the research behind it:
[`docs/vocal-soundcheck.md`](https://github.com/mcp-tool-shop-org/ai-jam-sessions/blob/main/docs/vocal-soundcheck.md).

## The route, step by step

| step | command | what it does |
|---|---|---|
| 1. clock | `pnpm exec tsx scripts/build-score-clock.mjs --song amazing-grace-new-britain --track MELODY --measures 1-66 --rests` | one JSON clock: every syllable's pitch, onset and duration on the player's timeline, held notes and breaths included, sample-rounded at 48 kHz (`--check` guards drift) |
| 2. bed | `pnpm exec tsx scripts/render-piano-bed.mjs --clock scores/<song>.score-clock.v1.json --out <run>/piano-bed.wav` | bounces the piano offline to exactly the clock's length |
| 3. target | `<venv> scripts/export_soulx_target.py --clock … --out <run>/target.json --syllable-words --segment-gap 0.3 --lead-pad 1.0` | the clock as SoulX's input, split into phrase segments at rests, each sung with a second of extra silence in front |
| 4. takes | `<venv> scripts/soulx_batch.py --target <run>/target.json --prompt-wav … --prompt-meta … --takes 16 --out-dir <run>` | loads the model once and renders `take-01` … `take-16`; the second in front of each segment is dropped before the take is assembled |
| 5. the rest | `<venv> scripts/sing_clock.py --clock … --bed <run>/piano-bed.wav --prompt-wav … --prompt-meta … --takes 16 --segment-gap 0.3 --lead-pad 1.0 --aligner --by-phrase --warp --out-dir <run>` | dates every vowel in every take, scores every phrase, picks one take per phrase, places it, gates it, and mixes it if it passes |

What step 5 does, in order:

1. **Measure each take.** The onset detector dates every vowel in every raw take.
2. **Score each phrase** (`scripts/phrase_scores.py`). The local listener
   transcribes it without being given the lyrics, and FCPE reads the pitch of
   its notes. Both are cached per take, so a stopped run resumes.
3. **Pick one take per phrase.** Highest intelligibility first, then the fewest
   wrong notes, then the smallest pitch error, then the most syllables already
   on time. A phrase comes whole from one take, so its tone never changes
   inside it.
4. **Place by warping.** Each run of a take is time-warped (WSOLA) so every
   vowel lands on its beat. Nothing is replayed or skipped inside a phrase, and
   a run ends at its last note plus a short release, so the rest between
   phrases belongs to the piano.
5. **Gate.** Timing: an energy detector dates each vowel and the aligner
   checks it; a syllable fails only when both say it is more than 40 ms off.
   Pitch: FCPE reads every note and pYIN re-reads any note FCPE puts off; a note
   fails only when both say it is off.
6. **Mix**, gain-staged from a meter with a headroom rule, only when the gates pass.

## A person listens last

The gates measure what they can name. A person hears what they cannot:

```bash
python scripts/review_marks.py page --run tmp/vocal-clock/sing/<song> --variant <pick> --out tmp/vocal-clock/review
python scripts/review_marks.py report --review tmp/vocal-clock/review --marks review-marks.json
```

Open the folder in the cockpit's **Review** mode (Open review folder, or start
the cockpit with `?review=<folder URL>`). Before marking, say who you are,
what you are listening on, and set a comfortable volume against the level
check; that starts a session, and every mark carries it. Every mix and the
level check play at one loudness (−23 LUFS), so the volume you set is the
volume you review at. Then play the mix (or the vocal alone) and **M** drops a
mark wherever something sounds wrong, with a category and a note. Export
writes the file `report` reads. (`page` still writes a standalone
`index.html` for a browser without the cockpit.) The report joins each mark
to the second before it: the syllables and their takes, the joins nearby, and
the gates' rows. When nothing there explains a mark, it names the raw take and
the span to listen to.

Every mark records who made it and at what level. A listener's ear settles
*where* something sounds off; naming *what* it is weighs more from training.

| level | where it sounds off | what it is |
|---|---|---|
| listener (no music training) | 1.0 | 0.25 |
| musician | 1.0 | 0.6 |
| vocal or audio professional | 1.0 | 1.0 |
| AI listener, unvalidated | 0.4 | 0.2 |

Your conditions are recorded rather than assumed: the device and the level
check travel with every session. Next, sessions will mix in a few planted
defects and sham edits, unannounced, so each session also measures how
sharp the ear was that day.

The first reviews found two defects no gate could see — audio replayed or
skipped where syllables were cut and moved one by one, and noise the singer
makes at the start of each rendered segment — and both were fixed at the root
(warp placement, and the lead pad).

## The levers

- **Which notes are the tune** — `--track` on the clock builder;
  `--list-tracks` prints every track with its range and first entry.
- **Lyrics** — one token per melody note, syllables joined by `-` inside a
  word (`A-ma-zing`). The hymn exemplars keep theirs in `src/vocal/hymns.ts`.
- **The voice** — the prompt clip and its metadata (`--prompt-wav`,
  `--prompt-meta`). SoulX clones timbre zero-shot. Leave `--auto-shift` off or
  the pitch gate no longer measures the score.
- **How many takes** — the singer is stochastic, about ±150 ms per syllable
  between renders. Sixteen takes gave every phrase of both hymns a take the
  listener understood fully.
- **Phrases** — `--segment-gap` (a rest this long splits the render) and
  `--phrase-gap` (a rest this long ends a phrase for the picker), both 0.3 s.
- **Lead pad** — `--lead-pad 1.0`: the silence each segment is sung with and
  then loses. It must match how the takes were rendered, or the run stops on a
  stale take.
- **Warp** — `WARP_REST_S` (a rest that ends a run), `WARP_RELEASE_S` (0.15 s
  sounded past a run's last note), and the WSOLA frame and tolerance, all in
  `scripts/vocal_clock.py`.
- **The gates** — timing 40 ms, pitch 50 cents fail / 25 warn, global offset 20
  cents, each a constant with its reason beside it. Tighten them if you like; do
  not loosen them to make a run green. `pitch --tracker pyin` keeps the older
  single-tracker gate.
- **Mix** — `--vocal-over-bed-db` (default +4) and `--bed-gain-db` (−9),
  capped by the headroom rule (bed peak + vocal peak ≤ 0.9).

## What the receipts say

Every run leaves receipts (JSON) with the per-syllable timing table, the
aligner's cross-check, the per-note pitch rows with both trackers' readings,
and the sha256 of every artifact, so a claim can be re-checked from the files.
On the two published performances:

| | Amazing Grace | America the Beautiful |
|---|---|---|
| syllables within 40 ms | 109 of 112 | 218 of 224 |
| notes within 50 cents | 136 of 140 | 221 of 224 |
| words the listener heard, per take | 95–100% | 85–94% |
| built from | 16 phrases from 10 takes | 20 phrases from 13 takes |

## Things that were measured so you do not have to

- Cutting every syllable out and moving it alone replays or skips audio wherever neighbours move by different amounts — 77 such joins in one Amazing Grace pick, 166 in America's. Warping a whole run of a take removes them all.
- SoulX makes a loud, pitched sound in the first 0.2–0.5 s of every rendered segment, where the score has a rest. A second of lead silence, dropped afterwards, took segment starts from a median −17 dB to −42 dB.
- On a ±40-cent vibrato, pYIN reads +1.1 c with the full swing, FCPE +0.3 c with the full swing, and SwiftF0 +5.7 c with the swing clipped. On 721 real hymn notes FCPE sits a median 2.7 c from pYIN, at 0.2 s a take against about 3 minutes.
- The listener is faithful on clear singing but fills a famous line in from memory on unclear singing, so it ranks takes and never passes or fails one.
- Speech-to-text word starts are ±100–700 ms on sung audio: good for order, useless for timing.
- Feeding a take's timing errors back into the next target does not converge; the errors are stochastic, not a bias.
