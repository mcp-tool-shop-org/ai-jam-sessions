import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRegistry, getSong } from "./registry.js";
import { initializeRegistry, loadSongFile, loadSongsFromDir, saveSong } from "./loader.js";
import type { SongEntry } from "./types.js";

function song(id: string): SongEntry {
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
      description: "A short piece used by the loader tests.",
      structure: "A",
      keyMoments: ["The first measure."],
      teachingGoals: ["Read the file back."],
      styleTips: ["Keep the tempo."],
    },
    measures: [{ number: 1, rightHand: "C4:q", leftHand: "C3:q" }],
  };
}

describe("song loader edges", () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  let dir = "";

  afterEach(() => {
    err.mockClear();
    clearRegistry();
  });

  it("returns no songs for a missing directory and skips a file that does not parse", () => {
    expect(loadSongsFromDir(join(tmpdir(), "ajs-missing-songs-dir"))).toEqual([]);
    dir = mkdtempSync(join(tmpdir(), "ajs-songs-"));
    writeFileSync(join(dir, "broken.json"), "{");
    expect(loadSongsFromDir(dir)).toEqual([]);
    expect(err).toHaveBeenCalledWith(
      "  SKIP broken.json: Failed to parse broken.json: Expected property name or '}' in JSON at position 1 (line 1 column 2)",
    );
  });

  it("rejects a song file that parses but fails validation", () => {
    dir = mkdtempSync(join(tmpdir(), "ajs-songs-"));
    const broken = { ...song("valid-id"), title: "" };
    writeFileSync(join(dir, "broken.json"), JSON.stringify(broken));
    expect(() => loadSongFile(join(dir, "broken.json"))).toThrow(
      "Invalid song in broken.json:\n  - title is required",
    );
  });

  it("saves a song into a new directory and reads the same id and title back", () => {
    dir = mkdtempSync(join(tmpdir(), "ajs-songs-"));
    const nested = join(dir, "user");
    const written = saveSong(song("coverage-song"), nested);
    const loaded = loadSongFile(written);
    expect(loaded.id).toBe("coverage-song");
    expect(loaded.title).toBe("Coverage Song");
    expect(loaded.tempo).toBe(120);
  });

  it("rejects a song id that is not kebab-case", () => {
    dir = mkdtempSync(join(tmpdir(), "ajs-songs-"));
    expect(() => saveSong(song("Bad_ID"), dir)).toThrow(
      'Invalid song ID: "Bad_ID". Must be kebab-case (a-z, 0-9, hyphens).',
    );
  });

  it("rejects a song id that contains a path separator", () => {
    dir = mkdtempSync(join(tmpdir(), "ajs-songs-"));
    expect(() => saveSong(song("a/b"), dir)).toThrow(
      'Invalid song ID: "a/b". Must be kebab-case (a-z, 0-9, hyphens).',
    );
  });

  it("skips a duplicate builtin song and a duplicate user song, then reports the builtin file count", () => {
    const builtin = mkdtempSync(join(tmpdir(), "ajs-builtin-"));
    const user = mkdtempSync(join(tmpdir(), "ajs-user-"));
    writeFileSync(join(builtin, "one.json"), JSON.stringify(song("dup-song")));
    writeFileSync(join(builtin, "two.json"), JSON.stringify(song("dup-song")));
    writeFileSync(join(user, "three.json"), JSON.stringify(song("dup-song")));
    initializeRegistry(builtin, user);
    expect(getSong("dup-song")?.title).toBe("Coverage Song");
    expect(err.mock.calls.map((c) => String(c[0]))).toEqual([
      '  SKIP builtin dup-song: Duplicate song ID: "dup-song"',
      '  SKIP user dup-song: Duplicate song ID: "dup-song"',
      "Song registry initialized: 2 builtin songs loaded",
    ]);
  });
});
