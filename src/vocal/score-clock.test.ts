import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initializeFromLibrary, getSong } from "../songs/index.js";
import type { SongEntry } from "../songs/types.js";
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

  it("refuses a hold with nothing to hold, or a hold inside a word", () => {
    expect(() => syllabify("_ grace")).toThrow(/cannot start with '_'/);
    expect(() => syllabify("A-ma-_ grace")).toThrow(/inside a word/);
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

  it("with notated rests a note ends where the arrangement's note ends", () => {
    // Gymnopédie's bass is a dotted half (3 s at 60 BPM) in each 5 s measure: 2 s of rest.
    const clock = derive(LYRICS, true);
    expect(clock.events.map((e) => +e.t_sec.toFixed(4))).toEqual([0, 5, 10, 15]);
    expect(clock.events.map((e) => e.dur_sec)).toEqual([3, 3, 3, 3]);
    expect(clock.clock.durations).toBe("notated");
    expect(clock.last_event_end_sec).toBeCloseTo(18, 4);
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

  it("refuses a rest inside a held syllable", () => {
    expect(() => derive("Gym-no _ pe", true)).toThrow(/a rest inside a held syllable/);
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
