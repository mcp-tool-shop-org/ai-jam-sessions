import { describe, expect, it, vi } from "vitest";
import type { SongEntry } from "../../songs/types.js";

vi.mock("./library.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./library.js")>();
  return {
    ...actual,
    loadPublishableSongs: () => [{ id: "one" }, { id: "two" }] as SongEntry[],
  };
});

import { buildAllRecords } from "./builder.js";

describe("publishable shelf size", () => {
  it("throws the song count when the shelf is shorter than 11", () => {
    expect(() => buildAllRecords()).toThrow("publishable shelf has 2 songs, need >= 11");
  });
});
