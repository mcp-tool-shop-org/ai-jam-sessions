// IS VS ENUMERATING, OR JUST SAMPLING MORE?
//
// VS returns K=5 candidates per completion and we draw 8 completions per item. The observed
// diversity could come from either level, and they mean different things:
//   WITHIN  a single completion lists 5 different openings -> the prompt forces enumeration
//   ACROSS  each completion commits to one opening, 8 completions differ -> ordinary sampling
// Standard sampling already has the ACROSS channel. Only the WITHIN channel is new.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const firstDeg = (raw: string) => ((parseSpecResponse(raw)[0]?.degrees ?? []) as number[]).join(",") || "(none)";
const outer = (raw: string) => { const i = raw.indexOf("["), j = raw.lastIndexOf("]");
  if (i < 0 || j <= i) return null; try { const v = JSON.parse(raw.slice(i, j + 1)); return Array.isArray(v) ? v : null; } catch { return null; } };

const withinDistinct: number[] = [], acrossShare: number[] = [], withinShare: number[] = [];
for (const l of readFileSync(join(RUNS, "vs-heldout-base.jsonl"), "utf8").trim().split("\n").filter(Boolean)) {
  const r = JSON.parse(l) as { completions: string[] };
  const firstOfEach: string[] = [];
  for (const raw of r.completions) {
    const arr = outer(raw); if (!arr) continue;
    const cands = (arr as Array<{ voicing?: unknown }>).filter((e) => e && typeof e === "object" && "voicing" in e);
    if (!cands.length) continue;
    const degs = cands.map((c) => firstDeg(JSON.stringify(c.voicing)));
    withinDistinct.push(new Set(degs).size);
    const h = new Map<string, number>(); for (const d of degs) h.set(d, (h.get(d) ?? 0) + 1);
    withinShare.push(Math.max(...h.values()) / degs.length);
    firstOfEach.push(degs[0]!);            // one candidate per completion = the ACROSS channel
  }
  if (firstOfEach.length) {
    const h = new Map<string, number>(); for (const d of firstOfEach) h.set(d, (h.get(d) ?? 0) + 1);
    acrossShare.push(Math.max(...h.values()) / firstOfEach.length);
  }
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`\ncompletions analysed: ${withinDistinct.length}, items: ${acrossShare.length}`);
console.log(`WITHIN one completion : ${mean(withinDistinct).toFixed(2)} distinct openings of 5   modal share ${mean(withinShare).toFixed(4)}`);
console.log(`ACROSS completions    : modal share ${mean(acrossShare).toFixed(4)}  (first candidate only, 8 per item)`);
console.log(`STANDARD sampling     : modal share 0.9333 (16 per item) -- the comparison for the ACROSS channel`);
console.log(`\nIf WITHIN modal share is far below 0.9333, the prompt is producing enumeration the`);
console.log(`sampler does not. If ACROSS alone already matches standard, the new diversity is`);
console.log(`entirely inside the envelope and is a prompt effect, not a sampling effect.`);
