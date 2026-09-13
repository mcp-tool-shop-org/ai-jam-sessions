// The same model, same pool, two generation counts. Two things get measured directly here
// instead of assumed:
//   1. pass rate should be UNBIASED in G -- if it moves, something other than sampling did.
//   2. modal-share concentration is biased UPWARD at small n. The VS analysis corrected for
//      that by subsampling; this measures the size of the bias on real data.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";
const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const byId = new Map(readFileSync(join(RUNS, "prompts-heldout-v1.jsonl"), "utf8").trim().split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
const firstDeg = (raw: string) => ((parseSpecResponse(raw)[0]?.degrees ?? []) as number[]).join(",") || "(none)";
let rs = 20260913; const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0), rs / 4294967296);

function load(f: string) {
  const byItem = new Map<string, string[]>(); const rate: number[] = [];
  for (const l of readFileSync(join(RUNS, f), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    let k = 0; const degs: string[] = [];
    for (const raw of r.completions) { degs.push(firstDeg(raw)); if (scoreVoicing(prog, raw, 2, "common-practice").correct) k++; }
    byItem.set(r.itemId, degs); rate.push(k / r.completions.length);
  }
  return { byItem, rate };
}
function conc(byItem: Map<string, string[]>, n: number, reps: number) {
  const per: number[] = [];
  for (const [, list] of byItem) {
    if (list.length < n) continue;
    let acc = 0;
    for (let r = 0; r < reps; r++) {
      const p = list.slice();
      for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j]!, p[i]!]; }
      const h = new Map<string, number>(); for (const d of p.slice(0, n)) h.set(d, (h.get(d) ?? 0) + 1);
      acc += Math.max(...h.values()) / n;
    }
    per.push(acc / reps);
  }
  return per.reduce((a, b) => a + b, 0) / per.length;
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const g16 = load("mc-heldout-base.jsonl"), g64 = load("mc64-heldout-base.jsonl");
console.log(`\n=== base model, held-out pool, n=${g16.rate.length} items ===`);
console.log(`pass rate      G=16 ${mean(g16.rate).toFixed(4)}   G=64 ${mean(g64.rate).toFixed(4)}   (should be unbiased in G)`);
console.log(`concentration  G=16 ${conc(g16.byItem, 16, 1).toFixed(4)}   G=64 ${conc(g64.byItem, 64, 1).toFixed(4)}   (raw, each at its own n)`);
console.log(`concentration  G=64 subsampled to n=16: ${conc(g64.byItem, 16, 200).toFixed(4)}   <- matched to the G=16 row`);
console.log(`\nthe gap between the two G=64 rows IS the small-n bias, measured rather than assumed.`);
