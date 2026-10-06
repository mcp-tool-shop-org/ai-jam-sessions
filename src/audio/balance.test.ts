// ─── Spectral Balance Tests ──────────────────────────────────────────────────
//
// Known-answer signals carry the weight. A sine puts all its energy in one
// band and its centroid at its own frequency. White noise has equal energy per
// HERTZ, so per-octave energy doubles each octave: +3.01 dB/octave of tilt.
// Pink noise has equal energy per OCTAVE: zero tilt and every band within a
// whisker of the pink reference. The pink generator is Paul Kellet's refined
// filter (±0.05 dB from 9.2 Hz to Nyquist at 44.1 kHz), a published design
// independent of this module, so the module is not grading its own homework.

import { describe, it, expect } from "vitest";
import { measureBalance, compareBalance, BALANCE_BANDS } from "./balance.js";
import { sine } from "./fixtures.js";

const SR = 44100;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32 * 2 - 1;
  };
}

function white(sec: number, seed = 1): Float64Array {
  const r = lcg(seed);
  return Float64Array.from({ length: Math.round(sec * SR) }, () => 0.3 * r());
}

function pink(sec: number, seed = 2): Float64Array {
  const r = lcg(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  const out = new Float64Array(Math.round(sec * SR));
  for (let i = 0; i < out.length; i++) {
    const w = r();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = 0.05 * (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362);
    b6 = w * 0.115926;
  }
  return out;
}

const band = (r: NonNullable<ReturnType<typeof measureBalance>>, name: string) =>
  r.bands.find((b) => b.name === name)!;

describe("measureBalance", () => {
  it("puts a 1 kHz sine in the mid band with its centroid at 1 kHz", () => {
    const r = measureBalance(sine({ frequency: 1000, duration: 2, sampleRate: SR, amplitude: 0.5 }), { sampleRate: SR })!;
    expect(band(r, "mid").sharePercent).toBeGreaterThan(99);
    expect(r.centroidHz).toBeGreaterThan(990);
    expect(r.centroidHz).toBeLessThan(1010);
  });

  it("reports no tilt for a narrow-band sound rather than a misleading slope", () => {
    const r = measureBalance(sine({ frequency: 1000, duration: 2, sampleRate: SR, amplitude: 0.5 }), { sampleRate: SR })!;
    expect(r.tiltDbPerOctave).toBeNull();
  });

  it("fits tilt only where the energy is: empty octaves do not swing the slope", () => {
    // Pink noise band-limited to 125 Hz–2 kHz by brick-wall FFT-free means:
    // a stack of octave-spaced sines at equal level, 125-2000 Hz. Equal energy
    // per octave inside the band, nothing outside it: the honest tilt is ~0,
    // and fitting the empty octaves around it would not be.
    const len = 4 * SR;
    const x = new Float64Array(len);
    for (const f of [125, 250, 500, 1000, 2000]) {
      for (let i = 0; i < len; i++) x[i]! += 0.1 * Math.sin(2 * Math.PI * f * i / SR);
    }
    const r = measureBalance(x, { sampleRate: SR })!;
    expect(Math.abs(r.tiltDbPerOctave!)).toBeLessThan(0.5);
  });

  it("puts a 100 Hz sine in the bass band", () => {
    const r = measureBalance(sine({ frequency: 100, duration: 2, sampleRate: SR, amplitude: 0.5 }), { sampleRate: SR })!;
    expect(band(r, "bass").sharePercent).toBeGreaterThan(99);
  });

  it("reads white noise at +3 dB/octave of tilt", () => {
    const r = measureBalance(white(10), { sampleRate: SR })!;
    expect(r.tiltDbPerOctave!).toBeGreaterThan(2.7);
    expect(r.tiltDbPerOctave!).toBeLessThan(3.3);
    // Equal energy per hertz: the centroid sits mid-range of 20 Hz–20 kHz.
    expect(r.centroidHz).toBeGreaterThan(9000);
    expect(r.centroidHz).toBeLessThan(11000);
  });

  it("reads pink noise as flat: zero tilt and every band near the pink reference", () => {
    const r = measureBalance(pink(20), { sampleRate: SR })!;
    expect(Math.abs(r.tiltDbPerOctave!)).toBeLessThan(0.3);
    for (const b of r.bands) {
      expect(b.measured).toBe(true);
      expect(Math.abs(b.vsPinkDb!)).toBeLessThan(1);
    }
  });

  it("gates silence, so a long silent tail does not move the balance", () => {
    const noise = pink(5);
    const padded = new Float64Array(noise.length * 3);
    padded.set(noise, 0);
    const a = measureBalance(noise, { sampleRate: SR })!;
    const b = measureBalance(padded, { sampleRate: SR })!;
    expect(b.framesGated).toBeGreaterThan(0);
    for (let i = 0; i < a.bands.length; i++) {
      expect(Math.abs(a.bands[i]!.levelDb - b.bands[i]!.levelDb)).toBeLessThan(0.2);
    }
  });

  it("marks bands above Nyquist unmeasured and truncates the top band", () => {
    const r = measureBalance(white(4), { sampleRate: 11025 })!;
    expect(r.topHz).toBe(5512.5);
    expect(band(r, "brilliance").measured).toBe(false);
    expect(band(r, "brilliance").vsPinkDb).toBeNull();
    expect(band(r, "presence").measured).toBe(true);
    expect(band(r, "presence").highHz).toBe(5512.5);
  });

  it("shrinks the transform for a window shorter than it, instead of refusing", () => {
    const r = measureBalance(sine({ frequency: 1000, duration: 2048 / SR, sampleRate: SR, amplitude: 0.5 }), { sampleRate: SR })!;
    expect(r).not.toBeNull();
    expect(band(r, "mid").sharePercent).toBeGreaterThan(90);
  });

  it("returns null for silence and for an empty signal", () => {
    expect(measureBalance(new Float64Array(SR), { sampleRate: SR })).toBeNull();
    expect(measureBalance(new Float64Array(0), { sampleRate: SR })).toBeNull();
  });

  it("covers the standard seven bands", () => {
    expect(BALANCE_BANDS.map((b) => b.name)).toEqual(
      ["sub", "bass", "low-mid", "mid", "high-mid", "presence", "brilliance"]);
  });
});

describe("compareBalance", () => {
  it("reads a file against itself as zero, and ignores overall level", () => {
    const x = pink(5);
    const quiet = x.map((v) => v * 0.1);
    const c = compareBalance(measureBalance(quiet, { sampleRate: SR })!, measureBalance(x, { sampleRate: SR })!);
    for (const b of c.bands) expect(Math.abs(b.diffDb!)).toBeLessThan(0.01);
  });

  it("shows a darker render as negative in the top bands and the tilt", () => {
    const x = pink(10);
    // One-pole low-pass near 1.5 kHz: the "dull re-render".
    const a = Math.exp(-2 * Math.PI * 1500 / SR);
    const dark = new Float64Array(x.length);
    for (let i = 0, y = 0; i < x.length; i++) dark[i] = y = (1 - a) * x[i]! + a * y;
    const c = compareBalance(measureBalance(dark, { sampleRate: SR })!, measureBalance(x, { sampleRate: SR })!);
    const diff = (n: string) => c.bands.find((b) => b.name === n)!.diffDb!;
    expect(diff("brilliance")).toBeLessThan(-10);
    expect(diff("bass")).toBeGreaterThan(0);
    // −6 dB/octave only above 1.5 kHz, about four of the ten fitted octaves: the
    // whole-spectrum slope lands near −1.5, so the bar is −1, not −6.
    expect(c.tiltDiffDbPerOctave!).toBeLessThan(-1);
    expect(c.centroidDiffHz).toBeLessThan(0);
  });

  it("refuses to compare files measured to different tops", () => {
    const a = measureBalance(white(2), { sampleRate: 44100 })!;
    const b = measureBalance(white(2), { sampleRate: 22050 })!;
    expect(() => compareBalance(a, b)).toThrow(/different sample rates/);
  });
});
