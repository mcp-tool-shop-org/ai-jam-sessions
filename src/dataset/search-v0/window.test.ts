import { describe, it, expect } from "vitest";
import { MAX_LIST_WINDOW, boundListMeasures } from "./window.js";

describe("boundListMeasures", () => {
  it("refuses a dump that omits the window", () => {
    const r = boundListMeasures({ id: "bethena" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/requires startMeasure and endMeasure/);
  });

  it("refuses a span larger than the page cap", () => {
    const r = boundListMeasures({ id: "bethena", startMeasure: 1, endMeasure: MAX_LIST_WINDOW + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(new RegExp(`caps a call at ${MAX_LIST_WINDOW}`));
  });

  it("passes a page of at most MAX_LIST_WINDOW", () => {
    const r = boundListMeasures({ id: "solace", startMeasure: 5, endMeasure: 8 });
    expect(r).toEqual({
      ok: true,
      arguments: { id: "solace", startMeasure: 5, endMeasure: 8 },
    });
  });
});
