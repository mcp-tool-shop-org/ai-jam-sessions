import { describe, it, expect } from "vitest";
import { getSong } from "ai-music-sheets";
import {
  createConsoleTeachingHook,
  createSilentTeachingHook,
  createRecordingTeachingHook,
  createCallbackTeachingHook,
  createVoiceTeachingHook,
  createAsideTeachingHook,
  composeTeachingHooks,
  detectKeyMoments,
} from "./teaching.js";
import { createSession } from "./session.js";
import { createMockVmpkConnector } from "./vmpk.js";
import type { VoiceDirective, AsideDirective } from "./types.js";

describe("detectKeyMoments", () => {
  const moonlight = getSong("moonlight-sonata-mvt1")!;

  it("detects key moment at bar 1", () => {
    const moments = detectKeyMoments(moonlight, 1);
    expect(moments.length).toBeGreaterThan(0);
    expect(moments[0]).toContain("Bar 1");
  });

  it("detects key moment at bar 5", () => {
    const moments = detectKeyMoments(moonlight, 5);
    expect(moments.length).toBeGreaterThan(0);
    expect(moments[0]).toContain("Bar 5");
  });

  it("detects range key moment (7-8)", () => {
    const moments = detectKeyMoments(moonlight, 7);
    expect(moments.length).toBeGreaterThan(0);
    expect(moments[0]).toContain("7-8");
  });

  it("also matches bar 8 in the 7-8 range", () => {
    const moments = detectKeyMoments(moonlight, 8);
    expect(moments.length).toBeGreaterThan(0);
  });

  it("returns empty for non-key-moment bar", () => {
    const moments = detectKeyMoments(moonlight, 4);
    expect(moments.length).toBe(0);
  });

  it("works with blues (12-bar blues has different patterns)", () => {
    const blues = getSong("basic-12-bar-blues")!;
    const bar1 = detectKeyMoments(blues, 1);
    expect(bar1.length).toBeGreaterThan(0);
  });
});

describe("RecordingTeachingHook", () => {
  it("records measure-start events", async () => {
    const hook = createRecordingTeachingHook();
    await hook.onMeasureStart(1, "test note", "mf");
    expect(hook.events).toEqual([
      { type: "measure-start", measureNumber: 1, teachingNote: "test note", dynamics: "mf" },
    ]);
  });

  it("records key-moment events", async () => {
    const hook = createRecordingTeachingHook();
    await hook.onKeyMoment("Bar 1: something important");
    expect(hook.events[0].type).toBe("key-moment");
    expect(hook.events[0].moment).toContain("Bar 1");
  });

  it("records song-complete events", async () => {
    const hook = createRecordingTeachingHook();
    await hook.onSongComplete(8, "Test Song");
    expect(hook.events[0]).toEqual({
      type: "song-complete",
      measuresPlayed: 8,
      songTitle: "Test Song",
    });
  });

  it("records push events", async () => {
    const hook = createRecordingTeachingHook();
    await hook.push({ text: "Great job!", priority: "low", reason: "encouragement" });
    expect(hook.events[0].type).toBe("push");
    expect(hook.events[0].interjection?.text).toBe("Great job!");
  });
});

describe("CallbackTeachingHook", () => {
  it("routes to custom callbacks", async () => {
    const calls: string[] = [];
    const hook = createCallbackTeachingHook({
      onMeasureStart: async (n) => { calls.push(`measure-${n}`); },
      onKeyMoment: async (m) => { calls.push(`key-${m}`); },
    });

    await hook.onMeasureStart(3, undefined, undefined);
    await hook.onKeyMoment("test moment");

    expect(calls).toEqual(["measure-3", "key-test moment"]);
  });

  it("handles missing callbacks gracefully", async () => {
    const hook = createCallbackTeachingHook({});
    // These should not throw
    await hook.onMeasureStart(1, undefined, undefined);
    await hook.onKeyMoment("test");
    await hook.onSongComplete(4, "test");
    await hook.push({ text: "test", priority: "low", reason: "custom" });
  });
});

describe("SilentTeachingHook", () => {
  it("does nothing (no errors)", async () => {
    const hook = createSilentTeachingHook();
    await hook.onMeasureStart(1, "note", "ff");
    await hook.onKeyMoment("moment");
    await hook.onSongComplete(8, "song");
    await hook.push({ text: "text", priority: "high", reason: "custom" });
    // If we get here, it worked
  });
});

describe("Session + Teaching Hook integration", () => {
  it("fires teaching hooks during full playback", async () => {
    const mock = createMockVmpkConnector();
    const hook = createRecordingTeachingHook();
    const song = getSong("moonlight-sonata-mvt1")!;
    const sc = createSession(song, mock, { teachingHook: hook });

    await mock.connect();
    await sc.play();

    // Should have measure-start events for all 8 measures
    const measureStarts = hook.events.filter((e) => e.type === "measure-start");
    expect(measureStarts.length).toBe(8);
    expect(measureStarts[0].measureNumber).toBe(1);
    expect(measureStarts[7].measureNumber).toBe(8);

    // Should have key-moment events (moonlight has moments at bars 1, 5, 7-8)
    const keyMoments = hook.events.filter((e) => e.type === "key-moment");
    expect(keyMoments.length).toBeGreaterThan(0);

    // Should have song-complete event
    const complete = hook.events.filter((e) => e.type === "song-complete");
    expect(complete.length).toBe(1);
    expect(complete[0].songTitle).toContain("Moonlight");
  });

  it("fires teaching hooks in measure mode", async () => {
    const mock = createMockVmpkConnector();
    const hook = createRecordingTeachingHook();
    const song = getSong("let-it-be")!;
    const sc = createSession(song, mock, { mode: "measure", teachingHook: hook });

    await mock.connect();
    await sc.play(); // plays one measure

    const measureStarts = hook.events.filter((e) => e.type === "measure-start");
    expect(measureStarts.length).toBe(1);
    expect(measureStarts[0].measureNumber).toBe(1);
    // No song-complete because we're paused
    expect(hook.events.filter((e) => e.type === "song-complete").length).toBe(0);
  });

  it("fires teaching hooks with correct teaching notes", async () => {
    const mock = createMockVmpkConnector();
    const hook = createRecordingTeachingHook();
    const song = getSong("moonlight-sonata-mvt1")!;
    const sc = createSession(song, mock, { mode: "measure", teachingHook: hook });

    await mock.connect();
    await sc.play();

    // First measure of moonlight has a teaching note
    const first = hook.events.find((e) => e.type === "measure-start");
    expect(first?.teachingNote).toBeDefined();
    expect(first?.teachingNote).toContain("triplets");
  });
});

describe("VoiceTeachingHook", () => {
  it("produces voice directives from teaching notes", async () => {
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createVoiceTeachingHook(sink);

    await hook.onMeasureStart(1, "Watch your finger posture", "mf");
    expect(directives.length).toBe(1);
    expect(directives[0].text).toContain("Measure 1");
    expect(directives[0].text).toContain("Watch your finger posture");
    expect(directives[0].text).toContain("mf");
    expect(directives[0].blocking).toBe(false);
  });

  it("skips measure-start when no teaching note", async () => {
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createVoiceTeachingHook(sink);

    await hook.onMeasureStart(3, undefined, "pp");
    expect(directives.length).toBe(0);
  });

  it("speaks key moments with blocking", async () => {
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createVoiceTeachingHook(sink);

    await hook.onKeyMoment("Bar 1: the iconic triplet arpeggio pattern");
    expect(directives.length).toBe(1);
    expect(directives[0].blocking).toBe(true);
    expect(directives[0].text).toContain("triplet");
  });

  it("speaks completion message", async () => {
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createVoiceTeachingHook(sink);

    await hook.onSongComplete(8, "Moonlight Sonata");
    expect(directives.length).toBe(1);
    expect(directives[0].text).toContain("Moonlight Sonata");
    expect(directives[0].text).toContain("8 measures");
  });

  it("respects speakTeachingNotes=false", async () => {
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createVoiceTeachingHook(sink, { speakTeachingNotes: false });

    await hook.onMeasureStart(1, "test note", "ff");
    expect(directives.length).toBe(0);
  });

  it("uses custom voice and speed", async () => {
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createVoiceTeachingHook(sink, { voice: "narrator", speechSpeed: 0.8 });

    await hook.onMeasureStart(1, "test note", undefined);
    expect(directives[0].voice).toBe("narrator");
    expect(directives[0].speed).toBe(0.8);
  });

  it("records directives on the hook object", async () => {
    const sink = async () => {};
    const hook = createVoiceTeachingHook(sink);

    await hook.onMeasureStart(1, "note", "mp");
    await hook.onKeyMoment("key moment");
    expect(hook.directives.length).toBe(2);
  });
});

describe("AsideTeachingHook", () => {
  it("produces aside directives from teaching notes", async () => {
    const directives: AsideDirective[] = [];
    const sink = async (d: AsideDirective) => { directives.push(d); };
    const hook = createAsideTeachingHook(sink);

    await hook.onMeasureStart(3, "Keep wrists relaxed", "mp");
    expect(directives.length).toBe(1);
    expect(directives[0].text).toContain("Measure 3");
    expect(directives[0].text).toContain("Keep wrists relaxed");
    expect(directives[0].priority).toBe("low");
    expect(directives[0].reason).toBe("measure-start");
    expect(directives[0].tags).toContain("piano-teacher");
    expect(directives[0].tags).toContain("teaching-note");
  });

  it("skips measure-start when no teaching note", async () => {
    const directives: AsideDirective[] = [];
    const sink = async (d: AsideDirective) => { directives.push(d); };
    const hook = createAsideTeachingHook(sink);

    await hook.onMeasureStart(2, undefined, "ff");
    expect(directives.length).toBe(0);
  });

  it("pushes key moments with med priority", async () => {
    const directives: AsideDirective[] = [];
    const sink = async (d: AsideDirective) => { directives.push(d); };
    const hook = createAsideTeachingHook(sink);

    await hook.onKeyMoment("Bar 5: dynamic shift");
    expect(directives[0].priority).toBe("med");
    expect(directives[0].tags).toContain("key-moment");
  });

  it("pushes song-complete", async () => {
    const directives: AsideDirective[] = [];
    const sink = async (d: AsideDirective) => { directives.push(d); };
    const hook = createAsideTeachingHook(sink);

    await hook.onSongComplete(12, "Blues");
    expect(directives[0].text).toContain("Blues");
    expect(directives[0].tags).toContain("completion");
  });

  it("respects pushTeachingNotes=false", async () => {
    const directives: AsideDirective[] = [];
    const sink = async (d: AsideDirective) => { directives.push(d); };
    const hook = createAsideTeachingHook(sink, { pushTeachingNotes: false });

    await hook.onMeasureStart(1, "note", "ff");
    expect(directives.length).toBe(0);
  });

  it("records directives on the hook object", async () => {
    const sink = async () => {};
    const hook = createAsideTeachingHook(sink);

    await hook.onMeasureStart(1, "note", "mp");
    await hook.onKeyMoment("key moment");
    expect(hook.directives.length).toBe(2);
  });
});

describe("composeTeachingHooks", () => {
  it("dispatches to all hooks in order", async () => {
    const calls: string[] = [];
    const hookA = createCallbackTeachingHook({
      onMeasureStart: async (n) => { calls.push(`A-measure-${n}`); },
    });
    const hookB = createCallbackTeachingHook({
      onMeasureStart: async (n) => { calls.push(`B-measure-${n}`); },
    });

    const composed = composeTeachingHooks(hookA, hookB);
    await composed.onMeasureStart(5, "test", "ff");

    expect(calls).toEqual(["A-measure-5", "B-measure-5"]);
  });

  it("dispatches key moments to all hooks", async () => {
    const recorder = createRecordingTeachingHook();
    const voiceDirectives: VoiceDirective[] = [];
    const voiceHook = createVoiceTeachingHook(async (d) => { voiceDirectives.push(d); });

    const composed = composeTeachingHooks(recorder, voiceHook);
    await composed.onKeyMoment("Bar 1: important moment");

    expect(recorder.events.length).toBe(1);
    expect(voiceDirectives.length).toBe(1);
  });

  it("dispatches song-complete to all hooks", async () => {
    const recorder = createRecordingTeachingHook();
    const asideDirectives: AsideDirective[] = [];
    const asideHook = createAsideTeachingHook(async (d) => { asideDirectives.push(d); });

    const composed = composeTeachingHooks(recorder, asideHook);
    await composed.onSongComplete(8, "Test Song");

    expect(recorder.events.length).toBe(1);
    expect(asideDirectives.length).toBe(1);
  });
});

describe("Voice + Session integration", () => {
  it("voice hook fires during full playback", async () => {
    const mock = createMockVmpkConnector();
    const voiceDirectives: VoiceDirective[] = [];
    const voiceHook = createVoiceTeachingHook(async (d) => { voiceDirectives.push(d); });
    const song = getSong("moonlight-sonata-mvt1")!;
    const sc = createSession(song, mock, { teachingHook: voiceHook });

    await mock.connect();
    await sc.play();

    // Should have spoken teaching notes + key moments + completion
    expect(voiceDirectives.length).toBeGreaterThan(0);
    const completionMsg = voiceDirectives.find((d) => d.text.includes("Great work"));
    expect(completionMsg).toBeDefined();
  });

  it("composed voice + aside fires during playback", async () => {
    const mock = createMockVmpkConnector();
    const voiceDirectives: VoiceDirective[] = [];
    const asideDirectives: AsideDirective[] = [];
    const voiceHook = createVoiceTeachingHook(async (d) => { voiceDirectives.push(d); });
    const asideHook = createAsideTeachingHook(async (d) => { asideDirectives.push(d); });
    const composed = composeTeachingHooks(voiceHook, asideHook);

    const song = getSong("moonlight-sonata-mvt1")!;
    const sc = createSession(song, mock, { teachingHook: composed });

    await mock.connect();
    await sc.play();

    // Both hooks should have received events
    expect(voiceDirectives.length).toBeGreaterThan(0);
    expect(asideDirectives.length).toBeGreaterThan(0);
  });
});
