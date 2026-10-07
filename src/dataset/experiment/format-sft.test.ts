import { describe, expect, it } from "vitest";
import { formatRecords, type SftSource } from "./format-sft.js";

describe("formatRecords", () => {
  it("splits train and test into exact SFT lines", () => {
    const systemText = "Answer with a measure number.";
    const train: SftSource = {
      id: "rec-train",
      split: "train",
      kind: "search",
      song_id: "song-a",
      session: [
        { turn: 1, role: "user", content: "Which measure?" },
        {
          turn: 2,
          role: "assistant",
          content: "Looking.",
          tool_calls: [
            { tool: "list_measures", arguments: { id: "song-a", startMeasure: 1, endMeasure: 4 } },
          ],
        },
        { turn: 3, role: "tool", tool: "list_measures", content: { measures: [1] } },
        { turn: 4, role: "assistant", content: "1" },
      ],
    };
    const test: SftSource = {
      id: "rec-test",
      split: "test",
      kind: "search",
      song_id: "song-b",
      session: [{ turn: 1, role: "user", content: "Held out." }],
    };

    expect(formatRecords([train, test], systemText)).toEqual({
      train: [
        {
          id: "rec-train",
          song_id: "song-a",
          split: "train",
          kind: "search",
          messages: [
            { role: "system", content: systemText },
            { role: "user", content: "Which measure?" },
            {
              role: "assistant",
              content: "Looking.",
              tool_calls: [
                { name: "list_measures", arguments: { id: "song-a", startMeasure: 1, endMeasure: 4 } },
              ],
            },
            { role: "tool", name: "list_measures", content: '{"measures":[1]}' },
            { role: "assistant", content: "1" },
          ],
        },
      ],
      test: [
        {
          id: "rec-test",
          song_id: "song-b",
          split: "test",
          kind: "search",
          messages: [
            { role: "system", content: systemText },
            { role: "user", content: "Held out." },
          ],
        },
      ],
    });
  });
});
