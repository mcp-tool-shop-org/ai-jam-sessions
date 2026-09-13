// Substrate probe, stage 3 — score every completion through the REAL E-R gate.
//
// abc text → parseAbcChords → renderReharmonization (voicer) → scoreERProposal.
// No model in the loop. The gate is graded on musical substance, not format:
// renderReharmonization makes chord fidelity true by construction, so what
// actually binds is CONSONANCE (does the melody sit on the proposed chords) and
// NON-TRIVIALITY (≥ 1/3 of measures must differ from the source harmony).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAbcChords } from "../../../../src/maker/abc-chord-proposer.js";
import { renderReharmonization } from "../../../../src/maker/voicer.js";
import { scoreERProposal, type ERItem } from "../../../../src/maker/er-gate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const runs = join(__dirname, "..", "runs");
const gensPath = process.argv[2] ?? join(runs, "er-g8.jsonl");

const items: ERItem[] = JSON.parse(readFileSync(join(runs, "er-items.json"), "utf8"));
const byId = new Map(items.map((i) => [i.itemId, i]));
const rows = readFileSync(gensPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

type Cell = { passes: boolean; verified: boolean; consonance: boolean; nonTrivial: boolean; chords: number; wellFormedAbc: boolean; strict: boolean };

/** Is the tune body actually ABC, or did the model paste the melody table back?
 *  The prompt asks for a LEAD SHEET; the frozen gate never checks that it got one,
 *  because parseAbcChords reads only the quoted chord symbols. Melody-table rows
 *  carry pitch stacks (C4+E4) and duration suffixes (:w :h :q :e :s :qt), which
 *  never appear in ABC note syntax. */
function wellFormedAbc(abc: string): boolean {
  const body = abc.split(/K:[^\n]*\n/)[1] ?? abc;
  if (!body.includes("|")) return false;
  return !/[A-G]#?\d\+|:(w|h|q|e|s|qt|ht|et)/.test(body);
}
const groups: Array<{ itemId: string; G: number; distinct: number; entropy: number | null; cells: Cell[] }> = [];

for (const r of rows) {
  const item = byId.get(r.itemId);
  if (!item) throw new Error(`no item for ${r.itemId}`);
  const measureNumbers = item.sourceChords.map((s) => s.measure);
  const cells: Cell[] = r.completions.map((abc: string) => {
    const chords = parseAbcChords(abc, measureNumbers);
    const rehar = renderReharmonization(chords, { rootOctave: 2 });
    const s = scoreERProposal(item, { measures: rehar, status: rehar.length ? "clean" : "unrecoverable" });
    const wf = wellFormedAbc(abc);
    return {
      passes: s.passes, verified: s.verified,
      consonance: s.consonance.pass, nonTrivial: s.nonTriviality.passes,
      chords: chords.length, wellFormedAbc: wf, strict: s.passes && wf,
    };
  });
  groups.push({ itemId: r.itemId, G: cells.length, distinct: r.distinct_exact, entropy: r.mean_entropy, cells });
}

const all = groups.flatMap((g) => g.cells);
const n = all.length;
const rate = (f: (c: Cell) => boolean) => all.filter(f).length / n;
function wilson(k: number, m: number) {
  const z = 1.96, p = k / m, d = 1 + (z * z) / m;
  const c = (p + (z * z) / (2 * m)) / d, h = (z / d) * Math.sqrt((p * (1 - p)) / m + (z * z) / (4 * m * m));
  return [Math.max(0, c - h), Math.min(1, c + h)] as const;
}
const passK = all.filter((c) => c.passes).length;
const ci = wilson(passK, n);

const G = groups[0]!.G;
const ks = groups.map((g) => g.cells.filter((c) => c.passes).length);
const ksStrict = groups.map((g) => g.cells.filter((c) => c.strict).length);
const ndStrict = ksStrict.filter((k) => k > 0 && k < G).length;
const meanS = ksStrict.reduce((a, b) => a + b, 0) / ksStrict.length, pS = meanS / G;
const vS = ksStrict.reduce((a, b) => a + (b - meanS) ** 2, 0) / ksStrict.length, vbS = G * pS * (1 - pS);
const rhoS = vbS > 0 ? (vS / vbS - 1) / (G - 1) : NaN;
const strictK = all.filter((c) => c.strict).length;
const ciS = wilson(strictK, n);
const nd = ks.filter((k) => k > 0 && k < G).length;
const mean = ks.reduce((a, b) => a + b, 0) / ks.length, p = mean / G;
const v = ks.reduce((a, b) => a + (b - mean) ** 2, 0) / ks.length, vb = G * p * (1 - p);
const ratio = vb > 0 ? v / vb : NaN, rho = (ratio - 1) / (G - 1);
const distinct = groups.reduce((a, g) => a + g.distinct, 0) / groups.length;
const ents = groups.map((g) => g.entropy).filter((e): e is number => typeof e === "number");

const summary = {
  groups: groups.length, G, completions: n,
  distinct_spans_mean: Number(distinct.toFixed(3)),
  mean_entropy: ents.length ? Number((ents.reduce((a, b) => a + b, 0) / ents.length).toFixed(5)) : null,
  gates: {
    chords_parsed: Number(rate((c) => c.chords > 0).toFixed(4)),
    consonance: Number(rate((c) => c.consonance).toFixed(4)),
    non_trivial: Number(rate((c) => c.nonTrivial).toFixed(4)),
    verified: Number(rate((c) => c.verified).toFixed(4)),
    full_gate_single_shot: Number((passK / n).toFixed(4)),
    wellformed_abc: Number(rate((c) => c.wellFormedAbc).toFixed(4)),
    strict_gate_single_shot: Number(rate((c) => c.strict).toFixed(4)),
  },
  full_gate_ci95: [Number(ci[0].toFixed(4)), Number(ci[1].toFixed(4))],
  k_of_G: ks.slice().sort((a, b) => a - b),
  non_degenerate: `${nd}/${ks.length} = ${(nd / ks.length).toFixed(3)}`,
  rho: Number(rho.toFixed(3)),
  effective_draws: Number((G / (1 + (G - 1) * rho)).toFixed(2)),
  strict: {
    single_shot: Number((strictK / n).toFixed(4)),
    ci95: [Number(ciS[0].toFixed(4)), Number(ciS[1].toFixed(4))],
    k_of_G: ksStrict.slice().sort((a, b) => a - b),
    non_degenerate: `${ndStrict}/${ksStrict.length} = ${(ndStrict / ksStrict.length).toFixed(3)}`,
    rho: Number(rhoS.toFixed(3)),
    effective_draws: Number((G / (1 + (G - 1) * rhoS)).toFixed(2)),
  },
};
writeFileSync(join(runs, "er-probe-summary.json"), JSON.stringify({ summary, groups }, null, 2));
console.log(JSON.stringify(summary, null, 2));
