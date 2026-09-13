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
// Which run to read. The heterogeneous run (default) measures opening difficulty
// with the opening varying INSIDE the group; the same-opening run measures it with
// the opening as the group identity. Two independent estimates of the same nuisance
// term, and they should agree.
const GEN_FILE = process.argv[2] ?? "spec-4bar-explore.jsonl";
const rows = readFileSync(join(RUNS, GEN_FILE), "utf8")
  .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const openingRe = /"degrees":\s*\[(\d+),\s*(\d+)\]/;
const stats = new Map<string, { n: number; pass: number; items: Set<string> }>();

for (const r of rows) {
  const prog = byId.get(r.itemId);
  if (!prog) continue;
  (r.completions as string[]).forEach((raw, i) => {
    const m = openingRe.exec((r.prefixes as string[])[i] ?? "");
    if (!m) return;
    const key = `${m[1]},${m[2]}`;
    const s = scoreVoicing(prog, raw, 2, "common-practice");
    const cur = stats.get(key) ?? { n: 0, pass: 0, items: new Set<string>() };
    cur.n++;
    cur.items.add(r.itemId as string);
    if (s.correct) cur.pass++;
    stats.set(key, cur);
  });
}

const rowsOut = [...stats.entries()]
  .map(([k, v]) => ({ opening: k, n: v.n, pass: v.pass, rate: v.pass / v.n, items: v.items.size }))
  .sort((a, b) => b.rate - a.rate);

console.log(`pass rate by FORCED opening (2 voices, common-practice, 4 bars) -- ${GEN_FILE}:`);
for (const r of rowsOut) {
  const bar = "#".repeat(Math.round(r.rate * 40));
  console.log(`  [${r.opening}]  ${r.pass.toString().padStart(2)}/${r.n}  ${r.rate.toFixed(3)}  ${bar}`);
}
const rates = rowsOut.map((r) => r.rate);
const max = Math.max(...rates), min = Math.min(...rates);
const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
const sd = Math.sqrt(rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length);
console.log(`\nspread: min ${min.toFixed(3)} max ${max.toFixed(3)} range ${(max - min).toFixed(3)} sd ${sd.toFixed(3)}`);
// DESIGN GUARD, and it is not a nicety: this script assumes a CROSSED design, where
// every item contributes a rollout to every opening so item difficulty averages out.
// Run against the same-opening file each opening is backed by 2 items instead of 32,
// the opening effect is fully confounded with those items, and the spread nearly
// doubles (0.344 -> 0.688) while the script prints a confident verdict either way.
// A number that is wrong for a knowable reason is worse than no number.
const minItems = Math.min(...rowsOut.map((r) => r.items));
const CROSSED_MIN_ITEMS = 8;
if (minItems < CROSSED_MIN_ITEMS) {
  console.log(
    `
NO VERDICT — this design is not crossed: the thinnest opening is backed by only ` +
      `${minItems} distinct item(s) (needs >= ${CROSSED_MIN_ITEMS}). The spread above is ` +
      `opening difficulty CONFOUNDED with those items' difficulty and is not comparable to ` +
      `a crossed run. Use a file where every item contributes to every opening.`
  );
} else {
  console.log(
    max - min > 0.4
      ? "SEVERE — the opening largely determines the reward; within-group advantage would grade the prefix"
      : max - min > 0.2
        ? "MATERIAL — opening difficulty is a real nuisance term inside the group"
        : "MILD — openings are roughly interchangeable; group comparability mostly holds"
  );
}
