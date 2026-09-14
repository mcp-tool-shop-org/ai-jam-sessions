// The few-shot arm against the instruct baseline, paired by item, with an interval -- because
// a point estimate is not a claim in this arc.
//
// ⚑ BASELINE IS THE **LOCAL** INSTRUCT EVAL (runs/), not the pod's (artifacts/). Both files are
// named mc64-heldout-base.jsonl and prior-shape.mts resolves artifacts/ first, which is how a
// duplicate row got labelled "local rig" earlier. The few-shot arm ran on THIS rig, so the
// same-platform baseline is the only honest one; using the pod's would fold a platform term
// into every contrast below.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";
const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const SEED = 20260914, B = 10000;
const byId = new Map(readFileSync(join(RUNS, "prompts-heldout-v1.jsonl"), "utf8").trim().split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
const fd = (r: string) => ((parseSpecResponse(r)[0]?.degrees ?? []) as number[]).join(",") || "(none)";
function load(f: string) {
  const rate = new Map<string, number>(), cov = new Map<string, number>(), conc = new Map<string, number>();
  for (const l of readFileSync(join(RUNS, f), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    const h = new Map<string, number>(); let k = 0;
    for (const raw of r.completions) { h.set(fd(raw), (h.get(fd(raw)) ?? 0) + 1); if (scoreVoicing(prog, raw, 2, "common-practice").correct) k++; }
    rate.set(r.itemId, k / r.completions.length);
    cov.set(r.itemId, k > 0 ? 1 : 0);
    conc.set(r.itemId, Math.max(...h.values()) / r.completions.length);
  }
  return { rate, cov, conc };
}
const mkRng = () => { let s = SEED; return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296); };  // per computation
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const pp = (v: number) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(2)}`;
function ci(d: number[]) {
  const rng = mkRng(), bt: number[] = [];
  for (let b = 0; b < B; b++) { let a = 0; for (let j = 0; j < d.length; j++) a += d[Math.floor(rng() * d.length)]!; bt.push(a / d.length); }
  bt.sort((x, y) => x - y); return { m: mean(d), lo: bt[250]!, hi: bt[9750]! };
}
const A = load("mc64-heldout-q3base-fewshot.jsonl"), Bm = load("mc64-heldout-base.jsonl");
const ids = [...byId.keys()].filter((i) => A.rate.has(i) && Bm.rate.has(i));
console.log(`\n=== FEW-SHOT BASE minus LOCAL INSTRUCT BASE, paired by item, n=${ids.length}, ${B} bootstrap ===`);
for (const [label, field] of [["pass rate", "rate"], ["coverage (>=1 pass)", "cov"], ["concentration", "conc"]] as const) {
  const r = ci(ids.map((i) => (A as any)[field].get(i)! - (Bm as any)[field].get(i)!));
  console.log(`  ${label.padEnd(22)} ${(pp(r.m) + "pp").padEnd(10)} [${pp(r.lo)}, ${pp(r.hi)}]  ${r.lo > 0 || r.hi < 0 ? "EXCLUDES 0" : "includes 0"}`);
}
console.log(`\n  levels: few-shot pass ${(100*mean(ids.map(i=>A.rate.get(i)!))).toFixed(2)}%  coverage ${(100*mean(ids.map(i=>A.cov.get(i)!))).toFixed(0)}%`);
console.log(`          local instruct pass ${(100*mean(ids.map(i=>Bm.rate.get(i)!))).toFixed(2)}%  coverage ${(100*mean(ids.map(i=>Bm.cov.get(i)!))).toFixed(0)}%`);
