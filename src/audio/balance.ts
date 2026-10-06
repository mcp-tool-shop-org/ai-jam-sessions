// ─── ai-jam-sessions: Spectral Balance ───────────────────────────────────────
//
// Where a render's energy sits from sub-bass to air: the arithmetic behind
// "this mix is muddy", "this cue is harsher than its siblings", "this voice
// line is thin". The level numbers live in loudness.ts and the damage
// detectors in defects.ts; this module answers the tonal question.
//
// NO VERDICTS, ON PURPOSE. There is no correct spectrum for music: a dark
// ambient cue and a bright chiptune are both right, and a fixed "too much
// low-mid" bar would flag half a catalogue. So this module reports two kinds
// of number and leaves the judgement to whoever has the context:
//
//   1. Against PINK NOISE, the mixing engineer's neutral reference: equal
//      energy per octave. Each band carries its deviation from what pink noise
//      would put there, and the whole spectrum carries a tilt in dB per
//      octave (pink = 0, white = +3, a darker render is negative). Real music
//      sits below pink in the sub and the air almost always; the numbers say
//      by how much, not whether that is wrong.
//   2. Against A REFERENCE RENDER (compareBalance): band by band, how this
//      file differs from one that is known to be right. This is the question
//      that has an answer — a cue that should sit like its siblings, a re-
//      render that should match the take it replaces.
//
// BANDS are the common mix-engineering split: sub 20–60, bass 60–250,
// low-mid 250–500, mid 500–2k, high-mid 2k–4k, presence 4k–6k, brilliance
// 6k–20k. A band that starts at or above Nyquist is reported as unmeasured,
// and the top band is truncated at Nyquist, so a 22.05 kHz file is honest
// about having no air to measure.
//
// SILENCE IS GATED. Frames more than 50 dB under the loudest frame are left
// out of the average, so a long release tail or a leading count-in does not
// drag the balance towards the noise floor. A file that is entirely silent
// returns null rather than a spectrum of nothing.
//
// INPUT IS MONO, like everything downstream of wav.ts. Stereo width and phase
// are a separate question that starts at decode.

import { stft } from "./stft.js";

/** One analysis band, edges in Hz. */
export interface BalanceBandSpec {
  name: string;
  lowHz: number;
  highHz: number;
}

/** The common mix-engineering split. */
export const BALANCE_BANDS: readonly BalanceBandSpec[] = [
  { name: "sub", lowHz: 20, highHz: 60 },
  { name: "bass", lowHz: 60, highHz: 250 },
  { name: "low-mid", lowHz: 250, highHz: 500 },
  { name: "mid", lowHz: 500, highHz: 2000 },
  { name: "high-mid", lowHz: 2000, highHz: 4000 },
  { name: "presence", lowHz: 4000, highHz: 6000 },
  { name: "brilliance", lowHz: 6000, highHz: 20000 },
];

/** Frames this far under the loudest frame are left out of the average. */
export const BALANCE_GATE_DB = 50;

/** Octaves this far under the strongest octave are left out of the tilt fit. */
export const TILT_FLOOR_DB = 20;

/** Fraction of energy below the rolloff frequency. */
export const BALANCE_ROLLOFF_FRACTION = 0.85;

export const BALANCE_CAVEAT =
  "Spectral balance is a description, not a grade: there is no correct " +
  "spectrum for music, and real mixes sit below pink noise in the sub and the " +
  "air almost always. Judge a deviation against a reference render of the " +
  "same kind (compare_balance), not against zero.";

export interface BalanceOptions {
  sampleRate: number;
  /** Transform size; must be a power of two. Defaults to 8192 (≈5 Hz bins at 44.1 kHz). */
  nFft?: number;
  /** Defaults to nFft / 2. */
  hopLength?: number;
  /** Silence gate, dB under the loudest frame. Defaults to BALANCE_GATE_DB. */
  gateDb?: number;
}

export interface BalanceBand {
  name: string;
  lowHz: number;
  /** Upper edge actually measured: the spec's, or Nyquist if lower. */
  highHz: number;
  /** False when the band starts at or above Nyquist. */
  measured: boolean;
  /** Share of the 20 Hz–top energy in this band, 0–100. 0 when unmeasured. */
  sharePercent: number;
  /** The same share in dB (10·log10 of the fraction). −Infinity when empty. */
  levelDb: number;
  /** levelDb minus what pink noise would put in this band. Null when unmeasured. */
  vsPinkDb: number | null;
}

export interface BalanceReport {
  bands: BalanceBand[];
  /** Energy-weighted mean frequency, 20 Hz–top. The usual "brightness" number. */
  centroidHz: number;
  /** Frequency below which BALANCE_ROLLOFF_FRACTION of the energy lies. */
  rolloffHz: number;
  /**
   * Least-squares slope of per-octave energy against octave, in dB per octave.
   * Pink noise reads 0, white noise +3; a darker render is negative. Fitted
   * only over octaves within TILT_FLOOR_DB of the strongest; null when fewer
   * than three qualify (a narrow-band sound has no tilt to speak of).
   */
  tiltDbPerOctave: number | null;
  /** Upper edge of the measured range: min(20 kHz, Nyquist). */
  topHz: number;
  framesUsed: number;
  framesGated: number;
}

/** Octave-band centres for the tilt fit (the ISO 266 series). */
const OCTAVE_CENTRES = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/**
 * Measure the long-term spectral balance of a mono signal.
 *
 * Returns null when the signal is silent (no frame clears the gate) or too
 * short for one transform.
 */
export function measureBalance(
  samples: ArrayLike<number>,
  options: BalanceOptions,
): BalanceReport | null {
  const { sampleRate } = options;
  if (!(sampleRate > 0)) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  }
  if (samples.length < 64) return null;
  // A window shorter than the transform shrinks the transform to the largest
  // power of two that fits, rather than refusing: analyze_audio accepts windows
  // down to 2048 samples, and coarser bins beat no balance at all.
  let nFft = options.nFft ?? 8192;
  while (nFft > samples.length && nFft > 64) nFft /= 2;
  const hopLength = options.hopLength ?? nFft / 2;
  const gateDb = options.gateDb ?? BALANCE_GATE_DB;

  const spec = stft(samples, { sampleRate, nFft, hopLength, power: 2 });
  const { frameCount, binCount, data } = spec;
  const binHz = sampleRate / nFft;
  const nyquist = sampleRate / 2;
  const topHz = Math.min(20000, nyquist);

  // Gate on per-frame total power, relative to the loudest frame.
  const framePower = new Float64Array(frameCount);
  let loudest = 0;
  for (let t = 0; t < frameCount; t++) {
    let s = 0;
    for (let k = 0; k < binCount; k++) s += data[t * binCount + k]!;
    framePower[t] = s;
    if (s > loudest) loudest = s;
  }
  if (!(loudest > 0)) return null;
  const floor = loudest * 10 ** (-gateDb / 10);

  const mean = new Float64Array(binCount);
  let used = 0;
  for (let t = 0; t < frameCount; t++) {
    if (framePower[t]! < floor) continue;
    used++;
    for (let k = 0; k < binCount; k++) mean[k]! += data[t * binCount + k]!;
  }
  if (used === 0) return null;
  for (let k = 0; k < binCount; k++) mean[k]! /= used;

  // Energy between two frequencies, splitting edge bins by the fraction of
  // their width that falls inside, so band edges do not quantise to the bin
  // grid (a 20–60 Hz band is only ~8 bins wide at 8192 / 44.1 kHz).
  const energy = (lo: number, hi: number): number => {
    let e = 0;
    const kLo = Math.max(0, Math.floor(lo / binHz - 0.5));
    const kHi = Math.min(binCount - 1, Math.ceil(hi / binHz + 0.5));
    for (let k = kLo; k <= kHi; k++) {
      const a = Math.max(lo, (k - 0.5) * binHz);
      const b = Math.min(hi, (k + 0.5) * binHz);
      if (b > a) e += mean[k]! * ((b - a) / binHz);
    }
    return e;
  };

  const total = energy(20, topHz);
  if (!(total > 0)) return null;
  const octavesTotal = Math.log2(topHz / 20);

  const bands: BalanceBand[] = BALANCE_BANDS.map((b) => {
    const measured = b.lowHz < topHz;
    const highHz = Math.min(b.highHz, topHz);
    if (!measured) {
      return { name: b.name, lowHz: b.lowHz, highHz: b.highHz, measured, sharePercent: 0, levelDb: -Infinity, vsPinkDb: null };
    }
    const share = energy(b.lowHz, highHz) / total;
    const levelDb = share > 0 ? 10 * Math.log10(share) : -Infinity;
    // Pink noise has equal energy per octave, so its share of a band is the
    // band's width in octaves over the measured range's.
    const pinkDb = 10 * Math.log10(Math.log2(highHz / b.lowHz) / octavesTotal);
    return { name: b.name, lowHz: b.lowHz, highHz, measured, sharePercent: share * 100, levelDb, vsPinkDb: levelDb - pinkDb };
  });

  let num = 0;
  let cum = 0;
  let rolloffHz = topHz;
  const kStart = Math.ceil(20 / binHz);
  const kEnd = Math.min(binCount - 1, Math.floor(topHz / binHz));
  let inRange = 0;
  for (let k = kStart; k <= kEnd; k++) inRange += mean[k]!;
  let rolled = false;
  for (let k = kStart; k <= kEnd; k++) {
    num += k * binHz * mean[k]!;
    cum += mean[k]!;
    if (!rolled && cum >= BALANCE_ROLLOFF_FRACTION * inRange) {
      rolloffHz = k * binHz;
      rolled = true;
    }
  }
  const centroidHz = inRange > 0 ? num / inRange : 0;

  // Tilt: per-octave energy in dB against octave index, over whole octaves
  // that fit under the top of the measured range AND carry real energy. An
  // octave 20 dB under the strongest one is the floor, not the spectrum: fitted
  // in, the empty octaves at BOTH ends of a peaked sound swing the slope to
  // nonsense (a chord progression with nothing above 2 kHz read +1.5 dB/octave,
  // "brighter than pink"). Fewer than three octaves left is a narrow-band sound
  // with no tilt to speak of, reported as null rather than as a number. The
  // floor was 30 dB until a signal with abrupt edges splashed broadband energy
  // into its empty octaves at about −30 dB and read +4.7 dB/octave; 20 dB keeps
  // white noise's slope (its weakest whole octave is ~21 dB down, its slope
  // the same either way) and drops the splash.
  const octaves: { i: number; db: number }[] = [];
  OCTAVE_CENTRES.forEach((fc, i) => {
    const lo = fc / Math.SQRT2;
    const hi = fc * Math.SQRT2;
    if (hi > topHz) return;
    const e = energy(lo, hi);
    if (e > 0) octaves.push({ i, db: 10 * Math.log10(e) });
  });
  const strongest = Math.max(...octaves.map((o) => o.db));
  const fitted = octaves.filter((o) => o.db >= strongest - TILT_FLOOR_DB);
  const xs = fitted.map((o) => o.i);
  const ys = fitted.map((o) => o.db);
  let tiltDbPerOctave: number | null = null;
  if (xs.length >= 3) {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += (xs[i]! - mx) * (ys[i]! - my);
      sxx += (xs[i]! - mx) ** 2;
    }
    tiltDbPerOctave = sxy / sxx;
  }

  return {
    bands,
    centroidHz,
    rolloffHz,
    tiltDbPerOctave,
    topHz,
    framesUsed: used,
    framesGated: frameCount - used,
  };
}

export interface BalanceBandDifference {
  name: string;
  /** This file's band level minus the reference's, in dB. Null if either is unmeasured or empty. */
  diffDb: number | null;
}

export interface BalanceComparison {
  bands: BalanceBandDifference[];
  /** This file's centroid minus the reference's, in Hz. */
  centroidDiffHz: number;
  /** This file's tilt minus the reference's, in dB per octave. Null if either has no tilt. */
  tiltDiffDbPerOctave: number | null;
}

/**
 * How one balance differs from a reference, band by band.
 *
 * Both reports are SHARES of their own total, so overall loudness cancels out:
 * a quieter render with the same tone compares as zero everywhere. Loudness is
 * loudness.ts's question.
 */
export function compareBalance(
  subject: BalanceReport,
  reference: BalanceReport,
): BalanceComparison {
  // Shares are fractions of 20 Hz–top. With different tops the denominators
  // differ, and every band would read a difference that is only bandwidth.
  if (subject.topHz !== reference.topHz) {
    throw new Error(
      `Cannot compare balances measured up to ${subject.topHz} Hz and ${reference.topHz} Hz: ` +
      `the files have different sample rates. Resample one to match first.`,
    );
  }
  const bands = subject.bands.map((b, i) => {
    const r = reference.bands[i]!;
    const ok = b.measured && r.measured && Number.isFinite(b.levelDb) && Number.isFinite(r.levelDb);
    return { name: b.name, diffDb: ok ? b.levelDb - r.levelDb : null };
  });
  return {
    bands,
    centroidDiffHz: subject.centroidHz - reference.centroidHz,
    tiltDiffDbPerOctave:
      subject.tiltDbPerOctave === null || reference.tiltDbPerOctave === null
        ? null
        : subject.tiltDbPerOctave - reference.tiltDbPerOctave,
  };
}
