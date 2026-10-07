import { describe, expect, it } from "vitest";
import type { SftMessage } from "../experiment/format-sft.js";
import type { McpStdioExecutor } from "../experiment/mcp-executor.js";
import { openingMessages, SynthEnv } from "./env.js";
import type { SynthCase } from "./task.js";

const CASE: SynthCase = {
  song_id: "song-1",
  title: "Window Study",
  chord: "C3",
  measure: 4,
  midi: [48, 52, 55],
  after: 2,
  distance: 1,
  level: "D0",
  split: "train",
};

function fakeExecutor() {
  const seen: Array<{ name: string; args: Record<string, unknown> }> = [];
  const executor = {
    call: async (name: string, args: Record<string, unknown>) => {
      seen.push({ name, args });
      return { text: "observed-text", name, isError: false, executed: true };
    },
  } as unknown as McpStdioExecutor;
  return { executor, seen };
}

describe("openingMessages", () => {
  it("returns the synth system text and the exact user prompt", () => {
    expect(openingMessages(CASE)).toEqual([
      {
        role: "system",
        content:
          "You are operating AI Jam Sessions, a music education platform. " +
          "Use the tools to inspect the library. Your final turn is the answer alone, with no explanation.",
      },
      {
        role: "user",
        content:
          'In "Window Study", what is the first measure at or after measure 2 whose left hand is C3? Answer with a single integer.',
      },
    ]);
  });
});

describe("SynthEnv", () => {
  it("setupState starts at zero tool turns", async () => {
    const { executor } = fakeExecutor();
    const env = new SynthEnv(executor);
    await expect(env.setupState(CASE)).resolves.toEqual({ case: CASE, toolTurns: 0 });
  });

  it("refuses an oversized list_measures window without calling the executor", async () => {
    const { executor, seen } = fakeExecutor();
    const env = new SynthEnv(executor);
    const out = await env.envResponse({ case: CASE, toolTurns: 0 }, [
      { name: "list_measures", arguments: { id: "song-1", startMeasure: 1, endMeasure: 8 } },
    ]);
    expect(seen).toEqual([]);
    expect(out.turns).toEqual([
      {
        role: "tool",
        name: "list_measures",
        content: "list_measures window spans 8 measures; this environment caps a call at 4",
      },
    ]);
    expect(out.state.toolTurns).toBe(1);
  });

  it("runs a bounded list_measures and a raw tool, and drops the third call", async () => {
    const { executor, seen } = fakeExecutor();
    const env = new SynthEnv(executor);
    const out = await env.envResponse({ case: CASE, toolTurns: 0 }, [
      { name: "list_measures", arguments: { id: "song-1", startMeasure: 2, endMeasure: 4 } },
      { name: "song_info", arguments: { id: "song-1", extra: true } },
      { name: "list_songs", arguments: {} },
    ]);
    expect(seen).toEqual([
      { name: "list_measures", args: { id: "song-1", startMeasure: 2, endMeasure: 4 } },
      { name: "song_info", args: { id: "song-1", extra: true } },
    ]);
    expect(out.turns).toEqual([
      { role: "tool", name: "list_measures", content: "observed-text" },
      { role: "tool", name: "song_info", content: "observed-text" },
      {
        role: "tool",
        name: "list_songs",
        content: "parallel call cap is 2; this call was not executed",
      },
    ]);
    expect(out.state).toEqual({ case: CASE, toolTurns: 1 });
  });

  it("isDone follows the turn cap, then the last assistant message", () => {
    const { executor } = fakeExecutor();
    const env = new SynthEnv(executor);
    const withCalls: SftMessage[] = [
      {
        role: "assistant",
        content: "looking",
        tool_calls: [{ name: "song_info", arguments: { id: "song-1" } }],
      },
    ];
    expect(env.maxTurns).toBe(5);
    expect(env.isDone({ case: CASE, toolTurns: 5 }, withCalls)).toBe(true);
    expect(env.isDone({ case: CASE, toolTurns: 4 }, withCalls)).toBe(false);
    expect(
      env.isDone({ case: CASE, toolTurns: 4 }, [{ role: "assistant", content: "4" }]),
    ).toBe(true);
    expect(
      env.isDone({ case: CASE, toolTurns: 0 }, [
        { role: "system", content: "s" },
        { role: "user", content: "q" },
      ]),
    ).toBe(false);
    expect(
      env.isDone({ case: CASE, toolTurns: 1 }, [
        ...withCalls,
        { role: "tool", name: "song_info", content: "observed-text" },
        { role: "assistant", content: "4" },
      ]),
    ).toBe(true);
  });

  it("reward scores a final answer of the gold measure as 1", () => {
    const { executor } = fakeExecutor();
    const env = new SynthEnv(executor);
    const transcript: SftMessage[] = [
      {
        role: "assistant",
        content: "looking",
        tool_calls: [{ name: "list_measures", arguments: { id: "song-1" } }],
      },
      { role: "tool", name: "list_measures", content: "observed-text" },
      { role: "assistant", content: "4" },
    ];
    expect(env.reward(CASE, transcript)).toEqual({
      format_ok: true,
      verdict: "4",
      gold: "4",
      correct: true,
      format: 1,
      outcome: 1,
      turn_penalty: 0,
      tool_turns: 1,
      reward: 1,
    });
  });
});
