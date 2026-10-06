// ─── ai-jam-sessions: The Loop Seam ──────────────────────────────────────────
//
// The click where a looping track's end meets its start — the consult's row 3
// and the single most common bug in game music. Small module on top of
// defects.ts: wrap the audio around the seam ([tail window, head window]),
// run the burst detector over the join, and pair that with two closed-form
// measurements: the extrapolated step and the level shift.
//
// THE STEP IS EXTRAPOLATED, not a raw boundary jump. A naive
// |x[last] − x[first]| flags sample-perfect loops: sine(441 Hz, 1.0 s,
// 44.1 kHz) is exactly 100 cycles over the file, so the sample after the end
// equals the first — a mathematically seamless loop — yet x[N−1] =
// sin(2π·99/100) ≈ −0.0628 and x[0] = 0, so the raw jump reads −0.063, over
// any sane click threshold. What the ear hears is whether the NEXT sample the
// loop would produce matches what the tail's trajectory predicts, so the
// measure here is x[0] against a first-order extrapolation of the last two
// samples. In phase-smooth material that is exact to second order; a hard cut
// (the actual defect) reads as the full jump.
//
// THE LEVEL SHIFT stands alone. A seam can be phase-perfect and still thump
// because the tail's last 100 ms mixed much louder or quieter than the head's
// first 100 ms (a cue whose outro swells into a quiet intro). That one is a
// mix decision, hence its own verdict name.
//
// Usage:
//   const seam = checkLoopSeam(samples, { sampleRate: 44100 });
// ─────────────────────────────────────────────────────────────────────────────

import { detectBursts, type BurstEvent } from "./defects.js";

/**
 * Extrapolated seam step above which a click is likely audible against
 * typical program level: 0.03 linear (≈ −30 dBFS of instantaneous jerk).
 * The burst detector does most of the finding; this is the tripwire for a
 * seam too short to own a frame.
 */
export const SEAM_STEP_CLICK_RISK = 0.03;

/** Level difference across the seam above which the change is its own event. */
export const SEAM_LEVEL_STEP_DB = 3;

/**
 * Shipped on every seam report. A seam is judged against the audio's own
 * material; a deliberate hit, riser, or pickup at the loop point reports just
 * the same. The verdict is about the render, not the writing.
 */
export const LOOP_SEAM_CAVEAT =
  "A seam defect is judged against the clip's own context. A deliberate hit " +
  "or level change at the loop point is reported just the same — the verdict " +
  "is about the render, not the writing.";

/** The verdict, named for what to fix. */
export type LoopSeamVerdict = "clean" | "click-risk" | "level-jump" | "click-risk and level-jump";

/** Options for {@link checkLoopSeam}. */
export interface LoopSeamOptions {
  sampleRate: number;
  /**
   * How much of the tail and head to hang around the wrapped seam for defect
   * detection, in seconds. Defaults to 0.5 (so the burst detector's ±0.25 s
   * context fits inside real material on both sides). Clamped to fit loops
   * shorter than two windows.
   */
  windowSec?: number;
  /**
   * RMS window each side of the seam for the level shift, in seconds.
   * Defaults to 0.1.
   */
  levelWindowSec?: number;
  /**
   * A burst event counts as at the seam when it reaches this close, in
   * seconds. Defaults to 0.02.
   */
  clickToleranceSec?: number;
}

/** Everything measured at one loop's end-meets-start. */
export interface LoopSeamReport {
  durationSec: number;
  /** Window of tail/head analysed around the seam, in seconds. */
  windowSec: number;
  /** Raw |x[first] − x[last]|. Informational only — see the header for why
   *  this is NOT the click measure. */
  boundaryDelta: number;
  /** |x[first] − extrapolated next sample|, first-order from the last two
   *  samples. This is the click measure. */
  stepLinear: number;
  /** 20·log10 of the step, floored at −300. */
  stepDbFs: number;
  /** RMS level of the final levelWindowSec, dBFS (floor −300). */
  tailDbFs: number;
  /** RMS level of the first levelWindowSec, dBFS (floor −300). */
  headDbFs: number;
  /** headDbFs − tailDbFs: positive means the loop comes back in louder. */
  levelStepDb: number;
  /** Burst-detector events overlapping the wrapped seam. */
  clicksAtSeam: BurstEvent[];
  verdict: LoopSeamVerdict;
  caveat: string;
}

/** RMS over a sample range, in dBFS with a −300 floor. */
function rangeDbFs(samples: ArrayLike<number>, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) {
    const v = samples[i]!;
    sum += v * v;
  }
  const rms = Math.sqrt(end > start ? sum / (end - start) : 0);
  return 20 * Math.log10(Math.max(rms, 1e-15));
}

/**
 * Judge the point where the file's end loops back to its start. Pure: no I/O,
 * no clocks, no assumptions about how many times it will loop.
 */
export function checkLoopSeam(
  samples: ArrayLike<number>,
  options: LoopSeamOptions,
): LoopSeamReport {
  const {
    sampleRate,
    windowSec = 0.5,
    levelWindowSec = 0.1,
    clickToleranceSec = 0.02,
  } = options;
  if (!(sampleRate > 0)) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  }
  if (!(windowSec > 0) || !(levelWindowSec > 0)) {
    throw new Error(`windowSec and levelWindowSec must be positive, got ${windowSec} and ${levelWindowSec}.`);
  }
  const n = samples.length;
  if (n < 2048) {
    throw new Error(
      `Need at least 2048 samples to judge a loop seam (enough for a burst-detection ` +
      `window with context), got ${n} (${(n / sampleRate).toFixed(4)} s).`,
    );
  }

  // Window: clamped so the wrapped seam always has real material on both
  // sides. The burst detector's context is derived from the SAME window, so
  // short loops shrink context instead of reading past the join.
  const winSamples = Math.min(Math.round(windowSec * sampleRate), Math.floor(n / 2));
  const win = winSamples / sampleRate;

  const wrapped = new Float64Array(winSamples * 2);
  for (let i = 0; i < winSamples; i++) {
    wrapped[i] = samples[n - winSamples + i]!; // tail
    wrapped[winSamples + i] = samples[i]!; // head
  }
  const seamSec = win;

  const clicksAtSeam = detectBursts(wrapped, {
    sampleRate,
    contextSec: Math.min(0.25, Math.max(0.05, win / 2)),
  }).filter((e) => e.startSec <= seamSec + clickToleranceSec && e.endSec >= seamSec - clickToleranceSec);

  const boundaryDelta = Math.abs(samples[0]! - samples[n - 1]!);
  // First-order extrapolation of the tail's final trend: the sample the loop
  // SHOULD produce next. Seamless material continues its own slope; a cut
  // lands somewhere else entirely.
  const predicted = samples[n - 1]! + (samples[n - 1]! - samples[n - 2]!);
  const stepLinear = Math.abs(samples[0]! - predicted);
  const stepDbFs = 20 * Math.log10(Math.max(stepLinear, 1e-15));

  const levelWin = Math.min(Math.round(levelWindowSec * sampleRate), winSamples);
  const tailDbFs = rangeDbFs(samples, n - levelWin, n);
  const headDbFs = rangeDbFs(samples, 0, levelWin);
  const levelStepDb = headDbFs - tailDbFs;

  const clickRisk = clicksAtSeam.length > 0 || stepLinear > SEAM_STEP_CLICK_RISK;
  const levelJump = Math.abs(levelStepDb) > SEAM_LEVEL_STEP_DB;
  const verdict: LoopSeamVerdict =
    clickRisk && levelJump
      ? "click-risk and level-jump"
      : clickRisk
        ? "click-risk"
        : levelJump
          ? "level-jump"
          : "clean";

  return {
    durationSec: n / sampleRate,
    windowSec: win,
    boundaryDelta,
    stepLinear,
    stepDbFs,
    tailDbFs,
    headDbFs,
    levelStepDb,
    clicksAtSeam,
    verdict,
    caveat: LOOP_SEAM_CAVEAT,
  };
}
