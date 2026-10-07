import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listConfigIds, loadSongConfig, loadSongConfigs } from "./loader.js";

const VALID = {
  id: "sample-song",
  title: "Sample",
  genre: "classical",
  difficulty: "beginner",
  key: "C major",
  tags: ["coverage"],
};

describe("song config loader edges", () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    err.mockClear();
  });

  it("throws when the config directory does not exist", () => {
    const missing = join(tmpdir(), "ajs-missing-config-dir");
    expect(() => loadSongConfigs(missing)).toThrow(`Config directory not found: ${missing}`);
  });

  it("skips invalid JSON and a config that fails the schema, and keeps the valid one", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajs-config-"));
    writeFileSync(join(dir, "broken.json"), "{");
    writeFileSync(join(dir, "thin.json"), JSON.stringify({ id: "thin-song" }));
    writeFileSync(join(dir, "sample-song.json"), JSON.stringify(VALID));
    const loaded = loadSongConfigs(dir);
    expect(loaded.map((c) => c.id)).toEqual(["sample-song"]);
    expect(loaded[0]?.title).toBe("Sample");
    const lines = err.mock.calls.map((c) => String(c[0]));
    expect(lines).toContain(
      "  SKIP config broken.json: Expected property name or '}' in JSON at position 1 (line 1 column 2)",
    );
    const thin = lines.find((line) => line.startsWith("  SKIP config thin.json:\n"));
    expect(thin).toBeDefined();
    expect(thin).toContain("title: ");
  });

  it("loads one config by id", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajs-config-"));
    writeFileSync(join(dir, "sample-song.json"), JSON.stringify(VALID));
    expect(loadSongConfig("sample-song", dir).key).toBe("C major");
  });

  it("rejects an id that is not kebab-case", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajs-config-"));
    expect(() => loadSongConfig("Nope", dir)).toThrow('Invalid config ID: "Nope"');
  });

  it("rejects a missing config file", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajs-config-"));
    const filePath = resolve(dir, "sample-song.json");
    expect(() => loadSongConfig("sample-song", dir)).toThrow(`Config not found: ${filePath}`);
  });

  it("lists no ids for a missing directory and the slug of a json file that is present", () => {
    expect(listConfigIds(join(tmpdir(), "ajs-missing-config-ids"))).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), "ajs-config-"));
    writeFileSync(join(dir, "sample-song.json"), JSON.stringify(VALID));
    writeFileSync(join(dir, "notes.txt"), "not a config");
    expect(listConfigIds(dir)).toEqual(["sample-song"]);
  });
});
