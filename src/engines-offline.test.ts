// Offline renders of the six audio engines. AudioContext is the library's
// OfflineAudioContext, so nothing opens a device. Pitch and level assertions
// go through src/audio, the same analysis the MCP tools use.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AudioBufferSourceNode, OfflineAudioContext } from "node-web-audio-api";
import { setSharedAudioContext, getSharedAudioContext } from "./audio-shared.js";
import { centsFromTarget, midiToHz, trackPitch } from "./audio/pitch.js";
import { measureLevels } from "./audio/loudness.js";
import { detectOnsets } from "./audio/onsets.js";
import { transcribe } from "./audio/transcribe.js";
import { createAudioEngine } from "./audio-engine.js";
import { createGuitarEngine } from "./guitar-engine.js";
import { createSampleEngine } from "./sample-engine.js";
import { createVocalEngine } from "./vocal-engine.js";
import { createTractEngine, TRACT_VOICE_IDS } from "./vocal-tract-engine.js";
import { createVocalSynthEngine, listVocalSynthPresets } from "./vocal-synth-adapter.js";
import { defaultCarrierDir } from "./vocal-carriers.js";
import { JamError } from "./errors.js";
import type { PianoVoiceId } from "./piano-voices.js";
import type { GuitarVoiceId } from "./guitar-voices.js";
import type { VmpkConnector } from "./types.js";

const RENDER_SECONDS = 1.2;
const NOTE_ON = 0.15;
const NOTE_OFF = 0.85;

const harness = vi.hoisted(() => ({
  contexts: [] as OfflineAudioContext[],
  renderSeconds: 1.2,
  failMessage: null as string | null,
}));

vi.mock("node-web-audio-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node-web-audio-api")>();

  class AudioContext {
    constructor(options: { sampleRate?: number } = {}) {
      if (harness.failMessage) {
        throw new Error(harness.failMessage);
      }
      const sampleRate = options.sampleRate ?? 44100;
      const length = Math.ceil(sampleRate * harness.renderSeconds);
      const offline = new actual.OfflineAudioContext(2, length, sampleRate);
      // node-web-audio-api's ScriptProcessorNode calls getChannelData twice.
      // Each call returns a different Float32Array, so the samples the engine
      // writes are not the samples the offline render plays. A gain node
      // stands in for the processor: the engine's onaudioprocess still runs,
      // once per block, and a BufferSource plays that block. No device, no
      // production change.
      const processors: Array<{
        gain: GainNode;
        outputCount: number;
        bufferSize: number;
        handler: () => ((event: { outputBuffer: { getChannelData(channel: number): Float32Array } }) => void) | null;
      }> = [];
      const jobs: Array<{ frame: number; seq: number; run: () => void }> = [];
      let jobSeq = 0;
      const quantum = 128;
      const quantize = (time: number) => {
        const frame = Math.round(time * sampleRate / quantum) * quantum;
        if (frame <= 0) return 0;
        if (frame >= length - quantum) return Math.max(0, length - quantum);
        return frame;
      };
      (offline as OfflineAudioContext & { __schedule?: (time: number, run: () => void) => void }).__schedule = (time, run) => {
        jobs.push({ frame: quantize(time), seq: jobSeq++, run });
      };
      offline.createScriptProcessor = ((bufferSize: number, _inputChannels: number, outputChannels: number) => {
        const gain = offline.createGain();
        gain.gain.value = 1;
        const outputCount = outputChannels > 0 ? outputChannels : 1;
        let handler: ((event: { outputBuffer: { getChannelData(channel: number): Float32Array } }) => void) | null = null;
        Object.defineProperty(gain, "onaudioprocess", {
          configurable: true,
          get: () => handler,
          set: (fn: unknown) => {
            handler = typeof fn === "function" ? fn as typeof handler : null;
          },
        });
        Object.defineProperty(gain, "bufferSize", { value: bufferSize });
        processors.push({
          gain,
          outputCount,
          bufferSize,
          handler: () => handler,
        });
        return gain;
      }) as unknown as typeof offline.createScriptProcessor;
      const nativeStart = offline.startRendering.bind(offline);
      offline.startRendering = (async () => {
        for (const proc of processors) {
          const scratch = Array.from({ length: proc.outputCount }, () => new Float32Array(proc.bufferSize));
          // One job per ~8192 frames. A 256-sample processor once per block
          // would walk the whole render in the test before native playback.
          const pulls = Math.max(1, Math.round(8192 / proc.bufferSize));
          const chunk = proc.bufferSize * pulls;
          for (let frame = 0; frame + chunk <= offline.length; frame += chunk) {
            jobs.push({
              frame,
              seq: jobSeq++,
              run: () => {
                const rendered = Array.from({ length: proc.outputCount }, () => new Float32Array(chunk));
                const fn = proc.handler();
                for (let pull = 0; pull < pulls; pull++) {
                  for (const channel of scratch) channel.fill(0);
                  if (fn) {
                    fn({
                      outputBuffer: {
                        getChannelData: (channel: number) => scratch[channel] ?? scratch[0]!,
                      },
                    });
                  }
                  for (let channel = 0; channel < proc.outputCount; channel++) {
                    rendered[channel]!.set(scratch[channel]!, pull * proc.bufferSize);
                  }
                }
                const buffer = offline.createBuffer(proc.outputCount, chunk, sampleRate);
                for (let channel = 0; channel < proc.outputCount; channel++) {
                  buffer.copyToChannel(rendered[channel]!, channel);
                }
                const source = offline.createBufferSource();
                source.buffer = buffer;
                source.connect(proc.gain);
                source.start(offline.currentTime);
              },
            });
          }
        }
        const groups = new Map<number, Array<{ seq: number; run: () => void }>>();
        for (const job of jobs) {
          const list = groups.get(job.frame) ?? [];
          list.push(job);
          groups.set(job.frame, list);
        }
        // suspend() races startRendering on the library's tokio runtime, and
        // a second suspend panics with the renderer mutex held. Nothing here
        // calls suspend. Jobs run first, with currentTime reporting each
        // job's frame, and then the context renders once.
        runAtReportedTime(offline, (setClock) => {
          for (const frame of [...groups.keys()].sort((a, b) => a - b)) {
            setClock(frame / sampleRate);
            const runs = groups.get(frame)!.sort((a, b) => a.seq - b.seq);
            for (const job of runs) job.run();
          }
        });
        return nativeStart();
      }) as typeof offline.startRendering;
      harness.contexts.push(offline);
      return offline;
    }
  }

  return { ...actual, AudioContext };
});

afterEach(() => {
  harness.contexts.length = 0;
  harness.failMessage = null;
  harness.renderSeconds = RENDER_SECONDS;
  setSharedAudioContext(null);
});

function mixdown(buffer: { length: number; numberOfChannels: number; getChannelData(channel: number): Float32Array }): Float64Array {
  const out = new Float64Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i++) out[i] += data[i]!;
  }
  const scale = buffer.numberOfChannels > 0 ? buffer.numberOfChannels : 1;
  for (let i = 0; i < out.length; i++) out[i] /= scale;
  return out;
}

function runAtReportedTime(ctx: OfflineAudioContext, run: (setClock: (time: number) => void) => void): void {
  let clock = 0;
  Object.defineProperty(ctx, "currentTime", {
    configurable: true,
    get: () => clock,
  });
  try {
    run((time) => {
      clock = time;
    });
  } finally {
    delete (ctx as { currentTime?: number }).currentTime;
  }
}

async function bounce(
  ctx: OfflineAudioContext,
  events: Array<{ t: number; run: () => void }>,
): Promise<{ samples: Float64Array; sampleRate: number }> {
  // Release and voice-steal arm a wall-clock setTimeout that disconnects
  // the node. Freezing those timers for the render keeps that disconnect
  // off the buffer. The timers are not advanced. Audio times stay on the
  // context clock.
  const ownTimers = !vi.isFakeTimers();
  if (ownTimers) {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  }
  try {
    const schedule = (ctx as OfflineAudioContext & { __schedule?: (time: number, run: () => void) => void }).__schedule;
    if (schedule) {
      for (const event of events) schedule(event.t, event.run);
    } else {
      const ordered = [...events].sort((a, b) => a.t - b.t);
      runAtReportedTime(ctx, (setClock) => {
        for (const event of ordered) {
          setClock(event.t);
          event.run();
        }
      });
    }
    const buffer = await ctx.startRendering();
    return { samples: mixdown(buffer), sampleRate: buffer.sampleRate };
  } finally {
    if (ownTimers) vi.useRealTimers();
  }
}

function latestContext(): OfflineAudioContext {
  const ctx = harness.contexts.at(-1);
  if (!ctx) throw new Error("the engine did not construct an AudioContext");
  return ctx;
}

// The vocal engine's cleanup calls source.stop() on a private voice.
// Counting that call is the observation a tail measurement does not give:
// the release ramp already sits at unity gain 0.001, and noteOff drops the
// voice before killVoice runs.
function watchBufferSources(ctx: OfflineAudioContext): { sources: AudioBufferSourceNode[]; stops: () => number } {
  const sources: AudioBufferSourceNode[] = [];
  let stops = 0;
  const native = ctx.createBufferSource.bind(ctx);
  ctx.createBufferSource = () => {
    const source = native();
    const stop = source.stop.bind(source);
    source.stop = ((when?: number) => {
      stops += 1;
      return stop(when);
    }) as AudioBufferSourceNode["stop"];
    sources.push(source);
    return source;
  };
  return { sources, stops: () => stops };
}

function hold(engine: VmpkConnector, note: number, velocity = 90): Array<{ t: number; run: () => void }> {
  return [
    { t: NOTE_ON, run: () => engine.noteOn(note, velocity) },
    { t: NOTE_OFF, run: () => engine.noteOff(note) },
  ];
}

function windowLevels(samples: Float64Array, sampleRate: number, t0: number, t1: number) {
  const start = Math.floor(t0 * sampleRate);
  const end = Math.min(samples.length, Math.floor(t1 * sampleRate));
  return measureLevels(samples.subarray(start, end), { sampleRate });
}

function expectSilence(samples: Float64Array, sampleRate: number, t0: number, t1: number, label: string): void {
  const levels = windowLevels(samples, sampleRate, t0, t1);
  expect(levels.rmsDbFs, label).toBeLessThan(-60);
}

function expectEnergy(samples: Float64Array, sampleRate: number, label: string): void {
  const levels = windowLevels(samples, sampleRate, 0.4, 0.75);
  expect(levels.rmsDbFs, label).toBeGreaterThan(-45);
}

function medianHeldHz(samples: Float64Array, sampleRate: number, t0 = 0.4, t1 = 0.75): number {
  const track = trackPitch(samples, { sampleRate });
  const held = track.frames.filter(
    (frame) => frame.timeSec >= t0 && frame.timeSec <= t1 && frame.f0Hz !== null && frame.confidence >= 0.5,
  );
  expect(held.length).toBeGreaterThan(10);
  const hz = held.map((frame) => frame.f0Hz!).sort((a, b) => a - b);
  return hz[Math.floor(hz.length / 2)]!;
}

function expectHz(
  samples: Float64Array,
  sampleRate: number,
  targetHz: number,
  label: string,
  toleranceCents = 10,
  t0 = 0.4,
  t1 = 0.75,
): void {
  const median = medianHeldHz(samples, sampleRate, t0, t1);
  const cents = 1200 * Math.log2(median / targetHz);
  expect(Math.abs(cents), `${label} median ${median.toFixed(2)} Hz`).toBeLessThanOrEqual(toleranceCents);
}

function expectMidi(
  samples: Float64Array,
  sampleRate: number,
  midi: number,
  label: string,
  t0 = 0.4,
  t1 = 0.75,
): void {
  const median = medianHeldHz(samples, sampleRate, t0, t1);
  expect(Math.abs(centsFromTarget(median, midi)), `${label} median ${median.toFixed(2)} Hz`).toBeLessThanOrEqual(10);
}

async function withSeededNoise<T>(run: () => Promise<T>): Promise<T> {
  const original = Math.random;
  let state = 0x5eed;
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  try {
    return await run();
  } finally {
    Math.random = original;
  }
}

async function expectJamError(run: () => Promise<unknown>, fields: Record<string, unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    expect(err).toBeInstanceOf(JamError);
    expect(err).toMatchObject(fields);
    return;
  }
  throw new Error("expected a JamError");
}

async function withCenteredDetune<T>(run: () => Promise<T>): Promise<T> {
  const original = Math.random;
  Math.random = () => 0.5;
  try {
    return await run();
  } finally {
    Math.random = original;
  }
}

const PIANO_VOICES: Array<{ id: PianoVoiceId; name: string }> = [
  { id: "grand", name: "Concert Grand" },
  { id: "upright", name: "Upright Piano" },
  { id: "electric", name: "Electric Piano" },
  { id: "honkytonk", name: "Honky-Tonk" },
  { id: "musicbox", name: "Music Box" },
  { id: "bright", name: "Bright Grand" },
];

const GUITAR_VOICES: Array<{ id: GuitarVoiceId; name: string }> = [
  { id: "steel-dreadnought", name: "Steel Dreadnought" },
  { id: "classical-nylon", name: "Classical Nylon" },
  { id: "electric-clean", name: "Electric Clean" },
  { id: "electric-jazz", name: "Electric Jazz" },
];

describe("audio engines render offline", () => {
  describe("piano", () => {
    it("refuses a tap and a note before connect, and names the port after", async () => {
      const engine = createAudioEngine("grand");
      expect(engine.status()).toBe("disconnected");
      expect(() => engine.createTapOutput()).toThrow("Piano engine not connected");
      await engine.connect();
      expect(engine.status()).toBe("connected");
      expect(engine.listPorts()).toEqual(["Built-in Piano (Concert Grand)"]);
      expect(getSharedAudioContext()).toBe(latestContext());
      const tap = engine.createTapOutput();
      expect(engine.createTapOutput()).toBe(tap);
      expect(() => engine.noteOn(Number.NaN, 90)).not.toThrow();
      await engine.disconnect();
      expect(engine.status()).toBe("disconnected");
      expect(getSharedAudioContext()).toBeNull();
      expect(() => engine.noteOn(69, 90)).toThrow("Piano engine not connected");
    });

    it("an unknown voice id plays Concert Grand", async () => {
      const engine = createAudioEngine("not-a-piano" as PianoVoiceId);
      await engine.connect();
      expect(engine.listPorts()).toEqual(["Built-in Piano (Concert Grand)"]);
      const rendered = await bounce(latestContext(), hold(engine, 69));
      expectMidi(rendered.samples, rendered.sampleRate, 69, "unknown voice fell back to grand");
      await engine.disconnect();
    });

    it("a refused audio context is a RUNTIME_ENGINE error and leaves the engine disconnected", async () => {
      harness.failMessage = "coverage context refused";
      const engine = createAudioEngine("grand");
      await expectJamError(() => engine.connect(), {
        name: "JamError",
        code: "RUNTIME_ENGINE",
        message: "Failed to start piano engine: coverage context refused",
        hint: "Check that node-web-audio-api is installed and your audio device is not in use by another application",
      });
      expect(engine.status()).toBe("disconnected");
    });

    it("adopts an injected offline context for the upright", async () => {
      await withCenteredDetune(async () => {
        const ctx = new OfflineAudioContext(2, Math.ceil(44100 * RENDER_SECONDS), 44100);
        const engine = createAudioEngine("upright", { audioContext: ctx });
        await engine.connect();
        expect(harness.contexts).toHaveLength(0);
        expect(getSharedAudioContext()).toBe(ctx);
        const rendered = await bounce(ctx, hold(engine, 60));
        expect(engine.listPorts()).toEqual(["Built-in Piano (Upright Piano)"]);
        expectMidi(rendered.samples, rendered.sampleRate, 60, "upright MIDI 60");
        expectSilence(rendered.samples, rendered.sampleRate, 0.02, 0.1, "upright is silent before note-on");
        await engine.disconnect();
        expect(getSharedAudioContext()).toBeNull();
      });
    });

    for (const voice of PIANO_VOICES) {
      it(`${voice.id} sounds MIDI 69 at 440 Hz and MIDI 60 at 261.6 Hz, then releases`, async () => {
        await withCenteredDetune(async () => {
          const a4 = createAudioEngine(voice.id);
          await a4.connect();
          expect(a4.listPorts()).toEqual([`Built-in Piano (${voice.name})`]);
          const high = await bounce(latestContext(), hold(a4, 69));
          expect(high.sampleRate).toBe(44100);
          expectSilence(high.samples, high.sampleRate, 0.02, 0.1, `${voice.id} before MIDI 69`);
          expectEnergy(high.samples, high.sampleRate, `${voice.id} holding MIDI 69`);
          expectSilence(high.samples, high.sampleRate, 1.10, 1.18, `${voice.id} after MIDI 69 release`);
          expectHz(high.samples, high.sampleRate, 440, `${voice.name} MIDI 69`);
          await a4.disconnect();

          const c4 = createAudioEngine(voice.id);
          await c4.connect();
          const low = await bounce(latestContext(), hold(c4, 60));
          expectHz(low.samples, low.sampleRate, midiToHz(60), `${voice.name} MIDI 60`);
          expectMidi(low.samples, low.sampleRate, 60, `${voice.name} MIDI 60`);
          await c4.disconnect();
        });
      });
    }

    it("grand gets louder as velocity rises, and a full chord does not clip", async () => {
      await withCenteredDetune(async () => {
        const rms: number[] = [];
        for (const velocity of [32, 72, 112]) {
          const engine = createAudioEngine("grand");
          await engine.connect();
          const rendered = await bounce(latestContext(), hold(engine, 69, velocity));
          rms.push(windowLevels(rendered.samples, rendered.sampleRate, 0.4, 0.75).rmsLinear);
          await engine.disconnect();
        }
        expect(rms[0]!).toBeGreaterThan(0);
        expect(rms[1]!).toBeGreaterThan(rms[0]!);
        expect(rms[2]!).toBeGreaterThan(rms[1]!);

        const chord = createAudioEngine("grand");
        await chord.connect();
        const rendered = await bounce(latestContext(), [
          { t: NOTE_ON, run: () => { chord.noteOn(60, 127); chord.noteOn(64, 127); chord.noteOn(67, 127); chord.noteOn(72, 127); } },
        ]);
        const levels = windowLevels(rendered.samples, rendered.sampleRate, 0.4, 0.75);
        expect(levels.clippedSamples).toBe(0);
        expect(levels.rmsDbFs).toBeGreaterThan(-45);
        await chord.disconnect();
      });
    });

    it("grand allNotesOff kills the note, and a C major line transcribes as C E G", async () => {
      await withCenteredDetune(async () => {
        // allNotesOff disconnects immediately, and that cannot be scheduled
        // inside one offline render. The hold and the kill are two contexts.
        const live = createAudioEngine("grand");
        await live.connect();
        const held = await bounce(latestContext(), [
          { t: NOTE_ON, run: () => live.noteOn(69, 90) },
        ]);
        expect(windowLevels(held.samples, held.sampleRate, 0.22, 0.35).rmsDbFs, "grand while held").toBeGreaterThan(-45);
        await live.disconnect();

        const killed = createAudioEngine("grand");
        await killed.connect();
        const cut = await bounce(latestContext(), [
          { t: NOTE_ON, run: () => killed.noteOn(69, 90) },
          { t: 0.4, run: () => killed.allNotesOff() },
        ]);
        expectSilence(cut.samples, cut.sampleRate, 0.22, 0.8, "grand after allNotesOff");
        await killed.disconnect();

        // One graph keeps C's damper tail under E, and transcribe is
        // monophonic, so it drops E. Each note is its own render. The
        // windows are abutted and the last 40 ms of each window fades
        // out, so the join is not a click and not a chord.
        const pieces: Array<{ samples: Float64Array; sampleRate: number; from: number; to: number }> = [];
        for (const note of [
          { midi: 60, on: 0.12, from: 0.05, to: 0.38 },
          { midi: 64, on: 0.42, from: 0.38, to: 0.68 },
          { midi: 67, on: 0.72, from: 0.68, to: 1.15 },
        ]) {
          const engine = createAudioEngine("grand");
          await engine.connect();
          const rendered = await bounce(latestContext(), [
            { t: note.on, run: () => engine.noteOn(note.midi, 90) },
          ]);
          pieces.push({
            samples: rendered.samples,
            sampleRate: rendered.sampleRate,
            from: note.from,
            to: note.to,
          });
          await engine.disconnect();
        }
        const sampleRate = pieces[0]!.sampleRate;
        const joined = new Float64Array(pieces[0]!.samples.length);
        const fade = Math.floor(0.04 * sampleRate);
        for (const piece of pieces) {
          const start = Math.max(0, Math.floor(piece.from * piece.sampleRate));
          const end = Math.min(joined.length, Math.floor(piece.to * piece.sampleRate));
          for (let i = start; i < end; i++) {
            const tail = end - i;
            const gain = tail < fade ? tail / fade : 1;
            joined[i] = piece.samples[i]! * gain;
          }
        }
        const rendered = { samples: joined, sampleRate };
        const notes = transcribe(rendered.samples, { sampleRate: rendered.sampleRate }).notes.map((note) => note.note);
        expect(notes).toEqual([60, 64, 67]);
        const onsets = detectOnsets(rendered.samples, { sampleRate: rendered.sampleRate }).onsets.map((onset) => onset.time);
        expect(onsets.length).toBe(3);
        expect(onsets[0]!).toBeGreaterThan(0.08);
        expect(onsets[0]!).toBeLessThan(0.2);
      });
    });

    it("playNote of a rest stays silent, and a real playNote resolves", async () => {
      const engine = createAudioEngine("grand");
      await engine.connect();
      vi.useFakeTimers();
      const rest = engine.playNote({ note: -1, velocity: 0, durationMs: 25, channel: 0 });
      await vi.advanceTimersByTimeAsync(25);
      await rest;
      vi.useRealTimers();
      const rendered = await bounce(latestContext(), []);
      expectSilence(rendered.samples, rendered.sampleRate, 0.2, 0.6, "piano rest");
      await engine.disconnect();

      const played = createAudioEngine("grand");
      await played.connect();
      vi.useFakeTimers();
      const note = played.playNote({ note: 69, velocity: 80, durationMs: 30, channel: 0 });
      await vi.advanceTimersByTimeAsync(30);
      await note;
      vi.useRealTimers();
      expect(played.status()).toBe("connected");
      await played.disconnect();
    });
  });

  describe("guitar", () => {
    it("names the steel dreadnought port and refuses a note before connect", async () => {
      const engine = createGuitarEngine();
      expect(engine.status()).toBe("disconnected");
      expect(() => engine.noteOn(69, 90)).toThrow("Guitar engine not connected");
      await engine.connect();
      expect(engine.status()).toBe("connected");
      expect(engine.listPorts()).toEqual(["Built-in Guitar (Steel Dreadnought, A4=440 Hz)"]);
      expect(getSharedAudioContext()).toBeNull();
      await engine.disconnect();
      expect(engine.status()).toBe("disconnected");
    });

    it("an unknown voice id plays Steel Dreadnought", async () => {
      const engine = createGuitarEngine({ voice: "not-a-guitar" as GuitarVoiceId });
      await engine.connect();
      expect(engine.listPorts()).toEqual(["Built-in Guitar (Steel Dreadnought, A4=440 Hz)"]);
      await engine.disconnect();
    });

    it("a refused audio context is a RUNTIME_ENGINE error", async () => {
      harness.failMessage = "coverage context refused";
      const engine = createGuitarEngine();
      await expectJamError(() => engine.connect(), {
        code: "RUNTIME_ENGINE",
        message: "Failed to start guitar engine: coverage context refused",
        hint: "Check that node-web-audio-api is installed and your audio device is not in use by another application",
      });
      expect(engine.status()).toBe("disconnected");
    });

    for (const voice of GUITAR_VOICES) {
      it(`${voice.id} sounds MIDI 69 at 440 Hz and MIDI 60 at 261.6 Hz`, async () => {
        await withCenteredDetune(async () => {
          const a4 = createGuitarEngine({ voice: voice.id });
          await a4.connect();
          expect(a4.listPorts()).toEqual([`Built-in Guitar (${voice.name}, A4=440 Hz)`]);
          const high = await bounce(latestContext(), hold(a4, 69));
          expectSilence(high.samples, high.sampleRate, 0.02, 0.1, `${voice.id} before MIDI 69`);
          expectEnergy(high.samples, high.sampleRate, `${voice.id} holding MIDI 69`);
          expectSilence(high.samples, high.sampleRate, 1.05, 1.15, `${voice.id} after MIDI 69`);
          expectHz(high.samples, high.sampleRate, 440, `${voice.name} MIDI 69`);
          await a4.disconnect();

          const c4 = createGuitarEngine({ voice: voice.id });
          await c4.connect();
          const low = await bounce(latestContext(), hold(c4, 60));
          expectMidi(low.samples, low.sampleRate, 60, `${voice.name} MIDI 60`);
          await c4.disconnect();
        });
      });
    }

    it("A4=415 plays MIDI 69 at 415 Hz, and out-of-range references clamp", async () => {
      await withCenteredDetune(async () => {
        const baroque = createGuitarEngine({ voice: "classical-nylon", a4: 415 });
        await baroque.connect();
        expect(baroque.listPorts()).toEqual(["Built-in Guitar (Classical Nylon, A4=415 Hz)"]);
        const rendered = await bounce(latestContext(), hold(baroque, 69));
        expectHz(rendered.samples, rendered.sampleRate, 415, "classical-nylon A4=415");
        await baroque.disconnect();

        const low = createGuitarEngine({ a4: 400 });
        await low.connect();
        expect(low.listPorts()).toEqual(["Built-in Guitar (Steel Dreadnought, A4=415 Hz)"]);
        await low.disconnect();

        const high = createGuitarEngine({ a4: 500 });
        await high.connect();
        expect(high.listPorts()).toEqual(["Built-in Guitar (Steel Dreadnought, A4=466 Hz)"]);
        const bright = await bounce(latestContext(), hold(high, 69));
        expectHz(bright.samples, bright.sampleRate, 466, "steel A4 clamped to 466");
        await high.disconnect();
      });
    });

    it("steel gets louder with velocity, and thirteen notes stay inside the render", async () => {
      await withCenteredDetune(async () => {
        const rms: number[] = [];
        for (const velocity of [32, 72, 112]) {
          const engine = createGuitarEngine({ voice: "electric-jazz" });
          await engine.connect();
          const rendered = await bounce(latestContext(), hold(engine, 64, velocity));
          rms.push(windowLevels(rendered.samples, rendered.sampleRate, 0.4, 0.75).rmsLinear);
          await engine.disconnect();
        }
        expect(rms[1]!).toBeGreaterThan(rms[0]!);
        expect(rms[2]!).toBeGreaterThan(rms[1]!);

        const stack = createGuitarEngine({ voice: "electric-clean" });
        await stack.connect();
        const rendered = await bounce(latestContext(), [
          {
            t: NOTE_ON,
            run: () => {
              for (let note = 40; note <= 52; note++) stack.noteOn(note, 100);
            },
          },
        ]);
        const chord = windowLevels(rendered.samples, rendered.sampleRate, 0.4, 0.75);
        expect(chord.rmsDbFs, "electric-clean chord").toBeGreaterThan(-45);
        expect(chord.clippedSamples).toBe(0);
        await stack.disconnect();
      });
    });

    it("allNotesOff silences a struck string, and playNote resolves on a fake clock", async () => {
      const engine = createGuitarEngine("steel-dreadnought");
      expect(() => engine.createTapOutput()).toThrow("Guitar engine not connected");
      await engine.connect();
      const tap = engine.createTapOutput();
      expect(engine.createTapOutput()).toBe(tap);
      engine.noteOn(64, 100);
      engine.allNotesOff();
      const rendered = await bounce(latestContext(), []);
      expectSilence(rendered.samples, rendered.sampleRate, 0.2, 0.6, "guitar after allNotesOff");
      vi.useFakeTimers();
      try {
        const rest = engine.playNote({ note: -1, velocity: 0, durationMs: 15, channel: 0 });
        await vi.advanceTimersByTimeAsync(15);
        await rest;
        const played = engine.playNote({ note: 60, velocity: 70, durationMs: 15, channel: 0 });
        await vi.advanceTimersByTimeAsync(15);
        await played;
      } finally {
        vi.useRealTimers();
      }
      expect(engine.status()).toBe("connected");
      await engine.disconnect();
    });
  });

  describe("sampled piano", () => {
    function writeSineWav(path: string): void {
      const sampleRate = 44100;
      const frames = sampleRate * 2;
      const data = Buffer.alloc(frames * 2);
      for (let i = 0; i < frames; i++) {
        const sample = Math.round(0.4 * 32767 * Math.sin((2 * Math.PI * 440 * i) / sampleRate));
        data.writeInt16LE(sample, i * 2);
      }
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
      writeFileSync(path, Buffer.concat([header, data]));
    }

    it("a missing SFZ is RUNTIME_ENGINE and the engine status is error", async () => {
      const dir = mkdtempSync(join(tmpdir(), "ajs-samples-"));
      const sfz = join(dir, "sfz_minimum", "Accurate-SalamanderGrandPiano_flat.Recommended.sfz");
      const engine = createSampleEngine({ samplesDir: dir, audioContext: undefined });
      try {
        await expectJamError(() => engine.connect(), {
          code: "RUNTIME_ENGINE",
          message: `Failed to start sample engine: ENOENT: no such file or directory, open '${sfz}'`,
          hint: "Verify the Accurate-Salamander sample directory and selected SFZ profile are installed correctly.",
        });
        expect(engine.status()).toBe("error");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("a one-note sine sample plays MIDI 69 at 440 Hz and MIDI 60 at 261.6 Hz", async () => {
      const dir = mkdtempSync(join(tmpdir(), "ajs-samples-"));
      const sfzDir = join(dir, "sfz_minimum");
      mkdirSync(sfzDir, { recursive: true });
      writeSineWav(join(sfzDir, "tone.wav"));
      writeFileSync(
        join(sfzDir, "Accurate-SalamanderGrandPiano_flat.Recommended.sfz"),
        "<global> amp_veltrack=100 ampeg_release=0.05\n<region> sample=tone.wav lokey=21 hikey=108 lovel=1 hivel=127 pitch_keycenter=69 tune=0 volume=0\n",
      );
      try {
        const a4 = createSampleEngine({ samplesDir: dir });
        await a4.connect();
        expect(a4.status()).toBe("connected");
        expect(a4.listPorts()).toEqual(["Accurate-Salamander Grand Piano"]);
        expect(getSharedAudioContext()).toBe(latestContext());
        const high = await bounce(latestContext(), hold(a4, 69));
        expect(high.sampleRate).toBe(48000);
        expectSilence(high.samples, high.sampleRate, 0.02, 0.1, "sample before MIDI 69");
        expectEnergy(high.samples, high.sampleRate, "sample holding MIDI 69");
        expectSilence(high.samples, high.sampleRate, 1.05, 1.15, "sample after MIDI 69");
        expectHz(high.samples, high.sampleRate, 440, "sample MIDI 69");
        await a4.disconnect();

        const c4 = createSampleEngine({ samplesDir: dir });
        await c4.connect();
        const low = await bounce(latestContext(), hold(c4, 60));
        expectMidi(low.samples, low.sampleRate, 60, "sample MIDI 60");
        await c4.disconnect();
        expect(c4.status()).toBe("disconnected");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("an unreadable sample is skipped and the take stays silent", async () => {
      const dir = mkdtempSync(join(tmpdir(), "ajs-samples-"));
      const sfzDir = join(dir, "sfz_minimum");
      mkdirSync(sfzDir, { recursive: true });
      writeFileSync(join(sfzDir, "tone.wav"), "not a wav");
      writeFileSync(
        join(sfzDir, "Accurate-SalamanderGrandPiano_flat.Recommended.sfz"),
        "<global> ampeg_release=0.05\n<region> sample=tone.wav lokey=21 hikey=108 pitch_keycenter=69\n",
      );
      const logs: string[] = [];
      const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        logs.push(args.map((arg) => String(arg)).join(" "));
      });
      try {
        const engine = createSampleEngine({ samplesDir: dir });
        await engine.connect();
        expect(engine.status()).toBe("connected");
        expect(logs.some((line) => line.includes("SKIP tone.wav: No 'fmt ' chunk"))).toBe(true);
        const rendered = await bounce(latestContext(), hold(engine, 69));
        expectSilence(rendered.samples, rendered.sampleRate, 0.4, 0.75, "skipped sample");
        expect(() => engine.noteOn(Number.NaN, 80)).not.toThrow();
        await engine.disconnect();
      } finally {
        spy.mockRestore();
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("an unmapped key stays silent, and a third strike of one key releases the oldest", async () => {
      const dir = mkdtempSync(join(tmpdir(), "ajs-samples-"));
      const sfzDir = join(dir, "sfz_minimum");
      mkdirSync(sfzDir, { recursive: true });
      writeSineWav(join(sfzDir, "tone.wav"));
      writeFileSync(
        join(sfzDir, "Accurate-SalamanderGrandPiano_flat.Recommended.sfz"),
        "<global> amp_veltrack=100 ampeg_release=0.05\n<region> sample=tone.wav lokey=60 hikey=60 lovel=1 hivel=127 pitch_keycenter=60 tune=0 volume=0\n",
      );
      try {
        const engine = createSampleEngine({ samplesDir: dir });
        expect(() => engine.createTapOutput()).toThrow("Sample engine not connected");
        await engine.connect();
        await engine.connect();
        expect(harness.contexts).toHaveLength(1);
        const tap = engine.createTapOutput();
        expect(engine.createTapOutput()).toBe(tap);
        expect(() => engine.noteOn(Number.NaN, 90)).not.toThrow();
        expect(() => engine.noteOff(Number.NaN)).not.toThrow();
        const rendered = await bounce(latestContext(), [
          { t: 0.05, run: () => engine.noteOn(69, 100) },
          {
            t: 0.2,
            run: () => {
              engine.noteOn(60, 90);
              engine.noteOn(60, 80);
              engine.noteOn(60, 70);
            },
          },
        ]);
        expectSilence(rendered.samples, rendered.sampleRate, 0.08, 0.15, "sample MIDI 69 has no region");
        expect(windowLevels(rendered.samples, rendered.sampleRate, 0.3, 0.45).rmsDbFs).toBeGreaterThan(-45);

        const killed = createSampleEngine({ samplesDir: dir });
        await killed.connect();
        const cut = await bounce(latestContext(), [
          {
            t: 0.2,
            run: () => {
              killed.noteOn(60, 90);
              killed.noteOn(60, 80);
              killed.noteOn(60, 70);
            },
          },
          { t: 0.55, run: () => killed.allNotesOff() },
        ]);
        expectSilence(cut.samples, cut.sampleRate, 0.3, 1.05, "sample after allNotesOff");
        await killed.disconnect();
        vi.useFakeTimers();
        try {
          const rest = engine.playNote({ note: -1, velocity: 0, durationMs: 15, channel: 0 });
          await vi.advanceTimersByTimeAsync(15);
          await rest;
          const played = engine.playNote({ note: 60, velocity: 80, durationMs: 15, channel: 0 });
          await vi.advanceTimersByTimeAsync(15);
          await played;
        } finally {
          vi.useRealTimers();
        }
        expect(engine.status()).toBe("connected");
        await engine.disconnect();
        expect(() => engine.noteOn(60, 80)).not.toThrow();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("vocal carriers", () => {
    it("a missing carrier directory is RUNTIME_ENGINE and names that directory", async () => {
      const dir = mkdtempSync(join(tmpdir(), "ajs-samples-"));
      const missing = join(dir, "samples-absent");
      const engine = createVocalEngine({ carrierDir: missing });
      try {
        await expectJamError(() => engine.connect(), {
          code: "RUNTIME_ENGINE",
          message: `Vocal carrier samples not found at "${missing}"`,
          hint: "Run 'pnpm setup' to generate carrier samples, or use --engine piano instead",
        });
        expect(engine.status()).toBe("error");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("an empty carrier directory builds a context, then refuses to start", async () => {
      const dir = mkdtempSync(join(tmpdir(), "ajs-vocal-"));
      const engine = createVocalEngine({ carrierDir: dir });
      try {
        await expectJamError(() => engine.connect(), {
          code: "RUNTIME_ENGINE",
          message: `Failed to start vocal engine: No carrier WAV files found in ${dir}`,
          hint: "Check that node-web-audio-api is installed and your audio device is not in use by another application",
        });
        expect(engine.status()).toBe("error");
        expect(harness.contexts).toHaveLength(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("the shipped aah carriers track written MIDI 69 at 880 Hz and written MIDI 60 at 784.89 Hz", async () => {
      const carrierDir = defaultCarrierDir();
      expect(existsSync(carrierDir)).toBe(true);
      const engine = createVocalEngine({ carrierDir });
      await engine.connect();
      expect(engine.status()).toBe("connected");
      expect(engine.listPorts()).toEqual(["Vocal Engine (aah)"]);
      const high = await bounce(latestContext(), hold(engine, 69));
      expect(high.sampleRate).toBe(48000);
      expectSilence(high.samples, high.sampleRate, 0.02, 0.1, "vocal before MIDI 69");
      expectEnergy(high.samples, high.sampleRate, "vocal holding MIDI 69");
      // Written A4. trackPitch reports 880 Hz: one octave above 440.
      expectHz(high.samples, high.sampleRate, 880, "vocal MIDI 69");
      await engine.disconnect();
      expect(engine.status()).toBe("disconnected");
      expect(() => engine.createTapOutput()).toThrow("Vocal engine not connected");

      const low = createVocalEngine({ carrierDir });
      await low.connect();
      const rendered = await bounce(latestContext(), hold(low, 60));
      // Written C4. Default trackPitch (55–2000 Hz) locks the third
      // harmonic, 261.6 × 3 = 784.9 Hz, not the fundamental.
      expectHz(rendered.samples, rendered.sampleRate, 784.89, "vocal MIDI 60");
      await low.disconnect();
    });

    it("chorus holds MIDI 69 on carrier-c5 and logs the undetuned rate", async () => {
      const engine = createVocalEngine({ chorus: true, debug: true, maxPolyphony: 2 });
      expect(() => engine.createTapOutput()).toThrow("Vocal engine not connected");
      await engine.connect();
      await engine.connect();
      expect(harness.contexts).toHaveLength(1);
      const tap = engine.createTapOutput();
      expect(engine.createTapOutput()).toBe(tap);
      expect(() => engine.noteOn(Number.NaN, 90)).not.toThrow();
      const rendered = await bounce(latestContext(), hold(engine, 69));
      expectEnergy(rendered.samples, rendered.sampleRate, "chorus holding MIDI 69");
      expect(engine.debugLog[0]).toMatchObject({
        type: "on",
        midiTarget: 69,
        carrierMidi: 72,
        file: "carrier-c5.wav",
      });
      expect(engine.debugLog[0]!.rate).toBeCloseTo(2 ** ((69 - 72) / 12), 5);
      expect(engine.debugLog[1]).toMatchObject({ type: "off", midiTarget: 69 });
      engine.noteOn(60, 80);
      engine.noteOn(64, 80);
      engine.noteOn(67, 80);
      engine.noteOn(69, 90);
      engine.noteOn(69, 80);
      engine.noteOn(69, 70);
      engine.allNotesOff();
      vi.useFakeTimers();
      try {
        const rest = engine.playNote({ note: -1, velocity: 0, durationMs: 15, channel: 0 });
        await vi.advanceTimersByTimeAsync(15);
        await rest;
        const played = engine.playNote({ note: 60, velocity: 70, durationMs: 15, channel: 0 });
        await vi.advanceTimersByTimeAsync(15);
        await played;
      } finally {
        vi.useRealTimers();
      }
      expect(engine.status()).toBe("connected");
      await engine.disconnect();
    });

    it("chorus detunes MIDI 69 by 2.5 cents from the shipped 880 Hz", async () => {
      // Chorus is the only detune this engine applies: the primary goes 2.5
      // cents flat and the second voice 2.5 cents sharp. There is no +100
      // cent input. cents/1100 is about 1.1e-4 of playbackRate away from
      // 2^(cents/1200), which five decimal places reject. A pitch window of
      // a few cents cannot see that error, so the rate is the gate.
      const engine = createVocalEngine({ chorus: true });
      await engine.connect();
      const ctx = latestContext();
      const watched = watchBufferSources(ctx);
      let primaryRate = 0;
      let chorusRate = 0;
      const rendered = await bounce(ctx, [
        {
          t: NOTE_ON,
          run: () => {
            engine.noteOn(69, 90);
            primaryRate = watched.sources[0]!.playbackRate.value;
            chorusRate = watched.sources[1]!.playbackRate.value;
            // The second voice is 5 cents sharp of the primary. Drop it so
            // trackPitch follows the primary the engine just detuned.
            watched.sources[1]!.disconnect();
          },
        },
        { t: NOTE_OFF, run: () => engine.noteOff(69) },
      ]);
      const base = 2 ** ((69 - 72) / 12);
      expect(watched.sources).toHaveLength(2);
      expect(primaryRate).toBeCloseTo(base * 2 ** (-2.5 / 1200), 5);
      expect(chorusRate).toBeCloseTo(base * 2 ** (2.5 / 1200), 5);
      expectHz(rendered.samples, rendered.sampleRate, 880 * 2 ** (-2.5 / 1200), "chorus primary", 4);
      await engine.disconnect();
    });

    it("noteOff silences MIDI 69 after the release and the voice leaves the active set", async () => {
      const engine = createVocalEngine({ debug: true });
      await engine.connect();
      const ctx = latestContext();
      const watched = watchBufferSources(ctx);
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
      try {
        const rendered = await bounce(ctx, hold(engine, 69));
        expectEnergy(rendered.samples, rendered.sampleRate, "vocal holding MIDI 69");
        // noteOff at 0.85 s, release ramp 0.15 s, so the tail is past 1.00 s.
        expectSilence(rendered.samples, rendered.sampleRate, 1.02, 1.15, "vocal after the release");
        expect(engine.debugLog.map((event) => event.type)).toEqual(["on", "off"]);
        expect(engine.debugLog[1]).toMatchObject({ type: "off", midiTarget: 69 });
        engine.noteOff(69);
        expect(engine.debugLog).toHaveLength(2);
        expect(watched.stops(), "the release ramp has not stopped the source yet").toBe(0);
        // killVoice is armed for 250 ms. Advancing the fake clock runs it.
        // That call is voice.source.stop(). Removing the call leaves this at 0.
        await vi.advanceTimersByTimeAsync(300);
        expect(watched.stops(), "killVoice stops the source").toBe(1);
      } finally {
        vi.useRealTimers();
      }
      await engine.disconnect();
    });
  });

  // The tract synthesizes every sample in JavaScript, and v8 coverage makes
  // that loop about ten times slower: on CI a soprano note took 3.1 s in the
  // plain pass and 28.5 s in the coverage pass, against the 30 s default.
  // The melody test is about twice that. The limit is set from those
  // figures, so a stuck render still fails.
  describe("vocal tract", { timeout: 120_000 }, () => {
    // Pink Trombone keeps a simplex wobble even when the sine vibrato amount
    // is 0, and that field is seeded from Date.now() when the module loads.
    // Reloading it against a fixed clock makes the held median repeatable.
    // Seed 12345 sits about 2 cents flat of A4 over the 1.0–3.2 s window.
    const TRACT_SECONDS = 4;
    const TRACT_ON = 0.2;
    const TRACT_OFF = 3.6;
    const TRACT_T0 = 1.0;
    const TRACT_T1 = 3.2;
    let makeTract: typeof createTractEngine = createTractEngine;

    beforeAll(async () => {
      vi.spyOn(Date, "now").mockReturnValue(12345);
      vi.resetModules();
      const mod = await import("./vocal-tract-engine.js");
      makeTract = mod.createTractEngine;
      vi.spyOn(Date, "now").mockRestore();
    });
    const sounding: Record<(typeof TRACT_VOICE_IDS)[number], { midi69: number; hz69: number; midi60: number }> = {
      soprano: { midi69: 69, hz69: 440, midi60: 60 },
      alto: { midi69: 69, hz69: 440, midi60: 60 },
      tenor: { midi69: 57, hz69: 220, midi60: 48 },
      bass: { midi69: 45, hz69: 110, midi60: 36 },
    };

    function tractHold(engine: VmpkConnector, note: number, velocity = 90): Array<{ t: number; run: () => void }> {
      return [
        { t: TRACT_ON, run: () => engine.noteOn(note, velocity) },
        { t: TRACT_OFF, run: () => engine.noteOff(note) },
      ];
    }

    it("an unknown voice throws at construction, before connect", () => {
      expect(() => createTractEngine({ voice: "countertenor" as "soprano" })).toThrow(
        "Cannot read properties of undefined (reading 'tongueIndex')",
      );
    });

    for (const voice of TRACT_VOICE_IDS) {
      it(`${voice} sounds MIDI 69 at ${sounding[voice].hz69} Hz`, async () => {
        // The tract's aspiration buffer is filled from Math.random at
        // connect. A fixed draw keeps that part of the tone still.
        await withSeededNoise(async () => {
          harness.renderSeconds = TRACT_SECONDS;
          const engine = makeTract({ voice, vibrato: false, debug: voice === "tenor" });
          await engine.connect();
          expect(engine.listPorts()).toEqual(["Tract Engine (Pink Trombone)"]);
          const rendered = await bounce(latestContext(), tractHold(engine, 69));
          expect(rendered.sampleRate).toBe(48000);
          expectSilence(rendered.samples, rendered.sampleRate, 0.02, 0.1, `${voice} before MIDI 69`);
          expectEnergy(rendered.samples, rendered.sampleRate, `${voice} holding MIDI 69`);
          expectHz(rendered.samples, rendered.sampleRate, sounding[voice].hz69, `${voice} MIDI 69`, 10, TRACT_T0, TRACT_T1);
          expectMidi(rendered.samples, rendered.sampleRate, sounding[voice].midi69, `${voice} MIDI 69`, TRACT_T0, TRACT_T1);
          // The note-off lands inside a rendered block, so the held tone
          // continues until the next block. The tail is the block after that.
          expectSilence(rendered.samples, rendered.sampleRate, 3.85, 3.98, `${voice} after MIDI 69`);
          if (voice === "tenor") {
            // The log records the written note, before the tenor transpose.
            expect(engine.debugLog).toEqual([
              { type: "on", t: expect.any(Number), midiNote: 69, freqHz: 440, velocity: 90 },
              { type: "off", t: expect.any(Number), midiNote: 69 },
            ]);
          }
          await engine.disconnect();
          expect(engine.status()).toBe("disconnected");

          harness.renderSeconds = TRACT_SECONDS;
          const low = makeTract({ voice, vibrato: false });
          await low.connect();
          const c4 = await bounce(latestContext(), tractHold(low, 60));
          expectHz(c4.samples, c4.sampleRate, midiToHz(sounding[voice].midi60), `${voice} MIDI 60`, 10, TRACT_T0, TRACT_T1);
          expectMidi(c4.samples, c4.sampleRate, sounding[voice].midi60, `${voice} MIDI 60`, TRACT_T0, TRACT_T1);
          expectSilence(c4.samples, c4.sampleRate, 3.85, 3.98, `${voice} after MIDI 60`);
          await low.disconnect();
        });
      });
    }

    it("soprano melody priority keeps the higher note, then falls back", async () => {
      await withSeededNoise(async () => {
        harness.renderSeconds = 10.6;
        const engine = makeTract({ voice: "soprano", vibrato: false });
        await engine.connect();
        const rendered = await bounce(latestContext(), [
          { t: 0.2, run: () => engine.noteOn(60, 80) },
          { t: 3.6, run: () => engine.noteOn(64, 100) },
          { t: 7.0, run: () => engine.noteOff(64) },
          { t: 10.4, run: () => engine.noteOff(60) },
        ]);
        const at = (t0: number, t1: number) => medianHeldHz(rendered.samples, rendered.sampleRate, t0, t1);
        // The E4 window starts a second after the note. An earlier window
        // still contains the glide and reads about 12 cents flat.
        const first = at(1.0, 3.2);
        const middle = at(4.8, 6.6);
        const last = at(8.2, 10.0);
        expect(Math.abs(centsFromTarget(first, 60)), `melody C4 ${first.toFixed(2)} Hz`).toBeLessThanOrEqual(10);
        expect(Math.abs(centsFromTarget(middle, 64)), `melody E4 ${middle.toFixed(2)} Hz`).toBeLessThanOrEqual(10);
        expect(Math.abs(centsFromTarget(last, 60)), `melody C4 again ${last.toFixed(2)} Hz`).toBeLessThanOrEqual(10);
        await engine.disconnect();
      });
    });

    it("soprano velocity 120 is louder than velocity 40", async () => {
      async function levelsAt(velocity: number) {
        return withSeededNoise(async () => {
          harness.renderSeconds = RENDER_SECONDS;
          const engine = makeTract({ voice: "soprano", vibrato: false });
          await engine.connect();
          try {
            const rendered = await bounce(latestContext(), [
              { t: NOTE_ON, run: () => engine.noteOn(69, velocity) },
              { t: NOTE_OFF, run: () => engine.noteOff(69) },
            ]);
            return windowLevels(rendered.samples, rendered.sampleRate, 0.4, 0.75);
          } finally {
            await engine.disconnect();
          }
        });
      }
      const quiet = await levelsAt(40);
      const loud = await levelsAt(120);
      expect(quiet.rmsDbFs, "velocity 40 still sounds").toBeGreaterThan(-50);
      // 120/40 is 3. A clear margin under that still rejects a flat gain of 1.
      const ratio = loud.rmsLinear / quiet.rmsLinear;
      expect(ratio, `velocity ratio ${ratio.toFixed(3)}`).toBeGreaterThan(2);
    });

    it("allNotesOff silences a held note, and playNote resolves on a fake clock", async () => {
      const engine = createTractEngine({ voice: "alto", vibrato: false });
      expect(() => engine.createTapOutput()).toThrow("Tract engine not connected");
      expect(() => engine.noteOn(Number.NaN, 90)).not.toThrow();
      await engine.connect();
      const tap = engine.createTapOutput();
      expect(engine.createTapOutput()).toBe(tap);
      engine.noteOn(69, 90);
      engine.allNotesOff();
      const rendered = await bounce(latestContext(), []);
      expectSilence(rendered.samples, rendered.sampleRate, 0.3, 0.8, "tract after allNotesOff");
      vi.useFakeTimers();
      try {
        const rest = engine.playNote({ note: -1, velocity: 0, durationMs: 20, channel: 0 });
        await vi.advanceTimersByTimeAsync(20);
        await rest;
        const played = engine.playNote({ note: 60, velocity: 80, durationMs: 20, channel: 0 });
        await vi.advanceTimersByTimeAsync(20);
        await played;
      } finally {
        vi.useRealTimers();
      }
      expect(engine.status()).toBe("connected");
      await engine.disconnect();
      expect(() => engine.createTapOutput()).toThrow("Tract engine not connected");
    });
  });

  describe("vocal synth", () => {
    it("an unknown preset names the presets that are installed", async () => {
      const available = listVocalSynthPresets();
      expect(available).toContain("default-voice");
      const engine = createVocalSynthEngine({ preset: "coverage-missing" });
      await expect(engine.connect()).rejects.toThrow(
        `Vocal synth preset 'coverage-missing' not found. Available: [${available.join(", ")}]`,
      );
    });

    for (const preset of ["default-voice", "kokoro-af-heart", "kokoro-bm-george"]) {
      it(`${preset} sounds MIDI 69 at 440 Hz and MIDI 60 at 261.6 Hz`, async () => {
        const engine = createVocalSynthEngine({ preset, debug: true });
        await engine.connect();
        expect(engine.status()).toBe("connected");
        expect(engine.listPorts()).toEqual([`VocalSynth:${preset}`]);
        const high = await bounce(latestContext(), hold(engine, 69));
        expect(high.sampleRate).toBe(48000);
        expectSilence(high.samples, high.sampleRate, 0.02, 0.1, `${preset} before MIDI 69`);
        const heldDb = windowLevels(high.samples, high.sampleRate, 0.4, 0.75).rmsDbFs;
        expect(heldDb, `${preset} holding MIDI 69`).toBeGreaterThan(-50);
        expectHz(high.samples, high.sampleRate, 440, `${preset} MIDI 69`);
        expect(engine.debugLog.some((event) => event.type === "on" && event.midi === 69)).toBe(true);
        await engine.disconnect();
        expect(engine.debugLog.some((event) => event.type === "disconnect")).toBe(true);

        const low = createVocalSynthEngine({ preset });
        await low.connect();
        const rendered = await bounce(latestContext(), hold(low, 60));
        expectMidi(rendered.samples, rendered.sampleRate, 60, `${preset} MIDI 60`);
        await low.disconnect();
      });
    }

    it("an unknown timbre still connects, and telemetry counts the held voices", async () => {
      const engine = createVocalSynthEngine({
        preset: "default-voice",
        debug: true,
        breathiness: 1.5,
        defaultTimbre: "not-a-timbre",
      });
      expect(engine.getTelemetry()).toBeNull();
      expect(() => engine.createTapOutput()).toThrow("Vocal synth engine not connected");
      await engine.connect();
      await engine.connect();
      expect(harness.contexts).toHaveLength(1);
      expect(engine.listPorts()).toEqual(["VocalSynth:default-voice"]);
      expect(engine.debugLog[0]).toEqual({ type: "connect", t: 0 });
      const tap = engine.createTapOutput();
      expect(engine.createTapOutput()).toBe(tap);
      engine.noteOn(69, 90);
      engine.noteOn(69, 80);
      engine.noteOn(69, 70);
      const live = engine.getTelemetry();
      // No audio block has run yet, so the peak-since-reset stays 0.
      expect(live?.voicesActive).toBeGreaterThan(0);
      expect(live?.voicesMax).toBe(0);
      expect(typeof live?.peakDbfs).toBe("number");
      expect(typeof live?.rtf).toBe("number");
      expect(() => engine.setTimbreWeights(null)).not.toThrow();
      engine.noteOff(69);
      expect(engine.debugLog.some((event) => event.type === "off" && event.midi === 69)).toBe(true);
      engine.allNotesOff();
      vi.useFakeTimers();
      try {
        const played = engine.playNote({ note: 60, velocity: 80, durationMs: 20, channel: 0 });
        await vi.advanceTimersByTimeAsync(20);
        await played;
      } finally {
        vi.useRealTimers();
      }
      expect(engine.status()).toBe("connected");
      await engine.disconnect();
      expect(engine.getTelemetry()).toBeNull();
      expect(engine.debugLog.some((event) => event.type === "disconnect")).toBe(true);
    });
  });
});

