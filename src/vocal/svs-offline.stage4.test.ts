import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuiltVocalScore } from "./score-locked.js";

vi.mock("./score-singer.js", () => ({
  renderScoreLockedPcm: vi.fn(async () => ({
    pcm: Float32Array.from([1, -1, 0, 2]),
    sampleRate: 8000,
  })),
}));

import { renderOfflineSvs } from "./svs-offline.js";

const SCORE = { notes: [] } as unknown as BuiltVocalScore;

describe("renderOfflineSvs", () => {
  const previous = process.env.DIFFSINGER_ROOT;

  afterEach(() => {
    if (previous === undefined) delete process.env.DIFFSINGER_ROOT;
    else process.env.DIFFSINGER_ROOT = previous;
  });

  it("refuses DiffSinger when DIFFSINGER_ROOT is unset", async () => {
    delete process.env.DIFFSINGER_ROOT;
    await expect(
      renderOfflineSvs(SCORE, { backend: "diffsinger", outPath: "unused.wav" }),
    ).rejects.toThrow(
      "DiffSinger backend is not installed. Set DIFFSINGER_ROOT to a local OpenVPI/DiffSinger checkout with commercial-safe weights (MIT/Apache), or use --svs-backend dsp.",
    );
  });

  it("refuses DiffSinger even when a checkout path is set", async () => {
    process.env.DIFFSINGER_ROOT = "D:/models/diffsinger";
    await expect(
      renderOfflineSvs(SCORE, { backend: "diffsinger", outPath: "unused.wav" }),
    ).rejects.toThrow(
      "DiffSinger checkout found at DIFFSINGER_ROOT but the jam-sessions pin is not wired yet. Use --svs-backend dsp, or see vocology-knowledge wave 1 finding 24.",
    );
  });

  it("writes a 16-bit mono wav from the offline pcm, clipping samples to the int16 range", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ajs-svs-"));
    const outPath = join(dir, "lead.wav");
    const result = await renderOfflineSvs(SCORE, { outPath, preset: "kokoro-af-heart" });
    expect(result).toEqual({
      backend: "dsp",
      outPath,
      sampleRate: 8000,
      durationSec: 4 / 8000,
    });
    const buf = readFileSync(outPath);
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.readUInt16LE(22)).toBe(1);
    expect(buf.readUInt16LE(34)).toBe(16);
    expect(buf.readUInt32LE(24)).toBe(8000);
    expect(buf.readInt16LE(44)).toBe(32767);
    expect(buf.readInt16LE(46)).toBe(-32768);
    expect(buf.readInt16LE(48)).toBe(0);
    expect(buf.readInt16LE(50)).toBe(32767);
  });
});
