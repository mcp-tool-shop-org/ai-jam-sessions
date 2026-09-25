# Provenance note — working corpus vs published subset

This directory (`datasets/jam-actions-v0/`) is the **working corpus** for the
jam-actions-v0 dataset. It is *not* the published artifact. The published,
checksummed, DOI-bearing subset lives at
[`datasets/jam-actions-v0-public/`](../jam-actions-v0-public/) (Zenodo DOI
[10.5281/zenodo.20279919](https://doi.org/10.5281/zenodo.20279919)).

## Two works are excluded from the published subset

During the Slice 2.5 provenance audit, the piano-midi.de source-URL provenance
for two arrangements could not be verified:

| Work | Status here | Status in published subset |
|------|-------------|---------------------------|
| Satie — Gymnopédie No. 1 | present (records, MIDI-derived artifacts, evals) | **excluded** |
| Debussy — Arabesque No. 1 | present (records, MIDI-derived artifacts, evals) | **excluded** |

They remain in this working corpus so the exclusion is reproducible and the
audit trail is inspectable, but they carry the same unverified-provenance
status they had at exclusion time. Do **not** promote them into any published
package unless their arrangement provenance is first verified.

## Four works withdrawn from the published subset in 0.6.0 (2026-09-25)

The library provenance audit of 2026-09-09 read the MIDI files these records
were built from. Four songs that Slice 2.5 had verified at the level of
piano-midi.de's composer pages turned out to have been built from files
obtained elsewhere, with no established arrangement licence:

| Work | Source of the file | Records here | Status in published subset |
|------|--------------------|--------------|---------------------------|
| Chopin — Nocturne Op. 9 No. 2 | midiworld.com | 18 | **withdrawn in 0.6.0** |
| Chopin — Prelude Op. 28 No. 4 | bitmidi.com | 12 | **withdrawn in 0.6.0** |
| Beethoven — Pathétique Sonata II | midiworld.com | 16 | **withdrawn in 0.6.0** |
| Schumann — Träumerei | midiworld.com | 12 | **withdrawn in 0.6.0** |

Their records carry `record_verdict: "excluded"` with the reason in
`verdict_reason`. The packager's library evidence gate refuses them even if the
verdict were flipped back. See
[`../../docs/findings/published-dataset-licence-audit.md`](../../docs/findings/published-dataset-licence-audit.md).

## License boundary

The repository's MIT license covers the **code**. Everything under
`datasets/` — including this working corpus — is derived from Bernd Krueger's
piano-midi.de arrangements and is licensed **CC-BY-SA-3.0-DE**, per the
share-alike chain documented in
[`../jam-actions-v0-public/LICENSE-DATASET.md`](../jam-actions-v0-public/LICENSE-DATASET.md)
and [`../jam-actions-v0-public/ATTRIBUTION.md`](../jam-actions-v0-public/ATTRIBUTION.md).
The MIT grant does not apply to these files.

## Resolution addendum — the teaching-library copies (2026-08-19)

The two songs' **teaching-library** entries (`songs/library/classical/`) were re-sourced
on 2026-08-19 (PR #28, merge `bfc31ac`): they now carry Mutopia Project typeset MIDI with
on-page **Public Domain** marks — Gymnopédie No. 1 (piece id 37, typeset by Evin
Robertson, sha256 `09ce7337…f97384`) and Première Arabesque (piece id 1777, typeset by
Keith OHara after Durand et Fils 1904, sha256 `6732dc10…a34757`) — with fresh analysis
and annotations generated from those bytes. The piano-midi.de attribution is gone from
the library.

**This note's guidance for the dataset records is unchanged.** The internal working-corpus
records below still reference the *prior* bytes as frozen history: they remain
`record_verdict: "internal"`, remain excluded from every published package, and must not
be promoted. A future slice that wants these works in a published dataset builds new
records from the Mutopia bytes rather than rehabilitating the old ones.
