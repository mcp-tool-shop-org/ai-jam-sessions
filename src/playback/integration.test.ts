// ─── Phase 3 Integration Tests ──────────────────────────────────────────────
//
// Tests for real-time controls, sing-on-MIDI, MIDI feedback, and composition.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { writeMidi } from "midi-file";
import { parseMidiBuffer } from "../midi/parser.js";
import { PlaybackController } from "./controls.js";
import { createSingOnMidiHook, midiNoteToSingable, clusterToSingable, contourDirection } from "../teaching/sing-on-midi.js";
import { createMidiFeedbackHook } from "../teaching/midi-feedback.js";
import { composeTeachingHooks, createRecordingTeachingHook } from "../teaching.js";
import type { VmpkConnector, MidiStatus, MidiNote, VoiceDirective, AsideDirective } from "../types.js";
import type { MidiNoteEvent } from "../midi/types.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────

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

function createMockConnector(): VmpkConnector & { calls: Array<{ method: string; args: any[] }> } {
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

// ─── PlaybackController Tests ───────────────────────────────────────────────

describe("PlaybackController", () => {
  it("emits noteOn events during playback", async () => {
    const buf = buildMidi([
      { note: 60, velocity: 100, startTick: 0, endTick: 480 },
      { note: 64, velocity: 90, startTick: 480, endTick: 960 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const controller = new PlaybackController(connector, parsed);

    const noteOns: number[] = [];
    controller.on("noteOn", (e) => {
      if (e.type === "noteOn") noteOns.push(e.note);
    });

    await controller.play({ speed: 100 });

    expect(noteOns).toEqual([60, 64]);
    expect(controller.state).toBe("finished");
  });

  it("fires stateChange on pause/resume", async () => {
    const notes = [];
    for (let i = 0; i < 10; i++) {
      notes.push({ note: 60 + i, velocity: 100, startTick: i * 480, endTick: (i + 1) * 480 });
    }
    const buf = buildMidi(notes);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const controller = new PlaybackController(connector, parsed);

    const states: string[] = [];
    controller.on("stateChange", (e) => {
      if (e.type === "stateChange") states.push(e.state);
    });

    const playPromise = controller.play({ speed: 2.0 });
    setTimeout(() => controller.pause(), 30);
    await playPromise;

    // Should have recorded at least one stateChange
    expect(states.length).toBeGreaterThan(0);
  });

  it("fires speedChange event", () => {
    const buf = buildMidi([{ note: 60, velocity: 100, startTick: 0, endTick: 480 }]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const controller = new PlaybackController(connector, parsed);

    const speedEvents: Array<{ prev: number; next: number }> = [];
    controller.on("speedChange", (e) => {
      if (e.type === "speedChange") {
        speedEvents.push({ prev: e.previousSpeed, next: e.newSpeed });
      }
    });

    controller.setSpeed(2.0);
    expect(speedEvents.length).toBe(1);
    expect(speedEvents[0].prev).toBe(1.0);
    expect(speedEvents[0].next).toBe(2.0);
  });

  it("invokes teaching hook during playback", async () => {
    const buf = buildMidi([
      { note: 60, velocity: 100, startTick: 0, endTick: 480 },
      { note: 64, velocity: 90, startTick: 480, endTick: 960 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const controller = new PlaybackController(connector, parsed);
    const recording = createRecordingTeachingHook();

    await controller.play({ speed: 100, teachingHook: recording });

    // Teaching hook receives onMeasureStart for each note + onSongComplete
    const measureStarts = recording.events.filter((e) => e.type === "measure-start");
    expect(measureStarts.length).toBeGreaterThanOrEqual(2);

    const completions = recording.events.filter((e) => e.type === "song-complete");
    expect(completions.length).toBe(1);
  });
});

// ─── Sing-On-MIDI Tests ─────────────────────────────────────────────────────

describe("midiNoteToSingable", () => {
  it("converts to note names", () => {
    expect(midiNoteToSingable(60, "note-names")).toBe("C4");
    expect(midiNoteToSingable(69, "note-names")).toBe("A4");
  });

  it("converts to solfege", () => {
    expect(midiNoteToSingable(60, "solfege")).toBe("Do");
    expect(midiNoteToSingable(64, "solfege")).toBe("Mi");
    expect(midiNoteToSingable(67, "solfege")).toBe("Sol");
  });

  it("converts to syllables", () => {
    expect(midiNoteToSingable(60, "syllables")).toBe("da");
    expect(midiNoteToSingable(127, "syllables")).toBe("da");
  });
});

describe("clusterToSingable", () => {
  it("handles single note", () => {
    const events: MidiNoteEvent[] = [
      { note: 60, velocity: 100, time: 0, duration: 0.5, channel: 0 },
    ];
    expect(clusterToSingable(events, "note-names")).toBe("C4");
  });

  it("handles chord (multiple notes)", () => {
    const events: MidiNoteEvent[] = [
      { note: 60, velocity: 100, time: 0, duration: 0.5, channel: 0 },
      { note: 64, velocity: 100, time: 0, duration: 0.5, channel: 0 },
      { note: 67, velocity: 100, time: 0, duration: 0.5, channel: 0 },
    ];
    const result = clusterToSingable(events, "note-names");
    expect(result).toContain("C4");
    expect(result).toContain("E4");
    expect(result).toContain("G4");
    expect(result).toContain(" and ");
  });
});

describe("contourDirection", () => {
  it("detects up", () => {
    const prev: MidiNoteEvent[] = [{ note: 60, velocity: 100, time: 0, duration: 0.5, channel: 0 }];
    const curr: MidiNoteEvent[] = [{ note: 72, velocity: 100, time: 0.5, duration: 0.5, channel: 0 }];
    expect(contourDirection(prev, curr)).toBe("up");
  });

  it("detects down", () => {
    const prev: MidiNoteEvent[] = [{ note: 72, velocity: 100, time: 0, duration: 0.5, channel: 0 }];
    const curr: MidiNoteEvent[] = [{ note: 60, velocity: 100, time: 0.5, duration: 0.5, channel: 0 }];
    expect(contourDirection(prev, curr)).toBe("down");
  });

  it("detects same", () => {
    const prev: MidiNoteEvent[] = [{ note: 60, velocity: 100, time: 0, duration: 0.5, channel: 0 }];
    const curr: MidiNoteEvent[] = [{ note: 60, velocity: 100, time: 0.5, duration: 0.5, channel: 0 }];
    expect(contourDirection(prev, curr)).toBe("same");
  });
});

describe("createSingOnMidiHook", () => {
  it("emits singable directives during playback", async () => {
    const buf = buildMidi([
      { note: 60, velocity: 100, startTick: 0, endTick: 480 },
      { note: 64, velocity: 90, startTick: 480, endTick: 960 },
      { note: 67, velocity: 80, startTick: 960, endTick: 1440 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };

    const hook = createSingOnMidiHook(sink, parsed, { mode: "note-names" });

    // Simulate playback by calling onMeasureStart for each note
    await hook.onMeasureStart(1, undefined, undefined);
    await hook.onMeasureStart(2, undefined, undefined);
    await hook.onMeasureStart(3, undefined, undefined);

    expect(hook.directives.length).toBe(3);
    expect(hook.directives[0].text).toContain("C4");
    expect(hook.directives[1].text).toContain("E4");
    expect(hook.directives[2].text).toContain("G4");
    expect(hook.directives[0].blocking).toBe(true);
  });

  it("uses solfege mode", async () => {
    const buf = buildMidi([
      { note: 60, velocity: 100, startTick: 0, endTick: 480 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const sink = async (_d: VoiceDirective) => {};

    const hook = createSingOnMidiHook(sink, parsed, { mode: "solfege" });
    await hook.onMeasureStart(1, undefined, undefined);

    expect(hook.directives[0].text).toContain("Do");
  });

  it("emits completion message", async () => {
    const buf = buildMidi([{ note: 60, velocity: 100, startTick: 0, endTick: 480 }]);
    const parsed = parseMidiBuffer(buf);
    const sink = async (_d: VoiceDirective) => {};

    const hook = createSingOnMidiHook(sink, parsed);
    await hook.onSongComplete(1, "Test Song");

    const last = hook.directives[hook.directives.length - 1];
    expect(last.text).toContain("Test Song");
    expect(last.blocking).toBe(false);
  });
});

// ─── MIDI Feedback Tests ────────────────────────────────────────────────────

describe("createMidiFeedbackHook", () => {
  it("detects dynamics changes", async () => {
    // Two notes: soft then loud
    const buf = buildMidi([
      { note: 60, velocity: 30, startTick: 0, endTick: 480 },     // p
      { note: 64, velocity: 110, startTick: 480, endTick: 960 },  // ff
    ]);
    const parsed = parseMidiBuffer(buf);

    const voiceDirectives: VoiceDirective[] = [];
    const asideDirectives: AsideDirective[] = [];
    const voiceSink = async (d: VoiceDirective) => { voiceDirectives.push(d); };
    const asideSink = async (d: AsideDirective) => { asideDirectives.push(d); };

    const hook = createMidiFeedbackHook(voiceSink, asideSink, parsed, {
      voiceInterval: 100, // high interval so no encouragement fires
    });

    await hook.onMeasureStart(1, undefined, undefined);
    await hook.onMeasureStart(2, undefined, undefined);

    // Should detect the dynamics change from p to ff
    const dynamicsTips = asideDirectives.filter((d) => d.reason === "dynamics-change");
    expect(dynamicsTips.length).toBe(1);
    expect(dynamicsTips[0].text).toContain("loud");
  });

  it("warns about wide leaps", async () => {
    // Two notes: C4 → C6 (24 semitones)
    const buf = buildMidi([
      { note: 60, velocity: 80, startTick: 0, endTick: 480 },
      { note: 84, velocity: 80, startTick: 480, endTick: 960 },
    ]);
    const parsed = parseMidiBuffer(buf);

    const asideDirectives: AsideDirective[] = [];
    const voiceSink = async (_d: VoiceDirective) => {};
    const asideSink = async (d: AsideDirective) => { asideDirectives.push(d); };

    const hook = createMidiFeedbackHook(voiceSink, asideSink, parsed, {
      voiceInterval: 100,
      leapWarnSemitones: 12,
    });

    await hook.onMeasureStart(1, undefined, undefined);
    await hook.onMeasureStart(2, undefined, undefined);

    const leapWarnings = asideDirectives.filter((d) => d.reason === "difficulty-warning");
    expect(leapWarnings.length).toBeGreaterThan(0);
    expect(leapWarnings[0].text).toContain("leap");
  });

  it("emits periodic encouragement", async () => {
    const notes = [];
    for (let i = 0; i < 8; i++) {
      notes.push({ note: 60 + (i % 12), velocity: 80, startTick: i * 480, endTick: (i + 1) * 480 });
    }
    const buf = buildMidi(notes);
    const parsed = parseMidiBuffer(buf);

    const voiceDirectives: VoiceDirective[] = [];
    const voiceSink = async (d: VoiceDirective) => { voiceDirectives.push(d); };
    const asideSink = async (_d: AsideDirective) => {};

    const hook = createMidiFeedbackHook(voiceSink, asideSink, parsed, {
      voiceInterval: 4, // encourage every 4 notes
    });

    for (let i = 1; i <= 8; i++) {
      await hook.onMeasureStart(i, undefined, undefined);
    }

    // Should have at least 2 encouragements (at note 4 and 8)
    expect(voiceDirectives.length).toBeGreaterThanOrEqual(2);
    expect(voiceDirectives.every((d) => d.blocking === false)).toBe(true);
  });

  it("emits completion message", async () => {
    const buf = buildMidi([{ note: 60, velocity: 80, startTick: 0, endTick: 480 }]);
    const parsed = parseMidiBuffer(buf);

    const voiceDirectives: VoiceDirective[] = [];
    const asideDirectives: AsideDirective[] = [];
    const voiceSink = async (d: VoiceDirective) => { voiceDirectives.push(d); };
    const asideSink = async (d: AsideDirective) => { asideDirectives.push(d); };

    const hook = createMidiFeedbackHook(voiceSink, asideSink, parsed);
    await hook.onSongComplete(1, "Test");

    expect(voiceDirectives.some((d) => d.text.includes("Test"))).toBe(true);
    expect(asideDirectives.some((d) => d.reason === "session-complete")).toBe(true);
  });
});

// ─── Composed Hooks Test ────────────────────────────────────────────────────

describe("composed hooks: singing + feedback during MIDI playback", () => {
  it("both hooks fire during a PlaybackController run", async () => {
    const buf = buildMidi([
      { note: 60, velocity: 100, startTick: 0, endTick: 480 },
      { note: 64, velocity: 30, startTick: 480, endTick: 960 },
      { note: 67, velocity: 100, startTick: 960, endTick: 1440 },
    ]);
    const parsed = parseMidiBuffer(buf);
    const connector = createMockConnector();
    const controller = new PlaybackController(connector, parsed);

    const singDirectives: VoiceDirective[] = [];
    const feedbackVoice: VoiceDirective[] = [];
    const feedbackAside: AsideDirective[] = [];

    const singHook = createSingOnMidiHook(
      async (d) => { singDirectives.push(d); },
      parsed,
      { mode: "note-names" }
    );

    const feedbackHook = createMidiFeedbackHook(
      async (d) => { feedbackVoice.push(d); },
      async (d) => { feedbackAside.push(d); },
      parsed,
      { voiceInterval: 100 } // no encouragement to keep test focused
    );

    const composed = composeTeachingHooks(singHook, feedbackHook);
    await controller.play({ speed: 100, teachingHook: composed });

    // Sing hook should have produced directives for each cluster
    expect(singDirectives.length).toBeGreaterThan(0);
    // Feedback should have detected the velocity drop (100 → 30)
    expect(feedbackAside.some((d) => d.reason === "dynamics-change")).toBe(true);
  });
});
