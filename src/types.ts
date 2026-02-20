// ─── piano-sessions-ai: Core Types ──────────────────────────────────────────
//
// Session management, MIDI playback, and teaching interaction types.
// These bridge ai-music-sheets (the library) with the runtime (MIDI + voice).
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry, Measure, Genre, Difficulty } from "ai-music-sheets";

// ─── MIDI Types ─────────────────────────────────────────────────────────────

/** MIDI connection status. */
export type MidiStatus = "disconnected" | "connecting" | "connected" | "error";

/** Parsed note ready for MIDI output. */
export interface MidiNote {
  /** MIDI note number (0-127). Middle C = 60. */
  note: number;

  /** Velocity (0-127). 0 = note off. */
  velocity: number;

  /** Duration in milliseconds. */
  durationMs: number;

  /** MIDI channel (0-15). Default 0. */
  channel: number;
}

/** A parsed beat within a measure — one or more simultaneous notes. */
export interface Beat {
  /** Notes to play simultaneously (chord or single note). */
  notes: MidiNote[];

  /** Which hand: "right" or "left". */
  hand: "right" | "left";
}

/** A fully parsed measure ready for playback. */
export interface PlayableMeasure {
  /** Original measure data from the song. */
  source: Measure;

  /** Right-hand beats in chronological order. */
  rightBeats: Beat[];

  /** Left-hand beats in chronological order. */
  leftBeats: Beat[];
}

// ─── Session Types ──────────────────────────────────────────────────────────

/** Session state machine. */
export type SessionState =
  | "idle"        // No song loaded
  | "loaded"      // Song loaded, ready to play
  | "playing"     // Actively playing through MIDI
  | "paused"      // Playback paused mid-song
  | "finished";   // Song completed

/** Playback mode. */
export type PlaybackMode =
  | "full"        // Play the entire song straight through
  | "measure"     // Play one measure at a time, wait for user
  | "hands"       // Play each hand separately, then together
  | "loop";       // Loop a range of measures

/** A practice session. */
export interface Session {
  /** Unique session ID. */
  id: string;

  /** The song being practiced. */
  song: SongEntry;

  /** Current session state. */
  state: SessionState;

  /** Playback mode. */
  mode: PlaybackMode;

  /** Current measure index (0-based). */
  currentMeasure: number;

  /** Tempo override (BPM). Null = use song's default tempo. */
  tempoOverride: number | null;

  /** Measure range for loop mode [start, end] (1-based, inclusive). */
  loopRange: [number, number] | null;

  /** Session start time. */
  startedAt: Date;

  /** Total measures played in this session. */
  measuresPlayed: number;

  /** Voice feedback enabled. */
  voiceEnabled: boolean;
}

/** Options for creating a new session. */
export interface SessionOptions {
  /** Playback mode (default: "full"). */
  mode?: PlaybackMode;

  /** Tempo override in BPM (default: song's tempo). */
  tempo?: number;

  /** Loop range [start, end] for loop mode. */
  loopRange?: [number, number];

  /** Enable voice feedback (default: true). */
  voice?: boolean;
}

// ─── VMPK Types ─────────────────────────────────────────────────────────────

/** VMPK connection configuration. */
export interface VmpkConfig {
  /** MIDI output port name or regex pattern. Default: /loop/i */
  portName: string | RegExp;

  /** MIDI channel (0-15). Default: 0. */
  channel: number;

  /** Default velocity (0-127). Default: 80. */
  velocity: number;
}

/** VMPK connector interface — for DI/testing. */
export interface VmpkConnector {
  /** Connect to the MIDI output port. */
  connect(): Promise<void>;

  /** Disconnect from the MIDI output port. */
  disconnect(): Promise<void>;

  /** Get current connection status. */
  status(): MidiStatus;

  /** List available MIDI output ports. */
  listPorts(): string[];

  /** Send a note-on message. */
  noteOn(note: number, velocity: number, channel?: number): void;

  /** Send a note-off message. */
  noteOff(note: number, channel?: number): void;

  /** Send all-notes-off (panic). */
  allNotesOff(channel?: number): void;

  /** Play a single MidiNote (note-on, wait, note-off). */
  playNote(note: MidiNote): Promise<void>;
}

// ─── Note Parsing Types ─────────────────────────────────────────────────────

/** Duration suffix → multiplier (relative to quarter note). */
export const DURATION_MAP: Record<string, number> = {
  w: 4.0,   // whole
  h: 2.0,   // half
  q: 1.0,   // quarter
  e: 0.5,   // eighth
  s: 0.25,  // sixteenth
};

/**
 * Map from note name to semitone offset from C.
 * Used for scientific pitch → MIDI number conversion.
 */
export const NOTE_OFFSETS: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};
