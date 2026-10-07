import { describe, expect, it } from "vitest";
import { getPanelSong, listPanelSongs } from "./human-audio-catalog.js";

describe("human audio catalog", () => {
  it("looks up the four default panel songs and lists them in order", () => {
    expect(getPanelSong("satie-gymnopedie-no1")?.title).toBe("Gymnopedie No. 1");
    expect(getPanelSong("autumn-leaves")?.title).toBe("Autumn Leaves");
    expect(getPanelSong("imagine")?.title).toBe("Imagine");
    expect(getPanelSong("fallin")?.title).toBe("Fallin'");
    expect(getPanelSong("not-a-song")).toBeUndefined();
    expect(listPanelSongs().map(({ id, title }) => ({ id, title }))).toEqual([
      { id: "satie-gymnopedie-no1", title: "Gymnopedie No. 1" },
      { id: "autumn-leaves", title: "Autumn Leaves" },
      { id: "imagine", title: "Imagine" },
      { id: "fallin", title: "Fallin'" },
    ]);
  });
});
