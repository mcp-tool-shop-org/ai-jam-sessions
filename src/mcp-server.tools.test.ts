// In-process coverage for every MCP tool the protocol file does not already
// drive. The server is the real module (entry guard keeps main() off stdin).
// Playback goes through a fake connector so no audio device is opened.
// HOME, USERPROFILE, and AI_JAM_HOME point at a temp directory before import.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
async function setLiveAudioContext(ctx: { sampleRate: number } | null): Promise<void> {
  // resetModules() gives mcp-server its own audio-shared instance. A static
  // import in this file would set the copy the server is not reading.
  const { setSharedAudioContext } = await import("./audio-shared.js");
  setSharedAudioContext(ctx);
}

const BACH = "bach-prelude-c-major-bwv846";

const audioDouble = vi.hoisted(() => {
  const waiters: Array<() => void> = [];
  return {
    gate: false,
    connectError: null as string | null,
    playNoteError: null as string | null,
    noteOnError: null as string | null,
    onNoteOff: null as null | (() => void),
    connectedEngine: "",
    disconnects: 0,
    /** When true, a sung lead starts with a fake singer instead of a real backend. */
    fakeSinger: false,
    singerStops: 0,
    waiterCount: () => waiters.length,
    releaseAll() {
      const pending = waiters.splice(0);
      for (const resolve of pending) resolve();
    },
    async playNote() {
      if (this.playNoteError) throw new Error(this.playNoteError);
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

function fakeConnector(kind: string) {
  return {
    kind,
    async connect() {
      audioDouble.connectedEngine = kind;
      if (audioDouble.connectError) throw new Error(audioDouble.connectError);
    },
    async disconnect() {
      audioDouble.disconnects++;
    },
    status() {
      return "connected" as const;
    },
    listPorts() {
      return ["fake-port"];
    },
    noteOn() {
      if (audioDouble.noteOnError) throw new Error(audioDouble.noteOnError);
    },
    noteOff() {
      audioDouble.onNoteOff?.();
    },
    allNotesOff() {},
    playNote: () => audioDouble.playNote(),
    createTapOutput() {
      return {};
    },
  };
}

function fakeMetronome() {
  return { start() {}, stop() {}, setTempo() {}, async countIn() {} };
}

vi.mock("./audio-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./audio-engine.js")>();
  return { ...actual, createAudioEngine: () => fakeConnector("piano") };
});
vi.mock("./sample-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sample-engine.js")>();
  return { ...actual, createSampleEngine: () => fakeConnector("sample") };
});
vi.mock("./vocal-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vocal-engine.js")>();
  return { ...actual, createVocalEngine: () => fakeConnector("vocal") };
});
vi.mock("./vocal-tract-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vocal-tract-engine.js")>();
  return { ...actual, createTractEngine: () => fakeConnector("tract") };
});
vi.mock("./guitar-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./guitar-engine.js")>();
  return { ...actual, createGuitarEngine: () => fakeConnector("guitar") };
});
vi.mock("./vocal/prepare.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vocal/prepare.js")>();
  return {
    ...actual,
    prepareScoreLocked: (async (...args: Parameters<typeof actual.prepareScoreLocked>) => {
      if (!audioDouble.fakeSinger) return actual.prepareScoreLocked(...args);
      return {
        singer: {
          async connect() {},
          start() {},
          async stop() {
            audioDouble.singerStops++;
          },
        },
      };
    }) as typeof actual.prepareScoreLocked,
  };
});
vi.mock("./playback/metronome.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./playback/metronome.js")>();
  return { ...actual, createMetronome: () => fakeMetronome() };
});

interface ToolContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

function extractText(result: ToolResult): string {
  return result.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
}

const ISOLATED_ENV_KEYS = ["HOME", "USERPROFILE", "AI_JAM_HOME", "OLLAMA_HOST", "AI_JAM_SAMPLES_DIR"];

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

async function flushTurns(n = 40): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

async function spawnIsolatedServer(): Promise<{
  client: Client;
  tmpHome: string;
  close: () => Promise<void>;
}> {
  const tmpHome = mkdtempSync(join(tmpdir(), "ajs-mcp-tools-"));
  const snap = snapshotEnv();
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  process.env.AI_JAM_HOME = join(tmpHome, ".ai-jam-sessions");
  delete process.env.AI_JAM_SAMPLES_DIR;
  delete process.env.OLLAMA_HOST;

  vi.resetModules();
  const mod = await import("./mcp-server.js");
  const mcp = await mod.prepareMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "tests-agent-mcp-tools", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), mcp.connect(serverTransport)]);

  return {
    client,
    tmpHome,
    close: async () => {
      audioDouble.gate = false;
      audioDouble.connectError = null;
      audioDouble.playNoteError = null;
      audioDouble.noteOnError = null;
      audioDouble.releaseAll();
      await setLiveAudioContext(null);
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

function midiFile(noteOffDelta: Buffer): Buffer {
  const midiHeader = Buffer.from([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xe0,
  ]);
  const midiTrackData = Buffer.concat([
    Buffer.from([
      0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
      0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
      0x00, 0x90, 0x3c, 0x50,
    ]),
    noteOffDelta,
    Buffer.from([0x80, 0x3c, 0x00, 0x00, 0xff, 0x2f, 0x00]),
  ]);
  const midiTrackHeader = Buffer.from([
    0x4d, 0x54, 0x72, 0x6b,
    0x00, 0x00, 0x00, 0x00,
  ]);
  midiTrackHeader.writeUInt32BE(midiTrackData.length, 4);
  return Buffer.concat([midiHeader, midiTrackHeader, midiTrackData]);
}

// A quarter note. 480 ticks is one beat at 120 BPM, so half a second at 1x.
function oneNoteMidi(): Buffer {
  return midiFile(Buffer.from([0x83, 0x60]));
}

// Four beats (two seconds at 120 BPM). Long enough for the in-process status
// calls, short enough that a resume does not sit on a minute-long note-off.
function heldNoteMidi(): Buffer {
  return midiFile(Buffer.from([0x8f, 0x00]));
}

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

const ONE_NOTE = {
  id: "coverage-one-note",
  title: "Coverage One Note",
  composer: "Coverage",
  genre: "folk",
  difficulty: "advanced",
  key: "C major",
  tempo: 120,
  timeSignature: "4/4",
  durationSeconds: 2,
  musicalLanguage: {
    description: "One quarter note, used to finish a take without a long song.",
    structure: "A",
    keyMoments: ["Measure 1: the only note."],
    teachingGoals: ["Play one note and stop."],
    styleTips: ["Listen to the release."],
  },
  measures: [{ number: 1, rightHand: "C4:q", leftHand: "C3:q" }],
  tags: ["coverage"],
};

describe("mcp-server.ts — tool success and error paths", () => {
  let client: Client;
  let tmpHome: string;
  let closeShared: () => Promise<void> = async () => {};

  async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    return (await client.callTool({ name, arguments: args })) as ToolResult;
  }

  function ok(result: ToolResult, ...needles: string[]): string {
    const text = extractText(result);
    expect(result.isError, text).not.toBe(true);
    for (const needle of needles) expect(text).toContain(needle);
    return text;
  }

  function times(text: string, needle: string): number {
    let count = 0;
    let from = 0;
    while (from <= text.length) {
      const at = text.indexOf(needle, from);
      if (at < 0) return count;
      count += 1;
      from = at + needle.length;
    }
    return count;
  }

  function err(result: ToolResult, ...needles: string[]): string {
    const text = extractText(result);
    expect(result.isError, text).toBe(true);
    for (const needle of needles) expect(text).toContain(needle);
    return text;
  }

  beforeAll(async () => {
    const iso = await spawnIsolatedServer();
    client = iso.client;
    tmpHome = iso.tmpHome;
    closeShared = iso.close;
    ok(await call("add_song", { song: JSON.stringify(ONE_NOTE) }), "added to the library.", "coverage-one-note");
  }, 30000);

  afterEach(async () => {
    audioDouble.gate = false;
    audioDouble.connectError = null;
    audioDouble.playNoteError = null;
    audioDouble.noteOnError = null;
    audioDouble.onNoteOff = null;
    audioDouble.connectedEngine = "";
    audioDouble.releaseAll();
    await setLiveAudioContext(null);
    if (client) {
      await client.callTool({ name: "stop_playback", arguments: {} }).catch(() => {});
    }
  });

  afterAll(async () => {
    await closeShared();
  });

  async function schemaRejects(name: string): Promise<void> {
    let text = "";
    try {
      const result = await client.request(
        { method: "tools/call", params: { name, arguments: ["not-an-object"] } },
        CallToolResultSchema,
      );
      text = extractText(result as ToolResult);
      expect((result as ToolResult).isError, text).toBe(true);
    } catch (error) {
      text = error instanceof Error ? error.message : String(error);
    }
    // Empty-schema tools reject a non-object `arguments` in the SDK, before
    // the handler. Zod 4 says the arguments value must be a record.
    expect(text).toContain("expected record, received array");
    expect(text.length).toBeGreaterThan(8);
  }

  it("lists the catalog and rejects a genre the schema does not allow", async () => {
    const listed = await client.listTools();
    expect(listed.tools.length).toBeGreaterThanOrEqual(56);
    const names = listed.tools.map((tool) => tool.name);
    expect(names).toContain("play_song");
    expect(names).toContain("view_spectrogram");

    const found = ok(await call("list_songs", {}), "Found ", "song(s):", BACH);
    expect(found).toMatch(/Found [1-9]\d* song/);
    ok(await call("list_songs", { genre: "classical", composer: "Bach", query: "Prelude" }), BACH);
    const none = ok(await call("list_songs", { query: "zzzz-no-such-song-query" }), "No songs found matching your criteria.");
    expect(none).not.toContain("Found 0");
    err(await call("list_songs", { genre: "not-a-genre" }), "must be one of", "classical");
  });

  it("reads song info, measures, teaching notes, cues, and a practice setup", async () => {
    ok(
      await call("song_info", { id: BACH }),
      "# Prelude in C Major",
      "**Composer:**",
      "**Measures:**",
    );
    err(await call("song_info", { id: "no-such-song-xyz" }), `No song called "no-such-song-xyz"`);

    ok(await call("registry_stats", {}), "# Registry Stats", "Total songs:", "## By Genre");
    await schemaRejects("registry_stats");

    ok(await call("teaching_note", { id: BACH, measure: 1 }), "— Measure 1", "**Right Hand:**", "**Left Hand:**");
    err(await call("teaching_note", { id: "no-such-song-xyz", measure: 1 }), `No song called "no-such-song-xyz"`);
    err(
      await call("teaching_note", { id: BACH, measure: 9999 }),
      "Measure 9999 doesn't exist",
      "only has",
    );

    ok(await call("suggest_song", {}), "I'd suggest:", "**Why this song?**", "song_info");
    ok(await call("suggest_song", { maxDuration: 0.001 }), "No songs match your criteria.");
    err(await call("suggest_song", { difficulty: "impossible" }), "must be one of", "beginner");

    ok(await call("list_measures", { id: BACH, startMeasure: 1, endMeasure: 1 }), "— Measures 1 to 1", "## Measure 1", "RH:");
    err(await call("list_measures", { id: "no-such-song-xyz" }), `No song called "no-such-song-xyz"`);
    err(await call("list_measures", { id: BACH, startMeasure: 5, endMeasure: 1 }), "doesn't fit");

    ok(await call("preview_teaching_cues", { id: BACH }), "teaching cues", "annotate_song");
    err(await call("preview_teaching_cues", { id: "no-such-song-xyz" }), `No song called "no-such-song-xyz"`);

    ok(await call("practice_setup", { id: BACH }), "# Practice Setup:", "ai-jam-sessions play " + BACH);
    ok(await call("practice_setup", { id: "coverage-one-note", playerLevel: "beginner" }), "# Practice Setup:", "loop");
    err(await call("practice_setup", { id: "no-such-song-xyz" }), `No song called "no-such-song-xyz"`);
  });

  it("sings a measure range and refuses a backwards range", async () => {
    ok(await call("sing_along", { id: BACH, startMeasure: 1, endMeasure: 1 }), "# Sing Along:", "**Mode:** note-names", "**Measure 1:**");
    ok(
      await call("sing_along", { id: BACH, startMeasure: 1, endMeasure: 1, mode: "solfege", withPiano: true, hand: "both", syncMode: "before" }),
      "**Mode:** solfege",
      "**Piano accompaniment:** enabled",
      "ai-jam-sessions sing",
    );
    err(await call("sing_along", { id: "no-such-song-xyz" }), `No song called "no-such-song-xyz"`);
    err(await call("sing_along", { id: BACH, startMeasure: 5, endMeasure: 1 }), "doesn't fit");
  });

  it("serves the four prompts with the song's facts, and says when the id is unknown", async () => {
    const listed = await client.listPrompts();
    expect(listed.prompts.map((prompt) => prompt.name).sort()).toEqual([
      "annotate_song",
      "maker_loop",
      "performance_review",
      "practice_plan",
    ]);

    const annotate = await client.getPrompt({ name: "annotate_song", arguments: { song_id: BACH } });
    const annotateText = JSON.stringify(annotate.messages);
    expect(annotateText).toContain("Prelude in C Major");
    expect(annotateText).toContain("key_moments");

    const missing = await client.getPrompt({ name: "practice_plan", arguments: { song_id: "no-such-song-xyz" } });
    expect(JSON.stringify(missing.messages)).toContain("no-such-song-xyz");
    expect(JSON.stringify(missing.messages)).toContain("not found");

    const review = await client.getPrompt({ name: "performance_review", arguments: {} });
    expect(JSON.stringify(review.messages)).toContain("playback_status");

    const maker = await client.getPrompt({
      name: "maker_loop",
      arguments: { song_id: BACH, style: "jazz" },
    });
    const makerText = JSON.stringify(maker.messages);
    expect(makerText).toContain("verify_harmony");
    expect(makerText).toContain("jazz");

    const makerMissing = await client.getPrompt({
      name: "maker_loop",
      arguments: { song_id: "no-such-song-xyz" },
    });
    expect(JSON.stringify(makerMissing.messages)).toContain("no-such-song-xyz");
    expect(JSON.stringify(makerMissing.messages)).toContain("not found");
  });

  it("jams on a song, detects chords, and compares two library songs", async () => {
    ok(await call("ai_jam_sessions", { songId: BACH, style: "jazz", mood: "gentle" }), "# Jam Brief:", "## Source Material");
    err(await call("ai_jam_sessions", {}), "I need either a song ID or a genre");
    err(await call("ai_jam_sessions", { songId: "no-such-song-xyz" }), `No song called "no-such-song-xyz"`);

    ok(await call("detect_chord", { notes: [60, 64, 67] }), "**Chord:** C", "**Notes:**");
    const single = ok(await call("detect_chord", { notes: [60] }), "**Notes:**");
    expect(single).toMatch(/at least 2/);
    const unknown = ok(await call("detect_chord", { notes: [60, 61] }), "**Notes:**");
    expect(unknown).toMatch(/No known chord pattern matched/);
    err(await call("detect_chord", { notes: [200] }), "MIDI integer");

    ok(await call("compare_songs", { song_a: BACH, song_b: "coverage-one-note" }), "# Song Comparison", "Coverage One Note");
    err(await call("compare_songs", { song_a: "no-such-song-xyz", song_b: BACH }), `No song called "no-such-song-xyz"`);
    err(await call("compare_songs", { song_a: BACH, song_b: "no-such-song-xyz" }), `No song called "no-such-song-xyz"`);
  });

  it("validates, rejects, and imports songs, and labels a section", async () => {
    ok(await call("validate_song_entry", { song: JSON.stringify(ONE_NOTE) }), `Song "coverage-one-note" is valid!`, "Ready to add");
    err(await call("validate_song_entry", { song: "{" }), "Invalid JSON:");
    err(await call("validate_song_entry", { song: "{}" }), "Validation found");

    err(await call("add_song", { song: "not-json" }), "Failed to add song:");
    err(await call("add_song", { song: JSON.stringify({ id: "coverage-invalid-shape" }) }), "didn't pass validation");
    err(
      await call("add_song", { song: JSON.stringify({ ...ONE_NOTE, id: "Not A Slug" }) }),
      "isn't a valid song ID",
    );
    err(await call("add_song", { song: JSON.stringify(ONE_NOTE) }), `A song with ID "coverage-one-note" already exists`);

    const midiPath = join(tmpHome, "coverage-one.mid");
    writeFileSync(midiPath, oneNoteMidi());
    const brokenPath = join(tmpHome, "coverage-broken.mid");
    writeFileSync(brokenPath, Buffer.from("not a midi file"));
    const outside = join(fileURLToPath(new URL("..", import.meta.url)), "coverage-outside.mid");

    ok(
      await call("import_midi", {
        midi_path: midiPath,
        id: "coverage-imported",
        title: "Coverage Import",
        genre: "classical",
        difficulty: "beginner",
        key: "C major",
        composer: "Coverage",
      }),
      `MIDI imported as "Coverage Import" (coverage-imported).`,
      "Saved to:",
    );
    expect(existsSync(join(tmpHome, ".ai-jam-sessions", "songs", "coverage-imported.json"))).toBe(true);
    err(
      await call("import_midi", {
        midi_path: midiPath,
        id: "coverage-imported",
        title: "Coverage Import",
        genre: "classical",
        difficulty: "beginner",
        key: "C major",
      }),
      `A song with ID "coverage-imported" already exists`,
    );
    err(
      await call("import_midi", {
        midi_path: "nope.txt",
        id: "coverage-bad-ext",
        title: "Nope",
        genre: "folk",
        difficulty: "beginner",
        key: "C major",
      }),
      "must be a .mid or .midi file",
    );
    err(
      await call("import_midi", {
        midi_path: outside,
        id: "coverage-outside",
        title: "Outside",
        genre: "folk",
        difficulty: "beginner",
        key: "C major",
      }),
      "within your home directory",
    );
    err(
      await call("import_midi", {
        midi_path: brokenPath,
        id: "coverage-broken-import",
        title: "Broken",
        genre: "folk",
        difficulty: "beginner",
        key: "C major",
      }),
      "Failed to import MIDI:",
    );

    const transposed = ok(await call("transpose_song", { id: BACH, semitones: 0 }), "No transposition needed", "C major");
    expect(transposed).toContain("already in");
    err(await call("transpose_song", { id: "no-such-song-xyz", semitones: 1 }), `No song called "no-such-song-xyz"`);

    ok(await call("list_sections", { id: BACH }), "has no section markers yet", "add_section");
    err(await call("add_section", { id: "no-such-song-xyz", name: "Intro", startMeasure: 1, endMeasure: 1 }), `No song called "no-such-song-xyz"`);
    err(await call("add_section", { id: BACH, name: "Backwards", startMeasure: 4, endMeasure: 1 }), "needs to be at or after");
    err(await call("add_section", { id: "coverage-one-note", name: "Too Big", startMeasure: 1, endMeasure: 9 }), "only has 1 measures");
    ok(
      await call("add_section", { id: "coverage-one-note", name: "Only", startMeasure: 1, endMeasure: 1, description: "the whole piece" }),
      "Added section **Only**",
      "Saved to:",
    );
    ok(await call("list_sections", { id: "coverage-one-note" }), "# Coverage One Note — Sections", "| Only | 1–1 |");
    err(await call("list_sections", { id: "no-such-song-xyz" }), `No song called "no-such-song-xyz"`);
  });

  it("tunes a keyboard and a guitar, then resets both", async () => {
    const keyboards = ok(
      await call("list_keyboards", {}),
      "# Piano Keyboards",
      "## Concert Grand **(default)**",
      "**ID:** `grand`",
    );
    expect(times(keyboards, "**(default)**")).toBe(1);
    await schemaRejects("list_keyboards");
    err(await call("tune_keyboard", { id: "grand" }), "No tuning parameters provided.");
    err(await call("tune_keyboard", { id: "no-such-voice" }), "Invalid option", "grand");
    ok(await call("tune_keyboard", { id: "grand", brightness: 0.2 }), "Tuned **Concert Grand**", "**brightness**: 0.2");
    ok(await call("get_keyboard_config", { id: "grand" }), "# Concert Grand (`grand`)", "| Parameter | Factory | Current | Range |", "0.2");
    err(await call("get_keyboard_config", { id: "no-such-voice" }), "Invalid option", "grand");
    ok(await call("reset_keyboard", { id: "grand" }), "to factory defaults", "`grand`");
    ok(await call("reset_keyboard", { id: "upright" }), "already at factory defaults");
    err(await call("reset_keyboard", { id: "no-such-voice" }), "Invalid option", "grand");

    const guitarVoices = ok(
      await call("list_guitar_voices", {}),
      "# Guitar Voices",
      "## Steel Dreadnought **(default)**",
      "**ID:** `steel-dreadnought`",
    );
    expect(times(guitarVoices, "**(default)**")).toBe(1);
    await schemaRejects("list_guitar_voices");
    const tunings = ok(
      await call("list_guitar_tunings", {}),
      "# Guitar Tunings",
      "## Standard (EADGBE) **(default)**",
      "**ID:** `standard`",
    );
    expect(times(tunings, "**(default)**")).toBe(1);
    await schemaRejects("list_guitar_tunings");
    err(await call("tune_guitar", { id: "steel-dreadnought" }), "No tuning parameters provided.");
    err(await call("tune_guitar", { id: "no-such-voice" }), "Invalid option", "steel-dreadnought");
    ok(await call("tune_guitar", { id: "steel-dreadnought", brightness: 0.2 }), "Tuned **Steel Dreadnought**", "**brightness**: 0.2", "reset_guitar");
    ok(await call("get_guitar_config", { id: "steel-dreadnought" }), "# Steel Dreadnought (`steel-dreadnought`)", "| Parameter | Factory | Current | Range |");
    err(await call("get_guitar_config", { id: "no-such-voice" }), "Invalid option", "steel-dreadnought");
    ok(await call("reset_guitar", { id: "steel-dreadnought" }), "to factory defaults", "steel-dreadnought");
    ok(await call("reset_guitar", { id: "classical-nylon" }), "already at factory defaults");
    err(await call("reset_guitar", { id: "no-such-voice" }), "Invalid option", "steel-dreadnought");
  });

  it("draws a piano roll and a one-measure guitar tab", async () => {
    const roll = await call("view_piano_roll", { songId: BACH, startMeasure: 1, endMeasure: 1, color_mode: "pitch-class" });
    expect(roll.isError).not.toBe(true);
    const image = roll.content.find((item) => item.type === "image");
    expect(image?.mimeType).toBe("image/svg+xml");
    expect(Buffer.from(image?.data ?? "", "base64").toString("utf8")).toContain("<svg");
    err(await call("view_piano_roll", { songId: "no-such-song-xyz" }), `No song called "no-such-song-xyz"`);

    ok(
      await call("view_guitar_tab", { songId: BACH, startMeasure: 1, endMeasure: 1, tuning: "drop-d" }),
      "Guitar tab editor written to:",
      "Tuning: drop-d",
      "M1:",
    );
    err(await call("view_guitar_tab", { songId: "no-such-song-xyz" }), `No song called "no-such-song-xyz"`);
  });

  it("scores an annotation and reports library progress", async () => {
    ok(await call("score_annotation", { song_id: BACH }), "# Annotation Quality:", "**Grade:");
    err(await call("score_annotation", { song_id: "no-such-song-xyz" }), `No song called "no-such-song-xyz"`);
    ok(await call("annotation_progress", {}), "# Library Annotation Progress", "**Total:", "**Completion:");
    await schemaRejects("annotation_progress");
    ok(await call("server_info", {}), "ai-jam-sessions v", "**Tools:**");
    await schemaRejects("server_info");
  });

  it("pauses and resumes a library song without tearing it down, and stops the sung lead on pause", async () => {
    audioDouble.gate = false;
    audioDouble.fakeSinger = true;
    try {
      ok(await call("play_song", { id: BACH, lyrics: "la la la" }), "Now playing:");
      const paused = ok(await call("pause_playback", {}), "Paused (", "The sung lead stopped");
      expect(paused).toContain("cannot resume in step with the piano");
      await flushTurns(40);
      expect(audioDouble.singerStops).toBe(1);
      const afterPause = audioDouble.disconnects;
      ok(await call("pause_playback", { resume: true }), "Resumed playback.");
      await flushTurns(10);
      expect(audioDouble.disconnects).toBe(afterPause);
      ok(await call("stop_playback", {}), "Stopped:");
      await flushTurns(40);
      expect(audioDouble.disconnects).toBeGreaterThan(afterPause);
    } finally {
      audioDouble.fakeSinger = false;
    }
  });

  it("writes a practice note and reads it back", async () => {
    ok(await call("read_practice_journal", {}), "No practice journal entries yet.");
    ok(
      await call("save_practice_note", { note: "heard the arpeggios", song_id: BACH }),
      "Journal entry saved to ",
      "Total:",
      "heard the arpeggios",
    );
    ok(await call("read_practice_journal", {}), "Practice journal (", "entries across", "heard the arpeggios");
    // Entries carry the song's title, not its id: filtering by the id must
    // still find the song's own note, and must not return other songs' notes.
    ok(await call("read_practice_journal", { song_id: BACH }), "heard the arpeggios");
    // A note left without song_id belongs to the last song played, so the
    // other song is named explicitly.
    ok(await call("save_practice_note", { note: "the one-note drill", song_id: "coverage-one-note" }), "Journal entry saved to ");
    const filtered = ok(await call("read_practice_journal", { song_id: BACH }), "heard the arpeggios");
    expect(filtered).not.toContain("the one-note drill");
    ok(await call("read_practice_journal", { song_id: "coverage-one-note" }), "the one-note drill");
    ok(await call("read_practice_journal", { song_id: "no-such-song-xyz" }), `No journal entries found for "no-such-song-xyz"`);
    err(await call("read_practice_journal", { days: 0 }), "days");
  });

  it("plays a library song on each engine and reports status, mute, speed, and stop", async () => {
    audioDouble.gate = true;
    const started = ok(
      await call("play_song", { id: "coverage-one-note", engine: "piano", keyboard: "upright", speed: 0.5, metronome: true, countIn: 1, record: true }),
      "Now playing:",
      "**Keyboard:** upright",
      "**Metronome:** on",
      "**Recording:** on",
    );
    expect(started).toContain("Coverage One Note");
    expect(audioDouble.connectedEngine).toBe("piano");
    await waitForGatedNote();

    ok(await call("playback_status", {}), "# Playback Status", "**Song:**", "**State:**", "upright");
    ok(await call("mute_hand", { hand: "left", muted: true }), "Left hand muted.", "LH muted");
    ok(await call("mute_hand", { hand: "left", muted: false }), "Left hand unmuted.", "LH playing");
    ok(await call("set_speed", { speed: 1.5 }), "Speed changed to 1.5x");
    ok(await call("pause_playback", {}), "Paused (");
    ok(await call("stop_playback", {}), "Stopped:", "Coverage One Note");

    audioDouble.gate = true;
    ok(await call("play_song", { id: "coverage-one-note" }), "Now playing:");
    await waitForGatedNote();
    ok(await call("pause_playback", {}), "Paused (");
    audioDouble.gate = false;
    audioDouble.releaseAll();
    ok(await call("pause_playback", { resume: true }), "Resumed playback.");

    ok(await call("ensemble_now", {}), "Nothing is playing, so there is no ensemble");
    ok(await call("pause_playback", {}), "No song is currently playing.");
    ok(await call("pause_playback", { resume: true }), "Nothing is paused.");
    ok(await call("set_speed", { speed: 1 }), "No song is currently playing.");
    ok(await call("stop_playback", {}), "No song is currently playing.");
    err(await call("mute_hand", { hand: "right", muted: true }), "No song is currently playing.");
    await schemaRejects("playback_status");
    await schemaRejects("ensemble_now");
  });

  it("selects guitar, tract, and vocal, and refuses a missing sample pack", async () => {
    audioDouble.gate = true;
    ok(await call("play_song", { id: "coverage-one-note", engine: "guitar", guitarVoice: "classical-nylon" }), "Now playing:");
    expect(audioDouble.connectedEngine).toBe("guitar");
    await waitForGatedNote();
    ok(await call("stop_playback", {}), "Stopped:", "Coverage One Note");

    ok(await call("play_song", { id: "coverage-one-note", engine: "tract", tractVoice: "tenor" }), "Now playing:");
    expect(audioDouble.connectedEngine).toBe("tract");
    await waitForGatedNote();
    ok(await call("stop_playback", {}), "Stopped:", "Coverage One Note");

    ok(await call("play_song", { id: "coverage-one-note", engine: "vocal" }), "Now playing:");
    expect(audioDouble.connectedEngine).toBe("vocal");
    await waitForGatedNote();

    err(await call("play_song", { id: "coverage-one-note", engine: "sample" }), "Sampled piano is not installed");
    audioDouble.connectError = "device missing";
    err(await call("play_song", { id: "coverage-one-note", engine: "piano" }), "Couldn't start the", "device missing");
    audioDouble.connectError = null;

    audioDouble.gate = false;
    audioDouble.releaseAll();
    err(await call("play_song", { id: "coverage-one-note", startMeasure: 1 }), "provide both startMeasure and endMeasure");
    err(await call("play_song", { id: BACH, startMeasure: 3, endMeasure: 1 }), "needs to be at or after");
    err(await call("play_song", { id: "no-such-song-xyz" }), `No song called "no-such-song-xyz"`);
    err(
      await call("play_song", { id: "coverage-one-note", startMeasure: 9 }),
      "startMeasure (9) exceeds",
      "Coverage One Note",
    );
  });

  it("plays a MIDI file with singing and teaching, and shows the live ensemble", async () => {
    const midiPath = join(tmpHome, "coverage-play.mid");
    writeFileSync(midiPath, heldNoteMidi());
    const outside = join(fileURLToPath(new URL("..", import.meta.url)), "coverage-outside.mid");
    err(await call("play_song", { id: outside }), "Can't access", "home directory");

    const broken = join(tmpHome, "coverage-broken-play.mid");
    writeFileSync(broken, Buffer.from("not midi"));
    err(await call("play_song", { id: broken }), "Couldn't read that MIDI file");

    await setLiveAudioContext({ sampleRate: 48000 });
    audioDouble.gate = false;
    // The note-off and the play-loop sleep are both ~2s timers. Advancing
    // fires every timer due at that instant, so play() finishes and its
    // finally clears the ensemble. Silence is read on the note-off turn,
    // before that clear.
    vi.useFakeTimers();
    try {
      const started = ok(
        await call("play_song", { id: midiPath, withSinging: true, withTeaching: true, singMode: "solfege" }),
        "Now playing:",
        "(MIDI file)",
        "**Features:**",
        "singing (solfege)",
        "teaching feedback",
      );
      expect(started).toContain("**Notes:**");
      // heldNoteMidi is note 60, C4, and it is still held here.
      const live = ok(
        await call("ensemble_now", {}),
        "# The ensemble, right now",
        "**Sounding together:** C4",
      );
      expect(live).not.toContain("**Silence.**");
      ok(await call("playback_status", {}), "# Playback Status (MIDI)", "**State:**", "**Events:**");
      ok(await call("set_speed", { speed: 2 }), "Speed changed:", "2x");
      // noteOff runs, the ensemble updates, then play()'s sleep settles and
      // clears the ensemble. Read the view from the note-off turn, before
      // that clear. The inner noteOff returns before the controller emits,
      // so the read is a microtask after the emit.
      let released = "";
      audioDouble.onNoteOff = () => {
        queueMicrotask(() => {
          void call("ensemble_now", {}).then((result) => {
            released = extractText(result);
          });
        });
      };
      await vi.advanceTimersToNextTimerAsync();
      await vi.runAllTicks();
      audioDouble.onNoteOff = null;
      expect(released, released || "(ensemble view was not read on note-off)").toContain("# The ensemble, right now");
      expect(released).toContain("**Silence.**");
      expect(released).not.toContain("**Sounding together:**");
    } finally {
      audioDouble.onNoteOff = null;
      vi.useRealTimers();
    }

    ok(await call("play_song", { id: midiPath, withSinging: true, withTeaching: true }), "Now playing:", "(MIDI file)");
    ok(await call("stop_playback", {}), "Stopped:", "MIDI file");

    ok(await call("play_song", { id: midiPath, withSinging: true }), "Now playing:", "(MIDI file)");
    // pause() settles the controller's play() promise. The playback must
    // outlive that: no disconnect on pause, a working resume, and the
    // teardown only when it really ends (here, a stop while paused).
    ok(await call("pause_playback", {}), "Paused at");
    await flushTurns(40);
    const afterPause = audioDouble.disconnects;
    ok(await call("pause_playback", { resume: true }), "Resumed playback.");
    await flushTurns(10);
    expect(audioDouble.disconnects).toBe(afterPause);
    ok(await call("pause_playback", {}), "Paused at");
    await flushTurns(40);
    ok(await call("stop_playback", {}), "Stopped:", "MIDI file");
    await flushTurns(40);
    expect(audioDouble.disconnects).toBeGreaterThan(afterPause);
    ok(await call("pause_playback", { resume: true }), "Nothing is paused.");

    const raw = ok(await call("play_song", { id: midiPath }), "Now playing:", "(MIDI file)");
    expect(raw).not.toContain("**Features:**");
    ok(await call("playback_status", {}), "Playback active (MIDI engine, no detailed status available).");
    ok(await call("set_speed", { speed: 2 }), "Speed changed:", "2x");
    ok(await call("stop_playback", {}), "Stopped:", "events played");
    ok(await call("play_song", { id: midiPath }), "Now playing:");
    ok(await call("pause_playback", {}), "Paused at");
    await flushTurns(40);
    const rawAfterPause = audioDouble.disconnects;
    ok(await call("pause_playback", { resume: true }), "Resumed playback.");
    expect(audioDouble.disconnects).toBe(rawAfterPause);
    ok(await call("stop_playback", {}), "Stopped:", "events played");

    audioDouble.noteOnError = "midi string snapped";
    ok(await call("play_song", { id: midiPath }), "Now playing:", "(MIDI file)");
    await flushTurns(20);
    ok(await call("playback_status", {}), "**Last error:**", "midi string snapped");
    audioDouble.noteOnError = null;
    await flushTurns(20);
  });

  it("practice_loop states its max-pass cap", async () => {
    audioDouble.gate = true;
    ok(
      await call("practice_loop", {
        id: "coverage-one-note",
        startMeasure: 1,
        endMeasure: 1,
        maxPasses: 2,
        speedStartPct: 80,
        speedTargetPct: 100,
      }),
      "Practice loop started:",
      "**Max passes:** 2",
      "measures 1–1",
    );
    await waitForGatedNote();
    ok(await call("playback_status", {}), "A practice loop is running");
    audioDouble.gate = false;
    audioDouble.releaseAll();
    ok(await call("stop_playback", {}), "Stopped:", "Practice loop");
  });

  it("records a finished take, scores it, and draws the scored roll", async () => {
    audioDouble.gate = false;
    ok(
      await call("play_song", {
        id: "coverage-one-note",
        record: true,
        withSinging: true,
        withTeaching: true,
        mode: "measure",
        tempo: 200,
        speed: 4,
      }),
      "Now playing:",
      "**Recording:** on",
      "**Mode:** measure",
    );
    expect(audioDouble.connectedEngine).toBe("piano");
    await flushTurns(80);
    const status = ok(await call("playback_status", {}));
    expect(status).toMatch(/No active playback/);

    const statePath = join(tmpHome, ".ai-jam-sessions", "server-state.json");
    expect(existsSync(statePath)).toBe(true);
    const saved = JSON.parse(readFileSync(statePath, "utf8")) as { lastCompletedSession?: { songId?: string } };
    expect(saved.lastCompletedSession?.songId).toBe("coverage-one-note");

    ok(await call("score_last_take", {}), "# Scored Take:", "**Overall Score:**", "view_scored_piano_roll");
    const scored = await call("view_scored_piano_roll", {});
    expect(scored.isError).not.toBe(true);
    expect(extractText(scored)).toContain("Scored piano roll written to:");
    expect(scored.content.some((item) => item.mimeType === "image/svg+xml")).toBe(true);

    audioDouble.playNoteError = "string snapped";
    ok(await call("play_song", { id: "coverage-one-note" }), "Now playing:");
    await flushTurns(30);
    const failed = ok(await call("playback_status", {}), "No active playback.", "**Last error:**", "string snapped");
    expect(failed).toContain("coverage-one-note");
    audioDouble.playNoteError = null;
  });

  it("refuses a sung lead when the SoulX score file is not in the library", async () => {
    err(
      await call("play_song", {
        id: "coverage-one-note",
        lyrics: "la",
        singerBackend: "soulx",
        startMeasure: 1,
        endMeasure: 1,
      }),
      "Couldn't start the sung lead:",
    );
  });

  it("scores a MIDI performance that lives inside the home directory", async () => {
    const midiPath = join(tmpHome, "coverage-score.mid");
    writeFileSync(midiPath, oneNoteMidi());
    ok(
      await call("score_performance", { song_id: "coverage-one-note", midi_path: midiPath, tolerance_ms: 200 }),
      "# Performance Assessment:",
      "**Overall Score:",
      "Pitch accuracy:",
    );
    err(await call("score_performance", { song_id: "no-such-song-xyz", midi_path: midiPath }), `No song called "no-such-song-xyz"`);
    err(await call("score_performance", { song_id: "coverage-one-note", midi_path: "notes.txt" }), "doesn't look like a MIDI file");
    const outside = join(fileURLToPath(new URL("..", import.meta.url)), "coverage-outside.mid");
    err(await call("score_performance", { song_id: "coverage-one-note", midi_path: outside }), "home directory");
    const broken = join(tmpHome, "coverage-score-broken.mid");
    writeFileSync(broken, Buffer.from("nope"));
    err(await call("score_performance", { song_id: "coverage-one-note", midi_path: broken }), "Failed to score performance:");
  });
});

describe("mcp-server.ts — audio inspection tools not covered elsewhere", () => {
  const SR = 22050;
  let client: Client;
  let dir: string;
  let closeShared: () => Promise<void> = async () => {};

  const tone = (hz: number, sec: number, amp = 0.4) =>
    Float64Array.from({ length: Math.round(sec * SR) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));

  async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    return (await client.callTool({ name, arguments: args })) as ToolResult;
  }

  beforeAll(async () => {
    const iso = await spawnIsolatedServer();
    client = iso.client;
    closeShared = iso.close;
    dir = mkdtempSync(join(tmpdir(), "ajs-mcp-wav-"));
    writeWav16(join(dir, "a4.wav"), tone(440, 0.5), SR);
    writeWav16(join(dir, "silence.wav"), new Float64Array(SR), SR);
    // overlay's missing-song errors run after cqt(). A short file keeps
    // those two transforms small. The drawn pictures use a4.wav.
    writeWav16(join(dir, "blip.wav"), tone(440, 0.08), SR);
  }, 30000);

  afterAll(async () => {
    await closeShared();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("transcribes a 440 Hz tone and refuses a missing file", async () => {
    const text = extractText(await call("transcribe_audio", { path: join(dir, "a4.wav"), min_confidence: 0.5 }));
    expect(text).toContain("# Transcription");
    expect(text).toMatch(/\*\*[1-9]\d* notes? recovered\.\*\*/);
    expect(text).toContain("A4");
    const missing = await call("transcribe_audio", { path: join(dir, "no-such-file-xyz.wav") });
    expect(missing.isError).toBe(true);
    expect(extractText(missing)).toContain('No file at "');
    const quiet = extractText(await call("transcribe_audio", { path: join(dir, "silence.wav") }));
    expect(quiet).toContain("Nothing was pitched enough to call a note.");
  }, 20000);

  it("scores a pitched take by ear and refuses silence and an unknown song", async () => {
    const scored = await call("score_audio_take", { path: join(dir, "a4.wav"), song_id: BACH, bpm: 80 });
    expect(scored.isError).not.toBe(true);
    const text = extractText(scored);
    expect(text).toContain("# Scored by ear:");
    expect(text).toMatch(/\*\*Overall \d+\/100\*\*/);
    expect(text).toContain("view_scored_piano_roll");

    const silent = await call("score_audio_take", { path: join(dir, "silence.wav"), song_id: BACH });
    expect(silent.isError).toBe(true);
    expect(extractText(silent)).toContain("Nothing pitched enough to grade");

    const unknown = await call("score_audio_take", { path: join(dir, "a4.wav"), song_id: "no-such-song-xyz" });
    expect(unknown.isError).toBe(true);
    expect(extractText(unknown)).toContain(`No song called "no-such-song-xyz"`);

    const roll = await call("view_scored_piano_roll", {});
    expect(roll.isError).not.toBe(true);
    expect(extractText(roll)).toContain("Scored piano roll written to:");
    expect(roll.content.some((item) => item.mimeType === "image/svg+xml")).toBe(true);
  }, 20000);

  it("draws a spectrogram and refuses a bad window, a missing overlay song, and a missing file", async () => {
    const drawn = await call("view_spectrogram", { path: join(dir, "a4.wav"), colormap: "grey", end_sec: 0.5 });
    expect(drawn.isError).not.toBe(true);
    const text = extractText(drawn);
    expect(text).toContain("# Spectrogram");
    expect(text).toContain("SOUND ONLY");
    expect(text).toContain("grey");
    const png = drawn.content.find((item) => item.type === "image");
    expect(png?.mimeType).toBe("image/png");
    expect((png?.data ?? "").length).toBeGreaterThan(100);

    const overlaid = await call("view_spectrogram", {
      path: join(dir, "a4.wav"),
      overlay: true,
      song_id: BACH,
      end_sec: 0.5,
      colormap: "magma",
    });
    expect(overlaid.isError).not.toBe(true);
    expect(extractText(overlaid)).toContain("intended notes");
    expect(overlaid.content.some((item) => item.mimeType === "image/png")).toBe(true);

    const noSong = await call("view_spectrogram", { path: join(dir, "blip.wav"), overlay: true, end_sec: 0.08 });
    expect(noSong.isError).toBe(true);
    expect(extractText(noSong)).toContain("overlay needs a song_id");

    const unknown = await call("view_spectrogram", {
      path: join(dir, "blip.wav"),
      overlay: true,
      song_id: "no-such-song-xyz",
      end_sec: 0.08,
    });
    expect(unknown.isError).toBe(true);
    expect(extractText(unknown)).toContain(`No song called "no-such-song-xyz"`);

    const empty = await call("view_spectrogram", { path: join(dir, "a4.wav"), start_sec: 9, end_sec: 9 });
    expect(empty.isError).toBe(true);
    expect(extractText(empty)).toContain("window");

    const missing = await call("view_spectrogram", { path: join(dir, "no-such-file-xyz.wav") });
    expect(missing.isError).toBe(true);
    expect(extractText(missing)).toContain('No file at "');

    const missingAnalysis = await call("analyze_audio", { path: join(dir, "no-such-file-xyz.wav") });
    expect(missingAnalysis.isError).toBe(true);
    expect(extractText(missingAnalysis)).toContain('No file at "');
    // v8 on the coverage job pushed the two half-second renders past 30s.
  }, 90000);
});

describe("mcp-server.ts — annotate_song promotes a disposable raw fixture", () => {
  const FIXTURE_SONG_ID = "zz-test-fixture-annotate-success";

  it("writes the annotation into the user songs directory and removes the fixture", async () => {
    const libraryRoot = fileURLToPath(new URL("../songs/library", import.meta.url));
    const fixtureConfigPath = join(libraryRoot, "classical", `${FIXTURE_SONG_ID}.json`);
    const fixtureMidiPath = join(libraryRoot, "classical", `${FIXTURE_SONG_ID}.mid`);
    rmSync(fixtureConfigPath, { force: true });
    rmSync(fixtureMidiPath, { force: true });
    writeFileSync(fixtureMidiPath, oneNoteMidi());
    writeFileSync(
      fixtureConfigPath,
      JSON.stringify({
        id: FIXTURE_SONG_ID,
        title: "Annotate Success Fixture",
        genre: "classical",
        difficulty: "beginner",
        key: "C major",
        tempo: 120,
        timeSignature: "4/4",
        tags: ["test-fixture"],
        status: "raw",
      }, null, 2) + "\n",
      "utf8",
    );

    const iso = await spawnIsolatedServer();
    try {
      const result = (await iso.client.callTool({
        name: "annotate_song",
        arguments: {
          song_id: FIXTURE_SONG_ID,
          description: "A one-note fixture annotated so the promote path can be read.",
          structure: "A",
          key_moments: ["The only note."],
          teaching_goals: ["Hear the note."],
          style_tips: ["Let it ring."],
        },
      })) as ToolResult;
      const text = extractText(result);
      expect(result.isError, text).not.toBe(true);
      expect(text).toContain("annotated and promoted to ready!");
      expect(text).toContain("Persisted to:");
      const saved = join(iso.tmpHome, ".ai-jam-sessions", "songs", `${FIXTURE_SONG_ID}.json`);
      expect(existsSync(saved)).toBe(true);
      const parsed = JSON.parse(readFileSync(saved, "utf8")) as { status?: string; musicalLanguage?: { structure?: string } };
      expect(parsed.musicalLanguage?.structure).toBe("A");
      expect(text).toContain("The song is now playable");

      const missing = (await iso.client.callTool({
        name: "annotate_song",
        arguments: {
          song_id: "no-such-song-xyz",
          description: "x",
          structure: "y",
          key_moments: ["m"],
          teaching_goals: ["g"],
          style_tips: ["s"],
        },
      })) as ToolResult;
      expect(missing.isError).toBe(true);
      expect(extractText(missing)).toContain(`Song "no-such-song-xyz" not found`);
    } finally {
      await iso.close();
      rmSync(fixtureConfigPath, { force: true });
      rmSync(fixtureMidiPath, { force: true });
    }
  }, 30000);
});
