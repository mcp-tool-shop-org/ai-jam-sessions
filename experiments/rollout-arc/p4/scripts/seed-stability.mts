// Does the few-shot arm hold across a second generation seed? This is the quantity the second
// draw was bought to price: FORMAT-CLAUSE.md's coverage bar is 90% and seed 7 came in at 91%,
// one point above it, on an ITEMS-ONLY interval that prices item heterogeneity and not seed
// variance. One seed could not tell a stable 91% from a lucky one.
//
// Reported here: each seed against the same LOCAL instruct baseline (not the pod's -- the
// few-shot arms ran on this rig), and then seed-vs-seed directly. Two seeds is K=2, so NO
// interval is claimed over the run dimension; the seed-to-seed row IS the spread, shown as a
// spread. RNG seeded per computation.
import { readFileSync, existsSync } from "node:fs";
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
  if (!existsSync(join(RUNS, f))) return null;
  for (const l of readFileSync(join(RUNS, f), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    const h = new Map<string, number>(); let k = 0;
    for (const raw of r.completions) { h.set(fd(raw), (h.get(fd(raw)) ?? 0) + 1); if (scoreVoicing(prog, raw, 2, "common-practice").correct) k++; }
    rate.set(r.itemId, k / r.completions.length); cov.set(r.itemId, k > 0 ? 1 : 0);
    conc.set(r.itemId, Math.max(...h.values()) / r.completions.length);
  }
  return { rate, cov, conc };
}
const mkRng = () => { let s = SEED; return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296); };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const pp = (v: number) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(2)}`;
function ci(d: number[]) {
  const rng = mkRng(), bt: number[] = [];
  for (let b = 0; b < B; b++) { let a = 0; for (let j = 0; j < d.length; j++) a += d[Math.floor(rng() * d.length)]!; bt.push(a / d.length); }
  bt.sort((x, y) => x - y); return { m: mean(d), lo: bt[250]!, hi: bt[9750]! };
}
const show = (l: string, r: { m: number; lo: number; hi: number }) =>
  console.log(`  ${l.padEnd(22)} ${(pp(r.m) + "pp").padEnd(10)} [${pp(r.lo)}, ${pp(r.hi)}]  ${r.lo > 0 || r.hi < 0 ? "EXCLUDES 0" : "includes 0"}`);
const FIELDS = [["pass rate", "rate"], ["coverage (>=1 pass)", "cov"], ["concentration", "conc"]] as const;

const inst = load("mc64-heldout-base.jsonl")!;
const s7 = load("mc64-heldout-q3base-fewshot.jsonl"), s8 = load("mc64-heldout-q3base-fewshot-s8.jsonl");
for (const [tag, A] of [["seed 7", s7], ["seed 8", s8]] as const) {
  if (!A) { console.log(`\n${tag}: absent`); continue; }
  const ids = [...byId.keys()].filter((i) => A.rate.has(i) && inst.rate.has(i));
  console.log(`\n=== FEW-SHOT ${tag} minus LOCAL INSTRUCT, paired by item, n=${ids.length} ===`);
  for (const [l, f] of FIELDS) show(l, ci(ids.map((i) => (A as any)[f].get(i)! - (inst as any)[f].get(i)!)));
  console.log(`  levels: pass ${(100 * mean(ids.map((i) => A.rate.get(i)!))).toFixed(2)}%  coverage ${(100 * mean(ids.map((i) => A.cov.get(i)!))).toFixed(0)}%`);
}
if (s7 && s8) {
  const both = [...byId.keys()].filter((i) => s7.rate.has(i) && s8.rate.has(i));
  console.log(`\n=== SEED 8 minus SEED 7, same arm, paired by item, n=${both.length} ===`);
  console.log(`  (K=2: this IS the seed spread, not an interval over the run dimension)`);
  for (const [l, f] of FIELDS) show(l, ci(both.map((i) => (s8 as any)[f].get(i)! - (s7 as any)[f].get(i)!)));
}
