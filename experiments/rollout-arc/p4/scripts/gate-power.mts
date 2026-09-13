// How much power does the GATE's pre-committed rule actually have?
//
// The kickoff fixes the reading as: "both seeds lift on the held-out pool with intervals
// excluding zero" -> HOLDS, and "either seed's held-out interval includes zero" -> the
// +2.0pp is a single-seed artifact and the settled table is void.
//
// That rule is only a fair test if it could PASS when the effect is real. This computes
// its power from the MEASURED per-item paired sd in the seed-7 receipts already on disk,
// before any replication run exists -- the same discipline power.mts applied to the old
// held-out pool, pointed at the rule the next run will be judged by.
//
// Note the sd here is NOT the ~13pp/item quoted in the kickoff: that figure came from
// power.mts on the SUPERSEDED 32-item held pool for arms A/B. The matched-cell pool has
// its own spread and this reads it from the matched-cell files.
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
  const out = new Map<string, number>();
  for (const l of readFileSync(join(RUNS, gen), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId);
    if (!prog) continue;
    let k = 0;
    for (const c of r.completions) if (scoreVoicing(prog, c, VOICES, STYLE).correct) k++;
    out.set(r.itemId, k / r.completions.length);
  }
  return out;
}

// Abramowitz & Stegun 7.1.26 -- good to 1.5e-7, far past what this needs.
function erf(x: number) {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

for (const [tag, pool, prompts] of [
  ["HELD-OUT POOL — the pool the gate is judged on", "heldout", "prompts-heldout-v1.jsonl"],
  ["TRAINED POOL — secondary", "trained", "prompts-trained-v1.jsonl"],
] as const) {
  const base = perItem(`mc-${pool}-base.jsonl`, prompts);
  const c = perItem(`mc-${pool}-C.jsonl`, prompts);
  if (!base || !c) { console.log(`\n=== ${tag} ===\n  (receipts missing)`); continue; }
  const ids = [...base.keys()].filter((k) => c.has(k));
  const d = ids.map((k) => c.get(k)! - base.get(k)!);
  const n = d.length;
  const mean = d.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  const mde = 1.96 * se;

  console.log(`\n=== ${tag} ===`);
  console.log(`  arm C (seed 7) vs base: lift ${(100 * mean).toFixed(1)}pp, paired sd ${(100 * sd).toFixed(1)}pp, se ${(100 * se).toFixed(2)}pp, n=${n} items`);
  console.log(`  an interval excludes zero when the estimate exceeds ${(100 * mde).toFixed(2)}pp`);
  console.log(`  to reach 80% power on a single seed you need a true effect of ${(100 * (1.96 + 0.8416) * se).toFixed(2)}pp`);
  console.log("\n  true effect   P(one seed excludes 0)   P(BOTH of two do)   P(pooled-of-2 does)");
  console.log("                                                            all-noise / all-item");
  for (const tau of [0.010, 0.015, 0.020, 0.025, 0.030, 0.040, 0.050]) {
    const p1 = Phi((tau - mde) / se);
    // Pooling two runs per item averages away the RUN-specific component only. The split
    // between item-level heterogeneity and run noise is not identifiable from one seed, so
    // both bounds are reported rather than a single number chosen by assumption.
    const seLo = se / Math.SQRT2;               // all variance is run noise
    const pPoolHi = Phi((tau - 1.96 * seLo) / seLo);
    const pPoolLo = p1;                          // all variance is item heterogeneity
    console.log(
      `  ${(100 * tau).toFixed(1).padStart(7)}pp` +
      `${(100 * p1).toFixed(0).padStart(18)}%` +
      `${(100 * p1 * p1).toFixed(0).padStart(20)}%` +
      `${(100 * pPoolLo).toFixed(0).padStart(17)}% / ${(100 * pPoolHi).toFixed(0)}%`
    );
  }
}
console.log(
  "\nRead the 2.0pp row: it is the seed-7 point estimate, i.e. the power the rule has\n" +
  "against the very effect it was written to replicate."
);
