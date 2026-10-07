import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SongEntry } from "../../songs/types.js";
import type { V1Record } from "./schema.js";

const state = vi.hoisted(() => ({
  records: [] as V1Record[],
}));

vi.mock("./builder.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./builder.js")>();
  return {
    ...actual,
    buildAllRecords: () => state.records,
  };
});

vi.mock("./library.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./library.js")>();
  return {
    ...actual,
    loadPublishableSongs: () =>
      [
        { id: "fur-elise", genre: "classical" },
        { id: "the-entertainer", genre: "ragtime" },
      ] as SongEntry[],
  };
});

import { resetF5DropStats } from "./f5-acoustic.js";
import { writeV1Corpus } from "./generate-corpus.js";

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function rec(
  id: string,
  songId: string,
  family: "measures" | "ensemble",
  split: "train" | "test",
  tool: string,
): V1Record {
  return {
    id,
    family,
    split,
    scope: { song_id: songId, key: "C major", phrase_window: "C" },
    provenance: { verdict_reason: "Allowlisted classical" },
    target_trace: {
      session: [{ role: "assistant", tool_calls: [{ tool, arguments: { songId } }] }],
    },
  } as V1Record;
}

const PROVENANCE = `# Provenance

This tree is the **publishable** subset: songs whose library provenance
block has licence CC-BY-SA-3.0-DE or Public-Domain, a non-contradicting
title verdict, and an id not in the v1 holdouts (clair-de-lune, satie,
debussy-arabesque). Genre is not a criterion. See
\`docs/findings/library-provenance-audit.md\`. Gold is re-derived from
library engines. No hand-written labels. \`verifier\` is the evidence
string from the library block, never a program.
`;

describe("writeV1Corpus file output", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("reports the shape floor and writes the manifest when one shape is the majority", () => {
    resetF5DropStats();
    state.records = [
      rec("ensemble:drifted:C", "fur-elise", "ensemble", "train", "count_measures"),
      rec("measures:the-entertainer", "the-entertainer", "measures", "test", "count_measures"),
    ];
    const dir = mkdtempSync(join(tmpdir(), "ajs-v1-corpus-"));
    dirs.push(dir);
    const chunks: string[] = [];
    const orig = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    }) as typeof process.stdout.write;
    try {
      const result = writeV1Corpus(dir);
      expect(result).toEqual({ n: 2, outDir: resolve(dir) });
      expect(chunks.join("")).toBe(
        "coverage floors reported, not asserted: majority shape count_measures at 100.0% (floors_met: false)\n",
      );
    } finally {
      process.stdout.write = orig;
    }

    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    expect(manifest).toEqual({
      dataset_name: "jam-actions-v1",
      schema_version: "jam-actions-v1/1.0.0",
      version: "1.1.0",
      record_count: 2,
      coverage: { tools: 1, songs: 2, genres: 2, shapes: 1 },
    });
    const coverage = JSON.parse(readFileSync(join(dir, "coverage.json"), "utf8")) as {
      floors_met: boolean;
      majority_shape: string;
      majority_shape_share: number;
      f5_drops: { attempted: number; droppedUntrackable: number; droppedClearance: number; droppedShortPhrase: number };
    };
    expect(coverage.floors_met).toBe(false);
    expect(coverage.majority_shape).toBe("count_measures");
    expect(coverage.majority_shape_share).toBe(1);
    expect(coverage.f5_drops).toEqual({
      attempted: 0,
      droppedUntrackable: 0,
      droppedClearance: 0,
      droppedShortPhrase: 0,
    });
    const splits = JSON.parse(readFileSync(join(dir, "splits.json"), "utf8"));
    expect(splits).toEqual({
      strategy: "hold out by song_id",
      train: ["ensemble:drifted:C"],
      test: ["measures:the-entertainer"],
    });
    expect(readFileSync(join(dir, "PROVENANCE-NOTE.md"), "utf8")).toBe(PROVENANCE);
    const checksums = readFileSync(join(dir, "checksums.sha256"), "utf8");
    expect(checksums.split("\n").find((line) => line.endsWith("  PROVENANCE-NOTE.md"))).toBe(
      `${sha256Text(PROVENANCE)}  PROVENANCE-NOTE.md`,
    );
    const record = JSON.parse(readFileSync(join(dir, "records", "ensemble_drifted_C.json"), "utf8")) as {
      id: string;
    };
    expect(record.id).toBe("ensemble:drifted:C");
    const jsonl = readFileSync(join(dir, "records.jsonl"), "utf8");
    expect(jsonl).toBe(
      `${JSON.stringify(state.records[0])}\n${JSON.stringify(state.records[1])}\n`,
    );
    expect(readFileSync(join(dir, "README.md"), "utf8")).toBe(`# jam-actions-v1 (working tree)

Schema \`jam-actions-v1/1.0.0\`. Public card is written elsewhere.

## Size

n=2. Split by song, not by record. Test n=1, so one
record is 100.00 percentage points
(v0 test n=36 was 2.8 pp, and the whole LoRA gain sat inside one record).
Phrases/songs buy that power. F5 draws per (song, class): 4.

Coverage is in \`coverage.json\` (tools, songs, genres, shapes) and is a
build artifact, not a claim in this file.
`);
  });

  it("throws the floor list when the majority shape is half the corpus or less", () => {
    state.records = [
      rec("measures:fur-elise", "fur-elise", "measures", "train", "count_measures"),
      rec("measures:the-entertainer", "the-entertainer", "measures", "test", "verify_harmony"),
    ];
    const dir = mkdtempSync(join(tmpdir(), "ajs-v1-floors-"));
    dirs.push(dir);
    expect(() => writeV1Corpus(dir)).toThrow(
      "coverage floors not met: tools 2 (need > 9); songs 2 (need > 10); shapes 2 (need > 7)",
    );
    expect(existsSync(join(dir, "manifest.json"))).toBe(false);
  });
});
