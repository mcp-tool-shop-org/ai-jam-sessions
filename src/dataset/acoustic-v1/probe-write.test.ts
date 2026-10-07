import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { F5Kept } from "./f5-acoustic.js";
import type { SongEntry } from "../../songs/types.js";

// 0.02 s is the cents-search carrier. Onset searches use other delays, so the
// mock can tell the two loops apart without rendering audio.
const CENTS_DELAY = 0.02;

const control = vi.hoisted(() => ({
  mode: "ok" as "ok" | "nulls" | "miss" | "collide",
  onsetNulls: 0,
  centsNulls: 0,
}));

vi.mock("./f5-acoustic.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./f5-acoustic.js")>();
  return {
    ...actual,
    keepFromApplied(_song: SongEntry, centsShift: number, delaySec: number): F5Kept | null {
      if (control.mode === "nulls" && delaySec === CENTS_DELAY && control.centsNulls > 0) {
        control.centsNulls -= 1;
        return null;
      }
      if (control.mode === "nulls" && delaySec !== CENTS_DELAY && control.onsetNulls > 0) {
        control.onsetNulls -= 1;
        return null;
      }
      const measuredOnset = control.mode === "miss" ? 9999 : delaySec === CENTS_DELAY ? 0 : delaySec * 1000 - 21;
      const measuredCents = control.mode === "miss" ? 9999 : delaySec === CENTS_DELAY ? centsShift : 0;
      const gold = actual.goldFromPredicates({
        f0_hz: 440,
        cents_from_target: measuredCents,
        onset_ms: measuredOnset,
      });
      const kind = gold === "timing_fail" ? "late_fail" : gold === "pitch_fail" ? "sharp_fail" : "clean";
      return {
        kind,
        notes: [{ midi: 60, name: "C4", time: 0, duration: 0.45 }],
        cents_shift: control.mode === "collide" ? 0 : centsShift,
        delay_sec: control.mode === "collide" ? 0 : delaySec,
        target_index: 0,
        wav_sha256: "abc123",
        sample_rate: 44100,
        pre_roll_sec: 0.3,
        gold,
        measured_f0_hz: 440,
        measured_cents: measuredCents,
        measured_onset_ms: measuredOnset,
      };
    },
  };
});

import { opaqueTakePath } from "./f5-acoustic.js";
import { buildProbeRecords, writeProbeCorpus } from "./generate-probe.js";
import { loadPublishableSongs } from "./library.js";

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function heldSongs(): SongEntry[] {
  const songs = loadPublishableSongs();
  const ids = songs.map((s) => s.id);
  const nTest = Math.max(1, Math.floor(ids.length / 3));
  const held = new Set(ids.slice(-nTest));
  return songs.filter((s) => held.has(s.id));
}

describe("probe corpus write", () => {
  it("writes 24 eval-only records for the three held-out songs", () => {
    control.mode = "ok";
    const held = heldSongs();
    expect(held.map((s) => s.id).sort()).toEqual(["solace", "the-easy-winners", "the-entertainer"]);
    const dir = mkdtempSync(join(tmpdir(), "ajs-v1-probe-"));
    try {
      const result = writeProbeCorpus(dir);
      expect(result).toEqual({ n: 24, outDir: dir });
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      expect(manifest).toEqual({
        dataset_name: "jam-actions-v1-probe",
        schema_version: "jam-actions-v1-probe/1.0.0",
        version: "1.0.0",
        record_count: 24,
        bands: ["onset_in", "onset_out", "cents_in", "cents_out"],
        onset_tol_ms: 8,
        cents_tol: 3,
      });
      const readme = readFileSync(join(dir, "README.md"), "utf8");
      expect(readme).toBe(`# jam-actions-v1-probe

Eval-only near-gate takes. Schema \`jam-actions-v1-probe/1.0.0\`.
Never split, never trained on, never merged into jam-actions-v1.

n=24. Nine held-out songs × four bands × both signs.
Gold from the two-sided predicates. Applied recipes in \`applied.json\`.
`);
      const splits = JSON.parse(readFileSync(join(dir, "splits.json"), "utf8")) as {
        strategy: string;
        train: string[];
        test: string[];
      };
      expect(splits.strategy).toBe("eval-only; nine held-out songs; never trained on");
      expect(splits.train).toEqual([]);
      expect(splits.test).toHaveLength(24);
      expect(splits.test).toContain("acoustic-probe:solace:onset_in:p");
      const applied = JSON.parse(readFileSync(join(dir, "applied.json"), "utf8")) as Array<{
        id: string;
        band: string;
        sign: number;
        gold: string;
      }>;
      expect(applied).toHaveLength(24);
      expect(applied.filter((row) => row.band === "onset_in").map((row) => row.sign).sort((a, b) => a - b)).toEqual([
        -1, -1, -1, 1, 1, 1,
      ]);
      const onsetIn = applied.find((row) => row.id === "acoustic-probe:solace:onset_in:p");
      expect(onsetIn?.gold).toBe("match");
      expect(applied.find((row) => row.id === "acoustic-probe:solace:onset_out:p")?.gold).toBe("timing_fail");
      expect(applied.find((row) => row.id === "acoustic-probe:solace:cents_out:p")?.gold).toBe("pitch_fail");
      const record = JSON.parse(
        readFileSync(join(dir, "records", "acoustic-probe_solace_onset_in_p.json"), "utf8"),
      ) as { id: string; schema_version: string; split: string; scope: { song_id: string }; observation: { gold: { answer: string } } };
      expect(record.id).toBe("acoustic-probe:solace:onset_in:p");
      expect(record.schema_version).toBe("jam-actions-v1-probe/1.0.0");
      expect(record.split).toBe("test");
      expect(record.scope.song_id).toBe("solace");
      expect(record.observation.gold.answer).toBe("match");
      const jsonl = readFileSync(join(dir, "records.jsonl"), "utf8");
      expect(jsonl.endsWith("\n")).toBe(true);
      expect(jsonl.trim().split("\n")).toHaveLength(24);
      const checksums = readFileSync(join(dir, "checksums.sha256"), "utf8");
      expect(checksums.split("\n").find((line) => line.endsWith("  README.md"))).toBe(
        `${sha256Text(readme)}  README.md`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips a null onset step and a null cents step, then still writes 24 records", () => {
    control.mode = "nulls";
    control.onsetNulls = 1;
    control.centsNulls = 1;
    const dir = mkdtempSync(join(tmpdir(), "ajs-v1-probe-null-"));
    try {
      expect(writeProbeCorpus(dir)).toEqual({ n: 24, outDir: dir });
      expect(control.onsetNulls).toBe(0);
      expect(control.centsNulls).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws the held-out song and band when every onset step misses the gate", () => {
    control.mode = "miss";
    const first = heldSongs()[0]!;
    expect(first.id).toBe("solace");
    expect(() => buildProbeRecords()).toThrow(`probe search failed solace onset_in sign=1`);
  });

  it("throws the opaque path when two bands of one song share a recipe", () => {
    control.mode = "collide";
    const song = heldSongs()[0]!;
    const path = opaqueTakePath(song.id, {
      kind: "clean",
      notes: [{ midi: 60, name: "C4", time: 0, duration: 0.45 }],
      cents_shift: 0,
      delay_sec: 0,
      target_index: 0,
      wav_sha256: "abc123",
      sample_rate: 44100,
      pre_roll_sec: 0.3,
      gold: "match",
      measured_f0_hz: 440,
      measured_cents: 0,
      measured_onset_ms: 0,
    });
    expect(() => buildProbeRecords()).toThrow(`probe path collision ${path}`);
  });
});
