// Constructible records for search-v0. No authored tool sequence.
// Throws if the engines no longer agree with the plant.

import { inferChord } from "../../songs/jam.js";
import { detectChord } from "../../chord-detect.js";
import { leftHandToMidi } from "../acoustic-v1/builder.js";
import { loadPublishableSongs } from "../acoustic-v1/library.js";
import {
  SEARCH_SCHEMA_VERSION,
  searchTask,
  splitOf,
  userPrompt,
  type SearchCase,
} from "./task.js";

export interface SearchRecord {
  schema_version: string;
  id: string;
  split: "train" | "test";
  song_id: string;
  kind: "search";
  thresholds: Readonly<Record<string, number>>;
  observation: {
    gold: { verdict: string; chord: string; measure: number; after: number; distance: number };
  };
  user: string;
}

export function rederivePlant(c: SearchCase): { measure: number; chord: string; midi: number[] } {
  const song = loadPublishableSongs().find((s) => s.id === c.song_id);
  if (!song) throw new Error(`song ${c.song_id} missing from publishable shelf`);
  for (const m of song.measures) {
    const midi = leftHandToMidi(m.leftHand);
    if (midi.length < 2) continue;
    const inferred = inferChord(m.leftHand);
    const detected = detectChord(midi);
    if (detected && detected === inferred && inferred === c.chord) {
      return { measure: m.number, chord: inferred, midi };
    }
  }
  throw new Error(`${c.song_id}: constructed chord ${c.chord} is no longer measurable`);
}

export function buildRecord(c: SearchCase): SearchRecord {
  if (c.after < 1 || c.after >= c.measure) {
    throw new Error(`${c.song_id} ${c.chord}: after ${c.after} is not strictly before plant ${c.measure}`);
  }
  const measured = rederivePlant(c);
  if (measured.measure !== c.measure || measured.chord !== c.chord) {
    throw new Error(
      `measured ${c.song_id} ${measured.chord}@${measured.measure} !== constructed ${c.chord}@${c.measure}`,
    );
  }
  return {
    schema_version: SEARCH_SCHEMA_VERSION,
    id: `search:${c.song_id}:${c.chord}:from${c.after}:m${c.measure}`,
    split: splitOf(c),
    song_id: c.song_id,
    kind: "search",
    thresholds: { ...searchTask.thresholds },
    observation: {
      gold: {
        verdict: String(c.measure),
        chord: c.chord,
        measure: c.measure,
        after: c.after,
        distance: c.distance,
      },
    },
    user: userPrompt(c),
  };
}

export function buildAllRecords(): SearchRecord[] {
  return searchTask.cases().map(buildRecord);
}
