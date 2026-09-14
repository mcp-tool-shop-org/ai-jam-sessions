// THE SINGLE SOURCE of every interval in PREFIX-IN-LOSS-RESULTS.md.
//
// Two rules this script exists to enforce:
//
// 1. THE RNG IS SEEDED PER COMPUTATION, not once per module. A module-level generator is
//    consumed in call order, so the same contrast computed by two scripts -- or by the same
//    script after an added call -- returns slightly different bounds. That produced two
//    published CIs for one contrast (C pass [+0.46, +11.03] vs [+0.51, +11.09]). The 0.05pp
//    is not a finding; two published intervals for the same quantity would be. Every
//    bootstrap below starts from the same fixed seed, so re-running any subset reproduces.
//
// 2. ONE script emits every number that reaches the results file. Mixing sources is how the
//    discrepancy above got published in the first place.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const SEED = 20260913;
const B = 10000;
const byId = new Map(readFileSync(join(RUNS, "prompts-heldout-v1.jsonl"), "utf8").trim().split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
const fd = (r: string) => ((parseSpecResponse(r)[0]?.degrees ?? []) as number[]).join(",") || "(none)";

function load(f: string) {
  const conc = new Map<string, number>(), rate = new Map<string, number>();
  for (const l of readFileSync(join(RUNS, f), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    const h = new Map<string, number>(); let k = 0;
    for (const raw of r.completions) {
      const d = fd(raw); h.set(d, (h.get(d) ?? 0) + 1);
      if (scoreVoicing(prog, raw, 2, "common-practice").correct) k++;
    }
    conc.set(r.itemId, Math.max(...h.values()) / r.completions.length);
    rate.set(r.itemId, k / r.completions.length);
  }
  return { conc, rate };
}
// fresh generator per call -- this is rule 1
const mkRng = () => { let s = SEED; return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296); };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const pp = (v: number) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(2)}`;
const verdict = (lo: number, hi: number) => (lo > 0 || hi < 0 ? "EXCLUDES 0" : "includes 0");

type Arm = ReturnType<typeof load>;
const base = load("mc64-heldout-base.jsonl");
const C = ["C7L", "C8L", "C9L"].map((a) => load(`mc64-heldout-${a}.jsonl`));
const P = ["PIL7L", "PIL8L", "PIL9L"].map((a) => load(`mc64-heldout-${a}.jsonl`));
const ids = [...base.conc.keys()].filter((i) => [...C, ...P].every((m) => m.conc.has(i)));

/** items-only bootstrap: the K runs are treated as fixed. */
function itemsOnly(d: number[]) {
  const rng = mkRng(), bt: number[] = [];
  for (let b = 0; b < B; b++) { let a = 0; for (let j = 0; j < d.length; j++) a += d[Math.floor(rng() * d.length)]!; bt.push(a / d.length); }
  bt.sort((x, y) => x - y);
  return { m: mean(d), lo: bt[250]!, hi: bt[9750]! };
}
/** runs-and-items: resamples runs WITH REPLACEMENT then items. The preregistered estimator. */
function runsAndItems(arms: Arm[], field: "conc" | "rate", ref: Arm | null) {
  const rng = mkRng(), bt: number[] = [];
  const val = (m: Arm, i: string) => m[field].get(i)! - (ref ? ref[field].get(i)! : 0);
  for (let b = 0; b < B; b++) {
    const pick = Array.from({ length: arms.length }, () => Math.floor(rng() * arms.length));
    let a = 0;
    for (let j = 0; j < ids.length; j++) { const i = ids[Math.floor(rng() * ids.length)]!; a += mean(pick.map((k) => val(arms[k]!, i))); }
    bt.push(a / ids.length);
  }
  bt.sort((x, y) => x - y);
  return { m: mean(ids.map((i) => mean(arms.map((m) => val(m, i))))), lo: bt[250]!, hi: bt[9750]! };
}
/** arm-vs-arm, paired by item, base cancels. Resamples both arm sets and items. */
function armVsArm(A: Arm[], Bm: Arm[], field: "conc" | "rate") {
  const rng = mkRng(), bt: number[] = [];
  for (let b = 0; b < B; b++) {
    const pa = Array.from({ length: A.length }, () => Math.floor(rng() * A.length));
    const pb = Array.from({ length: Bm.length }, () => Math.floor(rng() * Bm.length));
    let a = 0;
    for (let j = 0; j < ids.length; j++) { const i = ids[Math.floor(rng() * ids.length)]!;
      a += mean(pa.map((k) => A[k]![field].get(i)!)) - mean(pb.map((k) => Bm[k]![field].get(i)!)); }
    bt.push(a / ids.length);
  }
  bt.sort((x, y) => x - y);
  return { m: mean(ids.map((i) => mean(A.map((m) => m[field].get(i)!)) - mean(Bm.map((m) => m[field].get(i)!)))), lo: bt[250]!, hi: bt[9750]! };
}
const row = (label: string, r: { m: number; lo: number; hi: number }) =>
  console.log(`  ${label.padEnd(28)} ${(pp(r.m) + "pp").padEnd(10)} [${pp(r.lo)}, ${pp(r.hi)}]  ${verdict(r.lo, r.hi)}`);

console.log(`\n=== n=${ids.length} items · base G=64 · ${B} bootstrap · seed ${SEED} per computation ===`);
console.log(`base pass ${mean(ids.map((i) => base.rate.get(i)!)).toFixed(4)} · base concentration ${mean(ids.map((i) => base.conc.get(i)!)).toFixed(4)}`);

console.log(`\nPER-RUN (DISPLAY ONLY — a conjunction over these is not the reading; Gelman & Stern 2006)`);
for (const [labels, arms] of [[["C7L","C8L","C9L"], C], [["PIL7L","PIL8L","PIL9L"], P]] as const)
  for (let k = 0; k < arms.length; k++) {
    row(`${labels[k]} concentration`, itemsOnly(ids.map((i) => arms[k]!.conc.get(i)! - base.conc.get(i)!)));
    row(`${labels[k]} pass lift`, itemsOnly(ids.map((i) => arms[k]!.rate.get(i)! - base.rate.get(i)!)));
  }

console.log(`\nPRIMARY — opening concentration vs base (positive = MORE mode-locked), runs+items`);
row("C   plain GRPO", runsAndItems(C, "conc", base));
row("PIL forced + gradient", runsAndItems(P, "conc", base));
console.log(`\nARM-VS-ARM — PIL minus C (the comparative test; base cancels)`);
row("concentration", armVsArm(P, C, "conc"));
row("pass rate", armVsArm(P, C, "rate"));
console.log(`\nSECONDARY — held-out pass-rate lift vs base, runs+items`);
row("C   plain GRPO", runsAndItems(C, "rate", base));
row("PIL forced + gradient", runsAndItems(P, "rate", base));

const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const cC = C.map((m) => 100 * mean(ids.map((i) => m.conc.get(i)! - base.conc.get(i)!)));
const cP = P.map((m) => 100 * mean(ids.map((i) => m.conc.get(i)! - base.conc.get(i)!)));
const pooled = Math.sqrt((sd(cC) ** 2 + sd(cP) ** 2) / 2);
console.log(`\nBETWEEN-RUN SPREAD (sample description at K=3, NOT a tested claim)`);
console.log(`  C   sd ${sd(cC).toFixed(4)}pp   PIL sd ${sd(cP).toFixed(4)}pp   ratio ${(sd(cP) / sd(cC)).toFixed(2)}x`);
console.log(`  F = ${(sd(cP) ** 2 / sd(cC) ** 2).toFixed(2)} on (2,2) df; F crit 0.05 = 19.00 -> CANNOT REJECT equal variances`);
console.log(`\nRUNS NEEDED, one-sample vs 0, 80% power, two-sided 0.05`);
console.log(`  ${"effect".padEnd(10)} ${"n (pooled sd " + pooled.toFixed(2) + "pp)".padEnd(26)} n (PIL sd ${sd(cP).toFixed(2)}pp)`);
for (const d of [1, 2, 3, 5]) {
  const n = (s: number) => Math.ceil(((1.96 + 0.8416) * s / d) ** 2);
  console.log(`  ${(d + "pp").padEnd(10)} ${String(n(pooled)).padEnd(26)} ${n(sd(cP))}`);
}
console.log(`  Arm-vs-arm needs ~2x these. sigma is estimated from 3 points, so its own 95%`);
console.log(`  interval is roughly 2-25pp: every n above is a point estimate on an uncertain sigma.`);
