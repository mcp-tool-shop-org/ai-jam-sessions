import { describe, it, expect } from "vitest";
import { assertNoStraddle, assertGoldVaries, assertSchemaOwner } from "../experiment/index.js";
import { buildAllRecords, rederivePlant } from "./generate.js";
import {
  SEARCH_SCHEMA_VERSION,
  TEST_SONG_IDS,
  plants,
  searchTask,
  splitOf,
  userPrompt,
} from "./task.js";

describe("search-v0 task", () => {
  it("gold is a planted measure, re-derived from the engines, not a field lookup", () => {
    const cases = searchTask.cases();
    expect(cases.length).toBeGreaterThan(4);
    for (const c of cases) {
      const measured = rederivePlant(c);
      expect(measured.measure).toBe(c.measure);
      expect(measured.chord).toBe(c.chord);
      const user = userPrompt(c);
      expect(user).toContain(c.title);
      expect(user).toContain(c.chord);
      expect(user).not.toMatch(new RegExp(`\\b${c.measure}\\b`));
      expect(user).not.toContain(c.song_id);
    }
  });

  it("does not let a song straddle the split", () => {
    const cases = plants();
    assertNoStraddle(cases, (c) => searchTask.splitKey(c), splitOf);
    const testSongs = new Set(cases.filter((c) => splitOf(c) === "test").map((c) => c.song_id));
    expect([...testSongs].sort()).toEqual([...TEST_SONG_IDS].sort());
  });

  it("gold varies in train and in test", () => {
    assertGoldVaries(plants(), (c) => String(c.measure), splitOf);
  });

  it("does not claim a published schema_version", () => {
    expect(SEARCH_SCHEMA_VERSION).not.toBe("jam-actions-v1/1.0.0");
    expect(SEARCH_SCHEMA_VERSION).not.toBe("jam-actions-acoustic-v0/1.0.0");
    expect(() => assertSchemaOwner(searchTask)).not.toThrow();
  });

  it("buildRecord agrees with the plant and carries no authored tool sequence", () => {
    const recs = buildAllRecords();
    expect(recs.length).toBe(plants().length);
    for (const r of recs) {
      expect(r.observation.gold.verdict).toBe(String(r.observation.gold.measure));
      expect(JSON.stringify(r)).not.toMatch(/tool_calls/);
    }
  });

  it("declares the closed measure set, including unused numbers", () => {
    expect(searchTask.verdicts).toContain("1");
    expect(searchTask.verdicts).toContain("16");
    expect(searchTask.verdicts).toHaveLength(16);
    const used = new Set(plants().map((c) => String(c.measure)));
    expect(used.has("1")).toBe(false);
  });
});
