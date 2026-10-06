// In-process CLI coverage. Engines are fakes: no audio device, no network.
// The user directory is a temp AI_JAM_HOME. Nothing is written into songs/library.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GUITAR_TUNING_IDS } from "./guitar-voices.js";
import * as journalApi from "./journal.js";
import { VOICE_IDS } from "./piano-voices.js";
import { DIFFICULTIES, GENRES } from "./songs/index.js";
import { VERSION } from "./version.js";
import { runCli, type CliIo, type RunCliOptions } from "./cli.js";

const engines = vi.hoisted(() => ({
  connectError: null as null | string,
  ports: [] as string[],
  lastPort: undefined as string | undefined,
  browserError: null as null | Error,
  disconnects: 0,
  opened: [] as string[][],
  prepare: "ok" as "ok" | "throw" | "skip" | "many",
  fetchStatus: "fetched" as "fetched" | "http-error",
}));

function fakeConnector(): {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  status: () => "connected";
  listPorts: () => string[];
  noteOn: () => void;
  noteOff: () => void;
  allNotesOff: () => void;
  playNote: () => Promise<void>;
} {
  return {
    async connect() {
      if (engines.connectError) throw new Error(engines.connectError);
    },
    async disconnect() {
      engines.disconnects += 1;
    },
    status: () => "connected",
    listPorts: () => engines.ports,
    noteOn() {},
    noteOff() {},
    allNotesOff() {},
    async playNote() {},
  };
}

vi.mock("./audio-engine.js", () => ({ createAudioEngine: () => fakeConnector() }));
vi.mock("./sample-engine.js", () => ({ createSampleEngine: () => fakeConnector() }));
vi.mock("./vocal-engine.js", () => ({ createVocalEngine: () => fakeConnector() }));
vi.mock("./vocal-tract-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vocal-tract-engine.js")>();
  return { ...actual, createTractEngine: () => fakeConnector() };
});
vi.mock("./guitar-engine.js", () => ({ createGuitarEngine: () => fakeConnector() }));
vi.mock("./vocal-synth-adapter.js", () => ({ createVocalSynthEngine: () => fakeConnector() }));
vi.mock("./vmpk.js", () => ({
  createVmpkConnector: (opts?: { portName?: string }) => {
    engines.lastPort = opts?.portName;
    return fakeConnector();
  },
}));
vi.mock("./playback/metronome.js", () => ({
  createMetronome: () => ({
    start() {},
    stop() {},
    setTempo() {},
    async countIn() {},
  }),
}));
vi.mock("./vocal/prepare.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vocal/prepare.js")>();
  return {
    ...actual,
    prepareScoreLocked: async () => {
      if (engines.prepare === "throw") throw new Error("coverage lyric build failed");
      const notes = engines.prepare === "many"
        ? Array.from({ length: 13 }, (_, i) => ({ midi: 60 + (i % 12) }))
        : [{ midi: 60 }, { midi: 64 }, { midi: 67 }];
      const warnings = engines.prepare === "many"
        ? Array.from({ length: 9 }, (_, i) => `coverage warning ${i + 1}`)
        : ["coverage warning one"];
      return {
        singer: {
          durationSec: 0.4,
          async connect() {
            if (engines.prepare === "skip") throw new Error("coverage singer offline");
          },
          start() {},
          async stop() {},
        },
        score: { warnings, notes },
      };
    },
  };
});
vi.mock("./vocal/svs-offline.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vocal/svs-offline.js")>();
  return {
    ...actual,
    renderOfflineSvs: async (_score: unknown, opts: { backend: string; outPath: string }) => {
      if (opts.backend === "diffsinger") throw new Error("DIFFSINGER_ROOT is not pinned");
      writeFileSync(opts.outPath, "RIFF-coverage");
      return { outPath: opts.outPath, durationSec: 0.4, backend: opts.backend };
    },
  };
});
vi.mock("./songs/fetch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./songs/fetch.js")>();
  return {
    ...actual,
    fetchOne: async (candidate: { id: string }) => ({
      id: candidate.id,
      status: engines.fetchStatus,
      detail: engines.fetchStatus === "fetched" ? "coverage bytes" : "coverage http failure",
    }),
  };
});
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: (file: string, args: readonly string[], cb?: (err: Error | null) => void) => {
      engines.opened.push([file, ...args]);
      cb?.(engines.browserError);
      return {} as ReturnType<typeof actual.execFile>;
    },
  };
});

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

function shortMidi(): Buffer {
  const header = Buffer.from([
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
  ]);
  // One tick is about 1ms at 120 BPM and 480 ticks per quarter.
  const track = Buffer.from([
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
    0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
    0x00, 0x90, 0x3c, 0x50,
    0x01, 0x80, 0x3c, 0x00,
    0x00, 0xff, 0x2f, 0x00,
  ]);
  const trackHeader = Buffer.from([0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x00]);
  trackHeader.writeUInt32BE(track.length, 4);
  return Buffer.concat([header, trackHeader, track]);
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

function provenance() {
  return {
    schema: 1,
    source_url: "https://example.invalid/coverage.mid",
    source_site: "example.invalid",
    arrangement_creator: "Coverage",
    arrangement_license: "unknown" as const,
    terms_url: "https://example.invalid/terms",
    terms_quote: "coverage terms",
    verified_at: "2026-10-06",
    verifier: "coverage",
    midi_sha256: "a".repeat(64),
    midi_title_events: [],
    midi_credit_events: [],
    credited_parties: [],
    title_verdict: "no-title-in-file" as const,
  };
}

describe("cli.ts — commands through runCli", () => {
  let home: string;
  let state: string;
  let scratch: string;
  const previous: Record<string, string | undefined> = {};

  async function run(argv: string[], options?: RunCliOptions): Promise<{ code: number; out: string; err: string }> {
    let out = "";
    let err = "";
    const io: CliIo = {
      out: (text) => { out += text; },
      err: (text) => { err += text; },
    };
    const code = await runCli(argv, io, options);
    return { code, out, err };
  }

  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), "ajs-cli-"));
    state = join(home, "state");
    scratch = join(home, "scratch");
    mkdirSync(scratch, { recursive: true });
    for (const key of ["HOME", "USERPROFILE", "AI_JAM_HOME", "AI_JAM_SAMPLES_DIR", "ACE_STEP_CMD", "DIFFRHYTHM_CMD", "YUE_CMD"]) {
      previous[key] = process.env[key];
    }
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.AI_JAM_HOME = state;
    delete process.env.AI_JAM_SAMPLES_DIR;
    delete process.env.ACE_STEP_CMD;
    delete process.env.DIFFRHYTHM_CMD;
    delete process.env.YUE_CMD;
    mkdirSync(join(state, "songs"), { recursive: true });
    writeFileSync(join(state, "songs", "coverage-one-note.json"), JSON.stringify(ONE_NOTE));
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  });

  afterEach(() => {
    engines.connectError = null;
    engines.ports = [];
    engines.lastPort = undefined;
    engines.browserError = null;
    engines.disconnects = 0;
    engines.opened = [];
    engines.prepare = "ok";
    engines.fetchStatus = "fetched";
    delete process.env.AI_JAM_SAMPLES_DIR;
    delete process.env.ACE_STEP_CMD;
    delete process.env.DIFFRHYTHM_CMD;
    delete process.env.YUE_CMD;
  });

  it("help, its flags, and version print their own text", async () => {
    const bare = await runCli(["version"]);
    expect(bare).toBe(0);
    const help = await run(["help"]);
    expect(help.code).toBe(0);
    expect(help.out).toContain("ai-jam-sessions — Play music through your speakers");
    expect(help.out).toContain("practice <song-id> --measures <start-end>");
    expect(help.out).toContain("library                    Show library progress");

    const long = await run(["--help"]);
    expect(long.code).toBe(0);
    expect(long.out).toContain("ai-jam-sessions — Play music through your speakers");

    const short = await run(["-h"]);
    expect(short.code).toBe(0);
    expect(short.out).toContain("tune <keyboard> [options]");

    const version = await run(["version"]);
    expect(version.code).toBe(0);
    expect(version.out).toContain(`ai-jam-sessions v${VERSION}`);
    expect((await run(["--version"])).out).toContain(`ai-jam-sessions v${VERSION}`);
    expect((await run(["-V"])).out).toContain(`ai-jam-sessions v${VERSION}`);
  });

  it("an unknown command names itself, and a song id prints that song", async () => {
    const unknown = await run(["no-such-song-xyz"]);
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain(`Unknown command: "no-such-song-xyz". Run 'ai-jam-sessions help' for usage.`);

    const song = await run(["coverage-one-note"]);
    expect(song.code).toBe(0);
    expect(song.out).toContain("Coverage One Note");
    expect(song.out).toContain("Key: C major | Tempo: 120 BPM | Time: 4/4");
    expect(song.out).not.toContain("Unknown command");
  });

  it("list filters by genre and difficulty, and names a bad value", async () => {
    const all = await run(["list"]);
    expect(all.code).toBe(0);
    expect(all.out).toContain("coverage-one-note");
    expect(all.out).toContain("Coverage One Note");
    expect(all.out).toContain("song(s) found.");

    const folk = await run(["list", "--genre", "folk", "--difficulty", "advanced"]);
    expect(folk.code).toBe(0);
    expect(folk.out).toContain("coverage-one-note");

    const beginner = await run(["list", "--genre", "folk", "--difficulty", "beginner"]);
    expect(beginner.code).toBe(0);
    expect(beginner.out).not.toContain("coverage-one-note");
    expect(beginner.out).toContain("song(s) found.");

    const classical = await run(["list", "--genre", "classical"]);
    expect(classical.code).toBe(0);
    expect(classical.out).toContain("bach-prelude-c-major-bwv846");
    expect(classical.out).not.toContain("coverage-one-note");

    const badGenre = await run(["list", "--genre", "not-a-genre"]);
    expect(badGenre.code).toBe(1);
    expect(badGenre.err).toContain(`Unknown genre: "not-a-genre". Available: ${GENRES.join(", ")}`);

    const badDiff = await run(["list", "--difficulty", "not-a-level"]);
    expect(badDiff.code).toBe(1);
    expect(badDiff.err).toContain(`Unknown difficulty: "not-a-level". Available: ${DIFFICULTIES.join(", ")}`);
  });

  it("info prints the song, and a missing id is the usage line", async () => {
    const info = await run(["info", "coverage-one-note"]);
    expect(info.code).toBe(0);
    expect(info.out).toContain("Coverage One Note");
    expect(info.out).toContain("One quarter note, used to finish a take without a long song.");
    expect(info.out).toContain("Tags: coverage");

    const missing = await run(["info"]);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain("Usage: ai-jam-sessions info <song-id>");

    const unknown = await run(["info", "no-such-song-xyz"]);
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain(`Error [INPUT_INVALID_SONG]: Song not found: "no-such-song-xyz".`);
    expect(unknown.err).toContain("Hint: Run `ai-jam-sessions list` to see available songs.");
    expect(unknown.err).not.toContain(".mid file");
  });

  it("stats counts the registry, including an absent library directory", async () => {
    const stats = await run(["stats"]);
    expect(stats.code).toBe(0);
    expect(stats.out).toContain("Registry Stats:");
    expect(stats.out).toContain("Total songs:");
    expect(stats.out).toContain("folk");
    expect(stats.out).toContain("advanced");

    const missing = await run(["stats"], { libraryDir: join(scratch, "no-library-here") });
    expect(missing.code).toBe(0);
    expect(missing.err).toContain("Song library not found at");
    expect(missing.err).toContain("no-library-here");
    expect(missing.out).toContain("Total songs:");
  });

  it("ports lists the fake port, and the empty list says none were detected", async () => {
    engines.ports = [];
    const empty = await run(["ports"]);
    expect(empty.code).toBe(0);
    expect(empty.out).toContain("Checking available MIDI output ports...");
    expect(empty.out).toContain("No MIDI output ports detected.");
    expect(empty.out).not.toContain("Available ports:");

    engines.ports = ["LoopBe Internal"];
    const listed = await run(["ports"]);
    expect(listed.code).toBe(0);
    expect(listed.out).toContain("Available ports:");
    expect(listed.out).toContain("• LoopBe Internal");
    expect(listed.out).not.toContain("No MIDI output ports detected.");
  });

  it("keyboards and guitars mark one default each", async () => {
    const keys = await run(["keyboards"]);
    expect(keys.code).toBe(0);
    expect(keys.out).toContain("Concert Grand (default)");
    expect(keys.out).toContain("Upright Piano");
    expect(keys.out).not.toContain("Upright Piano (default)");
    expect(times(keys.out, "(default)")).toBe(1);

    const guitars = await run(["guitars"]);
    expect(guitars.code).toBe(0);
    expect(guitars.out).toContain("Steel Dreadnought (default)");
    expect(guitars.out).not.toContain("Classical Nylon (default)");
    expect(times(guitars.out, "(default)")).toBe(1);
  });

  it("tune shows, saves, and resets the grand, and refuses a bad value", async () => {
    const usage = await run(["tune"]);
    expect(usage.code).toBe(0);
    expect(usage.out).toContain("Usage: ai-jam-sessions tune <keyboard-id>");
    expect(usage.out).toContain(VOICE_IDS.join(", "));

    const unknown = await run(["tune", "not-a-keyboard"]);
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain(`Unknown keyboard: "not-a-keyboard". Valid: ${VOICE_IDS.join(", ")}`);

    const shown = await run(["tune", "grand", "--show"]);
    expect(shown.code).toBe(0);
    expect(shown.out).toContain("Concert Grand (grand)");
    expect(shown.out).toContain("Using factory preset.");
    expect(shown.out).not.toContain("user override");

    const tuned = await run(["tune", "grand", "--brightness", "0.3"]);
    expect(tuned.code).toBe(0);
    expect(tuned.out).toContain("Tuned Concert Grand (grand):");
    expect(tuned.out).toContain("brightness");
    expect(tuned.out).toContain("0.3");
    expect(tuned.out).toContain("1 total override(s) saved.");
    const saved = readFileSync(join(state, "voices", "grand.json"), "utf8");
    expect(saved).toContain("0.3");

    const again = await run(["tune", "grand", "--show"]);
    expect(again.out).toContain("user override (1 total)");
    expect(again.out).toContain("0.3 *");

    const reset = await run(["tune", "grand", "--reset"]);
    expect(reset.code).toBe(0);
    expect(reset.out).toContain("Reset Concert Grand (grand) to factory defaults.");
    expect(reset.out).not.toContain("already at factory defaults");

    const already = await run(["tune", "grand", "--reset"]);
    expect(already.code).toBe(0);
    expect(already.out).toContain("Concert Grand (grand) was already at factory defaults.");
    expect(already.out).not.toContain("to factory defaults");

    const nan = await run(["tune", "grand", "--brightness", "abc"]);
    expect(nan.code).toBe(1);
    expect(nan.err).toContain(`Invalid value for --brightness: "abc" (expected a number)`);

    const range = await run(["tune", "grand", "--brightness", "9"]);
    expect(range.code).toBe(1);
    expect(range.err).toContain("--brightness 9 is out of range (0.05–0.5)");

    const none = await run(["tune", "grand"]);
    expect(none.code).toBe(1);
    expect(none.err).toContain("No tuning parameters specified. Run 'ai-jam-sessions tune' to see available parameters.");
  });

  it("tune-guitar shows, saves, and resets the steel dreadnought", async () => {
    const usage = await run(["tune-guitar"]);
    expect(usage.code).toBe(0);
    expect(usage.out).toContain("Usage: ai-jam-sessions tune-guitar <voice-id>");

    const unknown = await run(["tune-guitar", "not-a-guitar"]);
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain(`Unknown guitar voice: "not-a-guitar".`);

    const shown = await run(["tune-guitar", "steel-dreadnought", "--show"]);
    expect(shown.code).toBe(0);
    expect(shown.out).toContain("Steel Dreadnought (steel-dreadnought)");
    expect(shown.out).toContain("Using factory preset.");

    const tuned = await run(["tune-guitar", "steel-dreadnought", "--pluck-position", "0.3"]);
    expect(tuned.code).toBe(0);
    expect(tuned.out).toContain("Tuned Steel Dreadnought (steel-dreadnought):");
    expect(tuned.out).toContain("pluck-position");
    expect(tuned.out).toContain("0.3");
    expect(readFileSync(join(state, "guitars", "steel-dreadnought.json"), "utf8")).toContain("0.3");

    const overridden = await run(["tune-guitar", "steel-dreadnought", "--show"]);
    expect(overridden.code).toBe(0);
    expect(overridden.out).toContain("0.3 *");
    expect(overridden.out).toContain("* = user override (1 total)");
    expect(overridden.out).not.toContain("Using factory preset.");

    const reset = await run(["tune-guitar", "steel-dreadnought", "--reset"]);
    expect(reset.out).toContain("Reset Steel Dreadnought (steel-dreadnought) to factory defaults.");

    const already = await run(["tune-guitar", "steel-dreadnought", "--reset"]);
    expect(already.out).toContain("Steel Dreadnought (steel-dreadnought) was already at factory defaults.");

    const range = await run(["tune-guitar", "steel-dreadnought", "--pluck-position", "2"]);
    expect(range.code).toBe(1);
    expect(range.err).toContain("--pluck-position 2 is out of range (0.05–0.5)");

    const nan = await run(["tune-guitar", "steel-dreadnought", "--pluck-position", "nope"]);
    expect(nan.code).toBe(1);
    expect(nan.err).toContain(`Invalid value for --pluck-position: "nope" (expected a number)`);

    const none = await run(["tune-guitar", "steel-dreadnought"]);
    expect(none.code).toBe(1);
    expect(none.err).toContain("No tuning parameters specified. Run 'ai-jam-sessions tune-guitar'");
  });

  it("play refuses bad flags before it connects, and names a missing song", async () => {
    const usage = await run(["play"]);
    expect(usage.code).toBe(1);
    expect(usage.err).toContain("Usage: ai-jam-sessions play <song-id | file.mid>");

    const missing = await run(["play", "no-such-song-xyz"]);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain(`Error [INPUT_INVALID_SONG]: Song not found: "no-such-song-xyz".`);
    expect(missing.err).toContain("Or provide a .mid file path.");

    const engine = await run(["play", "coverage-one-note", "--engine", "not-an-engine"]);
    expect(engine.code).toBe(1);
    expect(engine.err).toContain(`Unknown engine: "not-an-engine". Available: piano, sample, vocal, tract, synth, piano+synth, vocal+synth, guitar, guitar+synth`);
    expect(engines.disconnects).toBe(0);

    const keyboard = await run(["play", "coverage-one-note", "--keyboard", "not-a-keyboard"]);
    expect(keyboard.code).toBe(1);
    expect(keyboard.err).toContain(`Unknown keyboard: "not-a-keyboard". Available: ${VOICE_IDS.join(", ")}`);

    const guitar = await run(["play", "coverage-one-note", "--guitar-voice", "not-a-guitar"]);
    expect(guitar.code).toBe(1);
    expect(guitar.err).toContain(`Unknown guitar voice: "not-a-guitar".`);

    const tract = await run(["play", "coverage-one-note", "--tract-voice", "not-a-voice"]);
    expect(tract.code).toBe(1);
    expect(tract.err).toContain(`Unknown tract voice: "not-a-voice". Available: soprano, alto, tenor, bass`);

    const speed = await run(["play", "coverage-one-note", "--speed", "9"]);
    expect(speed.code).toBe(1);
    expect(speed.err).toContain(`Invalid speed: "9". Must be between 0 (exclusive) and 4.`);

    const singMode = await run(["play", "coverage-one-note", "--sing-mode", "opera"]);
    expect(singMode.code).toBe(1);
    expect(singMode.err).toContain(`Invalid --sing-mode: "opera". Available: note-names, solfege, contour, syllables`);

    const filter = await run(["play", "coverage-one-note", "--voice-filter", "nope"]);
    expect(filter.code).toBe(1);
    expect(filter.err).toContain(`Invalid --voice-filter: "nope". Available: all, melody-only, harmony`);

    const backend = await run(["play", "coverage-one-note", "--singer-backend", "opera"]);
    expect(backend.code).toBe(1);
    expect(backend.err).toContain(`Unknown singer backend: "opera". Available: kokoro, soulx, additive, tract`);

    const countIn = await run(["play", "coverage-one-note", "--count-in", "-1"]);
    expect(countIn.code).toBe(1);
    expect(countIn.err).toContain(`Invalid --count-in: "-1". Must be a non-negative integer (bars).`);

    const tempo = await run(["play", "coverage-one-note", "--tempo", "5"]);
    expect(tempo.code).toBe(1);
    expect(tempo.err).toContain(`Invalid tempo: "5". Must be between 10 and 400 BPM.`);

    const mode = await run(["play", "coverage-one-note", "--mode", "sideways"]);
    expect(mode.code).toBe(1);
    expect(mode.err).toContain(`Invalid mode: "sideways". Available: full, measure, hands, loop`);
  });

  it("play performs the one-note song on each engine and writes the journal", async () => {
    const journalDir = join(state, "journal");
    const before = existsSync(journalDir)
      ? readdirSync(journalDir).map((name) => readFileSync(join(journalDir, name), "utf8")).join("\n")
      : "";
    const spy = vi.spyOn(journalApi, "buildJournalEntry");
    try {
    const cases: Array<{ args: string[]; label: string }> = [
      { args: ["--engine", "piano", "--keyboard", "grand"], label: "Starting grand piano..." },
      { args: ["--engine", "piano", "--keyboard", "upright"], label: "Starting upright piano..." },
      { args: ["--engine", "tract", "--tract-voice", "alto"], label: "Starting tract engine (alto)..." },
      { args: ["--engine", "vocal"], label: "Starting vocal engine..." },
      { args: ["--engine", "synth"], label: "Starting vocal-synth engine..." },
      { args: ["--engine", "guitar", "--guitar-voice", "electric-jazz"], label: "Starting guitar engine (electric-jazz)..." },
      { args: ["--engine", "piano+synth", "--keyboard", "honkytonk"], label: "Starting honkytonk piano + vocal-synth..." },
      { args: ["--engine", "vocal+synth"], label: "Starting vocal + vocal-synth..." },
      { args: ["--engine", "guitar+synth", "--guitar-voice", "electric-clean"], label: "Starting electric-clean guitar + vocal-synth..." },
    ];
    for (const entry of cases) {
      const result = await run(["play", "coverage-one-note", ...entry.args]);
      expect(result.code, entry.label).toBe(0);
      expect(result.out, entry.label).toContain(entry.label);
      expect(result.out, entry.label).toContain("Playing: Coverage One Note");
      expect(result.out, entry.label).toContain("[full mode]");
      expect(result.out, entry.label).toContain("Finished! 1 measures played.");
    }

    const journal = readdirSync(join(state, "journal")).map((name) => readFileSync(join(state, "journal", name), "utf8")).join("\n");
    const added = journal.slice(before.length);
    expect(times(added, "Coverage One Note (Coverage)")).toBe(9);
    expect(times(added, "**folk** | advanced | C major | 120 BPM | 1/1 measures | 0s")).toBe(9);
    expect(times(added, "CLI practice session.")).toBe(9);
    const calls = spy.mock.calls.filter((call) => call[1] === "CLI practice session.");
    expect(calls).toHaveLength(9);
    for (const [snapshot, note] of calls) {
      expect(snapshot?.songId).toBe("coverage-one-note");
      expect(snapshot?.title).toBe("Coverage One Note");
      expect(snapshot?.composer).toBe("Coverage");
      expect(snapshot?.genre).toBe("folk");
      expect(snapshot?.mode).toBe("full");
      expect(snapshot?.measuresPlayed).toBe(1);
      expect(snapshot?.totalMeasures).toBe(1);
      expect(note).toBe("CLI practice session.");
    }
    } finally {
      spy.mockRestore();
    }
  });

  it("play honors mode, speed, tempo, record, and the metronome on the one-note song", async () => {
    const hands = await run(["play", "coverage-one-note", "--engine", "piano", "--mode", "hands"]);
    expect(hands.code).toBe(0);
    expect(hands.out).toContain("Playing: Coverage One Note [hands mode]");

    const measure = await run(["play", "coverage-one-note", "--engine", "piano", "--mode", "measure"]);
    expect(measure.code).toBe(0);
    expect(measure.out).toContain("Playing: Coverage One Note [measure mode]");

    const loop = await run(["play", "coverage-one-note", "--engine", "piano", "--mode", "loop"]);
    expect(loop.code).toBe(0);
    expect(loop.out).toContain("Playing: Coverage One Note [loop mode]");

    const paced = await run(["play", "coverage-one-note", "--engine", "piano", "--speed", "0.5", "--tempo", "90"]);
    expect(paced.code).toBe(0);
    expect(paced.out).toContain("Playing: Coverage One Note (90 BPM × 0.5x speed) [full mode]");

    const recorded = await run(["play", "coverage-one-note", "--engine", "piano", "--record"]);
    expect(recorded.code).toBe(0);
    expect(recorded.out).toContain("Recorded: 2 note event(s).");

    const click = await run(["play", "coverage-one-note", "--engine", "piano", "--metronome", "--count-in", "1"]);
    expect(click.code).toBe(0);
    expect(click.out).toContain("Playing: Coverage One Note [full mode]");
    expect(click.out).toContain("Finished! 1 measures played.");
  });

  it("a refused engine is exit 2, and --debug adds the stack", async () => {
    engines.connectError = "coverage engine refused";
    const plain = await run(["play", "coverage-one-note", "--engine", "piano"]);
    expect(plain.code).toBe(2);
    expect(plain.err).toContain("Error: coverage engine refused");
    expect(plain.err).not.toContain("\n    at ");

    const debug = await run(["play", "coverage-one-note", "--engine", "piano", "--debug"]);
    expect(debug.code).toBe(2);
    expect(debug.err).toContain("Error: coverage engine refused");
    expect(debug.err).toContain("\n    at ");
  });

  it("sample play uses a directory that looks like Salamander, and refuses one that does not", async () => {
    const missing = await run(["play", "coverage-one-note", "--engine", "sample"]);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain("Sampled piano is not installed. Set AI_JAM_SAMPLES_DIR to an Accurate-Salamander directory, or use --engine piano.");

    const samples = join(scratch, "salamander");
    mkdirSync(join(samples, "sfz_minimum"), { recursive: true });
    writeFileSync(join(samples, "sfz_minimum", "Accurate-SalamanderGrandPiano_flat.Recommended.sfz"), "");
    process.env.AI_JAM_SAMPLES_DIR = samples;
    const played = await run(["play", "coverage-one-note", "--engine", "sample"]);
    expect(played.code).toBe(0);
    expect(played.out).toContain("Starting sampled piano (Accurate-Salamander)...");
    expect(played.out).toContain("Playing: Coverage One Note");
  });

  it("plays a one-tick MIDI file, including singing, teaching, seek, and a named port", async () => {
    const midi = join(scratch, "one.mid");
    writeFileSync(midi, shortMidi());
    const missing = join(scratch, "missing.mid");

    const absent = await run(["play", missing]);
    expect(absent.code).toBe(1);
    expect(absent.err).toContain(`File not found: "${missing}"`);
    expect(engines.disconnects).toBe(1);

    const plain = await run(["play", midi, "--midi", "--port", "LoopBe Internal"]);
    expect(plain.code).toBe(0);
    expect(engines.lastPort).toBe("LoopBe Internal");
    expect(plain.out).toContain("Starting MIDI...");
    expect(plain.out).toContain(`Playing: ${midi}`);
    expect(plain.out).toContain("Tracks: Unknown (1)");
    expect(plain.out).toContain("Notes: 1 | Tempo: 120 BPM | Duration: ~0s");
    expect(plain.out).toContain("Finished! 1 notes played.");

    const seek = await run(["play", midi, "--seek", "0"]);
    expect(seek.code).toBe(0);
    expect(seek.out).toContain("Seeking to: 0s (measure 1, beat 1.0)");

    const badSeek = await run(["play", midi, "--seek", "-1"]);
    expect(badSeek.code).toBe(1);
    expect(badSeek.err).toContain(`Invalid seek: "-1". Must be a positive number (seconds).`);

    const sung = await run(["play", midi, "--with-singing", "--with-teaching", "--sing-mode", "solfege", "--voice-filter", "melody-only"]);
    expect(sung.code).toBe(0);
    expect(sung.out).toContain("Features: singing (solfege, melody-only), teaching");
    expect(sung.out).toContain("♪ Do");
    expect(sung.out).toContain("Finished! 1 notes played.");
  });

  it("lyrics build, skip, and render on the one-note song", async () => {
    const badShape = await run(["play", "coverage-one-note", "--lyrics", "la", "--measures", "abc"]);
    expect(badShape.code).toBe(1);
    expect(badShape.err).toContain(`Invalid --measures range: "abc". Use format like "1-8".`);

    const reversed = await run(["play", "coverage-one-note", "--lyrics", "la", "--measures", "8-2"]);
    expect(reversed.code).toBe(1);
    expect(reversed.err).toContain(`Invalid --measures range: "8-2".`);
    expect(reversed.err).not.toContain("Use format like");

    const tooFar = await run(["play", "coverage-one-note", "--lyrics", "la", "--measures", "1-9"]);
    expect(tooFar.code).toBe(1);
    expect(tooFar.err).toContain(`--measures 1-9 exceeds "Coverage One Note" (1 measures).`);

    const sung = await run(["play", "coverage-one-note", "--engine", "piano", "--lyrics", "la", "--measures", "1-1"]);
    expect(sung.code).toBe(0);
    expect(sung.out).toContain("coverage warning one");
    expect(sung.out).toContain("Sung lead: 3 notes [C4 E4 G4] 0.4s");
    expect(sung.out).toContain("Playing: Coverage One Note");
    expect(sung.out).toContain("[loop mode]");

    engines.prepare = "many";
    const many = await run(["play", "coverage-one-note", "--engine", "piano", "--lyrics", "la", "--measures", "1-1"]);
    expect(many.code).toBe(0);
    expect(many.out).toContain("… and 1 more lyric warnings");
    expect(many.out).toContain("13 notes [");
    expect(many.out).toContain(" …]");

    engines.prepare = "throw";
    const failed = await run(["play", "coverage-one-note", "--engine", "piano", "--lyrics", "la"]);
    expect(failed.code).toBe(1);
    expect(failed.err).toContain("Couldn't build sung lyrics: coverage lyric build failed");

    engines.prepare = "skip";
    const skipped = await run(["play", "coverage-one-note", "--engine", "piano", "--lyrics", "la", "--measures", "1-1"]);
    expect(skipped.code).toBe(0);
    expect(skipped.err).toContain("Sung lead skipped: coverage singer offline");
    expect(skipped.out).toContain("Finished! 1 measures played.");
    expect(skipped.out).not.toContain("Sung lead: 3 notes");

    engines.prepare = "ok";
    const wav = join(scratch, "lead.wav");
    const rendered = await run(["play", "coverage-one-note", "--engine", "piano", "--lyrics", "la", "--measures", "1-1", "--out", wav, "--svs-backend", "dsp"]);
    expect(rendered.code).toBe(0);
    expect(rendered.out).toContain(`Wrote sung lead: ${wav} (0.4s, dsp)`);
    expect(readFileSync(wav, "utf8")).toContain("RIFF-coverage");

    const noLyrics = await run(["play", "coverage-one-note", "--engine", "piano", "--out", wav]);
    expect(noLyrics.code).toBe(1);
    expect(noLyrics.err).toContain("--out with no --lyrics: nothing to render. Pass --lyrics or --lyrics-file.");

    const badBackend = await run(["play", "coverage-one-note", "--engine", "piano", "--lyrics", "la", "--out", wav, "--svs-backend", "tape"]);
    expect(badBackend.code).toBe(1);
    expect(badBackend.err).toContain(`Unknown --svs-backend: "tape". Use dsp or diffsinger.`);

    const diffsinger = await run(["play", "coverage-one-note", "--engine", "piano", "--lyrics", "la", "--out", wav, "--svs-backend", "diffsinger"]);
    expect(diffsinger.code).toBe(1);
    expect(diffsinger.err).toContain("Couldn't render sung lead: DIFFSINGER_ROOT is not pinned");

    const lyricFile = join(scratch, "words.txt");
    writeFileSync(lyricFile, "la");
    const fromFile = await run(["play", "coverage-one-note", "--engine", "piano", "--lyrics-file", lyricFile, "--measures", "1-1"]);
    expect(fromFile.code).toBe(0);
    expect(fromFile.out).toContain("Sung lead: 3 notes [C4 E4 G4] 0.4s");
  });

  it("a journal path that is a file is reported, and the take still finishes", async () => {
    const alt = join(scratch, "journal-blocked");
    const altState = join(alt, "state");
    mkdirSync(join(altState, "songs"), { recursive: true });
    writeFileSync(join(altState, "songs", "coverage-one-note.json"), JSON.stringify(ONE_NOTE));
    // existsSync is true for a file, so mkdir is skipped and the write fails.
    // Node reports ENOENT on Windows and ENOTDIR elsewhere. The take still exits 0.
    writeFileSync(join(altState, "journal"), "not a directory");
    const saved = process.env.AI_JAM_HOME;
    process.env.AI_JAM_HOME = altState;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const filepath = join(altState, "journal", `${day}.md`);
    const nodeCode = process.platform === "win32" ? "ENOENT" : "ENOTDIR";
    const nodeDetail = process.platform === "win32" ? "no such file or directory" : "not a directory";
    try {
      const played = await run(["play", "coverage-one-note", "--engine", "piano"]);
      expect(played.code).toBe(0);
      expect(played.out).toContain("Finished! 1 measures played.");
      expect(played.out).not.toContain("Session logged to practice journal.");
      expect(played.err).not.toContain("Failed to create journal directory");
      expect(played.err).toContain(
        `  ⚠ Could not save journal entry: Failed to write journal entry to "${filepath}": ${nodeCode}: ${nodeDetail}, open '${filepath}'`,
      );
    } finally {
      process.env.AI_JAM_HOME = saved;
    }
  });

  it("sing narrates the one-note song and refuses a bad flag", async () => {
    const usage = await run(["sing"]);
    expect(usage.code).toBe(1);
    expect(usage.err).toContain("Usage: ai-jam-sessions sing <song-id>");

    const missing = await run(["sing", "no-such-song-xyz"]);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain(`Error [INPUT_INVALID_SONG]: Song not found: "no-such-song-xyz".`);

    const mode = await run(["sing", "coverage-one-note", "--mode", "opera"]);
    expect(mode.code).toBe(1);
    expect(mode.err).toContain(`Invalid mode: "opera". Available: note-names, solfege, contour, syllables`);

    const hand = await run(["sing", "coverage-one-note", "--hand", "nope"]);
    expect(hand.code).toBe(1);
    expect(hand.err).toContain(`Invalid hand: "nope". Available: right, left, both`);

    const sync = await run(["sing", "coverage-one-note", "--sync", "after"]);
    expect(sync.code).toBe(1);
    expect(sync.err).toContain(`Invalid sync mode: "after". Available: concurrent, before`);

    const keyboard = await run(["sing", "coverage-one-note", "--keyboard", "not-a-keyboard"]);
    expect(keyboard.code).toBe(1);
    expect(keyboard.err).toContain(`Unknown keyboard: "not-a-keyboard".`);

    const speed = await run(["sing", "coverage-one-note", "--speed", "9"]);
    expect(speed.code).toBe(1);
    expect(speed.err).toContain(`Invalid speed: "9". Must be between 0 (exclusive) and 4.`);

    const tempo = await run(["sing", "coverage-one-note", "--tempo", "5"]);
    expect(tempo.code).toBe(1);
    expect(tempo.err).toContain(`Invalid tempo: "5". Must be between 10 and 400 BPM.`);

    const engine = await run(["sing", "coverage-one-note", "--engine", "guitar"]);
    expect(engine.code).toBe(1);
    expect(engine.err).toContain(`Unknown engine for sing: "guitar". Available: piano, synth, piano+synth`);

    const sung = await run(["sing", "coverage-one-note", "--mode", "solfege", "--hand", "left"]);
    expect(sung.code).toBe(0);
    expect(sung.out).toContain("Starting grand piano...");
    expect(sung.out).toContain("Singing along: Coverage One Note [solfege / left hand]");
    expect(sung.out).toContain("Finished! 1 measures played.");

    const piano = await run(["sing", "coverage-one-note", "--with-piano", "--sync", "before", "--keyboard", "upright", "--tempo", "100", "--speed", "0.5"]);
    expect(piano.code).toBe(0);
    expect(piano.out).toContain("Starting upright piano...");
    expect(piano.out).toContain("Singing along: Coverage One Note (100 BPM × 0.5x speed) [note-names / right hand + piano (before)]");

    const synth = await run(["sing", "coverage-one-note", "--engine", "synth"]);
    expect(synth.code).toBe(0);
    expect(synth.out).toContain("Starting vocal-synth engine...");

    const both = await run(["sing", "coverage-one-note", "--engine", "piano+synth", "--keyboard", "bright"]);
    expect(both.code).toBe(0);
    expect(both.out).toContain("Starting bright piano + vocal-synth...");

    const midi = await run(["sing", "coverage-one-note", "--midi", "--port", "LoopBe Internal"]);
    expect(midi.code).toBe(0);
    expect(engines.lastPort).toBe("LoopBe Internal");
    expect(midi.out).toContain("Starting MIDI...");
    expect(midi.out).toContain("Singing along: Coverage One Note [note-names / right hand]");

    engines.connectError = "coverage engine refused";
    const refused = await run(["sing", "coverage-one-note", "--engine", "piano"]);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("Error: coverage engine refused");
    expect(refused.err).not.toContain("\n    at ");

    const debug = await run(["sing", "coverage-one-note", "--engine", "piano", "-D"]);
    expect(debug.code).toBe(2);
    expect(debug.err).toContain("Error: coverage engine refused");
    expect(debug.err).toContain("\n    at ");
  });

  it("practice drills one measure and refuses a bad range before audio", async () => {
    const usage = await run(["practice"]);
    expect(usage.code).toBe(1);
    expect(usage.err).toContain("Error [INPUT_INVALID_ARGS]: Usage: ai-jam-sessions practice <song-id>");
    expect(usage.err).toContain("Hint: Pass a library song id");

    const noRange = await run(["practice", "coverage-one-note"]);
    expect(noRange.code).toBe(1);
    expect(noRange.err).toContain("Error [INPUT_INVALID_ARGS]: Missing required --measures <start-end>.");
    expect(noRange.err).toContain('Hint: Pass a range like --measures 5-8.');

    const bad = await run(["practice", "coverage-one-note", "--measures", "zz"]);
    expect(bad.code).toBe(1);
    expect(bad.err).toContain(`Error [INPUT_INVALID_ARGS]: Invalid --measures range: "zz".`);
    expect(bad.err).toContain('Hint: Use format like "5-8".');

    const missing = await run(["practice", "no-such-song-xyz", "--measures", "1-1"]);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain(`Error [INPUT_INVALID_SONG]: Song not found: "no-such-song-xyz".`);

    const exceeds = await run(["practice", "coverage-one-note", "--measures", "1-9"]);
    expect(exceeds.code).toBe(1);
    expect(exceeds.err).toContain(`endMeasure (9) exceeds "Coverage One Note"'s length (1 measures)`);

    const passes = await run(["practice", "coverage-one-note", "--measures", "1-1", "--max-passes", "0"]);
    expect(passes.code).toBe(1);
    expect(passes.err).toContain("maxPasses must be a positive integer: got 0");

    const target = await run(["practice", "coverage-one-note", "--measures", "1-1", "--start-speed", "80", "--target", "50"]);
    expect(target.code).toBe(1);
    expect(target.err).toContain("speedTargetPct (50) must be >= speedStartPct (80)");

    const drilled = await run(["practice", "coverage-one-note", "--measures", "1-1", "--max-passes", "1", "--start-speed", "70", "--target", "100", "--step", "5"]);
    expect(drilled.code).toBe(0);
    expect(drilled.out).toContain("Starting piano engine...");
    expect(drilled.out).toContain("Practicing: Coverage One Note — measures 1–1");
    expect(drilled.out).toContain("Finished (max-passes-reached). 1 pass(es) played, reached 70%.");
    expect(drilled.out).toContain("Session logged to practice journal.");
    const journal = readdirSync(join(state, "journal")).map((name) => readFileSync(join(state, "journal", name), "utf8")).join("\n");
    expect(journal).toContain("CLI practice loop: measures 1-1, 1 pass(es), clean at 70%.");

    engines.connectError = "coverage engine refused";
    const refused = await run(["practice", "coverage-one-note", "--measures", "1-1", "--max-passes", "1"]);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("Error: coverage engine refused");
    expect(refused.err).not.toContain("\n    at ");

    const debug = await run(["practice", "coverage-one-note", "--measures", "1-1", "--max-passes", "1", "--debug"]);
    expect(debug.code).toBe(2);
    expect(debug.err).toContain("Error: coverage engine refused");
    expect(debug.err).toContain("\n    at ");
  });

  it("view and view-guitar write the file asked for, and refuse a bad range", async () => {
    const usage = await run(["view"]);
    expect(usage.code).toBe(1);
    expect(usage.err).toContain("Usage: ai-jam-sessions view <song-id>");

    const missing = await run(["view", "no-such-song-xyz"]);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain(`Song not found: "no-such-song-xyz".`);

    const svg = join(scratch, "roll.svg");
    const hand = await run(["view", "coverage-one-note", "--out", svg, "--color", "hand", "--measures", "1-1"]);
    expect(hand.code).toBe(0);
    expect(hand.out).toContain(`Piano roll written to: ${svg}`);
    expect(readFileSync(svg, "utf8")).toContain("<svg");
    expect(engines.opened).toHaveLength(0);

    const chromatic = join(scratch, "chroma.svg");
    const color = await run(["view", "coverage-one-note", "--out", chromatic, "--color", "pitch-class"]);
    expect(color.code).toBe(0);
    expect(readFileSync(chromatic, "utf8")).toContain("<svg");

    const badColor = await run(["view", "coverage-one-note", "--color", "plaid"]);
    expect(badColor.code).toBe(1);
    expect(badColor.err).toContain(`Invalid --color: "plaid". Options: hand, pitch-class`);

    const badRange = await run(["view", "coverage-one-note", "--measures", "nope"]);
    expect(badRange.code).toBe(1);
    expect(badRange.err).toContain(`Invalid --measures range: "nope". Use format like "1-8" or "5-12".`);

    const low = await run(["view", "coverage-one-note", "--measures", "0-1"]);
    expect(low.code).toBe(1);
    expect(low.err).toContain("Invalid --measures range: start must be >= 1 (got 0).");

    const past = await run(["view", "coverage-one-note", "--measures", "5-5"]);
    expect(past.code).toBe(1);
    expect(past.err).toContain("Invalid --measures range: start 5 exceeds song length (1 measures).");

    const reversed = await run(["view", "bach-prelude-c-major-bwv846", "--measures", "8-2"]);
    expect(reversed.code).toBe(1);
    expect(reversed.err).toContain("Invalid --measures range: end 2 must be >= start 8.");

    const clamped = await run(["view", "coverage-one-note", "--out", svg, "--measures", "1-99"]);
    expect(clamped.code).toBe(0);
    expect(clamped.err).toContain("Warning: end measure 99 exceeds song length (1), clamping.");
    expect(clamped.out).toContain(`Piano roll written to: ${svg}`);

    const openedBefore = engines.opened.length;
    const auto = await run(["view", "coverage-one-note"]);
    expect(auto.code).toBe(0);
    expect(auto.out).toContain("Piano roll written to:");
    expect(engines.opened.length).toBe(openedBefore + 1);
    const opener = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    expect(engines.opened.at(-1)?.[0]).toBe(opener);

    engines.browserError = new Error("coverage browser blocked");
    const blocked = await run(["view", "coverage-one-note"]);
    expect(blocked.code).toBe(0);
    expect(blocked.err).toContain("Could not open browser automatically: coverage browser blocked");
    expect(blocked.err).toContain("File saved at:");

    const tabUsage = await run(["view-guitar"]);
    expect(tabUsage.code).toBe(1);
    expect(tabUsage.err).toContain("Usage: ai-jam-sessions view-guitar <song-id>");

    const html = join(scratch, "tab.html");
    const tab = await run(["tab", "coverage-one-note", "--out", html, "--tuning", "standard", "--measures", "1-1", "--tempo", "90"]);
    expect(tab.code).toBe(0);
    expect(tab.out).toContain(`Guitar tab editor written to: ${html}`);
    expect(tab.out).toContain("Space=play/pause");
    expect(readFileSync(html, "utf8")).toContain("Coverage One Note");

    const badTuning = await run(["view-guitar", "coverage-one-note", "--tuning", "drop-none"]);
    expect(badTuning.code).toBe(1);
    expect(badTuning.err).toContain(`Invalid --tuning: "drop-none". Options: ${GUITAR_TUNING_IDS.join(", ")}`);

    const guitarMissing = await run(["view-guitar", "no-such-song-xyz"]);
    expect(guitarMissing.code).toBe(1);
    expect(guitarMissing.err).toContain(`Song not found: "no-such-song-xyz".`);
    expect(guitarMissing.err).not.toContain("Or provide a .mid file path.");

    const guitarShape = await run(["view-guitar", "coverage-one-note", "--measures", "nope"]);
    expect(guitarShape.code).toBe(1);
    expect(guitarShape.err).toContain(`Invalid --measures range: "nope". Use format like "1-8" or "5-12".`);

    const guitarLow = await run(["view-guitar", "coverage-one-note", "--measures", "0-1"]);
    expect(guitarLow.code).toBe(1);
    expect(guitarLow.err).toContain("Invalid --measures range: start must be >= 1 (got 0).");

    const guitarPast = await run(["view-guitar", "coverage-one-note", "--measures", "4-4"]);
    expect(guitarPast.code).toBe(1);
    expect(guitarPast.err).toContain("Invalid --measures range: start 4 exceeds song length (1 measures).");

    const guitarReversed = await run(["view-guitar", "bach-prelude-c-major-bwv846", "--measures", "8-2"]);
    expect(guitarReversed.code).toBe(1);
    expect(guitarReversed.err).toContain("Invalid --measures range: end 2 must be >= start 8.");

    const guitarClamp = await run(["view-guitar", "coverage-one-note", "--out", html, "--measures", "1-99"]);
    expect(guitarClamp.code).toBe(0);
    expect(guitarClamp.err).toContain("Warning: end measure 99 exceeds song length (1), clamping.");
    expect(guitarClamp.out).toContain(`Guitar tab editor written to: ${html}`);
  });

  it("library status names a genre, and fetch stays off the network", async () => {
    const overview = await run(["library"]);
    expect(overview.code).toBe(0);
    expect(overview.out).toContain("AI Jam Sessions Song Library — Progress");
    expect(overview.out).toContain("Ready:");

    const alias = await run(["lib"]);
    expect(alias.code).toBe(0);
    expect(alias.out).toContain("AI Jam Sessions Song Library — Progress");

    const status = await run(["library", "status", "classical"]);
    expect(status.code).toBe(0);
    expect(status.out).toContain("classical —");
    const bach = status.out.split("\n").find((line) => line.includes("bach-prelude-c-major-bwv846"));
    expect(bach).toBeDefined();
    expect(bach).toContain("ready");

    const bad = await run(["library", "status", "not-a-genre"]);
    expect(bad.code).toBe(1);
    expect(bad.err).toContain("Unknown genre: not-a-genre");
    expect(bad.err).toContain(`Valid genres: ${GENRES.join(", ")}`);

    const emptyDir = join(scratch, "empty-lib");
    mkdirSync(emptyDir, { recursive: true });
    const bare = await run(["library"], { libraryDir: emptyDir });
    expect(bare.code).toBe(0);
    expect(bare.out).toContain("Total: 0 songs across 0 genres");
    expect(bare.out).toContain(`0 ${"░".repeat(30)} 0%`);
    expect(bare.out).not.toContain("Not fetched:");

    const empty = await run(["library", "fetch"], { libraryDir: emptyDir });
    expect(empty.code).toBe(0);
    expect(empty.out).toContain("Nothing to fetch — every ready song has its MIDI on disk.");
    expect(empty.out).not.toContain("no recorded source");

    const unfetchedDir = join(scratch, "unfetched-lib", "folk");
    mkdirSync(unfetchedDir, { recursive: true });
    writeFileSync(join(unfetchedDir, "coverage-unfetched.json"), JSON.stringify({
      id: "coverage-unfetched",
      title: "Coverage Unfetched",
      genre: "folk",
      difficulty: "beginner",
      key: "C major",
      tags: ["coverage"],
      status: "ready",
    }));
    const unfetched = await run(["library", "status", "folk"], { libraryDir: join(scratch, "unfetched-lib") });
    expect(unfetched.code).toBe(0);
    const unfetchedLine = unfetched.out.split("\n").find((line) => line.includes("coverage-unfetched"));
    expect(unfetchedLine).toContain("⬇");
    expect(unfetchedLine).toContain("ready (MIDI not fetched)");
    const unfetchedOverview = await run(["library"], { libraryDir: join(scratch, "unfetched-lib") });
    expect(unfetchedOverview.out).toContain("Not fetched: 1 ready song(s) have no MIDI on disk — run 'ai-jam-sessions library fetch'");

    const noSourceDir = join(scratch, "nosource-lib", "folk");
    mkdirSync(noSourceDir, { recursive: true });
    writeFileSync(join(noSourceDir, "coverage-no-source.json"), JSON.stringify({
      id: "coverage-no-source",
      title: "Coverage No Source",
      genre: "folk",
      difficulty: "beginner",
      key: "C major",
      tags: ["coverage"],
      status: "annotated",
    }));
    const noSource = await run(["library", "fetch"], { libraryDir: join(scratch, "nosource-lib") });
    expect(noSource.code).toBe(0);
    expect(noSource.out).toContain("Nothing to fetch — every ready song has its MIDI on disk.");
    expect(noSource.out).toContain("1 song(s) have no recorded source and cannot be fetched: coverage-no-source");

    const fetchDir = join(scratch, "fetch-lib", "folk");
    mkdirSync(fetchDir, { recursive: true });
    writeFileSync(join(fetchDir, "coverage-fetch-me.json"), JSON.stringify({
      id: "coverage-fetch-me",
      title: "Coverage Fetch",
      genre: "folk",
      difficulty: "beginner",
      key: "C major",
      tags: ["coverage"],
      status: "annotated",
      provenance: provenance(),
    }));
    const refused = await run(["library", "fetch"], { libraryDir: join(scratch, "fetch-lib") });
    expect(refused.code).toBe(0);
    expect(refused.out).toContain("1 song(s) have annotations but no MIDI on disk.");
    expect(refused.out).toContain("example.invalid");
    expect(refused.out).toContain("Re-run with --accept-source-terms to download. Nothing was written.");
    expect(existsSync(join(fetchDir, "coverage-fetch-me.mid"))).toBe(false);

    engines.fetchStatus = "fetched";
    const accepted = await run(["library", "fetch", "--accept-source-terms"], { libraryDir: join(scratch, "fetch-lib") });
    expect(accepted.code).toBe(0);
    expect(accepted.out).toContain("✓ coverage-fetch-me");
    expect(accepted.out).toContain("fetched  coverage bytes");
    expect(accepted.out).toContain("Fetched 1 of 1.");

    engines.fetchStatus = "http-error";
    const failed = await run(["library", "fetch", "--accept-source-terms", "--id", "coverage-fetch-me"], { libraryDir: join(scratch, "fetch-lib") });
    expect(failed.code).toBe(0);
    expect(failed.out).toContain("✗ coverage-fetch-me");
    expect(failed.out).toContain("http-error  coverage http failure");
    expect(failed.out).toContain("Fetched 0 of 1.");
  });

  it("generate-song refuses every generator without spawning one", async () => {
    const usage = await run(["generate-song"]);
    expect(usage.code).toBe(1);
    expect(usage.err).toContain('Usage: ai-jam-sessions generate-song --lyrics "..."');

    const bad = await run(["generate-song", "--lyrics", "la", "--generator", "nope"]);
    expect(bad.code).toBe(1);
    expect(bad.err).toContain(`Unknown --generator: "nope". Use ace-step, diffrhythm, or yue.`);

    const ace = await run(["generate-song", "--lyrics", "coverage lyric"]);
    expect(ace.code).toBe(1);
    expect(ace.err).toContain("Error [INPUT_INVALID_ARGS]: ace-step is a mixed-song generator, not a singing instrument. It cannot honor a library MIDI line.");
    expect(ace.err).toContain("Hint: To run it as a side door, set ACE_STEP_CMD");

    const rhythm = await run(["generate-song", "--lyrics", "coverage lyric", "--generator", "diffrhythm"]);
    expect(rhythm.code).toBe(1);
    expect(rhythm.err).toContain("diffrhythm is a mixed-song generator, not a singing instrument.");
    expect(rhythm.err).toContain("DIFFRHYTHM_CMD");

    process.env.YUE_CMD = "coverage-not-run";
    const yue = await run(["generate-song", "--lyrics", "coverage lyric", "--generator", "yue"]);
    expect(yue.code).toBe(1);
    expect(yue.err).toContain("YUE_CMD is set but jam-sessions does not spawn third-party song generators from play. Use the external CLI (coverage-not-run)");
    expect(yue.err).toContain("Hint: Keep this off the MIDI play path.");
  });
});

describe("cli.ts — real entry", () => {
  it("node --import tsx src/cli.ts help prints help and exits 0", () => {
    const home = mkdtempSync(join(tmpdir(), "ajs-cli-entry-"));
    try {
      const result = spawnSync(process.execPath, ["--import", "tsx", join(import.meta.dirname, "cli.ts"), "help"], {
        encoding: "utf8",
        timeout: 20000,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          AI_JAM_HOME: join(home, "state"),
        },
      });
      expect(result.status).toBe(0);
      expect(result.stdout ?? "").toContain("ai-jam-sessions — Play music through your speakers");
      expect(result.stdout ?? "").toContain("practice <song-id> --measures <start-end>");
      expect(result.stderr ?? "").not.toContain("Unknown command");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 20000);
});
