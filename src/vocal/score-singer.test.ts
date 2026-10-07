import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSharedAudioContext, setSharedAudioContext } from "../audio-shared.js";
import {
  createScoreSinger,
  listScoreSingerPresets,
  peakNormalize,
  renderScoreLockedPcm,
} from "./score-singer.js";
import { scoreDurationSec, type BuiltVocalScore } from "./score-locked.js";
import { readMonoWav, renderKokoroLead } from "./kokoro-lead.js";

const fsGate = vi.hoisted(() => ({ hidePresets: false }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (p: Parameters<typeof actual.existsSync>[0]) => {
      if (fsGate.hidePresets) {
        const norm = String(p).replace(/\\/g, "/");
        if (norm.endsWith("/vocal-synth-engine/presets")) return false;
      }
      return actual.existsSync(p);
    },
  };
});

const audio = vi.hoisted(() => ({
  failImport: false,
  reportedRate: null as number | null,
  stopThrows: false,
  sourceDisconnectThrows: false,
  gainDisconnectThrows: false,
  closeThrows: false,
  ctorOpts: [] as Array<{ sampleRate: number; latencyHint?: string }>,
  buffers: [] as Array<{ ch: number; length: number; rate: number; data: Float32Array }>,
  starts: [] as number[],
  stops: 0,
  sourceDisconnects: 0,
  gainDisconnects: 0,
  closes: 0,
  sources: [] as Array<{ buffer: unknown; sink: unknown }>,
  gains: [] as Array<{ gain: { value: number }; sink: unknown }>,
  reset(this: {
    failImport: boolean;
    reportedRate: number | null;
    stopThrows: boolean;
    sourceDisconnectThrows: boolean;
    gainDisconnectThrows: boolean;
    closeThrows: boolean;
    ctorOpts: unknown[];
    buffers: unknown[];
    starts: number[];
    stops: number;
    sourceDisconnects: number;
    gainDisconnects: number;
    closes: number;
    sources: unknown[];
    gains: unknown[];
  }) {
    this.failImport = false;
    this.reportedRate = null;
    this.stopThrows = false;
    this.sourceDisconnectThrows = false;
    this.gainDisconnectThrows = false;
    this.closeThrows = false;
    this.ctorOpts = [];
    this.buffers = [];
    this.starts = [];
    this.stops = 0;
    this.sourceDisconnects = 0;
    this.gainDisconnects = 0;
    this.closes = 0;
    this.sources = [];
    this.gains = [];
  },
}));

vi.mock("node-web-audio-api", () => {
  class FakeAudioContext {
    sampleRate: number;
    destination = { id: "dest" };
    constructor(opts: { sampleRate: number; latencyHint?: string }) {
      audio.ctorOpts.push(opts);
      this.sampleRate = audio.reportedRate === null ? opts.sampleRate : audio.reportedRate;
    }
    createBuffer(ch: number, length: number, rate: number) {
      const data = new Float32Array(length);
      const buf = { ch, length, rate, data, getChannelData: () => data };
      audio.buffers.push(buf);
      return buf;
    }
    createBufferSource() {
      const src = {
        buffer: null as unknown,
        sink: null as unknown,
        connect(node: unknown) { src.sink = node; },
        start(when: number) { audio.starts.push(when); },
        stop() {
          audio.stops += 1;
          if (audio.stopThrows) throw new Error("already ended");
        },
        disconnect() {
          audio.sourceDisconnects += 1;
          if (audio.sourceDisconnectThrows) throw new Error("source disconnect");
        },
      };
      audio.sources.push(src);
      return src;
    }
    createGain() {
      const gain = {
        gain: { value: -1 },
        sink: null as unknown,
        connect(node: unknown) { gain.sink = node; },
        disconnect() {
          audio.gainDisconnects += 1;
          if (audio.gainDisconnectThrows) throw new Error("gain disconnect");
        },
      };
      audio.gains.push(gain);
      return gain;
    }
    async close() {
      audio.closes += 1;
      if (audio.closeThrows) throw new Error("close failed");
    }
  }
  return {
    get AudioContext() {
      if (audio.failImport) return undefined;
      return FakeAudioContext;
    },
  };
});

const LOCK_KEYS = ["JAM_KOKORO_LOCK_WAV", "JAM_KOKORO_LOCK_DIR"] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of LOCK_KEYS) savedEnv[key] = process.env[key];
  fsGate.hidePresets = false;
  audio.reset();
  setSharedAudioContext(null);
});

afterEach(() => {
  setSharedAudioContext(null);
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

function shortScore(): BuiltVocalScore {
  return {
    bpm: 120,
    notes: [{ id: "n0", startSec: 0, durationSec: 0.05, midi: 60, velocity: 0.8 }],
    lyrics: { text: "la", language: "en-US" },
    phonemes: [{ tSec: 0, durSec: 0.05, phoneme: "AH", kind: "vowel", timbreHint: "AH" }],
    warnings: ["score-warn"],
    startMeasure: 1,
    endMeasure: 1,
  };
}

function hideKokoroLock(): void {
  delete process.env.JAM_KOKORO_LOCK_WAV;
  process.env.JAM_KOKORO_LOCK_DIR = join(tmpdir(), "score-singer-no-lock");
}

describe("peakNormalize", () => {
  it("scales a quiet buffer up to the target peak", () => {
    const pcm = new Float32Array([0, 0.1, -0.05]);
    const out = peakNormalize(pcm, 0.5);
    expect(Math.max(...out.map(Math.abs))).toBeCloseTo(0.5, 5);
    expect(out[1]).toBeCloseTo(0.5, 5);
  });

  it("leaves silence alone", () => {
    const pcm = new Float32Array(8);
    expect(peakNormalize(pcm, 0.5)).toEqual(pcm);
  });
});

describe("listScoreSingerPresets", () => {
  it("returns the installed preset directories that have a voicepreset", async () => {
    const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const dir = join(process.cwd(), "node_modules", "vocal-synth-engine", "presets");
    const expected = fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(join(dir, d.name, "voicepreset.json")))
      .map((d) => d.name)
      .sort();
    expect(expected).toContain("default-voice");
    expect(expected.length).toBeGreaterThan(0);
    expect(listScoreSingerPresets()).toEqual(expected);
  });

  it("throws the install message when no preset directory exists", () => {
    fsGate.hidePresets = true;
    expect(() => listScoreSingerPresets()).toThrow(
      "vocal-synth-engine presets not found. Install: npm install github:mcp-tool-shop-org/vocal-synth-engine",
    );
  });
});

describe("renderScoreLockedPcm", () => {
  it("renders a short score at the requested rate", async () => {
    const score = shortScore();
    const { pcm, sampleRate } = await renderScoreLockedPcm(score, {
      sampleRate: 8000,
      blockSize: 128,
      seed: 3,
      preset: "default-voice",
    });
    expect(sampleRate).toBe(8000);
    expect(pcm.length).toBe(Math.ceil((scoreDurationSec(score) + 0.15) * 8000));
  }, 20_000);

  it("throws when the preset id is not installed", async () => {
    let caught: unknown;
    try {
      await renderScoreLockedPcm(shortScore(), { preset: "missing-voice", sampleRate: 8000, blockSize: 128 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("Vocal synth preset 'missing-voice' not found");
  });
});

describe("createScoreSinger", () => {
  it("throws the kokoro hint when no lock wav is configured", async () => {
    hideKokoroLock();
    const singer = createScoreSinger(shortScore(), {});
    expect(singer.durationSec).toBe(scoreDurationSec(shortScore()) + 0.15);
    expect(singer.warnings).toEqual(["score-warn"]);
    let caught: unknown;
    try {
      await singer.connect();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      "No locked Kokoro take. fx-dub rule: CAST once, LOCK the wav, PERFORM from it. " +
        "Set JAM_KOKORO_LOCK_WAV to a 16-bit WAV of the Kokoro voice (local Apache-2.0 TTS — not Comfy Cloud). " +
        "Do not fall back to tract/additive: those are a different person.",
    );
  });

  it("plays a kokoro lock on an owned context and stops it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "score-lock-"));
    const wav = join(dir, "lock.wav");
    const samples = Array.from({ length: 80 }, () => 12000);
    writeFileSync(wav, monoWav(8000, samples));
    process.env.JAM_KOKORO_LOCK_WAV = wav;
    delete process.env.JAM_KOKORO_LOCK_DIR;
    const score = shortScore();
    const lock = readMonoWav(wav);
    const expected = peakNormalize(renderKokoroLead(score, lock.pcm, lock.sampleRate).pcm, 0.45);
    audio.reportedRate = 0;
    const singer = createScoreSinger(score, { masterGain: 0.25 });
    singer.start();
    expect(audio.buffers).toEqual([]);
    await singer.connect();
    singer.start();
    expect(audio.ctorOpts).toEqual([{ sampleRate: 8000, latencyHint: "playback" }]);
    expect(getSharedAudioContext()).not.toBeNull();
    expect(audio.buffers[0].ch).toBe(1);
    expect(audio.buffers[0].rate).toBe(8000);
    expect(Array.from(audio.buffers[0].data)).toEqual(Array.from(expected));
    expect(audio.sources[0].buffer).toBe(audio.buffers[0]);
    expect(audio.sources[0].sink).toBe(audio.gains[0]);
    expect(audio.gains[0].sink).toBe(getSharedAudioContext().destination);
    expect(audio.gains[0].gain.value).toBe(0.25);
    expect(audio.starts).toEqual([0]);
    await singer.stop();
    expect(audio.stops).toBe(1);
    expect(audio.sourceDisconnects).toBe(1);
    expect(audio.gainDisconnects).toBe(1);
    expect(audio.closes).toBe(1);
    expect(getSharedAudioContext()).toBe(null);
    const buffersBefore = audio.buffers.length;
    singer.start();
    expect(audio.buffers.length).toBe(buffersBefore);
  });

  it("uses a shared context and leaves it in place on stop", async () => {
    const dir = mkdtempSync(join(tmpdir(), "score-lock-"));
    const wav = join(dir, "lock.wav");
    writeFileSync(wav, monoWav(8000, Array.from({ length: 80 }, () => 12000)));
    process.env.JAM_KOKORO_LOCK_WAV = wav;
    delete process.env.JAM_KOKORO_LOCK_DIR;
    const started: number[] = [];
    const destination = { id: "shared-dest" };
    let copied = new Float32Array(0);
    const sources: Array<{ stopped: boolean; disconnected: boolean; sink: unknown }> = [];
    const gains: Array<{ gain: { value: number }; sink: unknown; disconnected: boolean }> = [];
    const shared = {
      sampleRate: 8000,
      destination,
      createBuffer(_ch: number, length: number, rate: number) {
        expect(rate).toBe(8000);
        copied = new Float32Array(length);
        return { getChannelData: () => copied };
      },
      createBufferSource() {
        const src = {
          buffer: null as { getChannelData?: () => Float32Array } | null,
          sink: null as unknown,
          stopped: false,
          disconnected: false,
          connect(node: unknown) { src.sink = node; },
          start(when: number) { started.push(when); },
          stop() { src.stopped = true; },
          disconnect() { src.disconnected = true; },
        };
        sources.push(src);
        return src;
      },
      createGain() {
        const gain = {
          gain: { value: -1 },
          sink: null as unknown,
          disconnected: false,
          connect(node: unknown) { gain.sink = node; },
          disconnect() { gain.disconnected = true; },
        };
        gains.push(gain);
        return gain;
      },
    };
    setSharedAudioContext(shared);
    const score = shortScore();
    const lock = readMonoWav(wav);
    const expected = peakNormalize(renderKokoroLead(score, lock.pcm, lock.sampleRate).pcm, 0.45);
    const singer = createScoreSinger(score, {});
    await singer.connect();
    singer.start();
    expect(audio.ctorOpts).toEqual([]);
    expect(started).toEqual([0]);
    expect(Array.from(copied)).toEqual(Array.from(expected));
    expect(sources[0].sink).toBe(gains[0]);
    expect(gains[0].sink).toBe(destination);
    expect(gains[0].gain.value).toBe(1);
    await singer.stop();
    expect(sources[0].stopped).toBe(true);
    expect(sources[0].disconnected).toBe(true);
    expect(gains[0].disconnected).toBe(true);
    expect(getSharedAudioContext()).toBe(shared);
    expect(audio.closes).toBe(0);
  });

  it("start does nothing when AudioContext is missing after connect", async () => {
    const dir = mkdtempSync(join(tmpdir(), "score-lock-"));
    const wav = join(dir, "lock.wav");
    writeFileSync(wav, monoWav(8000, Array.from({ length: 80 }, () => 12000)));
    process.env.JAM_KOKORO_LOCK_WAV = wav;
    delete process.env.JAM_KOKORO_LOCK_DIR;
    audio.failImport = true;
    const singer = createScoreSinger(shortScore(), {});
    await singer.connect();
    singer.start();
    expect(audio.ctorOpts).toEqual([]);
    expect(audio.buffers).toEqual([]);
    expect(singer.warnings).toEqual(["score-warn"]);
  });

  it("swallows stop errors from the source, gain, and context", async () => {
    const dir = mkdtempSync(join(tmpdir(), "score-lock-"));
    const wav = join(dir, "lock.wav");
    writeFileSync(wav, monoWav(8000, Array.from({ length: 80 }, () => 12000)));
    process.env.JAM_KOKORO_LOCK_WAV = wav;
    delete process.env.JAM_KOKORO_LOCK_DIR;
    const singer = createScoreSinger(shortScore(), {});
    await singer.connect();
    singer.start();
    audio.stopThrows = true;
    audio.sourceDisconnectThrows = true;
    audio.gainDisconnectThrows = true;
    audio.closeThrows = true;
    await expect(singer.stop()).resolves.toBeUndefined();
    expect(audio.stops).toBe(1);
    expect(audio.sourceDisconnects).toBe(1);
    expect(audio.gainDisconnects).toBe(1);
    expect(audio.closes).toBe(1);
    expect(getSharedAudioContext()).toBe(null);
    await expect(singer.stop()).resolves.toBeUndefined();
  });

  it("plays an additive render through the owned context", async () => {
    hideKokoroLock();
    const score = shortScore();
    const options = { backend: "additive" as const, sampleRate: 8000, blockSize: 128, seed: 7, preset: "default-voice", masterGain: 0.3 };
    const rendered = await renderScoreLockedPcm(score, options);
    const singer = createScoreSinger(score, options);
    await singer.connect();
    singer.start();
    expect(Array.from(audio.buffers[0].data)).toEqual(Array.from(peakNormalize(rendered.pcm, 0.45)));
    expect(audio.gains[0].gain.value).toBe(0.3);
    expect(audio.buffers[0].rate).toBe(8000);
    await singer.stop();
  }, 20_000);

  it("plays a tract render through the owned context", async () => {
    hideKokoroLock();
    const score = shortScore();
    const singer = createScoreSinger(score, { backend: "tract", sampleRate: 8000 });
    await singer.connect();
    singer.start();
    const data = audio.buffers[0].data;
    expect(audio.buffers[0].length).toBe(Math.ceil((scoreDurationSec(score) + 0.2) * 8000));
    expect(audio.buffers[0].rate).toBe(8000);
    expect(Math.max(...data.map((s) => Math.abs(s)))).toBeCloseTo(0.45, 5);
    expect(audio.gains[0].gain.value).toBe(1);
    expect(audio.starts).toEqual([0]);
    await singer.stop();
    expect(getSharedAudioContext()).toBe(null);
  }, 20_000);
});
