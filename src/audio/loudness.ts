// ─── ai-jam-sessions: Loudness, Peak and Clipping ────────────────────────────
//
// Overall loudness in LUFS, sample peak in dBFS, and clipped-sample counts —
// the level arithmetic behind "this cue is too loud", "this voice line is too
// quiet", and "this mix is distorted" (the studio consult's row 2). The two
// defect detectors and the loop-seam check live in defects.ts and
// loop-seam.ts; this module is the measurement they all quote when they say
// how loud anything is.
//
// LUFS MEANS ITU-R BS.1770-4 HERE, not a vendor flavour. K-weighting is two
// K-weighting is two
// biquads in cascade: a +4 dB high shelf (f0 1681.974 Hz, Q 0.7072) and the
// RLB high-pass (f0 38.135 Hz, Q 0.5003). The coefficients are designed at the
// caller's sample rate with the DeMan (2024) tan-pre-warped formulas — the
// same rule pyloudnorm follows — so the 48 kHz special case lands on the
// constants the standard prints in its own tables, which this module's test
// pins. (The plain RBJ cookbook shelf does NOT land there: same f0/G/Q but a
// different alpha convention, 0.4% off in b0 — measured, not theorised.) One
// honest deviation: the RLB high-pass normalises gain to 1 at Nyquist, where
// the standard's printed stage-2 numerator [1, −2, 1] is itself +0.043 dB hot
// there. The difference is at most ~0.04 LU on broadband material.
//
// GATING is the standard's: 400 ms blocks at 75% overlap, absolute gate at
// −70 LUFS, then a relative gate 10 LU under the gated mean. A clip shorter
// than one block measures as a single block over what there is — better a
// slightly short-window number on a 300 ms blip than no number at all. Said
// so here because libebur128 pads instead, so a sub-block clip can disagree
// with ffmpeg by a few tenths of a LU.
//
// INPUT IS MONO. DecodedAudio arrives already averaged to one channel
// (wav.ts), so this module never sees channels to weight. Multichannel
// loudness sums per-channel K-weighted energies with the BS.1770 weights;
// that is a different question and it starts at decode, not here.
//
// SAMPLE PEAK IS NOT TRUE PEAK. Inter-sample overshoots need 4× oversampling;
// what this module reports is the sample peak in dBFS plus a clipping count
// against an explicit threshold, which is the right defect-finding pair. The
// default threshold is 32767/32768 — the largest magnitude a 16-bit file can
// hold after wav.ts's decode mapping, so "touching full scale" means the same
// thing for 16-bit PCM and for float renders that actually hit ±1.
//
// Usage:
//   const levels = measureLevels(samples, { sampleRate: 44100 });
// ─────────────────────────────────────────────────────────────────────────────

/** A second-order IIR section, a0 normalised to 1: y = b·x − a·y feedthrough. */
export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

// The DeMan (2024) design parameters for the two K-weighting stages, from
// "Revisiting the ITU-R BS.1770 loudness standard" — the values that make the
// RBJ formulas reproduce the standard's printed 48 kHz coefficients.
const PRE_FILTER_F0_HZ = 1681.974450955533;
const PRE_FILTER_GAIN_DB = 3.99984385397;
const PRE_FILTER_Q = 0.7071752369554196;
const RLB_F0_HZ = 38.13547087602444;
const RLB_Q = 0.5003270373238773;

/** Absolute gate from the standard. */
export const BS1770_ABSOLUTE_GATE_LUFS = -70;
/** Relative gate from the standard: 10 LU under the absolute-gated mean. */
export const BS1770_RELATIVE_GATE_LU = 10;
/** The −0.691 in l = −0.691 + 10·log10(Σ Gᵢ zᵢ), named so the formula reads. */
export const BS1770_LOUDNESS_OFFSET = 0.691;
/** Momentary/gating block length: 400 ms. */
export const LOUDNESS_BLOCK_SEC = 0.4;
/** Gating block overlap: 75%, i.e. a 100 ms hop at 44.1/48 kHz. */
export const LOUDNESS_BLOCK_OVERLAP = 0.75;

/**
 * The largest sample magnitude wav.ts's integer decode can produce from a
 * 16-bit file (32767/32768). Used as the default clipping threshold so that
 * "this sample touched full scale" is one stable definition for 16-bit PCM,
 * for finer integer depths (which map to slightly larger maxima), and for
 * float renders that sit exactly on ±1.
 */
export const CLIP_THRESHOLD = 32767 / 32768;

/**
 * DeMan (2024) high shelf, tan-pre-warped. `Vb = Vh^0.499666774…` splits the
 * +4 dB between the shelf's two transition bands, which is what makes the
 * resulting 48 kHz constants equal the printed ones to ~1e-7. RBJ's shelf
 * spends the whole gain in one alpha term and misses by 0.4%.
 */
function highShelfBiquad(
  f0Hz: number,
  gainDb: number,
  q: number,
  sampleRate: number,
): BiquadCoeffs {
  const K = Math.tan((Math.PI * f0Hz) / sampleRate);
  const Vh = Math.pow(10, gainDb / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);

  const a0 = 1 + K / q + K * K;
  return {
    b0: (Vh + (Vb * K) / q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / q + K * K) / a0,
  };
}

/** DeMan / pyloudnorm high-pass: numerator exactly [1, −2, 1] over a0. */
function highPassBiquad(f0Hz: number, q: number, sampleRate: number): BiquadCoeffs {
  const K = Math.tan((Math.PI * f0Hz) / sampleRate);

  const a0 = 1 + K / q + K * K;
  return {
    b0: 1 / a0,
    b1: -2 / a0,
    b2: 1 / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / q + K * K) / a0,
  };
}

/** The two K-weighting sections, designed at `sampleRate`. */
export function kWeightingBiquads(sampleRate: number): {
  preFilter: BiquadCoeffs;
  rlbHighPass: BiquadCoeffs;
} {
  if (!(sampleRate > 0)) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  }
  return {
    preFilter: highShelfBiquad(PRE_FILTER_F0_HZ, PRE_FILTER_GAIN_DB, PRE_FILTER_Q, sampleRate),
    rlbHighPass: highPassBiquad(RLB_F0_HZ, RLB_Q, sampleRate),
  };
}

/**
 * Run one biquad over a signal, direct form II transposed, zero initial
 * state. Returns a new array; the input is untouched.
 */
export function filterBiquad(
  samples: ArrayLike<number>,
  coeffs: BiquadCoeffs,
): Float64Array {
  const { b0, b1, b2, a1, a2 } = coeffs;
  const out = new Float64Array(samples.length);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!;
    const y = b0 * x + s1;
    s1 = b1 * x - a1 * y + s2;
    s2 = b2 * x - a2 * y;
    out[i] = y;
  }
  return out;
}

/** Apply the full BS.1770 K-weighting: the shelf, then the RLB high-pass. */
export function kWeight(samples: ArrayLike<number>, sampleRate: number): Float64Array {
  const { preFilter, rlbHighPass } = kWeightingBiquads(sampleRate);
  return filterBiquad(filterBiquad(samples, preFilter), rlbHighPass);
}

/** Loudness of one block of K-weighted samples: −0.691 + 10·log10(z). */
function blockLoudness(meanSquare: number): number {
  return -BS1770_LOUDNESS_OFFSET + 10 * Math.log10(meanSquare);
}

/**
 * Mean square of each 400 ms block (75% overlap) of K-weighted audio. Shared
 * by the gated integrated loudness and the ungated momentary maximum, so the
 * two can never disagree about what a block is. A clip shorter than one block
 * is a single block over what there is (see the header).
 */
function loudnessBlocks(
  kWeighted: ArrayLike<number>,
  sampleRate: number,
): Float64Array {
  const n = kWeighted.length;
  if (n === 0) return new Float64Array(0);

  const block = Math.max(1, Math.round(LOUDNESS_BLOCK_SEC * sampleRate));
  const hop = Math.max(1, Math.round(block * (1 - LOUDNESS_BLOCK_OVERLAP)));
  const blockCount = n <= block ? 1 : 1 + Math.floor((n - block) / hop);

  const z = new Float64Array(blockCount);
  for (let b = 0; b < blockCount; b++) {
    const start = b * hop;
    const end = Math.min(n, start + block);
    let sum = 0;
    for (let i = start; i < end; i++) {
      const v = kWeighted[i]!;
      sum += v * v;
    }
    z[b] = sum / (end - start);
  }
  return z;
}

/**
 * BS.1770-4 integrated loudness of K-WEIGHTED mono audio.
 *
 * Absolute gate at −70 LUFS first, then a relative gate 10 LU below the
 * absolute-gated mean, then the mean of what survives. Returns `null` when
 * nothing passes the absolute gate — the honest answer for silence, where a
 * number would be −Infinity anyway.
 */
export function integratedLoudnessFromBlocks(blocks: Float64Array): number | null {
  const absKept: number[] = [];
  for (let b = 0; b < blocks.length; b++) {
    if (blocks[b]! > 0 && blockLoudness(blocks[b]!) >= BS1770_ABSOLUTE_GATE_LUFS) {
      absKept.push(b);
    }
  }
  if (absKept.length === 0) return null;

  const meanOver = (indices: number[]): number => {
    let sum = 0;
    for (const b of indices) sum += blocks[b]!;
    return sum / indices.length;
  };

  const relativeGate = Math.max(
    BS1770_ABSOLUTE_GATE_LUFS,
    blockLoudness(meanOver(absKept)) - BS1770_RELATIVE_GATE_LU,
  );
  const finalKept = absKept.filter((b) => blockLoudness(blocks[b]!) > relativeGate);
  if (finalKept.length === 0) return null;
  return blockLoudness(meanOver(finalKept));
}

/** One contiguous run of samples at or past the clipping threshold. */
export interface ClipRun {
  startSec: number;
  endSec: number;
  durationSec: number;
  /** Samples in the run. Runs of two or more are the smoking gun for real
   *  clipping; a single full-scale sample can be an innocent peak. */
  samples: number;
}

/** Every level number measureLevels() knows how to produce. */
export interface LevelReport {
  durationSec: number;
  /** Largest |x| in the window. */
  peakLinear: number;
  /** 20·log10 of the peak, −Infinity for digital silence. */
  peakDbFs: number;
  /** Time of the first sample that sets the peak. */
  peakTimeSec: number;
  rmsLinear: number;
  rmsDbFs: number;
  /** BS.1770-4 integrated loudness, or null below the absolute gate. */
  integratedLufs: number | null;
  /** Loudest 400 ms block, ungated. Null only on digital silence. */
  momentaryMaxLufs: number | null;
  /** The threshold clipping was counted against (see CLIP_THRESHOLD). */
  clipThreshold: number;
  clippedSamples: number;
  clipRuns: ClipRun[];
  longestClipRunSamples: number;
}

/** Options for {@link measureLevels}. */
export interface LevelOptions {
  sampleRate: number;
  /**
   * |x| at or above this counts as clipped. Defaults to {@link CLIP_THRESHOLD};
   * pass 1.0 to count only float renders that sit exactly on full scale, or a
   * lower value for a conservative "near full scale" check.
   */
  clipThreshold?: number;
}

/**
 * The level half of the integrity check: peak, RMS, BS.1770-4 integrated and
 * momentary loudness, and where the signal touched full scale.
 */
export function measureLevels(
  samples: ArrayLike<number>,
  options: LevelOptions,
): LevelReport {
  const { sampleRate, clipThreshold = CLIP_THRESHOLD } = options;
  if (!(sampleRate > 0)) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  }
  if (!(clipThreshold > 0)) {
    throw new Error(`clipThreshold must be positive, got ${clipThreshold}.`);
  }

  const n = samples.length;
  const durationSec = n / sampleRate;

  let peak = 0;
  let peakTimeSec = 0;
  let sumSquares = 0;
  const clipRuns: ClipRun[] = [];
  let clippedSamples = 0;
  let longestClipRunSamples = 0;
  let runStart = -1;

  for (let i = 0; i < n; i++) {
    const v = samples[i]!;
    const a = Math.abs(v);
    if (a > peak) {
      peak = a;
      peakTimeSec = i / sampleRate;
    }
    sumSquares += v * v;

    if (a >= clipThreshold) {
      if (runStart < 0) runStart = i;
      clippedSamples++;
    } else if (runStart >= 0) {
      const samples_ = i - runStart;
      clipRuns.push({
        startSec: runStart / sampleRate,
        endSec: i / sampleRate,
        durationSec: samples_ / sampleRate,
        samples: samples_,
      });
      if (samples_ > longestClipRunSamples) longestClipRunSamples = samples_;
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    const samples_ = n - runStart;
    clipRuns.push({
      startSec: runStart / sampleRate,
      endSec: n / sampleRate,
      durationSec: samples_ / sampleRate,
      samples: samples_,
    });
    if (samples_ > longestClipRunSamples) longestClipRunSamples = samples_;
  }

  const rms = Math.sqrt(n > 0 ? sumSquares / n : 0);
  const db = (linear: number): number => 20 * Math.log10(linear);

  const blocks = loudnessBlocks(kWeight(samples, sampleRate), sampleRate);
  let momentaryMaxLufs: number | null = null;
  for (let b = 0; b < blocks.length; b++) {
    if (blocks[b]! <= 0) continue;
    const l = blockLoudness(blocks[b]!);
    if (momentaryMaxLufs === null || l > momentaryMaxLufs) momentaryMaxLufs = l;
  }

  return {
    durationSec,
    peakLinear: peak,
    peakDbFs: db(peak),
    peakTimeSec,
    rmsLinear: rms,
    rmsDbFs: db(rms),
    integratedLufs: integratedLoudnessFromBlocks(blocks),
    momentaryMaxLufs,
    clipThreshold,
    clippedSamples,
    clipRuns,
    longestClipRunSamples,
  };
}
