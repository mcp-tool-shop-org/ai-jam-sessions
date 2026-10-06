// ─── ai-jam-sessions: Dropouts and Noise Bursts ──────────────────────────────
//
// The integrity pair from the audio-tooling consult's row 1: sudden silences
// (dropouts) and sudden broadband energy (noise bursts, clicks, glitches).
// These are the two most common render defects, and neither the onset
// detector nor the pitch tracker sees them — a dropout is just "no onset
// there", a click is just "an onset". Here they get their own measurements.
//
// GAPS work off a 10 ms RMS envelope. A frame counts as silent when it sits
// under BOTH an absolute floor (−60 dBFS) and a relative line (30 dB under
// the clip's own 95th-percentile level): the absolute line catches literal
// digital zeros in a quietly mixed cue, the relative one catches a
// thirty-times-too-quiet window in a loud one. Only INTERIOR silences are
// reported — leading and trailing silence are arrangement, not damage — and a
// run must hold for minGapSec (default 50 ms) so legato spacing and staccato
// air between notes stay unreported. The ground truth this is tuned against
// is the consult's ablation clip: a 150 ms dropout cut to zero inside a
// melody whose note boundaries never dip below −20 dB.
//
// BURSTS work off the existing STFT plus a sample-domain slope scan, because
// two defect shapes exist. Broadband junk (a noise burst, a buffer glitch)
// drives a frame's spectral flatness — the geometric-over-arithmetic mean of
// the magnitude spectrum, librosa's definition — far above anything a
// harmonic note produces (~0.8 for noise, ~0.02–0.08 for a tone with a few
// partials), and its energy sits dB above its ±0.25 s context. An isolated
// click too short to own a frame still owns a SAMPLE: |x[i] − x[i−1]| jumps
// far past the local median slope. A frame needs flatness AND energy, or a
// slope spike, to flag — flatness alone fires on bright brass, energy alone
// on loud notes.
//
// Both detectors ship caveats, following onsets.ts: these are proposals
// against the audio's own context, and a flagged event near an onset time is
// probably percussion, not a defect. The numbers are the product.
//
// Usage:
//   const gaps = detectGaps(samples, { sampleRate: 44100 });
//   const bursts = detectBursts(samples, { sampleRate: 44100 });
// ─────────────────────────────────────────────────────────────────────────────

import { stft } from "./stft.js";

/**
 * Shipped on every gap report. An interior silence above minGapSec is worth
 * knowing about; it is not proof of damage. Rests, breaths, hard stops and
 * fade-shaped articulations are all silences with context on both sides too.
 */
export const GAP_DETECTOR_CAVEAT =
  "Gap detection flags interior silences against the clip's own level. " +
  "Rests and deliberately sparse writing pass the same test — a reported " +
  "gap is a place to look, not a verdict that the render broke.";

/**
 * Shipped on every burst report. Anything percussive — a drum hit, a hard
 * piano attack, a pizzicato — is broadband and louder than its context, which
 * is exactly the signature. Cross-check an event against the onset list
 * before calling it a glitch.
 */
export const BURST_DETECTOR_CAVEAT =
  "Burst detection flags broadband energy or click-like slope far above the " +
  "local context. Percussion and hard attacks share that signature: compare a " +
  "flagged time with the onset list before treating it as a defect.";

/** A rectangular-windowed RMS envelope on a hop grid. */
export interface RmsEnvelope {
  /** START time in seconds of each frame (not centre — gaps report from it). */
  times: Float64Array;
  rms: Float64Array;
  /** 20·log10 of the RMS, floored at −300 dB rather than −Infinity. */
  db: Float64Array;
  frameSec: number;
  hopSec: number;
}

/** Options for {@link rmsEnvelope}. */
export interface EnvelopeOptions {
  sampleRate: number;
  /** Frame size in seconds. Defaults to 0.010 (10 ms). */
  frameSec?: number;
  /** Hop between frame starts in seconds. Defaults to 0.005 (5 ms). */
  hopSec?: number;
}

/** Short-time RMS envelope, rectangular window, frames anchored at start. */
export function rmsEnvelope(
  samples: ArrayLike<number>,
  options: EnvelopeOptions,
): RmsEnvelope {
  const { sampleRate, frameSec = 0.01, hopSec = 0.005 } = options;
  if (!(sampleRate > 0)) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  }
  if (!(frameSec > 0) || !(hopSec > 0)) {
    throw new Error(`frameSec and hopSec must be positive, got ${frameSec} and ${hopSec}.`);
  }
  const frame = Math.max(1, Math.round(frameSec * sampleRate));
  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const frameCount = samples.length === 0
    ? 0
    : 1 + Math.max(0, Math.floor((samples.length - 1) / hop));

  const times = new Float64Array(frameCount);
  const rms = new Float64Array(frameCount);
  const db = new Float64Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const start = f * hop;
    const end = Math.min(samples.length, start + frame);
    let sum = 0;
    for (let i = start; i < end; i++) {
      const v = samples[i]!;
      sum += v * v;
    }
    const r = Math.sqrt(end > start ? sum / (end - start) : 0);
    times[f] = start / sampleRate;
    rms[f] = r;
    db[f] = 20 * Math.log10(Math.max(r, 1e-15));
  }
  return { times, rms, db, frameSec: frame / sampleRate, hopSec: hop / sampleRate };
}

/** One interior silence. */
export interface GapEvent {
  startSec: number;
  endSec: number;
  durationSec: number;
  /** Deepest frame level inside the gap, dBFS. */
  minDbFs: number;
  /** How far the deepest point sits under the clip's own context level. */
  depthDb: number;
}

/** Options for {@link detectGaps}. */
export interface GapOptions {
  sampleRate: number;
  /** Envelope frame size. Defaults to 0.010. */
  frameSec?: number;
  /** Envelope hop. Defaults to 0.005. */
  hopSec?: number;
  /**
   * Shortest silence worth reporting, in seconds. Defaults to 0.05 (50 ms) —
   * shorter dips are normal note articulation, not dropouts.
   */
  minGapSec?: number;
  /**
   * A frame below this dBFS is silent regardless of context. Defaults to −60.
   */
  absoluteFloorDbFs?: number;
  /**
   * A frame this many dB under the clip's 95th-percentile level is silent
   * relative to context. Defaults to 30.
   */
  contextDropDb?: number;
  /** Cap on reported events, earliest first. Defaults to 20. */
  maxEvents?: number;
}

function resolveGapOptions(options: GapOptions): Required<GapOptions> {
  const {
    sampleRate,
    frameSec = 0.01,
    hopSec = 0.005,
    minGapSec = 0.05,
    absoluteFloorDbFs = -60,
    contextDropDb = 30,
    maxEvents = 20,
  } = options;
  if (!(sampleRate > 0)) throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  if (!(minGapSec > 0)) throw new Error(`minGapSec must be positive, got ${minGapSec}.`);
  if (!(contextDropDb > 0)) throw new Error(`contextDropDb must be positive, got ${contextDropDb}.`);
  if (!(maxEvents >= 1)) throw new Error(`maxEvents must be a positive count, got ${maxEvents}.`);
  return { sampleRate, frameSec, hopSec, minGapSec, absoluteFloorDbFs, contextDropDb, maxEvents };
}

/**
 * Find interior silences: envelope runs under the silence line, bounded by
 * sounded material on BOTH sides, at least minGapSec long, earliest first.
 * Digital-silent input and all-quiet input report nothing (nothing there to
 * drop out of).
 */
export function detectGaps(
  samples: ArrayLike<number>,
  options: GapOptions,
): GapEvent[] {
  const opts = resolveGapOptions(options);
  const env = rmsEnvelope(samples, opts);
  const frameCount = env.db.length;
  if (frameCount === 0) return [];

  // Context level: the 95th-percentile frame, robust to a few loud transients
  // dominating the way a max would.
  const sorted = Float64Array.from(env.db).sort();
  const contextDb = sorted[Math.ceil(0.95 * (frameCount - 1))]!;
  const durationSec = samples.length / opts.sampleRate;
  if (contextDb < opts.absoluteFloorDbFs) return [];

  const silenceDb = Math.max(opts.absoluteFloorDbFs, contextDb - opts.contextDropDb);
  const silent = new Array<boolean>(frameCount);
  let firstActive = -1;
  let lastActive = -1;
  for (let f = 0; f < frameCount; f++) {
    silent[f] = env.db[f]! < silenceDb;
    if (!silent[f]) {
      if (firstActive < 0) firstActive = f;
      lastActive = f;
    }
  }
  if (firstActive < 0) return [];

  const events: GapEvent[] = [];

  let runStart = -1;
  const closeRun = (runEnd: number): void => {
    if (runStart < 0) return;
    if (runStart <= firstActive || runEnd >= lastActive) {
      runStart = -1;
      return; // touches the file's quiet edges: arrangement, not damage
    }
    // The run's actual span is what articulation is measured against
    // (counting frames instead would under-measure by exactly one frame when
    // the gap lands between hop-grid points — a real 20 ms dip came out as
    // "2 frames" and slipped the 50 ms gate).
    const endSec = Math.min(durationSec, env.times[runEnd]! + env.frameSec);
    const startSec = env.times[runStart]!;
    if (endSec - startSec < opts.minGapSec - 1e-9) {
      runStart = -1;
      return;
    }
    let minDb = Infinity;
    for (let f = runStart; f <= runEnd; f++) {
      if (env.db[f]! < minDb) minDb = env.db[f]!;
    }
    events.push({
      startSec,
      endSec,
      durationSec: endSec - startSec,
      minDbFs: minDb,
      depthDb: contextDb - minDb,
    });
    runStart = -1;
  };

  for (let f = 0; f < frameCount; f++) {
    if (silent[f] && runStart < 0) runStart = f;
    if (!silent[f]) closeRun(f - 1);
  }
  closeRun(frameCount - 1);

  return events.slice(0, opts.maxEvents);
}

/** What fired: the broadband test, the click slope test, or both. */
export type BurstKind = "noise-burst" | "click";

/** One flagged defect-shaped event. */
export interface BurstEvent {
  startSec: number;
  endSec: number;
  durationSec: number;
  /** Which tests fired anywhere inside the event. */
  kinds: BurstKind[];
  /** Highest spectral flatness seen inside (0 harmonic … 1 white noise). */
  peakFlatness: number;
  /** Largest energy excess over the ±contextSec neighbourhood, in dB. */
  maxEnergyJumpDb: number;
  /** Largest sample-to-sample slope over the local median slope. */
  maxSlopeRatio: number;
}

/** Options for {@link detectBursts}. */
export interface BurstOptions {
  sampleRate: number;
  /** STFT size. Defaults to 1024 (~23 ms at 44.1 kHz). */
  nFft?: number;
  /** STFT hop. Defaults to 256 (~5.8 ms at 44.1 kHz). */
  hopLength?: number;
  /**
   * Spectral flatness (on magnitude) at which a frame counts as broadband.
   * Defaults to 0.15 — a tone with a handful of partials lives under 0.1,
   * white noise measures ~0.8 here.
   */
  flatnessMin?: number;
  /**
   * How far above the local median energy a broadband frame must sit, in dB.
   * Defaults to 4. Keeps a soft-noise section of a quiet passage from
   * flagging; a defect is loud for WHERE it is. The ablation fixture
   * measured +5.6 dB in-frame, so the older 6 dB line missed the studio's
   * own defect clip outright — 4 dB clears it with margin while flatness
   * still carries most of the discrimination (clean tone: 0.004, the burst:
   * 0.83, against a 0.15 line).
   */
  energyJumpDb?: number;
  /**
   * Sample slope over the local median slope that counts as a click.
   * Defaults to 6.
   */
  slopeRatioMin?: number;
  /**
   * Absolute slope floor: even against a silent neighbourhood, a sample jump
   * below this is inaudible. Defaults to 0.05 (−26 dBFS per sample).
   */
  slopeFloor?: number;
  /**
   * Half-width of the context neighbourhood in seconds. Defaults to 0.25.
   * Two frames each side of the candidate are excluded from its own context.
   */
  contextSec?: number;
  /** Cap on reported events, earliest first. Defaults to 40. */
  maxEvents?: number;
  /**
   * Lowest frequency bin to count toward flatness, in Hz. Defaults to 100 —
   * rumble and DC offset are level problems, not burst-shape problems.
   */
  flatnessLowHz?: number;
}

function resolveBurstOptions(options: BurstOptions): Required<BurstOptions> {
  const {
    sampleRate,
    nFft = 1024,
    hopLength = 256,
    flatnessMin = 0.15,
    energyJumpDb = 4,
    slopeRatioMin = 6,
    slopeFloor = 0.05,
    contextSec = 0.25,
    maxEvents = 40,
    flatnessLowHz = 100,
  } = options;
  if (!(sampleRate > 0)) throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  if (!(nFft >= 8) || !Number.isInteger(nFft)) throw new Error(`nFft must be an integer >= 8, got ${nFft}.`);
  if (!(hopLength >= 1) || !Number.isInteger(hopLength)) throw new Error(`hopLength must be a positive integer, got ${hopLength}.`);
  if (!(flatnessMin > 0 && flatnessMin <= 1)) throw new Error(`flatnessMin must be in (0, 1], got ${flatnessMin}.`);
  if (!(energyJumpDb > 0)) throw new Error(`energyJumpDb must be positive, got ${energyJumpDb}.`);
  if (!(slopeRatioMin > 0)) throw new Error(`slopeRatioMin must be positive, got ${slopeRatioMin}.`);
  if (!(slopeFloor > 0)) throw new Error(`slopeFloor must be positive, got ${slopeFloor}.`);
  if (!(contextSec > 0)) throw new Error(`contextSec must be positive, got ${contextSec}.`);
  if (!(maxEvents >= 1)) throw new Error(`maxEvents must be a positive count, got ${maxEvents}.`);
  return {
    sampleRate, nFft, hopLength, flatnessMin, energyJumpDb, slopeRatioMin,
    slopeFloor, contextSec, maxEvents, flatnessLowHz,
  };
}

function median(values: Float64Array): number {
  if (values.length === 0) return NaN;
  const sorted = Float64Array.from(values).sort();
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Find defect-shaped energy: frames that are suddenly broadband and loud for
 * where they are (noise bursts, buffer glitches), or that hold a click's
 * sample-domain step even when too short to own a frame. Neighbouring flagged
 * frames (tolerance: one quiet frame between) merge into one event.
 */
export function detectBursts(
  samples: ArrayLike<number>,
  options: BurstOptions,
): BurstEvent[] {
  const opts = resolveBurstOptions(options);
  const n = samples.length;
  if (n < opts.hopLength) return [];
  const durationSec = n / opts.sampleRate;

  const spec = stft(new Float64Array(samples), {
    sampleRate: opts.sampleRate,
    nFft: opts.nFft,
    hopLength: opts.hopLength,
  });
  const frames = spec.frameCount;
  const binHz = opts.sampleRate / opts.nFft;
  const binLo = Math.max(1, Math.ceil(opts.flatnessLowHz / binHz));
  const binCount = spec.binCount - binLo;

  // Per frame: spectral flatness on magnitude (Wiener entropy, librosa's
  // definition) and total energy, both over [flatnessLowHz, Nyquist].
  const flatness = new Float64Array(frames);
  const energyDb = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let logSum = 0;
    let sum = 0;
    let powerSum = 0;
    for (let k = binLo; k < spec.binCount; k++) {
      const p = Math.max(spec.data[f * spec.binCount + k]!, 1e-30); // power
      const m = Math.sqrt(p);
      logSum += Math.log(m);
      sum += m;
      powerSum += p;
    }
    const geometric = Math.exp(logSum / binCount);
    const arithmetic = sum / binCount;
    flatness[f] = Math.min(1, geometric / arithmetic);
    energyDb[f] = 10 * Math.log10(Math.max(powerSum, 1e-30));
  }

  // Per hop-grid cell (aligned with frame centres, since stft centres its
  // frames): the largest sample-to-sample slope anywhere in the cell. The
  // click half of the detector lives here — a one-sample pop never shows up
  // in flatness.
  const maxSlope = new Float64Array(frames);
  for (let c = 0; c < frames; c++) {
    const cellStart = c * opts.hopLength;
    const cellEnd = Math.min(n, cellStart + 2 * opts.hopLength);
    let big = 0;
    for (let i = Math.max(1, cellStart); i < cellEnd; i++) {
      const d = Math.abs(samples[i]! - samples[i - 1]!);
      if (d > big) big = d;
    }
    maxSlope[c] = big;
  }

  const contextFrames = Math.max(2, Math.round((opts.contextSec * opts.sampleRate) / opts.hopLength));

  /**
   * Median of the context strip for one series around frame f, excluding the
   * two frames each side so a wide defect doesn't raise its own bar.
   */
  const contextMedian = (series: Float64Array, f: number): number => {
    const lo = Math.max(0, f - contextFrames);
    const hi = Math.min(series.length - 1, f + contextFrames);
    let count = 0;
    for (let i = lo; i <= hi; i++) {
      if (Math.abs(i - f) > 2) count++;
    }
    if (count === 0) return NaN;
    const strip = new Float64Array(count);
    let j = 0;
    for (let i = lo; i <= hi; i++) {
      if (Math.abs(i - f) > 2) strip[j++] = series[i]!;
    }
    return median(strip);
  };

  const broadband = new Array<boolean>(frames).fill(false);
  const click = new Array<boolean>(frames).fill(false);
  const jumpDb = new Float64Array(frames);
  const slopeRatio = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    const ctxEnergy = contextMedian(energyDb, f);
    if (
      Number.isFinite(ctxEnergy) &&
      flatness[f]! >= opts.flatnessMin &&
      energyDb[f]! >= ctxEnergy + opts.energyJumpDb
    ) {
      broadband[f] = true;
      jumpDb[f] = energyDb[f]! - ctxEnergy;
    }

    const ctxSlope = contextMedian(maxSlope, f);
    const ratio = ctxSlope > 0 ? maxSlope[f]! / ctxSlope : Infinity;
    slopeRatio[f] = ratio === Infinity && maxSlope[f]! === 0 ? 0 : ratio;
    if (maxSlope[f]! >= opts.slopeFloor && ratio >= opts.slopeRatioMin) {
      click[f] = true;
    }
  }

  // Merge flagged frames into events, tolerating a single unflagged frame
  // between runs (a burst that dips under the energy bar for one hop is still
  // one burst).
  const flagged = (f: number): boolean => broadband[f]! || click[f]!;
  const events: BurstEvent[] = [];
  let eventStart = -1;
  let lastFlag = -1;
  const closeEvent = (): void => {
    if (eventStart < 0) return;
    const startSec = (eventStart * opts.hopLength) / opts.sampleRate;
    const endSec = Math.min(durationSec, ((lastFlag + 1) * opts.hopLength) / opts.sampleRate);
    const kinds = new Set<BurstKind>();
    let peakFlatness = 0;
    let maxEnergyJumpDb = 0;
    let maxSlopeRatio = 0;
    for (let f = eventStart; f <= lastFlag; f++) {
      if (broadband[f]) kinds.add("noise-burst");
      if (click[f]) kinds.add("click");
      if (flatness[f]! > peakFlatness) peakFlatness = flatness[f]!;
      if (jumpDb[f]! > maxEnergyJumpDb) maxEnergyJumpDb = jumpDb[f]!;
      if (slopeRatio[f]! > maxSlopeRatio && Number.isFinite(slopeRatio[f])) {
        maxSlopeRatio = slopeRatio[f]!;
      }
      if (slopeRatio[f] === Infinity) maxSlopeRatio = Infinity;
    }
    events.push({
      startSec,
      endSec,
      durationSec: endSec - startSec,
      kinds: [...kinds],
      peakFlatness,
      maxEnergyJumpDb,
      maxSlopeRatio,
    });
    eventStart = -1;
  };

  for (let f = 0; f < frames; f++) {
    if (flagged(f)) {
      if (eventStart < 0) eventStart = f;
      lastFlag = f;
    } else if (eventStart >= 0 && f - lastFlag > 1) {
      closeEvent();
    }
  }
  closeEvent();

  return events.slice(0, opts.maxEvents);
}
