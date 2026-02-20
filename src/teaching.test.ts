import { describe, it, expect } from "vitest";
import { getSong } from "ai-music-sheets";
import {
  createConsoleTeachingHook,
  createSilentTeachingHook,
  createRecordingTeachingHook,
  createCallbackTeachingHook,
  detectKeyMoments,
} from "./teaching.js";
import { createSession } from "./session.js";
import { createMockVmpkConnector } from "./vmpk.js";

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
