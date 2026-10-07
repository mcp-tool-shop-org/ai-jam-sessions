import { describe, expect, it, vi } from "vitest";
import type { F5Kept, F5Kind } from "./f5-acoustic.js";

const control = vi.hoisted(() => ({
  mode: "unique" as "unique" | "drop" | "collide",
}));

function noteMidi(songId: string, kind: string, draw: number): number {
  return 48 + ((songId.charCodeAt(0) + kind.length * 3 + draw) % 24);
}

function keptFor(songId: string, kind: F5Kind, draw: number, fixed: boolean): F5Kept {
  const midi = fixed ? 60 : noteMidi(songId, kind, draw);
  return {
    kind,
    notes: [{ midi, name: "C4", time: fixed ? 0 : draw * 0.1, duration: 0.45 }],
    cents_shift: fixed ? 0 : draw,
    delay_sec: fixed ? 0 : kind === "clean" ? 0.01 : kind === "sharp_fail" ? 0.02 : 0.03,
    target_index: 0,
    wav_sha256: "abc123",
    sample_rate: 44100,
    pre_roll_sec: 0.3,
    gold: "match",
    measured_f0_hz: 261.6,
    measured_cents: 1.2,
    measured_onset_ms: 3.4,
  };
}

vi.mock("./f5-acoustic.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./f5-acoustic.js")>();
  return {
    ...actual,
    tryBuildF5: (song: { id: string }, kind: F5Kind, draw = 0) => {
      if (control.mode === "drop" && song.id === "bach-prelude-c-major-bwv846" && kind === "clean" && draw === 0) {
        return null;
      }
      if (control.mode === "collide") return keptFor(song.id, kind, draw, true);
      return keptFor(song.id, kind, draw, false);
    },
  };
});

import { buildAllRecords } from "./builder.js";
import { opaqueTakePath } from "./f5-acoustic.js";
import { loadPublishableSongs } from "./library.js";

const BACH = "bach-prelude-c-major-bwv846";

function withoutDrawOverride<T>(fn: () => T): T {
  const prev = process.env.V1_F5_DRAWS;
  delete process.env.V1_F5_DRAWS;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.V1_F5_DRAWS;
    else process.env.V1_F5_DRAWS = prev;
  }
}

describe("builder shelf without rendering takes", () => {
  it("builds every publishable song and sorts the ids", () => {
    control.mode = "unique";
    const records = withoutDrawOverride(() => buildAllRecords());
    const songs = loadPublishableSongs();
    expect(songs.length).toBeGreaterThanOrEqual(11);
    expect(records.map((r) => r.id)).toEqual([...records.map((r) => r.id)].sort());
    expect(records.filter((r) => r.family === "acoustic")).toHaveLength(songs.length * 3 * 4);
    const chord = records.find((r) => r.id === `chord:${BACH}:m17`);
    expect(chord?.observation.gold.answer).toBe("Dm");
    expect(chord?.split).toBe("train");
    const drifted = records.find((r) => r.id === "ensemble:drifted:C");
    expect(drifted?.observation.gold.answer).toBe("voice");
    expect(drifted?.scope.phrase_window).toBe("C");
    expect(drifted?.split).toBe("train");
    const who = records.find((r) => r.id === "ensemble:who_first:G:synth");
    expect(who?.split).toBe("test");
    expect(who?.observation.gold.answer).toBe("synth");
    expect(records.find((r) => r.id === `acoustic:${BACH}:clean:0`)).toBeDefined();
    expect(records.find((r) => r.id === `acoustic:${BACH}:clean:3`)).toBeDefined();
    expect(records.find((r) => r.id === "measures:fur-elise")?.scope.song_id).toBe("fur-elise");
  });

  it("skips a dropped clean draw and still keeps the later draw", () => {
    control.mode = "drop";
    const records = withoutDrawOverride(() => buildAllRecords());
    const songs = loadPublishableSongs();
    expect(records.filter((r) => r.family === "acoustic")).toHaveLength(songs.length * 3 * 4 - 1);
    expect(records.find((r) => r.id === `acoustic:${BACH}:clean:0`)).toBeUndefined();
    expect(records.find((r) => r.id === `acoustic:${BACH}:clean:1`)?.family).toBe("acoustic");
  });

  it("throws the opaque path when two draws of one song share a recipe", () => {
    control.mode = "collide";
    const song = loadPublishableSongs()[0]!;
    const path = opaqueTakePath(song.id, keptFor(song.id, "clean", 0, true));
    expect(() => withoutDrawOverride(() => buildAllRecords())).toThrow(
      `opaque take path collision ${path}`,
    );
  });
});
