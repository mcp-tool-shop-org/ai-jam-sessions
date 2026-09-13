// P4 substrate probe — score the SPEC realizer's voicings through the real
// counterpoint verifier.
//
// The spec path is the one the repo actually uses: the model emits DEGREES (which
// chord note each voice takes), so chordMembership is true by construction. The
// direct-pitch path admits ~0 at every style because the model adds non-chord
// tones — a defect Session 2 already retired, not a musical difficulty.
//
// Reported under all three existing style presets, never the one that lands best.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse, renderSpecRealization, verifyVoiceLeading } from "../../../../src/compose/index.js";

const runs = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const prompts = readFileSync(join(runs, "spec-prompts.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const byId = new Map(prompts.map((p) => [p.itemId, p]));
const rows = readFileSync(join(runs, process.argv[2] ?? "spec-g8.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const VOICES = Number(process.env.VOICES ?? 4);

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
const failCounts = new Map<string, number>();
let G = 0, completions = 0, unparsed = 0;

for (const r of rows) {
  const item = byId.get(r.itemId);
  if (!item) throw new Error(`no prompt for ${r.itemId}`);
  G = r.completions.length;
  completions += G;
  distinctExact.push(r.distinct_exact);
  if (typeof r.mean_entropy === "number") entropies.push(r.mean_entropy);

  const sigs = new Set<string>();
  const kByStyle: Record<string, number> = {};
  for (const s of STYLES) kByStyle[s] = 0;

  for (const raw of r.completions as string[]) {
    const specs = parseSpecResponse(raw);
    if (!specs.length) unparsed++;
    const real = renderSpecRealization(item.progression, specs, VOICES);
    sigs.add(real.frames.map((f) => f.voices.join(",")).join("|"));
    for (const style of STYLES) {
      const v = verifyVoiceLeading(real, { style });
      if (v.admitted) kByStyle[style]++;
      else if (style === "common-practice") {
        for (const [rule, res] of Object.entries(v.hardGates)) {
          if (!(res as { pass: boolean }).pass) failCounts.set(rule, (failCounts.get(rule) ?? 0) + 1);
        }
      }
    }
  }
  distinctVoicings.push(sigs.size);
  for (const s of STYLES) perStyle[s]!.push(kByStyle[s]!);
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const summary: Record<string, unknown> = {
  path: "spec (degrees — membership by construction)",
  groups: rows.length,
  G,
  completions,
  unparsed,
  distinct_spans_exact: Number(mean(distinctExact).toFixed(3)),
  distinct_voicing_sequences: Number(mean(distinctVoicings).toFixed(3)),
  mean_entropy: entropies.length ? Number(mean(entropies).toFixed(5)) : null,
  common_practice_failing_rules: [...failCounts.entries()].sort((a, b) => b[1] - a[1]),
};

for (const style of STYLES) {
  const ks = perStyle[style]!;
  const passes = ks.reduce((a, b) => a + b, 0);
  const nd = ks.filter((k) => k > 0 && k < G).length;
  const m = mean(ks), pg = m / G;
  const v = ks.reduce((a, b) => a + (b - m) ** 2, 0) / ks.length;
  const vb = G * pg * (1 - pg);
  const rho = vb > 0 ? (v / vb - 1) / (G - 1) : NaN;
  const ci = wilson(passes, completions);
  summary[style] = {
    single_shot: Number((passes / completions).toFixed(4)),
    ci95: [Number(ci[0].toFixed(4)), Number(ci[1].toFixed(4))],
    non_degenerate: `${nd}/${ks.length} = ${(nd / ks.length).toFixed(3)}`,
    rho: Number(rho.toFixed(3)),
    effective_draws: Number((G / (1 + (G - 1) * rho)).toFixed(2)),
    k_hist: ks.reduce<Record<number, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {}),
  };
}

writeFileSync(join(runs, "spec-probe-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
