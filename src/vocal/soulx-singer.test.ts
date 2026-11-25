import { describe, it, expect, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPosixParentGuard } from "./posix-parent-guard.js";
import {
  POSIX_PARENT_GUARD_FLAG,
  SOULX_DEADLINE_ENV,
  SOULX_RENDER_DEADLINE_MS,
  SoulxRenderDeadlineError,
  abortAllSoulxRenders,
  buildSoulxSpawnSpec,
  createSoulxScoreSinger,
  killChildProcessTree,
  killProcessTreeSync,
  renderSoulxLead,
  resolveSoulxDeadlineMs,
  soulxProgressNotification,
  type SoulxProgressEvent,
} from "./soulx-singer.js";
import { RequestCancelledError } from "../cancel.js";
import { SCORE_CLOCK_SCHEMA } from "./score-clock.js";

describe("soulx-singer bridge", () => {
  const minimalClock = {
    schema: SCORE_CLOCK_SCHEMA,
    song_id: "test-song",
    bpm: 75,
    time_signature: "3/4",
    sample_rate: 48000,
    total_seconds: 2.0,
    total_samples: 96000,
    last_event_end_sec: 2.0,
    clock: {
      source: "session-nominal" as const,
      bed_measures: [1, 1] as [number, number],
      measure_starts_sec: { "1": 0 },
      measure_durations_sec: { "1": 2.0 },
    },
    midi: {
      file: "test.mid",
      ppq: 384,
      ticks_per_measure: 1152,
      melody_track: "TUBULARBEL",
      sec_per_tick: 0.002083333,
    },
    events: [
      {
        id: "v00",
        lyric: "A",
        word: "A",
        syllable: 0,
        syllables: 1,
        midi: 70,
        t_sec: 0.5,
        t_samples: 24000,
        dur_sec: 1.0,
        anchor: "test",
        midi_tick: 240,
        t_midi_sec: 0.5,
        engine_note: null,
      },
    ],
  };

  it("createSoulxScoreSinger returns a ScoreSinger interface", () => {
    const singer = createSoulxScoreSinger(minimalClock, {});
    expect(typeof singer.connect).toBe("function");
    expect(typeof singer.start).toBe("function");
    expect(typeof singer.stop).toBe("function");
    expect(singer.durationSec).toBeCloseTo(2.15, 2);
    expect(singer.warnings).toEqual([]);
  });

  it("defaults to a bag of 6 takes (no single-take warning before connect)", () => {
    const singer = createSoulxScoreSinger(minimalClock, {});
    expect(singer.warnings).toEqual([]);
  });

  it("accepts an explicit takes count without breaking the interface", () => {
    const singer = createSoulxScoreSinger(minimalClock, { takes: 1 });
    expect(typeof singer.connect).toBe("function");
    expect(singer.durationSec).toBeCloseTo(2.15, 2);
  });

  it("renderSoulxLead refuses when prompt WAV is missing", async () => {
    await expect(
      renderSoulxLead(minimalClock, {
        soulxRoot: "/nonexistent/soulx",
        promptWav: "/nonexistent/prompt.wav",
        promptMeta: "/nonexistent/prompt.json",
      }),
    ).rejects.toThrow(/prompt WAV not found/);
  });

  it("renderSoulxLead refuses when prompt META is missing", async () => {
    // Create a dummy wav file so the WAV check passes but META fails
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const tmp = mkdtempSync(join(tmpdir(), "soulx-test-"));
    const wav = join(tmp, "prompt.wav");
    // Minimal 16-bit mono WAV header + 1 sample
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(46, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // mono
    header.writeUInt16LE(1, 22); // channels
    header.writeUInt32LE(48000, 24); // sr
    header.writeUInt32LE(96000, 28); // byte rate
    header.writeUInt16LE(2, 32); // block align
    header.writeUInt16LE(16, 34); // bits
    header.write("data", 36);
    header.writeUInt32LE(2, 40);
    const data = Buffer.alloc(2);
    writeFileSync(wav, Buffer.concat([header, data]));

    await expect(
      renderSoulxLead(minimalClock, {
        promptWav: wav,
        promptMeta: "/nonexistent/prompt.json",
      }),
    ).rejects.toThrow(/prompt metadata JSON not found/);
  });

  it("auto-discovers the default SoulX example prompt when nothing is configured", async () => {
    const root = process.env.SOULX_ROOT ?? "E:/AI/SoulX-Singer";
    const exampleWav = join(root, "example", "audio", "en_prompt.mp3");
    const exampleMeta = join(root, "example", "audio", "en_prompt.json");

    const hasExample = existsSync(exampleWav) && existsSync(exampleMeta);
    if (!hasExample) {
      // Skip when SoulX is not installed on this machine
      return;
    }

    // Discovery is the claim. A missing interpreter fails at spawn, which
    // proves the example prompt resolved, and does not start the model.
    await expect(
      renderSoulxLead(
        { ...minimalClock, song_id: "soulx-discover-test" },
        {
          soulxRoot: root,
          pythonExecutable: join(root, "python-not-installed-for-this-test"),
          takes: 1,
        },
      ),
    ).rejects.not.toThrow(/prompt WAV not found/);
  });

  it("rejects invalid prompt metadata even when the file exists", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const tmp = mkdtempSync(join(tmpdir(), "soulx-test-"));
    const wav = join(tmp, "prompt.wav");
    const meta = join(tmp, "bad_prompt.json");

    // Dummy WAV
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(46, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(48000, 24);
    header.writeUInt32LE(96000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(2, 40);
    writeFileSync(wav, Buffer.concat([header, Buffer.alloc(2)]));

    // Invalid metadata (not a SoulX segment)
    writeFileSync(meta, JSON.stringify({ notA: "segment" }));

    await expect(
      renderSoulxLead(minimalClock, { promptWav: wav, promptMeta: meta }),
    ).rejects.toThrow(/prompt metadata invalid/);
  });
});

function writeValidPrompt(dir: string): { wav: string; meta: string } {
  const wav = join(dir, "prompt.wav");
  const meta = join(dir, "prompt.json");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(46, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(96000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(2, 40);
  writeFileSync(wav, Buffer.concat([header, Buffer.alloc(2)]));
  writeFileSync(meta, JSON.stringify([{ duration: "0.5", phoneme: "a" }]));
  return { wav, meta };
}

function writeFakeSoulxScripts(
  scriptsDir: string,
  opts: { sleepOn?: "export" | "take"; pidMarkerFile?: string } = {},
): void {
  mkdirSync(scriptsDir, { recursive: true });
  const writeWavJs = `
function writeMinimalWav(filePath) {
  const fs = require("node:fs");
  const path = require("node:path");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + 16, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(96000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(16, 40);
  const data = Buffer.alloc(16);
  data.writeInt16LE(12000, 0);
  fs.writeFileSync(filePath, Buffer.concat([header, data]));
}
`;
  const sleeperCode = opts.pidMarkerFile
    ? `
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const childOpts = process.platform === "win32"
  ? { stdio: "ignore", detached: true, windowsHide: true }
  : { stdio: "ignore" };
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], childOpts);
if (typeof child.unref === "function") child.unref();
fs.writeFileSync(${JSON.stringify(opts.pidMarkerFile)}, JSON.stringify({ parentPid: process.pid, childPid: child.pid }));
setInterval(() => {}, 1000);
`
    : "";

  if (opts.sleepOn === "export") {
    writeFileSync(join(scriptsDir, "export_soulx_target.py"), sleeperCode);
  } else {
    writeFileSync(
      join(scriptsDir, "export_soulx_target.py"),
      `const fs = require("node:fs"); const outIdx = process.argv.indexOf("--out"); fs.writeFileSync(process.argv[outIdx + 1], "{}");`,
    );
  }

  if (opts.sleepOn === "take") {
    writeFileSync(join(scriptsDir, "soulx_take.py"), sleeperCode);
  } else {
    writeFileSync(
      join(scriptsDir, "soulx_take.py"),
      `${writeWavJs}\nconst path = require("node:path"); const outIdx = process.argv.indexOf("--out-dir"); writeMinimalWav(path.join(process.argv[outIdx + 1], "take-48k.wav"));`,
    );
  }

  writeFileSync(
    join(scriptsDir, "vocal_clock.py"),
    `
${writeWavJs}
const fs = require("node:fs");
const path = require("node:path");
const sub = process.argv[2];
if (sub === "verify") {
  const rIdx = process.argv.indexOf("--receipt");
  fs.writeFileSync(process.argv[rIdx + 1], "{}");
} else if (sub === "repin") {
  const oIdx = process.argv.indexOf("--out");
  fs.writeFileSync(process.argv[oIdx + 1], "{}");
} else if (sub === "place") {
  const dirIdx = process.argv.indexOf("--out-dir");
  const infoIdx = process.argv.indexOf("--out-info");
  const placedWav = path.join(process.argv[dirIdx + 1], "placed.wav");
  writeMinimalWav(placedWav);
  fs.writeFileSync(process.argv[infoIdx + 1], JSON.stringify({ path: placedWav }));
}
`,
  );
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForPidMarker(markerFile: string): Promise<{ parentPid: number; childPid: number }> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (existsSync(markerFile)) {
      try {
        return JSON.parse(readFileSync(markerFile, "utf8")) as { parentPid: number; childPid: number };
      } catch {
        // partial write
      }
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`PID marker never appeared at ${markerFile}`);
}

describe("soulx-singer cancellation, deadlines, tree kill, and progress", () => {
  const tempDirs: string[] = [];
  const prevHome = process.env.AI_JAM_HOME;

  const trackedPids = new Set<number>();

  function mkIsolatedTmp(): string {
    const d = mkdtempSync(join(tmpdir(), "soulx-fake-"));
    tempDirs.push(d);
    process.env.AI_JAM_HOME = join(d, "home");
    return d;
  }

  afterEach(async () => {
    await abortAllSoulxRenders("test cleanup");
    for (const pid of trackedPids) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already exited */
      }
    }
    trackedPids.clear();
    if (prevHome === undefined) delete process.env.AI_JAM_HOME;
    else process.env.AI_JAM_HOME = prevHome;
    for (const d of tempDirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        // ok
      }
    }
  });

  const baseClock = {
    schema: SCORE_CLOCK_SCHEMA,
    song_id: "fake-soulx-song",
    bpm: 75,
    time_signature: "3/4",
    sample_rate: 48000,
    total_seconds: 1.0,
    total_samples: 48000,
    last_event_end_sec: 1.0,
    clock: {
      source: "session-nominal" as const,
      bed_measures: [1, 1] as [number, number],
      measure_starts_sec: { "1": 0 },
      measure_durations_sec: { "1": 1.0 },
    },
    midi: {
      file: "test.mid",
      ppq: 384,
      ticks_per_measure: 1152,
      melody_track: "MELODY",
      sec_per_tick: 0.002,
    },
    events: [
      {
        id: "v00",
        lyric: "La",
        word: "La",
        syllable: 0,
        syllables: 1,
        midi: 69,
        t_sec: 0.1,
        t_samples: 4800,
        dur_sec: 0.5,
        anchor: "test",
        midi_tick: 48,
        t_midi_sec: 0.1,
        engine_note: null,
      },
    ],
  };

  it("kills the entire fake child process tree on AbortSignal", async () => {
    const dir = mkIsolatedTmp();
    const prompt = writeValidPrompt(dir);
    const scriptsDir = join(dir, "scripts");
    const markerFile = join(dir, "pids.json");
    writeFakeSoulxScripts(scriptsDir, { sleepOn: "take", pidMarkerFile: markerFile });

    const ac = new AbortController();
    const renderPromise = renderSoulxLead(baseClock, {
      soulxRoot: dir,
      pythonExecutable: process.execPath,
      scriptsDir,
      promptWav: prompt.wav,
      promptMeta: prompt.meta,
      takes: 2,
      signal: ac.signal,
    });

    const pids = await waitForPidMarker(markerFile);
    trackedPids.add(pids.parentPid);
    trackedPids.add(pids.childPid);
    expect(isPidAlive(pids.parentPid)).toBe(true);
    expect(isPidAlive(pids.childPid)).toBe(true);

    ac.abort("cancelled by client");
    await expect(renderPromise).rejects.toThrow(RequestCancelledError);

    // Allow OS process-table teardown a short settle window.
    await new Promise((r) => setTimeout(r, 80));
    expect(isPidAlive(pids.parentPid)).toBe(false);
    expect(isPidAlive(pids.childPid)).toBe(false);
  });

  it("kills the entire fake child process tree when the whole-render deadline expires", async () => {
    const dir = mkIsolatedTmp();
    const prompt = writeValidPrompt(dir);
    const scriptsDir = join(dir, "scripts");
    const markerFile = join(dir, "pids.json");
    writeFakeSoulxScripts(scriptsDir, { sleepOn: "export", pidMarkerFile: markerFile });

    const renderPromise = renderSoulxLead(baseClock, {
      soulxRoot: dir,
      pythonExecutable: process.execPath,
      scriptsDir,
      promptWav: prompt.wav,
      promptMeta: prompt.meta,
      takes: 1,
      deadlineMs: 250,
    });

    const pids = await waitForPidMarker(markerFile);
    await expect(renderPromise).rejects.toThrow(SoulxRenderDeadlineError);

    await new Promise((r) => setTimeout(r, 80));
    expect(isPidAlive(pids.parentPid)).toBe(false);
    expect(isPidAlive(pids.childPid)).toBe(false);
  });

  it("kills the fake child process tree when singer.stop() or abortAllSoulxRenders() runs mid-connect", async () => {
    const dir = mkIsolatedTmp();
    const prompt = writeValidPrompt(dir);
    const scriptsDir = join(dir, "scripts");
    const markerFile = join(dir, "pids.json");
    writeFakeSoulxScripts(scriptsDir, { sleepOn: "export", pidMarkerFile: markerFile });

    const singer = createSoulxScoreSinger(baseClock, {
      soulxRoot: dir,
      pythonExecutable: process.execPath,
      scriptsDir,
      promptWav: prompt.wav,
      promptMeta: prompt.meta,
      takes: 1,
    });

    const connectPromise = singer.connect();
    const connectRejection = expect(connectPromise).rejects.toThrow(RequestCancelledError);
    const pids = await waitForPidMarker(markerFile);
    await singer.stop();
    await connectRejection;

    await new Promise((r) => setTimeout(r, 80));
    expect(isPidAlive(pids.parentPid)).toBe(false);
    expect(isPidAlive(pids.childPid)).toBe(false);

    // Also verify server-shutdown helper abortAllSoulxRenders() kills an active child tree.
    rmSync(markerFile, { force: true });
    const renderPromise2 = renderSoulxLead(baseClock, {
      soulxRoot: dir,
      pythonExecutable: process.execPath,
      scriptsDir,
      promptWav: prompt.wav,
      promptMeta: prompt.meta,
      takes: 1,
    });
    const renderRejection2 = expect(renderPromise2).rejects.toThrow(RequestCancelledError);
    const pids2 = await waitForPidMarker(markerFile);
    trackedPids.add(pids2.parentPid);
    trackedPids.add(pids2.childPid);
    await abortAllSoulxRenders("server shutdown");
    await renderRejection2;

    await new Promise((r) => setTimeout(r, 80));
    expect(isPidAlive(pids2.parentPid)).toBe(false);
    expect(isPidAlive(pids2.childPid)).toBe(false);
  });

  it("emits per-stage and per-take progress notifications across a full fake render", async () => {
    const dir = mkIsolatedTmp();
    const prompt = writeValidPrompt(dir);
    const scriptsDir = join(dir, "scripts");
    writeFakeSoulxScripts(scriptsDir);

    const events: SoulxProgressEvent[] = [];
    const res = await renderSoulxLead(baseClock, {
      soulxRoot: dir,
      pythonExecutable: process.execPath,
      scriptsDir,
      promptWav: prompt.wav,
      promptMeta: prompt.meta,
      takes: 2,
      onProgress: (ev) => {
        events.push(ev);
      },
    });
    expect(res.pcm.length).toBeGreaterThan(0);
    expect(events).toEqual([
      { stage: "export", step: 1, total: 5 },
      { stage: "take", take: 1, takes: 2, step: 2, total: 5 },
      { stage: "take", take: 2, takes: 2, step: 3, total: 5 },
      { stage: "repin", step: 4, total: 5 },
      { stage: "place", step: 5, total: 5 },
    ]);
    expect(soulxProgressNotification("tok-s", events[1]!)).toEqual({
      method: "notifications/progress",
      params: {
        progressToken: "tok-s",
        progress: 2,
        total: 5,
        message: "SoulX [2/5]: take 1/2 verified",
      },
    });
    expect(soulxProgressNotification(3, events[4]!).params.message).toBe(
      "SoulX [5/5]: placed vocal stem",
    );
  });

  it("resolves SOULX_RENDER_DEADLINE_MS env override with stderr log and exercises POSIX/Windows tree-kill paths", async () => {
    const prev = process.env[SOULX_DEADLINE_ENV];
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      delete process.env[SOULX_DEADLINE_ENV];
      expect(resolveSoulxDeadlineMs()).toBe(SOULX_RENDER_DEADLINE_MS);

      process.env[SOULX_DEADLINE_ENV] = "42000";
      expect(resolveSoulxDeadlineMs()).toBe(42_000);
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${SOULX_DEADLINE_ENV}=42000ms`),
      );

      process.env[SOULX_DEADLINE_ENV] = "bad";
      expect(resolveSoulxDeadlineMs()).toBe(SOULX_RENDER_DEADLINE_MS);
    } finally {
      errSpy.mockRestore();
      if (prev === undefined) delete process.env[SOULX_DEADLINE_ENV];
      else process.env[SOULX_DEADLINE_ENV] = prev;
    }

    // Exercise both win32 and posix branches deterministically regardless of host OS.
    const syncCalls: Array<{ cmd: string; args: readonly string[] }> = [];
    killProcessTreeSync(12345, "win32", ((cmd: string, args: readonly string[]) => {
      syncCalls.push({ cmd, args });
      return {} as never;
    }) as never);
    expect(syncCalls).toEqual([{ cmd: "taskkill", args: ["/PID", "12345", "/T", "/F"] }]);

    const killSpy = vi.spyOn(process, "kill").mockImplementation((() => true) as never);
    try {
      killProcessTreeSync(23456, "linux");
      expect(killSpy).toHaveBeenCalledWith(-23456, "SIGKILL");
      expect(killSpy).toHaveBeenCalledWith(23456, "SIGKILL");
    } finally {
      killSpy.mockRestore();
    }

    const fakeProc = {
      pid: 34567,
      exitCode: null,
      signalCode: null,
      once: (ev: string, fn: () => void) => {
        if (ev === "close") queueMicrotask(fn);
        return fakeProc;
      },
      removeListener: () => fakeProc,
      kill: () => true,
    } as never;
    const winSpawn = vi.fn(() => {
      const listeners = new Map<string, () => void>();
      queueMicrotask(() => listeners.get("close")?.());
      return {
        once(ev: string, fn: () => void) {
          listeners.set(ev, fn);
        },
      };
    });
    await killChildProcessTree(fakeProc, "win32", winSpawn as never);
    expect(winSpawn).toHaveBeenCalledWith(
      "taskkill",
      ["/PID", "34567", "/T", "/F"],
      expect.objectContaining({ stdio: "ignore", windowsHide: true }),
    );
  });

  it("skips pid-based kills after a child has already exited", async () => {
    const exitedProcKill = vi.fn(() => true);
    const exitedProc = {
      pid: 45678,
      exitCode: 0,
      signalCode: null,
      once: () => exitedProc,
      removeListener: () => exitedProc,
      kill: exitedProcKill,
    } as never;

    const winSpawn = vi.fn();
    await killChildProcessTree(exitedProc, "win32", winSpawn as never);
    expect(winSpawn).not.toHaveBeenCalled();
    expect(exitedProcKill).not.toHaveBeenCalled();

    const posixKillSpy = vi.spyOn(process, "kill").mockImplementation((() => true) as never);
    try {
      await killChildProcessTree(exitedProc, "linux");
      // Group kill (-pid) is safe because POSIX PGIDs stay pinned while members live,
      // but direct PID kill (+pid) must never run once exitCode !== null.
      expect(posixKillSpy).toHaveBeenCalledWith(-45678, "SIGKILL");
      expect(posixKillSpy).not.toHaveBeenCalledWith(45678, "SIGKILL");
      expect(exitedProcKill).not.toHaveBeenCalled();
    } finally {
      posixKillSpy.mockRestore();
    }

    const posixSpec = buildSoulxSpawnSpec("python3", ["script.py", "--flag"], "linux");
    expect(posixSpec.file).toBe(process.execPath);
    expect(posixSpec.detached).toBe(true);
    expect(posixSpec.stdio).toEqual(["pipe", "pipe", "pipe"]);
    const flagIdx = posixSpec.args.indexOf(POSIX_PARENT_GUARD_FLAG);
    expect(flagIdx).toBeGreaterThanOrEqual(1);
    expect(posixSpec.args.slice(flagIdx)).toEqual([
      POSIX_PARENT_GUARD_FLAG,
      "python3",
      "script.py",
      "--flag",
    ]);

    const winSpec = buildSoulxSpawnSpec("python.exe", ["script.py"], "win32");
    expect(winSpec).toEqual({
      file: "python.exe",
      args: ["script.py"],
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });
  });

  it("startPosixParentGuard kills the detached process group on parent EOF and mirrors normal child exit", () => {
    const mkStdin = () => Object.assign(new EventEmitter(), { resume: vi.fn(), pause: vi.fn() });

    // Missing command exits 2.
    const exitMissing: number[] = [];
    startPosixParentGuard({ argv: ["node", "guard.js", POSIX_PARENT_GUARD_FLAG], exit: (c) => exitMissing.push(c) });
    expect(exitMissing).toEqual([2]);

    // Normal child exit mirrors exit code without calling killGroup.
    const child1 = new EventEmitter();
    const kill1 = vi.fn();
    const exit1: number[] = [];
    startPosixParentGuard({
      argv: ["node", "guard.js", POSIX_PARENT_GUARD_FLAG, "python3", "run.py"],
      stdin: mkStdin() as never,
      spawner: (() => child1) as never,
      killGroup: kill1,
      exit: (c) => exit1.push(c),
    });
    child1.emit("exit", 0, null);
    expect(kill1).not.toHaveBeenCalled();
    expect(exit1).toEqual([0]);

    // Stdin EOF while child is running kills the process group and exits 137.
    const stdin2 = mkStdin();
    const child2 = new EventEmitter();
    const kill2 = vi.fn();
    const exit2: number[] = [];
    startPosixParentGuard({
      argv: ["node", "guard.js", POSIX_PARENT_GUARD_FLAG, "python3", "run.py"],
      stdin: stdin2 as never,
      spawner: (() => child2) as never,
      killGroup: kill2,
      exit: (c) => exit2.push(c),
    });
    stdin2.emit("end");
    expect(kill2).toHaveBeenCalledWith(process.pid);
    expect(exit2).toEqual([137]);

    // Spawn error logs to stderr and exits 127.
    const child3 = new EventEmitter();
    const errs: string[] = [];
    const exit3: number[] = [];
    startPosixParentGuard({
      argv: ["node", "guard.js", "missing-py"],
      stdin: mkStdin() as never,
      stderr: { write: (s: string) => { errs.push(s); return true; } } as never,
      spawner: (() => child3) as never,
      exit: (c) => exit3.push(c),
    });
    child3.emit("error", new Error("ENOENT"));
    expect(errs[0]).toContain("ENOENT");
    expect(exit3).toEqual([127]);
  });
});
