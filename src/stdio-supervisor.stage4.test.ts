import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const childMock = vi.hoisted(() => ({ spawn: vi.fn() }));
const fsMock = vi.hoisted(() => ({ createWriteStream: vi.fn() }));

vi.mock("node:child_process", () => ({ spawn: childMock.spawn }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, createWriteStream: fsMock.createWriteStream };
});

import {
  isInnerStdioProcess,
  openRpcOutputStream,
  runStdioSupervisor,
  shouldSuperviseStdio,
} from "./stdio-supervisor.js";

const INNER = "AJS_MCP_INNER";

function fakeChild() {
  const emitter = new EventEmitter();
  const kill = vi.fn();
  return Object.assign(emitter, { kill });
}

describe("stdio supervisor", () => {
  const previousInner = process.env[INNER];
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`exit:${code}`);
  }) as typeof process.exit);
  const kill = vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
    if (pid === process.pid) return true;
    throw new Error(`unexpected kill ${pid} ${String(signal)}`);
  }) as typeof process.kill);

  afterEach(() => {
    if (previousInner === undefined) delete process.env[INNER];
    else process.env[INNER] = previousInner;
    stderr.mockClear();
    exit.mockClear();
    kill.mockClear();
    childMock.spawn.mockReset();
    fsMock.createWriteStream.mockReset();
    for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as NodeJS.Signals[]) {
      process.removeAllListeners(sig);
    }
  });

  it("is the inner process only when AJS_MCP_INNER is 1, and supervises only a POSIX outer process", () => {
    delete process.env[INNER];
    expect(isInnerStdioProcess()).toBe(false);
    expect(shouldSuperviseStdio()).toBe(process.platform !== "win32");
    process.env[INNER] = "1";
    expect(isInnerStdioProcess()).toBe(true);
    expect(shouldSuperviseStdio()).toBe(false);
    process.env[INNER] = "0";
    expect(isInnerStdioProcess()).toBe(false);
  });

  it("keeps JSON-RPC on stdout when this process is not the inner server", () => {
    delete process.env[INNER];
    expect(openRpcOutputStream()).toBe(process.stdout);
    expect(fsMock.createWriteStream).not.toHaveBeenCalled();
  });

  it("writes JSON-RPC to fd 3 inside the inner server", () => {
    process.env[INNER] = "1";
    const stream = { fd: 3 };
    fsMock.createWriteStream.mockReturnValue(stream);
    expect(openRpcOutputStream()).toBe(stream);
    expect(fsMock.createWriteStream).toHaveBeenCalledWith(null, { fd: 3, autoClose: false });
  });

  it("falls back to stdout and names the fd 3 failure", () => {
    process.env[INNER] = "1";
    fsMock.createWriteStream.mockImplementation(() => {
      throw new Error("bad fd");
    });
    expect(openRpcOutputStream()).toBe(process.stdout);
    expect(stderr).toHaveBeenCalledWith(
      "ai-jam-sessions: fd 3 unavailable, JSON-RPC falling back to stdout (bad fd)\n",
    );
  });

  it("names a non-Error fd 3 failure by its string", () => {
    process.env[INNER] = "1";
    fsMock.createWriteStream.mockImplementation(() => {
      throw "closed";
    });
    expect(openRpcOutputStream()).toBe(process.stdout);
    expect(stderr).toHaveBeenCalledWith(
      "ai-jam-sessions: fd 3 unavailable, JSON-RPC falling back to stdout (closed)\n",
    );
  });

  it("re-execs the inner server with AJS_MCP_INNER and drops inspector flags", () => {
    const child = fakeChild();
    childMock.spawn.mockReturnValue(child);
    const originalArgv = process.execArgv;
    Object.defineProperty(process, "execArgv", {
      value: ["--inspect=9229", "--import", "tsx"],
      configurable: true,
    });
    try {
      runStdioSupervisor();
    } finally {
      Object.defineProperty(process, "execArgv", { value: originalArgv, configurable: true });
    }
    expect(childMock.spawn).toHaveBeenCalledWith(
      process.execPath,
      ["--import", "tsx", ...process.argv.slice(1)],
      expect.objectContaining({
        stdio: [0, 2, 2, 1],
        env: expect.objectContaining({ [INNER]: "1" }),
      }),
    );
  });

  it("exits 1 when the inner server fails to launch, and ignores a later event", () => {
    const child = fakeChild();
    childMock.spawn.mockReturnValue(child);
    runStdioSupervisor();
    expect(() => child.emit("error", new Error("spawn failed"))).toThrow("exit:1");
    expect(stderr).toHaveBeenCalledWith(
      "ai-jam-sessions: failed to launch MCP server process: spawn failed\n",
    );
    child.emit("exit", 4, null);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("mirrors the inner exit code", () => {
    const child = fakeChild();
    childMock.spawn.mockReturnValue(child);
    runStdioSupervisor();
    expect(() => child.emit("exit", 7, null)).toThrow("exit:7");
    expect(exit).toHaveBeenCalledWith(7);
  });

  it("exits 0 when the inner exit code is null and there is no signal", () => {
    const child = fakeChild();
    childMock.spawn.mockReturnValue(child);
    runStdioSupervisor();
    expect(() => child.emit("exit", null, null)).toThrow("exit:0");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("re-raises the inner signal instead of exiting with a code", () => {
    const child = fakeChild();
    childMock.spawn.mockReturnValue(child);
    runStdioSupervisor();
    child.emit("exit", null, "SIGTERM");
    expect(kill).toHaveBeenCalledWith(process.pid, "SIGTERM");
    expect(exit).not.toHaveBeenCalled();
  });

  it("swallows a signal forward when the child is already gone", () => {
    const child = fakeChild();
    child.kill.mockImplementation(() => {
      throw new Error("child already gone");
    });
    childMock.spawn.mockReturnValue(child);
    runStdioSupervisor();
    expect(() => process.emit("SIGINT")).not.toThrow();
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
  });
});
