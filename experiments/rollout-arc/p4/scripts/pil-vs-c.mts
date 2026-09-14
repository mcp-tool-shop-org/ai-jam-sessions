// PIL vs C: the preregistered across-run readings, and the arm-vs-arm contrast.
// Two arm-vs-base numbers that look far apart are not a difference between arms.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";
const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const byId = new Map(readFileSync(join(RUNS, "prompts-heldout-v1.jsonl"), "utf8").trim().split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
const fd = (r: string) => ((parseSpecResponse(r)[0]?.degrees ?? []) as number[]).join(",") || "(none)";
function load(f: string) {
  const conc = new Map<string, number>(), rate = new Map<string, number>();
  for (const l of readFileSync(join(RUNS, f), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    const h = new Map<string, number>(); let k = 0;
    for (const raw of r.completions) { const d = fd(raw); h.set(d, (h.get(d) ?? 0) + 1); if (scoreVoicing(prog, raw, 2, "common-practice").correct) k++; }
    conc.set(r.itemId, Math.max(...h.values()) / r.completions.length);
    rate.set(r.itemId, k / r.completions.length);
  }
  return { conc, rate };
}
let sd = 20260913; const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0), sd / 4294967296);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const pp = (v: number) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(2)}`;
const base = load("mc64-heldout-base.jsonl");
const C = ["C7L", "C8L", "C9L"].map((a) => load(`mc64-heldout-${a}.jsonl`));
const P = ["PIL7L", "PIL8L", "PIL9L"].map((a) => load(`mc64-heldout-${a}.jsonl`));
const ids = [...base.conc.keys()].filter((i) => [...C, ...P].every((m) => m.conc.has(i)));

function acrossRun(arms: ReturnType<typeof load>[], field: "conc" | "rate", vsBase = true) {
  const per = ids.map((i) => mean(arms.map((m) => m[field].get(i)! - (vsBase ? base[field].get(i)! : 0))));
  const bt: number[] = [];
  for (let b = 0; b < 10000; b++) {
    const pick = Array.from({ length: arms.length }, () => Math.floor(rnd() * arms.length));
    let acc = 0;
    for (let j = 0; j < ids.length; j++) { const i = ids[Math.floor(rnd() * ids.length)]!;
      acc += mean(pick.map((k) => arms[k]![field].get(i)! - (vsBase ? base[field].get(i)! : 0))); }
    bt.push(acc / ids.length);
  }
  bt.sort((a, b) => a - b);
  return { m: mean(per), lo: bt[250]!, hi: bt[9750]! };
}
function armVsArm(A: ReturnType<typeof load>[], B: ReturnType<typeof load>[], field: "conc" | "rate") {
  const per = ids.map((i) => mean(A.map((m) => m[field].get(i)!)) - mean(B.map((m) => m[field].get(i)!)));
  const bt: number[] = [];
  for (let b = 0; b < 10000; b++) {
    const pa = Array.from({ length: A.length }, () => Math.floor(rnd() * A.length));
    const pb = Array.from({ length: B.length }, () => Math.floor(rnd() * B.length));
    let acc = 0;
    for (let j = 0; j < ids.length; j++) { const i = ids[Math.floor(rnd() * ids.length)]!;
      acc += mean(pa.map((k) => A[k]![field].get(i)!)) - mean(pb.map((k) => B[k]![field].get(i)!)); }
    bt.push(acc / ids.length);
  }
  bt.sort((a, b) => a - b);
  return { m: mean(per), lo: bt[250]!, hi: bt[9750]! };
}
const v = (r: {m:number;lo:number;hi:number}) => `${pp(r.m)}pp  [${pp(r.lo)}, ${pp(r.hi)}]  ${r.lo > 0 || r.hi < 0 ? "EXCLUDES 0" : "includes 0"}`;
console.log(`\n=== n=${ids.length} items, base G=64, runs-and-items bootstrap ===`);
console.log(`\nPRIMARY — opening concentration vs base (positive = MORE mode-locked)`);
console.log(`  C   (unforced, masked n/a) ${v(acrossRun(C, "conc"))}`);
console.log(`  PIL (forced + gradient)    ${v(acrossRun(P, "conc"))}`);
console.log(`\nARM-VS-ARM — PIL minus C (negative = PIL less mode-locked than plain GRPO)`);
console.log(`  concentration              ${v(armVsArm(P, C, "conc"))}`);
console.log(`\nSECONDARY — held-out pass-rate lift vs base`);
console.log(`  C                          ${v(acrossRun(C, "rate"))}`);
console.log(`  PIL                        ${v(acrossRun(P, "rate"))}`);
console.log(`  PIL minus C                ${v(armVsArm(P, C, "rate"))}`);
