// Is p = 0.4492 achieved by DIVERSE passing strategies, or by one degenerate
// strategy that happens to satisfy the verifier?
//
// Raised by external brief 012's reviewer as the strongest reason the P4 numbers
// could still be wrong: "you proved the inputs are static and the verifier is
// deterministic, but you haven't proved the outputs are diverse." A p that is
// mathematically true and practically useless would look exactly like ours.
//
// No model in the loop; reads the committed completions.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const prompts = readFileSync(join(RUNS, "spec-prompts-v2-random.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));
const byId = new Map(prompts.map((p) => [p.itemId, p.progression]));
const rows = readFileSync(join(RUNS, "spec-g8-v2-random.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));

/** The degree pattern the model chose, per measure, as a comparable signature. */
const sig = (raw: string) =>
  parseSpecResponse(raw)
    .map((s: { degrees?: number[] }) => (s.degrees ?? []).join(""))
    .join("|");

const passingSigs: string[] = [];
const failingSigs: string[] = [];
const perGroupPassingDistinct: number[] = [];
const firstDegreeHist = new Map<string, number>();

for (const r of rows) {
  const prog = byId.get(r.itemId);
  const pass: string[] = [];
  for (const raw of r.completions as string[]) {
    const s = scoreVoicing(prog, raw, 2, "film-ambient");
    const g = sig(raw);
    if (s.correct) {
      pass.push(g);
      passingSigs.push(g);
      const first = parseSpecResponse(raw)[0];
      const key = (first?.degrees ?? []).join(",") || "(none)";
      firstDegreeHist.set(key, (firstDegreeHist.get(key) ?? 0) + 1);
    } else {
      failingSigs.push(g);
    }
  }
  if (pass.length) perGroupPassingDistinct.push(new Set(pass).size / pass.length);
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`passing completions      : ${passingSigs.length}`);
console.log(`distinct passing sigs    : ${new Set(passingSigs).size} (${((100 * new Set(passingSigs).size) / passingSigs.length).toFixed(1)}% unique)`);
console.log(`distinct failing sigs    : ${new Set(failingSigs).size} of ${failingSigs.length} (${((100 * new Set(failingSigs).size) / failingSigs.length).toFixed(1)}% unique)`);
console.log(`within-group uniqueness  : ${mean(perGroupPassingDistinct).toFixed(3)} (1.0 = every passing rollout in a group differs)`);
console.log(`\nmost common FIRST-measure degree choice among passers:`);
for (const [k, v] of [...firstDegreeHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  console.log(`  [${k}] ${v} (${((100 * v) / passingSigs.length).toFixed(1)}%)`);
}
const top = Math.max(...firstDegreeHist.values()) / passingSigs.length;
console.log(
  `\nverdict: ${top > 0.8 ? "COLLAPSED — passers share one strategy" : top > 0.5 ? "SKEWED — one strategy dominates" : "DIVERSE — no single strategy dominates"}`
);
