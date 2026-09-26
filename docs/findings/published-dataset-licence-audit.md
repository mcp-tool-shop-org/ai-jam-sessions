# Published datasets still carry licence claims the library audit disproved

Audit date: 2026-09-25. Repo `main` at `b015f1d`. The audit was read-only: it read the tree and made GET requests to Hugging Face, Zenodo and GitHub. Nothing was published, pushed or edited. This document is not legal advice; it measures what is published and lays out the options for a decision.

## What was found

The 2026-09-09 library audit (`library-provenance-audit.md`) re-derived every song's `provenance` from the MIDI bytes. Its own text says `datasets/**` was left untouched. Four songs used in the first public dataset turned out to have **unknown** arrangement licences:

| Song | Arrangement source |
|---|---|
| chopin-nocturne-op9-no2 | midiworld |
| chopin-prelude-e-minor | bitmidi |
| pathetique-mvt2 | midiworld |
| schumann-traumerei | midiworld; the file names Robert Finley |

Every record built from them still claims *Bernd Krueger, CC-BY-SA 3.0, piano-midi.de*. Each record's `midi_sidecar.midi_sha256` equals the library file's `midi_sha256`, so the records were built from exactly the files the audit examined.

The compositions themselves are public domain: Chopin died in 1849, Beethoven in 1827 and Schumann in 1856. The exposure is at the arrangement and performance layer.

### Published surfaces carrying the four songs

| Surface | Affected | Published | Removal route |
|---|---|---|---|
| HF dataset `mcp-tool-shop/jam-actions-v0` (0.5.1, cc-by-sa-3.0) | **58 of 115** records, plus 58 piano-roll SVGs | 2026-07-09, card 2026-09-08 | new commit; old revisions stay reachable |
| Zenodo v0.4.3 `10.5281/zenodo.20279919` | **58 of 115** (tar.gz + zip) | 2026-05-19 | past the 30-day owner-delete window |
| Zenodo v0.5.0 `10.5281/zenodo.21313954` | **58 of 115** (tar.gz + zip) | 2026-07-11 | past the 30-day window |
| HF dataset `mcp-tool-shop/jam-actions-acoustic-v0` (1.0.2, cc-by-sa-3.0) | **36 of 108** (Träumerei) | 2026-09-08 | new commit |
| HF Space `mcp-tool-shop/jam-actions-explorer` (cc-by-sa-3.0) | **4 of 8** examples carry `notes` plus the Krueger attribution | 2026-07-12 | new commit |
| HF model `mcp-tool-shop/jam-ft-v1-qwen25` (cc-by-sa-3.0) and GitHub release `jam-ft-v1-adapters` (767 MB, 0 downloads) | Trained on 259 of 494 training lines from three of the songs, plus 36 validation lines from the fourth. The card calls the data Krueger CC-BY-SA-3.0-DE. | 2026-07-11 | delete, make private, or correct the card |

Every public cut of v0, from 0.4.0 to 0.5.1, has the same 115 records with the same 58 affected. The HF copy's 274 checksums equal the repo's.

**Clean:**
- `jam-actions-v1` 1.0.0 / 1.1.0 and `jam-actions-v1-probe`, together with the four v1 adapters. They use only allowlisted songs: Krueger CC-BY-SA-3.0-DE Bach, Für Elise and Mozart, plus Mutopia public-domain rags.
- The flags on four composite `songA|songB` compare records were false positives; every song in them is cleared.

**Defects in the clean set:**
- The `jam-actions-v1-qwen25-7b` and `-3b` cards have no `license:` field.
- `composition_year` is `1` on all 237 v1 and probe records.

### What the affected records carry

- **v0-public.** Four-measure windows covering most of each file:

  | Song | Measures covered |
  |---|---|
  | Chopin nocturne | 72 of 123 |
  | Chopin prelude | 48 of 64 |
  | Pathétique II | 64 of 153 |
  | Träumerei | 48 of 64 |

  Each window is a note-for-note copy in three encodings (the MIDI event list, REMI and ABC) plus an inline SVG. The files are performance-style: 93–100% of onsets fall off the 16th-note and triplet grid, and they use 70–105 distinct velocities. That is the timing and dynamics a sequencer or player chose, which is the layer an arrangement right would attach to.
- **acoustic-v0, Träumerei.** Four right-hand pitches of the opening melody, onset times taken from the file, fixed velocity. No audio ships; the record holds a render recipe and a WAV hash.
- **The explorer Space.** 0.9–1.8 KB of `notes` per affected example, plus annotation and trace.
- **The adapter.** Its weights contain no notes by construction; memorisation was not tested. Its training lines include tool results listing up to 101 note tokens.

### Beyond the published datasets: the public GitHub repository

The 2026-09-09 history purge removed MIDI bytes. It did not remove data derived from them. Still tracked, and in history:

| Path | Content |
|---|---|
| `datasets/jam-actions-v0/` (working set) | **88 of 145** records unsupported: the 58 above, plus 30 Debussy/Satie records built from the pre-Mutopia files. The sidecar hashes do not match the current library bytes; the records are marked `internal` but committed. |
| `experiments/finetune-arc-v1/data/` | 295 lines from the four songs |
| `experiments/rollout-arc/p3/runs/er-items.json` | 41 items, 328 measures, **1,819** note tokens of right-hand parts from uncleared files. 40 are non-classical, so their compositions may be in copyright; for example Kern's *All the Things You Are* (1939). |
| `experiments/maker-arc/er-gate/items.json` | 19 items, 152 measures, 1,016 note tokens, same kind |
| `experiments/coverage-v1-sft/data-bare/*.jsonl` | lines from 17 uncleared songs, including two quarantined wrong-song files: scarborough-fair and the-water-is-wide |
| HF dataset `jam-rollout-arc-evals` (apache-2.0) | 75 held-out prompts, one per library song: a chord progression titled with the song (8 chords in the sampled item). Chord symbols only, no notes. |

The E-R files add a **composition-layer** question, which is separate from arrangement licensing. A per-song composition check was not done here.

## Remediation (2026-09-25)

Decided by the Director, who delegated the choice of options to the coordinator; carried out on branch `licence/withdraw-uncleared-records`.

- **In the repository:** `jam-actions-v0` public subset rebuilt as 0.6.0 (57 records) and `jam-actions-acoustic-v0` as 1.1.0 (72 records); a fail-closed library evidence gate in the packager; a test that re-runs the evidence check on every committed published package; the 58 working-corpus records marked excluded; README, handbook, dataset cards and provenance notes corrected.
- **Publication steps that follow the merge:** the corrected packages are pushed to Hugging Face; 0.6.0 is deposited on Zenodo as a fresh record related to 0.5.0 and 0.4.3; the explorer Space drops the four affected examples; the `jam-ft-v1-qwen25` adapters are withdrawn from Hugging Face and the GitHub release; 0.4.3 and 0.5.0 on Zenodo get a public note pointing to 0.6.0, and their files are restricted where Zenodo permits. Each step is recorded below with its outcome as it happens.
- **Not in this change:** the derived experiment files and working-corpus records listed under "Beyond the published datasets" (a separate repository cleanup with its own guard), and any rewrite of git history, which is irreversible and is left to the Director.

### Outcomes (2026-09-25)

Each outcome was checked afterwards from outside, without credentials, unless noted.

| Surface | Outcome | Evidence |
|---|---|---|
| HF dataset `jam-actions-v0` | 0.6.0, pushed from tag `jam-actions-v0-0.6.0` with stale-file deletion: 150 files not in the package were removed from the head | commit `9d69b47`; the head holds exactly the package's 130 files, none from the four works |
| HF dataset `jam-actions-acoustic-v0` | 1.1.0, same method: 36 files removed | commit `79c92fb`; the head holds exactly the package's 80 files |
| Zenodo, 0.6.0 | fresh deposit, version DOI [`10.5281/zenodo.22961580`](https://doi.org/10.5281/zenodo.22961580), concept `10.5281/zenodo.22961579`, `isNewVersionOf` 0.5.0 and 0.4.3 | run 36151244382, from `main` at `79c4fd1` (package byte-identical to the tag). Before minting, the run re-verified the historical release gate from its sealed, sha256-pinned sources and passed the library evidence test (10/10). |
| Zenodo, 0.5.0 and 0.4.3 | a dated correction paragraph leads each description; the notes name 0.6.0; `isPreviousVersionOf` 0.6.0 and `isDocumentedBy` this audit; files restricted. Title, creators and licence field unchanged. | runs 36152525777 and 36152509818; the public API shows `access_right: restricted` and no files, and a file URL redirects to the login page |
| Explorer Space | shows the four cleared phrases; dated notice; no links to the adapters | Space commit `56d7693` |
| Eval Space | dated notice; the three links to the adapters removed; the write-up stays as the historical record | Space commit `386d43f` |
| Adapters `jam-ft-v1-qwen25` | withdrawal notice on the card, then made private. All five `adapter_model.safetensors` remain there, each matching the hash pinned in `experiments/finetune-arc-v2/evals/p7-adapter-publish-receipt.json` | commit `c5fd6c7`; the model URL answers 401 to anonymous requests |
| Live demo Space `jam-actions-live` | notice, then made private | commit `067f4e8`; 401 to anonymous requests |
| GitHub release `jam-ft-v1-adapters` | retitled "withdrawn", notice prepended, converted to a draft. Its 767 MB archive (0 downloads) was then removed from the release, after an offline copy was verified against the sha256 recorded at publication. | the release lists no assets; the asset URL answers 404 to anonymous requests |
| HF history: `jam-actions-v0`, `jam-actions-acoustic-v0`, explorer Space | squashed to one commit each (from 12, 5 and 4), after offline mirrors of all three were verified blob for blob against the Hub's own listings. The current files are unchanged. | new heads `cbacb7c`, `c7fce8d`, `d63ac7e`. On the day, the old commits still resolved when requested by hash: the Hub applies a squash asynchronously (its storage documentation gives up to 36 hours). This row is re-checked after that window. |
| Publish workflow | re-verifies the sealed release gate from pinned sources (`--artifacts-root`) and runs the library evidence test before minting | #44 |
| This repository's history | rewritten on 2026-09-26 in two passes per [`history-rewrite-runbook.md`](history-rewrite-runbook.md). The first came after #46 cleared the tree. The second came after #47's byte-level MIDI guard found two pre-Mutopia MIDI versions the first had missed. `main` is `db83d7e` | a fresh clone of branches and tags scans to the 20 kept paths only, and every MIDI version in its history is byte-identical to its cleared file; the map from pre-rewrite ids is [`history-rewrite/commit-map-original-to-final.txt`](history-rewrite/commit-map-original-to-final.txt) |

Commit ids of these Hugging Face repositories recorded before the squash, such as `9d69b47` in the 0.6.0 publication receipt, now point to history that is no longer on any branch. The maintainers hold offline, verified copies of everything removed on this page.

**Retraining.** None was needed for the withdrawal. The withdrawn adapters had no recorded downloads, and adapters trained only on licence-cleared data already exist with the `jam-actions-v1` datasets.

**Still open, for the Director.**
- **`refs/pull/*` and cached commit views** still reach the old commits until GitHub support removes them; ticket #4795393 covers both passes. Forks are not ours to change.
- **Zenodo deletion** of 0.4.3 and 0.5.0 is available only through a support request. The files are already restricted, so deletion is not recommended.
- The private adapter repository keeps its history. It is not public.

## Why it happened

- The v0 licence evidence was a web page, not the bytes. `datasets/jam-actions-v0-public/ATTRIBUTION.md` says it was confirmed "at the page level".
- A bootstrap constant wrote "Krueger" into ten configs.
- Nothing re-runs the licence gate on published sets when a song's provenance changes.

## Options (the Director decides)

**A. Correct forward.**
- Publish v0 **0.6.0** with only the 57 cleared records: bach, clair-de-lune, fur-elise and mozart.
- Publish acoustic-v0 **1.1.0** with 72 records.
- Remove or correct the four Space examples.
- Push through `push-jam-actions-v0-hf.yml` (`dataset_dir`, `allow_card_overwrite`).
- ⚠ A Zenodo new version under concept 20279918 would become the concept's *latest*, which is now v1 1.1.0, because the concept already mixes v0 and v1. The alternative is a fresh deposit (`zenodo_newversion_of=none`) with related identifiers.

**B. Restrict what stays up.**
- Zenodo lets the owner restrict public access to the files of 0.4.3 and 0.5.0, add a public note, and publish a corrected version. That is reversible.
- On HF, old revisions stay reachable by hash after a corrective push. The options are gating the repo, making it private, or squashing history (irreversible).

**C. Removal.**
- Zenodo deletes after 30 days only on a justified support request, such as copyright. It is irreversible and leaves a tombstone.
- For the adapter: delete or make private the HF repo, and delete the release asset.
- The repo: a normal commit removes the files from the tree. Removing them from history means `filter-repo` and a force-push. `refs/pull/*` still keep the objects until GitHub support drops them, as in the 2026-09-09 purge.

**D. Disclosure only.** Correct every card, `ATTRIBUTION.md`, the adapter card and the Zenodo metadata (via `zenodo-edit-record.yml`) to say which records come from arrangements of unknown licence. This is the fastest option, and the content stays public.

### Compensators

| Action | Undo | State after undo | Owner |
|---|---|---|---|
| HF push of a corrected version | revert commit / re-push prior package | prior version restored | dataset publisher |
| HF gate / private | make public again | as before | HF org admin |
| HF history squash or repo delete | none | history gone; links break | HF org admin |
| Zenodo new version | owner delete within 30 days | tombstone; DOI stays | Zenodo record owner |
| Zenodo restrict file access + note | reopen access, edit note | as before | Zenodo record owner |
| Zenodo support deletion | none | tombstone | Zenodo record owner via support |
| Release asset delete | re-upload (hash recorded) | as before | repo admin |
| Tree removal commit | `git revert` | files back | repo maintainer |
| History rewrite + force-push | restore from bundle | as before, except `refs/pull/*` | repo admin + GitHub support |

### Traps, from the v1 publishing arc

- Checksums are LF-pinned; card edits break them on a CRLF checkout.
- `public.test.ts` requires the committed card to equal `docs/hf-cards/*`, so a card edit must land together with the regenerated set.
- The HF push halts on a changed remote card unless `allow_card_overwrite` is set.
- A nonexistent HF repo answers 401, not 404.
- `zenodo_newversion_of=none` means a fresh deposit.

### Advisor's recommendation (not a decision)

1. Options **D** and **A** now, for v0, acoustic-v0 and the Space.
2. Correct the adapter card, and decide whether the adapter comes down. Retraining on the 57 cleared records has not been measured.
3. **B** on Zenodo 0.4.3 and 0.5.0: restrict the files and add a note pointing to the corrected version. It is reversible.
4. Remove the experiment files from the tree.
5. A history rewrite and a composition-layer check of the E-R songs are separate decisions.

## Method

- Every record's `scope.song_id` was joined to its `songs/{library,quarantine}/**/*.json` `provenance.arrangement_license`.
- Allowed licences: `CC-BY-SA-3.0-DE`, `Public-Domain`, and `title_verdict ≠ contradicts`.
- Each record's `midi_sidecar.midi_sha256` was compared with the library file's hash.
- Content was quantified from `observation.midi_sidecar.timed_events` (`t_ticks` against the 16th-note and triplet grid, distinct velocities, measure coverage from `annotation_target.measure_range`).
- HF: `api/{datasets,models,spaces}?author=mcp-tool-shop`, raw `examples.json`, `prompts-heldout-v1.jsonl`, the adapter `README.md`, and `checksums.sha256`.
- Zenodo: `api/records?q=conceptrecid:20279918&allversions=true`, plus the help page on managing records.
- GitHub: `gh release view` assets.
- Tracked files were scanned with `git ls-files` for note-list structures alongside uncleared song ids.
