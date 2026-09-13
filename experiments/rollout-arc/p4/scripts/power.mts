// How many held-out ITEMS would it take to see an effect this size?
//
// Every held-out comparison came back "not distinguishable". That is only informative if
// the test could have detected an effect worth caring about, and at n=32 items with the
// per-item spread actually observed, it could not. This computes the requirement from the
// MEASURED paired standard deviation rather than from an assumed one.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const prompts = "spec-prompts-v2-holdout.jsonl";
const byId = new Map(
  readFileSync(join(RUNS, prompts), "utf8").trim().split("\n").map((l) => JSON.parse(l))
    .map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression])
);
const rate = (f: string) => {
  const m = new Map<string, number>();
  for (const l of readFileSync(join(RUNS, f), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    let k = 0; for (const c of r.completions) if (scoreVoicing(prog, c, 2, "common-practice").correct) k++;
    m.set(r.itemId, k / r.completions.length);
  }
  return m;
};
const base = rate("held-base.jsonl");
for (const arm of ["A", "B"]) {
  const a = rate(`held-${arm}.jsonl`);
  const ids = [...base.keys()].filter((k) => a.has(k));
  const d = ids.map((k) => a.get(k)! - base.get(k)!);
  const n = d.length, mean = d.reduce((x, y) => x + y, 0) / n;
  const sd = Math.sqrt(d.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1));
  console.log(`\narm ${arm} vs base — observed lift ${(100 * mean).toFixed(1)}pp, paired sd ${(100 * sd).toFixed(1)}pp over n=${n} items`);
  console.log("  to detect a TRUE effect of   items needed (80% power, two-sided 0.05)");
  for (const delta of [0.02, 0.03, 0.05, 0.07, 0.10]) {
    const need = Math.ceil(((1.96 + 0.8416) * sd / delta) ** 2);
    console.log(`    ${(100 * delta).toFixed(0).padStart(3)}pp` + `${String(need).padStart(28)}`);
  }
}
console.log("\nThe binding constraint is the size of the HELD-OUT POOL, not the arm design.");
