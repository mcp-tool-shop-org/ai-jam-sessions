import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SongEntry } from "../songs/types.js";

vi.mock("./g2p.js", () => ({
  loadEngineG2P: async () => ({
    wordToSyllables: () => [{ onset: [], nucleus: "AH", coda: [] }],
  }),
}));

const singer = vi.hoisted(() => ({
  createScoreSinger: vi.fn(() => ({ kind: "score-singer" })),
}));

vi.mock("./score-singer.js", () => singer);

import { accompanimentEngineForLyrics, prepareScoreLocked, resolveLyricsText } from "./prepare.js";

function song(id = "coverage-song"): SongEntry {
  return {
    id,
    title: "Coverage Song",
    genre: "classical",
    difficulty: "beginner",
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    durationSeconds: 8,
    tags: ["coverage"],
    musicalLanguage: {
      description: "A short piece.",
      structure: "A",
      keyMoments: ["Measure 1."],
      teachingGoals: ["Sing the lyric."],
      styleTips: ["Keep the vowel."],
    },
    measures: [{ number: 1, rightHand: "C4:q E4:q G4:q C5:q", leftHand: "C3:q" }],
  };
}

describe("resolveLyricsText", () => {
  it("reads a lyrics file", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajs-lyrics-"));
    const file = join(dir, "words.txt");
    writeFileSync(file, "la la la");
    expect(resolveLyricsText({ lyricsFile: file })).toBe("la la la");
  });

  it("uses the request text, then a known tune, then nothing", () => {
    expect(resolveLyricsText({ lyrics: "row row row" })).toBe("row row row");
    expect(resolveLyricsText({ lyrics: "   " }, "amazing-grace")).toBe(
      "A-ma-zing grace how sweet the sound that saved a wretch like me",
    );
    expect(resolveLyricsText({}, "not-a-tune")).toBeNull();
  });
});

describe("accompanimentEngineForLyrics", () => {
  it("keeps a singing engine from also singing the accompaniment", () => {
    expect(accompanimentEngineForLyrics("synth")).toBe("piano");
    expect(accompanimentEngineForLyrics("vocal")).toBe("piano");
    expect(accompanimentEngineForLyrics("tract")).toBe("piano");
    expect(accompanimentEngineForLyrics("vocal+synth")).toBe("piano");
    expect(accompanimentEngineForLyrics("piano+synth")).toBe("piano");
    expect(accompanimentEngineForLyrics("guitar+synth")).toBe("guitar");
    expect(accompanimentEngineForLyrics("piano")).toBe("piano");
    expect(accompanimentEngineForLyrics("guitar")).toBe("guitar");
  });
});

describe("prepareScoreLocked", () => {
  it("returns null when there are no lyrics", async () => {
    await expect(prepareScoreLocked(song(), {})).resolves.toBeNull();
  });

  it("requires a library directory for the soulx backend", async () => {
    await expect(
      prepareScoreLocked(song(), { lyrics: "la", backend: "soulx" }),
    ).rejects.toThrow(
      "SoulX backend requires libraryDir (the path to songs/library) so the score clock can be derived from the MIDI file.",
    );
  });

  it("builds a score and asks the score singer for the kokoro backend", async () => {
    const prepared = await prepareScoreLocked(song(), { lyrics: "la", preset: "kokoro-af-heart" });
    expect(prepared).not.toBeNull();
    expect(prepared?.score.lyrics.text).toBe("la");
    expect(singer.createScoreSinger).toHaveBeenCalledWith(prepared?.score, {
      preset: "kokoro-af-heart",
      backend: "kokoro",
    });
    expect(prepared?.singer).toEqual({ kind: "score-singer" });
  });
});
