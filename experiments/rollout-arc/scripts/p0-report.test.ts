import { describe, it, expect } from "vitest";
import {
  MIN_IN_BAND,
  PASS1_CEILING,
  applyLeakFilter,
  existingCorpusVerdict,
  trivialBaselinesFromGold,
  buildP0Report,
} from "./p0-report.mjs";

describe("P0 GO rule (frozen before looking)", () => {
  it("NO-GO when the in-band population is below 10", () => {
    const v = existingCorpusVerdict({ inBandAfterLeak: 9, sampledPass1: 0.3, nGold: 59 });
    expect(v.existing_corpus).toBe("NO-GO");
    expect(v.new_family).toBe("GO-candidate");
  });

  it("NO-GO when sampled pass@1 is at the ceiling", () => {
    const v = existingCorpusVerdict({ inBandAfterLeak: 20, sampledPass1: PASS1_CEILING, nGold: 59 });
    expect(v.existing_corpus).toBe("NO-GO");
  });

  it("GO only when both the population and the headroom hold", () => {
    const v = existingCorpusVerdict({ inBandAfterLeak: MIN_IN_BAND, sampledPass1: 0.3, nGold: 59 });
    expect(v.existing_corpus).toBe("GO");
    expect(v.new_family).toBeUndefined();
  });
});

describe("leak filter", () => {
  it("drops any case the no-tool baseline hits at least once", () => {
    const sampled = [
      { id: "a", band: "in_band" },
      { id: "b", band: "in_band" },
    ];
    const guess = [
      { id: "a", correct: 2 },
      { id: "b", correct: 0 },
    ];
    const r = applyLeakFilter(sampled, guess);
    expect(r.leak_ids).toEqual(["a"]);
    expect(r.kept.map((c) => c.id)).toEqual(["b"]);
  });
});

describe("baselines", () => {
  it("majority is over the gold file, not over predictions", () => {
    const b = trivialBaselinesFromGold([
      { family: "acoustic", gold: "match" },
      { family: "acoustic", gold: "match" },
      { family: "acoustic", gold: "pitch_fail" },
    ]);
    expect(b.overall.majority_class).toBe("match");
    expect(b.overall.majority).toBeCloseTo(2 / 3, 10);
    expect(b.per_family.acoustic.majority_class).toBe("match");
  });
});

describe("buildP0Report wires the pieces", () => {
  it("counts a leak out of the in-band population", () => {
    const goldRows = [
      { id: "a", family: "acoustic", gold: "match" },
      { id: "b", family: "acoustic", gold: "pitch_fail" },
    ];
    const sampledPreds = [];
    const guessPreds = [];
    for (let i = 0; i < 8; i++) {
      sampledPreds.push({ id: "a", attempt: i, answer: i < 2 ? "match" : "timing_fail" });
      sampledPreds.push({ id: "b", attempt: i, answer: "match" });
      guessPreds.push({ id: "a", attempt: i, answer: "match" });
      guessPreds.push({ id: "b", attempt: i, answer: "timing_fail" });
    }
    const r = buildP0Report({ goldRows, greedyPreds: null, sampledPreds, guessPreds, pin: { model: "x" } });
    expect(r.guess_test.leak_ids).toEqual(["a"]);
    expect(r.learnability.in_band_raw).toBeGreaterThanOrEqual(1);
    expect(r.verdict.existing_corpus).toBe("NO-GO");
  });
});
