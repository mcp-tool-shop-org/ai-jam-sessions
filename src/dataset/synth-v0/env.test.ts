import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { SERVER_ENTRY } from "../experiment/index.js";
import { McpStdioExecutor } from "../experiment/mcp-executor.js";
import { smokeSong } from "./generate.js";

const haveServer = existsSync(SERVER_ENTRY);

describe.skipIf(!haveServer)("synthetic song reaches the real list_measures", () => {
  const exec = new McpStdioExecutor();
  const song = smokeSong();

  beforeAll(async () => {
    await exec.start({ seedSongs: [song] });
  }, 30_000);

  afterAll(async () => {
    await exec.close();
  });

  it("returns the seeded song, not a library miss", async () => {
    const obs = await exec.call("list_measures", {
      id: song.id,
      startMeasure: 1,
      endMeasure: 4,
    });
    expect(obs.isError, obs.text).toBe(false);
    expect(obs.text).toMatch(/Measure 1/);
    expect(obs.text).toMatch(/C3/);
  });
});
