// ─── Loudness, Peak and Clipping Tests ───────────────────────────────────────
//
// Two known-answer anchors carry the weight here. The first is external: at
// 48 kHz the K-weighting biquads must land on the constants ITU-R BS.1770-4
// prints in its own tables, which is what the DeMan parameters are FOR. The
// second is analytic: a steady sine's K-weighted mean square is a closed
// form, so integrated loudness of a 1 kHz tone is computable by hand from the
// SAME printed constants (never from this module's own factory — that would
// be the module grading its own homework).
//
// Gating and clipping are behavioural: relative gate drops a quiet tail, the
// absolute gate refuses silence, and clipping counts runs of full-scale
// samples, not just samples.

import { describe, it, expect } from "vitest";
import {
  BS1770_ABSOLUTE_GATE_LUFS,
  CLIP_THRESHOLD,
  kWeightingBiquads,
  filterBiquad,
  kWeight,
  measureLevels,
} from "./loudness.js";
import { sine } from "./fixtures.js";

// The constants ITU-R BS.1770-4 prints for fs = 48 kHz: stage 1 the pre-filter
// shelf, stage 2 the RLB high-pass. Used verbatim as the golden reference.
const BS1770_48K_STAGE1 = {
  b0: 1.53512485958697,
  b1: -2.69169618940638,
  b2: 1.19839281085285,
  a1: -1.69065929318241,
  a2: 0.73248077421585,
};
const BS1770_48K_STAGE2 = {
  a1: -1.99004745483398,
  a2: 0.99007225036621,
};

/** |H(e^{jw})| of a biquad with the given coefficients at angular freq w. */
function biquadMagnitude(
  c: { b0: number; b1: number; b2: number; a1: number; a2: number },
  w: number,
): number {
  const zr = Math.cos(w);
  const zi = -Math.sin(w); // e^{-jw}
  const numRe = c.b0 + c.b1 * zr + c.b2 * Math.cos(-2 * w);
  const numIm = c.b1 * zi + c.b2 * Math.sin(-2 * w);
  const denRe = 1 + c.a1 * zr + c.a2 * Math.cos(-2 * w);
  const denIm = c.a1 * zi + c.a2 * Math.sin(-2 * w);
  return Math.hypot(numRe, numIm) / Math.hypot(denRe, denIm);
}

describe("kWeightingBiquads at 48 kHz — the standard's own constants", () => {
  const { preFilter, rlbHighPass } = kWeightingBiquads(48000);

  it("stage 1 reproduces the printed shelf to 1e-6", () => {
    expect(preFilter.b0).toBeCloseTo(BS1770_48K_STAGE1.b0, 6);
    expect(preFilter.b1).toBeCloseTo(BS1770_48K_STAGE1.b1, 6);
    expect(preFilter.b2).toBeCloseTo(BS1770_48K_STAGE1.b2, 6);
    expect(preFilter.a1).toBeCloseTo(BS1770_48K_STAGE1.a1, 6);
    expect(preFilter.a2).toBeCloseTo(BS1770_48K_STAGE1.a2, 6);
  });

  it("stage 2 reproduces the printed RLB poles, with the RBJ-normalised zeros", () => {
    expect(rlbHighPass.a1).toBeCloseTo(BS1770_48K_STAGE2.a1, 6);
    expect(rlbHighPass.a2).toBeCloseTo(BS1770_48K_STAGE2.a2, 6);
    // The standard prints b = [1, −2, 1]; the DeMan/pyloudnorm design uses
    // b = [1, −2, 1] / a0 with a0 ≈ 1.0049942, i.e. b0 ≈ 0.99503
    // (−0.043 dB, the deviation loudness.ts's header pins). The SHAPE is
    // asserted exactly; the scale is asserted to four decimals — hand-derived
    // constants at this precision just re-derive the factory's own arithmetic.
    expect(rlbHighPass.b1 / rlbHighPass.b0).toBeCloseTo(-2, 12);
    expect(rlbHighPass.b2 / rlbHighPass.b0).toBeCloseTo(1, 12);
    expect(rlbHighPass.b0).toBeCloseTo(0.99503, 4);
  });

  it("designs at other sample rates without blowing up (44.1 kHz sanity)", () => {
    const { preFilter: shelf44 } = kWeightingBiquads(44100);
    // The shelf is +4 dB well above its corner and unity well below: a coarse
    // shape check that holds at any sane rate.
    const oneK = biquadMagnitude(shelf44, (2 * Math.PI * 1000) / 44100);
    const tenK = biquadMagnitude(shelf44, (2 * Math.PI * 10000) / 44100);
    expect(10 * Math.log10(tenK * tenK)).toBeGreaterThan(3);
    expect(10 * Math.log10(tenK * tenK)).toBeLessThan(5);
    expect(10 * Math.log10(oneK * oneK)).toBeLessThan(2);
  });
});

describe("integrated loudness — analytic anchors", () => {
  const SR = 48000;

  it("1 kHz sine at -6 dBFS lands within 0.2 LU of the closed form", () => {
    // Analytic expectation from the printed constants: z = (A²/2)·|H1·H2|² at
    // 997/1000 Hz. Evaluated HERE from the standard's numbers, not from
    // loudness.ts's factory, so the two can genuinely disagree.
    const w = (2 * Math.PI * 1000) / SR;
    const h = biquadMagnitude(BS1770_48K_STAGE1, w) * biquadMagnitude(
      { b0: 1, b1: -2, b2: 1, ...BS1770_48K_STAGE2 }, // stage 2 as printed
      w,
    );
    const amplitude = 0.5;
    const expected = -0.691 + 10 * Math.log10(((amplitude * amplitude) / 2) * h * h);

    const report = measureLevels(sine({ frequency: 1000, duration: 2, sampleRate: SR, amplitude }), {
      sampleRate: SR,
    });
    expect(report.integratedLufs).not.toBeNull();
    expect(Math.abs(report.integratedLufs! - expected)).toBeLessThan(0.2);
  });

  it("the relative gate drops a tail 40 LU under the body", () => {
    const body = sine({ frequency: 1000, duration: 2, sampleRate: SR, amplitude: 0.5 });
    const tail = sine({ frequency: 1000, duration: 3, sampleRate: SR, amplitude: 0.5 * Math.pow(10, -40 / 20) });
    const both = new Float64Array(body.length + tail.length);
    both.set(body, 0);
    both.set(tail, body.length);

    const bodyOnly = measureLevels(body, { sampleRate: SR }).integratedLufs!;
    const withTail = measureLevels(both, { sampleRate: SR }).integratedLufs!;
    // The relative gate holds the −40 LU tail out of the mean; ungated, three
    // seconds of tail against two of body would drag the figure down ~4 LU.
    // What legitimately remains is the straddlers: at hop 0.1 s the boundary
    // puts 3 of the 20 kept 400 ms blocks at 75/50/25% body energy, and
    // gating is per-block, not per-sample — exactly −0.34 LU by the block
    // count, measured 0.338. Half a LU is the honest bound on the cost.
    expect(Math.abs(withTail - bodyOnly)).toBeLessThan(0.5);
  });

  it("refuses digital silence and −80 dBFS rather than returning a number", () => {
    expect(measureLevels(new Float64Array(SR), { sampleRate: SR }).integratedLufs).toBeNull();
    expect(
      measureLevels(sine({ frequency: 1000, duration: 2, sampleRate: SR, amplitude: 1e-4 }), {
        sampleRate: SR,
      }).integratedLufs,
    ).toBeNull();
  });

  it("measures a sub-block clip as one block instead of refusing it", () => {
    const shortClip = sine({ frequency: 1000, duration: 0.3, sampleRate: SR, amplitude: 0.5 });
    const report = measureLevels(shortClip, { sampleRate: SR });
    expect(report.integratedLufs).not.toBeNull();
    // One block of a steady tone reads the same as sixty: the window length
    // gates, it should not bias.
    const longRun = measureLevels(sine({ frequency: 1000, duration: 2, sampleRate: SR, amplitude: 0.5 }), {
      sampleRate: SR,
    });
    expect(Math.abs(report.integratedLufs! - longRun.integratedLufs!)).toBeLessThan(1);
  });

  it("momentary maximum finds the loud half of a stepped signal", () => {
    const quiet = sine({ frequency: 440, duration: 1, sampleRate: SR, amplitude: 0.05 });
    const loud = sine({ frequency: 440, duration: 1, sampleRate: SR, amplitude: 0.5 });
    const both = new Float64Array(quiet.length + loud.length);
    both.set(quiet, 0);
    both.set(loud, quiet.length);

    const report = measureLevels(both, { sampleRate: SR });
    const loudAlone = measureLevels(loud, { sampleRate: SR });
    expect(report.momentaryMaxLufs).not.toBeNull();
    expect(Math.abs(report.momentaryMaxLufs! - loudAlone.integratedLufs!)).toBeLessThan(0.4);
    expect(report.integratedLufs!).toBeLessThan(report.momentaryMaxLufs!);
  });
});

describe("sample peak and RMS", () => {
  const SR = 44100;

  it("quarter-scale sine: peak −12.04 dBFS, RMS another 3.01 dB under that", () => {
    const report = measureLevels(sine({ frequency: 440, duration: 1, sampleRate: SR, amplitude: 0.25 }), {
      sampleRate: SR,
    });
    expect(report.peakLinear).toBeCloseTo(0.25, 6);
    expect(report.peakDbFs).toBeCloseTo(-12.04, 1);
    expect(report.rmsLinear).toBeCloseTo(0.25 / Math.SQRT2, 6);
    expect(report.rmsDbFs).toBeCloseTo(-12.04 - 3.01, 1);
  });

  it("reports where the peak actually is", () => {
    const signal = new Float64Array(SR);
    signal[Math.round(0.4 * SR)] = 0.8;
    const report = measureLevels(signal, { sampleRate: SR });
    expect(report.peakLinear).toBeCloseTo(0.8, 12);
    expect(report.peakTimeSec).toBeCloseTo(0.4, 3);
  });
});

describe("clipping", () => {
  const SR = 44100;

  it("a clean half-scale sine clips nothing", () => {
    const report = measureLevels(sine({ frequency: 220, duration: 0.5, sampleRate: SR, amplitude: 0.5 }), {
      sampleRate: SR,
    });
    expect(report.clippedSamples).toBe(0);
    expect(report.clipRuns).toEqual([]);
  });

  it("counts every sample of a full-scale square wave as one long run", () => {
    const n = SR;
    const signal = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      signal[i] = Math.sin((2 * Math.PI * 100 * i) / SR) >= 0 ? 1 : -1;
    }
    const report = measureLevels(signal, { sampleRate: SR });
    expect(report.clippedSamples).toBe(n);
    expect(report.clipRuns).toHaveLength(1);
    expect(report.clipRuns[0]!.samples).toBe(n);
  });

  it("isolates a clipped stretch between clean audio, in seconds", () => {
    const signal = new Float64Array(SR);
    const start = Math.round(0.2 * SR);
    const end = start + 100;
    for (let i = start; i < end; i++) signal[i] = 1;
    const report = measureLevels(signal, { sampleRate: SR });
    expect(report.clippedSamples).toBe(100);
    expect(report.clipRuns).toHaveLength(1);
    expect(report.clipRuns[0]!.startSec).toBeCloseTo(0.2, 3);
    expect(report.clipRuns[0]!.durationSec).toBeCloseTo(100 / SR, 5);
    expect(report.longestClipRunSamples).toBe(100);
  });

  it("the 16-bit ceiling (32767/32768) is the default line, 0.999 is not over it", () => {
    expect(CLIP_THRESHOLD).toBeCloseTo(32767 / 32768, 12);
    // 0.999 sits below the 16-bit ceiling: loud, not necessarily clipped.
    const loud = measureLevels(sine({ frequency: 220, duration: 0.2, sampleRate: SR, amplitude: 0.999 }), {
      sampleRate: SR,
    });
    expect(loud.clippedSamples).toBe(0);
    const hot = measureLevels(sine({ frequency: 220, duration: 0.2, sampleRate: SR, amplitude: 1.5 }), {
      sampleRate: SR,
    });
    expect(hot.clippedSamples).toBeGreaterThan(0);
  });

  it("honours an explicit threshold for a near-full-scale conservative check", () => {
    const report = measureLevels(
      sine({ frequency: 220, duration: 0.2, sampleRate: SR, amplitude: 0.95 }),
      { sampleRate: SR, clipThreshold: 0.9 },
    );
    expect(report.clipThreshold).toBe(0.9);
    expect(report.clippedSamples).toBeGreaterThan(0);
  });
});

describe("filterBiquad / kWeight plumbing", () => {
  it("a DC-killing high-pass reads ~0 RMS on a constant signal", () => {
    const { rlbHighPass } = kWeightingBiquads(48000);
    const filtered = filterBiquad(new Float64Array(48000).fill(0.5), rlbHighPass);
    for (let i = 4800; i < filtered.length; i++) {
      expect(Math.abs(filtered[i]!)).toBeLessThan(1e-3);
    }
  });

  it("kWeight returns a fresh array and leaves the input alone", () => {
    const input = sine({ frequency: 440, duration: 0.1, sampleRate: 44100 });
    const snapshot = new Float64Array(input);
    const out = kWeight(input, 44100);
    expect(out).not.toBe(input);
    expect(Array.from(input)).toEqual(Array.from(snapshot));
  });

  it("the absolute gate constant is the standard's −70", () => {
    expect(BS1770_ABSOLUTE_GATE_LUFS).toBe(-70);
  });
});
