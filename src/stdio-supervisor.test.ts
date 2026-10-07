// Stdio supervisor. spawn and createWriteStream are mocked; nothing is re-exec'd.
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
type Sig = (typeof SIGNALS)[number];

const supervisor = vi.hoisted(() => ({
  spawnCalls: [] as Array<{
    cmd: string;
    args: readonly string[];
    opts: { env: NodeJS.ProcessEnv; stdio: readonly number[] };
  }>,
  children: [] as Array<EventEmitter & { kill: (signal?: NodeJS.Signals) => boolean }>,
  killSignals: [] as Array<NodeJS.Signals | undefined>,
  killThrows: false,
  fsThrows: false,
  fsCalls: [] as Array<{ path: unknown; opts: unknown }>,
  stream: { kind: "rpc-fd-3" as const },
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    createWriteStream(path: unknown, opts?: unknown) {
      supervisor.fsCalls.push({ path, opts });
      if (supervisor.fsThrows) throw new Error("EBADF");
      return supervisor.stream as unknown as ReturnType<typeof actual.createWriteStream>;
    },
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { EventEmitter: Emitter } = await import("node:events");
  return {
    ...actual,
    spawn(cmd: string, args: readonly string[], opts: { env: NodeJS.ProcessEnv; stdio: readonly number[] }) {
      const child = new Emitter() as EventEmitter & { kill: (signal?: NodeJS.Signals) => boolean };
      child.kill = (signal?: NodeJS.Signals) => {
        supervisor.killSignals.push(signal);
        if (supervisor.killThrows) {
          supervisor.killThrows = false;
          throw new Error("child already gone");
        }
        return true;
      };
      supervisor.spawnCalls.push({ cmd, args, opts });
      supervisor.children.push(child);
      return child as unknown as ReturnType<typeof actual.spawn>;
    },
  };
});

import {
  isInnerStdioProcess,
  openRpcOutputStream,
  runStdioSupervisor,
  shouldSuperviseStdio,
} from "./stdio-supervisor.js";

const originalInner = process.env.AJS_MCP_INNER;
const originalExecArgv = process.execArgv;
const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
const originalListeners = new Map<Sig, Set<(...args: unknown[]) => void>>();
for (const sig of SIGNALS) {
  originalListeners.set(sig, new Set(process.listeners(sig)));
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
    enumerable: true,
    writable: false,
  });
}

function removeSupervisorListeners(): void {
  for (const sig of SIGNALS) {
    const keep = originalListeners.get(sig) ?? new Set();
    for (const listener of process.listeners(sig)) {
      if (!keep.has(listener)) process.removeListener(sig, listener);
    }
  }
}

function addedListeners(sig: Sig): Array<(...args: unknown[]) => void> {
  const keep = originalListeners.get(sig) ?? new Set();
  return process.listeners(sig).filter((listener) => !keep.has(listener));
}

describe("stdio supervisor", () => {
  const exits: Array<number | string | null | undefined> = [];
  const kills: Array<{ pid: number; signal: NodeJS.Signals | number | undefined }> = [];
  const stderr: string[] = [];
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let killSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    supervisor.spawnCalls.length = 0;
    supervisor.children.length = 0;
    supervisor.killSignals.length = 0;
    supervisor.killThrows = false;
    supervisor.fsThrows = false;
    supervisor.fsCalls.length = 0;
    exits.length = 0;
    kills.length = 0;
    stderr.length = 0;
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number | string | null) => {
      exits.push(code);
      return undefined as never;
    }) as typeof process.exit);
    killSpy = vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      kills.push({ pid, signal });
      return true;
    }) as typeof process.kill);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    removeSupervisorListeners();
    exitSpy.mockRestore();
    killSpy.mockRestore();
    stderrSpy.mockRestore();
    if (originalInner === undefined) delete process.env.AJS_MCP_INNER;
    else process.env.AJS_MCP_INNER = originalInner;
    process.execArgv = originalExecArgv;
    if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
  });

  it("is false on win32", () => {
    setPlatform("win32");
    delete process.env.AJS_MCP_INNER;
    expect(shouldSuperviseStdio()).toBe(false);
  });

  it("is true on a non-win32 host until this process is the inner child", () => {
    setPlatform("linux");
    delete process.env.AJS_MCP_INNER;
    expect(isInnerStdioProcess()).toBe(false);
    expect(shouldSuperviseStdio()).toBe(true);
    process.env.AJS_MCP_INNER = "1";
    expect(shouldSuperviseStdio()).toBe(false);
  });

  it("treats AJS_MCP_INNER=1 as the inner process, and anything else as not", () => {
    process.env.AJS_MCP_INNER = "1";
    expect(isInnerStdioProcess()).toBe(true);
    delete process.env.AJS_MCP_INNER;
    expect(isInnerStdioProcess()).toBe(false);
  });

  it("returns stdout when this process is not the inner child", () => {
    delete process.env.AJS_MCP_INNER;
    expect(openRpcOutputStream()).toBe(process.stdout);
    expect(supervisor.fsCalls).toEqual([]);
  });

  it("opens fd 3 when this process is the inner child", () => {
    process.env.AJS_MCP_INNER = "1";
    expect(openRpcOutputStream()).toBe(supervisor.stream);
    expect(supervisor.fsCalls).toEqual([
      { path: null, opts: { fd: 3, autoClose: false } },
    ]);
  });

  it("falls back to stdout when fd 3 cannot be opened", () => {
    process.env.AJS_MCP_INNER = "1";
    supervisor.fsThrows = true;
    expect(openRpcOutputStream()).toBe(process.stdout);
    expect(stderr).toEqual([
      "ai-jam-sessions: fd 3 unavailable, JSON-RPC falling back to stdout (EBADF)\n",
    ]);
  });

  it("spawns the inner server without inspector flags, with AJS_MCP_INNER and the split stdio", () => {
    process.execArgv = ["--inspect=127.0.0.1:9229", "--no-warnings", "--inspect-brk"];
    process.env.AJS_MCP_INNER = "0";
    runStdioSupervisor();

    expect(supervisor.spawnCalls).toHaveLength(1);
    const call = supervisor.spawnCalls[0];
    expect(call?.cmd).toBe(process.execPath);
    expect(call?.args).toEqual(["--no-warnings", ...process.argv.slice(1)]);
    expect(call?.opts.stdio).toEqual([0, 2, 2, 1]);
    expect(call?.opts.env.AJS_MCP_INNER).toBe("1");
    expect(call?.opts.env).toEqual({ ...process.env, AJS_MCP_INNER: "1" });
    for (const sig of SIGNALS) {
      expect(addedListeners(sig)).toHaveLength(1);
    }
  });

  it("exits 1 when the child emits error, and a later exit does nothing", () => {
    runStdioSupervisor();
    const child = supervisor.children[0];
    expect(child).toBeDefined();
    child?.emit("error", new Error("spawn ENOENT"));
    child?.emit("exit", 7, null);

    expect(exits).toEqual([1]);
    expect(kills).toEqual([]);
    expect(stderr).toEqual([
      "ai-jam-sessions: failed to launch MCP server process: spawn ENOENT\n",
    ]);
    expect(stderr.join("")).toContain("failed to launch MCP server process");
  });

  it("mirrors a numeric child exit code", () => {
    runStdioSupervisor();
    supervisor.children[0]?.emit("exit", 7, null);
    expect(exits).toEqual([7]);
    expect(kills).toEqual([]);
  });

  it("re-raises the child signal instead of calling process.exit", () => {
    runStdioSupervisor();
    supervisor.children[0]?.emit("exit", null, "SIGTERM");
    expect(kills).toEqual([{ pid: process.pid, signal: "SIGTERM" }]);
    expect(exits).toEqual([]);
    expect(killSpy).toHaveBeenCalledWith(process.pid, "SIGTERM");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("swallows a child.kill throw from the forwarded signal handler", () => {
    runStdioSupervisor();
    const handlers = addedListeners("SIGINT");
    expect(handlers).toHaveLength(1);
    supervisor.killThrows = true;

    expect(() => handlers[0]?.()).not.toThrow();
    expect(supervisor.killSignals).toEqual(["SIGINT"]);
    expect(exits).toEqual([]);
  });
});
