// The landing page's hymn data is generated from the score clocks and the arrangements the piano
// beds were rendered from. If either changes, regenerate it: npx tsx scripts/site-hymn-visual.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build } from "../../scripts/site-hymn-visual.js";

describe("site hymn visual data", () => {
  it("matches what the score clocks and arrangements produce", () => {
    const committed = JSON.parse(readFileSync("site/src/data/hymns.visual.json", "utf8"));
    expect(committed).toEqual(JSON.parse(build()));
  });

  it("puts every sung line inside its song and the piano under the whole clock", () => {
    for (const s of JSON.parse(build()).songs) {
      for (const [t0, t1] of s.lines) expect(t0 < t1 && t1 <= s.duration + 1e-6).toBe(true);
      const end = Math.max(...s.piano.map((n: number[]) => n[0] + n[1]));
      expect(Math.abs(end - s.duration)).toBeLessThan(0.02);
    }
  });
});
