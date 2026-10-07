import { describe, expect, it, vi } from "vitest";
import type { V1Record } from "./schema.js";

const records = vi.hoisted(() => [
  {
    family: "ensemble",
    scope: { phrase_window: "C", song_id: "fur-elise" },
  },
  {
    family: "measures",
    scope: { phrase_window: "full:1", song_id: "fur-elise" },
  },
] as V1Record[]);

const buildAllRecords = vi.hoisted(() => vi.fn(() => records));

vi.mock("./builder.js", () => ({
  buildAllRecords,
}));

import { coverageV1Task, v1Records } from "./task.js";

describe("v1 case cache", () => {
  it("builds once and splits an ensemble case on the phrase window", () => {
    const cases = coverageV1Task.cases();
    expect(v1Records()).toBe(cases);
    expect(coverageV1Task.cases()).toBe(cases);
    expect(buildAllRecords).toHaveBeenCalledTimes(1);
    expect(coverageV1Task.splitKey(cases[0]!)).toBe("ensemble:C");
    expect(coverageV1Task.splitKey(cases[1]!)).toBe("fur-elise");
  });
});
