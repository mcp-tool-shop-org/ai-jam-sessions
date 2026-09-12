// Bound list_measures in the environment, not in the MCP server.
// A missing or oversized window would dump the whole song (bethena: 219
// measures). That is the P1b failure: one observation, one guess, no search.

export const MAX_LIST_WINDOW = 4;

export type BoundWindow =
  | { ok: true; arguments: Record<string, unknown> }
  | { ok: false; reason: string };

export function boundListMeasures(args: Record<string, unknown>): BoundWindow {
  // Both bounds are DECLARED OPTIONAL on the tool the policy actually reads
  // (trainer/env.py: `startMeasure: int | None = None`), and the MCP schema
  // documents startMeasure as defaulting to 1 and endMeasure to last. Refusing
  // a call that omits them punished the policy for calling the tool exactly as
  // its own signature permits — measured at 97-100% of episodes across every
  // cell of the P2 grid, burning ~20% of a 5-turn budget before any search
  // began. Enforcement now matches the declared contract: the window still
  // caps at MAX_LIST_WINDOW, but omitting a bound fills it in rather than
  // costing a turn.
  const start = args.startMeasure ?? 1;
  const end = args.endMeasure ?? Number(start) + MAX_LIST_WINDOW - 1;
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
