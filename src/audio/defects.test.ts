// ─── Dropout and Noise-Burst Tests ───────────────────────────────────────────
//
// The ground truth is the studio consult's ablation set (qwen-omni's
// ablation/make-clips.mjs), ported here sample-for-sample: six smooth notes at
// 22050 Hz with 20 ms fades, the seeded LCG white-noise burst at 2.45 s, the
// zeroed dropout at 3.15 s. The clean clips carry the false-positive weight —
// a detector that cries wolf on clean audio is worse than no detector — and
// the defect clips carry the missed-defect weight.
//
// The remaining tests pin the two honest boundaries: leading/trailing silence
// is arrangement (never reported), and a 20 ms dip under the default 50 ms
// gate is articulation (reported only when the caller lowers the gate).

import { describe, it, expect } from "vitest";
import {
  GAP_DETECTOR_CAVEAT,
  BURST_DETECTOR_CAVEAT,
  rmsEnvelope,
  detectGaps,
  detectBursts,
} from "./defects.js";
import { clickTrain, sine } from "./fixtures.js";

const SR = 22050;
const NOTE_SEC = 0.7;
const FADE = 0.02;
const hz = (m: number): number => 440 * 2 ** ((m - 69) / 12);
const UP = [60, 64, 67, 72, 76, 79]; // C4 E4 G4 C5 E5 G5
const DOWN = [...UP].reverse();

/** The ablation melody generator, verbatim from make-clips.mjs. */
function melody(midis: number[]): Float64Array {
  const n = Math.round(NOTE_SEC * SR);
  const out = new Float64Array(n * midis.length);
  midis.forEach((m, k) => {
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.min(1, t / FADE, (NOTE_SEC - t) / FADE);
      const f = hz(m);
      out[k * n + i] =
        0.4 * env * (Math.sin(2 * Math.PI * f * t) +
          0.3 * Math.sin(4 * Math.PI * f * t) +
          0.15 * Math.sin(6 * Math.PI * f * t));
    }
  });
  return out;
}

/** The ablation's seeded LCG, so noise is deterministic sample-for-sample. */
function makeRand(): () => number {
  let seed = 7;
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
}

function withBurst(x: Float64Array, atSec: number, durSec: number): Float64Array {
  const rand = makeRand();
  const out = new Float64Array(x);
  const a = Math.round(atSec * SR);
  const b = a + Math.round(durSec * SR);
  for (let i = a; i < b; i++) out[i] = out[i]! + 0.8 * rand();
  return out;
}

function withDropout(x: Float64Array, atSec: number, durSec: number): Float64Array {
  const out = new Float64Array(x);
  const a = Math.round(atSec * SR);
  const b = a + Math.round(durSec * SR);
  for (let i = a; i < b; i++) out[i] = 0;
  return out;
}

describe("the ablation clips as fixtures", () => {
  it("clean melodies report no gaps and no bursts — up and down", () => {
    for (const notes of [UP, DOWN]) {
      const clip = melody(notes);
      expect(detectGaps(clip, { sampleRate: SR })).toEqual([]);
      expect(detectBursts(clip, { sampleRate: SR })).toEqual([]);
    }
  });

  it("the 150 ms dropout at 3.15 s is found, once, and nowhere else", () => {
    const clip = withDropout(melody(UP), 3.15, 0.15);
    const gaps = detectGaps(clip, { sampleRate: SR });
    expect(gaps).toHaveLength(1);
    expect(Math.abs(gaps[0]!.startSec - 3.15)).toBeLessThan(0.03);
    expect(gaps[0]!.durationSec).toBeGreaterThanOrEqual(0.1);
    expect(gaps[0]!.durationSec).toBeLessThanOrEqual(0.2);
    expect(gaps[0]!.minDbFs).toBeLessThan(-90); // zeroed audio, not a fade
  });

  it("the 40 ms white-noise burst at 2.45 s is found, and no gap is invented", () => {
    const clip = withBurst(melody(UP), 2.45, 0.04);
    const gaps = detectGaps(clip, { sampleRate: SR });
    expect(gaps).toEqual([]);

    const bursts = detectBursts(clip, { sampleRate: SR });
    const hit = bursts.filter((e) => e.startSec <= 2.49 && e.endSec >= 2.45);
    expect(hit.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(hit[0]!.startSec - 2.45)).toBeLessThan(0.05);
    expect(hit[0]!.peakFlatness).toBeGreaterThanOrEqual(0.15);
    expect(hit[0]!.kinds).toContain("noise-burst");
    // and no defect-shaped events anywhere else in the clip
    const elsewhere = bursts.filter((e) => hit.indexOf(e) < 0);
    expect(elsewhere).toEqual([]);
  });

  it("the dropout's hard edges may flag as clicks, but only there", () => {
    const clip = withDropout(melody(UP), 3.15, 0.15);
    const bursts = detectBursts(clip, { sampleRate: SR });
    for (const e of bursts) {
      // Cutting a 0.5-amplitude note to zero (and back) IS a step; if the
      // slope test says anything at all on this clip it must say it there.
      expect(e.endSec).toBeGreaterThan(3.05);
      expect(e.startSec).toBeLessThan(3.45);
    }
  });
});

describe("gap detector boundaries", () => {
  it("leading and trailing silence are arrangement, not damage", () => {
    const tone = sine({ frequency: 440, duration: 1, sampleRate: 44100, amplitude: 0.5 });
    const padded = new Float64Array(tone.length + 2 * Math.round(0.5 * 44100));
    padded.set(tone, Math.round(0.5 * 44100));
    expect(detectGaps(padded, { sampleRate: 44100 })).toEqual([]);
  });

  it("a 20 ms dip is articulation under the default gate, damage under a 10 ms one", () => {
    const clip = withDropout(melody(UP), 1.5, 0.02);
    expect(detectGaps(clip, { sampleRate: SR })).toEqual([]);
    const picky = detectGaps(clip, { sampleRate: SR, minGapSec: 0.01 });
    expect(picky).toHaveLength(1);
    expect(Math.abs(picky[0]!.startSec - 1.5)).toBeLessThan(0.03);
  });

  it("digital silence reports nothing — there is nothing to drop out of", () => {
    expect(detectGaps(new Float64Array(SR), { sampleRate: SR })).toEqual([]);
    expect(detectGaps(new Float64Array(0), { sampleRate: SR })).toEqual([]);
  });
});

describe("burst detector", () => {
  it("unit impulses in silence flag as clicks at sample-grid accuracy", () => {
    const clip = clickTrain({ times: [0.5, 1.0], duration: 2, sampleRate: 44100 });
    const events = detectBursts(clip, { sampleRate: 44100 });
    const times = events.map((e) => e.startSec);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(times.some((t) => Math.abs(t - 0.5) < 0.02)).toBe(true);
    expect(times.some((t) => Math.abs(t - 1.0) < 0.02)).toBe(true);
    expect(events[0]!.kinds).toContain("click");
  });

  it("a quiet burst in a quiet clip still flags — the bar is relative", () => {
    const soft = melody(UP).map((v) => v * 0.1);
    const clip = withBurst(new Float64Array(soft), 2.45, 0.04).map((v) => v * 0.2);
    const events = detectBursts(clip, { sampleRate: SR });
    const hit = events.filter((e) => e.startSec <= 2.49 && e.endSec >= 2.45);
    expect(hit.length).toBeGreaterThanOrEqual(1);
  });

  it("caps the event list rather than flooding the caller", () => {
    const times = Array.from({ length: 60 }, (_, i) => 0.1 + i * 0.05);
    const clip = clickTrain({ times, duration: 3.5, sampleRate: 44100 });
    expect(detectBursts(clip, { sampleRate: 44100 }).length).toBeLessThanOrEqual(40);
  });

  it("sustained harmonic material with vibrato does not flag", () => {
    const clip = sine({ frequency: 220, duration: 2, sampleRate: 44100, amplitude: 0.6 });
    expect(detectBursts(clip, { sampleRate: 44100 })).toEqual([]);
  });
});

describe("rmsEnvelope", () => {
  it("anchors frame times at frame starts on the hop grid", () => {
    const env = rmsEnvelope(new Float64Array(44100).fill(0.5), { sampleRate: 44100 });
    // The hop quantises to whole samples: 0.005 s at 44.1 kHz is 220.5,
    // rounds to 221 — the reported hopSec is the REALISED hop.
    expect(env.hopSec).toBeCloseTo(221 / 44100, 9);
    expect(env.times[0]).toBe(0);
    expect(env.times[1]).toBeCloseTo(env.hopSec, 12);
    expect(env.rms[0]).toBeCloseTo(0.5, 9);
    expect(env.db[0]).toBeCloseTo(20 * Math.log10(0.5), 9);
  });
});

describe("caveats ship with the detectors", () => {
  it("both caveats name their own false-positive mode", () => {
    expect(GAP_DETECTOR_CAVEAT).toMatch(/rests|sparse/i);
    expect(BURST_DETECTOR_CAVEAT).toMatch(/percussion|attacks/i);
  });
});
