# Receipts: the published sung exemplars and the voice-gate evaluation (2026-10-08)

Copied from the runs that made the recordings on the landing page, so the numbers in the
README, the handbook and the R&D entries have a committed source. The audio and the
per-frame arrays are not here. They are takes of the SoulX-Singer example voice, whose
licence for redistribution is not stated (see `docs/sung-exemplar-method.md`).

## `<song>/sung-2026-10-08/`

One folder per published hymn: `amazing-grace-new-britain`, `america-the-beautiful-materna`
and `battle-hymn-of-the-republic`.

| File | What it holds | Fields worth charting |
|---|---|---|
| `receipt.json` | Timing gate | `table[]`: per syllable `err_ms`, `method`, `aligner_err_ms`, `pass`; `checks.aligner_cross_check` |
| `pitch.json` | Pitch gate (FCPE, with a pYIN recheck of the misses) | `rows[]`: per note `midi`, `cents_median`, `cents_sd`, `voiced_fraction`, `status`; `global_offset_cents`, `scatter_sd_cents`, `recheck` |
| `plan.json` | Phrase-by-phrase pick | `phrases[]`: `take`, `rank`, `intelligibility`, `pitch_fails`, `mean_abs_cents`, `within_gate`/`of`; `cuts[]` per syllable source |
| `phrase-scores.json` | Every take scored per phrase by the listener (Qwen3-Omni) | `takes.<take>.phrases` |
| `voice-gate.json` | One-voice gate | `verdict`, `stats`, and each flag list |
| `mix.json` | The mix settings | |
| `piano-bed.receipt.json` | The rendered piano bed | |

The `vocal` and `clock` fields name the run folder each receipt was made in (`tmp/…`,
not committed).

Amazing Grace's `voice-gate.json` was rerun on 2026-10-09 with the current gate, on the
same placed vocal. The other two are from the publishing runs. The Battle Hymn's two
two-voice flags (0:42 and 2:18) stand; the same pattern shows in its raw takes, so they
are read as model artefacts.

## `voice-gate-eval-2026-10-08/`

How the one-voice gate was judged against the Director's listening marks.

- `director-marks-2026-10-07.json`: the marks, as times and categories only (52 marks over
  8 mixes; `noise` = a honk).
- `score.py` and `score.txt`: matching flags to marks within 1.5 s. The result: 20 honk
  marks, 3 caught; 6 flags, 3 of them on a mark. Those three are all the voice-in-rest
  flags. The other three were on the old Battle Hymn mix: the silent "jah" and the two
  two-voice flags. `score.py` needs the per-frame `.npz` files, which are not committed.
- `eval.sh` and `eval.log`: the runs behind `score.txt`. The log predates the silent-note
  threshold's move from 0.25 to 0.2, so it shows silent-note flags that `score.txt`, made
  at 0.2, does not.
- `batch.py` and `takes-summary.json`: the gate over the 96 raw takes, per take.
