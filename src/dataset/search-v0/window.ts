// Bound list_measures in the environment, not in the MCP server.
// A missing or oversized window would dump the whole song (bethena: 219
// measures). That is the P1b failure: one observation, one guess, no search.

export const MAX_LIST_WINDOW = 4;

export type BoundWindow =
  | { ok: true; arguments: Record<string, unknown> }
  | { ok: false; reason: string };

export function boundListMeasures(args: Record<string, unknown>): BoundWindow {
  const start = args.startMeasure;
  const end = args.endMeasure;
  if (start == null || end == null) {
    return {
      ok: false,
      reason:
        `list_measures requires startMeasure and endMeasure; ` +
        `this environment pages at most ${MAX_LIST_WINDOW} measures per call`,
    };
  }
  const s = Number(start);
  const e = Number(end);
  if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1 || e < s) {
    return {
      ok: false,
      reason: `list_measures window is invalid (startMeasure=${JSON.stringify(start)}, endMeasure=${JSON.stringify(end)})`,
    };
  }
  const span = e - s + 1;
  if (span > MAX_LIST_WINDOW) {
    return {
      ok: false,
      reason:
        `list_measures window spans ${span} measures; ` +
        `this environment caps a call at ${MAX_LIST_WINDOW}`,
    };
  }
  return { ok: true, arguments: { ...args, startMeasure: s, endMeasure: e } };
}
