// Does exploring starts break GRPO's group-relative advantage?
//
// GRPO's advantage is valid because all G rollouts in a group share a prompt: they
// are comparable draws from one conditioning. Forcing a DIFFERENT opening per rollout
// makes the group 16 different conditioning contexts. If some openings are much easier
// to complete than others, the within-group advantage encodes WHICH OPENING THE
// ROLLOUT WAS HANDED rather than how well it completed — the nuisance-variable problem,
// reintroduced inside the group instead of across prompts.
//
// This throws no error and the headline metrics look excellent (non-degeneracy 0.9375).
// Measure the spread of pass rate by forced opening: flat means the groups stay
// comparable, skewed means the advantage is partly grading the prefix.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const prompts = readFileSync(join(RUNS, "spec-prompts-4bar-random.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));
const byId = new Map(prompts.map((p) => [p.itemId, p.progression]));
const rows = readFileSync(join(RUNS, "spec-4bar-explore.jsonl"), "utf8")
  .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const openingRe = /"degrees":\s*\[(\d+),\s*(\d+)\]/;
const stats = new Map<string, { n: number; pass: number }>();

for (const r of rows) {
  const prog = byId.get(r.itemId);
  if (!prog) continue;
  (r.completions as string[]).forEach((raw, i) => {
    const m = openingRe.exec((r.prefixes as string[])[i] ?? "");
    if (!m) return;
    const key = `${m[1]},${m[2]}`;
    const s = scoreVoicing(prog, raw, 2, "common-practice");
    const cur = stats.get(key) ?? { n: 0, pass: 0 };
    cur.n++;
    if (s.correct) cur.pass++;
    stats.set(key, cur);
  });
}

const rowsOut = [...stats.entries()]
  .map(([k, v]) => ({ opening: k, n: v.n, pass: v.pass, rate: v.pass / v.n }))
  .sort((a, b) => b.rate - a.rate);

console.log("pass rate by FORCED opening (2 voices, common-practice, 4 bars):");
for (const r of rowsOut) {
  const bar = "#".repeat(Math.round(r.rate * 40));
  console.log(`  [${r.opening}]  ${r.pass.toString().padStart(2)}/${r.n}  ${r.rate.toFixed(3)}  ${bar}`);
}
const rates = rowsOut.map((r) => r.rate);
const max = Math.max(...rates), min = Math.min(...rates);
const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
const sd = Math.sqrt(rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length);
console.log(`\nspread: min ${min.toFixed(3)} max ${max.toFixed(3)} range ${(max - min).toFixed(3)} sd ${sd.toFixed(3)}`);
console.log(
  max - min > 0.4
    ? "SEVERE — the opening largely determines the reward; within-group advantage would grade the prefix"
    : max - min > 0.2
      ? "MATERIAL — opening difficulty is a real nuisance term inside the group"
      : "MILD — openings are roughly interchangeable; group comparability mostly holds"
);
