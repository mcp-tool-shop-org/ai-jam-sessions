import { describe, expect, it } from "vitest";
import type { ChordProposerBackend } from "../maker/chord-proposer.js";
import { OllamaBwsJudge } from "./ollama-bws-judge.js";

describe("OllamaBwsJudge", () => {
  it("probes at seed 7 and parses judge text, including a thrown callStructured", async () => {
    const seeds: number[] = [];
    let raw = '{"best":1,"worst":2}';
    let throwNext = true;
    const seen: Array<{ systemPrompt: string; userMessage: string; outputSchema: Record<string, unknown> }> = [];
    const backendFactory = (seed: number): ChordProposerBackend => {
      seeds.push(seed);
      return {
        async probe() {},
        async callStructured(args) {
          seen.push(args);
          if (throwNext) {
            throwNext = false;
            throw new Error("structured-failed");
          }
          return {};
        },
        lastRawText() {
          return raw;
        },
      };
    };

    const judge = new OllamaBwsJudge("judge-model", "granite", { backendFactory });
    expect(judge.model).toBe("judge-model");
    expect(judge.family).toBe("granite");

    await judge.probe();
    const parsed = await judge.judge("C major", ["alpha voice", "beta voice"]);
    expect(parsed).toEqual({ best: 0, worst: 1 });
    expect(seen[0].systemPrompt).toContain("voice-leading quality and musicality");
    expect(seen[0].userMessage).toContain("Progression key: C major.");
    expect(seen[0].userMessage).toContain("Option 1:\nalpha voice");
    expect(seen[0].userMessage).toContain("Option 2:\nbeta voice");
    expect(seen[0].outputSchema).toEqual({});

    raw = '{"best":1,"worst":1}';
    const dropped = await judge.judge("C major", ["alpha voice", "beta voice"], 5);
    expect(dropped).toBeNull();
    expect(seeds).toEqual([7, 7, 12]);
  });
});
