// Score the curriculum cell: common-practice, 4 bars, G=16.
//
// Reports the funnel ALONGSIDE the split rate, per CURRICULUM-PREREG.md. The 8-bar
// film-ambient cell hid a defect the top-line numbers could not show: 80% of
// passing completions opened on the identical [0,1] voicing, and passers were LESS
// diverse than failures. A split rate achieved by one dominant strategy is not a
// pass, and reading 2 of the prereg says so before this data existed.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);
const promptsFile = process.argv[3] ?? "spec-prompts-4bar-random.jsonl";
const genFile = process.argv[2] ?? "spec-4bar-g16.jsonl";

const prompts = readFileSync(join(RUNS, promptsFile), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const byId = new Map(prompts.map((p) => [p.itemId, p.progression]));
const rows = readFileSync(join(RUNS, genFile), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const sig = (raw: string) =>
  parseSpecResponse(raw).map((s: { degrees?: number[] }) => (s.degrees ?? []).join("")).join("|");
const firstDeg = (raw: string) => ((parseSpecResponse(raw)[0]?.degrees ?? []) as number[]).join(",") || "(none)";

const ks: number[] = [];
const passSigs: string[] = [];
const failSigs: string[] = [];
const withinGroupUniq: number[] = [];
const firstHist = new Map<string, number>();
const entropies: number[] = [];
const distinct: number[] = [];
let G = 0;
let completions = 0;

for (const r of rows) {
  const prog = byId.get(r.itemId);
  if (!prog) throw new Error(`no progression for ${r.itemId}`);
  G = r.completions.length;
  completions += G;
  distinct.push(r.distinct_exact);
  if (typeof r.mean_entropy === "number") entropies.push(r.mean_entropy);
  const pass: string[] = [];
  let k = 0;
  for (const raw of r.completions as string[]) {
    const s = scoreVoicing(prog, raw, VOICES, STYLE);
    if (s.correct) {
      k++;
      pass.push(sig(raw));
      passSigs.push(sig(raw));
      firstHist.set(firstDeg(raw), (firstHist.get(firstDeg(raw)) ?? 0) + 1);
    } else {
      failSigs.push(sig(raw));
    }
  }
  ks.push(k);
  if (pass.length) withinGroupUniq.push(new Set(pass).size / pass.length);
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const n = ks.length;
const nd = ks.filter((k) => k > 0 && k < G).length;
const p = ks.reduce((a, b) => a + b, 0) / completions;
const m = mean(ks);
const v = ks.reduce((a, b) => a + (b - m) ** 2, 0) / n;
const vb = G * p * (1 - p);
const rho = vb > 0 ? (v / vb - 1) / (G - 1) : NaN;
function wilson(k: number, t: number) {
  const z = 1.96, ph = k / t, d = 1 + (z * z) / t;
  const c = (ph + (z * z) / (2 * t)) / d;
  const h = (z / d) * Math.sqrt((ph * (1 - ph)) / t + (z * z) / (4 * t * t));
  return [Math.max(0, c - h), Math.min(1, c + h)] as const;
}
const topFirst = firstHist.size ? Math.max(...firstHist.values()) / passSigs.length : 0;
const ciP = wilson(ks.reduce((a, b) => a + b, 0), completions);
const ciN = wilson(nd, n);

const summary = {
  cell: `${STYLE}, ${VOICES} voices, 4 bars, G=${G}`,
  groups: n,
  completions,
  single_shot_p: Number(p.toFixed(4)),
  p_ci95: [Number(ciP[0].toFixed(4)), Number(ciP[1].toFixed(4))],
  non_degenerate: `${nd}/${n} = ${(nd / n).toFixed(4)}`,
  nd_ci95: [Number(ciN[0].toFixed(3)), Number(ciN[1].toFixed(3))],
  rho: Number(rho.toFixed(3)),
  effective_draws: Number((G / (1 + (G - 1) * rho)).toFixed(2)),
  k_hist: ks.reduce<Record<number, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {}),
  distinct_spans_mean: Number(mean(distinct).toFixed(3)),
  mean_entropy: entropies.length ? Number(mean(entropies).toFixed(5)) : null,
  funnel: {
    passing: passSigs.length,
    distinct_passing_sigs: new Set(passSigs).size,
    passing_unique_pct: Number(((100 * new Set(passSigs).size) / Math.max(1, passSigs.length)).toFixed(1)),
    failing_unique_pct: Number(((100 * new Set(failSigs).size) / Math.max(1, failSigs.length)).toFixed(1)),
    within_group_uniqueness: Number(mean(withinGroupUniq).toFixed(3)),
    top_first_measure_share: Number(topFirst.toFixed(3)),
    first_measure_hist: [...firstHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
  },
  prereg_reading:
    nd / n > 0.5 && topFirst < 0.5
      ? "1 TRAINABLE"
      : topFirst > 0.7
        ? "2 SPLIT BUT COLLAPSED — not a pass"
        : nd / n < 0.25
          ? "3 BELOW BAND"
          : "AMBIGUOUS — between readings",
};

writeFileSync(join(RUNS, "curriculum-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
