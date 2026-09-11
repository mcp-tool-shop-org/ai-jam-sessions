// ─── search-v0: first measure whose left hand is a planted chord ──────────────
//
// Gold is the plant (the measure number), constructible: first measure where
// inferChord and detectChord agree on that chord. The tool sequence is not
// authored. Split by song_id. Closed verdicts are measures 1–16.

import { leftHandToMidi } from "../acoustic-v1/builder.js";
import { loadPublishableSongs } from "../acoustic-v1/library.js";
import { inferChord } from "../../songs/jam.js";
import { detectChord } from "../../chord-detect.js";
import { MAX_TURNS } from "../experiment/env.js";
import { defineTask } from "../experiment/registry.js";

export const SEARCH_SCHEMA_VERSION = "jam-actions-search-v0/1.0.0";
export const MAX_MEASURE = 16;
export const SEARCH_VERDICTS: readonly string[] = Array.from({ length: MAX_MEASURE }, (_, i) => String(i + 1));

export const SEARCH_THRESHOLDS = {
  max_measure: MAX_MEASURE,
  max_turns: MAX_TURNS,
  max_parallel: 2,
} as const;

/** Hold out these songs. Split by song_id, never by record. */
export const TEST_SONG_IDS = ["bethena", "the-easy-winners"] as const;

export interface SearchCase {
  song_id: string;
  title: string;
  chord: string;
  measure: number;
  midi: number[];
}

let cached: SearchCase[] | null = null;

export function splitOf(c: SearchCase): "train" | "test" {
  return (TEST_SONG_IDS as readonly string[]).includes(c.song_id) ? "test" : "train";
}

export function plants(): SearchCase[] {
  if (cached) return cached;
  const out: SearchCase[] = [];
  for (const song of loadPublishableSongs()) {
    const seen = new Set<string>();
    for (const m of song.measures) {
      if (m.number > MAX_MEASURE) continue;
      const midi = leftHandToMidi(m.leftHand);
      if (midi.length < 2) continue;
      const inferred = inferChord(m.leftHand);
      const detected = detectChord(midi);
      if (!detected || detected !== inferred) continue;
      if (seen.has(inferred)) continue;
      seen.add(inferred);
      out.push({
        song_id: song.id,
        title: song.title,
        chord: inferred,
        measure: m.number,
        midi,
      });
    }
  }
  cached = out;
  return out;
}

export function userPrompt(c: SearchCase): string {
  return `In "${c.title}", what is the first measure whose left hand is ${c.chord}? Answer with a single integer.`;
}

export const searchTask = defineTask<SearchCase>({
  id: "search-v0",
  schemaVersion: SEARCH_SCHEMA_VERSION,
  verdicts: SEARCH_VERDICTS,
  thresholds: SEARCH_THRESHOLDS,
  cases: plants,
  splitKey: (c) => c.song_id,
});
