// ─── Rollout environment: three hooks (dispatch L3) ──────────────────────────
//
// Mirrors verifiers MultiTurnEnv: setupState, envResponse, isDone.
// Reward is L4 (binary verdict + format gate + soft over-budget turn penalty).
// The tool surface is injected, never reimplemented here.

import type { SftMessage } from "./format-sft.js";

export const MAX_TURNS = 5;
export const MAX_PARALLEL = 2;

/** The nine tools the four-draw held-out traces already exercise. play_song is not among them. */
export const ROLLOUT_TOOLS = [
  "score_audio_take",
  "transcribe_audio",
  "song_info",
  "list_measures",
  "verify_harmony",
  "detect_chord",
  "ensemble_now",
  "list_songs",
  "transpose_song",
] as const;

export type RolloutTool = (typeof ROLLOUT_TOOLS)[number];

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface RewardBreakdown {
  format_ok: boolean;
  verdict: string;
  gold: string;
  correct: boolean;
  format: number;
  outcome: number;
  turn_penalty: number;
  tool_turns: number;
  reward: number;
}

export interface ExperimentEnv<TCase, TState> {
  task: { verdicts: readonly string[]; maxTurns?: number };
  maxTurns: number;
  setupState(c: TCase): Promise<TState>;
  envResponse(
    state: TState,
    calls: ToolCall[],
  ): Promise<{ turns: SftMessage[]; state: TState }>;
  isDone(state: TState, messages: SftMessage[]): boolean;
  reward(c: TCase, transcript: SftMessage[]): RewardBreakdown;
}

const norm = (s: string) =>
  s.trim().replace(/^["']|["']$/g, "").trim()
    .replace(/\s+/g, " ").replace(/\.$/, "").toLowerCase();

/** Label after the final colon, else the whole first non-empty line. Matches score_v1. */
export function extractVerdict(text: string): string {
  const line = String(text ?? "").trim().split(/\n/).find((l) => l.trim()) ?? "";
  if (line.includes(":")) {
    const tail = line.split(":").pop()!.trim();
    if (tail) return tail;
  }
  return line;
}

export function countToolTurns(messages: readonly SftMessage[]): number {
  return messages.filter((m) => m.role === "assistant" && (m.tool_calls?.length ?? 0) > 0).length;
}

export function lastAssistant(messages: readonly SftMessage[]): SftMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "assistant") return messages[i];
  }
  return undefined;
}

/**
 * L4: reward = format_ok ? (verdict === gold ? 1 : 0) : 0,
 * plus a soft turn-count penalty that only ramps past maxTurns.
 * No length bonus. No tool-correctness blend.
 */
export function scoreReward(opts: {
  gold: string;
  transcript: readonly SftMessage[];
  verdicts: readonly string[];
  maxTurns: number;
}): RewardBreakdown {
  const tool_turns = countToolTurns(opts.transcript);
  const last = lastAssistant(opts.transcript);
  const hasFinal = !!last && !(last.tool_calls && last.tool_calls.length > 0);
  const verdict = hasFinal ? extractVerdict(last!.content) : "";
  const allowed = new Set(opts.verdicts.map((v) => norm(v)));
  const format_ok = hasFinal && verdict.length > 0 && allowed.has(norm(verdict));
  const correct = format_ok && norm(verdict) === norm(opts.gold);
  const format = format_ok ? 1 : 0;
  const outcome = format_ok && correct ? 1 : 0;
  const extra = Math.max(0, tool_turns - opts.maxTurns);
  const turn_penalty = extra === 0 ? 0 : -Math.min(0.3, 0.05 * extra);
  return {
    format_ok,
    verdict,
    gold: opts.gold,
    correct,
    format,
    outcome,
    turn_penalty,
    tool_turns,
    reward: outcome + turn_penalty,
  };
}

export async function runEpisode<TCase, TState>(
  env: ExperimentEnv<TCase, TState>,
  c: TCase,
  policy: (messages: SftMessage[]) => Promise<SftMessage>,
  opening: SftMessage[],
): Promise<{ messages: SftMessage[]; reward: RewardBreakdown; state: TState }> {
  // Annotated, not inferred. `await` on an unconstrained TState infers
  // Awaited<TState>, which TS cannot prove equals TState (TState could itself
  // be a promise), so `state = out.state` on line 129 failed to assign.
  let state: TState = await env.setupState(c);
  const messages = [...opening];
  while (!env.isDone(state, messages)) {
    const action = await policy(messages);
    messages.push(action);
    if (action.tool_calls && action.tool_calls.length > 0) {
      const out = await env.envResponse(state, action.tool_calls);
      state = out.state;
      messages.push(...out.turns);
    }
  }
  return { messages, reward: env.reward(c, messages), state };
}
