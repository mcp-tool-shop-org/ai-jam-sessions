// ─── piano-sessions-ai ──────────────────────────────────────────────────────
//
// MCP server + CLI for AI-powered piano teaching.
// Plays songs through VMPK via MIDI with voice feedback.
//
// Usage:
//   import { createSession, createVmpkConnector } from "piano-sessions-ai";
//   import { getSong } from "ai-music-sheets";
// ─────────────────────────────────────────────────────────────────────────────

// Re-export ai-music-sheets for convenience
export {
  getAllSongs,
  getSong,
  getSongsByGenre,
  getSongsByDifficulty,
  searchSongs,
  getStats,
  GENRES,
  DIFFICULTIES,
} from "ai-music-sheets";

export type {
  SongEntry,
  Measure,
  MusicalLanguage,
  Genre,
  Difficulty,
} from "ai-music-sheets";

// Export session engine
export { createSession, SessionController } from "./session.js";

// Export VMPK connector
export { createVmpkConnector, createMockVmpkConnector } from "./vmpk.js";

// Export note parser
export {
  parseNoteToMidi,
  parseDuration,
  durationToMs,
  parseNoteToken,
  parseHandString,
  parseMeasure,
  midiToNoteName,
} from "./note-parser.js";

// Export teaching engine
export {
  createConsoleTeachingHook,
  createSilentTeachingHook,
  createRecordingTeachingHook,
  createCallbackTeachingHook,
  detectKeyMoments,
} from "./teaching.js";

// Export types
export type {
  Session,
  SessionOptions,
  SessionState,
  PlaybackMode,
  PlaybackProgress,
  ProgressCallback,
  MidiNote,
  Beat,
  PlayableMeasure,
  MidiStatus,
  VmpkConfig,
  VmpkConnector,
  TeachingHook,
  TeachingInterjection,
  TeachingPriority,
} from "./types.js";

export { DURATION_MAP, NOTE_OFFSETS } from "./types.js";
