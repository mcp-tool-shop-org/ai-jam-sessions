// ─── Loop-Seam Tests ─────────────────────────────────────────────────────────
//
// The load-bearing case is the one that looks wrong: a sine whose duration is
// an exact whole number of cycles is a mathematically seamless loop, yet its
// raw boundary jump |x[first] − x[last]| is 0.063 — over the 0.03 tripwire.
// The extrapolated step is what separates that from a real cut, which is why
// the header in loop-seam.ts exists. Everything else here is the defect side:
// a mid-cycle amputation and an outro swelled into a quiet intro.

import { describe, it, expect } from "vitest";
import {
  LOOP_SEAM_CAVEAT,
  SEAM_STEP_CLICK_RISK,
  SEAM_LEVEL_STEP_DB,
  checkLoopSeam,
} from "./loop-seam.js";

const SR = 44100;

/** Whole cycles exactly: the loop is sample-perfect by construction. */
function seamlessSine(freqHz: number, cycles: number, amplitude: number): Float64Array {
  const n = Math.round((cycles * SR) / freqHz);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / SR);
  }
  return out;
}

describe("a sample-perfect loop", () => {
  // 441 Hz for exactly 100 cycles: n = 100·44100/441 = 10000 samples and the
  // (n+1)-th sample equals the first again.
  const loop = seamlessSine(441, 100, 0.8);

  it("reads clean on the extrapolated step despite a visible raw jump", () => {
    const report = checkLoopSeam(loop, { sampleRate: SR });
    // Raw boundary jump: |0 − sin(2π·441·9999/44100)| = sin(2π/100) ≈ 0.0628,
    // over the click tripwire. The naive measure would cry wolf HERE.
    expect(report.boundaryDelta).toBeGreaterThan(SEAM_STEP_CLICK_RISK);
    expect(report.stepLinear).toBeLessThan(0.01);
    expect(report.clicksAtSeam).toEqual([]);
    expect(report.verdict).toBe("clean");
  });

  it("the level either side of its seam is the same, by symmetry", () => {
    const report = checkLoopSeam(loop, { sampleRate: SR });
    expect(Math.abs(report.levelStepDb)).toBeLessThan(0.5);
  });
});

describe("a mid-cycle cut", () => {
  // 441 Hz for 100¼ cycles: the file ends at the wave's crest (x[N−1] ≈ 0.8,
  // slope ≈ 0), and the loop re-enters at x[0] = 0. The real-world shape of a
  // render trimmed to a bar length that is not an integer number of periods.
  it("flags click-risk whether you read the step or trust the burst detector", () => {
    const n = 10000 + 25; // 100 seamless cycles + a quarter-period amputation
    const broken = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      broken[i] = 0.8 * Math.sin((2 * Math.PI * 441 * i) / SR);
    }
    const report = checkLoopSeam(broken, { sampleRate: SR });
    expect(report.stepLinear).toBeGreaterThan(SEAM_STEP_CLICK_RISK);
    expect(report.verdict).toBe("click-risk");
  });
});

describe("a loud outro into a quiet intro", () => {
  it("flags level-jump on matched phase", () => {
    // Both halves whole-cycle seamless in phase (441 Hz), but the head is
    // 12 dB quieter than the tail: the thump with no click. Assembled
    // quiet-then-loud so the FILE ends loud and re-enters quiet, and
    // levelStepDb = head − tail reads −12.
    const head = seamlessSine(441, 50, 0.2);
    const tail = seamlessSine(441, 50, 0.8);
    const loop = new Float64Array(head.length + tail.length);
    loop.set(head, 0);
    loop.set(tail, head.length);

    const report = checkLoopSeam(loop, { sampleRate: SR });
    expect(report.stepLinear).toBeLessThan(SEAM_STEP_CLICK_RISK);
    expect(report.levelStepDb).toBeLessThan(-SEAM_LEVEL_STEP_DB);
    expect(Math.abs(report.levelStepDb)).toBeGreaterThan(11);
    expect(Math.abs(report.levelStepDb)).toBeLessThan(13);
    expect(report.verdict).toBe("level-jump");
  });
});

describe("guards and constants", () => {
  it("refuses audio too short to wrap", () => {
    expect(() => checkLoopSeam(new Float64Array(100), { sampleRate: SR })).toThrow(/too short|at least/i);
  });

  it("short loops shrink the analysis window rather than failing", () => {
    const short = seamlessSine(441, 22, 0.5); // 2200 samples, 50 ms, seamless
    const report = checkLoopSeam(short, { sampleRate: SR });
    expect(report.windowSec).toBeLessThan(0.5);
    expect(report.verdict).toBe("clean");
  });

  it("names the tripwires it applies", () => {
    expect(SEAM_STEP_CLICK_RISK).toBe(0.03);
    expect(SEAM_LEVEL_STEP_DB).toBe(3);
    expect(LOOP_SEAM_CAVEAT).toMatch(/render, not the writing/);
  });
});
