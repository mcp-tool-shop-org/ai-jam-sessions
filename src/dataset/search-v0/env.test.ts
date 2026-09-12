import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { MAX_PARALLEL, runEpisode, SERVER_ENTRY, type SftMessage } from "../experiment/index.js";
import { McpStdioExecutor } from "../experiment/mcp-executor.js";
import { SearchEnv, openingMessages } from "./env.js";
import { plants } from "./task.js";

const haveServer = existsSync(SERVER_ENTRY);

describe.skipIf(!haveServer)("SearchEnv against the real MCP server", () => {
  const exec = new McpStdioExecutor();
  let env: SearchEnv;
  const solace = () => {
    const c = plants().find((x) => x.song_id === "solace" && x.chord === "Gaug" && x.after === 1);
    if (!c) throw new Error("solace Gaug from-1 plant missing");
    return c;
  };

  beforeAll(async () => {
    await exec.start();
    env = new SearchEnv(exec);
  }, 30_000);

  afterAll(async () => {
    await exec.close();
  });

  it("pays 1 when a scripted policy finds the plant via tools", async () => {
    const c = solace();
    let step = 0;
    const policy = async (): Promise<SftMessage> => {
      step++;
      if (step === 1) {
        return {
          role: "assistant",
          content: "listing",
          tool_calls: [
            { name: "list_songs", arguments: { query: "Solace" } },
            { name: "list_measures", arguments: { id: "solace", startMeasure: 6, endMeasure: 6 } },
          ],
        };
      }
      if (step === 2) {
        return {
          role: "assistant",
          content: "naming",
          tool_calls: [{ name: "detect_chord", arguments: { notes: c.midi } }],
        };
      }
      return { role: "assistant", content: String(c.measure) };
    };
    const { reward, messages } = await runEpisode(env, c, policy, openingMessages(c));
    expect(reward.correct).toBe(true);
    expect(reward.reward).toBe(1);
    expect(messages.some((m) => m.role === "tool" && m.name === "detect_chord")).toBe(true);
  });

  it("pays 0 for a guess that skips the tools", async () => {
    const c = solace();
    const { reward } = await runEpisode(
      env,
      c,
      async () => ({ role: "assistant", content: "1" }),
      openingMessages(c),
    );
    expect(reward.format_ok).toBe(true);
    expect(reward.correct).toBe(false);
    expect(reward.reward).toBe(0);
  });

  // bethena has 219 measures. A windowless call used to be refused; it is now
  // filled in to the first page. Either way the P1b failure — one observation,
  // one guess, no search — must stay impossible. The refusal cost a turn; the
  // default does not.
  it("pages a windowless list_measures instead of dumping the whole song", async () => {
    const c = solace();
    const state = await env.setupState(c);
    const { turns } = await env.envResponse(state, [
      { name: "list_measures", arguments: { id: "bethena" } },
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.content).toMatch(/Measures 1 to 4/);
    expect(turns[0]!.content).not.toMatch(/Measure 50/);
    expect(turns[0]!.content).not.toMatch(/requires startMeasure and endMeasure/);
  });

  it("executes a paged list_measures window against the real server", async () => {
    const c = solace();
    const state = await env.setupState(c);
    const { turns } = await env.envResponse(state, [
      { name: "list_measures", arguments: { id: "solace", startMeasure: 6, endMeasure: 6 } },
    ]);
    expect(turns[0]!.content).toMatch(/Measure 6/);
    expect(turns[0]!.content).not.toMatch(/Measure 7/);
  });

  it("drops calls past the parallel cap as observations", async () => {
    const c = solace();
    const state = await env.setupState(c);
    const { turns } = await env.envResponse(state, [
      { name: "list_songs", arguments: { query: "Solace" } },
      { name: "song_info", arguments: { id: "solace" } },
      { name: "list_measures", arguments: { id: "solace", startMeasure: 1, endMeasure: 1 } },
    ]);
    expect(turns).toHaveLength(3);
    expect(turns[2]!.content).toMatch(new RegExp(`cap is ${MAX_PARALLEL}`));
  });
});
