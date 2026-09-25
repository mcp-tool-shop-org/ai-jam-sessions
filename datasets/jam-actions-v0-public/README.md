---
license: cc-by-sa-3.0
language:
  - en
language_creators:
  - expert-generated
  - machine-generated
annotations_creators:
  - expert-generated
  - machine-generated
multilinguality:
  - monolingual
source_datasets:
  - original
pretty_name: "AI Jam Sessions — Tool-Use Traces v0 (Public Subset)"
pretty_description: "Public subset of jam-actions-v0: 57 records across 4 classical-piano arrangements by Bernd Krueger (piano-midi.de), pairing 4-measure phrase windows with annotated teaching targets and multi-turn MCP tool-use traces. Designed for grounded tool-use evaluation over symbolic music; released under CC-BY-SA-3.0-DE."
size_categories:
  - n<1K
task_categories:
  - text-generation
  - other
tags:
  - music
  - midi
  - mcp
  - tool-use
  - symbolic-music
  - piano
  - classical
configs:
  - config_name: default
    data_files:
      - split: train
        path: records.jsonl
---
# Dataset Card for jam-actions-v0 (public subset)

**Version:** 0.6.0 — a correction release. It withdraws 58 records whose source arrangements could not be licence-cleared and changes no remaining record. See [Version 0.6.0 correction](#version-060-correction).

**Records built:** 2026-07-11 (0.5.0 cut; unchanged)   **Package built:** 2026-09-25

**DOI:** assigned on publication; see `CITATION.cff`. Earlier versions: 0.5.0 [`10.5281/zenodo.21313954`](https://doi.org/10.5281/zenodo.21313954) and 0.4.3 [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919). Both contain the withdrawn records — cite 0.6.0 for new work. The concept DOI `10.5281/zenodo.20279918` also holds versions of the separate `jam-actions-v1` dataset and currently resolves to them, so cite a version DOI rather than the concept DOI.

## Version 0.6.0 correction

Versions 0.4.x and 0.5.x contained 115 records across 8 compositions, all attributed to Bernd Krueger / piano-midi.de under CC-BY-SA-3.0-DE. That attribution was verified at the level of piano-midi.de's composer pages. In September 2026 the source repository audited its song library from the MIDI bytes themselves and found that four of those songs had been built from files obtained elsewhere:

| Song | Records withdrawn | Where the file actually came from |
|---|---|---|
| `chopin-nocturne-op9-no2` | 18 | midiworld.com, no arrangement credit or licence |
| `chopin-prelude-e-minor` | 12 | bitmidi.com, no arrangement credit or licence |
| `pathetique-mvt2` | 16 | midiworld.com, no arrangement credit or licence |
| `schumann-traumerei` | 12 | midiworld.com, no arrangement licence |

The compositions are public domain, but the arrangements in those files are not licence-cleared, and the records carry them note for note (MIDI events with performance timing and dynamics, REMI and ABC tokens, and piano-roll SVGs). They were therefore withdrawn. **Do not redistribute those records from versions 0.4.x or 0.5.x.**

What changed in 0.6.0, and what did not:

- 57 records remain: the Bach, Mozart, Beethoven (Für Elise) and Debussy (Clair de Lune) arrangements by Bernd Krueger. Every remaining record is byte-identical to 0.5.0.
- The historical eval artifacts are no longer shipped. They were measured on the 115-record composition, several embed withdrawn records, and they remain available in the source repository's history for reproducibility of past claims. The package carries one receipt for this version: `evals/v0.6.0-execution-verification.json`, in which every unique frozen tool call in the 57 records (114) replayed against the live MCP server with 0 failures.
- The packager now refuses to ship any record that its song's library provenance does not clear, or whose source file hash differs from the evidenced file. A provenance change halts packaging.
- The fine-tuned adapters trained on the 0.5.x records have been withdrawn, because their training data included the withdrawn records.

The full audit is `docs/findings/published-dataset-licence-audit.md` in the source repository.

## Dataset Summary

`jam-actions-v0` is a corpus of multi-turn MCP (Model Context Protocol) tool-use traces grounded in real classical-piano MIDI. Each record pairs a short phrase window (typically 4 measures) with an annotated teaching target and a target trace — a turn-by-turn session in which an assistant uses the `ai-jam-sessions` MCP tools to read, analyze, and discuss the phrase. The dataset teaches LLMs to do **grounded tool-use over symbolic music**, not just text generation.

This is the **public subset**: 57 records across 4 compositions, all under CC-BY-SA-3.0 (DE jurisdiction). Songs from the full source corpus that are not included are listed under [Limitations](#limitations).

## Dataset Structure

Top-level files:

- `records.jsonl` — one JSON object per line; the canonical training feed. Each line is a complete record with an additional `split` field (`"train"` or `"test"`) so consumers can use the file without consulting `splits.json`.
- `records/` — the same records as individual JSON files (sorted by id), useful for spot-inspection or downstream tools that prefer one-record-per-file.
- `pianoroll/` — one SVG per record, matched by basename (`<id>.svg` corresponds to `records/<id>.json`).
- `evals/v0.6.0-execution-verification.json` — the standing execution gate for this version: 114 unique frozen tool calls replayed against the live MCP server, 0 failures.
- `splits.json` — train/test split with `held_out_song` pinned. Locked: `clair-de-lune` is the canonical held-out test set; it is NEVER used for training.
- `provenance-verification.json` — per-song URL verification report from Slice 2.5 (filtered to the public songs).
- `manifest.json` — package-scope manifest with `record_count`, `pair_count`, `songs_included`, `splits`, etc.
- `CITATION.cff` — Citation File Format metadata.
- `LICENSE-DATASET.md` — layered-licensing explainer (public-domain compositions + CC-BY-SA-3.0-DE arrangements).
- `ATTRIBUTION.md` — per-layer attribution facts and copy-pasteable credit strings.
- `KNOWN_LIMITATIONS.md`, `DATASET_SCHEMA.md`, `RELEASE_NOTES.md` — scope, schema and version history.
- `VERSION` — single-line package version.
- `checksums.sha256` — SHA-256 sums of every other file in the package, sorted by path.
- `package-inputs.json` — packager-internal contract declaring which files are curated (preserved byte-for-byte) vs generated (rebuilt by `scripts/package-jam-actions-public.ts` on every run). Not consumed by downstream users; included for packager reproducibility.

Each record has these top-level fields: `id`, `schema_version`, `provenance`, `scope`, `observation`, `annotation_target`, `target_trace`, `eval_metadata`. See the source repo's `src/dataset/schema.ts` for the full Zod schema.

### What's in a record

One line of `records.jsonl` is one phrase-window record. Abbreviated below (Clair de Lune, the held-out test song; `…` marks omitted prose/notes):

```jsonc
{
  "id": "clair-de-lune:m001-004:piano:mcp-session:v1",
  "split": "test",
  "scope": { "song_id": "clair-de-lune", "phrase_window": "measures 1-4", "key": "Db major",
             "tempo_bpm": 100, "time_signature": "9/8",
             "musical_phrase_label": "opening atmosphere — introductory phrase" },
  "provenance": { "composer": "Claude Debussy", "arrangement_creator": "Bernd Krueger",
                  "arrangement_license": "CC-BY-SA 3.0", "record_verdict": "public",
                  "training_use_permitted": true /* + source URL, PD status, verifier, verified_at */ },
  "observation": {
    "midi_sidecar": { "ticks_per_beat": 480, "timed_events": [
      { "t_seconds": 0.3, "dur_seconds": 2.4, "note": 65, "name": "F4",
        "velocity": 36, "hand": "right", "measure": 1, "beat": 0.5 } /* … one per note … */ ] },
    "tokens_remi": "…", "tokens_abc": "…", "piano_roll_svg_inline": "<svg…>"
  },
  "annotation_target": {
    "structure": "Opening atmospheric introduction — 9/8 ripple, floating long melody notes",
    "key_moments": ["m1 opening chord with sustained melody", "…"],
    "teaching_goals": ["9/8 triplet pulse must feel like three big beats, not nine", "…"],
    "style_tips": ["…"], "teaching_notes": [{ "measure": 1, "note": "…", "technique": ["…"] }]
  },
  "target_trace": {
    "task_family": "analyze-and-play-phrase",
    "objective": "Read mm. 1–4 of Clair de Lune, view the piano roll, analyze the phrase, …",
    "session": [
      { "turn": 1, "role": "user",      "content": "Show me measures 1–4 of Clair de Lune and describe the opening atmosphere." },
      { "turn": 2, "role": "assistant", "content": "Let me view the piano roll for mm. 1–4.",
        "tool_calls": [{ "tool": "view_piano_roll", "arguments": { "songId": "clair-de-lune", "startMeasure": 1, "endMeasure": 4 } }] },
      { "turn": 3, "role": "tool", "tool": "view_piano_roll",
        "content": { "svg_returned": true, "measures": 4, "rh_notes": 32, "lh_notes": 0 } }
      /* … assistant → tool → assistant, ending in a grounded analysis … */
    ]
  },
  "eval_metadata": { "split": "test", "leakage_check": "…", "eval_eligibility": "…" }
}
```

- **`scope`** locates the phrase — song, measures, key, tempo, meter, and its role in the piece.
- **`observation`** is the phrase itself in three synchronized views: a MIDI sidecar (`timed_events`: note, timing, velocity, hand, measure/beat), REMI + ABC token strings, and a rendered piano-roll SVG.
- **`annotation_target`** is the human teaching layer — structure, key moments, goals, style tips, per-measure technique notes.
- **`target_trace`** is the supervised signal: a multi-turn MCP session where the assistant *calls the inspector tools* on this phrase and answers from their results. This is what teaches grounded tool-use, not prose recall.
- **`provenance`** carries the license + verification chain; **`eval_metadata`** carries the split.

### Load it

The dataset viewer renders every record (nested JSON), and the `datasets` library loads it directly:

```python
from datasets import load_dataset

ds = load_dataset("mcp-tool-shop/jam-actions-v0", split="train")   # all 57 records; split tag is per-row
rec = ds[0]
print(rec["id"], "·", rec["scope"]["musical_phrase_label"])
print("notes:", len(rec["observation"]["midi_sidecar"]["timed_events"]),
      "· trace turns:", len(rec["target_trace"]["session"]))

# clair-de-lune is the locked held-out test song — never used for training:
held_out = ds.filter(lambda r: r["split"] == "test")
```

(`records.jsonl` carries both train and test records, each tagged with its `split`; `splits.json` pins `clair-de-lune` as the held-out song.)

## Reproducibility

A fresh contributor cloning the source repository on any platform (Windows native, macOS, Linux, WSL) can verify the package's integrity and rebuild it:

```bash
# 1. Clone and check out this version's tag.
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions
git checkout jam-actions-v0-0.6.0

# 2. Install deps (pnpm 10+ recommended).
pnpm install

# 3a. Verify package checksums. Exit 0 on success; exit 1 with
#     `[bad line] / [hash mismatch] / [missing on disk]` lines on failure.
pnpm exec tsx scripts/verify-public-package-checksums.ts

# 3b. Rebuild the package from the source corpus. The library evidence gate
#     runs before anything is written and fails closed.
pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-09-25 --dry-run

# 3c. Re-run the standing execution gate: every unique frozen tool call in the
#     package replays against the live MCP server (0 failures required).
#     Requires a machine with an audio device.
pnpm build
pnpm exec tsx scripts/verify-public-package-execution.ts
```

The eval artifacts and release-gate verdicts published with 0.5.0 remain reproducible from the source repository at tag `jam-actions-v0-0.5.0-cut-2026-07-11`; they describe the withdrawn 115-record composition and are not re-measured on 0.6.0.

## Source Data

MIDI arrangements are by **Bernd Krueger**, published at **piano-midi.de** under CC-BY-SA 3.0 (DE jurisdiction). Each file carries Krueger's own copyright credit. The underlying compositions are all in the public domain in both the US and EU (composer death + 70 years elapsed; latest of the 4 composers, Debussy, d. 1918).

Songs included (alphabetical):

- `bach-prelude-c-major-bwv846`
- `clair-de-lune`
- `fur-elise`
- `mozart-k545-mvt1`

## Licensing

This dataset is layered:

1. **Compositions** — public domain (US: published before 1931; EU: composer death + 70 years elapsed).
2. **Arrangements (MIDI sequences)** — Bernd Krueger, piano-midi.de, **CC-BY-SA 3.0 (DE)** — https://creativecommons.org/licenses/by-sa/3.0/de/
3. **Derivative records (this dataset)** — **CC-BY-SA-3.0-DE** — share-alike inherited from the upstream arrangements.

HuggingFace's enumerated license slugs do not include the `-de` jurisdiction; the dataset card YAML uses `cc-by-sa-3.0` and the DE jurisdiction is documented here in the body and in `LICENSE-DATASET.md`.

Attribution requirements when using this dataset:

- Cite **Bernd Krueger** and **piano-midi.de** when using the MIDI bytes or sequences.
- Cite this dataset (see `CITATION.cff`) when using the records, traces, or derived tokenizations.

## Held-out Test Set

**`clair-de-lune`** (12 records) is the canonical held-out test set. It is **never** to be used for training. The remaining 45 records form the train split. The held-out choice is stratified by composer + style era: Debussy's Impressionist (1905) voicing is distinct from every training-set composer's idiom, so leakage from train to test is structurally low.

Split discipline is preserved across the packaging: every pair (`prompt` + `continuation_target`) is in the same split, and `clair-de-lune` was held out from the start of v0.

## Provenance

Two layers of evidence stand behind every record:

1. **Slice 2.5 URL verification (2026-05-17)** confirmed each song's piano-midi.de composer page, licence marker and work listing. The per-song report is shipped as `provenance-verification.json`, filtered to the 4 public songs.
2. **The library evidence gate (0.6.0)** checks each record against the source repository's library provenance block for its song, which is re-derived from the MIDI bytes. A record ships only if the block names a redistributable arrangement licence, the file's own title matches the catalogue, and the record's `observation.midi_sidecar.midi_sha256` equals the evidenced file's hash.

Each record's `provenance` block carries its own `verdict_reason`, `verifier`, `verified_at`, and `arrangement_evidence_url` byte-for-byte from the source corpus. None of these fields are re-derived during packaging.

## Citation

See `CITATION.cff` for machine-readable metadata. BibTeX equivalent:

```bibtex
@dataset{jam_actions_v0_public_2026,
  author       = {mcp-tool-shop-org},
  title        = {jam-actions-v0 — AI Jam Sessions tool-use traces (public subset)},
  version      = {0.6.0},
  year         = {2026},
  license      = {CC-BY-SA-3.0-DE},
  url          = {https://github.com/mcp-tool-shop-org/ai-jam-sessions}
}
```

## Limitations

- **Four songs withdrawn in 0.6.0** (Chopin Op. 9 No. 2 and Op. 28 No. 4, Beethoven "Pathétique" II, Schumann "Träumerei"); see [Version 0.6.0 correction](#version-060-correction).
- **Satie Gymnopédie No. 1** and **Debussy Arabesque No. 1** were never in this public subset. Slice 2.5 could not confirm their provenance against piano-midi.de. Both songs remain in the source repo with `record_verdict: "internal"`.
- **Small and single-arranger.** 57 records over 4 works by one arranger; the train split covers three composers.
- **No vocal records.** v0 ships **only** instrument records.
- **Piano only.** All 4 songs are solo-piano arrangements.
- **English-only annotations.** Teaching-note text is English-only.

## Maintainer

[`mcp-tool-shop-org`](https://github.com/mcp-tool-shop-org) — please open an issue at https://github.com/mcp-tool-shop-org/ai-jam-sessions for questions, corrections, or contributions.
