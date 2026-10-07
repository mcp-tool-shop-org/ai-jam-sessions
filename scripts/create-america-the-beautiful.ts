/**
 * Write the library's "America the Beautiful": one verse of Samuel A. Ward's
 * Materna (1882) in a block-chord hymn setting, as MIDI plus the library JSON
 * with full provenance.
 *
 *   pnpm exec tsx scripts/create-america-the-beautiful.ts
 *
 * The tune, chords and verse are the sung exemplar's (src/vocal/hymns.ts:
 * checked against The One Hundred and One Best Songs, 1919, and Hymnary.org's
 * incipit); this is its first verse with a bar of piano before and after.
 * Until 2026-10-07 this script wrote a melody that was not Materna.
 *
 * Melody and text: public domain. Arrangement: original block-chord setting,
 * generated here and dedicated to the public domain.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readProvenanceEvidence } from "../src/songs/provenance.js";
import { AMERICA_THE_BEAUTIFUL as HYMN, hymnMidi, realizeHymn, type RealizeOptions } from "../src/vocal/hymns.js";

const GENRE = "folk";
const SONG_ID = "america-the-beautiful";
const OUT_DIR = join("songs", "library", GENRE);

// One verse, after a bar of the tonic chord, ending on a held tonic. The sung
// line starts in bar 2, so its pickup is never in the clock's first bar.
const LIBRARY_VERSION: RealizeOptions = {
  intro: { melody: "R:4", chords: "C:4" },
  verses: 1,
  ending: { melody: "R:4", chords: "C:4" },
};

const midiBytes = hymnMidi(HYMN, LIBRARY_VERSION, HYMN.title);
const bars = realizeHymn(HYMN, LIBRARY_VERSION).bars;
const midiPath = join(OUT_DIR, `${SONG_ID}.mid`);
writeFileSync(midiPath, midiBytes);

const evidence = readProvenanceEvidence(midiBytes);

const config = {
  id: SONG_ID,
  title: HYMN.title,
  genre: GENRE,
  composer: HYMN.composer,
  difficulty: "beginner",
  key: HYMN.key,
  splitPoint: HYMN.splitPoint,
  tempo: HYMN.bpm,
  timeSignature: `${HYMN.beatsPerBar}/4`,
  tags: ["folk", "patriotic", "hymn", "american"],
  status: "ready",
  musicalLanguage: {
    description:
      `Samuel A. Ward composed the hymn tune 'Materna' in 1882; it became inseparable from Katharine Lee Bates's poem, published in 1895 and revised by 1911, as 'America the Beautiful.' This arrangement is one verse of the tune in B-flat major at ${HYMN.bpm} BPM, set in plain block chords that double the melody. The melody runs from C4 to D5, a comfortable range for a singer, and its dotted rhythm and steady four-bar phrases make it a natural first hymn at the keyboard.`,
    structure:
      `One verse of four four-bar phrases (${bars} bars, with a bar of piano before and after). The first two phrases rise and fall back ('O beautiful for spacious skies… for amber waves of grain'); the second half opens at the tune's high point ('America! America!') and closes with a full cadence ('from sea to shining sea'). The harmony follows the 1919 hymnal setting: tonic, dominant and subdominant, with a secondary dominant that turns the second phrase toward the dominant.`,
    keyMoments: [
      "Bar 2, beat 4: the pickup 'O' leads into the first phrase; the dotted 'beau-ti-ful' sets the tune's lilt.",
      "Bar 9: the second phrase climbs to D5 through a secondary dominant ('above the fruited plain') and lands on the dominant in bar 10.",
      "Bar 11: 'A-mer-i-ca' starts high, the climax of the verse.",
      "Bars 15-18: the last phrase descends to a full cadence on the tonic ('from sea to shining sea').",
    ],
    teachingGoals: [
      "Dotted rhythm: the dotted quarter and eighth that open most bars of the tune.",
      "Hymn harmony: tonic, dominant and subdominant chords under a singable melody, plus one secondary dominant.",
      "Four-bar phrasing: breathe, or lift the hands, at the end of each phrase.",
      "Pickups: each phrase begins on the beat before the bar.",
    ],
    styleTips: [
      "Keep the dotted rhythm crisp but unhurried: a hymn, not a march.",
      "Bring the melody out over the chord tone beneath it.",
      "Let the 'America! America!' climax swell, then settle into the final cadence.",
      "Hold the last chord its full length.",
    ],
  },
  provenance: {
    schema: 1,
    source_url: HYMN.sources[0].url,
    source_site: "abcnotation.com",
    arrangement_creator: "mcp-tool-shop-org",
    arrangement_license: "Public-Domain",
    terms_url: "https://hymnary.org/tune/materna_ward",
    terms_quote:
      "Melody Materna (Samuel A. Ward, 1882) and text (Katharine Lee Bates) are in the public domain. The melody follows The One Hundred and One Best Songs (Cable Company, Chicago, 1919), cross-checked against The Everyday Song Book (1927) and Hymnary.org's incipit 55335 52234 56755.",
    verified_at: "2026-10-07",
    verifier: "https://hymnary.org/tune/materna_ward",
    midi_sha256: evidence.sha256,
    midi_title_events: evidence.titleEvents,
    midi_credit_events: [],
    credited_parties: [
      {
        name: "Samuel A. Ward",
        evidence: "melody composed 1882, public domain per U.S. copyright law (17 U.S.C. § 304)",
      },
      {
        name: "Katharine Lee Bates",
        evidence: "text published 1895, public domain per U.S. copyright law (pre-1929)",
      },
    ],
    title_verdict: "matches",
  },
};

const jsonPath = join(OUT_DIR, `${SONG_ID}.json`);
writeFileSync(jsonPath, JSON.stringify(config, null, 2) + "\n");

console.log(`Wrote ${midiPath} (${midiBytes.length} bytes, SHA-256 ${evidence.sha256})`);
console.log(`Wrote ${jsonPath}`);
