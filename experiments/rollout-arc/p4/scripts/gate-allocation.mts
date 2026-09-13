// Eval is free but not instant. Where should the free GPU hours go?
//
// gate-variance.mts established that 80% of the per-item lift variance at G=16 is binomial
// measurement noise, which extra generation buys down. This prices the options.
//
// THE ASYMMETRY THAT DECIDES IT: every arm is compared against ONE base eval, so the base's
// sampling noise is COMMON to every comparison and never averages away -- not across arms,
// not across seeds. Generations spent on base are therefore reused by every reading in the
// gate, and base generates ~1.8x faster than an adapter arm. Base is the cheap seat.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);
// Measured by the session that ran them: ~11 s/item for base at G=16, ~1.8x for an adapter.
const T_BASE = Number(process.env.T_BASE ?? 11 / 16);
const T_ARM = Number(process.env.T_ARM ?? (1.8 * 11) / 16);

function perItem(gen: string, prompts: string) {
  if (!existsSync(join(RUNS, gen))) return null;
  const byId = new Map(
    readFileSync(join(RUNS, prompts), "utf8").trim().split("\n").map((l) => JSON.parse(l))
      .map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression])
  );
  const out = new Map<string, { p: number; g: number }>();
  for (const l of readFileSync(join(RUNS, gen), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    let k = 0;
    for (const c of r.completions) if (scoreVoicing(prog, c, VOICES, STYLE).correct) k++;
    out.set(r.itemId, { p: k / r.completions.length, g: r.completions.length });
  }
  return out;
}
function erf(x: number) {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}
const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

const base = perItem("mc-heldout-base.jsonl", "prompts-heldout-v1.jsonl")!;
const c = perItem("mc-heldout-C.jsonl", "prompts-heldout-v1.jsonl")!;
const ids = [...base.keys()].filter((k) => c.has(k));
const n = ids.length, G = base.get(ids[0]!)!.g;

// p(1-p) estimated unbiasedly as G/(G-1) * p_hat(1-p_hat), per arm
const pq = (m: Map<string, { p: number }>) =>
  ids.reduce((a, k) => { const p = m.get(k)!.p; return a + (G / (G - 1)) * p * (1 - p); }, 0) / n;
const pqBase = pq(base), pqArm = pq(c);
const d = ids.map((k) => c.get(k)!.p - base.get(k)!.p);
const mean = d.reduce((a, b) => a + b, 0) / n;
const vObs = d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
const vHet = Math.max(0, vObs - (pqBase + pqArm) / G);

const se = (gb: number, ga: number) => Math.sqrt((vHet + pqBase / gb + pqArm / ga) / n);
const power = (gb: number, ga: number, tau: number) => { const s = se(gb, ga); return Phi((tau - 1.96 * s) / s); };
const hours = (gb: number, ga: number, arms: number) => (n * (gb * T_BASE + arms * ga * T_ARM)) / 3600;

console.log(`\nheld-out n=${n} · heterogeneity floor sd ${(100 * Math.sqrt(vHet)).toFixed(2)}pp · base p(1-p) ${pqBase.toFixed(4)} · arm p(1-p) ${pqArm.toFixed(4)}`);
console.log(`\n=== power against a TRUE 2.0pp effect, and the held-out GPU hours to get it ===`);
console.log("  G_base  G_arm      se    MDE    P(one)  P(both of 2)   hours(3 arms)  hours(4 arms)");
const plans: Array<[number, number]> = [
  [16, 16], [32, 32], [64, 64], [128, 64], [256, 64], [128, 128], [256, 128], [512, 128],
];
for (const [gb, ga] of plans) {
  const s = se(gb, ga), p1 = power(gb, ga, 0.02);
  console.log(
    `${String(gb).padStart(7)}${String(ga).padStart(7)}` +
    `${(100 * s).toFixed(2).padStart(9)}pp` +
    `${(100 * 1.96 * s).toFixed(2).padStart(6)}pp` +
    `${(100 * p1).toFixed(0).padStart(8)}%` +
    `${(100 * p1 * p1).toFixed(0).padStart(13)}%` +
    `${hours(gb, ga, 3).toFixed(1).padStart(14)}h` +
    `${hours(gb, ga, 4).toFixed(1).padStart(14)}h`
  );
}
// The POOLED reading: each item's lift averaged over the two replication seeds, then paired
// against base. Averaging halves the ARM sampling noise but leaves the base noise untouched,
// because one base eval is common to both -- which is why base is the seat worth upgrading.
const sePooled = (gb: number, ga: number) => Math.sqrt((vHet + pqBase / gb + pqArm / ga / 2) / n);
console.log(`\n=== the POOLED reading (mean lift over two replication seeds) vs the same 2.0pp ===`);
console.log("  G_base  G_arm      se    MDE    P(pooled excludes 0)");
for (const [gb, ga] of plans) {
  const s = sePooled(gb, ga);
  console.log(
    `${String(gb).padStart(7)}${String(ga).padStart(7)}` +
    `${(100 * s).toFixed(2).padStart(9)}pp` +
    `${(100 * 1.96 * s).toFixed(2).padStart(6)}pp` +
    `${(100 * Phi((0.02 - 1.96 * s) / s)).toFixed(0).padStart(20)}%`
  );
}
const seFloor = Math.sqrt(vHet / n);
const pFloor = Phi((0.02 - 1.96 * seFloor) / seFloor);
console.log(`\n  The floor: with INFINITE generation se is ${(100 * seFloor).toFixed(2)}pp, MDE ${(100 * 1.96 * seFloor).toFixed(2)}pp,`);
console.log(`  P(one seed) ${(100 * pFloor).toFixed(0)}%, P(both of two) ${(100 * pFloor * pFloor).toFixed(0)}%.`);
console.log(`  Heterogeneity is the only thing generation cannot buy, and here it is small.`);
