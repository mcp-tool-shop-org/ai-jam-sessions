// ─── MIDI Ingest Types ──────────────────────────────────────────────────────
//
// Tick-based types for the MIDI-to-SongEntry conversion pipeline.
// These are separate from src/midi/types.ts which uses seconds-based timing
// for real-time playback.
// ─────────────────────────────────────────────────────────────────────────────

/** A resolved note with absolute timing from MIDI. */
export interface ResolvedNote {
  /** MIDI note number 0-127. */
  noteNumber: number;
  /** Start time in ticks from the beginning. */
  startTick: number;
  /** Duration in ticks. */
  durationTicks: number;
  /** Velocity 0-127. */
  velocity: number;
  /** MIDI channel. */
  channel: number;
}

/** A tempo change event with absolute tick position. */
export interface IngestTempoEvent {
  tick: number;
  microsecondsPerBeat: number;
}

/** A time signature event with absolute tick position. */
export interface TimeSigEvent {
  tick: number;
  numerator: number;
  denominator: number;
}
