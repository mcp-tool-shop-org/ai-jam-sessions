import { describe, it, expect } from "vitest";
import {
  parseArgs,
  decodeOptions,
  UsageError,
} from "../../coverage-v1-sft/scripts/ollama-grade.mjs";

const BASE = ["data.jsonl", "qwen2.5:7b", "--out", "preds.jsonl"];

describe("parseArgs --n", () => {
  it("defaults to a single greedy attempt, score_v1-compatible", () => {
    const a = parseArgs(BASE);
    expect(a.n).toBe(1);
    expect(a.seed).toBeNull();
    expect(decodeOptions(a, 0)).toEqual({ temperature: 0, num_predict: 128 });
  });

  it("accepts --n 8 with temperature > 0 and pins seed 0 when omitted", () => {
    const a = parseArgs([...BASE, "--n", "8", "--options", "temperature=1"]);
    expect(a.n).toBe(8);
    expect(a.seed).toBe(0);
    expect(a.extraOptions.temperature).toBe(1);
    expect(decodeOptions(a, 3).seed).toBe(3);
  });

  it("offsets --seed by attempt", () => {
    const a = parseArgs([...BASE, "--n", "8", "--seed", "10", "--options", "temperature=0.7"]);
    expect(decodeOptions(a, 0).seed).toBe(10);
    expect(decodeOptions(a, 7).seed).toBe(17);
  });

  it("refuses n>1 at temperature 0", () => {
    expect(() => parseArgs([...BASE, "--n", "8"])).toThrow(UsageError);
    expect(() => parseArgs([...BASE, "--n", "8", "--options", "temperature=0"])).toThrow(
      /temperature > 0/,
    );
  });

  it("refuses a non-positive --n", () => {
    expect(() => parseArgs([...BASE, "--n", "0"])).toThrow(/positive integer/);
    expect(() => parseArgs([...BASE, "--n", "1.5"])).toThrow(/positive integer/);
  });
});
