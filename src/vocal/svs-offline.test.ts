import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderOfflineSvs } from "./svs-offline.js";
import { generateFullSong } from "./song-generate.js";
import type { BuiltVocalScore } from "./score-locked.js";

const dsp = vi.hoisted(() => ({
  calls: [] as Array<{ preset: string | undefined }>,
}));

vi.mock("./score-singer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./score-singer.js")>();
  return {
    ...actual,
    renderScoreLockedPcm: async (_score: unknown, options: { preset?: string } = {}) => {
      dsp.calls.push({ preset: options.preset });
      return {
        pcm: new Float32Array([0.5, -0.5, 1.5, -1.5, 0]),
        sampleRate: 8000,
      };
    },
  };
});

const emptyScore: BuiltVocalScore = {
  bpm: 60,
  notes: [{ id: "n0", startSec: 0, durationSec: 0.5, midi: 60 }],
  lyrics: { text: "la", language: "en-US" },
  phonemes: [{ tSec: 0, durSec: 0.5, phoneme: "AH", kind: "vowel", timbreHint: "AH" }],
  warnings: [],
  startMeasure: 1,
  endMeasure: 1,
};

describe("renderOfflineSvs diffsinger backend", () => {
  it("refuses when DIFFSINGER_ROOT is unset", async () => {
    const prev = process.env.DIFFSINGER_ROOT;
    delete process.env.DIFFSINGER_ROOT;
    await expect(
      renderOfflineSvs(emptyScore, { backend: "diffsinger", outPath: "out.wav" }),
    ).rejects.toThrow(/DIFFSINGER_ROOT/);
    if (prev !== undefined) process.env.DIFFSINGER_ROOT = prev;
  });

  it("refuses a pinned DIFFSINGER_ROOT because the jam pin is not wired", async () => {
    const prev = process.env.DIFFSINGER_ROOT;
    process.env.DIFFSINGER_ROOT = join(tmpdir(), "diffsinger-pin");
    try {
      let caught: unknown;
      try {
        await renderOfflineSvs(emptyScore, { backend: "diffsinger", outPath: "out.wav" });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(
        "DiffSinger checkout found at DIFFSINGER_ROOT but the jam-sessions pin is not wired yet. Use --svs-backend dsp, or see vocology-knowledge wave 1 finding 24.",
      );
    } finally {
      if (prev === undefined) delete process.env.DIFFSINGER_ROOT;
      else process.env.DIFFSINGER_ROOT = prev;
    }
  });
});

describe("renderOfflineSvs dsp backend", () => {
  it("writes a 16-bit mono WAV and returns the pcm duration", async () => {
    dsp.calls = [];
    const dir = mkdtempSync(join(tmpdir(), "svs-dsp-"));
    const outPath = join(dir, "lead.wav");
    const result = await renderOfflineSvs(emptyScore, { outPath, preset: "bright-lab" });
    expect(result).toEqual({
      backend: "dsp",
      outPath,
      sampleRate: 8000,
      durationSec: 5 / 8000,
    });
    expect(dsp.calls).toEqual([{ preset: "bright-lab" }]);
    const buf = readFileSync(outPath);
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
    expect(buf.readUInt16LE(22)).toBe(1);
    expect(buf.readUInt32LE(24)).toBe(8000);
    expect(buf.readUInt16LE(34)).toBe(16);
    expect(buf.readUInt32LE(40)).toBe(10);
    expect([
      buf.readInt16LE(44),
      buf.readInt16LE(46),
      buf.readInt16LE(48),
      buf.readInt16LE(50),
      buf.readInt16LE(52),
    ]).toEqual([16383, -16384, 32767, -32768, 0]);
  });

  it("defaults the backend to dsp and forwards an omitted preset", async () => {
    dsp.calls = [];
    const dir = mkdtempSync(join(tmpdir(), "svs-dsp-"));
    const outPath = join(dir, "lead.wav");
    const result = await renderOfflineSvs(emptyScore, { outPath });
    expect(result.backend).toBe("dsp");
    expect(result.sampleRate).toBe(8000);
    expect(result.durationSec).toBe(5 / 8000);
    expect(dsp.calls).toEqual([{ preset: undefined }]);
  });
});

describe("generateFullSong", () => {
  it("refuses ACE-Step as a play engine and names the MIDI-lock gap", () => {
    const prev = process.env.ACE_STEP_CMD;
    delete process.env.ACE_STEP_CMD;
    const r = generateFullSong({ lyrics: "la la", generator: "ace-step" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cannot honor a library MIDI/i);
    expect(r.hint).toMatch(/ACE_STEP_CMD/);
    if (prev !== undefined) process.env.ACE_STEP_CMD = prev;
  });
});
