import { describe, it, expect } from "vitest";
import { comb, passAtK, bandOf, scoreCase, scorePassK, LEARNABILITY_BAND } from "./score-passk.mjs";

describe("pass@k estimator", () => {
  it("pass@1 is c/n", () => {
    expect(passAtK(8, 2, 1)).toBeCloseTo(0.25, 10);
    expect(passAtK(8, 0, 1)).toBe(0);
    expect(passAtK(8, 8, 1)).toBe(1);
  });

  it("pass@n is 1 iff any attempt hits", () => {
    expect(passAtK(8, 1, 8)).toBe(1);
    expect(passAtK(8, 0, 8)).toBe(0);
  });

  it("comb is exact on the small n this eval uses", () => {
    expect(comb(8, 2)).toBe(28);
    expect(comb(8, 0)).toBe(1);
    expect(comb(8, 8)).toBe(1);
  });
});

describe("learnability band", () => {
  it("puts 1/8 through 4/8 in-band inclusive", () => {
    expect(LEARNABILITY_BAND).toEqual({ lo: 0.125, hi: 0.5 });
    expect(bandOf(0)).toBe("below");
    expect(bandOf(1 / 8)).toBe("in_band");
    expect(bandOf(4 / 8)).toBe("in_band");
    expect(bandOf(5 / 8)).toBe("above");
    expect(bandOf(1)).toBe("above");
  });
});

describe("scoreCase / scorePassK", () => {
  it("matches gold after the last colon, case-insensitive", () => {
    const s = scoreCase("match", [
      { answer: "cents 7.8: match", attempt: 0 },
      { answer: "MATCH", attempt: 1 },
      { answer: "pitch_fail", attempt: 2 },
    ]);
    expect(s.correct).toBe(2);
    expect(s.n).toBe(3);
    expect(s.greedy_hit).toBe(true);
  });

  it("groups attempts by id and reports per-family histograms", () => {
    const gold = [
      { id: "a", family: "acoustic", gold: "match" },
      { id: "b", family: "harmony", gold: "verified" },
    ];
    const preds = [];
    for (let i = 0; i < 8; i++) {
      preds.push({ id: "a", attempt: i, answer: i < 2 ? "match" : "pitch_fail" });
      preds.push({ id: "b", attempt: i, answer: "rejected" });
    }
    const r = scorePassK(gold, preds, 8);
    expect(r.overall.n).toBe(2);
    expect(r.per_family.acoustic.histogram.in_band).toBe(1);
    expect(r.per_family.harmony.histogram.below).toBe(1);
    expect(r.constant_gold_families).toEqual(["acoustic", "harmony"]);
  });
});
