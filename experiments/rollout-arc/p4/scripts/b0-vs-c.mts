// B0 vs C: preregistered readings (B0-PREREG.md). RNG reseeded per computation.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const RUNS = join(here, "..", "runs");
const ART = join(here, "..", "artifacts");
const byId = new Map(
  readFileSync(join(RUNS, "prompts-heldout-v1.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]),
);
const fd = (r: string) => ((parseSpecResponse(r)[0]?.degrees ?? []) as number[]).join(",") || "(none)";
function load(f: string) {
  const conc = new Map<string, number>(),
    rate = new Map<string, number>();
  for (const l of readFileSync(join(ART, f), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId);
    if (!prog) continue;
    const h = new Map<string, number>();
    let k = 0;
    for (const raw of r.completions) {
      const d = fd(raw);
      h.set(d, (h.get(d) ?? 0) + 1);
      if (scoreVoicing(prog, raw, 2, "common-practice").correct) k++;
    }
    conc.set(r.itemId, Math.max(...h.values()) / r.completions.length);
    rate.set(r.itemId, k / r.completions.length);
  }
  return { conc, rate };
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const pp = (v: number) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(2)}`;
function boot(seed: number) {
  let sd = seed;
  return () => ((sd = (sd * 1664525 + 1013904223) >>> 0), sd / 4294967296);
}
const base = load("mc64-heldout-base.jsonl");
const C = ["C7", "C8", "C9"].map((a) => load(`mc64-heldout-${a}.jsonl`));
const B0 = ["B07", "B08", "B09"].map((a) => load(`mc64-heldout-${a}.jsonl`));
const ids = [...base.conc.keys()].filter((i) => [...C, ...B0].every((m) => m.conc.has(i)));

function acrossRun(arms: ReturnType<typeof load>[], field: "conc" | "rate", seed: number) {
  const rnd = boot(seed);
  const per = ids.map((i) => mean(arms.map((m) => m[field].get(i)! - base[field].get(i)!)));
  const bt: number[] = [];
  for (let b = 0; b < 10000; b++) {
    const pick = Array.from({ length: arms.length }, () => Math.floor(rnd() * arms.length));
    let acc = 0;
    for (let j = 0; j < ids.length; j++) {
      const i = ids[Math.floor(rnd() * ids.length)]!;
      acc += mean(pick.map((k) => arms[k]![field].get(i)! - base[field].get(i)!));
    }
    bt.push(acc / ids.length);
  }
  bt.sort((a, b) => a - b);
  return { m: mean(per), lo: bt[250]!, hi: bt[9750]! };
}
function armVsArm(A: ReturnType<typeof load>[], B: ReturnType<typeof load>[], field: "conc" | "rate", seed: number) {
  const rnd = boot(seed);
  const per = ids.map((i) => mean(A.map((m) => m[field].get(i)!)) - mean(B.map((m) => m[field].get(i)!)));
  const bt: number[] = [];
  for (let b = 0; b < 10000; b++) {
    const pa = Array.from({ length: A.length }, () => Math.floor(rnd() * A.length));
    const pb = Array.from({ length: B.length }, () => Math.floor(rnd() * B.length));
    let acc = 0;
    for (let j = 0; j < ids.length; j++) {
      const i = ids[Math.floor(rnd() * ids.length)]!;
      acc += mean(pa.map((k) => A[k]![field].get(i)!)) - mean(pb.map((k) => B[k]![field].get(i)!));
    }
    bt.push(acc / ids.length);
  }
  bt.sort((a, b) => a - b);
  return { m: mean(per), lo: bt[250]!, hi: bt[9750]! };
}
const v = (r: { m: number; lo: number; hi: number }) =>
  `${pp(r.m)}pp  [${pp(r.lo)}, ${pp(r.hi)}]  ${r.lo > 0 || r.hi < 0 ? "EXCLUDES 0" : "includes 0"}`;

function perRun(lab: string, m: ReturnType<typeof load>, field: "conc" | "rate", seed: number) {
  const rnd = boot(seed);
  const d = ids.map((i) => m[field].get(i)! - base[field].get(i)!);
  const bt: number[] = [];
  for (let b = 0; b < 10000; b++) {
    let acc = 0;
    for (let j = 0; j < d.length; j++) acc += d[Math.floor(rnd() * d.length)]!;
    bt.push(acc / d.length);
  }
  bt.sort((a, b) => a - b);
  return `${lab.padEnd(4)} ${v({ m: mean(d), lo: bt[250]!, hi: bt[9750]! })}`;
}

console.log(`\n=== n=${ids.length} items, G=64, runs-and-items, seed-per-computation ===`);
console.log(`\nPER-RUN concentration (display only)`);
["C7", "C8", "C9"].forEach((lab, i) => console.log("  " + perRun(lab, C[i]!, "conc", 20260920 + i)));
["B07", "B08", "B09"].forEach((lab, i) => console.log("  " + perRun(lab, B0[i]!, "conc", 20260923 + i)));
console.log(`\nPRIMARY — opening concentration vs base (positive = MORE mode-locked)`);
console.log(`  C   (beta=1e-4)  ${v(acrossRun(C, "conc", 20260913))}`);
console.log(`  B0  (beta=0)     ${v(acrossRun(B0, "conc", 20260914))}`);
console.log(`\nARM-VS-ARM — B0 minus C (negative = B0 less mode-locked than C)`);
console.log(`  concentration    ${v(armVsArm(B0, C, "conc", 20260915))}`);
console.log(`\nSECONDARY — held-out pass-rate lift vs base`);
console.log(`  C                ${v(acrossRun(C, "rate", 20260916))}`);
console.log(`  B0               ${v(acrossRun(B0, "rate", 20260917))}`);
console.log(`  B0 minus C       ${v(armVsArm(B0, C, "rate", 20260918))}`);

console.log(`\nPER-RUN pass lift (display only)`);
["C7", "C8", "C9"].forEach((lab, i) => console.log("  " + perRun(lab, C[i]!, "rate", 20260930 + i)));
["B07", "B08", "B09"].forEach((lab, i) => console.log("  " + perRun(lab, B0[i]!, "rate", 20260933 + i)));

// Platform by-product: pod base vs local base, same 75 items, G=64.
function loadLocal(f: string) {
  const conc = new Map<string, number>();
  for (const l of readFileSync(join(RUNS, f), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    if (!byId.has(r.itemId)) continue;
    const h = new Map<string, number>();
    for (const raw of r.completions) {
      const d = fd(raw);
      h.set(d, (h.get(d) ?? 0) + 1);
    }
    conc.set(r.itemId, Math.max(...h.values()) / r.completions.length);
  }
  return conc;
}
const localBase = loadLocal("mc64-heldout-base.jsonl");
const shared = ids.filter((i) => localBase.has(i));
{
  const rnd = boot(20260940);
  const d = shared.map((i) => base.conc.get(i)! - localBase.get(i)!);
  const bt: number[] = [];
  for (let b = 0; b < 10000; b++) {
    let acc = 0;
    for (let j = 0; j < d.length; j++) acc += d[Math.floor(rnd() * d.length)]!;
    bt.push(acc / d.length);
  }
  bt.sort((a, b) => a - b);
  console.log(`\nPLATFORM — pod-base minus local-base concentration, G=64, n=${shared.length}`);
  console.log(`  ${v({ m: mean(d), lo: bt[250]!, hi: bt[9750]! })}`);
  console.log(`  pod-base mean ${mean(shared.map((i) => base.conc.get(i)!)).toFixed(4)}  local-base mean ${mean(shared.map((i) => localBase.get(i)!)).toFixed(4)}`);
}
