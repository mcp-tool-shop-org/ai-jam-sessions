import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SongEntry } from "../songs/types.js";
import { resolveLibraryMidiPath } from "../songs/library.js";
import { loadEngineG2P } from "./g2p.js";
import { buildScoreLockedVocals, type BuiltVocalScore } from "./score-locked.js";
import { createScoreSinger, type ScoreSinger } from "./score-singer.js";
import { deriveScoreClock, detectMelodyTrack } from "./score-clock.js";
import { createSoulxScoreSinger } from "./soulx-singer.js";
import { getVocalTune } from "./tunes.js";

export interface LyricsRequest {
  lyrics?: string;
  lyricsFile?: string;
  startMeasure?: number;
  endMeasure?: number;
  tempo?: number;
  speed?: number;
  preset?: string;
  /** Singing backend: `kokoro` (default), `additive`, `tract`, or `soulx`. */
  backend?: string;
  /**
   * Library directory for MIDI path resolution. Required when backend is
   * `soulx` so the score clock can be derived from the song's MIDI file.
   */
  libraryDir?: string;
  /** Melody track name in the MIDI file. Auto-detected if omitted. */
  melodyTrack?: string;
  /**
   * Path to a reference singing voice clip (WAV/MP3) for SoulX zero-shot timbre.
   * The clip must have a corresponding SoulX metadata JSON. If omitted, the
   * example prompt in the SoulX checkout is used.
   */
  soulxPromptWav?: string;
  /**
   * Path to the SoulX metadata JSON for the reference voice clip.
   * Required when soulxPromptWav is set.
   */
  soulxPromptMeta?: string;
}

export function resolveLyricsText(req: LyricsRequest, songId?: string): string | null {
  if (req.lyricsFile) {
    return readFileSync(req.lyricsFile, "utf8");
  }
  if (req.lyrics && req.lyrics.trim().length > 0) return req.lyrics;
  if (songId) {
    const tune = getVocalTune(songId);
    if (tune?.lyrics) return tune.lyrics;
  }
  return null;
}

export async function prepareScoreLocked(
  song: SongEntry,
  req: LyricsRequest,
): Promise<{ score: BuiltVocalScore; singer: ScoreSinger } | null> {
  const text = resolveLyricsText(req, song.id);
  if (!text) return null;
  const g2p = await loadEngineG2P();
  const score = buildScoreLockedVocals(song, {
    lyrics: text,
    startMeasure: req.startMeasure,
    endMeasure: req.endMeasure,
    tempo: req.tempo,
    speed: req.speed,
    g2p,
  });

  const backend = req.backend ?? "kokoro";

  if (backend === "soulx") {
    if (!req.libraryDir) {
      throw new Error(
        `SoulX backend requires libraryDir (the path to songs/library) so the score clock can be derived from the MIDI file.`,
      );
    }
    const midiPath = resolveLibraryMidiPath(req.libraryDir, song.genre, song.id);
    const midiBytes = new Uint8Array(readFileSync(midiPath));

    // Parse tracks to auto-detect melody if not specified
    const { parseMidiTracks } = await import("./score-clock.js");
    const { tracks: parsedTracks } = parseMidiTracks(midiBytes);
    let melodyTrack = req.melodyTrack;
    if (!melodyTrack) {
      const detected = detectMelodyTrack(parsedTracks);
      if (!detected) {
        throw new Error(
          `Could not auto-detect melody track in ${midiPath}. ` +
            `Available tracks: ${parsedTracks.filter((t) => t.notes.length > 0).map((t) => `"${t.name}"`).join(", ")}. ` +
            `Pass melodyTrack explicitly.`,
        );
      }
      melodyTrack = detected;
    }
    const clock = deriveScoreClock(song, {
      songId: song.id,
      midiFile: midiPath,
      midiBytes,
      melodyTrack,
      lyrics: text,
      startMeasure: req.startMeasure ?? 1,
      endMeasure: req.endMeasure ?? song.measures.length,
    });
    const singer = createSoulxScoreSinger(clock, {
      promptWav: req.soulxPromptWav,
      promptMeta: req.soulxPromptMeta,
    });
    return { score, singer };
  }

  const singer = createScoreSinger(score, { preset: req.preset, backend: backend as any });
  return { score, singer };
}

/** Engines that would otherwise sing aahs — with --lyrics the lead is the score singer. */
export function accompanimentEngineForLyrics(engine: string): string {
  if (engine === "synth" || engine === "vocal" || engine === "tract" || engine === "vocal+synth") {
    return "piano";
  }
  if (engine === "piano+synth") return "piano";
  if (engine === "guitar+synth") return "guitar";
  return engine;
}
