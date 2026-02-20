// ─── piano-sessions-ai: Smoke Test ──────────────────────────────────────────
//
// Quick integration smoke test — no MIDI hardware needed.
// Verifies: ai-music-sheets loads, note parser works, sessions run with mock,
// teaching hooks fire, key moments detected.
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
import { parseNoteToMidi, midiToNoteName } from "./note-parser.js";
import { createRecordingTeachingHook, detectKeyMoments } from "./teaching.js";

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

console.log("\n piano-sessions-ai smoke test\n");

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

// ─── Test 4: Teaching hooks ─────────────────────────────────────────────────
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

// ─── Summary ────────────────────────────────────────────────────────────────

Promise.all(pending).then(() => {
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All smoke tests passed\n");
});
