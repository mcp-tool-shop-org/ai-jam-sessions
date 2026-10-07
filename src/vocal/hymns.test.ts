import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveScoreClock, sessionSchedule, syllabify } from "./score-clock.js";
import {
  HYMNS, AMAZING_GRACE, AMERICA_THE_BEAUTIFUL, BREATH_BEATS, PPQ,
  hymnLyrics, hymnMidi, loadExemplarSong, parseMelody, realizeHymn, verseLyrics, assertGapless, type Hymn,
} from "./hymns.js";

/** Scale degree (1-7) of a pitch in a major key, or 0 if it is chromatic. */
function degree(midi: number, tonic: number): number {
  return [0, 2, 4, 5, 7, 9, 11].indexOf((((midi - tonic) % 12) + 12) % 12) + 1;
}

function songOf(hymn: Hymn) {
  const ex = loadExemplarSong(hymn.id)!;
  return { bytes: ex.midiBytes, song: ex.song };
}

describe.each(HYMNS.map((h) => [h.id, h] as const))("%s", (_id, hymn) => {
  it("sings the hymn's own tune: its first 15 notes are Hymnary.org's incipit", () => {
    const notes = parseMelody(hymn.verse.melody, hymn.beatsPerBar).filter((e) => e.midi !== null);
    const degrees = notes.slice(0, 15).map((n) => degree(n.midi!, hymn.sourceTonic)).join("");
    expect(degrees).toBe(hymn.incipit);
  });

  it("has a syllable for every note of every verse, the tune's held notes aside", () => {
    for (const v of hymn.verses) expect(() => verseLyrics(hymn, v)).not.toThrow();
    const lyrics = hymnLyrics(hymn.id)!;
    expect(syllabify(lyrics)).toHaveLength(realizeHymn(hymn).tracks.MELODY.length);
  });

  it("keeps the sung line between C4 and D5", () => {
    const sung = realizeHymn(hymn).tracks.MELODY.map((n) => n.midi);
    expect(Math.min(...sung)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...sung)).toBeLessThanOrEqual(74);
  });

  it("plays on the score's time: every bar of the session lasts exactly its beats", () => {
    const { song } = songOf(hymn);
    const r = realizeHymn(hymn);
    const s = sessionSchedule(song);
    expect(s.measureStarts).toHaveLength(r.bars);
    const bar = hymn.beatsPerBar * (60 / hymn.bpm);
    for (const m of s.measureStarts) expect(m.dur).toBeCloseTo(bar, 3);
  });

  it("derives a whole-song clock: every syllable on a piano onset, a breath at every phrase end", () => {
    const { bytes, song } = songOf(hymn);
    const r = realizeHymn(hymn);
    const clock = deriveScoreClock(song, {
      midiFile: `src/vocal/hymns.ts#${hymn.id}`, midiBytes: bytes, melodyTrack: "MELODY",
      lyrics: hymnLyrics(hymn.id)!, startMeasure: 1, endMeasure: r.bars, rests: true,
    });
    const verse = parseMelody(hymn.verse.melody, hymn.beatsPerBar).filter((e) => e.midi !== null);
    const held = verse.filter((n) => n.held).length;
    const breaths = verse.filter((n) => n.breath).length;
    expect(clock.events).toHaveLength((verse.length - held) * hymn.verses.length);
    expect(clock.events.reduce((k, e) => k + (e.melisma?.length ?? 0), 0)).toBe(held * hymn.verses.length);
    expect(clock.events.every((e) => e.anchor.startsWith("piano-onset:"))).toBe(true);
    const gaps = clock.events.slice(1).map((e, i) => e.t_sec - (clock.events[i].t_sec + clock.events[i].dur_sec)).filter((g) => g > 0.01);
    const breath = BREATH_BEATS * (60 / hymn.bpm);
    expect(gaps.filter((g) => Math.abs(g - breath) < 1e-3)).toHaveLength(breaths * hymn.verses.length);
    expect(gaps.filter((g) => g > breath + 0.5)).toHaveLength(hymn.verses.length - 1);
    expect(clock.events[0].t_sec).toBeCloseTo(((r.verseBars[0] - 1) * hymn.beatsPerBar + parseMelody(hymn.verse.melody, hymn.beatsPerBar)[0].beats) * (60 / hymn.bpm), 6);
  });

  it("has a committed clock that is current: derived again, it is the same", () => {
    const { bytes, song } = songOf(hymn);
    const committed = JSON.parse(readFileSync(join(process.cwd(), "scores", `${hymn.id}.score-clock.v1.json`), "utf8"));
    expect(committed.midi.file).toBe(`src/vocal/hymns.ts#${hymn.id}`);
    const derived = deriveScoreClock(song, {
      midiFile: committed.midi.file, midiBytes: bytes, melodyTrack: "MELODY",
      lyrics: hymnLyrics(hymn.id)!, startMeasure: 1, endMeasure: realizeHymn(hymn).bars, rests: true,
    });
    expect(JSON.parse(JSON.stringify(derived))).toEqual(committed);
  });
});

describe("the exemplars stay out of the song library", () => {
  it("are built in memory from this module, and the loader knows no other id", () => {
    const ex = loadExemplarSong(AMAZING_GRACE.id)!;
    expect(ex.midiFile).toBe("src/vocal/hymns.ts#amazing-grace-new-britain");
    expect(ex.song.id).toBe(AMAZING_GRACE.id);
    expect(Buffer.compare(Buffer.from(ex.midiBytes), Buffer.from(hymnMidi(AMAZING_GRACE)))).toBe(0);
    expect(loadExemplarSong("amazing-grace")).toBeNull();
  });
});

describe("hymn realization refuses what the engine cannot play on time", () => {
  it("refuses a hand with a gap", () => {
    const r = realizeHymn(AMAZING_GRACE);
    r.tracks.BASS[0] = { ...r.tracks.BASS[0], dur: r.tracks.BASS[0].dur - PPQ };
    r.tracks.TENOR[0] = { ...r.tracks.TENOR[0], dur: r.tracks.TENOR[0].dur - PPQ };
    expect(() => assertGapless(r, AMAZING_GRACE.splitPoint)).toThrow(/left hand at tick 0/);
  });

  it("refuses a bar with the wrong number of beats, and a verse that does not fit its tune", () => {
    expect(() => parseMelody("G4:2 | G4:1", 3)).toThrow(/bar 1 has 2 beats/);
    expect(() => verseLyrics(AMERICA_THE_BEAUTIFUL, "O beau-ti-ful")).toThrow(/4 syllables, the tune 56/);
  });

  it("marks a held note inside a word as part of it", () => {
    expect(verseLyrics(AMAZING_GRACE, AMAZING_GRACE.verses[1])).toContain("pre-_-cious");
    expect(verseLyrics(AMAZING_GRACE, AMAZING_GRACE.verses[0]).startsWith("A-ma-zing _ grace")).toBe(true);
  });
});
