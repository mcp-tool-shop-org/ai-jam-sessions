// ─── piano-sessions-ai: Note Parser ─────────────────────────────────────────
//
// Converts scientific pitch notation (e.g. "C4:q", "F#5:e", "Bb3:h")
// into MIDI note numbers and durations for playback.
// ─────────────────────────────────────────────────────────────────────────────

import { NOTE_OFFSETS, DURATION_MAP } from "./types.js";
import type { MidiNote, Beat, PlayableMeasure } from "./types.js";
import type { Measure } from "ai-music-sheets";

/**
 * Parse a scientific pitch string into a MIDI note number.
 *
 * Examples:
 *   "C4"  → 60  (middle C)
 *   "A4"  → 69  (concert A)
 *   "F#5" → 78
 *   "Bb3" → 58
 *   "R"   → -1  (rest)
 */
export function parseNoteToMidi(noteStr: string): number {
  const trimmed = noteStr.trim();

  if (trimmed === "R" || trimmed === "r") return -1; // rest

  // Match: letter + optional accidental + octave
  // e.g. "C4", "F#5", "Bb3", "G#4"
  const match = trimmed.match(/^([A-Ga-g])(#|b)?(\d)$/);
  if (!match) {
    throw new Error(`Invalid note: "${noteStr}"`);
  }

  const [, letter, accidental, octaveStr] = match;
  const base = NOTE_OFFSETS[letter.toUpperCase()];
  if (base === undefined) {
    throw new Error(`Unknown note letter: "${letter}"`);
  }

  const octave = parseInt(octaveStr, 10);
  let midi = (octave + 1) * 12 + base;

  if (accidental === "#") midi += 1;
  if (accidental === "b") midi -= 1;

  if (midi < 0 || midi > 127) {
    throw new Error(`MIDI note out of range: ${midi} (from "${noteStr}")`);
  }

  return midi;
}

/**
 * Parse a duration suffix into a multiplier relative to a quarter note.
 *
 * ":w" → 4.0 (whole), ":h" → 2.0 (half), ":q" → 1.0 (quarter),
 * ":e" → 0.5 (eighth), ":s" → 0.25 (sixteenth).
 * Default (no suffix) → 1.0 (quarter).
 */
export function parseDuration(suffix: string): number {
  const mult = DURATION_MAP[suffix];
  if (mult === undefined) {
    throw new Error(`Unknown duration suffix: "${suffix}"`);
  }
  return mult;
}

/**
 * Convert a BPM tempo + duration multiplier → milliseconds.
 *
 * At 120 BPM, a quarter note = 500ms.
 * A half note at 120 BPM = 1000ms.
 */
export function durationToMs(multiplier: number, bpm: number): number {
  const quarterMs = 60_000 / bpm;
  return quarterMs * multiplier;
}

/**
 * Parse a single note token like "C4:q" or "R:h" into a MidiNote.
 *
 * @param token   - e.g. "C4:q", "F#5:e", "Bb3:h", "R:q"
 * @param bpm     - tempo in beats per minute
 * @param channel - MIDI channel (0-15)
 * @param velocity - MIDI velocity (0-127)
 */
export function parseNoteToken(
  token: string,
  bpm: number,
  channel = 0,
  velocity = 80
): MidiNote {
  const trimmed = token.trim();
  const parts = trimmed.split(":");

  const noteStr = parts[0];
  const durationSuffix = parts[1] ?? "q"; // default to quarter note

  const midi = parseNoteToMidi(noteStr);
  const mult = parseDuration(durationSuffix);
  const durationMs = durationToMs(mult, bpm);

  return {
    note: midi,
    velocity: midi === -1 ? 0 : velocity, // rests have 0 velocity
    durationMs,
    channel,
  };
}

/**
 * Parse a hand string like "C4:q E4:q G4:q" into an array of Beats.
 *
 * Each space-separated token becomes a sequential beat.
 * For chords (simultaneous notes), we'd need a different notation,
 * but the current ai-music-sheets format treats each token as sequential.
 */
export function parseHandString(
  handStr: string,
  hand: "right" | "left",
  bpm: number,
  channel = 0,
  velocity = 80
): Beat[] {
  if (!handStr || handStr.trim() === "") return [];

  const tokens = handStr.trim().split(/\s+/);
  return tokens.map((token) => ({
    notes: [parseNoteToken(token, bpm, channel, velocity)],
    hand,
  }));
}

/**
 * Parse a full Measure into a PlayableMeasure with MIDI-ready beats.
 */
export function parseMeasure(
  measure: Measure,
  bpm: number,
  velocity = 80
): PlayableMeasure {
  return {
    source: measure,
    rightBeats: parseHandString(measure.rightHand, "right", bpm, 0, velocity),
    leftBeats: parseHandString(measure.leftHand, "left", bpm, 0, velocity),
  };
}

/**
 * Convert a MIDI note number back to a note name (for display).
 *
 * 60 → "C4", 69 → "A4", 78 → "F#5"
 */
export function midiToNoteName(midi: number): string {
  if (midi < 0) return "R";

  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${noteNames[noteIndex]}${octave}`;
}
