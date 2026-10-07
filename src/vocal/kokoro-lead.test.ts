import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  kokoroLeadHint,
  loadKokoroSyllableClips,
  readMonoWav,
  renderKokoroLead,
  resolveKokoroLockDir,
  resolveKokoroLockWav,
} from "./kokoro-lead.js";
import { midiToHz, estimateF0 } from "./voice-changer.js";
import { scoreDurationSec, type BuiltVocalScore } from "./score-locked.js";

const LOCK_KEYS = ["JAM_KOKORO_LOCK_WAV", "JAM_KOKORO_LOCK_DIR"] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of LOCK_KEYS) savedEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of LOCK_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function monoWav(sampleRate: number, samples: number[]): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(samples[i], i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function stereoWav(sampleRate: number, frames: Array<[number, number]>): Buffer {
  const data = Buffer.alloc(frames.length * 4);
  for (let i = 0; i < frames.length; i++) {
    data.writeInt16LE(frames[i][0], i * 4);
    data.writeInt16LE(frames[i][1], i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function sine(sr: number, hz: number, sec: number): Float32Array {
  const n = Math.floor(sr * sec);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.sin((2 * Math.PI * hz * i) / sr);
  return pcm;
}

describe("renderKokoroLead", () => {
  it("places a retuned grain on the MIDI clock", () => {
    const sr = 48000;
    const score: BuiltVocalScore = {
      bpm: 60,
      notes: [{ id: "n0", startSec: 0.1, durationSec: 0.2, midi: 69, velocity: 0.8 }],
      lyrics: { text: "la", language: "en-US" },
      phonemes: [],
      warnings: [],
      startMeasure: 1,
      endMeasure: 1,
    };
    const { pcm, sampleRate } = renderKokoroLead(score, sine(sr, 180, 0.15), sr);
    expect(sampleRate).toBe(sr);
    const start = Math.floor(0.12 * sr);
    const f0 = estimateF0(pcm, sr, start, Math.floor(0.08 * sr));
    expect(f0).toBeGreaterThan(midiToHz(69) * 0.55);
  });

  it("returns silence when the score has no notes", () => {
    const sr = 1000;
    const score: BuiltVocalScore = {
      bpm: 60,
      notes: [],
      lyrics: { text: "", language: "en-US" },
      phonemes: [],
      warnings: [],
      startMeasure: 1,
      endMeasure: 1,
    };
    const { pcm, sampleRate } = renderKokoroLead(score, sine(sr, 180, 0.1), sr);
    expect(sampleRate).toBe(1000);
    expect(pcm.length).toBe(200);
    expect(Array.from(pcm)).toEqual(Array.from(new Float32Array(200)));
  });

  it("returns silence when the locked take is empty", () => {
    const score: BuiltVocalScore = {
      bpm: 60,
      notes: [{ id: "n0", startSec: 0, durationSec: 0.1, midi: 60 }],
      lyrics: { text: "la", language: "en-US" },
      phonemes: [],
      warnings: [],
      startMeasure: 1,
      endMeasure: 1,
    };
    const { pcm, sampleRate } = renderKokoroLead(score, new Float32Array(0), 1000);
    const total = Math.ceil((scoreDurationSec(score) + 0.2) * 1000);
    expect(sampleRate).toBe(1000);
    expect(total).toBe(301);
    expect(pcm.length).toBe(301);
    expect(Array.from(pcm)).toEqual(Array.from(new Float32Array(301)));
  });
});

describe("kokoroLeadHint", () => {
  it("names the lock env and refuses a tract or additive fallback", () => {
    expect(kokoroLeadHint()).toBe(
      "No locked Kokoro take. fx-dub rule: CAST once, LOCK the wav, PERFORM from it. " +
        "Set JAM_KOKORO_LOCK_WAV to a 16-bit WAV of the Kokoro voice (local Apache-2.0 TTS — not Comfy Cloud). " +
        "Do not fall back to tract/additive: those are a different person.",
    );
  });
});

describe("readMonoWav", () => {
  it("reads a 16-bit mono sample at the header rate", () => {
    const dir = mkdtempSync(join(tmpdir(), "kokoro-wav-"));
    const wav = join(dir, "one.wav");
    writeFileSync(wav, monoWav(16000, [16384]));
    expect(readMonoWav(wav)).toEqual({ pcm: new Float32Array([0.5]), sampleRate: 16000 });
  });

  it("averages stereo frames into one mono sample", () => {
    const dir = mkdtempSync(join(tmpdir(), "kokoro-wav-"));
    const wav = join(dir, "stereo.wav");
    writeFileSync(wav, stereoWav(22050, [[16384, 0]]));
    expect(readMonoWav(wav)).toEqual({ pcm: new Float32Array([0.25]), sampleRate: 22050 });
  });

  it("refuses a WAV that is not 16-bit", () => {
    const dir = mkdtempSync(join(tmpdir(), "kokoro-wav-"));
    const wav = join(dir, "wide.wav");
    const buf = monoWav(16000, [0]);
    buf.writeUInt16LE(24, 34);
    writeFileSync(wav, buf);
    expect(() => readMonoWav(wav)).toThrow("Kokoro lock WAV must be 16-bit PCM (got 24)");
  });
});

describe("loadKokoroSyllableClips", () => {
  it("loads numbered clips in order and trims edge silence", () => {
    const dir = mkdtempSync(join(tmpdir(), "kokoro-clips-"));
    writeFileSync(join(dir, "notes.txt"), "skip");
    writeFileSync(join(dir, "2-nope.wav"), monoWav(50, [16384]));
    writeFileSync(join(dir, "01-oh.wav"), monoWav(16000, [16384, 16384, 16384, 16384]));
    writeFileSync(join(dir, "00-ah.wav"), monoWav(50, [0, 0, 16384, 0, 0]));
    const clips = loadKokoroSyllableClips(dir);
    expect(clips.map((c) => c.sampleRate)).toEqual([50, 16000]);
    expect(Array.from(clips[0].pcm)).toEqual([0, 0.5, 0]);
    expect(Array.from(clips[1].pcm)).toEqual([0.5, 0.5, 0.5, 0.5]);
  });
});

describe("resolveKokoroLockDir", () => {
  it("returns the env directory when that path exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "kokoro-lock-dir-"));
    process.env.JAM_KOKORO_LOCK_DIR = dir;
    expect(resolveKokoroLockDir()).toBe(dir);
  });

  it("returns null when the env path is missing and the cwd default is missing", () => {
    delete process.env.JAM_KOKORO_LOCK_DIR;
    const fallback = join(process.cwd(), "tmp", "kokoro-lock");
    expect(resolveKokoroLockDir()).toBe(null);
    expect(fallback.endsWith(join("tmp", "kokoro-lock"))).toBe(true);
  });

  it("ignores a missing env path and returns null when the cwd default is missing", () => {
    process.env.JAM_KOKORO_LOCK_DIR = join(tmpdir(), "kokoro-lock-missing");
    expect(resolveKokoroLockDir()).toBe(null);
  });
});

describe("resolveKokoroLockWav", () => {
  it("returns the env WAV when that file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "kokoro-lock-wav-"));
    const wav = join(dir, "voice.wav");
    writeFileSync(wav, monoWav(8000, [16384]));
    process.env.JAM_KOKORO_LOCK_WAV = wav;
    process.env.JAM_KOKORO_LOCK_DIR = join(tmpdir(), "kokoro-lock-unused");
    expect(resolveKokoroLockWav()).toBe(wav);
  });

  it("falls through a missing env WAV to lock.wav in the lock directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "kokoro-lock-dir-"));
    const lock = join(dir, "lock.wav");
    writeFileSync(lock, monoWav(8000, [16384]));
    process.env.JAM_KOKORO_LOCK_WAV = join(dir, "missing.wav");
    process.env.JAM_KOKORO_LOCK_DIR = dir;
    expect(resolveKokoroLockWav()).toBe(lock);
  });

  it("returns null when the env WAV is unset and the lock directory has no lock.wav", () => {
    const dir = mkdtempSync(join(tmpdir(), "kokoro-lock-empty-"));
    delete process.env.JAM_KOKORO_LOCK_WAV;
    process.env.JAM_KOKORO_LOCK_DIR = dir;
    expect(resolveKokoroLockWav()).toBe(null);
  });

  it("returns null when neither the env WAV nor a lock directory exists", () => {
    delete process.env.JAM_KOKORO_LOCK_WAV;
    delete process.env.JAM_KOKORO_LOCK_DIR;
    expect(resolveKokoroLockWav()).toBe(null);
  });
});
