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
/** v0 built every triad at octave 3. */
export const DEFAULT_OCTAVES = [3] as const;
/** v0 wrote the same right hand into all 120 measures of all 320 songs. */
export const DEFAULT_RIGHT_HAND = "C4:q";
const RIGHT_HANDS = ["C4:q", "D4:q", "E4:q", "F4:q", "G4:q", "A4:q", "B4:q"] as const;
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

/**
 * The voicing pool. One octave (the v0 default) makes every instance of a chord
 * name the same literal string, so "find the C major measure" degenerates into
 * a substring match. Several octaves give one chord name several spellings and
 * the policy has to identify the chord rather than match the text.
 *
 * Measured 2026-09-12: the three pitch classes the two engines spell
 * differently (D#, G#, A#) are the same at every octave from 1 to 5, so
 * AGREEING_PCS is octave-invariant and no per-octave filter is needed.
 */
export function catalog(octaves: readonly number[] = DEFAULT_OCTAVES): Voicing[] {
  const out: Voicing[] = [];
  for (const octave of octaves) {
    for (const pc of AGREEING_PCS) {
      for (const minor of [false, true]) {
        const v = voicingOf(triadMidi(pc, minor, octave));
        if (v) out.push(v);
      }
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

/** "Cm" -> "C". A triad's root, with the quality suffix removed. */
export function chordRoot(name: string): string {
  return name.replace(/m$/, "");
}

/**
 * D1's distractor: a DIFFERENT chord sharing 2 of 3 pitch classes.
 *
 * Measured 2026-09-12 at G=8 on 128 fresh cases: that description covers two
 * populations with very different difficulty, split 53/47 in every seed tried.
 *
 *   parallel (same root, third flipped: C vs Cm)   accuracy 0.862, 6 of 6 of the
 *                                                  run's all-wrong groups
 *   other   (relative and friends: A vs C#m)       accuracy 0.986, zero all-wrong
 *
 * Fisher p = 0.028 on the all-wrong split. The policy treats relative pairs as
 * nearly free and fails specifically on parallel major/minor. `parallelOnly`
 * isolates that axis instead of diluting it with the easy half.
 *
 * Draw count is unchanged either way — one pickInt over the filtered pool — so
 * the default stream, and the v0 population, do not move.
 */
function share2(
  rng: () => number,
  cat: Voicing[],
  target: Voicing,
  parallelOnly = false,
): Voicing | null {
  const pool = cat.filter(
    (v) =>
      v.name !== target.name &&
      shared(v.pcs, target.pcs) === 2 &&
      (!parallelOnly || chordRoot(v.name) === chordRoot(target.name)),
  );
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

function measure(n: number, lh: string, rh: string = DEFAULT_RIGHT_HAND): Measure {
  return { number: n, rightHand: rh, leftHand: lh };
}

export function makeSong(opts: {
  id: string;
  title: string;
  nMeasures: number;
  pageStart: number;
  pageLh: string[];
  fillerLh: string;
  /**
   * One occurrence of the target chord planted strictly BEFORE the prompt's
   * bound. It never moves gold, because gold is re-derived from `after`; it
   * only gives a wrong answer to a policy that ignores "at or after".
   */
  decoy?: { measure: number; lh: string };
  /** Right hand per measure. Omitted, every measure gets DEFAULT_RIGHT_HAND. */
  rightHandAt?: (measureNumber: number) => string;
}): SongEntry {
  if (opts.decoy) {
    const d = opts.decoy.measure;
    const offPage = d < opts.pageStart || d > opts.pageStart + 3;
    if (d < 1 || d > opts.nMeasures || !offPage) {
      throw new Error(
        `${opts.id}: decoy at measure ${d} must be inside the song and off the ` +
          `planted page [${opts.pageStart}, ${opts.pageStart + 3}]`,
      );
    }
  }
  const measures: Measure[] = [];
  for (let i = 1; i <= opts.nMeasures; i++) {
    const pageIdx = i - opts.pageStart;
    let lh = pageIdx >= 0 && pageIdx < 4 ? opts.pageLh[pageIdx]! : opts.fillerLh;
    if (opts.decoy && i === opts.decoy.measure) lh = opts.decoy.lh;
    measures.push(measure(i, lh, opts.rightHandAt?.(i)));
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
  parallelOnly = false,
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
    const d = share2(rng, cat, target, parallelOnly);
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

export interface CorpusOptions {
  /** Test cases (one song each) per level. Default TEST_PER_LEVEL. */
  testPerLevel?: number;
  /** Train cases (one song each) per level. Default TRAIN_PER_LEVEL. */
  trainPerLevel?: number;
  /**
   * Octaves the triad catalog is built at. Default DEFAULT_OCTAVES ([3]).
   * More octaves means one chord name has several spellings, so matching the
   * literal left-hand text stops being a winning policy.
   */
  octaves?: readonly number[];
  /**
   * Distances from the prompt's bound to the gold measure. Default DISTANCES
   * ([1,2,3]), which is inside one 4-measure window: the answer is always in
   * the first page and the task is a single lookup. A distance past 3 forces
   * the policy to page forward.
   */
  distances?: readonly number[];
  /**
   * Plant one occurrence of the target chord strictly before the bound.
   * Default false. With it off, every measure before the bound shares no pitch
   * class with the target, so a policy that ignores "at or after" and scans
   * from measure 1 gets the right answer anyway — the bound is inert and
   * instruction-following is never tested.
   */
  decoyBeforeBound?: boolean;
  /**
   * Vary the right hand measure to measure. Default false, which writes the
   * same DEFAULT_RIGHT_HAND into every measure and leaves the left hand as the
   * only field that ever changes.
   */
  varyRightHand?: boolean;
  /**
   * Restrict D1's share-2 distractor to the PARALLEL chord — same root, third
   * flipped. Default false, which draws from all share-2 chords and lands about
   * 53% parallel by accident. See share2's note for the measured difference.
   */
  parallelOnly?: boolean;
}

export function generateCorpus(
  seed: number = GENERATOR_SEED,
  opts: CorpusOptions = {},
): SynthCorpus {
  const testPerLevel = opts.testPerLevel ?? TEST_PER_LEVEL;
  const trainPerLevel = opts.trainPerLevel ?? TRAIN_PER_LEVEL;
  const octaves = opts.octaves ?? DEFAULT_OCTAVES;
  const distances = opts.distances ?? DISTANCES;
  const decoyBeforeBound = opts.decoyBeforeBound ?? false;
  const varyRightHand = opts.varyRightHand ?? false;
  const parallelOnly = opts.parallelOnly ?? false;
  if (!octaves.length) throw new Error("octaves must not be empty");
  if (!distances.length) throw new Error("distances must not be empty");
  for (const d of distances) {
    if (!Number.isInteger(d) || d < 0) {
      throw new Error(`distance must be a non-negative integer, got ${d}`);
    }
  }
  if (!Number.isInteger(testPerLevel) || testPerLevel < 1) {
    throw new Error(`testPerLevel must be a positive integer, got ${testPerLevel}`);
  }
  if (!Number.isInteger(trainPerLevel) || trainPerLevel < 0) {
    throw new Error(`trainPerLevel must be a non-negative integer, got ${trainPerLevel}`);
  }
  // Only the default shape is cached. A P1f-style corpus (fresh seed, wider
  // test split) must never be served from — or written into — that cache.
  // Every knob, not just the two sizing ones. A harder corpus served from — or
  // written into — the default cache would silently swap the population out
  // from under anything that asked for the v0 shape.
  const isDefault =
    seed === GENERATOR_SEED &&
    testPerLevel === TEST_PER_LEVEL &&
    trainPerLevel === TRAIN_PER_LEVEL &&
    octaves === DEFAULT_OCTAVES &&
    distances === DISTANCES &&
    !decoyBeforeBound &&
    !varyRightHand &&
    !parallelOnly;
  if (cached && isDefault) return cached;
  const rng = mulberry32(seed);
  const cat = catalog(octaves);
  if (cat.length < 8) throw new Error(`agreeing catalog too small: ${cat.length}`);
  const songs: SongEntry[] = [];
  const cases: SynthCase[] = [];
  let serial = 0;
  for (const level of LEVELS) {
    let kept = 0;
    let attempts = 0;
    const need = testPerLevel + trainPerLevel;
    while (kept < need && attempts < need * 20) {
      attempts++;
      const target = cat[pickInt(rng, 0, cat.length - 1)]!;
      const distance = distances[pickInt(rng, 0, distances.length - 1)]!;
      const nMeasures = pickInt(rng, 40, 120);
      const maxN = nMeasures - 3;
      if (maxN < 1) continue;
      const after = pickInt(rng, 1, maxN);
      const measureN = after + distance;
      if (measureN > nMeasures) continue;
      // The page holds gold at `targetSlot`. At distance 1-3 the slot IS the
      // distance, which pins the page to `after` and puts the answer in the
      // first window the policy fetches — the v0 shape, one tool call. Past the
      // window the slot is free and the page moves out to meet gold, so the
      // policy has to page forward to reach it.
      const targetSlot = distance <= 3 ? distance : pickInt(rng, 0, 3);
      const pageStart = measureN - targetSlot;
      if (pageStart < 1 || pageStart + 3 > nMeasures) continue;
      const page = pageFor(rng, cat, level, target, targetSlot, parallelOnly);
      if (!page) continue;
      page[targetSlot] = target.lh;
      const fillerV = filler(rng, cat, new Set([target.name]), target.pcs);
      if (!fillerV) continue;
      // A bound is only load-bearing when answering it wrong is possible.
      let decoy: { measure: number; lh: string } | undefined;
      if (decoyBeforeBound) {
        if (after < 2) continue;
        decoy = { measure: pickInt(rng, 1, after - 1), lh: target.lh };
      }
      // Drawn ONLY when the knob is on. An unconditional draw here consumed a
      // number from the shared stream and shifted every later decision, which
      // moved the v0 default population while all 13 tests stayed green.
      let rightHandAt: ((n: number) => string) | undefined;
      if (varyRightHand) {
        const rhOffset = pickInt(rng, 0, RIGHT_HANDS.length - 1);
        rightHandAt = (n: number) => RIGHT_HANDS[(n + rhOffset) % RIGHT_HANDS.length]!;
      }
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
        decoy,
        rightHandAt,
      });
      const hit = rederiveOnSong(song, target.name, after);
      if (!hit || hit.measure !== measureN || hit.chord !== target.name) continue;
      // Prove the trap is live rather than trusting that it is: the same search
      // run from measure 1 must land on the decoy, so a policy that drops the
      // bound is measurably wrong on this case. A decoy the engines decline to
      // re-derive would be a silently inert distractor.
      if (decoy) {
        const unbounded = rederiveOnSong(song, target.name, 1);
        if (!unbounded || unbounded.measure !== decoy.measure) continue;
      }
      const split: "train" | "test" = kept < testPerLevel ? "test" : "train";
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
        decoy: decoy?.measure,
      });
      kept++;
    }
    if (kept < need) throw new Error(`${level}: only constructed ${kept}/${need}`);
  }
  const corpus = { songs, cases };
  if (isDefault) cached = corpus;
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
