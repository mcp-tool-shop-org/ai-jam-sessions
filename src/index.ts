// ─── pianoai ────────────────────────────────────────────────────────────────
//
// Piano player — plays songs through speakers or MIDI.
// Built-in piano engine included. No external software required.
//
// Usage:
//   import { createSession, createAudioEngine } from "@mcptoolshop/pianoai";
//   import { getSong } from "@mcptoolshop/ai-music-sheets";
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
} from "@mcptoolshop/ai-music-sheets";

export type {
  SongEntry,
  Measure,
  MusicalLanguage,
  Genre,
  Difficulty,
} from "@mcptoolshop/ai-music-sheets";

// Export session engine
export { createSession, SessionController } from "./session.js";

// Export piano engine (built-in audio — plays through speakers)
export { createAudioEngine } from "./audio-engine.js";

// Export MIDI connector (optional — for routing to external MIDI software)
export { createVmpkConnector, createMockVmpkConnector } from "./vmpk.js";

// Export note parser
export {
  parseNoteToMidi,
  parseDuration,
  durationToMs,
  parseNoteToken,
  parseHandString,
  parseMeasure,
  safeParseNoteToken,
  safeParseHandString,
  safeParseMeasure,
  midiToNoteName,
  noteToSingable,
  handToSingableText,
  measureToSingableText,
} from "./note-parser.js";

export type { SingAlongMode, SingAlongTextOptions } from "./note-parser.js";

// Export teaching engine
export {
  createConsoleTeachingHook,
  createSilentTeachingHook,
  createRecordingTeachingHook,
  createCallbackTeachingHook,
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createSingAlongHook,
  createLiveFeedbackHook,
  composeTeachingHooks,
  detectKeyMoments,
} from "./teaching.js";

export type {
  TeachingEvent,
  TeachingCallbacks,
  VoiceHookOptions,
  AsideHookOptions,
  SingAlongHookOptions,
} from "./teaching.js";

// Export types
export type {
  Session,
  SessionOptions,
  SessionState,
  PlaybackMode,
  SyncMode,
  PlaybackProgress,
  ProgressCallback,
  ParseWarning,
  MidiNote,
  Beat,
  PlayableMeasure,
  MidiStatus,
  VmpkConfig,
  VmpkConnector,
  TeachingHook,
  TeachingInterjection,
  TeachingPriority,
  VoiceDirective,
  VoiceSink,
  AsideDirective,
  AsideSink,
  LiveFeedbackHookOptions,
} from "./types.js";

export { DURATION_MAP, NOTE_OFFSETS } from "./types.js";
