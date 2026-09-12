import { DEFAULT_SYSTEM_TEXT, type SftMessage } from "../experiment/format-sft.js";
import {
  MAX_PARALLEL,
  MAX_TURNS,
  scoreReward,
  type ExperimentEnv,
  type RewardBreakdown,
  type ToolCall,
} from "../experiment/env.js";
import type { McpStdioExecutor } from "../experiment/mcp-executor.js";
import { boundListMeasures } from "../search-v0/window.js";
import { synthTask, splitOf, userPrompt, type SynthCase } from "./task.js";

export const SYNTH_SYSTEM =
  `${DEFAULT_SYSTEM_TEXT} Use the tools to inspect the library. Your final turn is the answer alone, with no explanation.`;

export interface SynthState {
  case: SynthCase;
  toolTurns: number;
}

export function openingMessages(c: SynthCase): SftMessage[] {
  return [
    { role: "system", content: SYNTH_SYSTEM },
    { role: "user", content: userPrompt(c) },
  ];
}

/** Same page bound and parallel cap as P1c SearchEnv. */
export class SynthEnv implements ExperimentEnv<SynthCase, SynthState> {
  readonly task = synthTask;
  readonly maxTurns = MAX_TURNS;

  constructor(private readonly executor: McpStdioExecutor) {}

  async setupState(c: SynthCase): Promise<SynthState> {
    return { case: c, toolTurns: 0 };
  }

  async envResponse(
    state: SynthState,
    calls: ToolCall[],
  ): Promise<{ turns: SftMessage[]; state: SynthState }> {
    const turns: SftMessage[] = [];
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i]!;
      if (i >= MAX_PARALLEL) {
        turns.push({
          role: "tool",
          name: call.name,
          content: `parallel call cap is ${MAX_PARALLEL}; this call was not executed`,
        });
        continue;
      }
      if (call.name === "list_measures") {
        const bound = boundListMeasures(call.arguments);
        if (!bound.ok) {
          turns.push({ role: "tool", name: call.name, content: bound.reason });
          continue;
        }
        const obs = await this.executor.call(call.name, bound.arguments);
        turns.push({ role: "tool", name: call.name, content: obs.text });
        continue;
      }
      const obs = await this.executor.call(call.name, call.arguments);
      turns.push({ role: "tool", name: call.name, content: obs.text });
    }
    return { turns, state: { ...state, toolTurns: state.toolTurns + 1 } };
  }

  isDone(state: SynthState, messages: SftMessage[]): boolean {
    if (state.toolTurns >= this.maxTurns) return true;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role !== "assistant") continue;
      return !m.tool_calls || m.tool_calls.length === 0;
    }
    return false;
  }

  reward(c: SynthCase, transcript: SftMessage[]): RewardBreakdown {
    return scoreReward({
      gold: String(c.measure),
      transcript,
      verdicts: synthTask.verdicts,
      maxTurns: this.maxTurns,
    });
  }
}

export { splitOf, userPrompt };
