import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initializeFromLibrary, getSong } from "../songs/index.js";
import type { SongEntry } from "../songs/types.js";
import { writeMidi } from "midi-file";
import { midiToSongEntry } from "../songs/midi/ingest.js";
import type { SongConfig } from "../songs/config/schema.js";
import {
  parseMidiTracks,
  sessionSchedule,
  syllabify,
  deriveScoreClock,
  roundToSample,
  SCORE_CLOCK_SCHEMA,
  detectMelodyTrack,
} from "./score-clock.js";

const MIDI = join(process.cwd(), "songs", "library", "classical", "satie-gymnopedie-no1.mid");
const LYRICS = "Gym-no-pe-die";

let song: SongEntry;
beforeAll(() => {
  initializeFromLibrary(join(process.cwd(), "songs", "library"), join(process.cwd(), "tmp", "no-user-songs"));
  song = getSong("satie-gymnopedie-no1")!;
});

describe("parseMidiTracks", () => {
  it("reads the tick map of the arrangement (3/4 at 60 BPM, 384 ppq)", () => {
    const { info, tracks } = parseMidiTracks(readFileSync(MIDI));
    expect(info.ppq).toBe(384);
    expect(info.numerator).toBe(3);
    expect(info.denominator).toBe(4);
    expect(info.bpm).toBeCloseTo(60, 6);
    expect(info.ticksPerMeasure).toBe(1152);
    expect(info.trackNames).toContain("treble:");
    const treble = tracks.find((t) => t.name === "treble:")!;
    // Gymnopédie opening: B D F# / A C# F# (two voicings of the vamp)
    expect(treble.notes.slice(0, 14).map((n) => n.midi)).toEqual([59, 62, 66, 57, 61, 66, 59, 62, 66, 57, 61, 66, 59, 62]);
    expect(treble.notes[0].tick).toBe(384);
    expect(treble.notes[13].tick).toBe(4992);
    expect(treble.notes[0].durationTicks).toBe(768);
  });
});

describe("sessionSchedule", () => {
  it("follows the player: measures start when the longer hand finishes", () => {
    const s = sessionSchedule(song, 1, 10);
    const starts = s.measureStarts.map((m) => +m.start.toFixed(4));
    expect(starts).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45]);
    expect(s.endSec).toBeCloseTo(50, 6);
    const m4 = s.notes.filter((n) => n.measure === 4 && n.hand === "right");
    expect(Math.min(...m4.map((n) => n.t))).toBeCloseTo(15, 6);
  });

  it("omits rests but still advances the cursor", () => {
    const s = sessionSchedule(song, 1, 2);
    expect(s.notes.every((n) => n.midi >= 0)).toBe(true);
    const m2 = s.notes.filter((n) => n.measure === 2 && n.midi === 61).map((n) => +n.t.toFixed(4));
    expect(m2).toEqual([5]);
  });
});

describe("syllabify", () => {
  it("keeps the whole word a transcriber will report", () => {
    const s = syllabify("A-ma-zing grace");
    expect(s).toEqual([
      { lyric: "A", word: "Amazing", syllable: 0, syllables: 3 },
      { lyric: "ma", word: "Amazing", syllable: 1, syllables: 3 },
      { lyric: "zing", word: "Amazing", syllable: 2, syllables: 3 },
      { lyric: "grace", word: "grace", syllable: 0, syllables: 1 },
    ]);
  });
});

describe("syllabify: held syllables", () => {
  it("'_' holds the previous syllable onto the next note", () => {
    const s = syllabify("A-ma-zing _ grace");
    expect(s).toHaveLength(5);
    expect(s[3]).toEqual({ lyric: "zing", word: "Amazing", syllable: 2, syllables: 3, continues: true });
    expect(s[4]).toEqual({ lyric: "grace", word: "grace", syllable: 0, syllables: 1 });
  });

  it("holds a syllable inside a word, and the word stays whole", () => {
    const s = syllabify("how pre-_-cious");
    expect(s.map((x) => [x.lyric, x.word, x.syllable, x.syllables, x.continues ?? false])).toEqual([
      ["how", "how", 0, 1, false],
      ["pre", "precious", 0, 2, false],
      ["pre", "precious", 0, 2, true],
      ["cious", "precious", 1, 2, false],
    ]);
    expect(syllabify("A-ma-zing-_ grace")).toEqual(syllabify("A-ma-zing _ grace"));
  });

  it("refuses a hold with nothing to hold", () => {
    expect(() => syllabify("_ grace")).toThrow(/cannot start with '_'/);
    expect(() => syllabify("how _-pre-cious")).toThrow(/before the word's first syllable/);
    expect(() => syllabify("A--ma")).toThrow(/empty syllable/);
  });
});

describe("detectMelodyTrack", () => {
  it("prefers a track named 'treble:' over 'bass:' for Gymnopédie", () => {
    const { tracks } = parseMidiTracks(readFileSync(MIDI));
    const detected = detectMelodyTrack(tracks);
    expect(detected).toBe("treble:");
  });

  it("prefers a named melody track over an unnamed accompaniment track", () => {
    const detected = detectMelodyTrack([
      { name: "", notes: [{ tick: 0, durationTicks: 100, midi: 60, velocity: 80 }] },
      { name: "Melody", notes: [{ tick: 0, durationTicks: 100, midi: 72, velocity: 80 }] },
      { name: "Chords", notes: [{ tick: 0, durationTicks: 100, midi: 48, velocity: 80 }, { tick: 50, durationTicks: 100, midi: 52, velocity: 80 }] },
    ] as any);
    expect(detected).toBe("Melody");
  });

  it("prefers the note-richest track when no name matches", () => {
    const detected = detectMelodyTrack([
      { name: "Drums", notes: [{ tick: 0, durationTicks: 100, midi: 36, velocity: 80 }] },
      { name: "", notes: [{ tick: 0, durationTicks: 100, midi: 60, velocity: 80 }, { tick: 100, durationTicks: 100, midi: 62, velocity: 80 }] },
    ] as any);
    expect(detected).toBe("");
  });

  it("returns null when every track is empty", () => {
    const detected = detectMelodyTrack([
      { name: "Drums", notes: [] },
      { name: "Bass", notes: [] },
    ] as any);
    expect(detected).toBeNull();
  });
});

describe("deriveScoreClock", () => {
  it("puts every syllable on a piano onset of the same pitch, on the session clock", () => {
    const clock = deriveScoreClock(song, {
      midiFile: "songs/library/classical/satie-gymnopedie-no1.mid",
      midiBytes: readFileSync(MIDI),
      melodyTrack: "bass:",
      lyrics: LYRICS,
      startMeasure: 1,
      endMeasure: 8,
    });
    expect(clock.schema).toBe(SCORE_CLOCK_SCHEMA);
    expect(clock.events).toHaveLength(4);
    expect(clock.events.map((e) => e.lyric).join(" ")).toBe("Gym no pe die");
    const t = clock.events.map((e) => +e.t_sec.toFixed(4));
    expect(t).toEqual([0, 5, 10, 15]);
    for (const e of clock.events) {
      expect(e.anchor.startsWith("piano-onset:")).toBe(true);
      expect(e.engine_note?.t_sec).toBe(e.t_sec);
    }
    expect(clock.events[3].dur_sec).toBeCloseTo(5, 4);
    expect(clock.last_event_end_sec).toBeCloseTo(20, 4);
    expect(clock.total_samples).toBe(40 * 48000);
    expect(clock.total_seconds).toBe(40);
    for (const e of clock.events) {
      expect(e.t_samples).toBe(Math.round(e.t_sec * 48000));
      expect(roundToSample(e.t_sec)).toBe(e.t_sec);
    }
    expect(clock.events[1].midi_tick).toBe(1152);
    expect(clock.events[1].t_midi_sec).toBeCloseTo(3, 6);
    expect(clock.midi.ticks_per_measure).toBe(1152);
  });

  const derive = (lyrics: string, rests?: boolean) => deriveScoreClock(song, {
    midiFile: "x.mid", midiBytes: readFileSync(MIDI), melodyTrack: "bass:", lyrics, startMeasure: 1, endMeasure: 8, rests,
  });

  it("is legato by default: each note is held to the next onset, and the clock says nothing about durations", () => {
    const clock = derive(LYRICS);
    expect(clock.events.map((e) => e.dur_sec)).toEqual([5, 5, 5, 5]);
    expect(clock.clock.durations).toBeUndefined();
  });

  it("with notated rests and a melody that never rests, nothing changes but the label", () => {
    // Gymnopédie's bass note fills its bar in the MIDI, so it is legato either way.
    const clock = derive(LYRICS, true);
    expect(clock.events.map((e) => e.dur_sec)).toEqual([5, 5, 5, 5]);
    expect(clock.clock.durations).toBe("notated");
  });

  it("a held syllable is one event, with the notes it continues onto", () => {
    const clock = derive("Gym-no _ pe");
    expect(clock.events.map((e) => e.id)).toEqual(["v00", "v01", "v02"]);
    const no = clock.events[1];
    expect([no.lyric, no.midi, no.t_sec, no.dur_sec]).toEqual(["no", 38, 5, 10]);
    expect(no.melisma).toHaveLength(1);
    expect(no.melisma![0]).toMatchObject({ midi: 43, t_sec: 10, dur_sec: 5, midi_tick: 2304 });
    expect(no.melisma![0].anchor.startsWith("piano-onset:m3:")).toBe(true);
    expect(clock.events[0].melisma).toBeUndefined();
    expect(clock.events[2].t_sec).toBe(15);
  });

  it("with notated rests needs no terminator note, and still refuses too few notes", () => {
    const four = derive(LYRICS, true);
    expect(four.events).toHaveLength(4);
    expect(() => derive("a b c d e f g h i", true)).toThrow(/need 9 \(one per syllable/);
    expect(() => derive("a b c d e f g h i")).toThrow(/need 10 \(syllables \+ terminator\)/);
  });

  it("fails closed on a melody track that is not there", () => {
    expect(() => deriveScoreClock(song, {
      midiFile: "x.mid", midiBytes: readFileSync(MIDI), melodyTrack: "NOPE", lyrics: LYRICS, startMeasure: 1, endMeasure: 8,
    })).toThrow(/melody track 'NOPE'/);
  });
});

// A 4/4 song at 60 BPM (4 s bars): one bar of piano, then two bars sung with a
// breath and a held syllable in the melody. The piano plays the melody over an
// alto that never rests, so the right hand is gapless and the session clock
// matches the score, as an arrangement for singing is written; the breath
// exists only in the melody. The sung line starts in bar 2 because the clock
// treats any off-beat melody note in its first bar as a pickup.
describe("deriveScoreClock: a melody that breathes", () => {
  const Q = 480;
  const B = 4 * Q; // the piano's opening bar
  type N = [midi: number, tick: number, dur: number];
  const track = (name: string, notes: N[]) => {
    const raw = notes.flatMap(([midi, tick, dur]) => [
      { tick, ev: { type: "noteOn", channel: 0, noteNumber: midi, velocity: 80 } },
      { tick: tick + dur, ev: { type: "noteOff", channel: 0, noteNumber: midi, velocity: 0 } },
    ]).sort((a, b) => a.tick - b.tick || (a.ev.type === "noteOff" ? -1 : 1));
    let prev = 0;
    return [
      { deltaTime: 0, type: "trackName", meta: true, text: name },
      ...raw.map((r) => { const e = { deltaTime: r.tick - prev, ...r.ev }; prev = r.tick; return e; }),
      { deltaTime: 0, type: "endOfTrack", meta: true },
    ];
  };
  const build = (melody: N[]) => {
    const meta = [
      { deltaTime: 0, type: "timeSignature", meta: true, numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
      { deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: 1_000_000 },
      { deltaTime: 0, type: "endOfTrack", meta: true },
    ];
    // Alto under the melody's onsets, gapless: whole | half, quarter, quarter | quarter, quarter, half.
    const alto: N[] = [[69, 0, 4 * Q], ...[[0, 2], [2, 1], [3, 1], [4, 1], [5, 1], [6, 2]].map(([b, d]): N => [69, B + b * Q, d * Q])];
    const bass: N[] = [[48, 0, 4 * Q], [48, B, 4 * Q], [48, B + 4 * Q, 4 * Q]];
    const bytes = new Uint8Array(writeMidi({
      header: { format: 1, numTracks: 4, ticksPerBeat: Q },
      tracks: [meta, track("MEL", melody), track("ALTO", alto), track("BASS", bass)],
    } as any));
    const song = midiToSongEntry(bytes, {
      id: "breath-test", title: "Breath Test", genre: "folk", difficulty: "beginner", key: "C major",
      tags: ["test"], status: "raw", tempo: 60, timeSignature: "4/4",
    } as SongConfig);
    return (lyrics: string, rests?: boolean) => deriveScoreClock(song, {
      midiFile: "breath.mid", midiBytes: bytes, melodyTrack: "MEL", lyrics, startMeasure: 1, endMeasure: 3, rests,
    });
  };
  // do (half, then a quarter rest) re | mi (held onto fa) fa-note | sol (half)
  const melody: N[] = [[72, B, 2 * Q], [74, B + 3 * Q, Q], [76, B + 4 * Q, Q], [77, B + 5 * Q, Q], [79, B + 6 * Q, 2 * Q]];

  it("ends a note where the melody's note ends: the breath is silence", () => {
    const clock = build(melody)("do re mi _ sol", true);
    expect(clock.events.map((e) => [e.lyric, e.t_sec, e.dur_sec])).toEqual([
      ["do", 4, 2], ["re", 7, 1], ["mi", 8, 2], ["sol", 10, 2],
    ]);
    expect(clock.events[2].melisma).toEqual([expect.objectContaining({ midi: 77, t_sec: 9, dur_sec: 1 })]);
    expect(clock.last_event_end_sec).toBe(12);
  });

  it("is legato without --rests: the breath is held over", () => {
    const clock = build(melody)("do re mi _", false);
    expect(clock.events.map((e) => [e.lyric, e.dur_sec])).toEqual([["do", 3], ["re", 1], ["mi", 2]]);
  });

  it("refuses a song that ends on a pickup: with notated rests it has no end", () => {
    // An off-beat note in the clock's first bar is taken as a pickup, which carries no length.
    expect(() => build([[72, 3 * Q, Q]])("do", true)).toThrow(/a pickup cannot close a song/);
  });

  it("refuses a rest inside a held syllable", () => {
    const gapped: N[] = [[72, B, 2 * Q], [74, B + 3 * Q, Q], [76, B + 4 * Q, Q / 2], [77, B + 5 * Q, Q], [79, B + 6 * Q, 2 * Q]];
    expect(() => build(gapped)("do re mi _ sol", true)).toThrow(/a rest inside a held syllable/);
  });
});
