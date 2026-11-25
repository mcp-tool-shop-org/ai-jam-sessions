/**
 * SoulX-Singer bridge — score-conditioned neural SVS wired into the
 * TypeScript runtime. Orchestrates the Python pipeline that ships in
 * scripts/ and returns a ScoreSinger the live engine can start/stop.
 *
 * Environment variables (all optional; fallbacks try the obvious paths):
 *   SOULX_ROOT        — SoulX-Singer checkout (default: E:/AI/SoulX-Singer)
 *   SOULX_PYTHON      — Python interpreter with g2p_en + torch + soundfile
 *                       (default: E:/AI/SoulX-Singer/.venv/Scripts/python)
 *   SOULX_PROMPT_WAV  — Reference voice clip (16-bit mono WAV)
 *   SOULX_PROMPT_META — SoulX metadata JSON for the reference clip
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
  copyFileSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, extname, basename } from "node:path";
import { soulxCacheDir } from "../state-home.js";
import { getSharedAudioContext, setSharedAudioContext } from "../audio-shared.js";
import { RequestCancelledError, throwIfAborted, toCancelledError } from "../cancel.js";
import { readMonoWav } from "./kokoro-lead.js";
import { peakNormalize } from "./score-singer.js";
import type { ScoreSinger, ScoreSingerOptions } from "./score-singer.js";
import type { ScoreClock } from "./score-clock.js";

/** Default whole-render deadline for SoulX-Singer pipelines (15 minutes). */
export const SOULX_RENDER_DEADLINE_MS = 15 * 60 * 1000;

/** Env override for the SoulX whole-render deadline in milliseconds. */
export const SOULX_DEADLINE_ENV = "SOULX_RENDER_DEADLINE_MS";

export class SoulxRenderDeadlineError extends Error {
  readonly deadlineMs: number;

  constructor(message: string, deadlineMs: number) {
    super(message);
    this.name = "SoulxRenderDeadlineError";
    this.deadlineMs = deadlineMs;
  }
}

export type SoulxProgressEvent =
  | { stage: "export"; step: number; total: number }
  | { stage: "take"; take: number; takes: number; step: number; total: number }
  | { stage: "repin"; step: number; total: number }
  | { stage: "place"; step: number; total: number };

/** Format a SoulX progress event as an MCP notifications/progress payload. */
export function soulxProgressNotification(
  progressToken: string | number,
  event: SoulxProgressEvent,
): {
  method: "notifications/progress";
  params: { progressToken: string | number; progress: number; total: number; message: string };
} {
  let detail: string;
  switch (event.stage) {
    case "export":
      detail = "exported target";
      break;
    case "take":
      detail = `take ${event.take}/${event.takes} verified`;
      break;
    case "repin":
      detail = "repinned words";
      break;
    case "place":
      detail = "placed vocal stem";
      break;
  }
  return {
    method: "notifications/progress",
    params: {
      progressToken,
      progress: event.step,
      total: event.total,
      message: `SoulX [${event.step}/${event.total}]: ${detail}`,
    },
  };
}

/**
 * Resolve the whole-render SoulX deadline in milliseconds.
 * Logs to stderr whenever the SOULX_RENDER_DEADLINE_MS env override is read.
 */
export function resolveSoulxDeadlineMs(explicit?: number): number {
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const raw = process.env[SOULX_DEADLINE_ENV];
  if (raw !== undefined && raw.trim().length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      console.error(
        `[soulx] Using ${SOULX_DEADLINE_ENV}=${parsed}ms override (default ${SOULX_RENDER_DEADLINE_MS}ms)`,
      );
      return parsed;
    }
    console.error(
      `[soulx] Ignoring invalid ${SOULX_DEADLINE_ENV}="${raw}"; using default ${SOULX_RENDER_DEADLINE_MS}ms`,
    );
  }
  return SOULX_RENDER_DEADLINE_MS;
}

export interface SoulxSingerConfig {
  /** SoulX-Singer checkout directory. */
  soulxRoot?: string;
  /** Python interpreter with the SoulX venv packages. */
  pythonExecutable?: string;
  /** Directory holding SoulX helper scripts (defaults to <cwd>/scripts). */
  scriptsDir?: string;
  /** Reference voice clip (16-bit mono WAV or MP3). Overrides SOULX_PROMPT_WAV. */
  promptWav?: string;
  /** SoulX metadata JSON for the reference clip. Overrides SOULX_PROMPT_META. */
  promptMeta?: string;
  /** Number of takes to render (default: 6). */
  takes?: number;
  /** Re-articulate every syllable as its own word (default: true). */
  syllableWords?: boolean;
  /** Semitone shift applied to the take. */
  pitchShift?: number;
  /** Whether to clean up the temp directory after rendering. */
  cleanup?: boolean;
  /** Optional abort signal cancelling the render and killing any live child tree. */
  signal?: AbortSignal;
  /** Optional whole-render deadline override in ms. */
  deadlineMs?: number;
  /** Optional per-stage and per-take progress callback. */
  onProgress?: (event: SoulxProgressEvent) => void | Promise<void>;
}

function defaults(): {
  soulxRoot: string;
  pythonExecutable: string;
} {
  return {
    soulxRoot: process.env.SOULX_ROOT ?? "E:/AI/SoulX-Singer",
    pythonExecutable:
      process.env.SOULX_PYTHON ?? "E:/AI/SoulX-Singer/.venv/Scripts/python.exe",
  };
}

// ─── Cache ─────────────────────────────────────────────────────────────────

interface CacheKey {
  songId: string;
  lyrics: string;
  startMeasure: number;
  endMeasure: number;
  pitchShift: number;
  syllableWords: boolean;
  promptMetaSha256: string;
  promptWavSha256: string;
  takes: number;
}

function sha256hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

function buildCacheKey(clock: ScoreClock, config: SoulxSingerConfig): string {
  const prompt = resolvePrompt(config);
  const metaBuf = readFileSync(prompt.meta);
  const wavBuf = readFileSync(prompt.wav);
  const key: CacheKey = {
    songId: clock.song_id,
    lyrics: clock.events.map((e) => e.lyric).join(" "),
    startMeasure: clock.clock.bed_measures[0],
    endMeasure: clock.clock.bed_measures[1],
    pitchShift: config.pitchShift ?? 0,
    syllableWords: config.syllableWords !== false,
    promptMetaSha256: sha256hex(metaBuf),
    promptWavSha256: sha256hex(wavBuf),
    takes: Math.max(1, config.takes ?? 6),
  };
  return sha256hex(JSON.stringify(key, Object.keys(key).sort()));
}

function cacheHit(key: string): { pcm: Float32Array; sampleRate: number } | null {
  const dir = join(soulxCacheDir(), key);
  const wav = join(dir, "placed.wav");
  if (!existsSync(wav)) return null;
  try {
    const { pcm, sampleRate } = readMonoWav(wav);
    return { pcm, sampleRate };
  } catch {
    return null;
  }
}

function cacheStore(key: string, pcm: Float32Array, sampleRate: number): void {
  const dir = join(soulxCacheDir(), key);
  mkdirSync(dir, { recursive: true });

  // Write a minimal 16-bit mono WAV
  const data = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    data.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, i * 2);
  }
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(join(dir, "placed.wav"), Buffer.concat([header, data]));
}

/**
 * Auto-discover the default SoulX example prompt in the checkout.
 * Prefers the English prompt (en_prompt) if present; falls back to any prompt pair.
 * Returns { wav, meta } paths or null if nothing found.
 */
function discoverDefaultPrompt(root: string): { wav: string; meta: string } | null {
  const exampleDir = join(root, "example", "audio");
  if (!existsSync(exampleDir)) return null;

  const files = readdirSync(exampleDir);
  const jsons = files.filter((f) => f.endsWith("_prompt.json"));
  if (jsons.length === 0) return null;

  // Prefer English prompt
  const preferred = jsons.find((f) => f.startsWith("en_"));
  const metaFile = preferred ?? jsons[0];
  const base = metaFile.replace("_prompt.json", "");

  // Find matching audio: same base + common audio extensions
  const exts = [".mp3", ".wav", ".flac", ".ogg"];
  for (const ext of exts) {
    const wav = join(exampleDir, `${base}_prompt${ext}`);
    if (existsSync(wav)) {
      return { wav, meta: join(exampleDir, metaFile) };
    }
  }
  return null;
}

/**
 * Resolve prompt WAV + metadata, with env → config → auto-discover fallback.
 * Throws a helpful error if the prompt is missing or invalid.
 */
function resolvePrompt(
  config: SoulxSingerConfig,
): { wav: string; meta: string } {
  const defs = defaults();
  const root = config.soulxRoot ?? defs.soulxRoot;

  let wav = config.promptWav ?? process.env.SOULX_PROMPT_WAV ?? "";
  let meta = config.promptMeta ?? process.env.SOULX_PROMPT_META ?? "";

  // Auto-discover if neither env nor config set the prompt
  if ((!wav || !existsSync(wav)) && (!meta || !existsSync(meta))) {
    const discovered = discoverDefaultPrompt(root);
    if (discovered) {
      wav = discovered.wav;
      meta = discovered.meta;
    }
  }

  if (!wav || !existsSync(wav)) {
    const exampleDir = join(root, "example", "audio");
    throw new Error(
      `SoulX prompt WAV not found. Set SOULX_PROMPT_WAV to a 16-bit mono WAV/MP3, ` +
        `pass promptWav in SoulxSingerConfig, or place an example prompt in ${exampleDir}.`,
    );
  }
  if (!meta || !existsSync(meta)) {
    const exampleDir = join(root, "example", "audio");
    throw new Error(
      `SoulX prompt metadata JSON not found. Set SOULX_PROMPT_META, ` +
        `pass promptMeta in SoulxSingerConfig, or place an example prompt in ${exampleDir}.`,
    );
  }

  // Basic validation: the JSON must be a SoulX-format prompt array
  try {
    const parsed = JSON.parse(readFileSync(meta, "utf8"));
    const seg = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!seg || typeof seg.duration !== "string" || typeof seg.phoneme !== "string") {
      throw new Error("prompt metadata is not a SoulX-format segment");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`SoulX prompt metadata invalid (${meta}): ${msg}`);
  }

  return { wav, meta };
}

const activeChildren = new Set<ChildProcess>();
const activeRenderControllers = new Set<AbortController>();

/** Synchronously kill a process tree (used on process exit and signal shutdown). */
export function killProcessTreeSync(
  pid: number,
  platform: NodeJS.Platform = process.platform,
  runSync: typeof spawnSync = spawnSync,
): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (platform === "win32") {
    try {
      runSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
        timeout: 5000,
      });
    } catch {
      /* process already gone */
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* process group already gone */
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* process already gone */
  }
}

/** Kill a child process and all of its descendants, awaiting exit (bounded). */
export async function killChildProcessTree(
  proc: ChildProcess,
  platform: NodeJS.Platform = process.platform,
  spawner: typeof spawn = spawn,
): Promise<void> {
  const pid = proc.pid;
  if (!pid) return;

  const waitClosed =
    proc.exitCode !== null || proc.signalCode !== null
      ? Promise.resolve()
      : new Promise<void>((resolveClose) => {
          const timer = setTimeout(done, 2000);
          function done(): void {
            clearTimeout(timer);
            proc.removeListener("close", done);
            proc.removeListener("exit", done);
            resolveClose();
          }
          proc.once("close", done);
          proc.once("exit", done);
        });

  if (platform === "win32") {
    await new Promise<void>((resolveTaskkill) => {
      try {
        const killer = spawner("taskkill", ["/PID", String(pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
        killer.once("close", () => resolveTaskkill());
        killer.once("error", () => resolveTaskkill());
      } catch {
        resolveTaskkill();
      }
    });
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already terminated */
    }
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* process group already gone */
    }
    try {
      proc.kill("SIGKILL");
    } catch {
      /* process already gone */
    }
  }

  await waitClosed;
}

/** Synchronously abort active render controllers and kill any tracked SoulX children. */
export function killAllSoulxChildrenSync(): void {
  for (const ctrl of [...activeRenderControllers]) {
    if (!ctrl.signal.aborted) {
      ctrl.abort(new RequestCancelledError("Server shutting down"));
    }
  }
  for (const proc of [...activeChildren]) {
    if (proc.pid) {
      killProcessTreeSync(proc.pid);
    }
  }
}

/** Abort all active SoulX renders and wait for every child process tree to die. */
export async function abortAllSoulxRenders(reason = "Server shutting down"): Promise<void> {
  const err = new RequestCancelledError(reason);
  for (const ctrl of [...activeRenderControllers]) {
    if (!ctrl.signal.aborted) {
      ctrl.abort(err);
    }
  }
  const children = [...activeChildren];
  await Promise.all(children.map((proc) => killChildProcessTree(proc)));
}

let exitHookRegistered = false;
function ensureExitHook(): void {
  if (exitHookRegistered) return;
  exitHookRegistered = true;
  process.on("exit", () => {
    killAllSoulxChildrenSync();
  });
}

function abortReasonToError(reason: unknown): Error {
  if (reason instanceof SoulxRenderDeadlineError) return reason;
  return toCancelledError(reason, "SoulX render cancelled");
}

function runPy(
  cmd: string,
  args: string[],
  cwd?: string,
  extraEnv?: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ code: number; stdout: string; stderr: string }> {
  if (signal?.aborted) {
    return Promise.reject(abortReasonToError(signal.reason));
  }
  ensureExitHook();

  return new Promise((resolveRun, rejectRun) => {
    let settled = false;
    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    activeChildren.add(proc);

    let stdout = "";
    let stderr = "";
    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    proc.stdout?.on("data", (d: string) => {
      stdout += d;
    });
    proc.stderr?.on("data", (d: string) => {
      stderr += d;
    });

    const cleanup = () => {
      activeChildren.delete(proc);
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      void killChildProcessTree(proc).finally(() => {
        cleanup();
        if (!settled) {
          settled = true;
          rejectRun(abortReasonToError(signal?.reason));
        }
      });
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    proc.on("close", (code) => {
      cleanup();
      if (!settled) {
        settled = true;
        if (signal?.aborted) {
          rejectRun(abortReasonToError(signal.reason));
          return;
        }
        resolveRun({ code: code ?? 0, stdout, stderr });
      }
    });
    proc.on("error", (err) => {
      cleanup();
      if (!settled) {
        settled = true;
        rejectRun(signal?.aborted ? abortReasonToError(signal.reason) : err);
      }
    });
  });
}

/** Render a placed SoulX vocal stem from a score clock. */
export async function renderSoulxLead(
  clock: ScoreClock,
  config: SoulxSingerConfig = {},
  options: ScoreSingerOptions = {},
): Promise<{ pcm: Float32Array; sampleRate: number; warnings: string[]; tmpDir: string }> {
  throwIfAborted(config.signal, "SoulX render cancelled");

  const defs = defaults();
  const root = config.soulxRoot ?? defs.soulxRoot;
  const py = config.pythonExecutable ?? defs.pythonExecutable;

  // ── Cache check ──────────────────────────────────────────────────
  // resolvePrompt early so the cache key is stable
  const prompt = resolvePrompt(config);
  const cacheKey = buildCacheKey(clock, config);
  const cached = cacheHit(cacheKey);
  if (cached) {
    const pcm = peakNormalize(cached.pcm, options.masterGain ?? 0.45);
    return {
      pcm,
      sampleRate: cached.sampleRate,
      warnings: ["SoulX: served from cache."],
      tmpDir: "",
    };
  }

  const scriptsDir =
    config.scriptsDir ??
    process.env.SOULX_SCRIPTS_DIR ??
    join(resolve(), "scripts");
  const tmpDir = mkdtempSync(join(tmpdir(), "ajs-soulx-"));
  const clockPath = join(tmpDir, "clock.json");
  const targetPath = join(tmpDir, "target.json");

  const deadlineMs = resolveSoulxDeadlineMs(config.deadlineMs);
  const renderController = new AbortController();
  activeRenderControllers.add(renderController);

  const onCallerAbort = () => {
    renderController.abort(toCancelledError(config.signal?.reason, "SoulX render cancelled"));
  };
  config.signal?.addEventListener("abort", onCallerAbort, { once: true });

  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  let deadlineError: SoulxRenderDeadlineError | null = null;
  deadlineTimer = setTimeout(() => {
    deadlineError = new SoulxRenderDeadlineError(
      `SoulX render exceeded the ${deadlineMs}ms whole-render deadline (set ${SOULX_DEADLINE_ENV} to override).`,
      deadlineMs,
    );
    renderController.abort(deadlineError);
  }, deadlineMs);

  const signal = renderController.signal;
  const nTakes = Math.max(1, config.takes ?? 6);
  const totalSteps = nTakes + 3;
  const takeDirs: string[] = [];
  const candidateSpecs: string[] = [];

  try {
    writeFileSync(clockPath, JSON.stringify(clock, null, 2) + "\n");

    // ── 1. Export target ──────────────────────────────────────────────
    const exportArgs = [
      join(scriptsDir, "export_soulx_target.py"),
      "--clock",
      clockPath,
      "--out",
      targetPath,
    ];
    if (config.syllableWords !== false) {
      exportArgs.push("--syllable-words");
    }

    const exportResult = await runPy(py, exportArgs, undefined, undefined, signal);
    if (exportResult.code !== 0) {
      throw new Error(
        `export_soulx_target.py failed (exit ${exportResult.code}): ${exportResult.stderr || exportResult.stdout}`,
      );
    }
    await config.onProgress?.({ stage: "export", step: 1, total: totalSteps });

    // ── 2. Render takes ─────────────────────────────────────────────
    for (let i = 1; i <= nTakes; i++) {
      if (signal.aborted) throw abortReasonToError(signal.reason);

      const tDir = join(tmpDir, `take-${String(i).padStart(2, "0")}`);
      takeDirs.push(tDir);

      const takeResult = await runPy(
        py,
        [
          join(scriptsDir, "soulx_take.py"),
          "--target",
          targetPath,
          "--prompt-wav",
          prompt.wav,
          "--prompt-meta",
          prompt.meta,
          "--out-dir",
          tDir,
          ...(config.pitchShift ? ["--pitch-shift", String(config.pitchShift)] : []),
        ],
        root,
        { PYTHONPATH: root },
        signal,
      );

      if (takeResult.code !== 0) {
        throw new Error(
          `soulx_take.py take ${i} failed (exit ${takeResult.code}): ${takeResult.stderr || takeResult.stdout}`,
        );
      }

      const takeWav = join(tDir, "take-48k.wav");
      if (!existsSync(takeWav)) {
        throw new Error(`SoulX take ${i} did not produce ${takeWav}`);
      }

      // ── 3. Energy verify (receipt for repin) ───────────────────────
      const receiptPath = join(tDir, "verify-energy.json");
      await runPy(
        py,
        [
          join(scriptsDir, "vocal_clock.py"),
          "verify",
          "--clock",
          clockPath,
          "--vocal",
          takeWav,
          "--receipt",
          receiptPath,
        ],
        undefined,
        undefined,
        signal,
      );

      candidateSpecs.push(`${takeWav}=${receiptPath}`);
      await config.onProgress?.({
        stage: "take",
        take: i,
        takes: nTakes,
        step: 1 + i,
        total: totalSteps,
      });
    }

    // ── 4. Repin (word-level pick) ──────────────────────────────────
    if (signal.aborted) throw abortReasonToError(signal.reason);
    const planPath = join(tmpDir, "plan.json");
    const repinArgs = [
      join(scriptsDir, "vocal_clock.py"),
      "repin",
      "--clock",
      clockPath,
      "--out",
      planPath,
    ];
    if (config.syllableWords !== false) {
      repinArgs.push("--split-words");
    }
    for (const spec of candidateSpecs) {
      repinArgs.push("--candidate", spec);
    }

    const repinResult = await runPy(py, repinArgs, undefined, undefined, signal);
    if (repinResult.code !== 0) {
      throw new Error(
        `vocal_clock.py repin failed (exit ${repinResult.code}): ${repinResult.stderr || repinResult.stdout}`,
      );
    }
    await config.onProgress?.({ stage: "repin", step: nTakes + 2, total: totalSteps });

    // ── 5. Place local ──────────────────────────────────────────────
    if (signal.aborted) throw abortReasonToError(signal.reason);
    const placedDir = join(tmpDir, "placed");
    const placedInfoPath = join(placedDir, "placed.json");
    const placeResult = await runPy(
      py,
      [
        join(scriptsDir, "vocal_clock.py"),
        "place",
        "--local",
        "--plan",
        planPath,
        "--out-dir",
        placedDir,
        "--out-info",
        placedInfoPath,
      ],
      undefined,
      undefined,
      signal,
    );

    if (placeResult.code !== 0) {
      throw new Error(
        `vocal_clock.py place failed (exit ${placeResult.code}): ${placeResult.stderr || placeResult.stdout}`,
      );
    }
    await config.onProgress?.({ stage: "place", step: totalSteps, total: totalSteps });

    const placedInfo = JSON.parse(readFileSync(placedInfoPath, "utf8"));
    const placedWav: string = placedInfo.path;
    if (!placedWav || !existsSync(placedWav)) {
      throw new Error(`Place did not produce a WAV file (expected ${placedWav})`);
    }

    const wav = readMonoWav(placedWav);
    const pcm = peakNormalize(wav.pcm, options.masterGain ?? 0.45);

    // Store in cache for next time
    try {
      cacheStore(cacheKey, pcm, wav.sampleRate);
    } catch {
      /* cache failure is non-fatal */
    }

    const warnings: string[] = [];
    if (nTakes === 1) {
      warnings.push("SoulX: single take (no bag-of-takes selection).");
    }

    if (config.cleanup !== false) {
      // Keep the placed output; delete intermediate takes to save space
      for (const tDir of takeDirs) {
        try { rmSync(tDir, { recursive: true }); } catch { /* ok */ }
      }
    }

    return { pcm, sampleRate: wav.sampleRate, warnings, tmpDir };
  } catch (err) {
    if (config.cleanup !== false) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
    if (deadlineError) throw deadlineError;
    if (signal.aborted) throw abortReasonToError(signal.reason);
    throw err;
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    config.signal?.removeEventListener("abort", onCallerAbort);
    activeRenderControllers.delete(renderController);
  }
}

/** Build a ScoreSinger whose connect() runs the full SoulX pipeline. */
export function createSoulxScoreSinger(
  clock: ScoreClock,
  config: SoulxSingerConfig = {},
  options: ScoreSingerOptions = {},
): ScoreSinger {
  let pcm: Float32Array | null = null;
  let pcmRate = 48000;
  let source: any = null;
  let gainNode: any = null;
  let ownedCtx: any = null;
  let AudioContextCtor: (new (o: object) => any) | null = null;
  const durationSec = clock.total_seconds + 0.15;
  let warnings: string[] = [];
  let connectController: AbortController | null = null;
  let connectPromise: Promise<void> | null = null;

  return {
    durationSec,
    get warnings() {
      return warnings;
    },

    async connect(): Promise<void> {
      const localController = new AbortController();
      connectController = localController;
      const forwardAbort = () => {
        localController.abort(config.signal?.reason);
      };
      if (config.signal?.aborted) {
        localController.abort(config.signal.reason);
      } else {
        config.signal?.addEventListener("abort", forwardAbort, { once: true });
      }

      const run = (async () => {
        const rendered = await renderSoulxLead(
          clock,
          { ...config, signal: localController.signal },
          options,
        );
        pcm = rendered.pcm;
        pcmRate = rendered.sampleRate;
        warnings = rendered.warnings;
        const mod = await import("node-web-audio-api");
        AudioContextCtor = mod.AudioContext as new (o: object) => any;
      })();
      connectPromise = run;

      try {
        await run;
      } finally {
        config.signal?.removeEventListener("abort", forwardAbort);
        if (connectController === localController) connectController = null;
        if (connectPromise === run) connectPromise = null;
      }
    },

    start(): void {
      if (!pcm) return;
      let ctx = getSharedAudioContext();
      if (!ctx) {
        if (!AudioContextCtor) return;
        ownedCtx = new AudioContextCtor({ sampleRate: pcmRate, latencyHint: "playback" });
        setSharedAudioContext(ownedCtx);
        ctx = ownedCtx;
      }
      const rate = Number(ctx.sampleRate) || pcmRate;
      const buffer = ctx.createBuffer(1, pcm.length, rate);
      const ch = buffer.getChannelData(0);
      ch.set(pcm.subarray(0, ch.length));
      source = ctx.createBufferSource();
      source.buffer = buffer;
      gainNode = ctx.createGain();
      gainNode.gain.value = options.masterGain ?? 1;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
    },

    async stop(): Promise<void> {
      if (connectController && !connectController.signal.aborted) {
        connectController.abort(new RequestCancelledError("ScoreSinger stopped"));
      }
      if (connectPromise) {
        await connectPromise.catch(() => {});
      }
      if (source) {
        try {
          source.stop();
        } catch {
          /* already ended */
        }
        try {
          source.disconnect();
        } catch {
          /* ok */
        }
        source = null;
      }
      if (gainNode) {
        try {
          gainNode.disconnect();
        } catch {
          /* ok */
        }
        gainNode = null;
      }
      if (ownedCtx) {
        if (getSharedAudioContext() === ownedCtx) setSharedAudioContext(null);
        try {
          await ownedCtx.close();
        } catch {
          /* ok */
        }
        ownedCtx = null;
      }
      pcm = null;
    },
  };
}
