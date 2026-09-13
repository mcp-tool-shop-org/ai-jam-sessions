// P4 substrate probe, stage 3 — score every voicing through the real counterpoint
// verifier. No model in the loop.
//
// Reported under ALL THREE existing style presets, not the one that lands in the
// band. The presets are pre-existing and musically motivated (Session 2): each
// names an idiom and the rules that idiom genuinely relaxes. Picking among them by
// the rate they produce would be the move ABC-VALIDATOR-SPEC.md forbids.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRealizationResponse, verifyVoiceLeading } from "../../../../src/compose/index.js";

const runs = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const prompts = readFileSync(join(runs, "vl-prompts.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const byId = new Map(prompts.map((p) => [p.itemId, p]));
const rows = readFileSync(join(runs, process.argv[2] ?? "vl-g8.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const STYLES = ["common-practice", "lead-sheet", "film-ambient"] as const;

function wilson(k: number, n: number): [number, number] {
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z / d) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

const perStyle: Record<string, number[]> = {};
for (const s of STYLES) perStyle[s] = [];
const distinctExact: number[] = [];
const distinctVoicings: number[] = [];
const entropies: number[] = [];
let G = 0;
let completions = 0;

for (const r of rows) {
  const item = byId.get(r.itemId);
  if (!item) throw new Error(`no prompt for ${r.itemId}`);
  G = r.completions.length;
  completions += G;
  distinctExact.push(r.distinct_exact);
  if (typeof r.mean_entropy === "number") entropies.push(r.mean_entropy);

  // Semantic diversity: how many DISTINCT voicing sequences, ignoring JSON
  // formatting. Two completions differing by one measure count as two here and as
  // two under exact match, but whitespace-only differences collapse.
  const sigs = new Set<string>();
  const kByStyle: Record<string, number> = {};
  for (const s of STYLES) kByStyle[s] = 0;

  for (const raw of r.completions as string[]) {
    const real = parseRealizationResponse(raw, item.progression);
    sigs.add(real.frames.map((f) => f.voices.join(",")).join("|"));
    for (const style of STYLES) {
      if (verifyVoiceLeading(real, { style }).admitted) kByStyle[style]++;
    }
  }
  distinctVoicings.push(sigs.size);
  for (const s of STYLES) perStyle[s]!.push(kByStyle[s]!);
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const summary: Record<string, unknown> = {
  groups: rows.length,
  G,
  completions,
  distinct_spans_exact: Number(mean(distinctExact).toFixed(3)),
  distinct_voicing_sequences: Number(mean(distinctVoicings).toFixed(3)),
  mean_entropy: entropies.length ? Number(mean(entropies).toFixed(5)) : null,
};

for (const style of STYLES) {
  const ks = perStyle[style]!;
  const passes = ks.reduce((a, b) => a + b, 0);
  const p = passes / completions;
  const nd = ks.filter((k) => k > 0 && k < G).length;
  const m = mean(ks), pg = m / G;
  const v = ks.reduce((a, b) => a + (b - m) ** 2, 0) / ks.length;
  const vb = G * pg * (1 - pg);
  const rho = vb > 0 ? (v / vb - 1) / (G - 1) : NaN;
  const ci = wilson(passes, completions);
  summary[style] = {
    single_shot: Number(p.toFixed(4)),
    ci95: [Number(ci[0].toFixed(4)), Number(ci[1].toFixed(4))],
    non_degenerate: `${nd}/${ks.length} = ${(nd / ks.length).toFixed(3)}`,
    rho: Number(rho.toFixed(3)),
    effective_draws: Number((G / (1 + (G - 1) * rho)).toFixed(2)),
    k_hist: ks.reduce<Record<number, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {}),
  };
}

writeFileSync(join(runs, "vl-probe-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
