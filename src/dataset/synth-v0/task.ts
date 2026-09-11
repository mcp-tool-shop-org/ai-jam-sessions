// synth-v0: same question as search-v0, generated songs, distance pinned to 1–3.
// Difficulty is distractor confusability (D0–D3). Split by song_id.
// schema jam-actions-synth-v0/1.0.0 — not registered.

import { MAX_TURNS, MAX_PARALLEL } from "../experiment/env.js";
import { defineTask } from "../experiment/registry.js";
import { MAX_LIST_WINDOW } from "../search-v0/window.js";
import { generateCorpus } from "./generate.js";

export const SYNTH_SCHEMA_VERSION = "jam-actions-synth-v0/1.0.0";
export const MAX_MEASURE = 120;
export const SYNTH_VERDICTS: readonly string[] = Array.from({ length: MAX_MEASURE }, (_, i) => String(i + 1));

export const SYNTH_THRESHOLDS = {
  max_measure: MAX_MEASURE,
  max_turns: MAX_TURNS,
  max_parallel: MAX_PARALLEL,
  max_list_window: MAX_LIST_WINDOW,
  min_distance: 1,
  max_distance: 3,
} as const;

export type DifficultyLevel = "D0" | "D1" | "D2" | "D3";

export interface SynthCase {
  song_id: string;
  title: string;
  chord: string;
  measure: number;
  midi: number[];
  after: number;
  distance: number;
  level: DifficultyLevel;
  split: "train" | "test";
}

export function splitOf(c: SynthCase): "train" | "test" {
  return c.split;
}

export function userPrompt(c: Pick<SynthCase, "title" | "after" | "chord">): string {
  return `In "${c.title}", what is the first measure at or after measure ${c.after} whose left hand is ${c.chord}? Answer with a single integer.`;
}

export function plants(): SynthCase[] {
  return generateCorpus().cases;
}

export const synthTask = defineTask<SynthCase>({
  id: "synth-v0",
  schemaVersion: SYNTH_SCHEMA_VERSION,
  verdicts: SYNTH_VERDICTS,
  thresholds: SYNTH_THRESHOLDS,
  cases: plants,
  splitKey: (c) => c.song_id,
});
