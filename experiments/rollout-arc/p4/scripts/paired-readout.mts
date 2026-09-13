// PAIRED item-level analysis. This is the correct statistic for these evals and
// neither of the two obvious wrong ones.
//
//   WRONG 1 -- treat 512 completions as 512 independent draws. rho here is 0.62-0.74,
//   so the within-item correlation is enormous and every naive interval is ~3.5x too
//   narrow.
//
//   WRONG 2 -- apply a design effect and compare two INDEPENDENT samples. That gives
//   n_eff ~ 45 and intervals of +/-20pp, which would declare every result in this run
//   indistinguishable from nothing. It is too conservative, because base and every arm
//   were evaluated on THE SAME 32 ITEMS. Item difficulty is common to both sides and
//   cancels.
//
// The right analysis pairs by item: d_i = k_arm(i)/G - k_base(i)/G for each of the 32
// items, then asks whether the mean of those 32 differences is distinguishable from
// zero. Item difficulty -- the thing driving rho -- never enters.
//
// Reported with a paired t interval AND a 10k-sample bootstrap over items, because
// n=32 and the per-item differences are not going to be normal.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);

type Row = { itemId: string; completions: string[] };

function perItemRate(genFile: string, promptsFile: string): Map<string, number> | null {
  const gp = join(RUNS, genFile);
  if (!existsSync(gp)) return null;
  const prompts = readFileSync(join(RUNS, promptsFile), "utf8")
    .trim().split("\n").map((l) => JSON.parse(l));
  const byId = new Map(prompts.map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
  const out = new Map<string, number>();
  for (const line of readFileSync(gp, "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(line) as Row;
    const prog = byId.get(r.itemId);
    if (!prog) continue;
    let k = 0;
    for (const raw of r.completions) if (scoreVoicing(prog, raw, VOICES, STYLE).correct) k++;
    out.set(r.itemId, k / r.completions.length);
  }
  return out;
}

function paired(arm: Map<string, number>, base: Map<string, number>) {
  const ids = [...base.keys()].filter((k) => arm.has(k));
  const d = ids.map((k) => arm.get(k)! - base.get(k)!);
  const n = d.length;
  const mean = d.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  // t(31) two-sided 0.05
  const t = 2.0395;
  // Bootstrap over ITEMS, which is the unit of independence.
  let rng = 12345;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const boots: number[] = [];
  for (let b = 0; b < 10000; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[Math.floor(rand() * n)]!;
    boots.push(s / n);
  }
  boots.sort((a, b) => a - b);
  const wins = d.filter((x) => x > 0).length;
  const losses = d.filter((x) => x < 0).length;
  return {
    n, mean, se,
    tlo: mean - t * se, thi: mean + t * se,
    blo: boots[Math.floor(0.025 * boots.length)]!, bhi: boots[Math.floor(0.975 * boots.length)]!,
    wins, losses, ties: n - wins - losses,
  };
}

const ARMS = ["A", "B", "C", "D"] as const;
const LABEL: Record<string, string> = {
  A: "A stratified", B: "B heterogeneous", C: "C unforced", D: "D random reward",
};
const BAR: Record<string, number> = { A: 0.032, B: 0.056 };

for (const [tag, prefix, prompts] of [
  ["IN-SAMPLE (eval pool IS the training pool)", "eval", "spec-prompts-4bar-random.jsonl"],
  ["HELD-OUT (29 of 32 items unseen)", "held", "spec-prompts-v2-holdout.jsonl"],
] as const) {
  const base = perItemRate(`${prefix}-base.jsonl`, prompts);
  console.log(`\n=== ${tag} ===`);
  if (!base) { console.log("  (no base eval found)"); continue; }
  const bmean = [...base.values()].reduce((a, b) => a + b, 0) / base.size;
  console.log(`  base pass ${bmean.toFixed(4)} over ${base.size} items`);
  console.log(
    "  arm".padEnd(20) + "lift".padEnd(10) + "paired t 95%".padEnd(22) +
    "bootstrap 95%".padEnd(22) + "items +/-/=".padEnd(14) + "prereg"
  );
  for (const a of ARMS) {
    const arm = perItemRate(`${prefix}-${a}.jsonl`, prompts);
    if (!arm) { console.log(`  ${LABEL[a]}: (missing)`); continue; }
    const r = paired(arm, base);
    const pp = (x: number) => `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`;
    let verdict = "";
    if (BAR[a] !== undefined) {
      verdict = r.mean >= BAR[a] ? `CLEARS +${(100 * BAR[a]).toFixed(1)}pp` : `MISSES +${(100 * BAR[a]).toFixed(1)}pp`;
      verdict += r.blo > 0 ? ", excludes 0" : ", INCLUDES 0";
    } else {
      verdict = Math.abs(r.mean) <= 0.02 ? "within control band" : "OUTSIDE control band";
    }
    console.log(
      "  " + LABEL[a].padEnd(20) + `${pp(r.mean)}pp`.padEnd(10) +
      `[${pp(r.tlo)}, ${pp(r.thi)}]`.padEnd(22) +
      `[${pp(r.blo)}, ${pp(r.bhi)}]`.padEnd(22) +
      `${r.wins}/${r.losses}/${r.ties}`.padEnd(14) + verdict
    );
  }
}
console.log(
  "\nPairing is by ITEM, the unit of independence: n = 32, not 512. The thresholds are\n" +
  "effect sizes fixed in HELDOUT-PREREG.md before the data existed; the intervals are\n" +
  "reported beside them because clearing a threshold and excluding zero are different\n" +
  "claims and only one of them is about whether the effect is real."
);
