// Power of the GATE AS DESIGNED, computed from the seed-7 receipts before any new run.
//
// The estimator is the ACROSS-RUN mean held-out lift over K local runs of arm C, paired by
// item -- not a conjunction of per-run significance tests (Gelman & Stern 2006; Agarwal
// et al. 2021 arXiv:2108.13264 prescribe interval estimates aggregated over the run
// dimension instead).
//
// Averaging K runs divides the ARM's sampling variance by K. It does NOT touch the base
// eval's variance: one base eval is shared by every comparison, so its noise is common and
// never averages away. That asymmetry is why base is the seat worth upgrading.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
function perItem(gen: string) {
  const byId = new Map(readFileSync(join(RUNS, "prompts-heldout-v1.jsonl"), "utf8").trim().split("\n")
    .map((l) => JSON.parse(l)).map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
  const m = new Map<string, number>();
  for (const l of readFileSync(join(RUNS, gen), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    let k = 0; for (const c of r.completions) if (scoreVoicing(prog, c, 2, "common-practice").correct) k++;
    m.set(r.itemId, k / r.completions.length);
  }
  return m;
}
function erf(x: number) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

const base = perItem("mc-heldout-base.jsonl"), c = perItem("mc-heldout-C.jsonl");
const ids = [...base.keys()].filter((k) => c.has(k)); const n = ids.length, G = 16;
const pq = (m: Map<string, number>) => ids.reduce((a, k) => { const p = m.get(k)!; return a + (G / (G - 1)) * p * (1 - p); }, 0) / n;
const pqB = pq(base), pqA = pq(c);
const d = ids.map((k) => c.get(k)! - base.get(k)!); const mean = d.reduce((a, b) => a + b, 0) / n;
const vObs = d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
const vHet = Math.max(0, vObs - (pqB + pqA) / G);

console.log(`\nheld-out n=${n} - heterogeneity floor sd ${(100 * Math.sqrt(vHet)).toFixed(2)}pp`);
console.log(`seed-7 pod arm C lift ${(100 * mean).toFixed(1)}pp (the magnitude being replicated)\n`);
console.log("ACROSS-RUN mean lift, base and arms both at G=64, K local runs of arm C:");
console.log("   K    se      MDE     P(excludes 0 | true effect 2.0pp)   P(| true 1.5pp)");
for (const K of [1, 2, 3, 4]) {
  const se = Math.sqrt((vHet + pqB / 64 + (pqA / 64) / K) / n), mde = 1.96 * se;
  console.log(`   ${K}  ${(100 * se).toFixed(3)}pp  ${(100 * mde).toFixed(3)}pp` +
    `${(100 * Phi((0.02 - mde) / se)).toFixed(1).padStart(16)}%` +
    `${(100 * Phi((0.015 - mde) / se)).toFixed(1).padStart(17)}%`);
}
console.log("\nFor contrast, the kickoff's rule (BOTH of two seeds independently exclude 0) at G=16:");
const se16 = Math.sqrt((vHet + (pqB + pqA) / 16) / n), p16 = Phi((0.02 - 1.96 * se16) / se16);
console.log(`   se ${(100 * se16).toFixed(3)}pp  MDE ${(100 * 1.96 * se16).toFixed(2)}pp  P(one) ${(100 * p16).toFixed(0)}%  P(both) ${(100 * p16 * p16).toFixed(0)}%`);
