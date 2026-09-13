// The matched-cell readout, against MATCHED-CELL-PREREG.md.
//
// Both pools come from one shuffle of one 107-progression pool at the same 8-bar window:
// trained = slice [0,32), held-out = slice [32,107). Same construction, zero overlap, and
// the prompts for both are built by the bridge's own `vlCaseRow`.
//
// Paired by ITEM, because base and every arm ran the same items within a pool, so item
// difficulty cancels and n = items. Intervals are a 10k bootstrap over items alongside a
// paired t, and BOTH arm-vs-base and arm-vs-arm are reported -- comparing two arm-vs-base
// numbers to each other is a mistake this arc has already made once.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);
const ARMS = ["A", "B", "C", "D"] as const;
const LABEL: Record<string, string> = {
  A: "A stratified", B: "B heterogeneous", C: "C unforced", D: "D random reward",
};

function perItem(gen: string, prompts: string) {
  if (!existsSync(join(RUNS, gen))) return null;
  const byId = new Map(
    readFileSync(join(RUNS, prompts), "utf8").trim().split("\n").map((l) => JSON.parse(l))
      .map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression])
  );
  const out = new Map<string, number>();
  for (const l of readFileSync(join(RUNS, gen), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId);
    if (!prog) continue;
    let k = 0;
    for (const c of r.completions) if (scoreVoicing(prog, c, VOICES, STYLE).correct) k++;
    out.set(r.itemId, k / r.completions.length);
  }
  return out;
}

function paired(x: Map<string, number>, y: Map<string, number>) {
  const ids = [...y.keys()].filter((k) => x.has(k));
  const d = ids.map((k) => x.get(k)! - y.get(k)!);
  const n = d.length;
  const mean = d.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  let rng = 4242;
  const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0), rng / 4294967296);
  const boots: number[] = [];
  for (let b = 0; b < 10000; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[Math.floor(rand() * n)]!;
    boots.push(s / n);
  }
  boots.sort((a, b) => a - b);
  const t = n > 40 ? 1.993 : 2.0395;
  return {
    n, mean, sd,
    tlo: mean - t * se, thi: mean + t * se,
    blo: boots[250]!, bhi: boots[9750]!,
    wins: d.filter((v) => v > 0).length, losses: d.filter((v) => v < 0).length,
  };
}

const pp = (v: number) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}`;

for (const [tag, pool, prompts] of [
  ["TRAINED POOL — slice [0,32), the items the arms actually trained on", "trained", "prompts-trained-v1.jsonl"],
  ["HELD-OUT POOL — slice [32,107), zero overlap, same 8-bar cell", "heldout", "prompts-heldout-v1.jsonl"],
] as const) {
  const base = perItem(`mc-${pool}-base.jsonl`, prompts);
  console.log(`\n=== ${tag} ===`);
  if (!base) { console.log("  (base eval not present yet)"); continue; }
  const bmean = [...base.values()].reduce((a, b) => a + b, 0) / base.size;
  console.log(`  base pass ${bmean.toFixed(4)} over ${base.size} items`);
  console.log("  arm vs base".padEnd(22) + "lift".padEnd(10) + "paired t 95%".padEnd(22) + "bootstrap 95%".padEnd(22) + "+/-".padEnd(9) + "verdict");
  const got: Record<string, Map<string, number>> = {};
  for (const a of ARMS) {
    const m = perItem(`mc-${pool}-${a}.jsonl`, prompts);
    if (!m) { console.log(`  ${LABEL[a]}: (pending)`); continue; }
    got[a] = m;
    const r = paired(m, base);
    console.log(
      "  " + LABEL[a].padEnd(20) + `${pp(r.mean)}pp`.padEnd(10) +
      `[${pp(r.tlo)}, ${pp(r.thi)}]`.padEnd(22) + `[${pp(r.blo)}, ${pp(r.bhi)}]`.padEnd(22) +
      `${r.wins}/${r.losses}`.padEnd(9) + (r.blo > 0 ? "EXCLUDES 0" : r.bhi < 0 ? "EXCLUDES 0 (neg)" : "includes 0")
    );
  }
  // D - B is THE VERIFIER TEST: same heterogeneous forcing, reward is the only knob.
  // D - base moves two knobs at once and cannot isolate it.
  const pairs: Array<[string, string]> = [["A", "B"], ["A", "C"], ["B", "C"], ["D", "B"], ["D", "C"]];
  console.log("  arm vs arm");
  for (const [x, y] of pairs) {
    if (!got[x] || !got[y]) continue;
    const r = paired(got[x]!, got[y]!);
    console.log(
      "  " + `${x} - ${y}`.padEnd(20) + `${pp(r.mean)}pp`.padEnd(10) +
      `[${pp(r.tlo)}, ${pp(r.thi)}]`.padEnd(22) + `[${pp(r.blo)}, ${pp(r.bhi)}]`.padEnd(22) +
      `${r.wins}/${r.losses}`.padEnd(9) + (r.blo > 0 || r.bhi < 0 ? "DISTINGUISHABLE" : "not distinguishable")
    );
  }
}
console.log(
  "\nReadings are per arm (MATCHED-CELL-PREREG.md). A split between arms is reported as a\n" +
  "split; no combined verdict is manufactured."
);
