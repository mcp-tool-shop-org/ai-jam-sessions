import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
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
  formatCode?: number;
  withTrailingPayloadBytes?: number;
}): Buffer {
  const header = Buffer.alloc(44 + (params.withTrailingPayloadBytes ?? 0));
  header.write("RIFF", 0);
  header.writeUInt32LE(Math.min(0xffffffff, 36 + params.dataBytes), 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(params.formatCode ?? 1, 20);
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

function writeSparseFile(filePath: string, header: Buffer, totalBytes: number): void {
  writeFileSync(filePath, header);
  if (process.platform === "win32") {
    spawnSync("fsutil", ["sparse", "setflag", filePath], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
  truncateSync(filePath, totalBytes);
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

  it("uses 600 s duration as the primary gate so 300 s 24-bit and 32-bit float takes pass, while 601 s and >1 GiB unreadable headers fail", () => {
    const dir = mkDir();
    const prevBytes = process.env[AUDIO_MAX_FILE_BYTES_ENV];
    const prevDur = process.env[AUDIO_MAX_DURATION_SEC_ENV];
    delete process.env[AUDIO_MAX_FILE_BYTES_ENV];
    delete process.env[AUDIO_MAX_DURATION_SEC_ENV];

    try {
      // 24-bit PCM stereo @ 48 kHz, 300 s = 86,400,000 data bytes (> old 64 MiB cap)
      const pcm24Bytes = 48_000 * 2 * 3 * 300;
      const pcm24Path = join(dir, "24bit-48k-300s.wav");
      writeSparseFile(
        pcm24Path,
        makeWavHeader({ sampleRate: 48_000, channels: 2, bitDepth: 24, formatCode: 1, dataBytes: pcm24Bytes }),
        44 + pcm24Bytes,
      );
      expect(checkAudioInputCaps(pcm24Path)).toEqual({ ok: true });

      // 32-bit IEEE float stereo @ 48 kHz, 300 s = 115,200,000 data bytes (> old 64 MiB cap)
      const float32Bytes = 48_000 * 2 * 4 * 300;
      const float32Path = join(dir, "f32-48k-300s.wav");
      writeSparseFile(
        float32Path,
        makeWavHeader({ sampleRate: 48_000, channels: 2, bitDepth: 32, formatCode: 3, dataBytes: float32Bytes }),
        44 + float32Bytes,
      );
      expect(checkAudioInputCaps(float32Path)).toEqual({ ok: true });

      // 24-bit PCM stereo @ 96 kHz, 300 s = 172,800,000 data bytes
      const pcm24_96kBytes = 96_000 * 2 * 3 * 300;
      const pcm24_96kPath = join(dir, "24bit-96k-300s.wav");
      writeSparseFile(
        pcm24_96kPath,
        makeWavHeader({ sampleRate: 96_000, channels: 2, bitDepth: 24, formatCode: 1, dataBytes: pcm24_96kBytes }),
        44 + pcm24_96kBytes,
      );
      expect(checkAudioInputCaps(pcm24_96kPath)).toEqual({ ok: true });

      // 601 s 24-bit stereo @ 48 kHz -> refused by duration (not byte size)
      const over601Bytes = 48_000 * 2 * 3 * 601;
      const over601Path = join(dir, "24bit-48k-601s.wav");
      writeSparseFile(
        over601Path,
        makeWavHeader({ sampleRate: 48_000, channels: 2, bitDepth: 24, formatCode: 1, dataBytes: over601Bytes }),
        44 + over601Bytes,
      );
      const durRes = checkAudioInputCaps(over601Path);
      expect(durRes.ok).toBe(false);
      if (!durRes.ok && !durRes.missing) {
        expect(durRes.result.isError).toBe(true);
        expect(durRes.result.content[0].text).toContain("601.00 s");
        expect(durRes.result.content[0].text).toContain("600 s duration limit");
      }

      // Unreadable header over the 1 GiB ceiling -> refused
      expect(AUDIO_MAX_FILE_BYTES).toBeGreaterThanOrEqual(1024 * 1024 * 1024);
      const hugeBadPath = join(dir, "unreadable-over-1gib.bin");
      writeSparseFile(hugeBadPath, Buffer.from("NOT_A_WAV_FILE_HEADER"), AUDIO_MAX_FILE_BYTES + 1);
      const hugeBadRes = checkAudioInputCaps(hugeBadPath);
      expect(hugeBadRes.ok).toBe(false);
      if (!hugeBadRes.ok && !hugeBadRes.missing) {
        expect(hugeBadRes.result.isError).toBe(true);
        expect(hugeBadRes.result.content[0].text).toContain(`${AUDIO_MAX_FILE_BYTES + 1} bytes`);
        expect(hugeBadRes.result.content[0].text).toContain(`${AUDIO_MAX_FILE_BYTES}-byte limit`);
      }

      // Unreadable header <= 1 GiB -> allowed past cap check (decodeWav gives format error)
      const smallBadPath = join(dir, "unreadable-under-1gib.bin");
      writeFileSync(smallBadPath, Buffer.from("NOT_A_WAV_FILE_HEADER"));
      expect(checkAudioInputCaps(smallBadPath)).toEqual({ ok: true });

      // Valid duration (5 s) whose file size exceeds header-derived byte limit + 1 MiB slack -> refused
      const padded5sPath = join(dir, "padded-5s.wav");
      const paddedTotal = 44 + 1000 + 2 * 1024 * 1024;
      writeSparseFile(
        padded5sPath,
        makeWavHeader({ sampleRate: 100, channels: 1, bitDepth: 16, dataBytes: 1000 }),
        paddedTotal,
      );
      const paddedRes = checkAudioInputCaps(padded5sPath, { maxDurationSec: 5 });
      expect(paddedRes.ok).toBe(false);
      if (!paddedRes.ok && !paddedRes.missing) {
        expect(paddedRes.result.isError).toBe(true);
        expect(paddedRes.result.content[0].text).toContain(`${paddedTotal} bytes`);
      }
    } finally {
      if (prevBytes === undefined) delete process.env[AUDIO_MAX_FILE_BYTES_ENV];
      else process.env[AUDIO_MAX_FILE_BYTES_ENV] = prevBytes;
      if (prevDur === undefined) delete process.env[AUDIO_MAX_DURATION_SEC_ENV];
      else process.env[AUDIO_MAX_DURATION_SEC_ENV] = prevDur;
    }
  });
});
