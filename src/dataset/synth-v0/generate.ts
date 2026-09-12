// Seeded synth-v0 generator. Distance is pinned to 1–3 (a control).
// Difficulty is distractor confusability in the first 4-measure page (D0–D3).
// A case whose two engines disagree is dropped, never labelled.

import { inferChord } from "../../songs/jam.js";
import { detectChord } from "../../chord-detect.js";
import { leftHandToMidi } from "../acoustic-v1/builder.js";
import { validateSong } from "../../songs/registry.js";
import type { Measure, SongEntry } from "../../songs/types.js";
import type { DifficultyLevel, SynthCase } from "./task.js";
import { SYNTH_SCHEMA_VERSION, SYNTH_THRESHOLDS, userPrompt } from "./task.js";

export const GENERATOR_SEED = 20260911;
export const TEST_PER_LEVEL = 32;
export const TRAIN_PER_LEVEL = 48;
export const DISTANCES = [1, 2, 3] as const;
export const LEVELS: readonly DifficultyLevel[] = ["D0", "D1", "D2", "D3"];

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
/** Roots where inferChord and detectChord use the same spelling. */
const AGREEING_PCS = [0, 1, 2, 4, 5, 6, 7, 9, 11];

export interface Voicing {
  lh: string;
  midi: number[];
  name: string;
  pcs: number[];
}

export interface SynthRecord {
  schema_version: string;
  id: string;
  split: "train" | "test";
  song_id: string;
  kind: "synth";
  family: DifficultyLevel;
  thresholds: Readonly<Record<string, number>>;
  observation: {
    gold: {
      verdict: string;
      chord: string;
      measure: number;
      after: number;
      distance: number;
      level: DifficultyLevel;
    };
  };
  user: string;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function midiToSci(m: number): string {
  const pc = ((m % 12) + 12) % 12;
  const oct = Math.floor(m / 12) - 1;
  return `${SHARP[pc]}${oct}`;
}

export function lhOf(midis: number[]): string {
  return [...midis].sort((a, b) => a - b).map(midiToSci).join("+") + ":q";
}

export function agree(lh: string): string | null {
  const midi = leftHandToMidi(lh);
  if (midi.length < 2) return null;
  const inferred = inferChord(lh);
  const detected = detectChord(midi);
  if (inferred && detected && inferred === detected) return inferred;
  return null;
}

function triadMidi(rootPc: number, minor: boolean, octave = 3): number[] {
  const root = 12 * (octave + 1) + rootPc;
  return [root, root + (minor ? 3 : 4), root + 7];
}

function voicingOf(midis: number[]): Voicing | null {
  const lh = lhOf(midis);
  const name = agree(lh);
  if (!name) return null;
  return {
    lh,
    midi: [...midis].sort((a, b) => a - b),
    name,
    pcs: [...new Set(midis.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b),
  };
}

export function catalog(): Voicing[] {
  const out: Voicing[] = [];
  for (const pc of AGREEING_PCS) {
    for (const minor of [false, true]) {
      const v = voicingOf(triadMidi(pc, minor, 3));
      if (v) out.push(v);
    }
  }
  return out;
}

function shared(a: number[], b: number[]): number {
  const s = new Set(a);
  return b.filter((x) => s.has(x)).length;
}

function invertOnce(midis: number[]): number[] {
  const s = [...midis].sort((a, b) => a - b);
  return [...s.slice(1), s[0]! + 12];
}

function letters(n: number): string {
  let x = n;
  let s = "";
  for (let i = 0; i < 3; i++) {
    s = String.fromCharCode(97 + (x % 26)) + s;
    x = Math.floor(x / 26);
  }
  return s;
}

/** Title → id the way Bethena → bethena. The policy kebab-cases the title. */
export function kebab(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function filler(rng: () => number, cat: Voicing[], forbiddenNames: Set<string>, forbiddenPcs: number[]): Voicing | null {
  const pool = cat.filter((v) => !forbiddenNames.has(v.name) && shared(v.pcs, forbiddenPcs) === 0);
  if (!pool.length) return null;
  return pool[pickInt(rng, 0, pool.length - 1)]!;
}

function share2(rng: () => number, cat: Voicing[], target: Voicing): Voicing | null {
  const pool = cat.filter((v) => v.name !== target.name && shared(v.pcs, target.pcs) === 2);
  if (!pool.length) return null;
  return pool[pickInt(rng, 0, pool.length - 1)]!;
}

function semitoneAway(rng: () => number, cat: Voicing[], target: Voicing): Voicing | null {
  const pool = cat.filter((v) => {
    const d = Math.abs(v.pcs[0]! - target.pcs[0]!);
    const wrap = Math.min(d, 12 - d);
    return wrap === 1 && v.name !== target.name;
  });
  if (!pool.length) return null;
  return pool[pickInt(rng, 0, pool.length - 1)]!;
}

function measure(n: number, lh: string): Measure {
  return { number: n, rightHand: "C4:q", leftHand: lh };
}

export function makeSong(opts: {
  id: string;
  title: string;
  nMeasures: number;
  pageStart: number;
  pageLh: string[];
  fillerLh: string;
}): SongEntry {
  const measures: Measure[] = [];
  for (let i = 1; i <= opts.nMeasures; i++) {
    const pageIdx = i - opts.pageStart;
    const lh = pageIdx >= 0 && pageIdx < 4 ? opts.pageLh[pageIdx]! : opts.fillerLh;
    measures.push(measure(i, lh));
  }
  const song: SongEntry = {
    id: opts.id,
    title: opts.title,
    genre: "classical",
    difficulty: "beginner",
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    durationSeconds: opts.nMeasures * 2,
    musicalLanguage: {
      description: "A generated study for chord-page discrimination.",
      structure: "through-composed",
      keyMoments: ["the planted page"],
      teachingGoals: ["name the first matching left-hand chord after a bound"],
      styleTips: ["steady"],
    },
    measures,
    tags: ["synth-v0"],
  };
  const errors = validateSong(song);
  if (errors.length) throw new Error(`${opts.id}: ${errors.join("; ")}`);
  return song;
}

export function smokeSong(): SongEntry {
  const c = voicingOf(triadMidi(0, false, 3));
  if (!c) throw new Error("C major voicing does not re-derive");
  return makeSong({
    id: kebab("Synth Smoke One"),
    title: "Synth Smoke One",
    nMeasures: 48,
    pageStart: 1,
    pageLh: [c.lh, c.lh, c.lh, c.lh],
    fillerLh: c.lh,
  });
}

function pageFor(
  rng: () => number,
  cat: Voicing[],
  level: DifficultyLevel,
  target: Voicing,
  targetSlot: number,
): string[] | null {
  const free = [0, 1, 2, 3].filter((i) => i !== targetSlot);
  const slots: Array<Voicing | undefined> = [undefined, undefined, undefined, undefined];
  const used = new Set<string>([target.name]);
  slots[targetSlot] = target;
  const place = (slot: number, v: Voicing) => {
    slots[slot] = v;
    used.add(v.name);
  };
  if (level === "D1") {
    const d = share2(rng, cat, target);
    if (!d) return null;
    place(free[0]!, d);
  } else if (level === "D2") {
    const inv = invertOnce(target.midi);
    place(free[0]!, { lh: lhOf(inv), midi: inv, name: `${target.name}/inv`, pcs: target.pcs });
  } else if (level === "D3") {
    const near = semitoneAway(rng, cat, target);
    if (!near) return null;
    const inv = invertOnce(target.midi);
    place(free[0]!, { lh: lhOf(inv), midi: inv, name: `${target.name}/inv`, pcs: target.pcs });
    place(free[1]!, near);
  }
  for (let i = 0; i < 4; i++) {
    if (i === targetSlot || slots[i]) continue;
    const v = filler(rng, cat, used, target.pcs);
    if (!v) return null;
    place(i, v);
  }
  return slots.map((v) => v!.lh);
}

export interface SynthCorpus {
  songs: SongEntry[];
  cases: SynthCase[];
}

let cached: SynthCorpus | null = null;

export function generateCorpus(seed: number = GENERATOR_SEED): SynthCorpus {
  if (cached && seed === GENERATOR_SEED) return cached;
  const rng = mulberry32(seed);
  const cat = catalog();
  if (cat.length < 8) throw new Error(`agreeing catalog too small: ${cat.length}`);
  const songs: SongEntry[] = [];
  const cases: SynthCase[] = [];
  let serial = 0;
  for (const level of LEVELS) {
    let kept = 0;
    let attempts = 0;
    const need = TEST_PER_LEVEL + TRAIN_PER_LEVEL;
    while (kept < need && attempts < need * 20) {
      attempts++;
      const target = cat[pickInt(rng, 0, cat.length - 1)]!;
      const distance = DISTANCES[pickInt(rng, 0, DISTANCES.length - 1)]!;
      const nMeasures = pickInt(rng, 40, 120);
      const maxN = nMeasures - 3;
      if (maxN < 1) continue;
      const after = pickInt(rng, 1, maxN);
      const measureN = after + distance;
      if (measureN > nMeasures) continue;
      const pageStart = after;
      const targetSlot = distance;
      const page = pageFor(rng, cat, level, target, targetSlot);
      if (!page) continue;
      page[targetSlot] = target.lh;
      const fillerV = filler(rng, cat, new Set([target.name]), target.pcs);
      if (!fillerV) continue;
      serial++;
      const title = `Synth ${level} Study ${letters(serial)}`;
      const id = kebab(title);
      if (!id.startsWith("synth-") || id !== kebab(title)) {
        throw new Error(`kebab-parity failed for title ${JSON.stringify(title)}`);
      }
      const song = makeSong({
        id,
        title,
        nMeasures,
        pageStart,
        pageLh: page,
        fillerLh: fillerV.lh,
      });
      const hit = rederiveOnSong(song, target.name, after);
      if (!hit || hit.measure !== measureN || hit.chord !== target.name) continue;
      const split: "train" | "test" = kept < TEST_PER_LEVEL ? "test" : "train";
      songs.push(song);
      cases.push({
        song_id: id,
        title,
        chord: target.name,
        measure: measureN,
        midi: target.midi,
        after,
        distance,
        level,
        split,
      });
      kept++;
    }
    if (kept < need) throw new Error(`${level}: only constructed ${kept}/${need}`);
  }
  const corpus = { songs, cases };
  if (seed === GENERATOR_SEED) cached = corpus;
  return corpus;
}

export function rederiveOnSong(
  song: SongEntry,
  chord: string,
  after: number,
): { measure: number; chord: string; midi: number[] } | null {
  for (const m of song.measures) {
    if (m.number < after) continue;
    const midi = leftHandToMidi(m.leftHand);
    if (midi.length < 2) continue;
    const inferred = inferChord(m.leftHand);
    const detected = detectChord(midi);
    if (inferred && detected && inferred === detected && inferred === chord) {
      return { measure: m.number, chord: inferred, midi };
    }
  }
  return null;
}

export function rederivePlant(c: SynthCase, song: SongEntry): { measure: number; chord: string; midi: number[] } {
  const hit = rederiveOnSong(song, c.chord, c.after);
  if (!hit) throw new Error(`${c.song_id}: constructed chord ${c.chord} after ${c.after} is no longer measurable`);
  return hit;
}

export function buildRecord(c: SynthCase): SynthRecord {
  return {
    schema_version: SYNTH_SCHEMA_VERSION,
    id: `synth:${c.level}:${c.song_id}:from${c.after}:m${c.measure}`,
    split: c.split,
    song_id: c.song_id,
    kind: "synth",
    family: c.level,
    thresholds: { ...SYNTH_THRESHOLDS },
    observation: {
      gold: {
        verdict: String(c.measure),
        chord: c.chord,
        measure: c.measure,
        after: c.after,
        distance: c.distance,
        level: c.level,
      },
    },
    user: userPrompt(c),
  };
}

export function songs(): SongEntry[] {
  return generateCorpus().songs;
}

export function plants(): SynthCase[] {
  return generateCorpus().cases;
}
