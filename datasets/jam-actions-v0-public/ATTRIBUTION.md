# Attribution — `jam-actions-v0` (public subset)

This dataset combines three legally distinct layers. To use it lawfully, downstream consumers must credit each layer at the appropriate granularity. This document gives the per-layer facts plus copy-pasteable attribution strings.

For the underlying license obligations (share-alike, derivative-works rules), see [`LICENSE-DATASET.md`](LICENSE-DATASET.md). For per-song verification evidence, see [`provenance-verification.json`](provenance-verification.json).

## Three layers, briefly

| Layer | What it is | Who owns it | Status |
|---|---|---|---|
| Compositions | The musical works themselves (notes, structure, ideas) | Long-dead composers | Public domain (US + EU) |
| Arrangements | The MIDI realizations of those compositions | Bernd Krueger | CC-BY-SA-3.0-DE |
| Derivative records | These dataset records (traces, annotations, tokenizations, splits) | `mcp-tool-shop-org` | CC-BY-SA-3.0-DE (share-alike inherited) |

Each downstream use must satisfy the most restrictive applicable layer. In practice for this dataset, that means **CC-BY-SA-3.0-DE** governs redistribution of the records, MIDI sidecars, REMI/ABC tokenizations, and SVG piano rolls.

## Layer 1 — Compositions (public domain)

All 4 compositions in this public subset are in the public domain in both the United States (published before 1931) and the European Union (composer death + 70 years). No per-composition attribution is legally required, but it is good scholarly practice. The per-composer status table:

| Composer | Died | EU PD since | Compositions in this subset | First-published year |
|---|---|---|---|---|
| Johann Sebastian Bach | 1750 | 1821 | Prelude in C Major, BWV 846 (Well-Tempered Clavier) | 1722 |
| Wolfgang Amadeus Mozart | 1791 | 1862 | Piano Sonata No. 16 in C Major, K. 545, I. Allegro | 1788 (publ. 1805) |
| Ludwig van Beethoven | 1827 | 1898 | Bagatelle No. 25 in A minor ("Für Elise") | 1810 (publ. 1867) |
| Claude Debussy | 1918 | 1989 | "Clair de Lune" from Suite bergamasque, III | 1905 |

Debussy is the latest-deceased composer represented; his works entered EU public domain on 1989-01-01.

## Layer 2 — Arrangements (CC-BY-SA-3.0-DE)

**The MIDI bytes are not public domain.** They are arrangements created by Bernd Krueger and published at piano-midi.de under the **CC-BY-SA-3.0-DE** license (Creative Commons Attribution-ShareAlike 3.0 Germany).

- **Arranger:** Bernd Krueger
- **Source site:** http://piano-midi.de/ (HTTP only; no HTTPS endpoint exists — see Slice 2.5 verification report)
- **License:** Creative Commons Attribution-ShareAlike 3.0 Germany
- **License URL (canonical):** https://creativecommons.org/licenses/by-sa/3.0/de/
- **License URL (deed, English):** https://creativecommons.org/licenses/by-sa/3.0/de/deed.en
- **Per-song evidence URLs** (from Slice 2.5 URL verification):

  | Song | Evidence URL |
  |---|---|
  | bach-prelude-c-major-bwv846 | http://piano-midi.de/bach.htm |
  | clair-de-lune | http://piano-midi.de/debuss.htm |
  | fur-elise | http://piano-midi.de/beeth.htm |
  | mozart-k545-mvt1 | http://piano-midi.de/mozart.htm |

Each record's `provenance.arrangement_evidence_url` field carries the per-song evidence URL byte-for-byte. The `arrangement_license` (`"CC-BY-SA"`) and `arrangement_license_version` (`"3.0"`) fields are also present on every record.

Since 0.6.0, a page-level URL check is no longer sufficient on its own. Every record in the package must also match the source repository's library provenance block for its song — a block re-derived from the MIDI bytes, which names Bernd Krueger as the file's own copyright credit — and the record's `observation.midi_sidecar.midi_sha256` must equal that block's file hash. See "Verification evidence" below.

### Note on jurisdiction (CC-BY-SA-3.0-DE vs CC-BY-SA-3.0 international)

The "DE" suffix refers to the German jurisdiction port of CC-BY-SA-3.0. The substantive obligations (attribution; share-alike; indicate changes; do not impose additional restrictions) are equivalent to the international 3.0 license. The governing law for the upstream arrangements is German law. Downstream users in non-DE jurisdictions should consult the CC localization that applies to them, or fall back to the international 3.0 deed, but the safe path is: declare CC-BY-SA-3.0-DE on your derivative and you have honored the upstream cleanly.

HuggingFace's dataset-card YAML enumerates `cc-by-sa-3.0` and does **not** include a `-de` jurisdiction slug. The README.md frontmatter therefore declares `license: cc-by-sa-3.0`; the precise DE jurisdiction is documented here, in the README body, and in `LICENSE-DATASET.md`. The obligations are identical; only the governing-law label differs.

## Layer 3 — Derivative records (CC-BY-SA-3.0-DE via share-alike)

Each record in this dataset is derived from a CC-BY-SA-3.0-DE arrangement. The share-alike clause is sticky: the dataset itself is licensed under CC-BY-SA-3.0-DE.

- **Maintainer:** mcp-tool-shop-org
- **Repository:** https://github.com/mcp-tool-shop-org/ai-jam-sessions
- **License:** CC-BY-SA-3.0-DE
- **Citation file:** [`CITATION.cff`](CITATION.cff)
- **Version:** 0.6.0
- **Record content:** unchanged from 0.5.0 for every record in this package; 0.6.0 removes records, it does not edit them. The Bach BWV 846 corrections of 0.5.0 (errata 001 + 002) are the most recent record-content change.

### Annotation provenance — who wrote what (human-in-the-loop)

The `annotation_target` and `target_trace` content on the 57 records was produced by a **human-in-the-loop** process. The HuggingFace dataset card declares `annotations_creators: [expert-generated, machine-generated]` and `language_creators: [expert-generated, machine-generated]` to capture both populations honestly; this section gives the detail behind those slugs.

- **Operator (mcp-tool-shop-org):** authored the schema, the enrichment rubric, the held-out-test discipline, the corpus selection, the per-record acceptance bar, the release-gate axes and thresholds, and the final review of every enrichment. Every annotation in the package was either operator-written or operator-reviewed before shipping.
- **AI agents (under operator direction, models qwen2.5:7b and Claude in the source repo):** drafted annotation_target prose for the records enriched in Slice 11. Of those, the three Bach records (m045-048, m049-052, m053-056) remain in this package; the Pathétique and Schumann records enriched in Slices 11 and 21 were withdrawn in 0.6.0. Agent drafts were explicitly constrained to be MIDI-grounded (anchorable to events the inspector tools can verify) and were operator-reviewed before each enrichment was admitted to the durable overlay (`enrichment-overrides.json`).
- **Why both slugs apply:** the substantive content quality is the operator's responsibility (`expert-generated` is the closer fit by domain-expertise standard), and the agents performed substantial first-draft work under explicit human direction (`machine-generated` is honest about AI involvement). HF allows the list form; we use it.
- **What `task_ids` would NOT capture:** HF's `task_ids` enum is dominated by NLP-specific subtasks that do not fit MCP tool-use traces over symbolic music. The field stays unpopulated.

## Required redistribution attribution

If you redistribute records, traces, tokenizations, MIDI sidecars, or SVG piano rolls from this dataset (in whole or in part), you MUST do all of the following:

1. **Attribute the dataset.** Cite `mcp-tool-shop-org` and link the source repository.
2. **Attribute the upstream arrangements.** Cite Bernd Krueger and piano-midi.de, naming CC-BY-SA-3.0-DE.
3. **Release derivatives under a compatible share-alike license.** CC-BY-SA-3.0-DE, CC-BY-SA-3.0 (international), or CC-BY-SA-4.0 are all valid choices; the v4.0 compatibility is via the CC 4.0 → 3.0 one-way compatibility annex.
4. **Indicate any changes you made.** A diff log, a changelog entry, or a "Modifications: ..." line is sufficient.
5. **Do not imply endorsement.** Don't suggest `mcp-tool-shop-org`, Bernd Krueger, or piano-midi.de endorse your derivative.

No per-composition attribution is required, because the underlying compositions are public domain. But naming the composers is good practice for any musicological context.

## Copy-pasteable attribution strings

### BibTeX (dataset citation)

```bibtex
@dataset{jam_actions_v0_public_2026,
  author       = {mcp-tool-shop-org},
  title        = {jam-actions-v0 — AI Jam Sessions tool-use traces (public subset)},
  version      = {0.6.0},
  year         = {2026},
  license      = {CC-BY-SA-3.0-DE},
  url          = {https://github.com/mcp-tool-shop-org/ai-jam-sessions},
  note         = {MIDI arrangements by Bernd Krueger, piano-midi.de, CC-BY-SA-3.0-DE.}
}
```

### Plain-text reference (paper / report)

> jam-actions-v0 (public subset), version 0.6.0, mcp-tool-shop-org, 2026. Licensed under CC-BY-SA-3.0-DE. MIDI arrangements by Bernd Krueger, https://piano-midi.de/, CC-BY-SA-3.0-DE. https://github.com/mcp-tool-shop-org/ai-jam-sessions.

### In-figure caption (single line)

> Source: jam-actions-v0 (mcp-tool-shop-org, CC-BY-SA-3.0-DE); MIDI by Bernd Krueger / piano-midi.de, CC-BY-SA-3.0-DE.

### One-liner credit (slide footer, social card, README badge)

> jam-actions-v0 — mcp-tool-shop-org + Bernd Krueger / piano-midi.de, CC-BY-SA-3.0-DE.

## Songs not in this subset

**Withdrawn in 0.6.0 (four songs, 58 records).** Versions 0.4.x and 0.5.x included records for Chopin's Nocturne Op. 9 No. 2 and Prelude Op. 28 No. 4, Beethoven's "Pathétique" Sonata II, and Schumann's "Träumerei", attributed to Bernd Krueger under CC-BY-SA-3.0-DE. That attribution rested on piano-midi.de listing those works. The source repository's library audit of 2026-09-09 read the MIDI files the records were actually built from: they came from midiworld.com and bitmidi.com, not piano-midi.de, and no arrangement licence could be established for them. The compositions are public domain; the arrangements in those files are not cleared, so the records were withdrawn. Do not redistribute those records from earlier versions. Details: `docs/findings/published-dataset-licence-audit.md` in the source repository.

**Never included (two songs).** Satie's Gymnopédie No. 1 and Debussy's Arabesque No. 1 **could not be verified** against piano-midi.de during Slice 2.5 URL verification. Their records remain in the source repository at `record_verdict: "internal"` and carry **no claim** of CC-BY-SA-3.0-DE here.

## Verification evidence

The 4 songs in this subset carry two layers of evidence:

1. **Slice 2.5 URL verification (2026-05-17).** Live HTTP fetch of each song's piano-midi.de composer page, confirming the CC marker and the work's listing. The full report is `provenance-verification.json` in this package: per song, pre-verdict, post-verdict, license detected, license version detected, arrangement_creator confirmed, song_title confirmed, evidence URL chosen, HTTP attempts, and HTTP status codes.
2. **Library evidence gate (0.6.0).** The packager refuses any record whose song's library provenance block — re-derived from the MIDI bytes, including the file's own copyright and title events — does not name a redistributable arrangement licence, or whose `observation.midi_sidecar.midi_sha256` differs from the evidenced file's hash. All 57 records pass.

## Questions / corrections

Open an issue at https://github.com/mcp-tool-shop-org/ai-jam-sessions. License-corner-case questions (jurisdiction conflicts, share-alike compatibility for a downstream license you're considering) are welcome — the layered structure here is real and we'd rather discuss it than have it misapplied.
