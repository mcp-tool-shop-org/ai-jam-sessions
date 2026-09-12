import { describe, it, expect } from "vitest";
import { validateSong } from "../../songs/registry.js";
import { assertGoldVaries, assertNoStraddle, assertSchemaOwner } from "../experiment/index.js";
import {
  GENERATOR_SEED,
  TEST_PER_LEVEL,
  TRAIN_PER_LEVEL,
  agree,
  catalog,
  generateCorpus,
  kebab,
  lhOf,
  rederivePlant,
  smokeSong,
} from "./generate.js";
import {
  SYNTH_SCHEMA_VERSION,
  plants,
  splitOf,
  synthTask,
  userPrompt,
} from "./task.js";

describe("synth-v0 voicings", () => {
  it("every catalog voicing re-derives identically from both engines", () => {
    const cat = catalog();
    expect(cat.length).toBeGreaterThanOrEqual(8);
    for (const v of cat) {
      expect(agree(v.lh)).toBe(v.name);
    }
  });
});

describe("synth-v0 generator", () => {
  it("is deterministic under the pinned seed", () => {
    const a = generateCorpus(GENERATOR_SEED);
    const b = generateCorpus(GENERATOR_SEED);
    expect(a.cases.map((c) => c.song_id)).toEqual(b.cases.map((c) => c.song_id));
  });

  it("gold re-derives, distance is 1–3, prompt does not name the measure or song id", () => {
    const { songs, cases } = generateCorpus();
    const byId = new Map(songs.map((s) => [s.id, s]));
    expect(cases.length).toBe((TEST_PER_LEVEL + TRAIN_PER_LEVEL) * 4);
    for (const c of cases) {
      const song = byId.get(c.song_id)!;
      const measured = rederivePlant(c, song);
      expect(measured.measure).toBe(c.measure);
      expect(measured.chord).toBe(c.chord);
      expect(c.distance).toBeGreaterThanOrEqual(1);
      expect(c.distance).toBeLessThanOrEqual(3);
      expect(c.after + c.distance).toBe(c.measure);
      const user = userPrompt(c);
      expect(user).toContain(c.title);
      expect(user).toContain(c.chord);
      expect(user).toContain(String(c.after));
      expect(user).not.toMatch(new RegExp(`\\b${c.measure}\\b`));
      expect(user).not.toContain(c.song_id);
      expect(kebab(c.title)).toBe(c.song_id);
      expect(c.song_id.startsWith("synth-")).toBe(true);
      expect(validateSong(song)).toEqual([]);
    }
  });

  it("does not let a song straddle the split and gold varies on both sides", () => {
    const cases = plants();
    assertNoStraddle(cases, (c) => synthTask.splitKey(c), splitOf);
    assertGoldVaries(cases, (c) => String(c.measure), splitOf, (c) => c.level);
    const testSongs = new Set(cases.filter((c) => c.split === "test").map((c) => c.song_id));
    expect(testSongs.size).toBeGreaterThanOrEqual(30);
  });

  it("does not claim a published schema_version", () => {
    expect(SYNTH_SCHEMA_VERSION).not.toBe("jam-actions-v1/1.0.0");
    expect(SYNTH_SCHEMA_VERSION).not.toBe("jam-actions-search-v0/1.2.0");
    expect(SYNTH_SCHEMA_VERSION).not.toBe("jam-actions-synth-v0/1.0.0");
    expect(() => assertSchemaOwner(synthTask)).not.toThrow();
  });

  it("smoke song validates", () => {
    expect(validateSong(smokeSong())).toEqual([]);
    expect(smokeSong().id.startsWith("synth-")).toBe(true);
  });
});

describe("kebab", () => {
  it("matches Bethena → bethena and a spaced synth title", () => {
    expect(kebab("Bethena")).toBe("bethena");
    expect(kebab("Synth D0 Study aac")).toBe("synth-d0-study-aac");
  });
});

describe("lhOf", () => {
  it("writes a parseable triad", () => {
    expect(lhOf([48, 52, 55])).toBe("C3+E3+G3:q");
  });
});
