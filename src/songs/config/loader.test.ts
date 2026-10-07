import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { listConfigIds, loadSongConfig, loadSongConfigs } from "./loader.js";

function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error("expected throw");
}

const MINIMAL = {
  id: "swing-study",
  title: "Swing Study",
  genre: "jazz",
  difficulty: "beginner",
  key: "G minor",
  tags: ["swing"],
};

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "song-config-loader-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("loadSongConfig", () => {
  it("loads a valid config by id", () => {
    writeFileSync(join(tmp, "swing-study.json"), JSON.stringify({
      id: "swing-study",
      title: "Swing Study",
      genre: "jazz",
      difficulty: "beginner",
      key: "G minor",
      tags: ["swing", "ii-V-I"],
      source: "generated",
      musicalLanguage: {
        description: "A short jazz study.",
        structure: "AABA",
        keyMoments: ["Opening ii-V-I"],
        teachingGoals: ["Internalize swing feel"],
        styleTips: ["Lean into the backbeat"],
      },
    }), "utf8");

    const config = loadSongConfig("swing-study", tmp);
    expect(config.id).toBe("swing-study");
  });

  it("rejects traversal in config id", () => {
    expect(() => loadSongConfig("../secrets", tmp)).toThrow("Invalid config ID");
  });

  it("rejects slash-containing config ids", () => {
    expect(() => loadSongConfig("bad/name", tmp)).toThrow("Invalid config ID");
  });

  it("rejects a bad id with the exact invalid-config sentence", () => {
    expect(thrownMessage(() => loadSongConfig("Bad_ID", tmp))).toBe('Invalid config ID: "Bad_ID"');
  });

  it("rejects a traversal id at sanitize, before any path-escape check", () => {
    expect(thrownMessage(() => loadSongConfig("../secrets", tmp))).toBe('Invalid config ID: "../secrets"');
  });

  it("throws the resolved path when the config file is missing", () => {
    const id = "missing-song";
    expect(thrownMessage(() => loadSongConfig(id, tmp))).toBe(
      `Config not found: ${resolve(tmp, `${id}.json`)}`,
    );
  });
});

describe("loadSongConfigs", () => {
  it("throws when the directory does not exist", () => {
    const dir = join(tmp, "missing-configs");
    expect(thrownMessage(() => loadSongConfigs(dir))).toBe(`Config directory not found: ${dir}`);
  });

  it("returns a parsed config, including the raw status default", () => {
    writeFileSync(join(tmp, "swing-study.json"), JSON.stringify(MINIMAL), "utf8");
    expect(loadSongConfigs(tmp)).toEqual([{ ...MINIMAL, status: "raw" }]);
  });

  it("skips invalid JSON and logs SKIP config", () => {
    writeFileSync(join(tmp, "broken.json"), "{", "utf8");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(loadSongConfigs(tmp)).toEqual([]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const line = String(errorSpy.mock.calls[0]?.[0]);
      expect(line.startsWith("  SKIP config broken.json: ")).toBe(true);
      expect(line).toContain("SKIP config");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("skips a schema failure and includes the issue path", () => {
    writeFileSync(join(tmp, "bad-shape.json"), JSON.stringify({
      id: "bad-shape",
      title: "",
      genre: "not-a-genre",
      difficulty: "beginner",
      key: "C",
      tags: [],
    }), "utf8");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(loadSongConfigs(tmp)).toEqual([]);
      expect(String(errorSpy.mock.calls[0]?.[0])).toBe([
        "  SKIP config bad-shape.json:",
        "  title: Too small: expected string to have >=1 characters",
        '  genre: Invalid option: expected one of "classical"|"jazz"|"pop"|"blues"|"rock"|"rnb"|"soul"|"latin"|"film"|"ragtime"|"new-age"|"folk"',
      ].join("\n"));
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("listConfigIds", () => {
  it("returns [] when the directory does not exist", () => {
    expect(listConfigIds(join(tmp, "missing-configs"))).toEqual([]);
  });

  it("returns the slug of the one json file", () => {
    writeFileSync(join(tmp, "swing-study.json"), "{}\n", "utf8");
    writeFileSync(join(tmp, "notes.txt"), "nope", "utf8");
    expect(listConfigIds(tmp)).toEqual(["swing-study"]);
  });
});
