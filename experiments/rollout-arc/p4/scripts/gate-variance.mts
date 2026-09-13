// WHERE DOES THE PER-ITEM VARIANCE COME FROM, and what would a bigger eval buy?
//
// The gate's power is set by the paired per-item sd. That sd has two parts and they have
// very different prices:
//
//   measurement   each item's pass rate is k/G over G=16 completions, so it carries
//                 binomial noise p(1-p)/G. This part is bought down by generating more,
//                 and generation is FREE on the desk.
//   heterogeneity items genuinely differ in how much the arm helps them. This part is a
//                 property of the pool and no amount of generation touches it.
//
// If the sd is mostly measurement, the underpowered gate is a FREE fix and the kickoff's
// rule can be run as written at a G where it can actually pass. If it is mostly
// heterogeneity, generating more buys nothing and the rule has to change instead.
//
// E[p_hat(1-p_hat)] = ((G-1)/G) p(1-p), so p_hat(1-p_hat)/(G-1) is an unbiased estimate of
// Var(p_hat). Completions are independent draws from one prompt at temperature 1.0, so the
// binomial form is the right one here.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);

function perItem(gen: string, prompts: string) {
  if (!existsSync(join(RUNS, gen))) return null;
  const byId = new Map(
    readFileSync(join(RUNS, prompts), "utf8").trim().split("\n").map((l) => JSON.parse(l))
      .map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression])
  );
  const out = new Map<string, { p: number; g: number }>();
  for (const l of readFileSync(join(RUNS, gen), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId);
    if (!prog) continue;
    let k = 0;
    for (const c of r.completions) if (scoreVoicing(prog, c, VOICES, STYLE).correct) k++;
    out.set(r.itemId, { p: k / r.completions.length, g: r.completions.length });
  }
  return out;
}

function erf(x: number) {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

const base = perItem("mc-heldout-base.jsonl", "prompts-heldout-v1.jsonl")!;
const c = perItem("mc-heldout-C.jsonl", "prompts-heldout-v1.jsonl")!;
const ids = [...base.keys()].filter((k) => c.has(k));
const G = base.get(ids[0]!)!.g;

const d = ids.map((k) => c.get(k)!.p - base.get(k)!.p);
const n = d.length;
const mean = d.reduce((a, b) => a + b, 0) / n;
const vObs = d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);

// measurement variance of the DIFFERENCE = the two arms' sampling variances added
const vMeas = ids.reduce((a, k) => {
  const pb = base.get(k)!.p, pc = c.get(k)!.p;
  return a + pb * (1 - pb) / (G - 1) + pc * (1 - pc) / (G - 1);
}, 0) / n;
const vHet = Math.max(0, vObs - vMeas);

console.log(`\n=== per-item variance of the C-vs-base lift, held-out pool, G=${G}, n=${n} ===`);
console.log(`  observed total        sd ${(100 * Math.sqrt(vObs)).toFixed(2)}pp   var ${vObs.toExponential(3)}`);
console.log(`  measurement (binomial) sd ${(100 * Math.sqrt(vMeas)).toFixed(2)}pp   var ${vMeas.toExponential(3)}   ${(100 * vMeas / vObs).toFixed(0)}% of total`);
console.log(`  heterogeneity (residual) sd ${(100 * Math.sqrt(vHet)).toFixed(2)}pp  var ${vHet.toExponential(3)}   ${(100 * vHet / vObs).toFixed(0)}% of total`);
console.log(`\n  ^ the heterogeneity floor is what NO amount of extra generation can remove.`);

console.log(`\n=== what raising G at eval buys — power against a TRUE effect of 2.0pp ===`);
console.log("   G    paired sd     se     excludes 0 above   P(one seed)  P(BOTH of two)   eval cost vs G=16");
for (const gp of [16, 32, 64, 128, 256]) {
  const sd = Math.sqrt(vHet + vMeas * (G - 1) / (gp - 1));
  const se = sd / Math.sqrt(n);
  const mde = 1.96 * se;
  const p1 = Phi((0.02 - mde) / se);
  console.log(
    `${String(gp).padStart(5)}` +
    `${(100 * sd).toFixed(2).padStart(11)}pp` +
    `${(100 * se).toFixed(2).padStart(8)}pp` +
    `${(100 * mde).toFixed(2).padStart(15)}pp` +
    `${(100 * p1).toFixed(0).padStart(13)}%` +
    `${(100 * p1 * p1).toFixed(0).padStart(15)}%` +
    `${(gp / 16).toFixed(0).padStart(16)}x`
  );
}
console.log(`\n  (the G=16 row reproduces the gate-power.mts figures, as a cross-check)`);
