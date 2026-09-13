// IS THE OPENING-CONCENTRATION DROP REAL, OR A COMPOSITION ARTIFACT?
//
// top_first_measure_share is POOLED over every passing completion in the pool. That makes it
// vulnerable to a confound that has nothing to do with diversity: if an arm's extra passes
// land on items whose modal opening differs from the pool's modal opening, the pooled share
// falls even if the policy became no more diverse on any single item.
//
// The item-wise statistic is immune to it. For each item compute the share of that item's
// completions landing on THAT ITEM'S own modal opening, then average over items. Items are
// weighted equally, so shifting which items contribute cannot move it.
//
// Reported over ALL completions (every item contributes the same G, so this is clean) and
// over passing completions only (reported with its item count, since an item with 1 pass has
// a modal share of 1.0 by construction and must not be averaged in naively).
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);
const MIN_PASS = Number(process.env.MIN_PASS ?? 4); // an item needs enough passes to have a share
const firstDeg = (raw: string) => ((parseSpecResponse(raw)[0]?.degrees ?? []) as number[]).join(",") || "(none)";

function analyse(genFile: string, promptsFile: string) {
  if (!existsSync(join(RUNS, genFile))) return null;
  const byId = new Map(readFileSync(join(RUNS, promptsFile), "utf8").trim().split("\n").filter(Boolean)
    .map((l) => JSON.parse(l)).map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
  const allShares: number[] = [], passShares: number[] = [];
  const poolAll = new Map<string, number>(), poolPass = new Map<string, number>();
  let nAll = 0, nPass = 0, itemsWithEnough = 0;
  for (const l of readFileSync(join(RUNS, genFile), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    const hA = new Map<string, number>(), hP = new Map<string, number>();
    let p = 0;
    for (const raw of r.completions) {
      const d = firstDeg(raw);
      hA.set(d, (hA.get(d) ?? 0) + 1);
      poolAll.set(d, (poolAll.get(d) ?? 0) + 1); nAll++;
      if (scoreVoicing(prog, raw, VOICES, STYLE).correct) {
        p++; hP.set(d, (hP.get(d) ?? 0) + 1);
        poolPass.set(d, (poolPass.get(d) ?? 0) + 1); nPass++;
      }
    }
    allShares.push(Math.max(...hA.values()) / r.completions.length);
    if (p >= MIN_PASS) { passShares.push(Math.max(...hP.values()) / p); itemsWithEnough++; }
  }
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const pooled = (h: Map<string, number>, n: number) => (n ? Math.max(...h.values()) / n : NaN);
  return {
    itemwiseAll: mean(allShares), itemwisePass: mean(passShares), itemsWithEnough,
    pooledAll: pooled(poolAll, nAll), pooledPass: pooled(poolPass, nPass), nPass,
  };
}

for (const [tag, pool, prompts] of [
  ["HELD-OUT", "heldout", "prompts-heldout-v1.jsonl"],
  ["TRAINED", "trained", "prompts-trained-v1.jsonl"],
] as const) {
  console.log(`\n=== ${tag} POOL ===`);
  console.log(`${"arm".padEnd(6)} ${"POOLED all".padEnd(12)} ${"ITEMWISE all".padEnd(14)} ${"POOLED pass".padEnd(13)} ${"ITEMWISE pass".padEnd(15)} items>=${MIN_PASS} passes`);
  for (const a of ["base", "A", "B", "C", "D"]) {
    const s = analyse(`mc-${pool}-${a}.jsonl`, prompts);
    if (!s) continue;
    console.log(
      `${a.padEnd(6)} ${s.pooledAll.toFixed(3).padEnd(12)} ${s.itemwiseAll.toFixed(3).padEnd(14)} ` +
      `${s.pooledPass.toFixed(3).padEnd(13)} ${(isNaN(s.itemwisePass) ? "-" : s.itemwisePass.toFixed(3)).padEnd(15)} ${s.itemsWithEnough}`
    );
  }
}
console.log("\nITEMWISE is the one immune to composition: equal weight per item, so a change in");
console.log("WHICH items pass cannot move it. If itemwise tracks pooled, the drop is real diversity.");
console.log("If pooled falls and itemwise does not, the pooled drop was a change in item mix.");
