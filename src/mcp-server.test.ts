// ─── mcp-server.test.ts ────────────────────────────────────────────────────────
//
// Protocol tests for mcp-server.ts. The module's entry guard (entry-guard.ts)
// lets a test import it without connecting stdio. Handlers stay closures
// inside registerTool, so the client is the real MCP Client on
// InMemoryTransport — the same tool calls a host makes, counted by coverage.
//
// Two spawned smokes remain: the tsx entry (guard did not swallow main, and
// stdout stays JSON-only) and dist/mcp-server.js when a build is present.
//
// State paths: AI_JAM_HOME is set to <tmp>/.ai-jam-sessions before the
// dynamic import. os.homedir() is cached for the worker process, so HOME
// alone would not redirect stateHome(); the child-process smokes still use
// HOME/USERPROFILE because their homedir cache is fresh. Playback uses a
// fake connector (no audio device).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const audioDouble = vi.hoisted(() => {
  const waiters: Array<() => void> = [];
  return {
    gate: false,
    connectError: null as string | null,
    waiterCount: () => waiters.length,
    releaseAll() {
      const pending = waiters.splice(0);
      for (const resolve of pending) resolve();
    },
    async playNote() {
      if (this.gate) {
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
        return;
      }
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    },
  };
});

function fakeConnector() {
  return {
    async connect() {
      if (audioDouble.connectError) throw new Error(audioDouble.connectError);
    },
    async disconnect() {},
    status() {
      return "connected" as const;
    },
    listPorts() {
      return ["fake-port"];
    },
    noteOn() {},
    noteOff() {},
    allNotesOff() {},
    playNote: () => audioDouble.playNote(),
  };
}

function fakeMetronome() {
  return {
    start() {},
    stop() {},
    setTempo() {},
    async countIn() {},
  };
}

vi.mock("./audio-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./audio-engine.js")>();
  return { ...actual, createAudioEngine: () => fakeConnector() };
});
vi.mock("./sample-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sample-engine.js")>();
  return { ...actual, createSampleEngine: () => fakeConnector() };
});
vi.mock("./vocal-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vocal-engine.js")>();
  return { ...actual, createVocalEngine: () => fakeConnector() };
});
vi.mock("./vocal-tract-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vocal-tract-engine.js")>();
  return { ...actual, createTractEngine: () => fakeConnector() };
});
vi.mock("./guitar-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./guitar-engine.js")>();
  return { ...actual, createGuitarEngine: () => fakeConnector() };
});
vi.mock("./playback/metronome.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./playback/metronome.js")>();
  return { ...actual, createMetronome: () => fakeMetronome() };
});

const SERVER_PATH = fileURLToPath(new URL("./mcp-server.ts", import.meta.url));

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

function extractText(result: ToolResult): string {
  return result.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
}

// Fresh module per call so loadSessionState() sees files seeded in beforeStart.
// AI_JAM_HOME points at <tmpHome>/.ai-jam-sessions, which is where the
// assertions below read saved songs back from disk.
const ISOLATED_ENV_KEYS = ["HOME", "USERPROFILE", "AI_JAM_HOME", "OLLAMA_HOST"];

function snapshotEnv(extra?: Record<string, string>): Record<string, string | undefined> {
  const keys = new Set<string>([...ISOLATED_ENV_KEYS, ...Object.keys(extra ?? {})]);
  const snap: Record<string, string | undefined> = {};
  for (const key of keys) snap[key] = process.env[key];
  return snap;
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snap)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function waitForGatedNote(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (audioDouble.waiterCount() > 0) return;
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
  throw new Error("playback never reached a gated note");
}

async function spawnIsolatedServer(options: {
  /** Seed files under tmpHome before prepareMcpServer() reads them. */
  beforeStart?: (tmpHome: string) => void;
  /** Extra env for this module only (OLLAMA_HOST, for example). Restored on close. */
  env?: Record<string, string>;
} = {}): Promise<{
  client: Client;
  tmpHome: string;
  close: () => Promise<void>;
}> {
  const tmpHome = mkdtempSync(join(tmpdir(), "ajs-mcp-server-test-iso-"));
  const snap = snapshotEnv(options.env);
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  process.env.AI_JAM_HOME = join(tmpHome, ".ai-jam-sessions");
  if (options.env) Object.assign(process.env, options.env);
  options.beforeStart?.(tmpHome);

  vi.resetModules();
  const mod = await import("./mcp-server.js");
  const mcp = await mod.prepareMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "tests-agent-mcp-server-test-iso", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), mcp.connect(serverTransport)]);

  return {
    client,
    tmpHome,
    close: async () => {
      audioDouble.gate = false;
      audioDouble.connectError = null;
      audioDouble.releaseAll();
      try {
        await client.callTool({ name: "stop_playback", arguments: {} });
      } catch {
        /* best-effort */
      }
      try {
        await client.close();
      } catch {
        /* best-effort */
      }
      restoreEnv(snap);
      rmSync(tmpHome, { recursive: true, force: true });
    },
  };
}

describe("mcp-server.ts — MCP protocol-level tool tests", () => {
  let client: Client;
  let tmpHome: string;
  let closeShared: () => Promise<void> = async () => {};

  beforeAll(async () => {
    const iso = await spawnIsolatedServer();
    client = iso.client;
    tmpHome = iso.tmpHome;
    closeShared = iso.close;
  }, 30000);

  afterEach(async () => {
    audioDouble.gate = false;
    audioDouble.connectError = null;
    audioDouble.releaseAll();
    if (client) {
      await client.callTool({ name: "stop_playback", arguments: {} }).catch(() => {});
    }
  });

  afterAll(async () => {
    await closeShared();
  });

  it(
    "server_info reports a Tools count derived dynamically from the actual registered-tool list, not a hardcoded literal (pins F-d66effe4 / F-157feff2)",
    async () => {
      const toolList = await client.listTools();
      const actualCount = toolList.tools.length;
      expect(actualCount).toBeGreaterThan(0);
      expect(toolList.tools.some((t) => t.name === "play_song")).toBe(true);
      expect(toolList.tools.some((t) => t.name === "add_section")).toBe(true);
      expect(toolList.tools.some((t) => t.name === "transpose_song")).toBe(true);
      expect(toolList.tools.some((t) => t.name === "server_info")).toBe(true);

      const catalog = JSON.parse(
        readFileSync(fileURLToPath(new URL("./dataset/tool-schemas.json", import.meta.url)), "utf8"),
      ) as { tool_count: number; tools: Array<{ name: string }> };
      const liveNames = toolList.tools.map((t) => t.name).sort();
      const catalogNames = catalog.tools.map((t) => t.name).sort();
      expect(catalogNames).toEqual(liveNames);
      expect(catalog.tool_count).toBe(liveNames.length);

      const listSongs = toolList.tools.find((t) => t.name === "list_songs");
      expect(listSongs?.annotations?.readOnlyHint).toBe(true);
      expect(listSongs?.annotations?.idempotentHint).toBe(true);

      const result = (await client.callTool({
        name: "server_info",
        arguments: {},
      })) as ToolResult;
      const text = extractText(result);
      const match = text.match(/\*\*Tools:\*\*\s*(\d+)/);
      expect(match).not.toBeNull();
      const reportedCount = Number(match![1]);

      // Neither side is hardcoded here: both values are derived at
      // test-run time from the same running server, so this holds
      // regardless of how many tools are registered today or added later —
      // exactly what "derived dynamically, not hardcoded" requires.
      expect(reportedCount).toBe(actualCount);
    },
    15000,
  );

  it(
    "play_song rejects an endMeasure beyond the song's measure count with a structured isError response, not a fake success (pins F-c969321e)",
    async () => {
      const result = (await client.callTool({
        name: "play_song",
        arguments: { id: "bach-prelude-c-major-bwv846", mode: "loop", startMeasure: 1, endMeasure: 999999 },
      })) as ToolResult;
      const text = extractText(result);

      expect(result.isError).toBe(true);
      expect(text.toLowerCase()).not.toContain("now playing");
      expect(text.toLowerCase()).toContain("exceeds");
      expect(text.toLowerCase()).toContain("valid range");
    },
    20000,
  );

  it(
    "play_song's endMeasure bound is exact at the song's measure count — the last valid measure plays, one past it errors (pins F-c969321e against an off-by-one; the 999999 case above passes under a >= mutation, this one does not)",
    async () => {
      // Derive the song's true measure count from the server itself, so the
      // boundary assertions can't drift from the fixture.
      const info = (await client.callTool({
        name: "song_info",
        arguments: { id: "bach-prelude-c-major-bwv846" },
      })) as ToolResult;
      const n = Number(extractText(info).match(/Measures:\**\s*(\d+)/)![1]);
      expect(n).toBeGreaterThan(1);

      // One past the last measure → the range guard rejects it with the
      // "exceeds … valid range" message (proves the > guard fires at the exact
      // edge, not only for wildly-out-of-range values).
      const past = (await client.callTool({
        name: "play_song",
        arguments: { id: "bach-prelude-c-major-bwv846", mode: "loop", startMeasure: 1, endMeasure: n + 1 },
      })) as ToolResult;
      expect(past.isError).toBe(true);
      const pastText = extractText(past).toLowerCase();
      expect(pastText).not.toContain("now playing");
      expect(pastText).toContain("exceeds");
      expect(pastText).toContain("valid range");

      // Exactly the last measure → the range guard must ACCEPT it. We assert on
      // the guard's own outcome, not on playback succeeding: a real audio device
      // isn't available on a headless CI runner, so an in-range request may still
      // fail later at the engine-connect step ("couldn't start the … engine").
      // The invariant that matters here is that the *range* check let it through
      // — i.e. the response is NOT the range-exceeded rejection. Under a `>=`
      // off-by-one mutation, endMeasure === n would be rejected with that exact
      // message and this assertion goes red (the 999999 case above cannot catch
      // that mutation; this one does).
      const edge = (await client.callTool({
        name: "play_song",
        arguments: { id: "bach-prelude-c-major-bwv846", mode: "loop", startMeasure: n, endMeasure: n },
      })) as ToolResult;
      const edgeText = extractText(edge).toLowerCase();
      expect(edgeText).not.toContain("exceeds");
      expect(edgeText).not.toContain("valid range");

      // Best-effort cleanup in case audio did start (local dev with a device).
      await client.callTool({ name: "stop_playback", arguments: {} }).catch(() => {});
    },
    25000,
  );

  it(
    "registers practice_loop, practice_status, score_last_take, view_scored_piano_roll, and play_song's schema gains metronome/countIn/record",
    async () => {
      const toolList = await client.listTools();
      const names = toolList.tools.map((t) => t.name);
      expect(names).toContain("practice_loop");
      expect(names).toContain("practice_status");
      expect(names).toContain("score_last_take");
      expect(names).toContain("view_scored_piano_roll");

      const playSong = toolList.tools.find((t) => t.name === "play_song");
      expect(playSong).toBeDefined();
      const props = (playSong!.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(props).toHaveProperty("metronome");
      expect(props).toHaveProperty("countIn");
      expect(props).toHaveProperty("record");
    },
    15000,
  );

  it(
    "practice_loop rejects an unknown song id with a structured isError response",
    async () => {
      const result = (await client.callTool({
        name: "practice_loop",
        arguments: { id: "not-a-real-song-xyz", startMeasure: 1, endMeasure: 2 },
      })) as ToolResult;
      expect(result.isError).toBe(true);
      expect(extractText(result).toLowerCase()).toMatch(/no song called/);
    },
    15000,
  );

  it(
    "practice_loop rejects an endMeasure beyond the song's length with a structured isError response (validated before any audio connect)",
    async () => {
      const result = (await client.callTool({
        name: "practice_loop",
        arguments: { id: "bach-prelude-c-major-bwv846", startMeasure: 1, endMeasure: 999999 },
      })) as ToolResult;
      expect(result.isError).toBe(true);
      expect(extractText(result).toLowerCase()).toMatch(/exceeds/);
    },
    15000,
  );

  it(
    "practice_loop rejects endMeasure < startMeasure with a structured isError response",
    async () => {
      const result = (await client.callTool({
        name: "practice_loop",
        arguments: { id: "bach-prelude-c-major-bwv846", startMeasure: 5, endMeasure: 2 },
      })) as ToolResult;
      expect(result.isError).toBe(true);
      expect(extractText(result).toLowerCase()).toMatch(/startmeasure/);
    },
    15000,
  );

  it(
    "practice_loop rejects a speedTargetPct below speedStartPct with a structured isError response",
    async () => {
      const result = (await client.callTool({
        name: "practice_loop",
        arguments: { id: "bach-prelude-c-major-bwv846", startMeasure: 1, endMeasure: 2, speedStartPct: 90, speedTargetPct: 60 },
      })) as ToolResult;
      expect(result.isError).toBe(true);
      expect(extractText(result).toLowerCase()).toMatch(/speedtargetpct/);
    },
    15000,
  );

  it(
    "add_section persists to disk: re-reading the song file from the (isolated) user songs dir shows the new section (pins F-5aec2e16)",
    async () => {
      const result = (await client.callTool({
        name: "add_section",
        arguments: {
          id: "bach-prelude-c-major-bwv846",
          name: "TestsAgentSection",
          startMeasure: 1,
          endMeasure: 2,
          description: "added by mcp-server.test.ts",
        },
      })) as ToolResult;
      expect(result.isError).not.toBe(true);

      // Bypass the server's in-memory registry entirely — read the actual
      // file saveSong() should have written.
      const savedPath = join(tmpHome, ".ai-jam-sessions", "songs", "bach-prelude-c-major-bwv846.json");
      expect(existsSync(savedPath)).toBe(true);
      const saved = JSON.parse(readFileSync(savedPath, "utf8")) as {
        sections?: Array<{ name: string; startMeasure: number; endMeasure: number }>;
      };
      expect(Array.isArray(saved.sections)).toBe(true);
      const section = saved.sections!.find((s) => s.name === "TestsAgentSection");
      expect(section).toBeDefined();
      expect(section!.startMeasure).toBe(1);
      expect(section!.endMeasure).toBe(2);
    },
    15000,
  );

  it(
    "transpose_song persists to disk: re-reading the transposed song file from the (isolated) user songs dir shows the mutation (pins F-a4c5e9b7)",
    async () => {
      // A minimal single-note fixture isolates the persistence behavior from
      // any note-content concern. The real-library path (chord-notation songs
      // like fallin) is covered by the second half of this test below — the
      // chord-joined "C4+E4" crash that once forced a synthetic-only fixture
      // has since been fixed, so persistence is now pinned on both the
      // synthetic and the real-content paths.
      const fixtureSong = {
        id: "tests-agent-fixture-song",
        title: "Tests Agent Fixture Song",
        genre: "folk",
        difficulty: "beginner",
        key: "C major",
        tempo: 100,
        timeSignature: "4/4",
        durationSeconds: 8,
        musicalLanguage: {
          description: "A tiny fixture song for mcp-server.test.ts.",
          structure: "AA",
          keyMoments: ["Measure 1: opening phrase."],
          teachingGoals: ["Steady quarter-note timing."],
          styleTips: [],
        },
        measures: [
          { number: 1, rightHand: "C4:q D4:q E4:q F4:q", leftHand: "C3:w" },
          { number: 2, rightHand: "G4:q F4:q E4:q D4:q", leftHand: "C3:w" },
        ],
        tags: ["fixture"],
      };
      const addResult = (await client.callTool({
        name: "add_song",
        arguments: { song: JSON.stringify(fixtureSong) },
      })) as ToolResult;
      expect(addResult.isError).not.toBe(true);

      const result = (await client.callTool({
        name: "transpose_song",
        arguments: { id: "tests-agent-fixture-song", semitones: 2 },
      })) as ToolResult;
      expect(result.isError).not.toBe(true);
      const text = extractText(result);

      const idMatch = text.match(/\*\*New ID:\*\*\s*(\S+)/);
      expect(idMatch).not.toBeNull();
      const newId = idMatch![1];
      const keyMatch = text.match(/\*\*New key:\*\*\s*(.+)/);
      expect(keyMatch).not.toBeNull();
      const reportedNewKey = keyMatch![1].trim();

      const savedPath = join(tmpHome, ".ai-jam-sessions", "songs", `${newId}.json`);
      expect(existsSync(savedPath)).toBe(true);
      const saved = JSON.parse(readFileSync(savedPath, "utf8")) as {
        id: string;
        key: string;
      };

      // Full invariant: the persisted file is genuinely the transposed
      // song (same id and key the tool reported), not an empty/placeholder
      // write or a stale copy of the original.
      expect(saved.id).toBe(newId);
      expect(saved.key).toBe(reportedNewKey);

      // Real-content path: a bundled library song (chord-heavy) must also
      // transpose AND persist — this is the path a real user actually hits,
      // and it exercises the chord-notation splitting the synthetic fixture
      // deliberately avoids. Proves the persistence fix (F-a4c5e9b7) holds for
      // real songs now that the chord-transpose crash is fixed.
      const realResult = (await client.callTool({
        name: "transpose_song",
        arguments: { id: "bach-prelude-c-major-bwv846", semitones: 2 },
      })) as ToolResult;
      expect(realResult.isError).not.toBe(true);
      const realText = extractText(realResult);
      const realIdMatch = realText.match(/\*\*New ID:\*\*\s*(\S+)/);
      expect(realIdMatch).not.toBeNull();
      const realNewId = realIdMatch![1];
      const realKeyMatch = realText.match(/\*\*New key:\*\*\s*(.+)/);
      expect(realKeyMatch).not.toBeNull();

      const realSavedPath = join(tmpHome, ".ai-jam-sessions", "songs", `${realNewId}.json`);
      expect(existsSync(realSavedPath)).toBe(true);
      const realSaved = JSON.parse(readFileSync(realSavedPath, "utf8")) as {
        id: string;
        key: string;
        measures: Array<{ rightHand: string; leftHand: string }>;
      };
      expect(realSaved.id).toBe(realNewId);
      expect(realSaved.key).toBe(realKeyMatch![1].trim());
      // The transposed real song retains its chord notation (not silently
      // flattened to single notes): at least one measure still has a "+"-join.
      expect(
        realSaved.measures.some(
          (m) => m.rightHand.includes("+") || m.leftHand.includes("+"),
        ),
      ).toBe(true);
    },
    20000,
  );

  it(
    "verify_harmony verifies the maker-loop demo reharmonization end-to-end over MCP (inline melody) and lists the maker_loop prompt",
    async () => {
      const toolList = await client.listTools();
      expect(toolList.tools.some((t) => t.name === "verify_harmony")).toBe(true);

      const prompts = await client.listPrompts();
      expect(prompts.prompts.some((p) => p.name === "maker_loop")).toBe(true);

      const melody = JSON.stringify([
        { number: 1, rightHand: "E5:e D#5:e" },
        { number: 2, rightHand: "E5:e D#5:e E5:e B4:e D5:e C5:e" },
        { number: 3, rightHand: "A4:e C4:e E4:e A4:e" },
        { number: 4, rightHand: "B4:e E4:e G#4:e B4:e" },
      ]);
      const reharm = JSON.stringify([
        { measure: 1, intendedChord: "Am7", voicing: "A2 C3 E3 G3" },
        { measure: 2, intendedChord: "Am7", voicing: "A2 C3 E3 G3" },
        { measure: 3, intendedChord: "Fmaj7", voicing: "F2 A2 C3 E3" },
        { measure: 4, intendedChord: "E7", voicing: "E2 G#2 B2 D3" },
      ]);

      const result = (await client.callTool({
        name: "verify_harmony",
        arguments: { melody, reharmonization: reharm, key: "A minor" },
      })) as ToolResult;
      expect(result.isError).not.toBe(true);
      const text = extractText(result);
      expect(text).toContain("VERDICT: ✅");
      expect(text).toContain("4/4 voicings confirmed");
      expect(text).toContain("all diatonic");
      expect(text).toContain("add_song"); // points the maker at the next loop step
    },
    20000,
  );

  it(
    "verify_harmony rejects a wrong voicing with a ❌ verdict and returns structured errors for bad input",
    async () => {
      // Wrong harmony: C major voicing under an intended Am7
      const rejected = (await client.callTool({
        name: "verify_harmony",
        arguments: {
          melody: JSON.stringify([{ number: 1, rightHand: "E5:q" }]),
          reharmonization: JSON.stringify([
            { measure: 1, intendedChord: "Am7", voicing: "C3 E3 G3" },
          ]),
        },
      })) as ToolResult;
      const rejectedText = extractText(rejected);
      expect(rejectedText).toContain("✗ MISMATCH");
      expect(rejectedText).toContain("VERDICT: ❌");

      // Malformed reharmonization JSON → structured isError, not a crash
      const badJson = (await client.callTool({
        name: "verify_harmony",
        arguments: { melody: JSON.stringify([]), reharmonization: "not json" },
      })) as ToolResult;
      expect(badJson.isError).toBe(true);
      const badJsonText = extractText(badJson);
      expect(badJsonText).toContain("Couldn't parse reharmonization");
      expect(badJsonText).toContain('"code": "bad_reharmonization"');
      expect(badJsonText).toContain('"hint"');

      // Unknown song → structured isError
      const noSong = (await client.callTool({
        name: "verify_harmony",
        arguments: {
          songId: "definitely-not-a-song",
          reharmonization: JSON.stringify([
            { measure: 1, intendedChord: "C", voicing: "C3 E3 G3" },
          ]),
        },
      })) as ToolResult;
      expect(noSong.isError).toBe(true);

      // Neither songId nor melody → structured isError
      const neither = (await client.callTool({
        name: "verify_harmony",
        arguments: {
          reharmonization: JSON.stringify([
            { measure: 1, intendedChord: "C", voicing: "C3 E3 G3" },
          ]),
        },
      })) as ToolResult;
      expect(neither.isError).toBe(true);
    },
    20000,
  );

  it(
    "verify_harmony resolves a library song's melody and key from songId (range-parses measures)",
    async () => {
      // Uses the bundled library song "bach-prelude-c-major-bwv846" — the assertion is on the
      // songId resolution path (melody + key pulled from the song, range
      // parsed), not on the musical verdict, which depends on MIDI-ingested
      // content. An out-of-range measures string must error cleanly.
      const outOfRange = (await client.callTool({
        name: "verify_harmony",
        arguments: {
          songId: "bach-prelude-c-major-bwv846",
          measures: "8-2",
          reharmonization: JSON.stringify([
            { measure: 1, intendedChord: "C", voicing: "C3 E3 G3" },
          ]),
        },
      })) as ToolResult;
      expect(outOfRange.isError).toBe(true);
      const outOfRangeText = extractText(outOfRange);
      expect(outOfRangeText).toContain("bad_measure_range");
      expect(outOfRangeText).toContain("End measure must be >= start measure");

      const ok = (await client.callTool({
        name: "verify_harmony",
        arguments: {
          songId: "bach-prelude-c-major-bwv846",
          measures: "1-2",
          reharmonization: JSON.stringify([
            { measure: 1, intendedChord: "C", voicing: "C3 E3 G3" },
          ]),
        },
      })) as ToolResult;
      // Whatever the musical verdict, the tool must produce a full verdict
      // report (not an input error) with the song's key auto-applied.
      expect(ok.isError).not.toBe(true);
      const okText = extractText(ok);
      expect(okText).toContain("VERIFY ① chord fidelity");
      expect(okText).toContain("VERIFY ④ key");
    },
    20000,
  );

  it(
    "auto_reharmonize is registered and returns a structured error for an unknown song",
    async () => {
      const toolList = await client.listTools();
      expect(toolList.tools.some((t) => t.name === "auto_reharmonize")).toBe(true);

      // song_not_found is decided before any model call — deterministic with or
      // without Ollama.
      const noSong = (await client.callTool({
        name: "auto_reharmonize",
        arguments: { songId: "definitely-not-a-song" },
      })) as ToolResult;
      expect(noSong.isError).toBe(true);
      expect(extractText(noSong)).toContain("song_not_found");
    },
    20000,
  );

  it(
    "auto_reharmonize fails soft when Ollama is unreachable — structured error, server stays alive",
    async () => {
      // Pin OLLAMA_HOST to a dead port so the probe fails deterministically,
      // regardless of whether a real Ollama is running on the dev machine.
      const iso = await spawnIsolatedServer({ env: { OLLAMA_HOST: "http://127.0.0.1:1" } });
      try {
        const res = (await iso.client.callTool({
          name: "auto_reharmonize",
          arguments: { songId: "bach-prelude-c-major-bwv846", measures: "1-4" }, // default format: abc
        })) as ToolResult;
        expect(res.isError).toBe(true);
        const text = extractText(res);
        expect(text).toContain("ollama_unreachable");
        expect(text).toMatch(/ollama serve/i); // the hint tells the user how to fix it

        // The 'chords' (JSON) format is also schema-valid and fails soft the same way.
        const resChords = (await iso.client.callTool({
          name: "auto_reharmonize",
          arguments: { songId: "bach-prelude-c-major-bwv846", measures: "1-4", format: "chords" },
        })) as ToolResult;
        expect(resChords.isError).toBe(true);
        expect(extractText(resChords)).toContain("ollama_unreachable");

        // The Ollama dependency is OPTIONAL: a deterministic tool still answers
        // after the failed LLM call, proving the server did not crash.
        const info = (await iso.client.callTool({ name: "server_info", arguments: {} })) as ToolResult;
        expect(info.isError).not.toBe(true);
        expect(extractText(info)).toContain("Tools:");
      } finally {
        await iso.close();
      }
    },
    30000,
  );

  it(
    "compose_panel is registered (F-3f054882)",
    async () => {
      const toolList = await client.listTools();
      expect(toolList.tools.some((t) => t.name === "compose_panel")).toBe(true);
    },
    15000,
  );

  it(
    "compose_panel rejects a bad measure range with a structured error, not panel_failed (F-3f054882 / F-9a7bbbd8 glue)",
    async () => {
      const res = (await client.callTool({
        name: "compose_panel",
        arguments: { songs: "bach-prelude-c-major-bwv846", measures: "nope" },
      })) as ToolResult;
      expect(res.isError).toBe(true);
      expect(extractText(res)).toContain("bad_measure_range");
      expect(extractText(res)).not.toContain("panel_failed");
    },
    20000,
  );

  it(
    "compose_panel rejects an unknown song set with no_songs (F-3f054882)",
    async () => {
      const res = (await client.callTool({
        name: "compose_panel",
        arguments: { songs: "definitely-not-a-song", measures: "1-4" },
      })) as ToolResult;
      expect(res.isError).toBe(true);
      expect(extractText(res)).toContain("no_songs");
    },
    20000,
  );

  it(
    "compose_panel style=jazz yields structured bad_style, not panel_failed (F-9a7bbbd8)",
    async () => {
      const res = (await client.callTool({
        name: "compose_panel",
        arguments: { songs: "bach-prelude-c-major-bwv846", measures: "1-4", style: "jazz" },
      })) as ToolResult;
      expect(res.isError).toBe(true);
      const text = extractText(res);
      expect(text).toContain("bad_style");
      expect(text).not.toContain("panel_failed");
    },
    20000,
  );

  it(
    "compose_panel fails soft when Ollama is unreachable — structured error, server stays alive (F-3f054882)",
    async () => {
      const iso = await spawnIsolatedServer({ env: { OLLAMA_HOST: "http://127.0.0.1:1" } });
      try {
        const res = (await iso.client.callTool({
          name: "compose_panel",
          arguments: { songs: "bach-prelude-c-major-bwv846", measures: "1-4" },
        })) as ToolResult;
        expect(res.isError).toBe(true);
        expect(extractText(res)).toContain("ollama_unreachable");

        const info = (await iso.client.callTool({ name: "server_info", arguments: {} })) as ToolResult;
        expect(info.isError).not.toBe(true);
        expect(extractText(info)).toContain("Tools:");
      } finally {
        await iso.close();
      }
    },
    30000,
  );

  it(
    "import_midi's parse-throw path returns isError: true (F-95f55587)",
    async () => {
      const iso = await spawnIsolatedServer({
        beforeStart: (home) => {
          writeFileSync(join(home, "broken.mid"), "not a midi file");
        },
      });
      try {
        const res = (await iso.client.callTool({
          name: "import_midi",
          arguments: {
            midi_path: join(iso.tmpHome, "broken.mid"),
            id: "broken-import",
            title: "Broken",
            genre: "classical",
            difficulty: "beginner",
            key: "C major",
          },
        })) as ToolResult;
        expect(res.isError).toBe(true);
        expect(extractText(res)).toContain("Failed to import MIDI");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "play_song treats a .MID path as a MIDI file, not a library id (F-e2e9baac)",
    async () => {
      const res = (await client.callTool({
        name: "play_song",
        arguments: { id: join(tmpHome, "missing-file.MID") },
      })) as ToolResult;
      expect(res.isError).toBe(true);
      const text = extractText(res).toLowerCase();
      expect(text).toContain("can't access");
      expect(text).toContain("home directory");
      expect(text).not.toContain("no song called");
    },
    20000,
  );
});

// ─── Spawned entry smokes ───────────────────────────────────────────────────
//
// In-process tests never execute main(), so they cannot prove the guard
// still starts the server. Two child processes do:
//
//   1. `node --import tsx src/mcp-server.ts` lists tools, then play_song.
//      stdout is inspected raw (B-B1-001): the SDK's line parser drops
//      non-JSON, so a teaching-hook leak would still look like a passing
//      tool call. A fake clock cannot reach the child, so this keeps the
//      original pipe-observation window after the tool returns.
//   2. `node dist/mcp-server.js` when a build is present — the symlinked
//      bin case. If dist/ is absent the test says so and does not pretend
//      the built entry ran.

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("mcp-server.ts — spawned entry smokes", () => {
  it(
    "tsx entry lists tools and writes only JSON-RPC to stdout during play_song (B-B1-001)",
    async () => {
      const tmpHome = mkdtempSync(join(tmpdir(), "ajs-mcp-smoke-"));
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["--import", "tsx", SERVER_PATH],
        env: {
          ...process.env,
          HOME: tmpHome,
          USERPROFILE: tmpHome,
        } as Record<string, string>,
      });
      const client = new Client({ name: "tests-agent-mcp-smoke", version: "0.0.0" });
      const rawStdoutLines: string[] = [];
      let lineBuf = "";
      let stdoutBuf = "";
      let stderrBuf = "";
      try {
        await client.connect(transport);
        const toolList = await client.listTools();
        expect(toolList.tools.length).toBeGreaterThan(50);
        expect(toolList.tools.some((t) => t.name === "play_song")).toBe(true);
        expect(toolList.tools.some((t) => t.name === "server_info")).toBe(true);

        const info = (await client.callTool({ name: "server_info", arguments: {} })) as ToolResult;
        expect(info.isError).not.toBe(true);
        expect(extractText(info)).toContain("**Tools:**");

        const rawProcess = (
          transport as unknown as {
            _process?: { stdout?: NodeJS.ReadableStream; stderr?: NodeJS.ReadableStream };
          }
        )._process;
        expect(rawProcess?.stdout).toBeTruthy();
        rawProcess!.stdout!.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          stdoutBuf += text;
          lineBuf += text;
          let idx: number;
          while ((idx = lineBuf.indexOf("\n")) !== -1) {
            rawStdoutLines.push(lineBuf.slice(0, idx).replace(/\r$/, ""));
            lineBuf = lineBuf.slice(idx + 1);
          }
        });
        rawProcess?.stderr?.on("data", (chunk: Buffer) => {
          stderrBuf += chunk.toString("utf8");
        });

        const playResult = (await client.callTool({
          name: "play_song",
          arguments: { id: "bach-prelude-c-major-bwv846", mode: "loop", startMeasure: 1, endMeasure: 1 },
        })) as ToolResult;
        expect(playResult).toBeDefined();
        const playText = extractText(playResult);
        expect(playText.length).toBeGreaterThan(0);
        const started = !playResult.isError && playText.includes("Now playing");
        // A headless runner has no audio device. The guard still started the
        // server; the tool then refuses with the engine-start error.
        const refused = playResult.isError === true && playText.includes("Couldn't start the") && playText.includes("engine");
        expect(started || refused).toBe(true);

        // Observation window for the child pipe. Narration that fires is
        // synchronous with playback start when a device exists; the wait
        // is so a late stderr/stdout chunk is not asserted before it arrives.
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await client.callTool({ name: "stop_playback", arguments: {} }).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 200));
      } finally {
        try {
          await client.close();
        } catch {
          /* best-effort */
        }
        rmSync(tmpHome, { recursive: true, force: true });
      }

      if (lineBuf.trim().length > 0) rawStdoutLines.push(lineBuf);
      const nonEmptyLines = rawStdoutLines.filter((line) => line.trim().length > 0);
      expect(nonEmptyLines.length).toBeGreaterThan(0);
      const badLines: string[] = [];
      for (const line of nonEmptyLines) {
        try {
          JSON.parse(line);
        } catch {
          badLines.push(line);
        }
      }
      expect(badLines).toEqual([]);

      const narration = /\[Measure/;
      expect(narration.test(stdoutBuf)).toBe(false);
      if (narration.test(stderrBuf)) {
        expect(stderrBuf).toMatch(narration);
        expect(narration.test(stdoutBuf)).toBe(false);
      }
    },
    30000,
  );

  it("node dist/mcp-server.js lists tools when the build is present", async () => {
    const distBin = join(REPO_ROOT, "dist", "mcp-server.js");
    if (!existsSync(distBin)) {
      expect(existsSync(distBin)).toBe(false);
      return;
    }

    const tmpHome = mkdtempSync(join(tmpdir(), "ajs-mcp-dist-smoke-"));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [distBin],
      env: {
        ...process.env,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
      } as Record<string, string>,
    });
    const client = new Client({ name: "tests-agent-mcp-dist-smoke", version: "0.0.0" });
    try {
      await client.connect(transport);
      const toolList = await client.listTools();
      expect(toolList.tools.some((t) => t.name === "play_song")).toBe(true);
      expect(toolList.tools.some((t) => t.name === "server_info")).toBe(true);
      const info = (await client.callTool({ name: "server_info", arguments: {} })) as ToolResult;
      expect(info.isError).not.toBe(true);
      expect(extractText(info)).toContain("ai-jam-sessions v");
      expect(extractText(info)).toContain("**Tools:**");
    } finally {
      try {
        await client.close();
      } catch {
        /* best-effort */
      }
      rmSync(tmpHome, { recursive: true, force: true });
    }
  }, 30000);
});

// ─── Session-state persistence validation (pins B-B1-002) ──────────────────
//
// loadSessionState() (mcp-server.ts) reads <HOME>/.ai-jam-sessions/
// server-state.json at startup and restores `lastCompletedSession` from it.
// Neither loadSessionState nor persistSessionState nor STATE_FILE are
// exported. These tests pre-seed server-state.json before prepareMcpServer()
// (loadSessionState runs once, inside that call) and observe the loader
// indirectly through
// save_practice_note, which falls back to `lastCompletedSession` whenever no
// `song_id` override is given ("Tool: save_practice_note") and renders it
// into the journal entry via buildJournalEntry() (src/journal.ts) — a
// session-less fallback renders a "### HH:MM — General notes" header; a
// loaded session renders "### HH:MM — <title> (<composer>)" with the
// session's fields.
//
// Confirmed directly against the landed implementation (mcp-server.ts, "─
// Helpers ─" section) — two independent gates, both must pass:
//   1. Top-level `schemaVersion` must strictly equal `SERVER_STATE_SCHEMA_
//      VERSION` (currently 1). Anything else (absent, wrong number, wrong
//      type) discards the WHOLE file — even a perfectly-shaped
//      lastCompletedSession alongside a bad schemaVersion is discarded, not
//      just the version field.
//   2. Once the version gate passes, `lastCompletedSession` (if present) is
//      checked field-by-field by isValidSessionSnapshot() — every required
//      field must be present with the right primitive type. A shape that
//      fails this is discarded on its own (schemaVersion alone doesn't save
//      it), falling back to no-session rather than a corrupted load.
//
// Session-state persistence had ZERO coverage before this file.
describe("mcp-server.ts — session-state validation (pins B-B1-002)", () => {
  const SERVER_STATE_SCHEMA_VERSION = 1;

  /** A SessionSnapshot that satisfies isValidSessionSnapshot()'s full field/type contract. */
  function validSessionSnapshot(title: string): Record<string, unknown> {
    return {
      songId: "bach-prelude-c-major-bwv846",
      title,
      composer: "Tests Agent Composer",
      genre: "pop",
      difficulty: "intermediate",
      key: "C minor",
      tempo: 92,
      speed: 1.0,
      mode: "full",
      measuresPlayed: 8,
      totalMeasures: 8,
      durationSeconds: 30,
      timestamp: "2026-01-01T00:00:00.000Z",
    };
  }

  function seedStateFile(tmpHome: string, rawContent: string): void {
    const dir = join(tmpHome, ".ai-jam-sessions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "server-state.json"), rawContent, "utf-8");
  }

  async function saveNoteAndReadJournal(
    client: Client,
    note: string,
  ): Promise<{ result: ToolResult; journalText: string }> {
    const result = (await client.callTool({
      name: "save_practice_note",
      arguments: { note },
    })) as ToolResult;
    const text = extractText(result);
    const pathMatch = text.match(/Journal entry saved to (.+)/);
    expect(pathMatch).not.toBeNull();
    const journalPath = pathMatch![1].trim();
    expect(existsSync(journalPath)).toBe(true);
    const journalText = readFileSync(journalPath, "utf-8");
    return { result, journalText };
  }

  it(
    "loads a well-formed lastCompletedSession from server-state.json (with the correct schemaVersion) and uses it as save_practice_note's fallback session",
    async () => {
      const validState = {
        schemaVersion: SERVER_STATE_SCHEMA_VERSION,
        lastCompletedSession: validSessionSnapshot("TestsAgentSeededSession"),
      };
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) => seedStateFile(tmpHome, JSON.stringify(validState)),
      });
      try {
        const { journalText } = await saveNoteAndReadJournal(
          iso.client,
          "tests-agent-B-B1-002 valid-load probe",
        );
        // Full invariant: the seeded session's title/composer genuinely made
        // it into the rendered entry (not just "didn't crash").
        expect(journalText).toContain("TestsAgentSeededSession");
        expect(journalText).toContain("Tests Agent Composer");
        expect(journalText).not.toContain("General notes");
        expect(journalText).toContain("tests-agent-B-B1-002 valid-load probe");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "MUTATION-STYLE: discards the ENTIRE file — including an otherwise perfectly-valid lastCompletedSession — when schemaVersion doesn't match, proving the version gate is a real hard cutoff and not a no-op",
    async () => {
      // A validator that only shape-checked lastCompletedSession (ignoring
      // schemaVersion entirely) would happily accept this fixture — the
      // session payload alone is 100% valid. The real contract must reject
      // it anyway because the wrapping schemaVersion doesn't match.
      const staleVersionState = {
        schemaVersion: 0, // != SERVER_STATE_SCHEMA_VERSION (1)
        lastCompletedSession: validSessionSnapshot("ShouldNeverAppearInJournal"),
      };
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) => seedStateFile(tmpHome, JSON.stringify(staleVersionState)),
      });
      try {
        const { result, journalText } = await saveNoteAndReadJournal(
          iso.client,
          "tests-agent-B-B1-002 stale-schema-version probe",
        );
        expect(result.isError).not.toBe(true);
        expect(journalText).toContain("General notes");
        expect(journalText).not.toContain("ShouldNeverAppearInJournal");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "discards gracefully (falls back to no-session) when schemaVersion is correct but lastCompletedSession is a string, not an object",
    async () => {
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) =>
          seedStateFile(
            tmpHome,
            JSON.stringify({
              schemaVersion: SERVER_STATE_SCHEMA_VERSION,
              lastCompletedSession: "not-a-valid-session-object",
            }),
          ),
      });
      try {
        const { result, journalText } = await saveNoteAndReadJournal(
          iso.client,
          "tests-agent-B-B1-002 malformed-string probe",
        );
        expect(result.isError).not.toBe(true);
        // Discarded, not corrupt-loaded: the null-session fallback header,
        // no "undefined" leaking from blindly reading .title/.genre/etc off
        // a string, and definitely not the raw garbage value itself. This
        // exercises isValidSessionSnapshot()'s `typeof x !== "object"`
        // branch specifically (schemaVersion is correct here, so the outer
        // version gate isn't what's catching this case).
        expect(journalText).toContain("General notes");
        expect(journalText).not.toContain("undefined");
        expect(journalText).not.toContain("not-a-valid-session-object");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "discards gracefully when schemaVersion is correct but lastCompletedSession is an incomplete/old-shape object (missing required fields)",
    async () => {
      // Represents a hypothetical hand-edited or partially-written
      // server-state.json that carries the current schemaVersion but a
      // session object predating fields SessionSnapshot now requires —
      // truthy, a real object, but nowhere near a valid session. This
      // exercises isValidSessionSnapshot()'s per-field type checks
      // specifically (schemaVersion is correct, so the outer version gate
      // isn't what's catching this case — a validator that checked ONLY
      // "is lastCompletedSession an object" would wrongly accept this).
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) =>
          seedStateFile(
            tmpHome,
            JSON.stringify({
              schemaVersion: SERVER_STATE_SCHEMA_VERSION,
              lastCompletedSession: { songId: "old-song-from-a-prior-schema" },
            }),
          ),
      });
      try {
        const { result, journalText } = await saveNoteAndReadJournal(
          iso.client,
          "tests-agent-B-B1-002 old-shape probe",
        );
        expect(result.isError).not.toBe(true);
        expect(journalText).toContain("General notes");
        expect(journalText).not.toContain("undefined");
        expect(journalText).not.toContain("old-song-from-a-prior-schema");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "get_keyboard_config includes the discarded-tuning warning when the user file is corrupt (F-aff2d3b7)",
    async () => {
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) => {
          const dir = join(tmpHome, ".ai-jam-sessions", "voices");
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, "grand.json"), "{ not json", "utf-8");
        },
      });
      try {
        const result = (await iso.client.callTool({
          name: "get_keyboard_config",
          arguments: { id: "grand" },
        })) as ToolResult;
        const text = extractText(result);
        expect(text).toContain("Saved tuning for grand could not be read — showing factory defaults. Re-save to repair.");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "get_keyboard_config does not warn when no user tuning file exists (F-aff2d3b7)",
    async () => {
      const iso = await spawnIsolatedServer();
      try {
        const result = (await iso.client.callTool({
          name: "get_keyboard_config",
          arguments: { id: "grand" },
        })) as ToolResult;
        const text = extractText(result);
        expect(text).not.toContain("could not be read");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "discards gracefully (server still starts, tools still work) when server-state.json is unparseable JSON",
    async () => {
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) => seedStateFile(tmpHome, "{ this is not valid json at all ][["),
      });
      try {
        // Server-level "no crash" — the whole process must still come up and
        // serve tools normally despite a corrupt state file.
        const toolList = await iso.client.listTools();
        expect(toolList.tools.length).toBeGreaterThan(0);

        const { result, journalText } = await saveNoteAndReadJournal(
          iso.client,
          "tests-agent-B-B1-002 corrupt-json probe",
        );
        expect(result.isError).not.toBe(true);
        expect(journalText).toContain("General notes");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "discards gracefully when server-state.json's top level is valid JSON but not an object (e.g. an array)",
    async () => {
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) => seedStateFile(tmpHome, JSON.stringify(["not", "an", "object"])),
      });
      try {
        const { result, journalText } = await saveNoteAndReadJournal(
          iso.client,
          "tests-agent-B-B1-002 non-object-top-level probe",
        );
        expect(result.isError).not.toBe(true);
        expect(journalText).toContain("General notes");
      } finally {
        await iso.close();
      }
    },
    20000,
  );
});

// ─── fs-write errors return structured JamError results (pins B-B1-003) ──────
//
// Three fs-write sites in mcp-server.ts were hardened to return a structured
// fsErrorResult() — a JamError rendered via toUserString() ("[CODE] message"
// followed by a "Hint:" line) — instead of letting a raw Error escape the
// handler. Two of them are pinned here: save_practice_note's
// appendJournalEntry() call, and annotate_song's ingest/persist catch.
//
// Why isError:true is NECESSARY BUT NOT SUFFICIENT to prove the fix: the MCP
// SDK's CallToolRequest handler wraps ANY thrown handler error into an
// isError:true result too (createToolError(), verified in
// node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js) — so a
// pre-fix RAW throw would ALSO surface as isError:true, just carrying the bare
// inner error string ("ENOENT: …") with NO [CODE] prefix and NO Hint line.
// The load-bearing assertion in each test below is therefore on the JamError
// SHAPE, which only the fixed (fsErrorResult) code path produces.
//
// Both failures are injected as REAL filesystem errors inside the spawned
// child server (this suite drives a real MCP-over-stdio child process — there
// is no in-process writeFileSync to mock), by planting a FILE where the code
// expects a DIRECTORY: a write/append under such a path throws ENOENT/ENOTDIR
// (confirmed on this rig before writing these tests).
describe("mcp-server.ts — fs-write errors return structured JamError results (pins B-B1-003)", () => {
  it(
    "save_practice_note returns a structured isError result (JamError shape), not an uncaught raw throw, when the journal append fails",
    async () => {
      const iso = await spawnIsolatedServer({
        beforeStart: (home) => {
          // Plant a FILE where appendJournalEntry() expects the journal
          // DIRECTORY (<HOME>/.ai-jam-sessions/journal). ensureJournalDir()
          // sees existsSync(dir)===true and skips its mkdir; the subsequent
          // appendFileSync(join(dir, "<date>.md")) then throws because its
          // parent is a file, not a directory. Safe to seed pre-start: the
          // server's startup path never touches the journal dir (it is created
          // lazily, only inside save_practice_note).
          const ajs = join(home, ".ai-jam-sessions");
          mkdirSync(ajs, { recursive: true });
          writeFileSync(join(ajs, "journal"), "collision: a file where the journal dir should be", "utf-8");
        },
      });
      try {
        const result = (await iso.client.callTool({
          name: "save_practice_note",
          arguments: { note: "tests-agent B-B1-003 — journal write should fail structurally" },
        })) as ToolResult;
        const text = extractText(result);

        // Structured error, not a fake success.
        expect(result.isError).toBe(true);
        expect(text).not.toContain("Journal entry saved to");
        // JamError shape from fsErrorResult(err, "save practice journal entry"):
        // "[IO_FILE_WRITE] Failed to save practice journal entry: …\nHint: …".
        // A pre-fix raw throw would surface the bare inner error ("Failed to
        // write journal entry to …" / "ENOENT: …") with NEITHER the
        // [IO_FILE_WRITE] code prefix NOR the Hint line — so these three
        // assertions are what actually distinguish fixed from unfixed.
        expect(text).toContain("[IO_FILE_WRITE]");
        expect(text).toContain("save practice journal entry");
        expect(text).toContain("Hint:");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "annotate_song's ingest/persist catch returns a JamError-shaped result (code/message/hint), not a raw err.message, when the persist step fails",
    async () => {
      // A RAW library song is needed deliberately: raw songs are NOT
      // registered at startup (initializeFromLibrary only ingests "ready"
      // songs), so registerSong() inside annotate_song won't throw
      // "Duplicate song ID" first — the flow reaches saveSong(), the persist
      // step we want to fail. This test used to DISCOVER a currently-raw
      // song at runtime (after its original hardcoded slug,
      // "blues-in-the-night", was harvest-promoted to ready and silently
      // changed which code path ran) — but the 2026-07 harvest waves took
      // the shipped library to 120/120 ready, and discovery's own
      // "no raw library song left — inject a fixture raw song" throw fired.
      // This is that fixture: a synthetic raw song (minimal valid config +
      // the same proven one-note MIDI bytes as library.test.ts's writeMidi
      // helper) written into the LIVE songs/library/ tree for the duration
      // of this test and deleted in the finally below. It must live in the
      // live tree — the spawned child server resolves its library dir
      // relative to mcp-server.ts itself, with no override seam — and inside
      // a real GENRES dir, because scanLibrary() iterates the fixed genre
      // list, not arbitrary subdirectories.
      //
      // Safety against everything that can observe the fixture:
      //   - Parallel vitest workers scanning the live library: status "raw"
      //     keeps it out of every initializeFromLibrary() ingest; a torn
      //     read of a mid-write config is caught per-file inside
      //     scanLibrary() (SKIP + continue); and no test asserts on
      //     live-library totals. annotate_song's best-effort config write
      //     flipping the fixture to "ready" mid-test is equally inert —
      //     it's our disposable file, gone in the finally.
      //   - A crashed/killed run leaving the pair behind: the
      //     zz-test-fixture-* name is gitignored, so a later bulk `git add`
      //     (harvest waves do those) can't sweep it into the product
      //     library, and the rmSync pre-clean below makes reruns
      //     self-healing.
      const FIXTURE_SONG_ID = "zz-test-fixture-persist-failure";
      const libraryRoot = fileURLToPath(new URL("../songs/library", import.meta.url));
      const fixtureConfigPath = join(libraryRoot, "classical", `${FIXTURE_SONG_ID}.json`);
      const fixtureMidiPath = join(libraryRoot, "classical", `${FIXTURE_SONG_ID}.mid`);

      let iso: Awaited<ReturnType<typeof spawnIsolatedServer>> | undefined;
      try {
        rmSync(fixtureConfigPath, { force: true });
        rmSync(fixtureMidiPath, { force: true });
        // Format 0, 1 track, 480 ticks/beat; tempo 120, 4/4, one C4 quarter
        // note — byte-for-byte the minimal sequence library.test.ts already
        // proves survives midiToSongEntry.
        const midiHeader = Buffer.from([
          0x4d, 0x54, 0x68, 0x64, // MThd
          0x00, 0x00, 0x00, 0x06, // chunk length = 6
          0x00, 0x00,             // format 0
          0x00, 0x01,             // 1 track
          0x01, 0xe0,             // 480 ticks per beat
        ]);
        const midiTrackData = Buffer.from([
          // Tempo: 500000 microseconds/beat = 120 BPM
          0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
          // Time signature: 4/4
          0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
          // Note on: channel 0, C4 (60), velocity 80
          0x00, 0x90, 0x3c, 0x50,
          // Wait 480 ticks (one beat = quarter note), then note off
          0x83, 0x60, 0x80, 0x3c, 0x00,
          // End of track
          0x00, 0xff, 0x2f, 0x00,
        ]);
        const midiTrackHeader = Buffer.from([
          0x4d, 0x54, 0x72, 0x6b, // MTrk
          0x00, 0x00, 0x00, 0x00, // placeholder length
        ]);
        midiTrackHeader.writeUInt32BE(midiTrackData.length, 4);
        writeFileSync(fixtureMidiPath, Buffer.concat([midiHeader, midiTrackHeader, midiTrackData]));
        writeFileSync(
          fixtureConfigPath,
          JSON.stringify(
            {
              id: FIXTURE_SONG_ID,
              title: "Persist-Failure Fixture (synthetic, test-only)",
              genre: "classical",
              difficulty: "beginner",
              key: "C major",
              tempo: 120,
              timeSignature: "4/4",
              tags: ["test-fixture"],
              status: "raw",
            },
            null,
            2,
          ) + "\n",
          "utf-8",
        );
        iso = await spawnIsolatedServer();

        // Plant a FILE where getUserSongsDir() resolves
        // (<HOME>/.ai-jam-sessions/songs) so annotate_song's saveSong() persist
        // throws. This MUST be post-startup, NOT in beforeStart: at boot,
        // initializeFromLibrary → loadSongsFromDir(userDir) calls
        // readdirSync(userDir), and a file there throws ENOTDIR *uncaught*,
        // crashing the server. At startup the songs dir simply doesn't exist
        // (clean boot); we plant the collision only after connect, and call no
        // saveSong-touching tool before annotate_song, so it is intact when
        // saveSong() runs.
        const ajs = join(iso.tmpHome, ".ai-jam-sessions");
        mkdirSync(ajs, { recursive: true });
        writeFileSync(join(ajs, "songs"), "collision: a file where the user songs dir should be", "utf-8");

        const result = (await iso.client.callTool({
          name: "annotate_song",
          arguments: {
            song_id: FIXTURE_SONG_ID,
            description: "tests-agent B-B1-003 probe annotation — must never persist.",
            structure: "12-bar blues",
            key_moments: ["tests-agent key moment"],
            teaching_goals: ["tests-agent teaching goal"],
            style_tips: ["tests-agent style tip"],
          },
        })) as ToolResult;
        const text = extractText(result);

        // Structured error, not a fake success.
        expect(result.isError).toBe(true);
        expect(text).not.toContain("annotated and promoted to ready!");
        // JamError shape from
        // fsErrorResult(err, `finish annotating "<id>" (ingest/persist)`):
        expect(text).toContain("[IO_FILE_WRITE]");
        expect(text).toContain(`finish annotating "${FIXTURE_SONG_ID}" (ingest/persist)`);
        expect(text).toContain("Hint:");
        // Pin the failure to saveSong() itself, not a lookalike routed
        // through the same catch: fsErrorResult embeds the inner err.message,
        // and only saveSong's atomic write-temp-then-rename can put a ".tmp"
        // path in it. The two lookalikes carry other text instead —
        // registerSong's guard says `Duplicate song ID: "<id>"` (exactly how
        // this test once went stale-but-green when its hardcoded raw song was
        // harvest-promoted to ready), and an ingest failure says "MIDI file
        // not found" / a parse error. Neither can produce ".tmp".
        expect(text).toContain(".tmp");
        expect(text).not.toContain("Duplicate song ID");
        // annotate_song's catch appends this note AFTER the JamError string —
        // proves the response came from the ingest/persist catch specifically,
        // not some earlier plain-text isError branch (e.g. the "not found" one).
        expect(text).toContain("The config was updated at");
      } finally {
        // Remove the fixture pair from the live library tree. Config first:
        // a scanLibrary() racing this delete then sees no .json and never
        // builds an entry, so the .mid going second can't strand a
        // config-only entry for anyone.
        rmSync(fixtureConfigPath, { force: true });
        rmSync(fixtureMidiPath, { force: true });
        if (iso) await iso.close();
      }
    },
    25000,
  );
});

// ─── Practice loop + scoring tools (Wave S3) ────────────────────────────────
//
// practice_loop/practice_status/score_last_take/view_scored_piano_roll are
// new tools; play_song gained metronome/countIn/record (covered by the
// registration/schema test above, in the first describe block). Registration
// and input-validation paths are audio-free and fast (also above, reusing
// the shared client). The tests below need PRISTINE server-side state
// (lastRecording/lastScoredTake/activePracticeLoop start unset) or touch a
// real audio connector, so — matching this file's own established pattern —
// each gets its own spawnIsolatedServer() instance rather than reusing the
// shared client. There is no DI seam for a mock connector at the protocol
// level (see this file's header comment) — the mock-connector happy path
// for the underlying PracticeLoop/scoring logic itself lives in
// practice-loop.test.ts, which needs no real audio at all. The real-audio
// test here follows the same "confirmed to connect in this sandbox, but
// tolerate a headless/no-device CI runner" hedge the play_song tests above
// already use.
describe("mcp-server.ts — practice loop + scoring tools (Wave S3)", () => {
  it(
    "practice_status, score_last_take, and view_scored_piano_roll report their empty states on a fresh server",
    async () => {
      const iso = await spawnIsolatedServer();
      try {
        const status = (await iso.client.callTool({ name: "practice_status", arguments: {} })) as ToolResult;
        expect(status.isError).not.toBe(true);
        expect(extractText(status).toLowerCase()).toMatch(/no practice loop/);

        const scored = (await iso.client.callTool({ name: "score_last_take", arguments: {} })) as ToolResult;
        expect(scored.isError).toBe(true);
        expect(extractText(scored).toLowerCase()).toMatch(/no recorded take/);

        const roll = (await iso.client.callTool({ name: "view_scored_piano_roll", arguments: {} })) as ToolResult;
        expect(roll.isError).toBe(true);
        expect(extractText(roll).toLowerCase()).toMatch(/no scored take/);
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "practice_loop starts and echoes the first pass micro-goal",
    async () => {
      const iso = await spawnIsolatedServer();
      audioDouble.gate = true;
      try {
        const result = (await iso.client.callTool({
          name: "practice_loop",
          arguments: { id: "bach-prelude-c-major-bwv846", startMeasure: 1, endMeasure: 1, speedStartPct: 80, speedTargetPct: 80 },
        })) as ToolResult;
        const text = extractText(result);
        expect(result.isError).not.toBe(true);
        expect(text).toContain("Practice loop started");
        expect(text).toContain("m. 1 at 80%");
        expect(text).toContain("measures 1–1");
        expect(text).toContain("80% → 80%");

        const status = (await iso.client.callTool({ name: "practice_status", arguments: {} })) as ToolResult;
        expect(extractText(status)).toMatch(/\*\*Status:\*\* running/);
        expect(extractText(status)).toContain("80%");
      } finally {
        audioDouble.gate = false;
        audioDouble.releaseAll();
        await iso.close();
      }
    },
    25000,
  );

  it(
    "score_last_take refuses a loop-mode take instead of scoring it",
    async () => {
      const iso = await spawnIsolatedServer();
      audioDouble.gate = true;
      try {
        const played = (await iso.client.callTool({
          name: "play_song",
          arguments: { id: "bach-prelude-c-major-bwv846", mode: "loop", record: true },
        })) as ToolResult;
        expect(played.isError).not.toBe(true);
        expect(extractText(played)).toContain("Now playing");
        expect(extractText(played)).toContain("**Recording:** on");

        await waitForGatedNote();
        audioDouble.gate = false;
        audioDouble.releaseAll();
        await iso.client.callTool({ name: "stop_playback", arguments: {} });

        const scored = (await iso.client.callTool({ name: "score_last_take", arguments: {} })) as ToolResult;
        expect(scored.isError).toBe(true);
        const text = extractText(scored);
        expect(text.toLowerCase()).toMatch(/loop-mode take/);
        expect(text).toMatch(/use `?practice_loop`? for scored looping, or record with mode:'full'/);
      } finally {
        audioDouble.gate = false;
        audioDouble.releaseAll();
        await iso.close();
      }
    },
    25000,
  );

  it(
    "pause_playback pauses and resumes a running practice loop",
    async () => {
      const iso = await spawnIsolatedServer();
      audioDouble.gate = true;
      try {
        const started = (await iso.client.callTool({
          name: "practice_loop",
          arguments: { id: "bach-prelude-c-major-bwv846", startMeasure: 1, endMeasure: 1, speedStartPct: 80, speedTargetPct: 80 },
        })) as ToolResult;
        expect(started.isError).not.toBe(true);
        expect(extractText(started)).toContain("Practice loop started");
        await waitForGatedNote();

        const status = (await iso.client.callTool({ name: "practice_status", arguments: {} })) as ToolResult;
        expect(extractText(status)).toMatch(/\*\*Status:\*\* running/);

        const paused = (await iso.client.callTool({ name: "pause_playback", arguments: {} })) as ToolResult;
        const pausedText = extractText(paused).toLowerCase();
        expect(paused.isError).not.toBe(true);
        expect(pausedText).toMatch(/paused practice loop/);

        const resumed = (await iso.client.callTool({ name: "pause_playback", arguments: { resume: true } })) as ToolResult;
        const resumedText = extractText(resumed).toLowerCase();
        expect(resumed.isError).not.toBe(true);
        expect(resumedText).toMatch(/resumed practice loop/);
      } finally {
        audioDouble.gate = false;
        audioDouble.releaseAll();
        await iso.close();
      }
    },
    25000,
  );

  it(
    "set_speed refuses while a practice loop is running",
    async () => {
      const iso = await spawnIsolatedServer();
      audioDouble.gate = true;
      try {
        const started = (await iso.client.callTool({
          name: "practice_loop",
          arguments: { id: "bach-prelude-c-major-bwv846", startMeasure: 1, endMeasure: 1, speedStartPct: 80, speedTargetPct: 80 },
        })) as ToolResult;
        expect(started.isError).not.toBe(true);
        await waitForGatedNote();

        const result = (await iso.client.callTool({ name: "set_speed", arguments: { speed: 2 } })) as ToolResult;
        expect(result.isError).toBe(true);
        expect(extractText(result)).toContain("[INPUT_INVALID_ARGS]");
        expect(extractText(result)).toMatch(/practice loop controls its own tempo ramp/);
      } finally {
        audioDouble.gate = false;
        audioDouble.releaseAll();
        await iso.close();
      }
    },
    25000,
  );
});

// ─── Audio inspection over the protocol ──────────────────────────────────────
//
// The audio modules are unit-tested where they live; these tests pin what the
// TOOLS say, end to end, on WAVs written here with known answers.

function writeWav16(path: string, samples: Float64Array, sampleRate: number): void {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

describe("mcp-server.ts — audio inspection tools", () => {
  const SR = 22050;
  let server: Awaited<ReturnType<typeof spawnIsolatedServer>>;
  let dir: string;
  const tone = (hz: number, sec: number, amp = 0.4) =>
    Float64Array.from({ length: Math.round(sec * SR) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / SR));
  const call = async (name: string, args: Record<string, unknown>) =>
    (await server.client.callTool({ name, arguments: args })) as ToolResult;

  beforeAll(async () => {
    server = await spawnIsolatedServer();
    dir = mkdtempSync(join(tmpdir(), "ajs-audio-tools-"));
    // 3 s of 440 Hz with a 150 ms dropout at 1.5 s.
    const gap = tone(440, 3);
    gap.fill(0, Math.round(1.5 * SR), Math.round(1.65 * SR));
    writeWav16(join(dir, "gap.wav"), gap, SR);
    // A seamless loop (exactly 220 cycles of 220 Hz) and one cut mid-cycle.
    writeWav16(join(dir, "loop-clean.wav"), tone(220, 1), SR);
    writeWav16(join(dir, "loop-cut.wav"), tone(220, 1 + 0.25 / 220), SR);
    // Bright and dark: 3 kHz versus 200 Hz, for the balance tools.
    writeWav16(join(dir, "bright.wav"), tone(3000, 2), SR);
    writeWav16(join(dir, "dark.wav"), tone(200, 2), SR);
    writeWav16(join(dir, "other-rate.wav"), Float64Array.from(tone(200, 2)), 44100);
  }, 30000);

  afterAll(async () => {
    await server?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("analyze_audio reports level, the dropout, and the balance", async () => {
    const r = await call("analyze_audio", { path: join(dir, "gap.wav") });
    expect(r.isError).toBeFalsy();
    const text = extractText(r);
    expect(text).toMatch(/## Level[\s\S]*LUFS/);
    expect(text).toMatch(/Clipping: none\./);
    expect(text).toMatch(/Gap \(dropout\): 1\.5\d\d s/);
    expect(text).toMatch(/## Balance[\s\S]*\| low-mid \| 250–500 Hz \| 9\d\.\d%/);
  }, 20000);

  it("check_loop_seam passes a seamless loop and flags one cut mid-cycle", async () => {
    const clean = extractText(await call("check_loop_seam", { path: join(dir, "loop-clean.wav") }));
    expect(clean).toContain("## Verdict: clean");
    expect(clean).toContain("The seam is safe to ship.");
    const cut = extractText(await call("check_loop_seam", { path: join(dir, "loop-cut.wav") }));
    expect(cut).toContain("## Verdict: click-risk");
    expect(cut).not.toContain("safe to ship");
    expect(cut).toContain("Step at the wrap:");
  }, 20000);

  it("compare_balance reads a darker file as darker, band by band", async () => {
    const r = await call("compare_balance", { path: join(dir, "dark.wav"), reference_path: join(dir, "bright.wav") });
    expect(r.isError).toBeFalsy();
    const text = extractText(r);
    expect(text).toMatch(/Centroid -2\d\d\d Hz/);
    expect(text).toMatch(/\| bass \| \+\d+\.\d dB \|/);
    expect(text).toMatch(/\| high-mid \| -\d+\.\d dB \|/);
  }, 20000);

  it("compare_balance refuses files with different sample rates as a structured error", async () => {
    const r = await call("compare_balance", { path: join(dir, "dark.wav"), reference_path: join(dir, "other-rate.wav") });
    expect(r.isError).toBe(true);
    expect(extractText(r)).toMatch(/different sample rates/);
  }, 20000);
});
