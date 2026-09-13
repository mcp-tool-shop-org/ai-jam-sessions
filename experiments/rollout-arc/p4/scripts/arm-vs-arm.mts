// Arm against arm, paired by item.
//
// Every comparison so far has been arm-vs-BASE. That answers "did this arm move?" and
// not "did these two arms differ?", and the second question is the one a deconfounding
// run would be built on. If A and B are not distinguishable from each other on the
// held-out pool, then "A generalised and B did not" is not a phenomenon and there is
// nothing to deconfound.
//
// Paired by item for the same reason as everywhere else in this arc: both arms were
// evaluated on the same items, so item difficulty is common to both sides and cancels.
// n = items, not completions.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);

function perItem(gen: string, prompts: string): Map<string, number> | null {
  if (!existsSync(join(RUNS, gen))) return null;
  const byId = new Map(
    readFileSync(join(RUNS, prompts), "utf8").trim().split("\n")
      .map((l) => JSON.parse(l))
      .map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression])
  );
  const m = new Map<string, number>();
  for (const l of readFileSync(join(RUNS, gen), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId);
    if (!prog) continue;
    let k = 0;
    for (const c of r.completions) if (scoreVoicing(prog, c, VOICES, STYLE).correct) k++;
    m.set(r.itemId, k / r.completions.length);
  }
  return m;
}

function paired(x: Map<string, number>, y: Map<string, number>, label: string) {
  const ids = [...x.keys()].filter((k) => y.has(k));
  const d = ids.map((k) => x.get(k)! - y.get(k)!);
  const n = d.length;
  const mean = d.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  let rng = 99;
  const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0), rng / 4294967296);
  const boots: number[] = [];
  for (let b = 0; b < 10000; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[Math.floor(rand() * n)]!;
    boots.push(s / n);
  }
  boots.sort((a, b) => a - b);
  const pp = (v: number) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}`;
  const lo = boots[250]!, hi = boots[9750]!;
  console.log(
    `  ${label.padEnd(26)}${(pp(mean) + "pp").padEnd(9)}` +
      `t95 [${pp(mean - 2.0395 * se)}, ${pp(mean + 2.0395 * se)}]`.padEnd(24) +
      `boot95 [${pp(lo)}, ${pp(hi)}]`.padEnd(26) +
      `${d.filter((v) => v > 0).length}/${d.filter((v) => v < 0).length}/${d.filter((v) => v === 0).length}`.padEnd(10) +
      (lo > 0 || hi < 0 ? "DISTINGUISHABLE" : "not distinguishable")
  );
}

for (const [tag, pre, pr] of [
  ["IN-SAMPLE", "eval", "spec-prompts-4bar-random.jsonl"],
  ["HELD-OUT", "held", "spec-prompts-v2-holdout.jsonl"],
] as const) {
  const A = perItem(`${pre}-A.jsonl`, pr);
  const B = perItem(`${pre}-B.jsonl`, pr);
  const C = perItem(`${pre}-C.jsonl`, pr);
  console.log(`\n=== ${tag} — arm vs arm, paired by item ===`);
  if (!A || !B || !C) { console.log("  (missing evals)"); continue; }
  paired(A, B, "A stratified - B heterog");
  paired(A, C, "A stratified - C unforced");
  paired(B, C, "B heterog    - C unforced");
}
console.log(
  "\nitems column is better/worse/tied. A comparison whose interval spans zero does not\n" +
    "support a claim that the two arms differ, however far apart their arm-vs-base numbers look."
);
