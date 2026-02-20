// ─── MIDI File Types ────────────────────────────────────────────────────────
//
// Types for parsed standard MIDI file data.
// These are the output of the MIDI parser — raw note events with absolute
// timing, ready to be fed directly to the audio engine or MIDI connector.
// ─────────────────────────────────────────────────────────────────────────────

/** A single note event extracted from a MIDI file. */
export interface MidiNoteEvent {
  /** MIDI note number (0–127). 60 = middle C. */
  note: number;
  /** Velocity (0–127). 0 = note off. */
  velocity: number;
  /** Absolute start time in seconds from the beginning of the file. */
  time: number;
  /** Duration in seconds (time between note-on and note-off). */
  duration: number;
  /** MIDI channel (0–15). */
  channel: number;
}

/** A tempo change event from the MIDI file. */
export interface TempoEvent {
  /** Absolute time in seconds when this tempo takes effect. */
  time: number;
  /** Tempo in BPM. */
  bpm: number;
  /** Microseconds per quarter note (raw MIDI tempo value). */
  microsecondsPerBeat: number;
}

/** Result of parsing a standard MIDI file. */
export interface ParsedMidi {
  /** Total duration in seconds. */
  durationSeconds: number;
  /** All note events, sorted by time. */
  events: MidiNoteEvent[];
  /** Tempo changes throughout the file. */
  tempoChanges: TempoEvent[];
  /** Initial BPM (from first tempo event, or 120 if none). */
  bpm: number;
  /** Track names found in the file (from track name meta events). */
  trackNames: string[];
  /** MIDI format (0 = single track, 1 = multi-track, 2 = multi-song). */
  format: number;
  /** Ticks per quarter note (MIDI timing resolution). */
  ticksPerBeat: number;
  /** Total number of tracks in the file. */
  trackCount: number;
  /** Total note count. */
  noteCount: number;
}
