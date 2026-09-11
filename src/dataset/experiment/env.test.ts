import { describe, it, expect } from "vitest";
import {
  MAX_TURNS,
  extractVerdict,
  scoreReward,
  type SftMessage,
} from "./index.js";

const V = ["1", "2", "3", "6", "8"] as const;

function turns(msgs: Array<Partial<SftMessage> & { role: SftMessage["role"]; content: string }>): SftMessage[] {
  return msgs.map((m) => ({ ...m }));
}

describe("extractVerdict", () => {
  it("takes the label after the last colon", () => {
    expect(extractVerdict("cents 7.8: 6")).toBe("6");
  });
});

describe("L4 reward", () => {
  it("pays 1 for a formatted correct verdict inside the budget", () => {
    const r = scoreReward({
      gold: "6",
      verdicts: V,
      maxTurns: MAX_TURNS,
      transcript: turns([
        { role: "user", content: "q" },
        { role: "assistant", content: "look", tool_calls: [{ name: "list_measures", arguments: {} }] },
        { role: "tool", content: "..." },
        { role: "assistant", content: "6" },
      ]),
    });
    expect(r.format_ok).toBe(true);
    expect(r.correct).toBe(true);
    expect(r.turn_penalty).toBe(0);
    expect(r.reward).toBe(1);
  });

  it("pays 0 when the format is missing, even if a tool saw the gold", () => {
    const r = scoreReward({
      gold: "6",
      verdicts: V,
      maxTurns: MAX_TURNS,
      transcript: turns([
        { role: "assistant", content: "", tool_calls: [{ name: "detect_chord", arguments: {} }] },
        { role: "tool", content: '{"chord":"Gaug","measure":6}' },
      ]),
    });
    expect(r.format_ok).toBe(false);
    expect(r.reward).toBe(0);
  });

  it("pays 0 for a formatted wrong verdict", () => {
    const r = scoreReward({
      gold: "6",
      verdicts: V,
      maxTurns: MAX_TURNS,
      transcript: turns([{ role: "assistant", content: "1" }]),
    });
    expect(r.format_ok).toBe(true);
    expect(r.correct).toBe(false);
    expect(r.reward).toBe(0);
  });

  it("applies a soft penalty only past maxTurns, never a length bonus", () => {
    const over: SftMessage[] = [];
    for (let i = 0; i < 7; i++) {
      over.push({ role: "assistant", content: "x", tool_calls: [{ name: "list_measures", arguments: {} }] });
      over.push({ role: "tool", content: "obs" });
    }
    over.push({ role: "assistant", content: "1" });
    const r = scoreReward({ gold: "6", verdicts: V, maxTurns: MAX_TURNS, transcript: over });
    expect(r.tool_turns).toBe(7);
    expect(r.turn_penalty).toBeCloseTo(-0.1, 10);
    expect(r.reward).toBeCloseTo(-0.1, 10);
    const short = scoreReward({
      gold: "6",
      verdicts: V,
      maxTurns: MAX_TURNS,
      transcript: turns([{ role: "assistant", content: "6" }]),
    });
    expect(short.reward).toBe(1);
  });
});
