// THE HOLE READING 4 DID NOT CLOSE.
//
// GATE-RESULTS.md reading 4 ("platform: NOT confounded", -0.56pp [-2.38, +1.23]) is computed
// at gate-readout.mts:120 as `loc7.rate - podC.rate` -- PASS RATE ONLY. The PRIMARY metric of
// every cell Grok is now considering is opening CONCENTRATION, and concentration has never
// been compared across platforms. A pod arm scored against the three LOCAL C runs would put
// its primary across an untested boundary. That is the wrong-reference-set pathology with a
// pod attached to it.
//
// This closes it for $0 from files already on disk, before any pod exists.
//
// MATCHED G IS NOT OPTIONAL. Modal-share concentration is biased UPWARD at small n
// (base-g16-vs-g64.mts measured the size of that bias). The pod evals are G=16 and the local
// evals are G=64, so the local runs are SUBSAMPLED to 16 and averaged over REPS draws.
// Comparing 64 against 16 directly would report the estimator's bias as a platform effect.
//
// RNG is seeded PER COMPUTATION (pil-readout.mts rule 1): a module-level generator consumed
// in call order is how one contrast got two published intervals.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const SEED = 20260913;
const B = 10000;
const REPS = 200;   // subsample draws per item when matching G
const G = 16;       // the pod's generation count; the local files are matched down to it

const byId = new Map(readFileSync(join(RUNS, "prompts-heldout-v1.jsonl"), "utf8").trim().split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
const fd = (r: string) => ((parseSpecResponse(r)[0]?.degrees ?? []) as number[]).join(",") || "(none)";
const mkRng = (s0: number) => { let s = s0; return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296); };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const pp = (v: number) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(2)}`;

/** Per item: the opening-degree label of every completion, and whether each passed. */
function load(f: string) {
  const degs = new Map<string, string[]>(), pass = new Map<string, boolean[]>();
  for (const l of readFileSync(join(RUNS, f), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    const d: string[] = [], p: boolean[] = [];
    for (const raw of r.completions) { d.push(fd(raw)); p.push(scoreVoicing(prog, raw, 2, "common-practice").correct); }
    degs.set(r.itemId, d); pass.set(r.itemId, p);
  }
  return { degs, pass, G: [...degs.values()][0]?.length ?? 0 };
}

type Run = ReturnType<typeof load>;
/** Item-wise modal share at exactly n draws. If the file already has n, no subsampling. */
function concAt(run: Run, id: string, n: number, rng: () => number) {
  const list = run.degs.get(id)!;
  if (list.length === n) { const h = new Map<string, number>(); for (const d of list) h.set(d, (h.get(d) ?? 0) + 1); return Math.max(...h.values()) / n; }
  let acc = 0;
  for (let r = 0; r < REPS; r++) {
    const idx = list.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j]!, idx[i]!]; }
    const h = new Map<string, number>();
    for (let i = 0; i < n; i++) { const d = list[idx[i]!]!; h.set(d, (h.get(d) ?? 0) + 1); }
    acc += Math.max(...h.values()) / n;
  }
  return acc / REPS;
}
const rate = (run: Run, id: string) => { const p = run.pass.get(id)!; return p.filter(Boolean).length / p.length; };

const locC = load("mc64-heldout-C7L.jsonl"), locB = load("mc64-heldout-base.jsonl");
const podC = load("mc-heldout-C.jsonl"), podB = load("mc-heldout-base.jsonl");
const ids = [...byId.keys()].filter((i) => [locC, locB, podC, podB].every((m) => m.degs.has(i)));

console.log(`\n=== PLATFORM CHECK ON CONCENTRATION (the metric reading 4 never tested) ===`);
console.log(`  local C7L G=${locC.G} · local base G=${locB.G} · pod C7 G=${podC.G} · pod base G=${podB.G}`);
console.log(`  n=${ids.length} shared items · matched to G=${G} by subsampling (${REPS} draws) · ${B} bootstrap · seed ${SEED}/computation`);

/** Paired bootstrap over items on a per-item difference vector. Fresh RNG. */
function ci(d: number[]) {
  const rng = mkRng(SEED), bt: number[] = [];
  for (let b = 0; b < B; b++) { let a = 0; for (let j = 0; j < d.length; j++) a += d[Math.floor(rng() * d.length)]!; bt.push(a / d.length); }
  bt.sort((x, y) => x - y);
  return { m: mean(d), lo: bt[250]!, hi: bt[9750]! };
}
const show = (label: string, r: { m: number; lo: number; hi: number }) =>
  console.log(`  ${label.padEnd(46)} ${(pp(r.m) + "pp").padEnd(9)} [${pp(r.lo)}, ${pp(r.hi)}]  ${r.lo > 0 || r.hi < 0 ? "DISTINGUISHABLE -> pods may not be scored against local C" : "not distinguishable"}`);

// Each arm is expressed as a lift over ITS OWN base, so the platform contrast is a
// difference of differences and any shared platform offset in the base cancels.
const rngLC = mkRng(SEED), rngLB = mkRng(SEED + 1);
const locCc = new Map(ids.map((i) => [i, concAt(locC, i, G, rngLC)]));
const locBc = new Map(ids.map((i) => [i, concAt(locB, i, G, rngLB)]));

show("CONCENTRATION  (localC-localBase)-(podC-podBase)",
  ci(ids.map((i) => (locCc.get(i)! - locBc.get(i)!) - (concAt(podC, i, G, mkRng(SEED)) - concAt(podB, i, G, mkRng(SEED))))));
show("PASS RATE      (control: reproduces reading 4)",
  ci(ids.map((i) => (rate(locC, i) - rate(locB, i)) - (rate(podC, i) - rate(podB, i)))));

console.log(`\n  raw levels at matched G=${G} (item-wise means, for eyeballing direction)`);
const lvl = (l: string, v: number) => console.log(`    ${l.padEnd(24)} ${v.toFixed(4)}`);
lvl("local base conc", mean(ids.map((i) => locBc.get(i)!)));
lvl("local C7L  conc", mean(ids.map((i) => locCc.get(i)!)));
lvl("pod   base conc", mean(ids.map((i) => concAt(podB, i, G, mkRng(SEED)))));
lvl("pod   C7   conc", mean(ids.map((i) => concAt(podC, i, G, mkRng(SEED)))));
console.log(`\n  Reading: if the concentration row is NOT distinguishable, a pod-trained arm may be`);
console.log(`  scored arm-vs-arm against the three LOCAL C runs. If it IS, the pod cell must`);
console.log(`  carry its own C control -- which doubles its price and is a budget decision.`);
