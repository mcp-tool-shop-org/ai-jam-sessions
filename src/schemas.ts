// ─── Playback Schemas ───────────────────────────────────────────────────────
//
// Zod schemas for play_song input. Supports three playback sources:
//   1. songId  — play from the built-in song library
//   2. midiPath — play a local .mid file
//   3. midiUrl  — play a remote .mid file (downloaded on demand)
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

/** Play a song from the built-in library by ID. */
export const LibraryPlaySchema = z.object({
  songId: z.string().describe("Song ID from the built-in library (e.g. 'autumn-leaves')"),
});

/** Play a local MIDI file. */
export const FilePlaySchema = z.object({
  midiPath: z.string().describe("Absolute path to a local .mid file"),
});

/** Play a remote MIDI file by URL. */
export const UrlPlaySchema = z.object({
  midiUrl: z.string().url().describe("URL to a .mid file (downloaded on demand)"),
});

/**
 * Unified play source — one of: library song, local file, or remote URL.
 */
export const PlaySourceSchema = z.union([
  LibraryPlaySchema,
  FilePlaySchema,
  UrlPlaySchema,
]);

/** Infer the TypeScript type. */
export type PlaySource = z.infer<typeof PlaySourceSchema>;

/** Shared playback options (apply to all sources). */
export const PlaybackOptionsSchema = z.object({
  speed: z.number().min(0.1).max(4).optional()
    .describe("Speed multiplier (0.5 = half, 1.0 = normal, 2.0 = double)"),
  tempo: z.number().int().min(10).max(400).optional()
    .describe("Override tempo in BPM (10-400)"),
  mode: z.enum(["full", "measure", "hands", "loop"]).optional()
    .describe("Playback mode"),
  startMeasure: z.number().int().min(1).optional()
    .describe("Start measure for loop mode (1-based)"),
  endMeasure: z.number().int().min(1).optional()
    .describe("End measure for loop mode (1-based)"),
});

export type PlaybackOptions = z.infer<typeof PlaybackOptionsSchema>;
