import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  KOKORO_LOCK_DIR_ENV,
  KOKORO_LOCK_ENV,
  kokoroLeadHint,
  loadKokoroSyllableClips,
  readMonoWav,
  renderKokoroLead,
  resolveKokoroLockDir,
  resolveKokoroLockWav,
} from "./kokoro-lead.js";
import type { BuiltVocalScore } from "./score-locked.js";

function wav16(samples: number[], sampleRate: number, bits = 16): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, i) => data.writeInt16LE(sample, i * 2));
  const buf = Buffer.alloc(44 + data.length);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + data.length, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(bits, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(data.length, 40);
  data.copy(buf, 44);
  return buf;
}

function score(notes: BuiltVocalScore["notes"]): BuiltVocalScore {
  return {
    bpm: 120,
    notes,
    lyrics: { text: "la", language: "en" },
    phonemes: [],
    warnings: [],
    startMeasure: 1,
    endMeasure: 1,
  };
}

describe("kokoro lead lock", () => {
  const previousWav = process.env[KOKORO_LOCK_ENV];
  const previousDir = process.env[KOKORO_LOCK_DIR_ENV];

  afterEach(() => {
    if (previousWav === undefined) delete process.env[KOKORO_LOCK_ENV];
    else process.env[KOKORO_LOCK_ENV] = previousWav;
    if (previousDir === undefined) delete process.env[KOKORO_LOCK_DIR_ENV];
    else process.env[KOKORO_LOCK_DIR_ENV] = previousDir;
  });

  it("reads a 16-bit mono sample and rejects any other bit depth", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajs-kokoro-"));
    const path = join(dir, "lock.wav");
    writeFileSync(path, wav16([16384], 8000));
    const wav = readMonoWav(path);
    expect(wav.sampleRate).toBe(8000);
    expect(wav.pcm.length).toBe(1);
    expect(wav.pcm[0]).toBeCloseTo(16384 / 32768, 6);
    writeFileSync(path, wav16([0], 8000, 24));
    expect(() => readMonoWav(path)).toThrow("Kokoro lock WAV must be 16-bit PCM (got 24)");
  });

  it("resolves the lock directory and wav from the environment, then from lock.wav", () => {
    delete process.env[KOKORO_LOCK_ENV];
    delete process.env[KOKORO_LOCK_DIR_ENV];
    const missing = join(tmpdir(), "ajs-kokoro-missing");
    process.env[KOKORO_LOCK_DIR_ENV] = missing;
    expect(resolveKokoroLockDir()).toBeNull();
    expect(resolveKokoroLockWav()).toBeNull();

    const dir = mkdtempSync(join(tmpdir(), "ajs-kokoro-"));
    process.env[KOKORO_LOCK_DIR_ENV] = dir;
    expect(resolveKokoroLockDir()).toBe(dir);
    expect(resolveKokoroLockWav()).toBeNull();
    const lock = join(dir, "lock.wav");
    writeFileSync(lock, wav16([1000], 8000));
    expect(resolveKokoroLockWav()).toBe(lock);

    const direct = join(dir, "direct.wav");
    writeFileSync(direct, wav16([1000], 8000));
    process.env[KOKORO_LOCK_ENV] = direct;
    expect(resolveKokoroLockWav()).toBe(direct);
    process.env[KOKORO_LOCK_ENV] = missing;
    expect(resolveKokoroLockWav()).toBe(lock);
  });

  it("loads numbered syllable clips and trims the leading silence", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajs-kokoro-"));
    const silent = new Array(200).fill(0);
    writeFileSync(join(dir, "00-ah.wav"), wav16([...silent, 16000], 8000));
    writeFileSync(join(dir, "notes.txt"), "skip");
    const clips = loadKokoroSyllableClips(dir);
    expect(clips).toHaveLength(1);
    expect(clips[0]?.sampleRate).toBe(8000);
    expect(clips[0]?.pcm.length).toBe(161);
    expect(clips[0]?.pcm[0]).toBe(0);
    expect(clips[0]?.pcm[160]).toBeCloseTo(16000 / 32768, 5);
  });

  it("states the lock hint with the environment variable name", () => {
    expect(kokoroLeadHint()).toBe(
      "No locked Kokoro take. fx-dub rule: CAST once, LOCK the wav, PERFORM from it. " +
        "Set JAM_KOKORO_LOCK_WAV to a 16-bit WAV of the Kokoro voice (local Apache-2.0 TTS — not Comfy Cloud). " +
        "Do not fall back to tract/additive: those are a different person.",
    );
  });

  it("returns silence when there is nothing to splice, and energy when a note is voiced", () => {
    const silent = renderKokoroLead(score([]), new Float32Array([0.5]), 8000);
    expect(silent.sampleRate).toBe(8000);
    expect(silent.pcm.length).toBe(Math.ceil(0.2 * 8000));
    expect(silent.pcm.every((s) => s === 0)).toBe(true);

    const emptyLock = renderKokoroLead(
      score([{ id: "n1", startSec: 0, durationSec: 0.05, midi: 69 }]),
      new Float32Array(0),
      8000,
    );
    expect(emptyLock.pcm.every((s) => s === 0)).toBe(true);

    const lock = new Float32Array(200);
    for (let i = 0; i < lock.length; i++) lock[i] = Math.sin((2 * Math.PI * 180 * i) / 8000) * 0.5;
    const voiced = renderKokoroLead(
      score([{ id: "n1", startSec: 0, durationSec: 0.05, midi: 69 }]),
      lock,
      8000,
    );
    expect(voiced.sampleRate).toBe(8000);
    const energy = voiced.pcm.reduce((sum, s) => sum + s * s, 0);
    expect(energy).toBeGreaterThan(0.01);
  });
});
