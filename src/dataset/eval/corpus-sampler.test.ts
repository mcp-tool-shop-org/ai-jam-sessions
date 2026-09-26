// ─── Tests for corpus-sampler.ts (Slice 12) ───────────────────────────────────
//
// Validates the pure sampler library. No real network, no I/O.
// Uses synthetic record fixtures + the real public-package record list (loaded
// from disk in the corpus determinism test).

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evidenceRefusal, loadLibraryEvidence, type SourceRecord } from "../package-public.js";
import {
  buildSample,
  buildSampleManifest,
  classifyPosition,
  deterministicShuffle,
  parseStartMeasure,
  resolveAllPairs,
  SLICE_11_ENRICHED_RECORD_IDS,
  ANACRUSIS_RECORD_IDS,
  DEFAULT_CONFIG,
  type SamplerConfig,
  type SamplerRecord,
} from "./corpus-sampler.js";

// ─── Fixture helpers ───────────────────────────────────────────────────────────

function makePrompt(
  song: string,
  startBar: number,
  endBar: number,
  targetWindow: [number, number],
): SamplerRecord {
  return {
    id: `${song}:m${String(startBar).padStart(3, "0")}-${String(endBar).padStart(3, "0")}:piano:mcp-session:v1`,
    scope: {
      song_id: song,
      phrase_window: `measures ${startBar}-${endBar}`,
      window_role: "prompt",
      continuation_target_window: targetWindow,
    },
    has_target_trace: true,
  };
}

function makeTarget(
  song: string,
  startBar: number,
  endBar: number,
  pairedPromptId: string,
): SamplerRecord {
  return {
    id: `${song}:m${String(startBar).padStart(3, "0")}-${String(endBar).padStart(3, "0")}:piano:mcp-session:v1`,
    scope: {
      song_id: song,
      phrase_window: `measures ${startBar}-${endBar}`,
      window_role: "continuation_target",
      paired_prompt_record_id: pairedPromptId,
    },
    has_target_trace: true,
  };
}

/**
 * Synthetic mini-corpus of 16 records (8 pairs across 2 songs) that satisfies
 * all stratum buckets for unit-test purposes.
 */
function buildMiniCorpus(): SamplerRecord[] {
  const records: SamplerRecord[] = [];
  const songs = ["bach-prelude-c-major-bwv846", "pathetique-mvt2"];
  for (const song of songs) {
    // 4 prompt+target pairs each: m001 m005 m025 m029
    const startBars: Array<[number, number, number, number]> = [
      [1, 4, 5, 8],
      [5, 8, 9, 12],
      [25, 28, 29, 32],
      [29, 32, 33, 36],
    ];
    for (const [ps, pe, ts, te] of startBars) {
      const prompt = makePrompt(song, ps, pe, [ts, te]);
      records.push(prompt);
      records.push(makeTarget(song, ts, te, prompt.id));
    }
  }
  return records;
}

/**
 * Load the records of the source corpus that pass the library evidence gate,
 * so the sampler is exercised against real records.
 *
 * The frozen Slice 12 cohorts were drawn from the 115-record 0.4.x/0.5.x
 * public set. On 2026-09-25 the 58 records of the four uncleared works and the
 * 30 Debussy/Satie records built from pre-Mutopia files were removed from the
 * tree (docs/findings/derived-content-inventory.md), so that input cannot be
 * rebuilt. The corpus the sampler can meet today is the cleared one.
 */
function loadClearedCorpus(): SamplerRecord[] {
  const dir = join(process.cwd(), "datasets", "jam-actions-v0", "records");
  const evidence = loadLibraryEvidence(process.cwd());
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map(
      (f) =>
        JSON.parse(readFileSync(join(dir, f), "utf8")) as SourceRecord & {
          target_trace?: unknown;
          annotation_target?: { rhythm_onset?: string };
        },
    )
    .filter((j) => evidenceRefusal(j, evidence) === null)
    .map((j) => ({
      id: j.id,
      scope: j.scope as SamplerRecord["scope"],
      has_target_trace: j.target_trace !== undefined,
      rhythm_onset_not_computable: j.annotation_target?.rhythm_onset === "not_computable",
    }));
}

/** The three Slice 11 enriched records withdrawn with their works on 2026-09-25. */
const WITHDRAWN_ENRICHED = [
  "pathetique-mvt2:m025-028:piano:mcp-session:v1",
  "pathetique-mvt2:m029-032:piano:mcp-session:v1",
  "schumann-traumerei:m045-048:piano:mcp-session:v1",
];
const CLEARED_IDS = new Set(loadClearedCorpus().map((r) => r.id));
/** The Slice 11 enriched records the cleared corpus still holds. */
const CLEARED_REQUIRED = SLICE_11_ENRICHED_RECORD_IDS.filter((id) => CLEARED_IDS.has(id));
/** DEFAULT_CONFIG with the required set the cleared corpus can satisfy. */
const CLEARED_CONFIG: SamplerConfig = { ...DEFAULT_CONFIG, requiredRecordIds: CLEARED_REQUIRED };

// ─── 1. Determinism ────────────────────────────────────────────────────────────

describe("corpus-sampler — determinism", () => {
  it("produces byte-identical output across two calls with same inputs and seed", () => {
    const records = loadClearedCorpus();
    const plan1 = buildSample(records, CLEARED_CONFIG);
    const plan2 = buildSample(records, CLEARED_CONFIG);

    // generatedAt is a timestamp and will differ — strip it before comparison.
    const strip = (p: { generatedAt: string }): unknown => ({
      ...p,
      generatedAt: "<STRIPPED>",
    });
    expect(JSON.stringify(strip(plan1))).toBe(JSON.stringify(strip(plan2)));
  }, 30000);

  it("produces different output for different seeds (sanity check)", () => {
    const records = loadClearedCorpus();
    const planA = buildSample(records, { ...CLEARED_CONFIG, seed: "seed-A" });
    const planB = buildSample(records, { ...CLEARED_CONFIG, seed: "seed-B" });
    // The non-required portion of the E1 list should differ between seeds.
    const requiredCount = CLEARED_REQUIRED.length;
    const restA = planA.e1.recordIds.slice(requiredCount).join(",");
    const restB = planB.e1.recordIds.slice(requiredCount).join(",");
    expect(restA).not.toBe(restB);
  }, 30000);

  it("deterministicShuffle is stable for the same seed and key function", () => {
    const items = ["alpha", "beta", "gamma", "delta", "epsilon"];
    const shuffled1 = deterministicShuffle(items, "seed-X", (s) => s);
    const shuffled2 = deterministicShuffle(items, "seed-X", (s) => s);
    expect(shuffled1).toEqual(shuffled2);
    // Confirm it actually changes the order vs alphabetical.
    expect(shuffled1).not.toEqual([...items].sort());
  });
});

// ─── 2. Required inclusions ────────────────────────────────────────────────────

describe("corpus-sampler — required inclusions", () => {
  it("the cleared corpus lacks exactly the three withdrawn Slice 11 records, so the locked config refuses it", () => {
    const missing = SLICE_11_ENRICHED_RECORD_IDS.filter((id) => !CLEARED_IDS.has(id));
    expect(missing).toEqual(WITHDRAWN_ENRICHED);
    expect(CLEARED_REQUIRED).toHaveLength(3);
    // DEFAULT_CONFIG stays the historical lock; it fails closed on today's corpus.
    expect(() => buildSample(loadClearedCorpus(), DEFAULT_CONFIG)).toThrow(
      /required record 'pathetique-mvt2:m025-028/,
    );
  });

  it("includes ALL Slice 11 enriched records the cleared corpus holds in E3 sample", () => {
    const records = loadClearedCorpus();
    const plan = buildSample(records, CLEARED_CONFIG);
    for (const eid of CLEARED_REQUIRED) {
      expect(plan.e3.recordIds).toContain(eid);
    }
    expect(plan.e3.enrichedIncluded.length).toBe(CLEARED_REQUIRED.length);
  });

  it("includes ALL Slice 11 enriched records the cleared corpus holds in E1 sample (each has target_trace)", () => {
    const records = loadClearedCorpus();
    const plan = buildSample(records, CLEARED_CONFIG);
    for (const eid of CLEARED_REQUIRED) {
      expect(plan.e1.recordIds).toContain(eid);
    }
    expect(plan.e1.enrichedIncluded.length).toBe(CLEARED_REQUIRED.length);
  });

  it("includes ALL enriched-record pairs of the cleared corpus in E2 sample", () => {
    const records = loadClearedCorpus();
    const plan = buildSample(records, CLEARED_CONFIG);
    // Expected pairs (prompt IDs):
    //  - bach m041-044 -> m045-048 (target enriched)
    //  - bach m049-052 -> m053-056 (both enriched)
    // The other two historical pairs (pathetique m025-028, schumann m041-044)
    // were withdrawn with their works.
    const expectedPromptIds = [
      "bach-prelude-c-major-bwv846:m041-044:piano:mcp-session:v1",
      "bach-prelude-c-major-bwv846:m049-052:piano:mcp-session:v1",
    ];
    const sampledPromptIds = plan.e2.pairs.map((p) => p.promptId);
    for (const pid of expectedPromptIds) {
      expect(sampledPromptIds).toContain(pid);
    }
    expect(plan.e2.enrichedPairsIncluded.length).toBe(2);
  });

  it("throws when a required record is missing from the input pool", () => {
    const records = loadClearedCorpus().filter(
      (r) => r.id !== "bach-prelude-c-major-bwv846:m045-048:piano:mcp-session:v1",
    );
    expect(() => buildSample(records, CLEARED_CONFIG)).toThrow(
      /required record.*bach-prelude-c-major-bwv846:m045-048/,
    );
  });
});

// ─── 3. Stratification ─────────────────────────────────────────────────────────

describe("corpus-sampler — stratification", () => {
  it("E1 sample contains at least 2 opening, 2 middle, 1 cadential record", () => {
    const records = loadClearedCorpus();
    const plan = buildSample(records, CLEARED_CONFIG);
    expect(plan.e1.buckets.opening.length).toBeGreaterThanOrEqual(2);
    expect(plan.e1.buckets.middle.length).toBeGreaterThanOrEqual(2);
    expect(plan.e1.buckets.cadential.length).toBeGreaterThanOrEqual(1);
  });

  it("E3 sample contains at least one Bach texture-repetition record; the cleared corpus has no anacrusis case and says so", () => {
    const records = loadClearedCorpus();
    const plan = buildSample(records, CLEARED_CONFIG);
    expect(plan.e3.buckets.bachTextureRepetition.length).toBeGreaterThanOrEqual(1);
    // The only anacrusis case (schumann m045-048) was withdrawn with its work,
    // and no cleared record has a not-computable rhythm onset: the bucket is
    // empty and the plan reports it, per the sampler's abort policy.
    expect(records.some((r) => ANACRUSIS_RECORD_IDS.includes(r.id) || r.rhythm_onset_not_computable)).toBe(false);
    expect(plan.e3.buckets.anacrusis).toEqual([]);
    expect(plan.diagnostics).toContain(
      "[e3] stratum 'anacrusis' under-filled: needed 1 more, only 0 candidates available.",
    );
  });

  it("E3 sample includes an anacrusis record whenever the corpus has one", () => {
    const records = buildMiniCorpus();
    // m009-012 occurs once in the mini corpus (m005/m029 ids repeat as a
    // target and the next prompt), so the flag lands on the record the
    // sampler reads.
    const pickup = records.find((r) => r.id.includes(":m009-012") && r.scope.song_id === "bach-prelude-c-major-bwv846");
    if (!pickup) throw new Error("fixture lookup failed");
    expect(records.filter((r) => r.id === pickup.id)).toHaveLength(1);
    pickup.rhythm_onset_not_computable = true;
    const plan = buildSample(records, {
      seed: "test-seed",
      e1Size: 4,
      e2PairSize: 2,
      e3Size: 4,
      requiredRecordIds: [],
    });
    expect(plan.e3.buckets.anacrusis).toContain(pickup.id);
    expect(plan.e3.recordIds).toContain(pickup.id);
  });

  it("classifyPosition correctly tags opening, middle, cadential", () => {
    const records = buildMiniCorpus();
    // Build a last-start map manually for the mini-corpus.
    const lastMap = new Map<string, number>();
    for (const r of records) {
      const s = parseStartMeasure(r.scope.phrase_window);
      if (s !== null) {
        const cur = lastMap.get(r.scope.song_id) ?? 0;
        if (s > cur) lastMap.set(r.scope.song_id, s);
      }
    }
    const opening = records.find((r) => r.id.includes(":m001-"));
    const cadential = records.find((r) => r.id.includes(":m033-"));
    const middle = records.find((r) => r.id.includes(":m009-"));
    if (!opening || !cadential || !middle) throw new Error("fixture lookup failed");
    expect(classifyPosition(opening, lastMap)).toBe("opening");
    expect(classifyPosition(cadential, lastMap)).toBe("cadential");
    expect(classifyPosition(middle, lastMap)).toBe("middle");
  });
});

// ─── 4. Sample sizes ───────────────────────────────────────────────────────────

describe("corpus-sampler — sizes", () => {
  it("E1 sample contains exactly 24 records by default", () => {
    const records = loadClearedCorpus();
    const plan = buildSample(records, CLEARED_CONFIG);
    expect(plan.e1.recordIds.length).toBe(24);
  });

  it("E2 sample contains exactly 12 pairs by default", () => {
    const records = loadClearedCorpus();
    const plan = buildSample(records, CLEARED_CONFIG);
    expect(plan.e2.pairs.length).toBe(12);
  });

  it("E3 sample contains exactly 24 records by default", () => {
    const records = loadClearedCorpus();
    const plan = buildSample(records, CLEARED_CONFIG);
    expect(plan.e3.recordIds.length).toBe(24);
  });

  it("E1 sample has no duplicate record IDs", () => {
    const records = loadClearedCorpus();
    const plan = buildSample(records, CLEARED_CONFIG);
    const set = new Set(plan.e1.recordIds);
    expect(set.size).toBe(plan.e1.recordIds.length);
  });
});

// ─── 5. Edge cases ─────────────────────────────────────────────────────────────

describe("corpus-sampler — edge cases", () => {
  it("handles a candidate pool smaller than target size by reporting diagnostic, not throwing", () => {
    const required: string[] = [];
    const tinyCorpus = buildMiniCorpus(); // 16 records
    const config: SamplerConfig = {
      seed: "test-seed",
      e1Size: 100,
      e2PairSize: 2,
      e3Size: 100,
      requiredRecordIds: required,
    };
    const plan = buildSample(tinyCorpus, config);
    expect(plan.e1.recordIds.length).toBeLessThanOrEqual(16);
    expect(plan.diagnostics.some((d) => d.includes("not reached"))).toBe(true);
  });

  it("resolveAllPairs correctly identifies enriched pairs", () => {
    const records = loadClearedCorpus();
    const pairs = resolveAllPairs(records);
    const enriched = pairs.filter((p) => p.containsEnriched);
    expect(enriched.length).toBe(2);
    // Bach m049-052 -> m053-056: BOTH halves enriched (the pathetique
    // m025-028 pair that also had both halves enriched was withdrawn)
    const bothHalves = enriched.find((p) =>
      p.promptId.startsWith("bach-prelude-c-major-bwv846:m049"),
    );
    expect(bothHalves?.enrichedHalves.length).toBe(2);
    // Bach m041-044 -> m045-048: only target is enriched
    const bachFirst = enriched.find((p) =>
      p.promptId.startsWith("bach-prelude-c-major-bwv846:m041"),
    );
    expect(bachFirst?.enrichedHalves.length).toBe(1);
  });

  it("buildSampleManifest produces a fully-populated serializable manifest", () => {
    const records = loadClearedCorpus();
    const plan = buildSample(records, CLEARED_CONFIG);
    const manifest = buildSampleManifest(plan, CLEARED_CONFIG);
    expect(manifest.schema_version).toBe("corpus-scale-sample/1.0.0");
    expect(manifest.seed).toBe("slice12-2026-05-17");
    expect(manifest.e1.record_ids.length).toBe(24);
    expect(manifest.e2.pairs.length).toBe(12);
    expect(manifest.e3.record_ids.length).toBe(24);
    expect(manifest.config.required_records).toEqual([...CLEARED_REQUIRED]);
    // Round-trip JSON serialization sanity
    const json = JSON.stringify(manifest);
    const parsed = JSON.parse(json) as { schema_version: string };
    expect(parsed.schema_version).toBe("corpus-scale-sample/1.0.0");
  });
});
