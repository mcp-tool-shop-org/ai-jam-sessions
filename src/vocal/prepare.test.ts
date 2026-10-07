import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEngineG2P } from "./g2p.js";
import {
  accompanimentEngineForLyrics,
  prepareScoreLocked,
  resolveLyricsText,
} from "./prepare.js";
import { buildScoreLockedVocals } from "./score-locked.js";
import { deriveScoreClock } from "./score-clock.js";
import type { SongEntry } from "../songs/types.js";

const gate = vi.hoisted(() => ({
  forceNull: false,
  detectCalls: 0,
  score: {
    connect: async () => {},
    start: () => {},
    stop: async () => {},
    durationSec: 1.25,
    warnings: ["sentinel-score"],
  },
  soulx: {
    connect: async () => {},
    start: () => {},
    stop: async () => {},
    durationSec: 2.5,
    warnings: ["sentinel-soulx"],
  },
  scoreCalls: [] as Array<{ preset?: string; backend?: string }>,
  soulxCalls: [] as Array<{
    clock: ReturnType<typeof import("./score-clock.js").deriveScoreClock>;
    config: { promptWav?: string; promptMeta?: string };
  }>,
}));

vi.mock("./score-clock.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./score-clock.js")>();
  return {
    ...actual,
    detectMelodyTrack: (tracks: Parameters<typeof actual.detectMelodyTrack>[0]) => {
      gate.detectCalls += 1;
      if (gate.forceNull) return null;
      return actual.detectMelodyTrack(tracks);
    },
  };
});

vi.mock("./score-singer.js", () => ({
  createScoreSinger: (_score: unknown, options: { preset?: string; backend?: string }) => {
    gate.scoreCalls.push(options);
    return gate.score;
  },
}));

vi.mock("./soulx-singer.js", () => ({
  createSoulxScoreSinger: (
    clock: (typeof gate.soulxCalls)[number]["clock"],
    config: { promptWav?: string; promptMeta?: string },
  ) => {
    gate.soulxCalls.push({ clock, config });
    return gate.soulx;
  },
}));

function coverSong(id: string): SongEntry {
  return {
    id,
    title: "Cover Song",
    genre: "folk",
    difficulty: "beginner",
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    durationSeconds: 2,
    tags: ["coverage"],
    musicalLanguage: {
      description: "Two quarters.",
      structure: "A",
      keyMoments: [],
      teachingGoals: [],
      styleTips: [],
    },
    measures: [
      { number: 1, rightHand: "C4:q", leftHand: "C3:q" },
      { number: 2, rightHand: "C4:q", leftHand: "C3:q" },
    ],
  };
}

function smf(track: Buffer): Buffer {
  const header = Buffer.from([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xe0,
  ]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(track.length, 0);
  return Buffer.concat([header, Buffer.from("MTrk"), len, track]);
}

function melodyMidi(): Buffer {
  const track = Buffer.from([
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
    0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
    0x00, 0xff, 0x03, 0x06, 0x6d, 0x65, 0x6c, 0x6f, 0x64, 0x79,
    0x00, 0x90, 0x3c, 0x50,
    0x83, 0x60, 0x80, 0x3c, 0x00,
    0x8b, 0x20, 0x90, 0x3c, 0x50,
    0x83, 0x60, 0x80, 0x3c, 0x00,
    0x00, 0xff, 0x2f, 0x00,
  ]);
  return smf(track);
}

function emptyMidi(): Buffer {
  const track = Buffer.from([
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
    0x00, 0xff, 0x03, 0x05, 0x64, 0x72, 0x75, 0x6d, 0x73,
    0x00, 0xff, 0x2f, 0x00,
  ]);
  return smf(track);
}

describe("resolveLyricsText", () => {
  it("returns the lyrics file bytes unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "lyrics-file-"));
    const lyricsFile = join(dir, "verse.txt");
    writeFileSync(lyricsFile, "verse\n", "utf8");
    expect(resolveLyricsText({ lyricsFile, lyrics: "from-req" }, "amazing-grace")).toBe("verse\n");
  });

  it("throws ENOENT when the lyrics file is missing", () => {
    const missing = join(mkdtempSync(join(tmpdir(), "lyrics-miss-")), "no-lyrics.txt");
    let caught: unknown;
    try {
      resolveLyricsText({ lyricsFile: missing });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as NodeJS.ErrnoException).code).toBe("ENOENT");
    expect((caught as Error).message).toBe(
      `ENOENT: no such file or directory, open '${missing}'`,
    );
  });

  it("returns a non-empty lyrics string without trimming it", () => {
    expect(resolveLyricsText({ lyrics: "  la  " }, "amazing-grace")).toBe("  la  ");
  });

  it("returns the amazing-grace tune when the request has no lyrics", () => {
    expect(resolveLyricsText({ lyrics: "   " }, "amazing-grace")).toBe(
      "A-ma-zing grace how sweet the sound that saved a wretch like me",
    );
  });

  it("returns null when nothing was requested and the song has no tune", () => {
    expect(resolveLyricsText({}, "cover-song")).toBe(null);
    expect(resolveLyricsText({ lyrics: " \n\t" })).toBe(null);
  });
});

describe("accompanimentEngineForLyrics", () => {
  it("replaces singing engines with the accompaniment that stays", () => {
    expect(accompanimentEngineForLyrics("synth")).toBe("piano");
    expect(accompanimentEngineForLyrics("vocal")).toBe("piano");
    expect(accompanimentEngineForLyrics("tract")).toBe("piano");
    expect(accompanimentEngineForLyrics("vocal+synth")).toBe("piano");
    expect(accompanimentEngineForLyrics("piano+synth")).toBe("piano");
    expect(accompanimentEngineForLyrics("guitar+synth")).toBe("guitar");
    expect(accompanimentEngineForLyrics("piano")).toBe("piano");
    expect(accompanimentEngineForLyrics("guitar")).toBe("guitar");
    expect(accompanimentEngineForLyrics("sample")).toBe("sample");
  });
});

describe("prepareScoreLocked", () => {
  let library: string;

  beforeEach(() => {
    gate.forceNull = false;
    gate.detectCalls = 0;
    gate.scoreCalls = [];
    gate.soulxCalls = [];
    library = mkdtempSync(join(tmpdir(), "lyrics-lib-"));
    mkdirSync(join(library, "folk"));
    writeFileSync(join(library, "folk", "cover-song.mid"), melodyMidi());
    writeFileSync(join(library, "folk", "cover-empty.mid"), emptyMidi());
  });

  it("returns null when the song has no lyrics", async () => {
    expect(await prepareScoreLocked(coverSong("cover-song"), {})).toBe(null);
  });

  it("returns the built score and the score singer for the default kokoro backend", async () => {
    const song = coverSong("cover-song");
    const g2p = await loadEngineG2P();
    const expected = buildScoreLockedVocals(song, { lyrics: "la", g2p });
    const result = await prepareScoreLocked(song, { lyrics: "la" });
    expect(result).toEqual({ score: expected, singer: gate.score });
    expect(gate.scoreCalls).toEqual([{ preset: undefined, backend: "kokoro" }]);
    expect(gate.soulxCalls).toEqual([]);
  });

  it("forwards a tract backend and preset to the score singer", async () => {
    const song = coverSong("cover-song");
    const g2p = await loadEngineG2P();
    const expected = buildScoreLockedVocals(song, { lyrics: "la", g2p });
    const result = await prepareScoreLocked(song, { lyrics: "la", backend: "tract", preset: "bright-lab" });
    expect(result).toEqual({ score: expected, singer: gate.score });
    expect(gate.scoreCalls).toEqual([{ preset: "bright-lab", backend: "tract" }]);
  });

  it("refuses soulx when libraryDir is missing", async () => {
    let caught: unknown;
    try {
      await prepareScoreLocked(coverSong("cover-song"), { lyrics: "la", backend: "soulx" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      "SoulX backend requires libraryDir (the path to songs/library) so the score clock can be derived from the MIDI file.",
    );
  });

  it("builds a soulx singer from the auto-detected melody track", async () => {
    const song = coverSong("cover-song");
    const midiPath = join(library, "folk", "cover-song.mid");
    const midiBytes = new Uint8Array(readFileSync(midiPath));
    const g2p = await loadEngineG2P();
    const expected = buildScoreLockedVocals(song, { lyrics: "la", g2p });
    const clock = deriveScoreClock(song, {
      songId: song.id,
      midiFile: midiPath,
      midiBytes,
      melodyTrack: "melody",
      lyrics: "la",
      startMeasure: 1,
      endMeasure: song.measures.length,
    });
    const result = await prepareScoreLocked(song, {
      lyrics: "la",
      backend: "soulx",
      libraryDir: library,
      soulxPromptWav: join(library, "prompt.wav"),
      soulxPromptMeta: join(library, "prompt.json"),
    });
    expect(gate.detectCalls).toBe(1);
    expect(result).toEqual({ score: expected, singer: gate.soulx });
    expect(gate.soulxCalls).toEqual([{
      clock,
      config: {
        promptWav: join(library, "prompt.wav"),
        promptMeta: join(library, "prompt.json"),
      },
    }]);
    expect(gate.scoreCalls).toEqual([]);
  });

  it("uses an explicit melody track without auto-detect", async () => {
    const song = coverSong("cover-song");
    const midiPath = join(library, "folk", "cover-song.mid");
    const midiBytes = new Uint8Array(readFileSync(midiPath));
    const clock = deriveScoreClock(song, {
      songId: song.id,
      midiFile: midiPath,
      midiBytes,
      melodyTrack: "melody",
      lyrics: "la",
      startMeasure: 1,
      endMeasure: song.measures.length,
    });
    const result = await prepareScoreLocked(song, {
      lyrics: "la",
      backend: "soulx",
      libraryDir: library,
      melodyTrack: "melody",
    });
    expect(gate.detectCalls).toBe(0);
    expect(result?.singer).toBe(gate.soulx);
    expect(gate.soulxCalls[0].clock).toEqual(clock);
    expect(gate.soulxCalls[0].config).toEqual({ promptWav: undefined, promptMeta: undefined });
  });

  it("names the tracks that had notes when auto-detect is forced empty", async () => {
    gate.forceNull = true;
    const midiPath = join(library, "folk", "cover-song.mid");
    let caught: unknown;
    try {
      await prepareScoreLocked(coverSong("cover-song"), {
        lyrics: "la",
        backend: "soulx",
        libraryDir: library,
      });
    } catch (err) {
      caught = err;
    }
    expect(gate.detectCalls).toBe(1);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      `Could not auto-detect melody track in ${midiPath}. Available tracks: "melody". Pass melodyTrack explicitly.`,
    );
  });

  it("names no tracks when every MIDI track is empty", async () => {
    const midiPath = join(library, "folk", "cover-empty.mid");
    let caught: unknown;
    try {
      await prepareScoreLocked(coverSong("cover-empty"), {
        lyrics: "la",
        backend: "soulx",
        libraryDir: library,
      });
    } catch (err) {
      caught = err;
    }
    expect(gate.detectCalls).toBe(1);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      `Could not auto-detect melody track in ${midiPath}. Available tracks: . Pass melodyTrack explicitly.`,
    );
  });
});
