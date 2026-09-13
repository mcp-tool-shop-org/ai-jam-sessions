// THE GATE READOUT, against GATE-PREREG.md. Nothing here chooses a threshold: the readings
// were fixed before any run existed.
//
// The estimator is the ACROSS-RUN mean held-out lift over the local runs of arm C, paired by
// item -- NOT a conjunction of per-run significance tests. That rule is the Gelman & Stern
// 2006 error (doi:10.1198/000313006X152649) and Agarwal et al. 2021 (arXiv:2108.13264)
// prescribe interval estimates aggregated over the run dimension instead. Per-run intervals
// are printed because they are the honest display, and they are NOT the decision.
//
// TWO bootstraps are reported and the difference is visible rather than asserted:
//   items only  - treats the K runs as fixed, resamples the 75 items
//   runs+items  - resamples runs WITH REPLACEMENT then items, so the interval pays for the
//                 fact that K is 3. This is wider and it is the honest one at this K.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);
const PROMPTS = "prompts-heldout-v1.jsonl";
const RUN_FILES: Array<[string, string]> = [
  ["C7L", "mc64-heldout-C7L.jsonl"],
  ["C8L", "mc64-heldout-C8L.jsonl"],
  ["C9L", "mc64-heldout-C9L.jsonl"],
];
const BASE = "mc64-heldout-base.jsonl";
const POD_C = "mc-heldout-C.jsonl";      // seed 7 on the POD, G=16
const POD_BASE = "mc-heldout-base.jsonl"; // its matched base, G=16

const byId = new Map(readFileSync(join(RUNS, PROMPTS), "utf8").trim().split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
const firstDeg = (raw: string) => ((parseSpecResponse(raw)[0]?.degrees ?? []) as number[]).join(",") || "(none)";

function perItem(file: string) {
  if (!existsSync(join(RUNS, file))) return null;
  const rate = new Map<string, number>();
  const hPass = new Map<string, number>(), hAll = new Map<string, number>();
  let nPass = 0, nAll = 0, G = 0;
  for (const l of readFileSync(join(RUNS, file), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    G = r.completions.length;
    let k = 0;
    for (const raw of r.completions) {
      const d = firstDeg(raw); hAll.set(d, (hAll.get(d) ?? 0) + 1); nAll++;
      if (scoreVoicing(prog, raw, VOICES, STYLE).correct) {
        k++; nPass++; hPass.set(d, (hPass.get(d) ?? 0) + 1);
      }
    }
    rate.set(r.itemId, k / r.completions.length);
  }
  const share = (h: Map<string, number>, n: number) => (n ? Math.max(...h.values()) / n : 0);
  return { rate, G, topFirstPass: share(hPass, nPass), topFirstAll: share(hAll, nAll), nPass, nAll };
}

let seed = 20260913;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const pp = (v: number) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(2)}`;
function ci(boots: number[]) { boots.sort((a, b) => a - b); return [boots[Math.floor(0.025 * boots.length)]!, boots[Math.floor(0.975 * boots.length)]!] as const; }

const base = perItem(BASE);
if (!base) { console.log(`base eval ${BASE} not present yet -- gate cannot be read`); process.exit(0); }
const runs = RUN_FILES.map(([lab, f]) => [lab, perItem(f)] as const).filter(([, s]) => s) as Array<[string, NonNullable<ReturnType<typeof perItem>>]>;
if (!runs.length) { console.log("no local run evals present yet"); process.exit(0); }

const ids = [...base.rate.keys()].filter((k) => runs.every(([, s]) => s.rate.has(k)));
console.log(`\n=== GATE READOUT — held-out pool, n=${ids.length} items, base G=${base.G} ===`);
console.log(`base pass ${mean(ids.map((i) => base.rate.get(i)!)).toFixed(4)}\n`);

// ---- per-run display (NOT the decision) ----
console.log("PER-RUN (display only — a conjunction over these is not the reading)");
const perRunD: number[][] = [];
for (const [lab, s] of runs) {
  const d = ids.map((i) => s.rate.get(i)! - base.rate.get(i)!);
  perRunD.push(d);
  const boots: number[] = [];
  for (let b = 0; b < 10000; b++) { let acc = 0; for (let j = 0; j < d.length; j++) acc += d[Math.floor(rand() * d.length)]!; boots.push(acc / d.length); }
  const [lo, hi] = ci(boots);
  console.log(`  ${lab}  lift ${pp(mean(d))}pp  [${pp(lo)}, ${pp(hi)}]  ${d.filter((v) => v > 0).length}/${d.filter((v) => v < 0).length}  G=${s.G}  ${lo > 0 ? "excludes 0" : "includes 0"}`);
}

// ---- PRIMARY: across-run mean lift ----
const K = perRunD.length;
const perItemAcross = ids.map((_, i) => mean(perRunD.map((d) => d[i]!)));
const point = mean(perItemAcross);

const bootsItems: number[] = [];
for (let b = 0; b < 10000; b++) { let acc = 0; for (let j = 0; j < ids.length; j++) acc += perItemAcross[Math.floor(rand() * ids.length)]!; bootsItems.push(acc / ids.length); }
const [iLo, iHi] = ci(bootsItems);

const bootsRI: number[] = [];
for (let b = 0; b < 10000; b++) {
  const pick = Array.from({ length: K }, () => perRunD[Math.floor(rand() * K)]!);
  let acc = 0;
  for (let j = 0; j < ids.length; j++) { const i = Math.floor(rand() * ids.length); acc += mean(pick.map((d) => d[i]!)); }
  bootsRI.push(acc / ids.length);
}
const [rLo, rHi] = ci(bootsRI);

console.log(`\nPRIMARY — across-run mean lift over ${K} local runs`);
console.log(`  point ${pp(point)}pp`);
console.log(`  bootstrap over ITEMS only      [${pp(iLo)}, ${pp(iHi)}]  ${iLo > 0 ? "EXCLUDES 0" : "includes 0"}`);
console.log(`  bootstrap over RUNS AND ITEMS  [${pp(rLo)}, ${pp(rHi)}]  ${rLo > 0 ? "EXCLUDES 0" : "includes 0"}   <- the honest one at K=${K}`);
console.log(`\n  pod seed-7 point estimate being replicated: +2.00pp`);
console.log(`  reading 3 (REPLICATES SMALLER) fires if the interval excludes 0 and hi < +2.00pp`);

// ---- platform check: local seed 7 vs pod seed 7, arm-vs-arm (base cancels) ----
const podC = perItem(POD_C), podBase = perItem(POD_BASE), loc7 = runs.find(([l]) => l === "C7L")?.[1];
if (podC && loc7 && podBase) {
  const shared = ids.filter((i) => podC.rate.has(i));
  const d = shared.map((i) => loc7.rate.get(i)! - podC.rate.get(i)!);
  const boots: number[] = [];
  for (let b = 0; b < 10000; b++) { let acc = 0; for (let j = 0; j < d.length; j++) acc += d[Math.floor(rand() * d.length)]!; boots.push(acc / d.length); }
  const [lo, hi] = ci(boots);
  console.log(`\nPLATFORM CHECK — local seed 7 (G=${loc7.G}) minus pod seed 7 (G=${podC.G}), paired, base cancels`);
  console.log(`  diff ${pp(mean(d))}pp  [${pp(lo)}, ${pp(hi)}]  n=${shared.length}  ${lo > 0 || hi < 0 ? "DISTINGUISHABLE -> reading 4, pools may not be combined" : "not distinguishable -> platform is not a confound"}`);
  console.log(`  (unequal G: the pod arm is measured at lower precision, which widens this test)`);
}

// ---- SECONDARY, no threshold attached (prereg) ----
console.log(`\nSECONDARY — opening concentration. NO threshold is attached to this (GATE-PREREG.md).`);
console.log(`  ${"arm".padEnd(8)} ${"topFirst passing".padEnd(20)} topFirst ALL`);
console.log(`  ${"base".padEnd(8)} ${base.topFirstPass.toFixed(3).padEnd(20)} ${base.topFirstAll.toFixed(3)}`);
for (const [lab, s] of runs) console.log(`  ${lab.padEnd(8)} ${s.topFirstPass.toFixed(3).padEnd(20)} ${s.topFirstAll.toFixed(3)}`);
if (podC && podBase) {
  console.log(`  --- pod seed 7, G=16, for reference ---`);
  console.log(`  ${"pod base".padEnd(8)} ${podBase.topFirstPass.toFixed(3).padEnd(20)} ${podBase.topFirstAll.toFixed(3)}`);
  console.log(`  ${"pod C".padEnd(8)} ${podC.topFirstPass.toFixed(3).padEnd(20)} ${podC.topFirstAll.toFixed(3)}`);
}
console.log(`\n  'passing' counts only verifier-admitted completions and so blends the policy's prior`);
console.log(`  with the rulebook's admissibility profile; 'ALL' is the policy's raw distribution.`);
