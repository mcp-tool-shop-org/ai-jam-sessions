import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { getSharedAudioContext, setSharedAudioContext } from "../audio-shared.js";
import { soulxCacheDir } from "../state-home.js";
import { readMonoWav } from "./kokoro-lead.js";
import { SCORE_CLOCK_SCHEMA } from "./score-clock.js";
import { createSoulxScoreSinger, renderSoulxLead } from "./soulx-singer.js";
import type { ScoreClock } from "./score-clock.js";
import type { SoulxSingerConfig } from "./soulx-singer.js";

interface PyCall {
  cmd: string;
  args: string[];
  cwd?: string;
  pythonPath?: string;
}

const py = vi.hoisted(() => ({
  mode: "ok",
  verifyCode: 0,
  calls: [] as PyCall[],
  spawn: ((_cmd: string, _args: string[], _opts?: { cwd?: string; env?: Record<string, string> }): unknown => {
    throw new Error("spawn mock not installed");
  }),
}));

const gate = vi.hoisted(() => ({ rmThrows: false }));

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
  reset() {
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

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    rmSync: (...args: Parameters<typeof actual.rmSync>) => {
      if (gate.rmThrows) throw new Error("rm blocked");
      return actual.rmSync(...args);
    },
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }) =>
      py.spawn(cmd, args, opts),
  };
});

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

function flag(args: string[], name: string): string {
  const i = args.indexOf(name);
  if (i < 0) throw new Error(`missing ${name}`);
  return args[i + 1];
}

function scriptBase(args: string[]): string {
  return (args[0] ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
}

py.spawn = (cmd, args, opts) => {
  py.calls.push({ cmd, args, cwd: opts?.cwd, pythonPath: opts?.env?.PYTHONPATH });
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter();
  Object.assign(stdout, { setEncoding: () => stdout });
  Object.assign(stderr, { setEncoding: () => stderr });
  const child = Object.assign(proc, { stdout, stderr });
  queueMicrotask(() => {
    if (py.mode === "spawn-error") {
      proc.emit("error", new Error("spawn ENOENT"));
      return;
    }
    const base = scriptBase(args);
    const command = args[1];
    if (base === "export_soulx_target.py") {
      if (py.mode === "export-stderr") {
        stderr.emit("data", "export broke");
        proc.emit("close", 2);
        return;
      }
      if (py.mode === "export-stdout") {
        stdout.emit("data", "export out");
        proc.emit("close", 2);
        return;
      }
      stdout.emit("data", "exported");
      stderr.emit("data", "");
      proc.emit("close", 0);
      return;
    }
    if (base === "soulx_take.py") {
      if (py.mode === "take-fail") {
        stdout.emit("data", "take stdout");
        proc.emit("close", 7);
        return;
      }
      if (py.mode !== "missing-wav") {
        const outDir = flag(args, "--out-dir");
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, "take-48k.wav"), Buffer.from("take"));
      }
      stdout.emit("data", "take");
      stderr.emit("data", "");
      proc.emit("close", 0);
      return;
    }
    if (base === "vocal_clock.py" && command === "verify") {
      stdout.emit("data", "verify");
      stderr.emit("data", "");
      proc.emit("close", py.verifyCode);
      return;
    }
    if (base === "vocal_clock.py" && command === "repin") {
      if (py.mode === "repin-fail") {
        stderr.emit("data", "repin broke");
        proc.emit("close", 3);
        return;
      }
      stdout.emit("data", "repin");
      stderr.emit("data", "");
      proc.emit("close", 0);
      return;
    }
    if (base === "vocal_clock.py" && command === "place") {
      if (py.mode === "place-fail") {
        stderr.emit("data", "place broke");
        proc.emit("close", 4);
        return;
      }
      const outDir = flag(args, "--out-dir");
      const infoPath = flag(args, "--out-info");
      mkdirSync(outDir, { recursive: true });
      if (py.mode === "place-missing") {
        writeFileSync(infoPath, JSON.stringify({ path: join(outDir, "missing.wav") }));
      } else if (py.mode === "bad-wav") {
        const placed = join(outDir, "placed.wav");
        const bad = monoWav(16000, [0]);
        bad.writeUInt16LE(8, 34);
        writeFileSync(placed, bad);
        writeFileSync(infoPath, JSON.stringify({ path: placed }));
      } else {
        const placed = join(outDir, "placed.wav");
        writeFileSync(placed, monoWav(16000, [16384, -16384]));
        writeFileSync(infoPath, JSON.stringify({ path: placed }));
      }
      stdout.emit("data", "place");
      stderr.emit("data", "");
      proc.emit("close", 0);
      return;
    }
    proc.emit("close", 1);
  });
  return child;
};

function clock(songId = "cache-song"): ScoreClock {
  return {
    schema: SCORE_CLOCK_SCHEMA,
    song_id: songId,
    bpm: 75,
    time_signature: "3/4",
    sample_rate: 48000,
    total_seconds: 2,
    total_samples: 96000,
    last_event_end_sec: 2,
    clock: {
      source: "session-nominal",
      bed_measures: [1, 1],
      measure_starts_sec: { "1": 0 },
      measure_durations_sec: { "1": 2 },
    },
    midi: {
      file: "test.mid",
      ppq: 384,
      ticks_per_measure: 1152,
      melody_track: "melody",
      sec_per_tick: 0.002083333,
    },
    events: [{
      id: "v00",
      lyric: "A",
      word: "A",
      syllable: 0,
      syllables: 1,
      midi: 70,
      t_sec: 0.5,
      t_samples: 24000,
      dur_sec: 1,
      anchor: "test",
      midi_tick: 240,
      t_midi_sec: 0.5,
      engine_note: null,
    }],
  };
}

const ENV_KEYS = ["AI_JAM_HOME", "SOULX_ROOT", "SOULX_PYTHON", "SOULX_PROMPT_WAV", "SOULX_PROMPT_META"] as const;
let savedEnv: Record<string, string | undefined> = {};
let home = "";
let root = "";
let python = "";
let prompt = { wav: "", meta: "" };

function writePrompt(dir: string, base: string, ext: string, bytes?: Buffer): { wav: string; meta: string } {
  const wav = join(dir, `${base}_prompt${ext}`);
  const meta = join(dir, `${base}_prompt.json`);
  writeFileSync(wav, bytes ?? monoWav(16000, [16384, -16384]));
  writeFileSync(meta, JSON.stringify([{ duration: "1.0", phoneme: "AH" }]));
  return { wav, meta };
}

function leadConfig(extra: SoulxSingerConfig = {}): SoulxSingerConfig {
  return {
    soulxRoot: root,
    pythonExecutable: python,
    promptWav: prompt.wav,
    promptMeta: prompt.meta,
    takes: 1,
    ...extra,
  };
}

async function rejection(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(Error);
    return (err as Error).message;
  }
  throw new Error("expected rejection");
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  home = mkdtempSync(join(tmpdir(), "ajs-soulx-home-"));
  root = mkdtempSync(join(tmpdir(), "ajs-soulx-root-"));
  python = mkdtempSync(join(tmpdir(), "ajs-soulx-py-"));
  const promptDir = mkdtempSync(join(tmpdir(), "ajs-soulx-prompt-"));
  prompt = writePrompt(promptDir, "en", ".wav");
  process.env.AI_JAM_HOME = home;
  process.env.SOULX_ROOT = root;
  process.env.SOULX_PYTHON = python;
  delete process.env.SOULX_PROMPT_WAV;
  delete process.env.SOULX_PROMPT_META;
  py.mode = "ok";
  py.verifyCode = 0;
  py.calls = [];
  gate.rmThrows = false;
  audio.reset();
  setSharedAudioContext(null);
});

afterEach(() => {
  gate.rmThrows = false;
  setSharedAudioContext(null);
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  rmSync(home, { recursive: true, force: true });
});

describe("renderSoulxLead", () => {
  it("places one take, writes the cache wav, and deletes the take directory", async () => {
    const song = clock();
    const result = await renderSoulxLead(song, leadConfig(), { masterGain: 0.5 });
    expect(result.sampleRate).toBe(16000);
    expect(Array.from(result.pcm)).toEqual([0.5, -0.5]);
    expect(result.warnings).toEqual(["SoulX: single take (no bag-of-takes selection)."]);
    expect(result.tmpDir.length).toBeGreaterThan(0);

    const exportCall = py.calls[0];
    const take = py.calls.find((c) => scriptBase(c.args) === "soulx_take.py");
    const verify = py.calls.find((c) => scriptBase(c.args) === "vocal_clock.py" && c.args[1] === "verify");
    const repin = py.calls.find((c) => scriptBase(c.args) === "vocal_clock.py" && c.args[1] === "repin");
    const place = py.calls.find((c) => scriptBase(c.args) === "vocal_clock.py" && c.args[1] === "place");
    expect(exportCall.cmd).toBe(python);
    expect(exportCall.cwd).toBeUndefined();
    expect(exportCall.args[0]).toBe(join(resolve(), "scripts", "export_soulx_target.py"));
    expect(exportCall.args).toContain("--syllable-words");
    const clockPath = flag(exportCall.args, "--clock");
    expect(readFileSync(clockPath, "utf8")).toBe(JSON.stringify(song, null, 2) + "\n");
    const tmp = dirname(clockPath);
    expect(take?.cwd).toBe(root);
    expect(take?.pythonPath).toBe(root);
    expect(take?.args[0]).toBe(join(resolve(), "scripts", "soulx_take.py"));
    expect(flag(take!.args, "--out-dir")).toBe(join(tmp, "take-01"));
    expect(flag(take!.args, "--prompt-wav")).toBe(prompt.wav);
    expect(flag(take!.args, "--prompt-meta")).toBe(prompt.meta);
    expect(take!.args).not.toContain("--pitch-shift");
    expect(verify?.args[0]).toBe(join(resolve(), "scripts", "vocal_clock.py"));
    expect(repin?.args).toContain("--split-words");
    expect(repin?.args).toContain(
      `${join(tmp, "take-01", "take-48k.wav")}=${join(tmp, "take-01", "verify-energy.json")}`,
    );
    expect(place?.args).toContain("--local");
    expect(existsSync(join(tmp, "take-01"))).toBe(false);
    expect(existsSync(join(result.tmpDir, "placed", "placed.wav"))).toBe(true);

    const keys = readdirSync(soulxCacheDir());
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f]{16}$/);
    const cached = readFileSync(join(soulxCacheDir(), keys[0], "placed.wav"));
    expect(cached.toString("ascii", 0, 4)).toBe("RIFF");
    expect(cached.toString("ascii", 8, 12)).toBe("WAVE");
    expect(cached.readUInt16LE(22)).toBe(1);
    expect(cached.readUInt32LE(24)).toBe(16000);
    expect(cached.readUInt16LE(34)).toBe(16);
    expect(cached.readUInt32LE(40)).toBe(4);
    expect([cached.readInt16LE(44), cached.readInt16LE(46)]).toEqual([16383, -16384]);
  });

  it("serves the second call from cache and misses when the song id changes", async () => {
    const first = await renderSoulxLead(clock(), leadConfig(), { masterGain: 0.5 });
    const callsAfterFirst = py.calls.length;
    py.mode = "spawn-error";
    const second = await renderSoulxLead(clock(), leadConfig(), { masterGain: 0.5 });
    expect(py.calls.length).toBe(callsAfterFirst);
    expect(second.warnings).toEqual(["SoulX: served from cache."]);
    expect(second.sampleRate).toBe(16000);
    expect(second.tmpDir).toBe("");
    expect(Array.from(second.pcm)).toEqual([16383 / 32768, -0.5]);
    expect(Array.from(first.pcm)).toEqual([0.5, -0.5]);

    const message = await rejection(renderSoulxLead(clock("other-song"), leadConfig(), { masterGain: 0.5 }));
    expect(message).toBe("spawn ENOENT");
    expect(readdirSync(soulxCacheDir())).toHaveLength(1);
  });

  it("renders again when the cached wav cannot be read", async () => {
    await renderSoulxLead(clock(), leadConfig(), { masterGain: 0.5 });
    const key = readdirSync(soulxCacheDir())[0];
    const cached = join(soulxCacheDir(), key, "placed.wav");
    writeFileSync(cached, Buffer.from("xx"));
    const before = py.calls.length;
    const again = await renderSoulxLead(clock(), leadConfig(), { masterGain: 0.5 });
    expect(py.calls.length).toBeGreaterThan(before);
    expect(again.warnings).toEqual(["SoulX: single take (no bag-of-takes selection)."]);
    expect(readFileSync(cached).toString("ascii", 0, 4)).toBe("RIFF");
  });

  it("still returns pcm when the cache directory cannot be created", async () => {
    writeFileSync(join(home, "cache"), "not-a-directory");
    const result = await renderSoulxLead(clock(), leadConfig(), { masterGain: 0.5 });
    expect(Array.from(result.pcm)).toEqual([0.5, -0.5]);
    expect(result.warnings).toEqual(["SoulX: single take (no bag-of-takes selection)."]);
    expect(existsSync(join(home, "cache", "soulx"))).toBe(false);
  });

  it("keeps take directories when cleanup is false", async () => {
    const result = await renderSoulxLead(clock(), leadConfig({ cleanup: false }), { masterGain: 0.5 });
    const take = py.calls.find((c) => scriptBase(c.args) === "soulx_take.py");
    expect(existsSync(flag(take!.args, "--out-dir"))).toBe(true);
    expect(result.warnings).toEqual(["SoulX: single take (no bag-of-takes selection)."]);
  });

  it("keeps take directories when removing them throws", async () => {
    gate.rmThrows = true;
    const result = await renderSoulxLead(clock(), leadConfig(), { masterGain: 0.5 });
    const take = py.calls.find((c) => scriptBase(c.args) === "soulx_take.py");
    expect(existsSync(flag(take!.args, "--out-dir"))).toBe(true);
    expect(Array.from(result.pcm)).toEqual([0.5, -0.5]);
  });

  it("omits syllable flags for syllableWords false and still places after a bad verify", async () => {
    py.verifyCode = 9;
    const result = await renderSoulxLead(
      clock(),
      leadConfig({ syllableWords: false, pitchShift: 2, takes: 2 }),
      { masterGain: 0.5 },
    );
    const exportCall = py.calls[0];
    const takes = py.calls.filter((c) => scriptBase(c.args) === "soulx_take.py");
    const repin = py.calls.find((c) => c.args[1] === "repin");
    expect(exportCall.args).not.toContain("--syllable-words");
    expect(takes).toHaveLength(2);
    expect(takes[0].args).toContain("--pitch-shift");
    expect(takes[0].args[takes[0].args.indexOf("--pitch-shift") + 1]).toBe("2");
    expect(flag(takes[0].args, "--out-dir").endsWith("take-01")).toBe(true);
    expect(flag(takes[1].args, "--out-dir").endsWith("take-02")).toBe(true);
    expect(repin?.args).not.toContain("--split-words");
    expect(repin?.args.filter((_part, i, all) => all[i - 1] === "--candidate")).toHaveLength(2);
    expect(result.warnings).toEqual([]);
    expect(Array.from(result.pcm)).toEqual([0.5, -0.5]);
  });

  it("renders six takes when takes is omitted", async () => {
    const result = await renderSoulxLead(clock(), leadConfig({ takes: undefined }), { masterGain: 0.5 });
    const takes = py.calls.filter((c) => scriptBase(c.args) === "soulx_take.py");
    expect(takes).toHaveLength(6);
    expect(result.warnings).toEqual([]);
  });

  it("treats takes 0 as a single take", async () => {
    const result = await renderSoulxLead(clock(), leadConfig({ takes: 0 }), { masterGain: 0.5 });
    expect(py.calls.filter((c) => scriptBase(c.args) === "soulx_take.py")).toHaveLength(1);
    expect(result.warnings).toEqual(["SoulX: single take (no bag-of-takes selection)."]);
  });

  it("reports export stderr and, if that is empty, export stdout", async () => {
    py.mode = "export-stderr";
    expect(await rejection(renderSoulxLead(clock(), leadConfig()))).toBe(
      "export_soulx_target.py failed (exit 2): export broke",
    );
    py.mode = "export-stdout";
    py.calls = [];
    expect(await rejection(renderSoulxLead(clock(), leadConfig()))).toBe(
      "export_soulx_target.py failed (exit 2): export out",
    );
  });

  it("reports a failed take using stdout when stderr is empty", async () => {
    py.mode = "take-fail";
    expect(await rejection(renderSoulxLead(clock(), leadConfig()))).toBe(
      "soulx_take.py take 1 failed (exit 7): take stdout",
    );
  });

  it("reports the missing take wav path", async () => {
    py.mode = "missing-wav";
    const message = await rejection(renderSoulxLead(clock(), leadConfig()));
    const take = py.calls.find((c) => scriptBase(c.args) === "soulx_take.py");
    expect(message).toBe(`SoulX take 1 did not produce ${join(flag(take!.args, "--out-dir"), "take-48k.wav")}`);
  });

  it("reports a failed repin", async () => {
    py.mode = "repin-fail";
    expect(await rejection(renderSoulxLead(clock(), leadConfig()))).toBe(
      "vocal_clock.py repin failed (exit 3): repin broke",
    );
  });

  it("reports a failed place", async () => {
    py.mode = "place-fail";
    expect(await rejection(renderSoulxLead(clock(), leadConfig()))).toBe(
      "vocal_clock.py place failed (exit 4): place broke",
    );
  });

  it("reports a place plan that names a missing wav", async () => {
    py.mode = "place-missing";
    const message = await rejection(renderSoulxLead(clock(), leadConfig()));
    const place = py.calls.find((c) => c.args[1] === "place");
    const missing = join(flag(place!.args, "--out-dir"), "missing.wav");
    expect(message).toBe(`Place did not produce a WAV file (expected ${missing})`);
  });

  it("surfaces the 8-bit wav error from the placed file", async () => {
    py.mode = "bad-wav";
    expect(await rejection(renderSoulxLead(clock(), leadConfig()))).toBe(
      "Kokoro lock WAV must be 16-bit PCM (got 8)",
    );
  });

  it("rejects when the python process cannot be spawned", async () => {
    py.mode = "spawn-error";
    expect(await rejection(renderSoulxLead(clock(), leadConfig()))).toBe("spawn ENOENT");
  });

  it("names the example directory when discovery finds no prompt json", async () => {
    const exampleDir = join(root, "example", "audio");
    mkdirSync(exampleDir, { recursive: true });
    writeFileSync(join(exampleDir, "readme.txt"), "no prompt");
    const message = await rejection(renderSoulxLead(clock(), { soulxRoot: root, pythonExecutable: python, takes: 1 }));
    expect(message).toBe(
      "SoulX prompt WAV not found. Set SOULX_PROMPT_WAV to a 16-bit mono WAV/MP3, " +
        `pass promptWav in SoulxSingerConfig, or place an example prompt in ${exampleDir}.`,
    );
  });

  it("names the example directory when a prompt json has no audio", async () => {
    const exampleDir = join(root, "example", "audio");
    mkdirSync(exampleDir, { recursive: true });
    writeFileSync(join(exampleDir, "zh_prompt.json"), JSON.stringify([{ duration: "1.0", phoneme: "AH" }]));
    const message = await rejection(renderSoulxLead(clock(), { soulxRoot: root, pythonExecutable: python, takes: 1 }));
    expect(message).toBe(
      "SoulX prompt WAV not found. Set SOULX_PROMPT_WAV to a 16-bit mono WAV/MP3, " +
        `pass promptWav in SoulxSingerConfig, or place an example prompt in ${exampleDir}.`,
    );
  });

  it("prefers the english example prompt over another prompt pair", async () => {
    const exampleDir = join(root, "example", "audio");
    mkdirSync(exampleDir, { recursive: true });
    writePrompt(exampleDir, "zh", ".wav");
    const en = writePrompt(exampleDir, "en", ".wav");
    await renderSoulxLead(clock(), { soulxRoot: root, pythonExecutable: python, takes: 1 }, { masterGain: 0.5 });
    const take = py.calls.find((c) => scriptBase(c.args) === "soulx_take.py");
    expect(flag(take!.args, "--prompt-wav")).toBe(en.wav);
    expect(flag(take!.args, "--prompt-meta")).toBe(en.meta);
  });

  it("uses the only prompt json and an ogg clip when no english pair exists", async () => {
    const exampleDir = join(root, "example", "audio");
    mkdirSync(exampleDir, { recursive: true });
    const zh = writePrompt(exampleDir, "zh", ".ogg", Buffer.from("ogg-bytes"));
    await renderSoulxLead(clock(), { soulxRoot: root, pythonExecutable: python, takes: 1 }, { masterGain: 0.5 });
    const take = py.calls.find((c) => scriptBase(c.args) === "soulx_take.py");
    expect(flag(take!.args, "--prompt-wav")).toBe(zh.wav);
    expect(flag(take!.args, "--prompt-meta")).toBe(zh.meta);
  });

  it("rejects a prompt meta file that is not a SoulX segment", async () => {
    const meta = join(root, "bad.json");
    writeFileSync(meta, JSON.stringify({ duration: 1, phoneme: "AH" }));
    const message = await rejection(renderSoulxLead(clock(), leadConfig({ promptMeta: meta })));
    expect(message).toBe(
      `SoulX prompt metadata invalid (${meta}): prompt metadata is not a SoulX-format segment`,
    );
  });

  it("rejects a prompt meta file that is not json", async () => {
    const meta = join(root, "bad.json");
    writeFileSync(meta, "{");
    const message = await rejection(renderSoulxLead(clock(), leadConfig({ promptMeta: meta })));
    expect(message).toBe(
      `SoulX prompt metadata invalid (${meta}): Expected property name or '}' in JSON at position 1 (line 1 column 2)`,
    );
  });

  it("names the example directory when the metadata file is missing", async () => {
    const exampleDir = join(root, "example", "audio");
    const message = await rejection(renderSoulxLead(clock(), leadConfig({ promptMeta: join(root, "missing.json") })));
    expect(message).toBe(
      "SoulX prompt metadata JSON not found. Set SOULX_PROMPT_META, " +
        `pass promptMeta in SoulxSingerConfig, or place an example prompt in ${exampleDir}.`,
    );
  });
});

describe("createSoulxScoreSinger", () => {
  it("connects the placed pcm and stops an owned context", async () => {
    audio.reportedRate = 0;
    const singer = createSoulxScoreSinger(clock(), leadConfig(), { masterGain: 0.5 });
    expect(singer.durationSec).toBe(2.15);
    expect(singer.warnings).toEqual([]);
    singer.start();
    expect(audio.buffers).toEqual([]);
    await singer.connect();
    expect(singer.warnings).toEqual(["SoulX: single take (no bag-of-takes selection)."]);
    singer.start();
    expect(audio.ctorOpts).toEqual([{ sampleRate: 16000, latencyHint: "playback" }]);
    expect(audio.buffers[0].rate).toBe(16000);
    expect(audio.buffers[0].ch).toBe(1);
    expect(Array.from(audio.buffers[0].data)).toEqual([0.5, -0.5]);
    expect(audio.sources[0].sink).toBe(audio.gains[0]);
    expect(audio.gains[0].sink).toBe(getSharedAudioContext().destination);
    expect(audio.gains[0].gain.value).toBe(0.5);
    expect(audio.starts).toEqual([0]);
    await singer.stop();
    expect(audio.closes).toBe(1);
    expect(getSharedAudioContext()).toBe(null);
  });

  it("plays on a shared context and does not close it", async () => {
    const destination = { id: "shared-dest" };
    let copied = new Float32Array(0);
    const sources: Array<{ stopped: boolean; disconnected: boolean; sink: unknown }> = [];
    const gains: Array<{ gain: { value: number }; sink: unknown; disconnected: boolean }> = [];
    const shared = {
      sampleRate: 16000,
      destination,
      createBuffer(_ch: number, length: number, rate: number) {
        expect(rate).toBe(16000);
        copied = new Float32Array(length);
        return { getChannelData: () => copied };
      },
      createBufferSource() {
        const src = {
          buffer: null as unknown,
          sink: null as unknown,
          stopped: false,
          disconnected: false,
          connect(node: unknown) { src.sink = node; },
          start() { src.stopped = false; },
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
    const singer = createSoulxScoreSinger(clock(), leadConfig(), { masterGain: 0.5 });
    await singer.connect();
    singer.start();
    expect(audio.ctorOpts).toEqual([]);
    expect(Array.from(copied)).toEqual([0.5, -0.5]);
    expect(sources[0].sink).toBe(gains[0]);
    expect(gains[0].sink).toBe(destination);
    expect(gains[0].gain.value).toBe(0.5);
    await singer.stop();
    expect(sources[0].stopped).toBe(true);
    expect(sources[0].disconnected).toBe(true);
    expect(gains[0].disconnected).toBe(true);
    expect(getSharedAudioContext()).toBe(shared);
  });

  it("does not start a buffer when AudioContext is missing", async () => {
    audio.failImport = true;
    const singer = createSoulxScoreSinger(clock(), leadConfig(), { masterGain: 0.5 });
    await singer.connect();
    singer.start();
    expect(singer.warnings).toEqual(["SoulX: single take (no bag-of-takes selection)."]);
    expect(audio.buffers).toEqual([]);
    expect(audio.ctorOpts).toEqual([]);
  });

  it("swallows stop failures and clears the owned context", async () => {
    const singer = createSoulxScoreSinger(clock(), leadConfig(), { masterGain: 0.5 });
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
});
