import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { validateSong } from "../../songs/registry.js";
import { leftHandToMidi } from "../acoustic-v1/builder.js";
import { assertGoldVaries, assertNoStraddle, assertSchemaOwner } from "../experiment/index.js";
import { MAX_LIST_WINDOW } from "../search-v0/window.js";
import {
  DEFAULT_OCTAVES,
  DEFAULT_RIGHT_HAND,
  DISTANCES,
  GENERATOR_SEED,
  LEVELS,
  TEST_PER_LEVEL,
  TRAIN_PER_LEVEL,
  agree,
  catalog,
  chordRoot,
  generateCorpus,
  kebab,
  lhOf,
  rederiveOnSong,
  rederivePlant,
  smokeSong,
} from "./generate.js";
import {
  SYNTH_SCHEMA_VERSION,
  plants,
  splitOf,
  synthTask,
  userPrompt,
} from "./task.js";

describe("synth-v0 voicings", () => {
  it("every catalog voicing re-derives identically from both engines", () => {
    const cat = catalog();
    expect(cat.length).toBeGreaterThanOrEqual(8);
    for (const v of cat) {
      expect(agree(v.lh)).toBe(v.name);
    }
  });
});

describe("synth-v0 generator", () => {
  it("is deterministic under the pinned seed", () => {
    const a = generateCorpus(GENERATOR_SEED);
    const b = generateCorpus(GENERATOR_SEED);
    expect(a.cases.map((c) => c.song_id)).toEqual(b.cases.map((c) => c.song_id));
  });

  it("gold re-derives, distance is 1–3, prompt does not name the measure or song id", () => {
    const { songs, cases } = generateCorpus();
    const byId = new Map(songs.map((s) => [s.id, s]));
    expect(cases.length).toBe((TEST_PER_LEVEL + TRAIN_PER_LEVEL) * 4);
    for (const c of cases) {
      const song = byId.get(c.song_id)!;
      const measured = rederivePlant(c, song);
      expect(measured.measure).toBe(c.measure);
      expect(measured.chord).toBe(c.chord);
      expect(c.distance).toBeGreaterThanOrEqual(1);
      expect(c.distance).toBeLessThanOrEqual(3);
      expect(c.after + c.distance).toBe(c.measure);
      const user = userPrompt(c);
      expect(user).toContain(c.title);
      expect(user).toContain(c.chord);
      expect(user).toContain(String(c.after));
      expect(user).not.toMatch(new RegExp(`\\b${c.measure}\\b`));
      expect(user).not.toContain(c.song_id);
      expect(kebab(c.title)).toBe(c.song_id);
      expect(c.song_id.startsWith("synth-")).toBe(true);
      expect(validateSong(song)).toEqual([]);
    }
  });

  it("does not let a song straddle the split and gold varies on both sides", () => {
    const cases = plants();
    assertNoStraddle(cases, (c) => synthTask.splitKey(c), splitOf);
    assertGoldVaries(cases, (c) => String(c.measure), splitOf, (c) => c.level);
    const testSongs = new Set(cases.filter((c) => c.split === "test").map((c) => c.song_id));
    expect(testSongs.size).toBeGreaterThanOrEqual(30);
  });

  it("does not claim a published schema_version", () => {
    expect(SYNTH_SCHEMA_VERSION).not.toBe("jam-actions-v1/1.0.0");
    expect(SYNTH_SCHEMA_VERSION).not.toBe("jam-actions-search-v0/1.2.0");
    expect(SYNTH_SCHEMA_VERSION).not.toBe("jam-actions-synth-v0/1.0.0");
    expect(() => assertSchemaOwner(synthTask)).not.toThrow();
  });

  it("smoke song validates", () => {
    expect(validateSong(smokeSong())).toEqual([]);
    expect(smokeSong().id.startsWith("synth-")).toBe(true);
  });
});

describe("kebab", () => {
  it("matches Bethena → bethena and a spaced synth title", () => {
    expect(kebab("Bethena")).toBe("bethena");
    expect(kebab("Synth D0 Study aac")).toBe("synth-d0-study-aac");
  });
});

describe("lhOf", () => {
  it("writes a parseable triad", () => {
    expect(lhOf([48, 52, 55])).toBe("C3+E3+G3:q");
  });
});

// P1f widens the test split from 32 to 64 songs per level on a fresh seed.
// The default shape, and the cache that serves it, must not move.
describe("corpus sizing options (P1f)", () => {
  it("widens the test split without touching the train split or the defaults", () => {
    const wide = generateCorpus(2026091102, { testPerLevel: 64 });
    const test = wide.cases.filter((c) => c.split === "test");
    const train = wide.cases.filter((c) => c.split === "train");
    expect(test.length).toBe(64 * 4);
    expect(train.length).toBe(TRAIN_PER_LEVEL * 4);
    expect(wide.songs.length).toBe(wide.cases.length);
    for (const level of LEVELS) {
      expect(test.filter((c) => c.level === level).length).toBe(64);
    }
    // One song per case, and every id still round-trips from its title.
    expect(new Set(wide.songs.map((s) => s.id)).size).toBe(wide.songs.length);
    for (const c of test) expect(kebab(c.title)).toBe(c.song_id);
  });

  it("does not serve, or poison, the default cache", () => {
    const wide = generateCorpus(2026091102, { testPerLevel: 64 });
    const base = generateCorpus();
    expect(base.cases.filter((c) => c.split === "test").length).toBe(TEST_PER_LEVEL * 4);
    expect(base.cases.length).not.toBe(wide.cases.length);
    expect(generateCorpus()).toBe(base);
    expect(generateCorpus(GENERATOR_SEED)).toBe(base);
  });

  it("a fresh seed produces different cases at the same shape", () => {
    const a = generateCorpus(2026091102, { testPerLevel: 8, trainPerLevel: 4 });
    const b = generateCorpus(2026091103, { testPerLevel: 8, trainPerLevel: 4 });
    expect(a.cases.length).toBe(b.cases.length);
    const key = (c: { chord: string; after: number; measure: number }) =>
      `${c.chord}:${c.after}:${c.measure}`;
    expect(a.cases.map(key)).not.toEqual(b.cases.map(key));
  });

  it("rejects a non-integer or empty test split", () => {
    expect(() => generateCorpus(1, { testPerLevel: 0 })).toThrow(/positive integer/);
    expect(() => generateCorpus(1, { testPerLevel: 2.5 })).toThrow(/positive integer/);
    expect(() => generateCorpus(1, { trainPerLevel: -1 })).toThrow(/non-negative integer/);
  });
});

// ─── The guard that was missing ──────────────────────────────────────────────
//
// The v0 population is the control every measurement in the arc was taken
// against. A generator change that shifts it invalidates that comparison — and
// it can shift without any test noticing: on 2026-09-12 an unconditional draw
// for the (disabled) right-hand knob consumed one number from the shared RNG
// stream, which moved every case in every level while all 13 tests stayed
// green. Determinism-within-a-process cannot catch that; only a pinned
// fingerprint can. Updating this constant is how a corpus change becomes
// deliberate instead of silent.
describe("synth-v0 default population is frozen", () => {
  const fingerprint = (c: ReturnType<typeof generateCorpus>) =>
    createHash("sha256")
      .update(
        JSON.stringify({
          cases: c.cases,
          songs: c.songs.map((s) => ({ id: s.id, measures: s.measures })),
        }),
      )
      .digest("hex");

  // Pinned 2026-09-12. The corpus behind this hash was compared case-by-case
  // and measure-by-measure against the pre-knob generator at HEAD and found
  // byte-identical; this constant is that same corpus under the hash formula
  // below.
  it("matches the pinned v0 fingerprint", () => {
    expect(fingerprint(generateCorpus())).toBe(
      "7ef41463da204edc151289ed17090240f0b27302a612dbfef818b57e5116602c",
    );
  });

  it("is unmoved by passing the defaults explicitly", () => {
    const explicit = generateCorpus(GENERATOR_SEED, {
      octaves: DEFAULT_OCTAVES,
      distances: DISTANCES,
      decoyBeforeBound: false,
      varyRightHand: false,
    });
    expect(fingerprint(explicit)).toBe(fingerprint(generateCorpus()));
  });
});

// ─── Difficulty knobs ────────────────────────────────────────────────────────
//
// Measured 2026-09-12: bf16 Qwen3-4B-Instruct-2507 — the exact artifact the
// trainer loads — answers the v0 corpus 8/8 with every group degenerate and
// every advantage exactly 0.0. These knobs exist to attack the four reasons it
// is that easy, and each test below pins the mechanism, not the difficulty.
describe("synth-v0 difficulty knobs", () => {
  const SHAPE = { testPerLevel: 4, trainPerLevel: 4 } as const;

  it("more octaves widen the catalog and every voicing still re-derives", () => {
    const wide = catalog([2, 3, 4]);
    expect(wide.length).toBe(catalog().length * 3);
    for (const v of wide) expect(agree(v.lh)).toBe(v.name);
    // One chord name, several spellings — so matching the literal left-hand
    // text is no longer a winning policy.
    const byName = new Map<string, Set<string>>();
    for (const v of wide) {
      if (!byName.has(v.name)) byName.set(v.name, new Set());
      byName.get(v.name)!.add(v.lh);
    }
    for (const spellings of byName.values()) expect(spellings.size).toBe(3);
  });

  it("plants a decoy before the bound that makes an unbounded search wrong", () => {
    const c = generateCorpus(4242, { ...SHAPE, decoyBeforeBound: true });
    const byId = new Map(c.songs.map((s) => [s.id, s]));
    expect(c.cases.length).toBeGreaterThan(0);
    for (const k of c.cases) {
      expect(k.decoy).toBeDefined();
      expect(k.decoy!).toBeLessThan(k.after);
      // Gold is still the first hit at or after the bound.
      expect(rederivePlant(k, byId.get(k.song_id)!).measure).toBe(k.measure);
      // And the same search without the bound lands somewhere else.
      const unbounded = rederiveOnSong(byId.get(k.song_id)!, k.chord, 1);
      expect(unbounded!.measure).toBe(k.decoy);
      expect(unbounded!.measure).not.toBe(k.measure);
    }
  });

  it("the v0 default leaves the bound inert — which is why the decoy exists", () => {
    const c = generateCorpus(4242, SHAPE);
    const byId = new Map(c.songs.map((s) => [s.id, s]));
    for (const k of c.cases) {
      expect(k.decoy).toBeUndefined();
      // Ignoring "at or after" costs nothing: the unbounded search agrees.
      expect(rederiveOnSong(byId.get(k.song_id)!, k.chord, 1)!.measure).toBe(k.measure);
    }
  });

  it("a distance past the window moves gold out of the first page", () => {
    const c = generateCorpus(99, { ...SHAPE, distances: [9, 11] });
    for (const k of c.cases) {
      expect(k.after + k.distance).toBe(k.measure);
      expect(k.distance).toBeGreaterThan(3);
      // At most 4 measures per list_measures call, so gold is unreachable in one.
      expect(k.measure - k.after).toBeGreaterThanOrEqual(MAX_LIST_WINDOW);
    }
    // The v0 default keeps gold inside the very first window.
    for (const k of generateCorpus(99, SHAPE).cases) {
      expect(k.measure - k.after).toBeLessThan(MAX_LIST_WINDOW);
    }
  });

  it("distance 0 is constructible, so the bound measure itself can be the answer", () => {
    const c = generateCorpus(7, { ...SHAPE, distances: [0] });
    const byId = new Map(c.songs.map((s) => [s.id, s]));
    for (const k of c.cases) {
      expect(k.measure).toBe(k.after);
      expect(rederivePlant(k, byId.get(k.song_id)!).measure).toBe(k.after);
    }
  });

  it("varies the right hand and gold still re-derives", () => {
    const plain = generateCorpus(31, SHAPE);
    const varied = generateCorpus(31, { ...SHAPE, varyRightHand: true });
    const rhOf = (c: typeof plain) =>
      new Set(c.songs.flatMap((s) => s.measures.map((m) => m.rightHand)));
    expect(rhOf(plain)).toEqual(new Set([DEFAULT_RIGHT_HAND]));
    expect(rhOf(varied).size).toBeGreaterThan(1);
    // The knob draws its own offset, so it advances the shared RNG stream and
    // the two corpora are different populations — that is the knob working, not
    // a leak. What must hold is that gold is still constructible, and that the
    // right hand never becomes the answer.
    const byId = new Map(varied.songs.map((s) => [s.id, s]));
    for (const k of varied.cases) {
      expect(rederivePlant(k, byId.get(k.song_id)!).measure).toBe(k.measure);
      expect(validateSong(byId.get(k.song_id)!)).toEqual([]);
    }
  });

  it("keeps the contract under every knob at once", () => {
    const hard = generateCorpus(2026091201, {
      testPerLevel: 4,
      trainPerLevel: 4,
      octaves: [2, 3, 4],
      distances: [0, 1, 3, 7, 11],
      decoyBeforeBound: true,
      varyRightHand: true,
    });
    const byId = new Map(hard.songs.map((s) => [s.id, s]));
    assertNoStraddle(hard.cases, (k) => k.song_id, splitOf);
    for (const k of hard.cases) {
      expect(rederivePlant(k, byId.get(k.song_id)!).measure).toBe(k.measure);
      expect(validateSong(byId.get(k.song_id)!)).toEqual([]);
      // The prompt still never names the answer or the song id.
      const user = userPrompt(k);
      expect(user).not.toMatch(new RegExp(`\b${k.measure}\b`));
      expect(user).not.toContain(k.song_id);
    }
  });

  it("refuses an empty or negative difficulty spec", () => {
    expect(() => generateCorpus(1, { ...SHAPE, octaves: [] })).toThrow(/octaves must not be empty/);
    expect(() => generateCorpus(1, { ...SHAPE, distances: [] })).toThrow(/distances must not be empty/);
    expect(() => generateCorpus(1, { ...SHAPE, distances: [-1] })).toThrow(/non-negative integer/);
  });

  it("a harder corpus never serves, or poisons, the default cache", () => {
    const base = generateCorpus();
    generateCorpus(GENERATOR_SEED, { decoyBeforeBound: true });
    generateCorpus(GENERATOR_SEED, { octaves: [2, 3, 4] });
    generateCorpus(GENERATOR_SEED, { varyRightHand: true });
    expect(generateCorpus()).toBe(base);
    for (const k of generateCorpus().cases) expect(k.decoy).toBeUndefined();
  });
});

// ─── parallelOnly ────────────────────────────────────────────────────────────
//
// Measured at G=8 on 128 fresh cases (2026-09-12): D1's "shares 2 of 3 pitch
// classes" covers two populations split 53/47 in every seed tried, and only one
// of them is hard — parallel (same root) accuracy 0.862 and ALL SIX of the run's
// all-wrong groups, against 0.986 and zero for the rest, Fisher p = 0.028.
describe("synth-v0 parallelOnly", () => {
  const SHAPE = { testPerLevel: 4, trainPerLevel: 8 } as const;
  const root = (n: string) => n.replace(/m$/, "");

  const d1Distractors = (c: ReturnType<typeof generateCorpus>) => {
    const byId = new Map(c.songs.map((s) => [s.id, s]));
    const out: Array<{ target: string; distractor: string }> = [];
    for (const k of c.cases.filter((x) => x.level === "D1")) {
      const song = byId.get(k.song_id)!;
      for (let n = k.after; n <= k.after + 3; n++) {
        if (n === k.measure) continue;
        const m = song.measures.find((x) => x.number === n);
        if (!m) continue;
        const name = agree(m.leftHand);
        if (!name) continue;
        const pcs = new Set(leftHandToMidi(m.leftHand).map((x) => ((x % 12) + 12) % 12));
        const tgt = new Set(k.midi.map((x) => ((x % 12) + 12) % 12));
        if ([...pcs].filter((x) => tgt.has(x)).length !== 2) continue;
        out.push({ target: k.chord, distractor: name });
      }
    }
    return out;
  };

  it("chordRoot strips the quality suffix", () => {
    expect(chordRoot("C")).toBe("C");
    expect(chordRoot("Cm")).toBe("C");
    expect(chordRoot("F#m")).toBe("F#");
  });

  it("restricts every D1 distractor to the target's parallel", () => {
    const c = generateCorpus(777, { ...SHAPE, parallelOnly: true });
    const ds = d1Distractors(c);
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) {
      expect(chordRoot(d.distractor)).toBe(chordRoot(d.target));
      // Same root, different quality — that IS the parallel, and it must still
      // be a different chord or it would be the target and move gold.
      expect(d.distractor).not.toBe(d.target);
    }
  });

  it("the default draws both kinds, which is why it dilutes the axis", () => {
    const ds = d1Distractors(generateCorpus(777, SHAPE));
    expect(ds.length).toBeGreaterThan(0);
    expect(ds.some((d) => root(d.distractor) !== root(d.target))).toBe(true);
  });

  it("does not move gold, and does not poison the default cache", () => {
    const c = generateCorpus(777, { ...SHAPE, parallelOnly: true });
    const byId = new Map(c.songs.map((s) => [s.id, s]));
    for (const k of c.cases) {
      expect(rederivePlant(k, byId.get(k.song_id)!).measure).toBe(k.measure);
      expect(validateSong(byId.get(k.song_id)!)).toEqual([]);
    }
    const base = generateCorpus();
    generateCorpus(GENERATOR_SEED, { parallelOnly: true });
    expect(generateCorpus()).toBe(base);
  });
});
