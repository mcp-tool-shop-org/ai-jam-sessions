// ─── pianai: Smoke Test ──────────────────────────────────────────────────────
//
// Quick integration smoke test — no MIDI hardware needed.
// Verifies: ai-music-sheets loads, note parser works, sessions run with mock,
// teaching hooks fire, key moments detected, voice/aside hooks produce output,
// speed control works, progress fires, safe parsing collects warnings.
//
// Usage: pnpm smoke (or: node --import tsx src/smoke.ts)
// ─────────────────────────────────────────────────────────────────────────────

import {
  getAllSongs,
  getSong,
  getStats,
  searchSongs,
} from "ai-music-sheets";
import { createSession } from "./session.js";
import { createMockVmpkConnector } from "./vmpk.js";
import { parseNoteToMidi, midiToNoteName, safeParseNoteToken } from "./note-parser.js";
import {
  createRecordingTeachingHook,
  createVoiceTeachingHook,
  createAsideTeachingHook,
  composeTeachingHooks,
  detectKeyMoments,
} from "./teaching.js";
import type { VoiceDirective, AsideDirective, PlaybackProgress, ParseWarning } from "./types.js";

let passed = 0;
let failed = 0;
const pending: Promise<void>[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      pending.push(
        result
          .then(() => {
            passed++;
            console.log(`  ✓ ${name}`);
          })
          .catch((err) => {
            failed++;
            console.log(`  ✗ ${name}: ${err}`);
          })
      );
    } else {
      passed++;
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${err}`);
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

console.log("\n pianai smoke test\n");

// ─── Test 1: ai-music-sheets loads ──────────────────────────────────────────
console.log("ai-music-sheets integration:");
test("registry loads 10 songs", () => {
  assert(getAllSongs().length === 10, "expected 10 songs");
});

test("all 10 genres covered", () => {
  const stats = getStats();
  const covered = Object.values(stats.byGenre).filter((n) => n > 0).length;
  assert(covered === 10, `expected 10 genres, got ${covered}`);
});

test("getSong finds moonlight sonata", () => {
  const song = getSong("moonlight-sonata-mvt1");
  assert(song !== undefined, "song not found");
  assert(song!.genre === "classical", "wrong genre");
});

test("searchSongs by genre works", () => {
  const results = searchSongs({ genre: "jazz" });
  assert(results.length === 1, `expected 1 jazz song, got ${results.length}`);
  assert(results[0].id === "autumn-leaves", "wrong song");
});

// ─── Test 2: Note parser ────────────────────────────────────────────────────
console.log("\nNote parser:");
test("C4 = MIDI 60", () => {
  assert(parseNoteToMidi("C4") === 60, "C4 should be 60");
});

test("A4 = MIDI 69", () => {
  assert(parseNoteToMidi("A4") === 69, "A4 should be 69");
});

test("MIDI 60 = C4", () => {
  assert(midiToNoteName(60) === "C4", "60 should be C4");
});

test("round-trip: C#4 -> 61 -> C#4", () => {
  const midi = parseNoteToMidi("C#4");
  assert(midi === 61, "C#4 should be 61");
  assert(midiToNoteName(midi) === "C#4", "61 should be C#4");
});

test("safe parse returns null + warning for bad token", () => {
  const warnings: ParseWarning[] = [];
  const result = safeParseNoteToken("GARBAGE:q", 120, "test", warnings);
  assert(result === null, "should return null for bad token");
  assert(warnings.length === 1, "should collect 1 warning");
});

// ─── Test 3: Session engine ─────────────────────────────────────────────────
console.log("\nSession engine:");
test("creates session in loaded state", () => {
  const mock = createMockVmpkConnector();
  const sc = createSession(getSong("let-it-be")!, mock);
  assert(sc.state === "loaded", "should be loaded");
});

test("plays full song through mock", async () => {
  const mock = createMockVmpkConnector();
  const song = getSong("basic-12-bar-blues")!;
  const sc = createSession(song, mock);
  await mock.connect();
  await sc.play();
  assert(sc.state === "finished", `expected finished, got ${sc.state}`);
  assert(sc.session.measuresPlayed === 12, "12 measures");
});

test("measure mode plays one and pauses", async () => {
  const mock = createMockVmpkConnector();
  const song = getSong("autumn-leaves")!;
  const sc = createSession(song, mock, { mode: "measure" });
  await mock.connect();
  await sc.play();
  assert(sc.state === "paused", `expected paused, got ${sc.state}`);
  assert(sc.session.measuresPlayed === 1, "1 measure");
});

// ─── Test 4: Speed + progress ───────────────────────────────────────────────
console.log("\nSpeed + progress:");
test("speed multiplier affects effective tempo", () => {
  const mock = createMockVmpkConnector();
  const song = getSong("basic-12-bar-blues")!;
  const sc = createSession(song, mock, { speed: 0.5 });
  assert(sc.effectiveTempo() === song.tempo * 0.5, "should be half tempo");
});

test("progress fires during playback", async () => {
  const mock = createMockVmpkConnector();
  const song = getSong("basic-12-bar-blues")!;
  const events: PlaybackProgress[] = [];
  const sc = createSession(song, mock, {
    onProgress: (p) => events.push({ ...p }),
    progressInterval: 0,
  });
  await mock.connect();
  await sc.play();
  assert(events.length === 12, `expected 12 progress events, got ${events.length}`);
  assert(events[11].percent === "100%", "last event should be 100%");
});

// ─── Test 5: Teaching hooks ─────────────────────────────────────────────────
console.log("\nTeaching hooks:");
test("detectKeyMoments finds bar 1 in moonlight", () => {
  const song = getSong("moonlight-sonata-mvt1")!;
  const moments = detectKeyMoments(song, 1);
  assert(moments.length > 0, "should find key moment at bar 1");
});

test("recording hook captures events during playback", async () => {
  const mock = createMockVmpkConnector();
  const hook = createRecordingTeachingHook();
  const song = getSong("let-it-be")!;
  const sc = createSession(song, mock, { teachingHook: hook });
  await mock.connect();
  await sc.play();
  const starts = hook.events.filter((e) => e.type === "measure-start");
  assert(starts.length === 8, `expected 8 measure-start events, got ${starts.length}`);
});

test("song-complete fires after full playback", async () => {
  const mock = createMockVmpkConnector();
  const hook = createRecordingTeachingHook();
  const song = getSong("basic-12-bar-blues")!;
  const sc = createSession(song, mock, { teachingHook: hook });
  await mock.connect();
  await sc.play();
  const complete = hook.events.filter((e) => e.type === "song-complete");
  assert(complete.length === 1, "should fire song-complete once");
});

// ─── Test 6: Voice + aside hooks ────────────────────────────────────────────
console.log("\nVoice + aside hooks:");
test("voice hook produces directives during playback", async () => {
  const mock = createMockVmpkConnector();
  const directives: VoiceDirective[] = [];
  const voiceHook = createVoiceTeachingHook(async (d) => { directives.push(d); });
  const song = getSong("moonlight-sonata-mvt1")!;
  const sc = createSession(song, mock, { teachingHook: voiceHook });
  await mock.connect();
  await sc.play();
  assert(directives.length > 0, "should produce voice directives");
  const completion = directives.find((d) => d.text.includes("Great work"));
  assert(completion !== undefined, "should have completion directive");
});

test("aside hook produces directives during playback", async () => {
  const mock = createMockVmpkConnector();
  const directives: AsideDirective[] = [];
  const asideHook = createAsideTeachingHook(async (d) => { directives.push(d); });
  const song = getSong("moonlight-sonata-mvt1")!;
  const sc = createSession(song, mock, { teachingHook: asideHook });
  await mock.connect();
  await sc.play();
  assert(directives.length > 0, "should produce aside directives");
  assert(directives[0].tags!.includes("piano-teacher"), "should have piano-teacher tag");
});

test("composed hooks dispatch to both voice and aside", async () => {
  const mock = createMockVmpkConnector();
  const voiceD: VoiceDirective[] = [];
  const asideD: AsideDirective[] = [];
  const composed = composeTeachingHooks(
    createVoiceTeachingHook(async (d) => { voiceD.push(d); }),
    createAsideTeachingHook(async (d) => { asideD.push(d); })
  );
  const song = getSong("let-it-be")!;
  const sc = createSession(song, mock, { teachingHook: composed });
  await mock.connect();
  await sc.play();
  assert(voiceD.length > 0, "voice should receive events");
  assert(asideD.length > 0, "aside should receive events");
});

// ─── Summary ────────────────────────────────────────────────────────────────

Promise.all(pending).then(() => {
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All smoke tests passed\n");
});
