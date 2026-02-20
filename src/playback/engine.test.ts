// ─── MIDI Playback Engine Tests ──────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeMidi } from "midi-file";
import { parseMidiBuffer } from "../midi/parser.js";
import { MidiPlaybackEngine } from "./midi-engine.js";
import { calculateSchedule, totalDurationMs, clusterEvents } from "./timing.js";
import type { VmpkConnector, MidiStatus, MidiNote } from "../types.js";
import type { MidiNoteEvent } from "../midi/types.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────

/** Build a minimal MIDI buffer for testing. */
function buildMidi(notes: Array<{
  note: number;
  velocity: number;
  startTick: number;
  endTick: number;
}>, bpm = 120, ticksPerBeat = 480): Uint8Array {
  const usPerBeat = Math.round(60_000_000 / bpm);
  type MidiEvent = { deltaTime: number; type: string; [key: string]: any };
  const events: MidiEvent[] = [];

  events.push({ deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: usPerBeat });

  const raw: Array<{ tick: number; event: MidiEvent }> = [];
  for (const n of notes) {
    raw.push({ tick: n.startTick, event: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: n.note, velocity: n.velocity } });
    raw.push({ tick: n.endTick, event: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: n.note, velocity: 0 } });
  }
  raw.sort((a, b) => a.tick - b.tick);

  let prevTick = 0;
  for (const r of raw) {
    r.event.deltaTime = r.tick - prevTick;
    prevTick = r.tick;
    events.push(r.event);
  }
  events.push({ deltaTime: 0, type: "endOfTrack", meta: true });

  return new Uint8Array(writeMidi({
    header: { format: 0 as const, numTracks: 1, ticksPerBeat },
    tracks: [events],
  } as any));
}

/** Create a mock VmpkConnector that records calls. */
function createMockConnector(): VmpkConnector & {
  calls: Array<{ method: string; args: any[] }>;
} {
  const calls: Array<{ method: string; args: any[] }> = [];
  return {
    calls,
    async connect() { calls.push({ method: "connect", args: [] }); },
    async disconnect() { calls.push({ method: "disconnect", args: [] }); },
    status(): MidiStatus { return "connected"; },
    listPorts() { return ["Mock"]; },
    noteOn(note: number, velocity: number, channel?: number) {
      calls.push({ method: "noteOn", args: [note, velocity, channel] });
    },
    noteOff(note: number, channel?: number) {
      calls.push({ method: "noteOff", args: [note, channel] });
    },
    allNotesOff(channel?: number) {
      calls.push({ method: "allNotesOff", args: [channel] });
    },
    async playNote(midiNote: MidiNote) {
      calls.push({ method: "playNote", args: [midiNote] });
    },
  };
}

// ─── Engine Tests ───────────────────────────────────────────────────────────

describe("MidiPlaybackEngine", () => {
  it("plays all notes in order", async () => {
    // 3 quarter notes at 120 BPM (C, E, G)
    const buf = buildMidi([
      { note: 60, velocity: 100, startTick: 0, endTick: 480 },
      { note: 64, velocity: 90, startTick: 480, endTick: 960 },
      { note: 67, velocity: 80, startTick: 960, endTick: 1440 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    await engine.play({ speed: 100 }); // very fast

    // Should have called noteOn for all 3 notes
    const noteOns = connector.calls.filter((c) => c.method === "noteOn");
    expect(noteOns.length).toBe(3);
    expect(noteOns[0].args[0]).toBe(60);
    expect(noteOns[1].args[0]).toBe(64);
    expect(noteOns[2].args[0]).toBe(67);

    expect(engine.state).toBe("finished");
    expect(engine.eventsPlayed).toBe(3);
  });

  it("respects speed multiplier", async () => {
    const buf = buildMidi([
      { note: 60, velocity: 100, startTick: 0, endTick: 480 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    const start = Date.now();
    await engine.play({ speed: 100 }); // 100x speed — nearly instant
    const elapsed = Date.now() - start;

    // At 100x speed, a 0.5s note should take ~5ms
    expect(elapsed).toBeLessThan(200);
    expect(engine.state).toBe("finished");
  });

  it("can be stopped mid-playback", async () => {
    // A long sequence of notes
    const notes = [];
    for (let i = 0; i < 20; i++) {
      notes.push({ note: 60 + (i % 12), velocity: 100, startTick: i * 480, endTick: (i + 1) * 480 });
    }
    const buf = buildMidi(notes);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    // Start playing at normal speed, then stop after a brief delay
    const playPromise = engine.play({ speed: 2.0 });
    setTimeout(() => engine.stop(), 50);
    await playPromise;

    expect(engine.state).toBe("stopped");
    // Should have played some but not all notes
    expect(engine.eventsPlayed).toBeLessThan(20);

    // allNotesOff should have been called (cleanup)
    const panics = connector.calls.filter((c) => c.method === "allNotesOff");
    expect(panics.length).toBeGreaterThan(0);
  });

  it("fires noteOn with correct velocity", async () => {
    const buf = buildMidi([
      { note: 60, velocity: 42, startTick: 0, endTick: 480 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    await engine.play({ speed: 100 });

    const noteOns = connector.calls.filter((c) => c.method === "noteOn");
    expect(noteOns[0].args).toEqual([60, 42, 0]); // note, velocity, channel
  });

  it("handles empty MIDI (no events)", async () => {
    const buf = buildMidi([]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    await engine.play({ speed: 100 });

    expect(engine.state).toBe("finished");
    expect(engine.eventsPlayed).toBe(0);
  });

  it("reports correct eventsPlayed and totalEvents", async () => {
    const buf = buildMidi([
      { note: 60, velocity: 100, startTick: 0, endTick: 480 },
      { note: 64, velocity: 100, startTick: 480, endTick: 960 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const engine = new MidiPlaybackEngine(connector, parsed);

    expect(engine.totalEvents).toBe(2);
    expect(engine.eventsPlayed).toBe(0);

    await engine.play({ speed: 100 });

    expect(engine.eventsPlayed).toBe(2);
  });
});

// ─── Timing Utility Tests ───────────────────────────────────────────────────

describe("timing utilities", () => {
  const events: MidiNoteEvent[] = [
    { note: 60, velocity: 100, time: 0, duration: 0.5, channel: 0 },
    { note: 64, velocity: 90, time: 0.5, duration: 0.5, channel: 0 },
    { note: 67, velocity: 80, time: 1.0, duration: 0.5, channel: 0 },
  ];

  it("calculateSchedule at speed 1.0", () => {
    const scheduled = calculateSchedule(events, 1.0);
    expect(scheduled[0].scheduledOnMs).toBeCloseTo(0);
    expect(scheduled[1].scheduledOnMs).toBeCloseTo(500);
    expect(scheduled[2].scheduledOnMs).toBeCloseTo(1000);
    expect(scheduled[0].scheduledOffMs).toBeCloseTo(500);
  });

  it("calculateSchedule at speed 2.0 (double time)", () => {
    const scheduled = calculateSchedule(events, 2.0);
    expect(scheduled[0].scheduledOnMs).toBeCloseTo(0);
    expect(scheduled[1].scheduledOnMs).toBeCloseTo(250);
    expect(scheduled[2].scheduledOnMs).toBeCloseTo(500);
  });

  it("totalDurationMs", () => {
    expect(totalDurationMs(events, 1.0)).toBeCloseTo(1500);
    expect(totalDurationMs(events, 2.0)).toBeCloseTo(750);
    expect(totalDurationMs([], 1.0)).toBe(0);
  });

  it("clusterEvents groups simultaneous notes", () => {
    const chord: MidiNoteEvent[] = [
      { note: 60, velocity: 100, time: 0, duration: 1, channel: 0 },
      { note: 64, velocity: 100, time: 0, duration: 1, channel: 0 },
      { note: 67, velocity: 100, time: 0, duration: 1, channel: 0 },
      { note: 72, velocity: 100, time: 1, duration: 1, channel: 0 },
    ];
    const clusters = clusterEvents(chord, 5);
    expect(clusters.length).toBe(2);
    expect(clusters[0].length).toBe(3); // chord
    expect(clusters[1].length).toBe(1); // single note
  });
});
