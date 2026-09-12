import { describe, it, expect } from "vitest";
import { MAX_LIST_WINDOW, boundListMeasures } from "./window.js";

describe("boundListMeasures", () => {
  // Was: "refuses a dump that omits the window". The refusal was the wrong
  // mechanism for the right goal — the tool signature the policy reads declares
  // both bounds optional, so refusing punished a legal call and cost ~20% of a
  // 5-turn budget in 97-100% of P2 episodes. The goal is unchanged and still
  // asserted: a windowless call must not dump the song.
  it("fills in an omitted window instead of refusing, and still does not dump", () => {
    const r = boundListMeasures({ id: "bethena" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.arguments).toMatchObject({ startMeasure: 1, endMeasure: MAX_LIST_WINDOW });
      expect(Number(r.arguments.endMeasure) - Number(r.arguments.startMeasure) + 1).toBe(MAX_LIST_WINDOW);
    }
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

// ─── The turn tax ────────────────────────────────────────────────────────────
//
// The tool signature the policy reads declares both bounds optional; this
// module used to require them. Measured across the P2 grid, 97-100% of episodes
// burned one of five tool turns on that refusal — a contract mismatch we
// introduced, not a policy error.
describe("omitted bounds are filled in, not refused", () => {
  it("defaults endMeasure to a full window from startMeasure", () => {
    const r = boundListMeasures({ id: "x", startMeasure: 9 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.arguments).toMatchObject({ startMeasure: 9, endMeasure: 9 + MAX_LIST_WINDOW - 1 });
  });

  it("defaults startMeasure to 1, matching the tool's documented default", () => {
    const r = boundListMeasures({ id: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.arguments).toMatchObject({ startMeasure: 1, endMeasure: MAX_LIST_WINDOW });
  });

  it("still caps an explicitly oversized window", () => {
    const r = boundListMeasures({ id: "x", startMeasure: 1, endMeasure: 1 + MAX_LIST_WINDOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/caps a call at/);
  });

  it("still rejects a nonsense range", () => {
    expect(boundListMeasures({ id: "x", startMeasure: 9, endMeasure: 3 }).ok).toBe(false);
    expect(boundListMeasures({ id: "x", startMeasure: 0 }).ok).toBe(false);
  });
});
