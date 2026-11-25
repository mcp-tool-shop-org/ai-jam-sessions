import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const audioDouble = vi.hoisted(() => {
  const disconnectWaiters: Array<() => void> = [];
  return {
    disconnects: 0,
    singerStops: 0,
    hangDisconnect: false,
    releaseDisconnects() {
      this.hangDisconnect = false;
      for (const resolve of disconnectWaiters.splice(0)) resolve();
    },
    waitDisconnect(): Promise<void> {
      return new Promise<void>((resolve) => {
        disconnectWaiters.push(resolve);
      });
    },
  };
});

function fakeConnector(kind: string) {
  return {
    kind,
    async connect() {},
    async disconnect() {
      audioDouble.disconnects++;
      if (audioDouble.hangDisconnect) {
        await audioDouble.waitDisconnect();
      }
    },
    status() {
      return "connected" as const;
    },
    listPorts() {
      return ["fake-port"];
    },
    noteOn() {},
    noteOff() {},
    allNotesOff() {},
    async playNote() {
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
    createTapOutput() {
      return {};
    },
  };
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
vi.mock("./playback/metronome.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./playback/metronome.js")>();
  return {
    ...actual,
    createMetronome: () => ({ start() {}, stop() {}, setTempo() {}, async countIn() {} }),
  };
});

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function writeWav16(filePath: string, sampleRate: number, frameCount: number, hz = 440): void {
  const dataBytes = frameCount * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < frameCount; i++) {
    const s = Math.sin((2 * Math.PI * hz * i) / sampleRate) * 0.4;
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  writeFileSync(filePath, buf);
}

function writePromptPair(dir: string): { wav: string; meta: string } {
  const wav = join(dir, "prompt.wav");
  const meta = join(dir, "prompt.json");
  writeWav16(wav, 48000, 10);
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

async function waitForPidDead(pid: number, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  expect(isPidAlive(pid)).toBe(false);
}

async function waitForPidMarker(markerFile: string): Promise<{ parentPid: number; childPid: number }> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (existsSync(markerFile)) {
      try {
        return JSON.parse(readFileSync(markerFile, "utf8")) as { parentPid: number; childPid: number };
      } catch {
        /* partial write */
      }
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`PID marker never appeared at ${markerFile}`);
}

function extractText(res: { content: Array<{ type: string; text?: string }> }): string {
  return res.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
}

const ENV_KEYS = [
  "AI_JAM_HOME",
  "OLLAMA_HOST",
  "SOULX_PYTHON",
  "SOULX_SCRIPTS_DIR",
  "SOULX_ROOT",
  "SOULX_RENDER_DEADLINE_MS",
  "AJS_AUDIO_MAX_FILE_BYTES",
  "AJS_AUDIO_MAX_DURATION_SEC",
];

describe("MCP real stops: cancellation, deadlines, child kills, progress, and input caps", () => {
  let tmpDir: string;
  let envSnapshot: Record<string, string | undefined>;
  let servers: HttpServer[] = [];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ajs-real-stops-"));
    envSnapshot = {};
    for (const k of ENV_KEYS) envSnapshot[k] = process.env[k];
    process.env.AI_JAM_HOME = join(tmpDir, ".ai-jam-sessions");
  });

  afterEach(async () => {
    for (const s of servers.splice(0)) {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
    for (const [k, v] of Object.entries(envSnapshot)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  });

  async function startFakeOllama(
    onChat: (index: number, body: Record<string, unknown>, respond: (content: string) => void) => void,
  ): Promise<{ url: string; chatCount: () => number }> {
    let count = 0;
    const srv = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/api/tags") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ models: [] }));
        return;
      }
      if (req.method === "POST" && req.url === "/api/chat") {
        count++;
        const callIndex = count;
        let raw = "";
        req.setEncoding("utf8");
        req.on("data", (c) => {
          raw += c;
        });
        req.on("end", () => {
          const parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
          let responded = false;
          const respond = (content: string) => {
            if (responded || res.writableEnded) return;
            responded = true;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                model: "qwen2.5:7b",
                message: { role: "assistant", content },
                done: true,
              }),
            );
          };
          onChat(callIndex, parsed, respond);
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    servers.push(srv);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const addr = srv.address();
    if (!addr || typeof addr === "string") throw new Error("bad addr");
    return {
      url: `http://127.0.0.1:${addr.port}`,
      chatCount: () => count,
    };
  }

  async function connectInMemory() {
    vi.resetModules();
    const mod = await import("./mcp-server.js");
    const mcpServer = await mod.prepareMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "real-stops-test", version: "1.0.0" }, { capabilities: {} });
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
    return {
      client,
      mod,
      close: async () => {
        await mod.shutdownMcpServer("test teardown");
        await client.close().catch(() => {});
        await mcpServer.close().catch(() => {});
      },
    };
  }

  it("aborts auto_reharmonize mid-run with zero further fake-Ollama calls and streams per-sample progress", async () => {
    let releaseCall2: (() => void) | null = null;
    const ollama = await startFakeOllama((idx, _body, respond) => {
      if (idx === 1) {
        // Sample 1 yields no chords -> fails verification and moves to sample 2.
        respond("no chords here");
      } else if (idx === 2) {
        releaseCall2 = () => respond("no chords");
      } else {
        respond('K:Amin\n"Fmaj7"A2 |');
      }
    });
    process.env.OLLAMA_HOST = ollama.url;

    const { client, close } = await connectInMemory();
    try {
      const ac = new AbortController();
      const progressEvents: Array<{ progress: number; total?: number; message?: string }> = [];
      const callPromise = client.callTool(
        {
          name: "auto_reharmonize",
          arguments: { songId: "america-the-beautiful", measures: "1-4", maxSamples: 5 },
        },
        undefined,
        {
          signal: ac.signal,
          onprogress: (p) => progressEvents.push(p),
        },
      );

      // Wait until the 2nd /api/chat request is in flight, then abort.
      const waitUntil = Date.now() + 3000;
      while (ollama.chatCount() < 2 && Date.now() < waitUntil) {
        await new Promise((r) => setTimeout(r, 15));
      }
      expect(ollama.chatCount()).toBe(2);
      expect(progressEvents.length).toBe(1);
      expect(progressEvents[0]).toMatchObject({ progress: 1, total: 5 });

      ac.abort("user aborted auto_reharmonize");
      await expect(callPromise).rejects.toThrow();

      // Even if the in-flight socket were freed now, no 3rd sample may start.
      releaseCall2?.();
      await new Promise((r) => setTimeout(r, 80));
      expect(ollama.chatCount()).toBe(2);

      // Separate run with progress token emits 1..maxSamples notifications.
      const completedProgress: Array<{ progress: number; total?: number; message?: string }> = [];
      let sampleIdx = 0;
      const ollama2 = await startFakeOllama((_idx, _body, respond) => {
        sampleIdx++;
        respond("not abc");
      });
      process.env.OLLAMA_HOST = ollama2.url;
      const res = (await client.callTool(
        {
          name: "auto_reharmonize",
          arguments: { songId: "america-the-beautiful", measures: "1-4", maxSamples: 3 },
        },
        undefined,
        { onprogress: (p) => completedProgress.push(p) },
      )) as { isError?: boolean };
      expect(res.isError).not.toBe(true);
      expect(sampleIdx).toBe(3);
      expect(completedProgress.map((p) => [p.progress, p.total])).toEqual([
        [1, 3],
        [2, 3],
        [3, 3],
      ]);
    } finally {
      await close();
    }
  });

  it("aborts compose_panel mid-run and stops issuing further fake-Ollama calls", async () => {
    let releaseHung: (() => void) | null = null;
    const ollama = await startFakeOllama((idx, _body, respond) => {
      if (idx === 1) {
        // First realization completes; second hangs until abort.
        respond('[{"measure":1,"degrees":[0,1,2,0]}]');
      } else {
        releaseHung = () => respond('[{"measure":1,"degrees":[0,1,2,0]}]');
      }
    });
    process.env.OLLAMA_HOST = ollama.url;

    const { client, close } = await connectInMemory();
    try {
      const ac = new AbortController();
      const callPromise = client.callTool(
        {
          name: "compose_panel",
          arguments: {
            songs: "america-the-beautiful",
            measures: "1-2",
            n: 2,
            judges: "m1:fam1,m2:fam2,m3:fam3",
          },
        },
        undefined,
        { signal: ac.signal },
      );

      const waitUntil = Date.now() + 4000;
      while (ollama.chatCount() < 2 && Date.now() < waitUntil) {
        await new Promise((r) => setTimeout(r, 15));
      }
      expect(ollama.chatCount()).toBe(2);

      ac.abort("abort compose_panel");
      await expect(callPromise).rejects.toThrow();

      releaseHung?.();
      await new Promise((r) => setTimeout(r, 80));
      expect(ollama.chatCount()).toBe(2);
    } finally {
      await close();
    }
  });

  it("compose_panel MCP tool reports unreachable probe-failed judge, sets think: false by capability, and pins num_ctx", async () => {
    const seenShow: string[] = [];
    const seenJudgeBodies: Array<Record<string, unknown>> = [];
    const srv = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/api/tags") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ models: [] }));
        return;
      }
      let raw = "";
      req.setEncoding("utf8");
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        const body = JSON.parse(raw || "{}") as Record<string, unknown>;
        if (req.method === "POST" && req.url === "/api/show") {
          const model = String(body.model ?? "");
          seenShow.push(model);
          if (model === "m4:latest") {
            req.socket.destroy();
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ capabilities: model === "m1:latest" ? ["completion", "thinking"] : ["completion"] }));
          return;
        }
        if (req.method === "POST" && req.url === "/api/chat") {
          const model = String(body.model ?? "");
          if (model === "qwen2.5:7b") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              model,
              message: { role: "assistant", content: '[{"measure":1,"degrees":[0,1,2,0]}]' },
              done: true,
            }));
            return;
          }
          seenJudgeBodies.push(body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            model,
            message: { role: "assistant", content: '{"best":1,"worst":4}' },
            done: true,
          }));
          return;
        }
        res.writeHead(404);
        res.end();
      });
    });
    servers.push(srv);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const addr = srv.address();
    if (!addr || typeof addr === "string") throw new Error("bad addr");
    process.env.OLLAMA_HOST = `http://127.0.0.1:${addr.port}`;

    const { client, close } = await connectInMemory();
    try {
      const res = (await client.callTool({
        name: "compose_panel",
        arguments: {
          songs: "america-the-beautiful",
          measures: "1-2",
          n: 1,
          judges: "m1:latest:fam1,m2:latest:fam2,m3:latest:fam3,m4:latest:fam4",
        },
      })) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
      expect(res.isError).not.toBe(true);
      const text = extractText(res);
      expect(text).toContain("Dropped votes: 1 (timeout: 0, empty_reply: 0, parse_failure: 0, unreachable: 1)");
      expect(text).toContain("Minimum-judges gate: PASSED (1/1 songs met >=3 judges)");
      const m1Body = seenJudgeBodies.find((b) => b.model === "m1:latest")!;
      const m2Body = seenJudgeBodies.find((b) => b.model === "m2:latest")!;
      expect(m1Body.think).toBe(false);
      expect("think" in m2Body).toBe(false);
      expect((m1Body.options as Record<string, unknown>).num_ctx).toBe(16_384);
      expect(seenShow).toEqual(expect.arrayContaining(["m1:latest", "m2:latest", "m3:latest", "m4:latest"]));
    } finally {
      await close();
    }
  });

  it("kills fake SoulX child process tree on abort, deadline, stop_playback, and reports progress", async () => {
    const prompt = writePromptPair(tmpDir);
    const scriptsDir = join(tmpDir, "scripts");
    const markerFile = join(tmpDir, "soulx-pids.json");
    writeFakeSoulxScripts(scriptsDir, { sleepOn: "export", pidMarkerFile: markerFile });

    process.env.SOULX_PYTHON = process.execPath;
    process.env.SOULX_SCRIPTS_DIR = scriptsDir;
    process.env.SOULX_ROOT = tmpDir;

    const { client, close } = await connectInMemory();
    try {
      // 1) Abort via request AbortSignal
      const ac = new AbortController();
      const abortCall = client.callTool(
        {
          name: "play_song",
          arguments: {
            id: "america-the-beautiful",
            startMeasure: 2,
            endMeasure: 4,
            lyrics: "O beau-ti-ful",
            singerBackend: "soulx",
            singerPromptWav: prompt.wav,
            singerPromptMeta: prompt.meta,
          },
        },
        undefined,
        { signal: ac.signal },
      );
      const pids1 = await waitForPidMarker(markerFile);
      ac.abort("abort play_song");
      await expect(abortCall).rejects.toThrow();
      await waitForPidDead(pids1.parentPid);
      await waitForPidDead(pids1.childPid);

      // 2) Whole-render deadline via SOULX_RENDER_DEADLINE_MS
      rmSync(markerFile, { force: true });
      process.env.SOULX_RENDER_DEADLINE_MS = "250";
      const deadlineRes = (await client.callTool({
        name: "play_song",
        arguments: {
          id: "america-the-beautiful",
          startMeasure: 2,
          endMeasure: 4,
          lyrics: "O beau-ti-ful",
          singerBackend: "soulx",
          singerPromptWav: prompt.wav,
          singerPromptMeta: prompt.meta,
        },
      })) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
      expect(deadlineRes.isError).toBe(true);
      expect(extractText(deadlineRes)).toMatch(/deadline/i);
      const pids2 = JSON.parse(readFileSync(markerFile, "utf8")) as { parentPid: number; childPid: number };
      await waitForPidDead(pids2.parentPid);
      await waitForPidDead(pids2.childPid);

      // 3) stop_playback while play_song is in-flight
      delete process.env.SOULX_RENDER_DEADLINE_MS;
      rmSync(markerFile, { force: true });
      const playPromise = client.callTool({
        name: "play_song",
        arguments: {
          id: "america-the-beautiful",
          startMeasure: 2,
          endMeasure: 4,
          lyrics: "O beau-ti-ful",
          singerBackend: "soulx",
          singerPromptWav: prompt.wav,
          singerPromptMeta: prompt.meta,
        },
      });
      const pids3 = await waitForPidMarker(markerFile);
      const stopRes = (await client.callTool({
        name: "stop_playback",
        arguments: {},
      })) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
      expect(stopRes.isError).not.toBe(true);
      expect(extractText(stopRes)).toContain("Stopped:");
      const playAfterStop = (await playPromise) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
      expect(playAfterStop.isError).toBe(true);
      expect(extractText(playAfterStop)).toMatch(/cancelled/i);
      await waitForPidDead(pids3.parentPid);
      await waitForPidDead(pids3.childPid);

      // 4) Progress notifications for a successful uncached fake SoulX render (6 default takes -> 9 steps)
      // Provide a minimal fake shared AudioContext so ScoreSinger.start() never touches real audio hardware.
      const { setSharedAudioContext } = await import("./audio-shared.js");
      setSharedAudioContext({
        sampleRate: 48000,
        destination: {},
        createBuffer: (_ch: number, len: number) => ({
          getChannelData: () => new Float32Array(len),
        }),
        createBufferSource: () => ({
          buffer: null,
          connect() {},
          start() {},
          stop() {},
          disconnect() {},
        }),
        createGain: () => ({
          gain: { value: 1 },
          connect() {},
          disconnect() {},
        }),
      });
      writeFakeSoulxScripts(scriptsDir);
      const soulxProgress: Array<{ progress: number; total?: number; message?: string }> = [];
      const okPlay = (await client.callTool(
        {
          name: "play_song",
          arguments: {
            id: "america-the-beautiful",
            startMeasure: 2,
            endMeasure: 4,
            lyrics: "O beau-ti-ful",
            singerBackend: "soulx",
            singerPromptWav: prompt.wav,
            singerPromptMeta: prompt.meta,
          },
        },
        undefined,
        { onprogress: (p) => soulxProgress.push(p) },
      )) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
      expect(okPlay.isError, extractText(okPlay)).not.toBe(true);
      expect(soulxProgress.map((p) => [p.progress, p.total])).toEqual([
        [1, 9],
        [2, 9],
        [3, 9],
        [4, 9],
        [5, 9],
        [6, 9],
        [7, 9],
        [8, 9],
        [9, 9],
      ]);
      await client.callTool({ name: "stop_playback", arguments: {} });
      setSharedAudioContext(null);
    } finally {
      await close();
    }
  });

  it("kills fake SoulX child process tree on server shutdown (in-process, signal handlers, and stdio close)", async () => {
    const prompt = writePromptPair(tmpDir);
    const scriptsDir = join(tmpDir, "scripts");
    const markerFile = join(tmpDir, "shutdown-pids.json");
    writeFakeSoulxScripts(scriptsDir, { sleepOn: "export", pidMarkerFile: markerFile });

    process.env.SOULX_PYTHON = process.execPath;
    process.env.SOULX_SCRIPTS_DIR = scriptsDir;
    process.env.SOULX_ROOT = tmpDir;

    // 1) In-process shutdownMcpServer() + attachShutdownHandlers() signal/close wiring
    const { client, mod, close } = await connectInMemory();
    try {
      const fakeStdin = new EventEmitter();
      const fakeProc = new EventEmitter();
      const exitCodes: number[] = [];
      const fakeTransport: { onclose?: () => void } = {};
      mod.attachShutdownHandlers(fakeTransport, {
        stdin: fakeStdin as never,
        proc: fakeProc as never,
        onExit: (code) => exitCodes.push(code),
      });

      const playPromise = client.callTool({
        name: "play_song",
        arguments: {
          id: "america-the-beautiful",
          startMeasure: 2,
          endMeasure: 4,
          lyrics: "O beau-ti-ful",
          singerBackend: "soulx",
          singerPromptWav: prompt.wav,
          singerPromptMeta: prompt.meta,
        },
      });
      const pids = await waitForPidMarker(markerFile);
      expect(isPidAlive(pids.parentPid)).toBe(true);
      expect(isPidAlive(pids.childPid)).toBe(true);

      // Simulate forwarded SIGTERM reaching the server process (POSIX convention: 128 + 15 = 143).
      fakeProc.emit("SIGTERM");
      const res = (await playPromise) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
      expect(res.isError).toBe(true);
      expect(extractText(res)).toMatch(/cancelled/i);
      await waitForPidDead(pids.parentPid);
      await waitForPidDead(pids.childPid);
      const exitWait = Date.now() + 3000;
      while (exitCodes.length === 0 && Date.now() < exitWait) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(exitCodes).toEqual([143]);
    } finally {
      await close();
    }

    // 2) Real child process stdio close (and POSIX SIGTERM / SIGKILL) killing a live fake SoulX render
    const spawnCase = async (mode: "stdin-close" | "sigterm" | "sigkill") => {
      const subMarker = join(tmpDir, `stdio-${mode}.json`);
      writeFakeSoulxScripts(scriptsDir, { sleepOn: "export", pidMarkerFile: subMarker });
      const harnessCode = `
        import { prepareMcpServer, attachShutdownHandlers } from "./src/mcp-server.js";
        import { renderSoulxLead } from "./src/vocal/soulx-singer.js";
        import { SCORE_CLOCK_SCHEMA } from "./src/vocal/score-clock.js";
        import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
        const s = await prepareMcpServer();
        const transport = new StdioServerTransport(process.stdin, process.stdout);
        attachShutdownHandlers(transport);
        await s.connect(transport);
        const clock = {
          schema: SCORE_CLOCK_SCHEMA, song_id: "stdio-test", bpm: 75, time_signature: "3/4",
          sample_rate: 48000, total_seconds: 1, total_samples: 48000, last_event_end_sec: 1,
          clock: { source: "session-nominal", bed_measures: [1, 1], measure_starts_sec: { "1": 0 }, measure_durations_sec: { "1": 1 } },
          midi: { file: "t.mid", ppq: 384, ticks_per_measure: 1152, melody_track: "M", sec_per_tick: 0.002 },
          events: [{ id: "v0", lyric: "O", word: "O", syllable: 0, syllables: 1, midi: 69, t_sec: 0.1, t_samples: 4800, dur_sec: 0.5, anchor: "t", midi_tick: 48, t_midi_sec: 0.1, engine_note: null }],
        };
        void renderSoulxLead(clock, {
          soulxRoot: process.env.SOULX_ROOT,
          pythonExecutable: process.execPath,
          scriptsDir: process.env.SOULX_SCRIPTS_DIR,
          promptWav: ${JSON.stringify(prompt.wav)},
          promptMeta: ${JSON.stringify(prompt.meta)},
          takes: 1,
        }).catch(() => {});
      `;
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", harnessCode], {
        cwd: REPO_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          AI_JAM_HOME: join(tmpDir, ".ai-jam-sessions"),
          SOULX_SCRIPTS_DIR: scriptsDir,
          SOULX_ROOT: tmpDir,
        },
      });
      try {
        const pids = await waitForPidMarker(subMarker);
        expect(isPidAlive(pids.parentPid)).toBe(true);
        expect(isPidAlive(pids.childPid)).toBe(true);
        if (mode === "stdin-close") child.stdin.end();
        else if (mode === "sigterm") child.kill("SIGTERM");
        else child.kill("SIGKILL");
        await new Promise<void>((resolveExit) => {
          if (child.exitCode !== null) resolveExit();
          else child.once("exit", () => resolveExit());
        });
        await waitForPidDead(pids.parentPid);
        await waitForPidDead(pids.childPid);
      } finally {
        if (child.exitCode === null) child.kill("SIGKILL");
      }
    };

    await spawnCase("stdin-close");
    if (process.platform !== "win32") {
      await spawnCase("sigterm");
      await spawnCase("sigkill");
    }
  });

  it("enforces shutdown hard-exit timer on stalled teardown and exits at once on a second signal", async () => {
    const { client, mod, close } = await connectInMemory();
    try {
      expect(mod.SHUTDOWN_HARD_EXIT_MS).toBe(5_000);
      expect(mod.signalExitCode("SIGTERM")).toBe(143);
      expect(mod.signalExitCode("SIGINT")).toBe(130);
      expect(mod.signalExitCode("SIGHUP")).toBe(129);

      // 1) Stalled stopActive() still exits when the hard-exit timer fires.
      await client.callTool({
        name: "play_song",
        arguments: { id: "america-the-beautiful", startMeasure: 1, endMeasure: 1, engine: "piano" },
      });
      audioDouble.hangDisconnect = true;
      const fakeStdin = new EventEmitter();
      const fakeProc = new EventEmitter();
      const exitCodes1: number[] = [];
      mod.attachShutdownHandlers(
        {},
        {
          stdin: fakeStdin as never,
          proc: fakeProc as never,
          onExit: (c) => exitCodes1.push(c),
          hardExitMs: 120,
        },
      );
      fakeProc.emit("SIGTERM");
      const deadline1 = Date.now() + 1500;
      while (exitCodes1.length === 0 && Date.now() < deadline1) {
        await new Promise((r) => setTimeout(r, 15));
      }
      expect(exitCodes1).toEqual([143]);
    } finally {
      audioDouble.releaseDisconnects();
      await close();
    }

    // 2) Second SIGTERM exits immediately without waiting for the 5 s hard-exit timer.
    const second = await connectInMemory();
    try {
      await second.client.callTool({
        name: "play_song",
        arguments: { id: "america-the-beautiful", startMeasure: 1, endMeasure: 1, engine: "piano" },
      });
      audioDouble.hangDisconnect = true;
      const fakeStdin2 = new EventEmitter();
      const fakeProc2 = new EventEmitter();
      const exitCodes2: number[] = [];
      second.mod.attachShutdownHandlers(
        {},
        {
          stdin: fakeStdin2 as never,
          proc: fakeProc2 as never,
          onExit: (c) => exitCodes2.push(c),
          hardExitMs: 5_000,
        },
      );
      fakeProc2.emit("SIGTERM");
      await new Promise((r) => setTimeout(r, 30));
      expect(exitCodes2).toEqual([]);
      fakeProc2.emit("SIGTERM");
      expect(exitCodes2).toEqual([143]);
    } finally {
      audioDouble.releaseDisconnects();
      await second.close();
    }

    // 3) Transport onclose, request/cancel tracking, send drain, and outputStream flush.
    const third = await connectInMemory();
    try {
      const exitCodes3: number[] = [];
      let flushed = false;
      const seenMessages: unknown[] = [];
      const fakeTransport3 = {
        onmessage: (m: unknown) => seenMessages.push(m),
        send: async (_m: unknown) => {},
        onclose: undefined as (() => void) | undefined,
      };
      const fakeOut = {
        writableLength: 4,
        destroyed: false,
        write: (_chunk: string, cb: () => void) => {
          flushed = true;
          cb();
          return true;
        },
      };
      const fakeStdin3 = new EventEmitter();
      const fakeProc3 = new EventEmitter();
      third.mod.attachShutdownHandlers(fakeTransport3, {
        stdin: fakeStdin3 as never,
        proc: fakeProc3 as never,
        outputStream: fakeOut as never,
        onExit: (c) => exitCodes3.push(c),
      });
      fakeTransport3.onmessage({ jsonrpc: "2.0", id: 10, method: "tools/call" });
      fakeTransport3.onmessage({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 10 } });
      await fakeTransport3.send({ jsonrpc: "2.0", id: 11, result: {} });
      expect(seenMessages).toHaveLength(2);
      fakeTransport3.onclose?.();
      const deadline3 = Date.now() + 1500;
      while (exitCodes3.length === 0 && Date.now() < deadline3) {
        await new Promise((r) => setTimeout(r, 15));
      }
      expect(flushed).toBe(true);
      expect(exitCodes3).toEqual([0]);
    } finally {
      await third.close();
    }
  });

  it("drains in-flight piped stdin requests before exiting on stdin end", async () => {
    // Fake local Ollama server takes 150 ms to answer /api/chat — longer than
    // the 25 ms shutdown flush window, so closing on stdin EOF without draining
    // drops the response.
    const ollama = await startFakeOllama((_idx, _body, respond) => {
      setTimeout(() => respond('K:Amin\n"Fmaj7"A2 |'), 150);
    });
    const child = spawn(
      process.execPath,
      ["--import", "tsx", join(REPO_ROOT, "src", "mcp-server.ts")],
      {
        cwd: REPO_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          AI_JAM_HOME: join(tmpDir, ".ai-jam-sessions"),
          OLLAMA_HOST: ollama.url,
        },
      },
    );
    try {
      let stdout = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });

      const payload = [
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "piped-test", version: "1.0.0" },
          },
        }),
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "auto_reharmonize",
            arguments: { songId: "america-the-beautiful", measures: "1-4", maxSamples: 1 },
          },
        }),
      ].join("\n") + "\n";

      child.stdin.end(payload);

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Timed out waiting for piped server exit; stdout=${stdout}`)),
          10_000,
        );
        child.once("exit", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      });

      expect(exitCode).toBe(0);
      const responses = stdout
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { id?: number; result?: unknown });
      const initResp = responses.find((r) => r.id === 1);
      const toolResp = responses.find((r) => r.id === 2);
      expect(initResp?.result).toBeTruthy();
      expect(toolResp?.result).toBeTruthy();
      expect(JSON.stringify(toolResp?.result)).toContain("America the Beautiful");
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });

  it("enforces file size and duration caps across all six audio inspection tools", async () => {
    const sampleRate = 22050;
    // 1000-byte at-limit WAV: 44-byte header + 478 frames * 2 bytes = 1000 bytes
    const atLimitBytes = 1000;
    const atLimitPath = join(tmpDir, "at-limit.wav");
    const overLimitPath = join(tmpDir, "over-limit.wav");
    const refPath = join(tmpDir, "ref.wav");
    writeWav16(atLimitPath, sampleRate, 478, 440);
    writeWav16(refPath, sampleRate, 478, 220);
    writeWav16(overLimitPath, sampleRate, 479, 440); // 1002 bytes > 1000

    process.env.AJS_AUDIO_MAX_FILE_BYTES = String(atLimitBytes);
    process.env.AJS_AUDIO_MAX_DURATION_SEC = "60";

    const { client, close } = await connectInMemory();
    try {
      const overCases: Array<{ name: string; args: Record<string, unknown> }> = [
        { name: "analyze_audio", args: { path: overLimitPath } },
        { name: "transcribe_audio", args: { path: overLimitPath } },
        { name: "score_audio_take", args: { path: overLimitPath, song_id: "america-the-beautiful" } },
        { name: "view_spectrogram", args: { path: overLimitPath } },
        { name: "check_loop_seam", args: { path: overLimitPath } },
        { name: "compare_balance", args: { path: overLimitPath, reference_path: refPath } },
        { name: "compare_balance", args: { path: refPath, reference_path: overLimitPath } },
      ];

      for (const tc of overCases) {
        const res = (await client.callTool({ name: tc.name, arguments: tc.args })) as {
          isError?: boolean;
          content: Array<{ type: string; text?: string }>;
        };
        expect(res.isError, `${tc.name} should fail on over-limit file`).toBe(true);
        const text = extractText(res);
        expect(text).toContain("1002 bytes");
        expect(text).toContain("1000-byte limit");
      }

      // Exact at-limit file must be accepted by loadAudioFile across the tools.
      const okAtLimit = (await client.callTool({
        name: "compare_balance",
        arguments: { path: atLimitPath, reference_path: refPath },
      })) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
      expect(okAtLimit.isError).not.toBe(true);

      // Without an explicit byte override, 601 s 24-bit 48kHz stereo is refused by duration via MCP tool.
      delete process.env.AJS_AUDIO_MAX_FILE_BYTES;
      delete process.env.AJS_AUDIO_MAX_DURATION_SEC;
      const sparse601Path = join(tmpDir, "sparse-24bit-601s.wav");
      const data601 = 48_000 * 2 * 3 * 601;
      const h = Buffer.alloc(44);
      h.write("RIFF", 0);
      h.writeUInt32LE(Math.min(0xffffffff, 36 + data601), 4);
      h.write("WAVE", 8);
      h.write("fmt ", 12);
      h.writeUInt32LE(16, 16);
      h.writeUInt16LE(1, 20);
      h.writeUInt16LE(2, 22);
      h.writeUInt32LE(48_000, 24);
      h.writeUInt32LE(48_000 * 6, 28);
      h.writeUInt16LE(6, 32);
      h.writeUInt16LE(24, 34);
      h.write("data", 36);
      h.writeUInt32LE(data601, 40);
      writeFileSync(sparse601Path, h);
      if (process.platform === "win32") {
        spawnSync("fsutil", ["sparse", "setflag", sparse601Path], { stdio: "ignore", windowsHide: true });
      }
      truncateSync(sparse601Path, 44 + data601);
      const sparseRes = (await client.callTool({
        name: "analyze_audio",
        arguments: { path: sparse601Path },
      })) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
      expect(sparseRes.isError).toBe(true);
      expect(extractText(sparseRes)).toContain("601.00 s");
      expect(extractText(sparseRes)).toContain("600 s duration limit");
    } finally {
      await close();
    }
  });
});
