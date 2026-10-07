import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SongEntry } from "../../songs/types.js";
import {
  acousticTargetOf,
  agreeingChordMeasure,
  buildChordRecord,
  buildKeyMomentsRecord,
  firstMeasureSpan,
  rederiveGold,
} from "./builder.js";
import { loadPublishableSongs } from "./library.js";
import {
  acousticComparisonLine,
  f5DropStats,
  measureF5,
  parseAcousticAssistant,
  perturbationFor,
  phraseFromSong,
  rederiveF5Gold,
  rederiveF5Measurements,
  remeasureF5,
  resetF5DropStats,
  tryBuildF5,
  type F5PhraseNote,
} from "./f5-acoustic.js";
import { parseOutFlag } from "./generate-corpus.js";
import {
  prettyDescriptionFromCard,
  readCardOrHalt,
  readLicenseOrHalt,
  spec,
  writePublicSet,
} from "./generate-public.js";
import type { V1Record } from "./schema.js";

function sha256Text(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function songWith(
  id: string,
  rightHand: string,
  musicalLanguage?: Partial<SongEntry["musicalLanguage"]>,
): SongEntry {
  return {
    id,
    title: "Stub",
    genre: "classical",
    difficulty: "beginner",
    key: "C major",
    tempo: 96,
    timeSignature: "4/4",
    durationSeconds: 8,
    musicalLanguage: {
      description: "stub",
      structure: "A",
      keyMoments: ["measure 1"],
      teachingGoals: ["count"],
      styleTips: ["legato"],
      ...musicalLanguage,
    },
    measures: [{ number: 1, rightHand, leftHand: "C3 E3 G3" }],
    tags: [],
  };
}

const C4: F5PhraseNote = { midi: 60, name: "C4", time: 0, duration: 0.45 };

describe("v1 corpus flags", () => {
  it("returns undefined when --out is absent", () => {
    expect(parseOutFlag(["node", "generate-corpus.ts"])).toBeUndefined();
  });

  it("returns the directory that follows --out", () => {
    expect(parseOutFlag(["node", "generate-corpus.ts", "--out", "corpus-out"])).toBe("corpus-out");
  });

  it("rejects a missing --out path", () => {
    expect(() => parseOutFlag(["--out"])).toThrow("--out requires a directory path");
  });

  it("rejects an --out path that is another flag", () => {
    expect(() => parseOutFlag(["--out", "--bare-label"])).toThrow("--out requires a directory path");
  });

  it("rejects an empty --out path", () => {
    expect(() => parseOutFlag(["--out", ""])).toThrow("--out requires a directory path");
  });
});

describe("acoustic assistant parse", () => {
  it("parses a plain inside-gate comparison line", () => {
    const line = acousticComparisonLine(12.34, -3.04, "match");
    expect(line).toBe("cents 12.3 inside a 50-cent gate, onset -3.0 ms inside 40: match");
    const parsed = parseAcousticAssistant(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.cents).toBe(12.3);
    expect(parsed!.onset).toBe(-3);
    expect(parsed!.d).toBeNaN();
    expect(parsed!.e).toBeNaN();
    expect(parsed!.pitchWord).toBe("");
    expect(parsed!.onsetWord).toBe("");
    expect(parsed!.label).toBe("match");
  });

  it("parses a plain against-gate comparison line", () => {
    expect(acousticComparisonLine(60, 41, "pitch_fail")).toBe(
      "cents 60.0 against a 50-cent gate, onset 41.0 ms against a 40-ms gate: pitch_fail",
    );
    const parsed = parseAcousticAssistant(
      "cents 60.0 against a 50-cent gate, onset 41.0 ms against a 40-ms gate: pitch_fail",
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.cents).toBe(60);
    expect(parsed!.onset).toBe(41);
    expect(parsed!.label).toBe("pitch_fail");
  });

  it("returns null for a line that is neither arithmetic nor a comparison", () => {
    expect(parseAcousticAssistant("match")).toBeNull();
  });
});

describe("phrase and F5 drop paths", () => {
  it("skips rests and unparseable tokens, and stops at maxNotes", () => {
    const parsed = phraseFromSong(songWith("rests", "R x C4:q D4:q"), 8);
    expect(parsed.map((n) => n.midi)).toEqual([60, 62]);
    expect(parsed.map((n) => n.name)).toEqual(["C4", "D4"]);
    expect(parsed.map((n) => n.time)).toEqual([0, 1.2]);
    expect(parsed.map((n) => n.duration)).toEqual([0.45, 0.45]);
    expect(phraseFromSong(songWith("only-rest", "R r"), 8)).toEqual([]);
    const capped = phraseFromSong(songWith("cap", "C4:q D4:q E4:q"), 1);
    expect(capped.map((n) => n.midi)).toEqual([60]);
  });

  it("draws a negative sharp shift for an id that is not on the shelf", () => {
    expect(perturbationFor("not-on-shelf", "sharp_fail", 1)).toEqual({
      cents_shift: -74.73971008090302,
      delay_sec: 0.0007406229886692018,
    });
  });

  it("draws the bach clean take at the shelf rank", () => {
    expect(perturbationFor("bach-prelude-c-major-bwv846", "clean", 0)).toEqual({
      cents_shift: 18.87302325581395,
      delay_sec: 0.012209302325581395,
    });
  });

  it("returns null measurements when the shifted tone will not lock", () => {
    const measured = measureF5([C4], -4800, 0);
    expect(measured.measurements).toBeNull();
    expect(measured.target_index).toBe(0);
    expect(measured.cents_shift).toBe(-4800);
    expect(measured.delay_sec).toBe(0);
    expect(measured.samples.length).toBe(41895);
    expect(rederiveF5Measurements("clean", [C4], -4800, 0)).toEqual({
      gold: null,
      f0_hz: null,
      cents_from_target: null,
      onset_ms: null,
    });
    expect(rederiveF5Gold("late_fail", [C4], -4800, 0)).toBeNull();
    expect(remeasureF5({ notes: [C4], kind: "sharp_fail", cents_shift: -4800, delay_sec: 0 })).toEqual({
      gold: "match",
      untrackable: true,
    });
  });

  it("counts a phrase shorter than four notes as a short-phrase drop", () => {
    resetF5DropStats();
    expect(tryBuildF5(songWith("two-notes", "C4:q D4:q"), "late_fail", 0)).toBeNull();
    expect(f5DropStats).toEqual({
      attempted: 1,
      droppedUntrackable: 0,
      droppedClearance: 0,
      droppedShortPhrase: 1,
    });
  });

  it("counts an untrackable low note as an untrackable drop", () => {
    resetF5DropStats();
    expect(tryBuildF5(songWith("low-c1", "C1:q D4:q E4:q F4:q"), "sharp_fail", 0)).toBeNull();
    expect(f5DropStats).toEqual({
      attempted: 1,
      droppedUntrackable: 1,
      droppedClearance: 0,
      droppedShortPhrase: 0,
    });
  });

  it("counts an octave-jumped clean take as a clearance drop", () => {
    resetF5DropStats();
    expect(tryBuildF5(songWith("high-c7", "C7:q D4:q E4:q F4:q"), "clean", 0)).toBeNull();
    expect(f5DropStats).toEqual({
      attempted: 1,
      droppedUntrackable: 0,
      droppedClearance: 1,
      droppedShortPhrase: 0,
    });
  });
});

describe("builder edges", () => {
  it("selects bare over comparison, then comparison, then arithmetic", () => {
    expect(acousticTargetOf({})).toBe("arithmetic");
    expect(acousticTargetOf({ acousticPlainComparison: true })).toBe("comparison");
    expect(acousticTargetOf({ acousticBareLabel: true, acousticPlainComparison: true })).toBe("bare");
  });

  it("returns null when no left-hand measure agrees", () => {
    const song = songWith("no-chord", "C4:q D4:q E4:q F4:q");
    song.measures[0]!.leftHand = "R";
    expect(agreeingChordMeasure(song)).toBeNull();
    expect(buildChordRecord(song, "train")).toBeNull();
  });

  it("returns null when the first key moment is missing or has no measure span", () => {
    expect(buildKeyMomentsRecord(songWith("no-km", "C4:q", { keyMoments: [] }), "train")).toBeNull();
    expect(firstMeasureSpan("no measure number here")).toBeNull();
    expect(
      buildKeyMomentsRecord(songWith("prose-km", "C4:q", { keyMoments: ["no measure number here"] }), "test"),
    ).toBeNull();
  });

  it("names the catalog failure when list_songs query is not a string", () => {
    const song = loadPublishableSongs().find((s) => s.id === "bach-prelude-c-major-bwv846");
    expect(song).toBeDefined();
    const hit = agreeingChordMeasure(song!);
    expect(hit).toEqual({ measure: 17, chord: "Dm", midi: [50, 53, 57, 57, 50, 53, 57, 57] });
    const broken = { ...song!, title: 12 as unknown as string };
    expect(() => buildChordRecord(broken, "train")).toThrow(
      'chord:bach-prelude-c-major-bwv846:m17: /query: must be string {"type":"string"}',
    );
  });

  it("throws the family and song errors rederiveGold actually raises", () => {
    expect(() =>
      rederiveGold({
        observation: { gold: { family: "nope", answer: "x", engine: "y" } },
        scope: { song_id: "fur-elise" },
      } as V1Record),
    ).toThrow("unknown family nope");
    expect(() =>
      rederiveGold({
        observation: { gold: { family: "measures", answer: "1", engine: "e" } },
        scope: { song_id: "not-a-published-song" },
      } as V1Record),
    ).toThrow("missing song not-a-published-song");
    expect(() =>
      rederiveGold({
        observation: { gold: { family: "compare", answer: "same_key", engine: "e" } },
        scope: { song_id: "missing-a|missing-b" },
      } as V1Record),
    ).toThrow("missing compare pair missing-a|missing-b");
    expect(() =>
      rederiveGold({
        observation: { gold: { family: "chord", answer: "C", engine: "e" } },
        scope: { song_id: "fur-elise" },
      } as V1Record),
    ).toThrow("chord unconfirmable for fur-elise");
    expect(() =>
      rederiveGold({
        observation: { gold: { family: "key_moments", answer: "1", engine: "e" } },
        scope: { song_id: "the-entertainer" },
      } as V1Record),
    ).toThrow("no keyMoment span for the-entertainer");
  });
});

describe("public package write", () => {
  it("halts when the card has no pretty_description", () => {
    expect(() => prettyDescriptionFromCard("pretty_name: \"x\"\n", "docs/hf-cards/jam-actions-v1.md")).toThrow(
      "halt: docs/hf-cards/jam-actions-v1.md has no pretty_description field",
    );
  });

  it("halts when LICENSE-DATASET.md is absent", () => {
    const missing = join(mkdtempSync(join(tmpdir(), "ajs-v1-license-")), "LICENSE-DATASET.md");
    expect(() => readLicenseOrHalt(missing)).toThrow(
      `halt: LICENSE missing at ${missing}; generator does not compose LICENSE-DATASET.md`,
    );
  });

  it("writes the v1 public set and checksums VERSION", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajs-v1-public-"));
    try {
      const result = writePublicSet("v1", dir);
      expect(result.n).toBe(213);
      expect(result.outDir).toBe(dir);
      const version = readFileSync(join(dir, "VERSION"), "utf8");
      expect(version).toBe("1.1.0\n");
      const checksums = readFileSync(join(dir, "checksums.sha256"), "utf8");
      expect(checksums.endsWith("\n")).toBe(true);
      expect(checksums.trim().split("\n")).toHaveLength(result.checksums);
      expect(checksums.split("\n").find((line) => line.endsWith("  VERSION"))).toBe(
        `${sha256Text("1.1.0\n")}  VERSION`,
      );
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as {
        dataset_name: string;
        record_count: number;
        version: string;
      };
      expect(manifest.dataset_name).toBe("jam-actions-v1");
      expect(manifest.version).toBe("1.1.0");
      expect(manifest.record_count).toBe(213);
      expect(readFileSync(join(dir, "README.md"), "utf8")).toBe(readCardOrHalt(spec("v1").cardPath));
      const zenodo = JSON.parse(readFileSync(join(dir, "zenodo-metadata.json"), "utf8")) as {
        metadata: { version: string; upload_type: string };
      };
      expect(zenodo.metadata.version).toBe("1.1.0");
      expect(zenodo.metadata.upload_type).toBe("dataset");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
