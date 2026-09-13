// The 2x2 that the four-arm run left open, with intervals.
//
//                     masked opening        unmasked opening
//   real reward       A, B                  C
//   random reward     D                     <-- NEVER RUN
//
// The statistic is the ITEM-WISE opening concentration over ALL completions: for each item,
// the share of its completions landing on that item's own modal opening, averaged over items.
// Equal weight per item, every item contributing the same G, so it is immune to the
// composition artifact that inflated the pooled figure (see opening-per-item.mts).
//
// Paired by item against base, bootstrap over items -- the same machinery as the pass-rate
// readout, pointed at the prior instead. Without intervals a 2x2 of four point estimates
// invites exactly the "two numbers that look far apart" error this arc already made once.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);
const firstDeg = (raw: string) => ((parseSpecResponse(raw)[0]?.degrees ?? []) as number[]).join(",") || "(none)";

function itemwise(genFile: string, promptsFile: string) {
  if (!existsSync(join(RUNS, genFile))) return null;
  const byId = new Map(readFileSync(join(RUNS, promptsFile), "utf8").trim().split("\n").filter(Boolean)
    .map((l) => JSON.parse(l)).map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
  const m = new Map<string, number>();
  for (const l of readFileSync(join(RUNS, genFile), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    if (!byId.has(r.itemId)) continue;
    const h = new Map<string, number>();
    for (const raw of r.completions) { const d = firstDeg(raw); h.set(d, (h.get(d) ?? 0) + 1); }
    m.set(r.itemId, Math.max(...h.values()) / r.completions.length);
  }
  return m;
}

let seed = 20260913;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const pp = (v: number) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(2)}`;

const POOL = process.env.POOL ?? "heldout";
const PROMPTS = POOL === "heldout" ? "prompts-heldout-v1.jsonl" : "prompts-trained-v1.jsonl";
const base = itemwise(`mc-${POOL}-base.jsonl`, PROMPTS);
if (!base) { console.log("base not present"); process.exit(0); }
const ids = [...base.keys()];
console.log(`\n=== ITEM-WISE opening concentration, ${POOL} pool, n=${ids.length} items ===`);
console.log(`base ${mean(ids.map((i) => base.get(i)!)).toFixed(4)}   (share of an item's completions on that item's modal opening)\n`);
console.log(`${"arm".padEnd(26)} ${"delta vs base".padEnd(15)} ${"bootstrap 95%".padEnd(22)} verdict`);

const LABEL: Record<string, string> = {
  A: "A masked  / real", B: "B masked  / real", C: "C UNMASKED/ real",
  D: "D masked  / RANDOM", E: "E UNMASKED/ RANDOM",
};
const got: Record<string, Map<string, number>> = {};
for (const a of ["A", "B", "C", "D", "E"]) {
  const m = itemwise(`mc-${POOL}-${a}.jsonl`, PROMPTS);
  if (!m) { if (a === "E") console.log(`${LABEL[a].padEnd(26)} (the missing cell -- not run)`); continue; }
  got[a] = m;
  const d = ids.filter((i) => m.has(i)).map((i) => m.get(i)! - base.get(i)!);
  const boots: number[] = [];
  for (let b = 0; b < 10000; b++) { let s = 0; for (let j = 0; j < d.length; j++) s += d[Math.floor(rand() * d.length)]!; boots.push(s / d.length); }
  boots.sort((x, y) => x - y);
  const lo = boots[250]!, hi = boots[9750]!;
  console.log(`${LABEL[a].padEnd(26)} ${(pp(mean(d)) + "pp").padEnd(15)} [${pp(lo)}, ${pp(hi)}]`.padEnd(66) + (lo > 0 || hi < 0 ? "EXCLUDES 0" : "includes 0"));
}

// The additive prediction for the missing cell, stated BEFORE it is run.
if (got.A && got.B && got.C && got.D) {
  const dm = (m: Map<string, number>) => mean(ids.filter((i) => m.has(i)).map((i) => m.get(i)! - base.get(i)!));
  const maskedReal = (dm(got.A) + dm(got.B)) / 2, unmaskReal = dm(got.C), maskedRandom = dm(got.D);
  const unmaskEffect = unmaskReal - maskedReal, randomEffect = maskedRandom - maskedReal;
  console.log(`\nmain effects from the three filled cells:`);
  console.log(`  unmasking the opening  ${pp(unmaskEffect)}pp`);
  console.log(`  random reward          ${pp(randomEffect)}pp`);
  console.log(`  ADDITIVE prediction for the missing cell E = ${pp(maskedReal + unmaskEffect + randomEffect)}pp vs base`);
  console.log(`  if E lands near C (${pp(unmaskReal)}pp), unmasking carries it and the reward adds little`);
  console.log(`  if E lands near D (${pp(maskedRandom)}pp), the reward carries it and unmasking adds little`);
}
