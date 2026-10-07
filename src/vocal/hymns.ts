/**
 * Whole-song arrangements of two public-domain hymns for the sung exemplars:
 * the tune, its harmony, an introduction and an ending, and every verse.
 *
 * The melodies are the hymns' own, checked against published sources (see
 * each tune's `sources`): Materna (Samuel A. Ward, 1882) from The One Hundred
 * and One Best Songs (1919), New Britain from the Amazing Grace article's
 * engraving, both against Hymnary.org's incipits. The harmonizations are this
 * project's own block-chord settings (America's follows the 1919 book's
 * chords), dedicated to the public domain like the rest of the arrangement.
 *
 * Notation, one verse per string, bars separated by `|`:
 *   `G4:1.5`  a note and its length in beats
 *   `R:2`     a rest (the piano plays the bar's chord)
 *   `~G4:0.5` a held note: the previous syllable continues onto it (`_` in the clock's lyrics)
 *   `G4:3,`   a breath after the note: the singer stops BREATH_BEATS early, the piano does not
 *
 * Lyrics follow the 1919 book where a word's dictionary syllables differ from
 * the tune's ("ev-'ry", two notes, not "ev-er-y"), and America breathes after
 * the first "A-mer-i-ca!": a vowel sung straight out of another vowel has no
 * onset the timing gate can date, and the picker needs every syllable dated.
 * Chords: `C:4 G/B:2 D7:1`, each with its length in beats, aligned to the melody.
 *
 * The session engine plays each piano hand as a gapless chain of chords as
 * long as their longest note, so `realizeHymn` builds exactly that: the right
 * hand is the melody with a chord tone under every note (or the bar's chord
 * where the singer rests), the left hand a bass and a tenor per chord. It
 * refuses to write a hand with a gap or an overlap, so the session clock is
 * the score.
 */

import { writeMidi } from "midi-file";
import { midiToSongEntry } from "../songs/midi/ingest.js";
import type { SongConfig } from "../songs/config/schema.js";
import type { SongEntry } from "../songs/types.js";

export const BREATH_BEATS = 0.5;
export const PPQ = 480;

export interface HymnSection {
  melody: string;
  chords: string;
}

export interface HymnSource {
  what: string;
  url: string;
}

export interface Hymn {
  id: string;
  title: string;
  tune: string;
  composer: string;
  textAuthor: string;
  bpm: number;
  beatsPerBar: number;
  /** Semitones from the written key (`sourceKey`) to the sung key (`key`). */
  transpose: number;
  sourceKey: string;
  key: string;
  /** Tonic pitch class of the written key, for the scale-degree check. */
  sourceTonic: number;
  /** Notes at or above this go to the right hand. */
  splitPoint: number;
  intro: HymnSection;
  verse: HymnSection;
  ending: HymnSection;
  /** Each verse's syllables, `-` inside a word; no `_` (the tune's held notes add them). */
  verses: string[];
  /** Hymnary.org's incipit: the tune's first 15 notes as scale degrees. */
  incipit: string;
  sources: HymnSource[];
}

export const AMERICA_THE_BEAUTIFUL: Hymn = {
  id: "america-the-beautiful-materna",
  title: "America the Beautiful",
  tune: "Materna",
  composer: "Samuel A. Ward",
  textAuthor: "Katharine Lee Bates",
  bpm: 92,
  beatsPerBar: 4,
  transpose: -2,
  sourceKey: "C major",
  key: "Bb major",
  sourceTonic: 0,
  splitPoint: 53,
  intro: {
    melody: "R:3 C5:1 | C5:1.5 A4:0.5 A4:1 C5:1 | C5:1.5 G4:0.5 G4:1 G4:1 | A4:1 C5:1 G4:1 D5:1 | C5:3 R:1",
    chords: "C:3 C7:1 | F:4 | C:4 | F:2 C/G:1 G7:1 | C:4",
  },
  verse: {
    melody: [
      "R:3 G4:1",
      "G4:1.5 E4:0.5 E4:1 G4:1 | G4:1.5 D4:0.5 D4:1 E4:1 | F4:1 G4:1 A4:1 B4:1 | G4:3, G4:1",
      "G4:1.5 E4:0.5 E4:1 G4:1 | G4:1.5 D4:0.5 D4:1 D5:1 | C#5:1 D5:1 E5:1 A4:1 | D5:3, G4:1",
      "E5:1.5 E5:0.5 D5:1, C5:1 | C5:1.5 B4:0.5 B4:1 C5:1 | D5:1 B4:1 A4:1 G4:1 | C5:3, C5:1",
      "C5:1.5 A4:0.5 A4:1 C5:1 | C5:1.5 G4:0.5 G4:1 G4:1 | A4:1 C5:1 G4:1 D5:1 | C5:3 R:1",
    ].join(" | "),
    chords: [
      "C:4",
      "C:4 | G:3 Em:1 | G7:4 | C:3 G:1",
      "C:3 Am:1 | G:4 | A7:2 D7:2 | G:4",
      "C:4 | G:3 C:1 | G:2 F:1 G7:1 | C:3 C7:1",
      "F:4 | C:4 | F:2 C/G:1 G7:1 | C:4",
    ].join(" | "),
  },
  ending: { melody: "R:4 | R:4", chords: "C:4 | C:4" },
  verses: [
    "O beau-ti-ful for spa-cious skies for am-ber waves of grain for pur-ple moun-tain maj-es-ties a-bove the fruit-ed plain A-mer-i-ca A-mer-i-ca God shed his grace on thee and crown thy good with broth-er-hood from sea to shi-ning sea",
    "O beau-ti-ful for pil-grim feet whose stern im-pas-sioned stress a thor-ough-fare for free-dom beat a-cross the wil-der-ness A-mer-i-ca A-mer-i-ca God mend thine ev-'ry flaw con-firm thy soul in self-con-trol thy lib-er-ty in law",
    "O beau-ti-ful for he-roes proved in lib-er-at-ing strife who more than self their coun-try loved and mer-cy more than life A-mer-i-ca A-mer-i-ca may God thy gold re-fine till all suc-cess be no-ble-ness and ev-'ry gain di-vine",
    "O beau-ti-ful for pa-triot dream that sees be-yond the years thine al-a-bas-ter ci-ties gleam un-dimmed by hu-man tears A-mer-i-ca A-mer-i-ca God shed his grace on thee and crown thy good with broth-er-hood from sea to shi-ning sea",
  ],
  incipit: "553355223456755",
  sources: [
    { what: "melody, four-part setting and the four verses: The One Hundred and One Best Songs (Cable Company, Chicago, 1919), ABC transcription", url: "https://abcnotation.com/tunePage?a=trillian.mit.edu/~jc/music/abc/src/jaabc2ps-1.1.0/release/101best/0007" },
    { what: "melody, cross-check: The Everyday Song Book (1927), ABC transcription", url: "https://abcnotation.com/tunePage?a=trillian.mit.edu/~jc/music/book/EverydaySongBook/115_America_the_Beautiful/0000" },
    { what: "incipit 55335 52234 56755", url: "https://hymnary.org/tune/materna_ward" },
  ],
};

export const AMAZING_GRACE: Hymn = {
  id: "amazing-grace-new-britain",
  title: "Amazing Grace",
  tune: "New Britain",
  composer: "Traditional (New Britain, American, 1829)",
  textAuthor: "John Newton (verses 1-3, 1779); verse 4 from A Collection of Sacred Ballads (1790)",
  bpm: 72,
  beatsPerBar: 3,
  transpose: 0,
  sourceKey: "G major",
  key: "G major",
  sourceTonic: 7,
  splitPoint: 55,
  intro: {
    melody: "R:2 D4:1 | G4:2 B4:0.5 G4:0.5 | B4:2 A4:1 | G4:3",
    chords: "G:3 | G:3 | G/D:2 D7:1 | G:3",
  },
  verse: {
    melody: [
      "R:2 D4:1",
      "G4:2 B4:0.5 ~G4:0.5 | B4:2 A4:1 | G4:2 E4:1 | D4:2, D4:1",
      "G4:2 B4:0.5 ~G4:0.5 | B4:2 A4:1 | D5:2, B4:1",
      "D5:1.5 ~B4:0.5 D5:0.5 ~B4:0.5 | G4:2 D4:1 | E4:1.5 ~G4:0.5 G4:0.5 ~E4:0.5 | D4:2, D4:1",
      "G4:2 B4:0.5 ~G4:0.5 | B4:2 A4:1 | G4:3",
    ].join(" | "),
    chords: [
      "G:3",
      "G:3 | G:2 D:1 | C:3 | G:3",
      "G:3 | G:2 D:1 | D:2 G:1",
      "G:3 | G:3 | C:3 | G:3",
      "G:3 | G/D:2 D7:1 | G:3",
    ].join(" | "),
  },
  ending: { melody: "R:3 | R:3", chords: "G:3 | G:3" },
  verses: [
    "A-ma-zing grace how sweet the sound that saved a wretch like me I once was lost but now am found was blind but now I see",
    "'Twas grace that taught my heart to fear and grace my fears re-lieved how pre-cious did that grace ap-pear the hour I first be-lieved",
    "Through ma-ny dan-gers toils and snares I have al-rea-dy come 'Tis grace hath brought me safe thus far and grace will lead me home",
    "When we've been there ten thou-sand years bright shi-ning as the sun we've no less days to sing God's praise than when we first be-gun",
  ],
  incipit: "513132165513132",
  sources: [
    { what: "melody and verses 1-3 (Olney Hymns, 1779): the Amazing Grace article's engraved score and quotation", url: "https://en.wikipedia.org/wiki/Amazing_Grace" },
    { what: "verse 4: Jerusalem, My Happy Home, in A Collection of Sacred Ballads (1790), quoted in the same article", url: "https://en.wikipedia.org/wiki/Amazing_Grace" },
    { what: "incipit 51313 21655 13132", url: "https://hymnary.org/tune/new_britain" },
  ],
};

export const HYMNS: Hymn[] = [AMERICA_THE_BEAUTIFUL, AMAZING_GRACE];

export function getHymn(id: string): Hymn | undefined {
  return HYMNS.find((h) => h.id === id);
}

/**
 * Where an exemplar's notes come from: this module. No exemplar MIDI file is
 * committed. The derived-content guard admits a tracked MIDI file only as a
 * cleared library song's evidenced file, and the song library feeds the
 * datasets, its audited count and the npm ship list. The arrangement is
 * deterministic, so the clock builder and the bed renderer build it here.
 */
export const EXEMPLAR_SOURCE = "src/vocal/hymns.ts";

/** The song config an exemplar's entry is built with. */
export function exemplarConfig(hymn: Hymn): SongConfig {
  return {
    id: hymn.id,
    title: hymn.title,
    genre: "folk",
    composer: hymn.composer,
    difficulty: "beginner",
    key: hymn.key,
    splitPoint: hymn.splitPoint,
    tempo: hymn.bpm,
    timeSignature: `${hymn.beatsPerBar}/4`,
    tags: ["folk", "hymn", "vocal-exemplar", "public-domain"],
    status: "ready",
    musicalLanguage: {
      description: `The hymn tune ${hymn.tune} set as a whole song for a sung exemplar, in ${hymn.key} at ${hymn.bpm} BPM.`,
      structure: `A piano introduction, ${hymn.verses.length} verses, and a held final chord.`,
      keyMoments: ["The introduction states the tune's last line on the piano alone."],
      teachingGoals: ["Strophic form: one tune, several texts."],
      styleTips: ["Bring the melody out over the chord tone beneath it."],
    },
  } as SongConfig;
}

/** An exemplar's MIDI (built in memory) and song entry, or null for another id. */
export function loadExemplarSong(id: string): { midiFile: string; midiBytes: Uint8Array; song: SongEntry } | null {
  const hymn = getHymn(id);
  if (!hymn) return null;
  const midiBytes = hymnMidi(hymn);
  return { midiFile: `${EXEMPLAR_SOURCE}#${id}`, midiBytes, song: midiToSongEntry(midiBytes, exemplarConfig(hymn)) };
}

// ─── Parsing ────────────────────────────────────────────────────────────────

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#5" → 73, "Bb3" → 58. */
export function pitch(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`not a pitch: ${name}`);
  return (Number(m[3]) + 1) * 12 + PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}

export interface MelodyEvent {
  /** MIDI pitch in the written key, or null for a rest. */
  midi: number | null;
  beats: number;
  /** The previous syllable continues onto this note. */
  held: boolean;
  /** The singer breathes after this note. */
  breath: boolean;
  bar: number;
}

export interface ChordEvent {
  /** Pitch classes in the written key, root first. */
  pcs: number[];
  /** Pitch class of the bass (the root unless a slash names another). */
  bass: number;
  beats: number;
  bar: number;
  name: string;
}

const QUALITY: Record<string, number[]> = { "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], dim: [0, 3, 6] };

function bars(text: string, beatsPerBar: number, what: string): string[][] {
  const out = text.split("|").map((b) => b.trim().split(/\s+/).filter(Boolean));
  out.forEach((tokens, i) => {
    const sum = tokens.reduce((s, t) => s + Number(t.split(":")[1]), 0);
    if (Math.abs(sum - beatsPerBar) > 1e-9) throw new Error(`${what} bar ${i + 1} has ${sum} beats, not ${beatsPerBar}: ${tokens.join(" ")}`);
  });
  return out;
}

export function parseMelody(text: string, beatsPerBar: number): MelodyEvent[] {
  return bars(text, beatsPerBar, "melody").flatMap((tokens, bar) => tokens.map((t) => {
    const m = /^(~?)([A-G][#b]?-?\d|R):([\d.]+)(,?)$/.exec(t);
    if (!m) throw new Error(`melody token '${t}'`);
    const rest = m[2] === "R";
    if (rest && (m[1] || m[4])) throw new Error(`a rest cannot be held or breathed: '${t}'`);
    return { midi: rest ? null : pitch(m[2]), beats: Number(m[3]), held: m[1] === "~", breath: m[4] === ",", bar };
  }));
}

export function parseChords(text: string, beatsPerBar: number): ChordEvent[] {
  return bars(text, beatsPerBar, "chords").flatMap((tokens, bar) => tokens.map((t) => {
    const m = /^([A-G][#b]?)(m|7|dim|)(?:\/([A-G][#b]?))?:([\d.]+)$/.exec(t);
    if (!m) throw new Error(`chord token '${t}'`);
    const root = pitch(`${m[1]}4`) % 12;
    const pcs = QUALITY[m[2]].map((i) => (root + i) % 12);
    const bass = m[3] ? pitch(`${m[3]}4`) % 12 : root;
    if (!pcs.includes(bass)) throw new Error(`chord '${t}': the bass is not a chord tone`);
    return { pcs, bass, beats: Number(m[4]), bar, name: t.split(":")[0] };
  }));
}

/** The verse's syllables with `_` where the tune holds a syllable, ready for the clock. */
export function verseLyrics(hymn: Hymn, verse: string): string {
  const notes = parseMelody(hymn.verse.melody, hymn.beatsPerBar).filter((e) => e.midi !== null);
  const syllables = verse.trim().split(/\s+/).flatMap((w) => w.split("-").map((s, i, a) => (i < a.length - 1 ? `${s}-` : `${s} `)));
  const holds = notes.filter((n) => n.held).length;
  if (syllables.length !== notes.length - holds) {
    throw new Error(`${hymn.id}: verse has ${syllables.length} syllables, the tune ${notes.length - holds} (${notes.length} notes, ${holds} held)`);
  }
  let k = 0;
  let out = "";
  for (const n of notes) {
    if (n.held) {
      // Inside a word ("pre-" held) the hold is a part of it; after a word, its own token.
      out += out.endsWith("-") ? "_-" : "_ ";
    } else {
      out += syllables[k++];
    }
  }
  return out.trim();
}

/** Every verse, in order, as the clock's `--lyrics`. */
export function hymnLyrics(id: string): string | undefined {
  const hymn = getHymn(id);
  return hymn?.verses.map((v) => verseLyrics(hymn, v)).join(" ");
}

// ─── Realization ────────────────────────────────────────────────────────────

export interface Note {
  midi: number;
  /** Ticks at PPQ. */
  tick: number;
  dur: number;
  velocity: number;
}

export interface Realized {
  /** Track name → notes. MELODY is the sung line (breaths shortened); the clock reads it. */
  tracks: Record<"MELODY" | "INTRO" | "ALTO" | "FILL" | "TENOR" | "BASS", Note[]>;
  totalTicks: number;
  bars: number;
  /** First bar of each verse (1-based), in order. */
  verseBars: number[];
}

/** The highest note of pitch class set `pcs` in [lo, hi], or null. */
function highest(pcs: number[], lo: number, hi: number): number | null {
  for (let p = hi; p >= lo; p--) if (pcs.includes(((p % 12) + 12) % 12)) return p;
  return null;
}

/** The lowest note of pitch class `pc` at or above `lo`. */
function lowestOf(pc: number, lo: number): number {
  let p = lo;
  while (((p % 12) + 12) % 12 !== pc) p++;
  return p;
}

/**
 * What to realize: by default the exemplar's whole song (the hymn's intro,
 * every verse, its ending). The library's teaching copy of a tune takes one
 * verse with its own short intro and ending.
 */
export interface RealizeOptions {
  intro?: HymnSection;
  verses?: number;
  ending?: HymnSection;
}

export function realizeHymn(hymn: Hymn, opts: RealizeOptions = {}): Realized {
  const T = hymn.transpose;
  const B = hymn.beatsPerBar;
  const tracks: Realized["tracks"] = { MELODY: [], INTRO: [], ALTO: [], FILL: [], TENOR: [], BASS: [] };
  const verses = opts.verses ?? hymn.verses.length;
  if (verses < 1 || verses > hymn.verses.length) throw new Error(`${hymn.id}: ${verses} verses (it has ${hymn.verses.length})`);
  const sections: Array<{ part: HymnSection; sung: boolean }> = [
    { part: opts.intro ?? hymn.intro, sung: false },
    ...Array.from({ length: verses }, () => ({ part: hymn.verse, sung: true })),
    { part: opts.ending ?? hymn.ending, sung: false },
  ];
  const verseBars: number[] = [];
  let tick = 0;
  let bar = 0;
  const ticks = (beats: number) => Math.round(beats * PPQ);

  for (const { part, sung } of sections) {
    const melody = parseMelody(part.melody, B);
    const chords = parseChords(part.chords, B);
    if (sung) verseBars.push(bar + 1);
    const start = tick;
    // Chord spans in absolute ticks, transposed.
    const spans: Array<{ at: number; end: number; pcs: number[]; bass: number }> = [];
    let c = start;
    for (const ch of chords) {
      spans.push({ at: c, end: c + ticks(ch.beats), pcs: ch.pcs.map((p) => (p + T + 120) % 12), bass: (ch.bass + T + 120) % 12 });
      c += ticks(ch.beats);
    }
    const chordAt = (t: number) => {
      const s = spans.find((x) => x.at <= t && t < x.end);
      if (!s) throw new Error(`${hymn.id}: no chord at tick ${t}`);
      return s;
    };

    // Left hand: bass and tenor on every chord.
    for (const s of spans) {
      const bass = lowestOf(s.bass, 34);
      // The tenor doubles the bass only when no other chord tone fits under the split.
      const tenor = highest(s.pcs.filter((p) => p !== s.bass), bass + 3, hymn.splitPoint - 1)
        ?? highest(s.pcs, bass + 3, hymn.splitPoint - 1);
      if (tenor === null) throw new Error(`${hymn.id}: no tenor for the chord at tick ${s.at}`);
      tracks.BASS.push({ midi: bass, tick: s.at, dur: s.end - s.at, velocity: 62 });
      tracks.TENOR.push({ midi: tenor, tick: s.at, dur: s.end - s.at, velocity: 56 });
    }

    // Right hand: the melody with a chord tone under it, or the chord where it rests.
    let t = start;
    for (const ev of melody) {
      const len = ticks(ev.beats);
      if (ev.midi === null) {
        // A rest may span chord changes: fill each piece with its own chord.
        let at = t;
        while (at < t + len) {
          const s = chordAt(at);
          const end = Math.min(s.end, t + len);
          const top = highest(s.pcs, hymn.splitPoint, hymn.splitPoint + 11);
          const under = top === null ? null : highest(s.pcs, hymn.splitPoint, top - 1);
          if (top === null || under === null) throw new Error(`${hymn.id}: no right-hand chord at tick ${at}`);
          tracks.FILL.push({ midi: top, tick: at, dur: end - at, velocity: 58 }, { midi: under, tick: at, dur: end - at, velocity: 58 });
          at = end;
        }
      } else {
        const midi = ev.midi + T;
        const s = chordAt(t);
        const alto = highest(s.pcs, hymn.splitPoint, midi - 3);
        if (alto === null) throw new Error(`${hymn.id}: no chord tone under ${midi} at tick ${t} (split ${hymn.splitPoint})`);
        tracks.ALTO.push({ midi: alto, tick: t, dur: len, velocity: 62 });
        if (sung) {
          const breath = ev.breath ? ticks(BREATH_BEATS) : 0;
          tracks.MELODY.push({ midi, tick: t, dur: len - breath, velocity: 88 });
        } else {
          tracks.INTRO.push({ midi, tick: t, dur: len, velocity: 80 });
        }
      }
      t += len;
    }
    if (t !== c) throw new Error(`${hymn.id}: melody (${t - start} ticks) and chords (${c - start} ticks) differ in length`);
    tick = t;
    bar += t === start ? 0 : Math.round((t - start) / ticks(B));
  }

  const realized = { tracks, totalTicks: tick, bars: bar, verseBars };
  assertGapless(realized, hymn.splitPoint);
  return realized;
}

/**
 * Each hand must be a chain of chords with no gap and no overlap: at every
 * onset, the longest note sounding from it ends exactly at the next onset.
 * That is the only shape the session engine plays on time.
 */
export function assertGapless(r: Realized, splitPoint: number): void {
  const all = Object.values(r.tracks).flat();
  for (const [hand, notes] of [["right", all.filter((n) => n.midi >= splitPoint)], ["left", all.filter((n) => n.midi < splitPoint)]] as const) {
    const onsets = [...new Set(notes.map((n) => n.tick))].sort((a, b) => a - b);
    if (onsets[0] !== 0) throw new Error(`${hand} hand does not start at 0`);
    onsets.forEach((at, i) => {
      const next = i + 1 < onsets.length ? onsets[i + 1] : r.totalTicks;
      const longest = Math.max(...notes.filter((n) => n.tick === at).map((n) => n.dur));
      if (longest !== next - at) throw new Error(`${hand} hand at tick ${at}: longest note ${longest} ticks, next onset in ${next - at}`);
    });
  }
}

// ─── MIDI ───────────────────────────────────────────────────────────────────

type MidiEvent = { deltaTime: number; type: string; meta?: boolean; [key: string]: unknown };

function midiTrack(name: string, notes: Note[]): MidiEvent[] {
  const raw = notes.flatMap((n) => [
    { tick: n.tick, on: true, n },
    { tick: n.tick + n.dur, on: false, n },
  ]);
  // Note-offs before note-ons at the same tick, so a repeated pitch re-strikes.
  raw.sort((a, b) => a.tick - b.tick || Number(a.on) - Number(b.on) || a.n.midi - b.n.midi);
  const events: MidiEvent[] = [{ deltaTime: 0, type: "trackName", meta: true, text: name }];
  let prev = 0;
  for (const r of raw) {
    events.push({ deltaTime: r.tick - prev, type: r.on ? "noteOn" : "noteOff", channel: 0, noteNumber: r.n.midi, velocity: r.on ? r.n.velocity : 0 });
    prev = r.tick;
  }
  events.push({ deltaTime: 0, type: "endOfTrack", meta: true });
  return events;
}

/** The arrangement as a format-1 MIDI file: a meta track, then one track per voice (MELODY is the sung line). */
export function hymnMidi(hymn: Hymn, opts: RealizeOptions = {}, title = `${hymn.title} (${hymn.tune})`): Uint8Array {
  const r = realizeHymn(hymn, opts);
  const meta: MidiEvent[] = [
    { deltaTime: 0, type: "timeSignature", meta: true, numerator: hymn.beatsPerBar, denominator: 4, metronome: 24, thirtyseconds: 8 },
    { deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: Math.round(60_000_000 / hymn.bpm) },
    { deltaTime: 0, type: "text", meta: true, text: title },
    { deltaTime: 0, type: "endOfTrack", meta: true },
  ];
  const names = ["MELODY", "INTRO", "ALTO", "FILL", "TENOR", "BASS"] as const;
  return new Uint8Array(writeMidi({
    header: { format: 1, numTracks: names.length + 1, ticksPerBeat: PPQ },
    tracks: [meta, ...names.map((n) => midiTrack(n, r.tracks[n]))],
  } as never));
}
