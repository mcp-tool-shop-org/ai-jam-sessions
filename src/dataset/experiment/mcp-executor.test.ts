import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { McpStdioExecutor, SERVER_ENTRY, processAlive } from "./mcp-executor.js";

const haveServer = existsSync(SERVER_ENTRY);

describe.skipIf(!haveServer)("McpStdioExecutor against dist/mcp-server.js", () => {
  const exec = new McpStdioExecutor();

  beforeAll(async () => {
    await exec.start();
  }, 30_000);

  afterAll(async () => {
    await exec.close();
  });

  it("ensemble_now does not require an audio device", async () => {
    const obs = await exec.call("ensemble_now", {});
    expect(obs.executed).toBe(true);
    expect(obs.isError).toBe(false);
    expect(obs.text.toLowerCase()).toMatch(/nothing is playing|no ensemble/);
  });

  it("never sends play_song to the server", async () => {
    const obs = await exec.call("play_song", { id: "solace" });
    expect(obs.executed).toBe(false);
    expect(obs.isError).toBe(true);
    expect(obs.text).toMatch(/excluded/);
  });

  it("returns a tool error as a truncated observation, not a throw", async () => {
    const obs = await exec.call("song_info", { id: "definitely-not-a-song" });
    expect(obs.executed).toBe(true);
    expect(obs.isError).toBe(true);
    expect(obs.text.includes("\n")).toBe(false);
  });

  it("detect_chord on a C major triad names C", async () => {
    const obs = await exec.call("detect_chord", { notes: [60, 64, 67] });
    expect(obs.isError).toBe(false);
    expect(obs.text).toMatch(/\bC\b/);
  });
});

describe.skipIf(!haveServer)("MCP worker teardown", () => {
  it("kills the child and asserts no leak", async () => {
    const exec = new McpStdioExecutor();
    await exec.start();
    const pid = exec.pid;
    expect(pid).toBeTruthy();
    expect(processAlive(pid!)).toBe(true);
    await exec.close();
    expect(exec.pid).toBeNull();
    expect(processAlive(pid!)).toBe(false);
  }, 30_000);
});
