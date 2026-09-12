import { describe, it, expect } from "vitest";
import {
  MIN_IN_BAND,
  MIN_NON_DEGENERATE,
  PASS1_CEILING,
  applyLeakFilter,
  correctHistogram,
  countNonDegenerate,
  existingCorpusVerdict,
  isNonDegenerate,
  nonDegenerateVerdict,
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

// The secondary criterion. Declared before the P1f run, reported beside the
// primary bar and never in place of it: findings 22 (DAPO), 23 (Foster) and
// 26 (Absolute Zero) all count a case as trainable when the group is not
// unanimous, where finding 24's narrow band counts only c/8 in [12.5%, 50%].
describe("secondary criterion — non-degenerate (findings 22 / 23 / 26)", () => {
  it("excludes both unanimous ends and nothing else", () => {
    expect(isNonDegenerate(0, 8)).toBe(false);
    expect(isNonDegenerate(8, 8)).toBe(false);
    expect(isNonDegenerate(1, 8)).toBe(true);
    expect(isNonDegenerate(7, 8)).toBe(true);
  });

  it("counts the interior cases the narrow band drops", () => {
    const cases = [
      { correct: 0, n: 8 },
      { correct: 1, n: 8 },
      { correct: 5, n: 8 },
      { correct: 7, n: 8 },
      { correct: 8, n: 8 },
    ];
    expect(countNonDegenerate(cases)).toBe(3);
  });

  it("histogram breaks the two degenerate ends out from the interior", () => {
    const h = correctHistogram([
      { correct: 0, n: 8 },
      { correct: 3, n: 8 },
      { correct: 4, n: 8 },
      { correct: 6, n: 8 },
      { correct: 8, n: 8 },
      { correct: 8, n: 8 },
    ]);
    expect(h.c0).toBe(1);
    expect(h.c1_4).toBe(2);
    expect(h.c5_7).toBe(1);
    expect(h.c8).toBe(2);
    expect(h.by_c).toEqual({ 0: 1, 3: 1, 4: 1, 6: 1, 8: 2 });
  });

  it("FAILs below the population bar, and at the pass@1 ceiling", () => {
    expect(
      nonDegenerateVerdict({ nonDegenerateAfterLeak: 9, sampledPass1: 0.3, nGold: 64 }).non_degenerate,
    ).toBe("FAIL");
    expect(
      nonDegenerateVerdict({
        nonDegenerateAfterLeak: MIN_NON_DEGENERATE,
        sampledPass1: PASS1_CEILING,
        nGold: 64,
      }).non_degenerate,
    ).toBe("FAIL");
    expect(
      nonDegenerateVerdict({
        nonDegenerateAfterLeak: MIN_NON_DEGENERATE,
        sampledPass1: 0.3,
        nGold: 64,
      }).non_degenerate,
    ).toBe("CLEAR");
  });

  it("buildP0Report leak-filters it, and it can exceed the in-band count", () => {
    const ids = [
      { id: "leaked", hits: 2, guess: 1 },
      { id: "interior", hits: 3, guess: 0 },
      { id: "above", hits: 6, guess: 0 },
      { id: "solved", hits: 8, guess: 0 },
    ];
    const goldRows = ids.map((r) => ({ id: r.id, family: "synth", gold: "match" }));
    const sampledPreds = [];
    const guessPreds = [];
    for (const r of ids) {
      for (let i = 0; i < 8; i++) {
        sampledPreds.push({ id: r.id, attempt: i, answer: i < r.hits ? "match" : "timing_fail" });
        guessPreds.push({ id: r.id, attempt: i, answer: i < r.guess ? "match" : "timing_fail" });
      }
    }
    const rep = buildP0Report({ goldRows, greedyPreds: null, sampledPreds, guessPreds, pin: { model: "x" } });
    expect(rep.guess_test.leak_ids).toEqual(["leaked"]);
    // in-band after leak: only `interior` (3/8 = 0.375). Non-degenerate after
    // leak: `interior` and `above` (6/8 = 0.75, outside the band, still graded).
    expect(rep.learnability.in_band_after_leak).toBe(1);
    expect(rep.learnability.non_degenerate_after_leak).toBe(2);
    expect(rep.learnability.non_degenerate_raw).toBe(3);
    expect(rep.learnability.correct_histogram).toMatchObject({ c0: 0, c1_4: 2, c5_7: 1, c8: 1 });
    expect(rep.learnability.correct_histogram_leak_free).toMatchObject({ c1_4: 1, c5_7: 1, c8: 1 });
    expect(rep.verdict.existing_corpus).toBe("NO-GO");
    expect(rep.secondary_verdict.non_degenerate).toBe("FAIL");
    expect(rep.secondary_rule.min_non_degenerate_after_leak).toBe(MIN_NON_DEGENERATE);
  });
});
