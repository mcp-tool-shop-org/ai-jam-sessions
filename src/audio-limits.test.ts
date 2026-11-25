import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUDIO_MAX_DURATION_SEC,
  AUDIO_MAX_DURATION_SEC_ENV,
  AUDIO_MAX_FILE_BYTES,
  AUDIO_MAX_FILE_BYTES_ENV,
  checkAudioInputCaps,
  peekWavDurationSec,
  resolveAudioMaxDurationSec,
  resolveAudioMaxFileBytes,
} from "./audio-limits.js";

function makeWavHeader(params: {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  dataBytes: number;
  withTrailingPayloadBytes?: number;
}): Buffer {
  const header = Buffer.alloc(44 + (params.withTrailingPayloadBytes ?? 0));
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + params.dataBytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(params.channels, 22);
  header.writeUInt32LE(params.sampleRate, 24);
  const blockAlign = params.channels * (params.bitDepth / 8);
  header.writeUInt32LE(params.sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(params.bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(params.dataBytes, 40);
  return header;
}

describe("audio-limits", () => {
  const tempDirs: string[] = [];

  function mkDir(): string {
    const d = mkdtempSync(join(tmpdir(), "ajs-audio-limits-"));
    tempDirs.push(d);
    return d;
  }

  afterEach(() => {
    for (const d of tempDirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("exposes documented defaults and logs env overrides to stderr", () => {
    const prevBytes = process.env[AUDIO_MAX_FILE_BYTES_ENV];
    const prevDur = process.env[AUDIO_MAX_DURATION_SEC_ENV];
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      delete process.env[AUDIO_MAX_FILE_BYTES_ENV];
      delete process.env[AUDIO_MAX_DURATION_SEC_ENV];
      expect(resolveAudioMaxFileBytes()).toBe(AUDIO_MAX_FILE_BYTES);
      expect(resolveAudioMaxDurationSec()).toBe(AUDIO_MAX_DURATION_SEC);

      process.env[AUDIO_MAX_FILE_BYTES_ENV] = "4096";
      process.env[AUDIO_MAX_DURATION_SEC_ENV] = "12.5";
      expect(resolveAudioMaxFileBytes()).toBe(4096);
      expect(resolveAudioMaxDurationSec()).toBe(12.5);
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining(`${AUDIO_MAX_FILE_BYTES_ENV}=4096`));
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining(`${AUDIO_MAX_DURATION_SEC_ENV}=12.5`));

      process.env[AUDIO_MAX_FILE_BYTES_ENV] = "0";
      process.env[AUDIO_MAX_DURATION_SEC_ENV] = "nope";
      expect(resolveAudioMaxFileBytes()).toBe(AUDIO_MAX_FILE_BYTES);
      expect(resolveAudioMaxDurationSec()).toBe(AUDIO_MAX_DURATION_SEC);
    } finally {
      errSpy.mockRestore();
      if (prevBytes === undefined) delete process.env[AUDIO_MAX_FILE_BYTES_ENV];
      else process.env[AUDIO_MAX_FILE_BYTES_ENV] = prevBytes;
      if (prevDur === undefined) delete process.env[AUDIO_MAX_DURATION_SEC_ENV];
      else process.env[AUDIO_MAX_DURATION_SEC_ENV] = prevDur;
    }
  });

  it("refuses an over-limit byte size without reading the file and accepts an exact at-limit file", () => {
    const dir = mkDir();
    const limit = 256;
    const atLimitPath = join(dir, "at-limit.wav");
    const overLimitPath = join(dir, "over-limit.wav");

    // 256 total bytes: 44-byte header + 212 bytes payload (106 frames @ 44100 Hz)
    writeFileSync(atLimitPath, makeWavHeader({ sampleRate: 44100, channels: 1, bitDepth: 16, dataBytes: 212, withTrailingPayloadBytes: 212 }));
    writeFileSync(overLimitPath, Buffer.alloc(limit + 1));

    expect(checkAudioInputCaps(atLimitPath, { maxBytes: limit, maxDurationSec: 60 })).toEqual({ ok: true });

    const openSpy = vi.fn();
    const over = checkAudioInputCaps(overLimitPath, { maxBytes: limit, maxDurationSec: 60, openFn: openSpy as never });
    expect(over.ok).toBe(false);
    if (!over.ok && !over.missing) {
      expect(over.result.isError).toBe(true);
      expect(over.result.content[0].text).toContain("257 bytes");
      expect(over.result.content[0].text).toContain("256-byte limit");
    }
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("refuses a file whose decoded WAV duration exceeds maxDurationSec and accepts an exact at-limit duration", () => {
    const dir = mkDir();
    // 100 Hz, 16-bit mono => 200 bytes/sec. 5 s = 1000 data bytes; 5.5 s = 1100 data bytes.
    const atDurPath = join(dir, "exact-5s.wav");
    const overDurPath = join(dir, "over-5s.wav");
    writeFileSync(atDurPath, makeWavHeader({ sampleRate: 100, channels: 1, bitDepth: 16, dataBytes: 1000, withTrailingPayloadBytes: 1000 }));
    writeFileSync(overDurPath, makeWavHeader({ sampleRate: 100, channels: 1, bitDepth: 16, dataBytes: 1100, withTrailingPayloadBytes: 1100 }));

    expect(peekWavDurationSec(atDurPath, 1044)).toBeCloseTo(5.0, 6);
    expect(checkAudioInputCaps(atDurPath, { maxBytes: 10_000, maxDurationSec: 5 })).toEqual({ ok: true });

    const over = checkAudioInputCaps(overDurPath, { maxBytes: 10_000, maxDurationSec: 5 });
    expect(over.ok).toBe(false);
    if (!over.ok && !over.missing) {
      expect(over.result.isError).toBe(true);
      expect(over.result.content[0].text).toContain("5.50 s");
      expect(over.result.content[0].text).toContain("5 s duration limit");
      expect(over.result.content[0].text).toContain("1144 bytes");
    }
  });
});
