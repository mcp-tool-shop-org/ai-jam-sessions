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
import { searchTask, splitOf, userPrompt, type SearchCase } from "./task.js";

export const SEARCH_SYSTEM =
  `${DEFAULT_SYSTEM_TEXT} Use the tools to inspect the library. Your final turn is the answer alone, with no explanation.`;

export interface SearchState {
  case: SearchCase;
  toolTurns: number;
}

export function openingMessages(c: SearchCase): SftMessage[] {
  return [
    { role: "system", content: SEARCH_SYSTEM },
    { role: "user", content: userPrompt(c) },
  ];
}

export class SearchEnv implements ExperimentEnv<SearchCase, SearchState> {
  readonly task = searchTask;
  readonly maxTurns = MAX_TURNS;

  constructor(private readonly executor: McpStdioExecutor) {}

  async setupState(c: SearchCase): Promise<SearchState> {
    return { case: c, toolTurns: 0 };
  }

  async envResponse(
    state: SearchState,
    calls: ToolCall[],
  ): Promise<{ turns: SftMessage[]; state: SearchState }> {
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
      const obs = await this.executor.call(call.name, call.arguments);
      turns.push({ role: "tool", name: call.name, content: obs.text });
    }
    return { turns, state: { ...state, toolTurns: state.toolTurns + 1 } };
  }

  isDone(state: SearchState, messages: SftMessage[]): boolean {
    if (state.toolTurns >= this.maxTurns) return true;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role !== "assistant") continue;
      return !m.tool_calls || m.tool_calls.length === 0;
    }
    return false;
  }

  reward(c: SearchCase, transcript: SftMessage[]): RewardBreakdown {
    return scoreReward({
      gold: String(c.measure),
      transcript,
      verdicts: searchTask.verdicts,
      maxTurns: this.maxTurns,
    });
  }
}

export { splitOf, userPrompt };
