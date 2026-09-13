// Plain GRPO's ACROSS-RUN opening-concentration change: the baseline --prefix-in-loss must beat.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const byId = new Map(readFileSync(join(RUNS, "prompts-heldout-v1.jsonl"), "utf8").trim().split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).map((p: { itemId: string }) => [p.itemId, 1]));
const fd = (raw: string) => ((parseSpecResponse(raw)[0]?.degrees ?? []) as number[]).join(",") || "(none)";
function conc(f: string) {
  const m = new Map<string, number>();
  for (const l of readFileSync(join(RUNS, f), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    if (!byId.has(r.itemId)) continue;
    const h = new Map<string, number>(); for (const raw of r.completions) { const d = fd(raw); h.set(d, (h.get(d) ?? 0) + 1); }
    m.set(r.itemId, Math.max(...h.values()) / r.completions.length);
  }
  return m;
}
const base = conc("mc64-heldout-base.jsonl");
const arms = ["C7L", "C8L", "C9L"].map((a) => conc(`mc64-heldout-${a}.jsonl`));
const ids = [...base.keys()].filter((i) => arms.every((m) => m.has(i)));
const perItem = ids.map((i) => arms.reduce((s, m) => s + (m.get(i)! - base.get(i)!), 0) / arms.length);
const perRun = arms.map((m) => ids.reduce((s, i) => s + (m.get(i)! - base.get(i)!), 0) / ids.length);
let sd = 20260913; const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0), sd / 4294967296);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const bt: number[] = [];
for (let b = 0; b < 10000; b++) {
  const pick = Array.from({ length: 3 }, () => Math.floor(rnd() * 3));
  let acc = 0;
  for (let j = 0; j < ids.length; j++) { const i = Math.floor(rnd() * ids.length); acc += mean(pick.map((k) => arms[k]!.get(ids[i]!)! - base.get(ids[i]!)!)); }
  bt.push(acc / ids.length);
}
bt.sort((a, b) => a - b);
console.log(`\nplain GRPO (arm C), n=${ids.length} items, 3 local runs`);
console.log(`  per-run concentration delta: ${perRun.map((v) => (100 * v).toFixed(2) + "pp").join("  ")}`);
console.log(`  ACROSS-RUN mean ${(100 * mean(perItem)).toFixed(2)}pp   runs+items 95% [${(100 * bt[250]!).toFixed(2)}, ${(100 * bt[9750]!).toFixed(2)}]`);
console.log(`  ${bt[250]! > 0 ? "EXCLUDES 0 (positive) -- plain GRPO SHARPENS across runs" : "includes 0"}`);
