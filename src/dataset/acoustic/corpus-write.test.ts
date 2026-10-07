import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DATASET_VERSION, generateAcousticCorpus, targetIndexSeeds } from "./generate-corpus.js";

vi.setConfig({ testTimeout: 60_000 });

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

describe("acoustic v0 corpus write", () => {
  it("writes the 72-record manifest and the VERSION checksum", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajs-acoustic-v0-"));
    try {
      const result = generateAcousticCorpus(dir);
      expect(result.outDir).toBe(dir);
      expect(result.seeds).toEqual(targetIndexSeeds());
      expect(result.seeds).toEqual([7, 12, 1, 4]);
      expect(result.records).toHaveLength(72);
      expect(DATASET_VERSION).toBe("1.1.0");
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      expect(manifest).toEqual({
        dataset_name: "jam-actions-acoustic-v0",
        schema_version: "jam-actions-acoustic-v0/1.0.0",
        version: "1.1.0",
        built_at: "reproducible",
        license: "CC-BY-SA-3.0-DE",
        record_count: 72,
        records_per_phrase: 36,
        phrase_count: 2,
        songs_included: ["bach-prelude-c-major-bwv846", "fur-elise"],
        splits: { train: 36, test: 36 },
        test_song: "fur-elise",
        reduction: "first 4 sequential right-hand onsets; not a musical edition",
        checksums_file: "checksums.sha256",
      });
      const version = readFileSync(join(dir, "VERSION"), "utf8");
      expect(version).toBe("1.1.0\n");
      const checksums = readFileSync(join(dir, "checksums.sha256"), "utf8");
      expect(checksums.endsWith("\n")).toBe(true);
      expect(checksums.split("\n").find((line) => line.endsWith("  VERSION"))).toBe(
        `${sha256Text("1.1.0\n")}  VERSION`,
      );
      const bach = JSON.parse(
        readFileSync(
          join(dir, "records", "bach-prelude-c-major-bwv846_mm.1RH4-notereduction_clean_s1.json"),
          "utf8",
        ),
      ) as { id: string; split: string; observation: { gold: { verdict: string } } };
      expect(bach.id).toBe("bach-prelude-c-major-bwv846:mm.1RH4-notereduction:clean:s1");
      expect(bach.split).toBe("train");
      expect(bach.observation.gold.verdict).toBe("match");
      const elise = JSON.parse(
        readFileSync(
          join(dir, "records", "fur-elise_mm.1-8RH4-notereduction_silence_s1.json"),
          "utf8",
        ),
      ) as { id: string; split: string; observation: { gold: { verdict: string } } };
      expect(elise.id).toBe("fur-elise:mm.1-8RH4-notereduction:silence:s1");
      expect(elise.split).toBe("test");
      expect(elise.observation.gold.verdict).toBe("nothing_to_grade");
      expect(readFileSync(join(dir, "LICENSE-DATASET.md"), "utf8").startsWith(
        "# Layered licensing for `jam-actions-acoustic-v0`\n",
      )).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
