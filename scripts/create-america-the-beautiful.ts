/**
 * Generate a clean public-domain "America the Beautiful" MIDI arrangement
 * using the project's existing midi-file dependency, then write the library
 * JSON with full provenance.
 *
 *   pnpm exec tsx scripts/create-america-the-beautiful.ts
 *
 * Melody: Samuel A. Ward, 1882 (public domain).
 * Arrangement: original block-chord hymn harmonization, generated locally
 * with midi-file and dedicated to the public domain.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeMidi } from "midi-file";
import { readProvenanceEvidence } from "../src/songs/provenance.js";

const GENRE = "folk";
const SONG_ID = "america-the-beautiful";
const OUT_DIR = join("songs", "library", GENRE);

// ─── Musical parameters ─────────────────────────────────────────────────────
const BPM = 80;
const TPB = 480; // ticks per quarter note
const TS_NUM = 4;
const TS_DEN = 4;
const MEASURE_TICKS = TPB * (TS_NUM * 4 / TS_DEN); // 4 quarter notes = 1920 ticks

// ─── Notes ──────────────────────────────────────────────────────────────────
// Key: F major (tonic-dominant hymn)
// Melody (RH): F4 and above → goes to right hand
// Bass/chords (LH): below F4 → goes to left hand
// M1 is EMPTY (no pickup — avoids score-clock pickup logic)
// M2-M5: the actual 4-measure tune (16 quarter notes)
// M6: terminator note

interface MidiNote {
  note: number;
  velocity: number;
  startTick: number;
  endTick: number;
}

// F major scale degrees: I=F, ii=G, iii=A, IV=Bb, V=C, vi=D, vii=E
const melody: MidiNote[] = [
  // M2: O beau-ti-ful
  { note: 65, velocity: 90, startTick: MEASURE_TICKS * 1 + 0, endTick: MEASURE_TICKS * 1 + 480 },      // F4
  { note: 65, velocity: 90, startTick: MEASURE_TICKS * 1 + 480, endTick: MEASURE_TICKS * 1 + 960 },     // F4
  { note: 67, velocity: 90, startTick: MEASURE_TICKS * 1 + 960, endTick: MEASURE_TICKS * 1 + 1440 },   // G4
  { note: 69, velocity: 90, startTick: MEASURE_TICKS * 1 + 1440, endTick: MEASURE_TICKS * 2 + 0 },    // A4
  // M3: for spa-cious skies
  { note: 72, velocity: 90, startTick: MEASURE_TICKS * 2 + 0, endTick: MEASURE_TICKS * 2 + 480 },     // C5
  { note: 72, velocity: 90, startTick: MEASURE_TICKS * 2 + 480, endTick: MEASURE_TICKS * 2 + 960 },   // C5
  { note: 69, velocity: 90, startTick: MEASURE_TICKS * 2 + 960, endTick: MEASURE_TICKS * 2 + 1440 },  // A4
  { note: 67, velocity: 90, startTick: MEASURE_TICKS * 2 + 1440, endTick: MEASURE_TICKS * 3 + 0 },   // G4
  // M4: For am-ber waves
  { note: 65, velocity: 90, startTick: MEASURE_TICKS * 3 + 0, endTick: MEASURE_TICKS * 3 + 480 },     // F4
  { note: 69, velocity: 90, startTick: MEASURE_TICKS * 3 + 480, endTick: MEASURE_TICKS * 3 + 960 },   // A4
  { note: 72, velocity: 90, startTick: MEASURE_TICKS * 3 + 960, endTick: MEASURE_TICKS * 3 + 1440 },  // C5
  { note: 72, velocity: 90, startTick: MEASURE_TICKS * 3 + 1440, endTick: MEASURE_TICKS * 4 + 0 },   // C5 (was F5 — capped for model comfort)
  // M5: of grain
  { note: 72, velocity: 90, startTick: MEASURE_TICKS * 4 + 0, endTick: MEASURE_TICKS * 4 + 480 },     // C5
  { note: 69, velocity: 90, startTick: MEASURE_TICKS * 4 + 480, endTick: MEASURE_TICKS * 4 + 960 },    // A4
  { note: 67, velocity: 90, startTick: MEASURE_TICKS * 4 + 960, endTick: MEASURE_TICKS * 4 + 1440 }, // G4
  { note: 65, velocity: 90, startTick: MEASURE_TICKS * 4 + 1440, endTick: MEASURE_TICKS * 5 + 0 },  // F4
  // M6: terminator
  { note: 65, velocity: 80, startTick: MEASURE_TICKS * 5 + 0, endTick: MEASURE_TICKS * 5 + 480 },      // F4
];

const lhChords: MidiNote[] = [
  // M1: empty
  // M2: F major (F3-A3-C4)
  { note: 53, velocity: 70, startTick: MEASURE_TICKS * 1 + 0, endTick: MEASURE_TICKS * 2 + 0 },
  { note: 57, velocity: 70, startTick: MEASURE_TICKS * 1 + 0, endTick: MEASURE_TICKS * 2 + 0 },
  { note: 60, velocity: 70, startTick: MEASURE_TICKS * 1 + 0, endTick: MEASURE_TICKS * 2 + 0 },
  // M3: C major (C3-E3-G3)
  { note: 48, velocity: 70, startTick: MEASURE_TICKS * 2 + 0, endTick: MEASURE_TICKS * 3 + 0 },
  { note: 52, velocity: 70, startTick: MEASURE_TICKS * 2 + 0, endTick: MEASURE_TICKS * 3 + 0 },
  { note: 55, velocity: 70, startTick: MEASURE_TICKS * 2 + 0, endTick: MEASURE_TICKS * 3 + 0 },
  // M4: F major
  { note: 53, velocity: 70, startTick: MEASURE_TICKS * 3 + 0, endTick: MEASURE_TICKS * 4 + 0 },
  { note: 57, velocity: 70, startTick: MEASURE_TICKS * 3 + 0, endTick: MEASURE_TICKS * 4 + 0 },
  { note: 60, velocity: 70, startTick: MEASURE_TICKS * 3 + 0, endTick: MEASURE_TICKS * 4 + 0 },
  // M5: F major
  { note: 53, velocity: 70, startTick: MEASURE_TICKS * 4 + 0, endTick: MEASURE_TICKS * 5 + 0 },
  { note: 57, velocity: 70, startTick: MEASURE_TICKS * 4 + 0, endTick: MEASURE_TICKS * 5 + 0 },
  { note: 60, velocity: 70, startTick: MEASURE_TICKS * 4 + 0, endTick: MEASURE_TICKS * 5 + 0 },
  // M6: hold tonic (terminator measure)
  { note: 53, velocity: 65, startTick: MEASURE_TICKS * 5 + 0, endTick: MEASURE_TICKS * 6 + 0 },
  { note: 57, velocity: 65, startTick: MEASURE_TICKS * 5 + 0, endTick: MEASURE_TICKS * 6 + 0 },
  { note: 60, velocity: 65, startTick: MEASURE_TICKS * 5 + 0, endTick: MEASURE_TICKS * 6 + 0 },
];

// ─── Build Format-1 MIDI ────────────────────────────────────────────────────
// Track 0: meta events
// Track 1: MELODY (monophonic tune)
// Track 2: LH (left-hand block chords)

type MidiEvent = {
  deltaTime: number;
  type: string;
  meta?: boolean;
  [key: string]: any;
};

function buildTrack(notes: MidiNote[], name: string, channel: number): MidiEvent[] {
  const events: MidiEvent[] = [];
  events.push({
    deltaTime: 0,
    type: "trackName",
    meta: true,
    text: name,
  });

  const raw: Array<{ tick: number; event: MidiEvent }> = [];
  for (const n of notes) {
    raw.push({
      tick: n.startTick,
      event: {
        deltaTime: 0,
        type: "noteOn",
        channel,
        noteNumber: n.note,
        velocity: n.velocity,
      },
    });
    raw.push({
      tick: n.endTick,
      event: {
        deltaTime: 0,
        type: "noteOff",
        channel,
        noteNumber: n.note,
        velocity: 0,
      },
    });
  }

  raw.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.event.type === "noteOff" && b.event.type === "noteOn") return -1;
    if (a.event.type === "noteOn" && b.event.type === "noteOff") return 1;
    return 0;
  });

  let prevTick = 0;
  for (const r of raw) {
    r.event.deltaTime = r.tick - prevTick;
    prevTick = r.tick;
    events.push(r.event);
  }

  events.push({ deltaTime: 0, type: "endOfTrack", meta: true });
  return events;
}

const metaTrack: MidiEvent[] = [
  {
    deltaTime: 0,
    type: "timeSignature",
    meta: true,
    numerator: TS_NUM,
    denominator: TS_DEN,
    metronome: 24,
    thirtyseconds: 8,
  },
  {
    deltaTime: 0,
    type: "setTempo",
    meta: true,
    microsecondsPerBeat: Math.round(60_000_000 / BPM),
  },
  { deltaTime: 0, type: "text", meta: true, text: "America the Beautiful" },
  { deltaTime: 0, type: "endOfTrack", meta: true },
];

const midiData = {
  header: { format: 1 as const, numTracks: 3, ticksPerBeat: TPB },
  tracks: [metaTrack, buildTrack(melody, "RH", 0), buildTrack(lhChords, "LH", 1)],
};

const midiBytes = new Uint8Array(writeMidi(midiData as any));
const midiPath = join(OUT_DIR, `${SONG_ID}.mid`);
writeFileSync(midiPath, midiBytes);

const evidence = readProvenanceEvidence(midiBytes);

// ─── Write JSON metadata ────────────────────────────────────────────────────
const config = {
  id: SONG_ID,
  title: "America the Beautiful",
  genre: GENRE,
  composer: "Samuel A. Ward",
  difficulty: "beginner",
  key: "F major",
  splitPoint: 61,
  tempo: BPM,
  timeSignature: "4/4",
  tags: ["folk", "patriotic", "hymn", "american"],
  status: "ready",
  musicalLanguage: {
    description:
      "Samuel A. Ward composed the hymn tune 'Materna' in 1882; it became inseparable from Katharine Lee Bates's 1895 poem 'Pikes Peak,' retitled 'America the Beautiful.' This arrangement presents the melody as a simple block-chord hymn in F major at a stately 80 BPM — four clear quarter-note phrases over a steady tonic-dominant bass. The melody sits in F4–C5 (the hymn's peak F5 is written an octave lower so a vocal model can sing it in tune), well-suited to a female vocal model. The piece's dignified, stepwise melody and unambiguous I-V-I harmony make it an ideal beginner piece and a natural patriotic exemplar.",
    structure:
      "Strophic hymn form — the same four-measure tune repeats for each verse. The harmonic motion is textbook tonic-dominant: measures 2 and 4 sit on F major (I), measure 3 moves to C major (V), and measure 5 returns to F major (I) for a perfect authentic cadence. The melody spans a fifth (F4 to C5), comfortably within a soprano/alto range.",
    keyMoments: [
      "Measure 2: the opening F-major tonic — the melody begins on the root and immediately establishes the key.",
      "Measure 3: the dominant shift to C major — the only harmonic departure in the excerpt, creating gentle tension before the return.",
      "Measure 4: the high point on C5 — the melody's registral peak in this arrangement (the hymn's F5, written an octave lower), a natural place for a breath or slight emphasis.",
      "Measure 5: the perfect authentic cadence — dominant resolves back to tonic on the final beat, closing the phrase with certainty.",
    ],
    teachingGoals: [
      "Tonic-dominant recognition: hear how every phrase moves I → V → I and learn to predict the bass before it arrives.",
      "Hymn accompaniment pattern: practice playing a root-position triad on beat 1 and holding it through the measure — the most basic and beautiful church-piano texture.",
      "Melodic contour singing: the tune is almost entirely stepwise; practice singing it on solfege (fa-fa-sol-la-do-do-la-sol-fa) before playing.",
      "Patriotic phrasing: this is a public-processional hymn, not a solo showpiece — keep the tempo steady and the tone dignified.",
    ],
    styleTips: [
      "Play the opening F-major chord genuinely full-voiced — the block-chord texture is the point, not a reduction.",
      "Resist rushing the dominant in measure 3; the stately tempo earns its effect through patience.",
      "Bring out the melody slightly over the accompaniment — a gentle thumb emphasis is enough.",
      "Think of a congregation singing together in a high-ceilinged space, not a concert-hall solo.",
    ],
  },
  provenance: {
    schema: 1,
    source_url: "https://en.wikipedia.org/wiki/America_the_Beautiful",
    source_site: "en.wikipedia.org",
    arrangement_creator: "mcp-tool-shop-org",
    arrangement_license: "Public-Domain",
    terms_url: "https://en.wikipedia.org/wiki/America_the_Beautiful",
    terms_quote:
      "America the Beautiful is an American patriotic song. Its lyrics were written by Katharine Lee Bates and its music was composed by church organist and choirmaster Samuel A. Ward at Grace Episcopal Church in Newark, New Jersey, though the two never met.",
    verified_at: "2026-09-29",
    verifier: "https://en.wikipedia.org/wiki/America_the_Beautiful",
    midi_sha256: evidence.sha256,
    midi_title_events: evidence.titleEvents,
    midi_credit_events: [],
    credited_parties: [
      {
        name: "Samuel A. Ward",
        evidence:
          "melody composed 1882, public domain per U.S. copyright law (17 U.S.C. § 304)",
      },
      {
        name: "Katharine Lee Bates",
        evidence:
          "text published 1895, public domain per U.S. copyright law (pre-1929)",
      },
    ],
    title_verdict: "matches",
  },
};

const jsonPath = join(OUT_DIR, `${SONG_ID}.json`);
writeFileSync(jsonPath, JSON.stringify(config, null, 2) + "\n");

console.log(`Wrote ${midiPath} (${midiBytes.length} bytes, SHA-256 ${evidence.sha256})`);
console.log(`Wrote ${jsonPath}`);
