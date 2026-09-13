// Does the CLIPPING GEOMETRY move entropy regardless of reward content?
//
// `FOUR-ARM-RESULTS.md` filed an anomaly without a mechanism: the random-reward arm moved
// `top_first_measure_share` by 0.060 -- MORE than either treatment. It was read as "what any
// gradient does to the prior", which is a description, not a cause.
//
// Park et al. 2025 (arXiv:2509.26114) proposes one: clip-low raises entropy, clip-high lowers
// it, and clip-high dominates under standard settings -- reducing entropy even under purely
// random rewards. We train epsilon_low 0.2 / epsilon_high 0.28, so the geometry is shared by
// every arm including D.
//
// That is a testable prediction on data already on disk: TRL logs `entropy`, `kl` and five
// `clip_ratio/*` series per step, 800 rows across the four arms. If entropy falls in D as it
// does in the real-reward arms, the mechanism is live here. If D's entropy holds while the
// others fall, it is not the explanation and the anomaly stays open.
//
// This is DESCRIPTIVE and it is a FOURTH proposed mechanism for an anomaly where three have
// already been falsified. It can support a hypothesis; it cannot confirm one.
import { readFileSync } from "node:fs";

const LOG = process.argv[2];
if (!LOG) {
  console.log("usage: tsx entropy-clip-readout.mts <path to run.log>");
  process.exit(2);
}
const lines = readFileSync(LOG, "utf8").split(/\r?\n/);

const KEYS = ["entropy", "kl", "clip_ratio/high_mean", "clip_ratio/low_mean", "clip_ratio/region_mean"] as const;
type Key = (typeof KEYS)[number];

const arms: Record<string, Record<Key, number[]>> = {};
let cur: string | null = null;

for (const L of lines) {
  const m = L.match(/=== \[p4-train\] arm ([A-D]): mode=/);
  if (m) {
    cur = m[1]!;
    arms[cur] = { entropy: [], kl: [], "clip_ratio/high_mean": [], "clip_ratio/low_mean": [], "clip_ratio/region_mean": [] };
    continue;
  }
  if (!cur) continue;
  for (const k of KEYS) {
    // TRL's log dict renders as {'entropy': '0.042', ...} -- single-quoted values.
    const esc = k.replace(/[/]/g, "\\/");
    const re = new RegExp("'" + esc + "':\\s*'([-0-9.eE+]+)'");
    const g = L.match(re);
    if (g) arms[cur]![k].push(parseFloat(g[1]!));
  }
}

const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const fmt = (v: number, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : "  -  ");

console.log("PER-ARM entropy trajectory and clip geometry (200 steps each)\n");
console.log(
  "arm".padEnd(5) + "n".padEnd(5) + "entropy 1-50".padEnd(14) + "entropy last50".padEnd(16) +
  "change".padEnd(10) + "clip_high".padEnd(12) + "clip_low".padEnd(12) + "kl last50"
);
for (const k of ["A", "B", "C", "D"]) {
  const a = arms[k];
  if (!a || !a.entropy.length) { console.log(k.padEnd(5) + "(no rows parsed)"); continue; }
  const first = mean(a.entropy.slice(0, 50));
  const last = mean(a.entropy.slice(-50));
  const pct = ((last - first) / first) * 100;
  console.log(
    k.padEnd(5) + String(a.entropy.length).padEnd(5) + fmt(first).padEnd(14) + fmt(last).padEnd(16) +
    (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%".padEnd(4) +
    mean(a["clip_ratio/high_mean"]).toExponential(2).padEnd(12) +
    mean(a["clip_ratio/low_mean"]).toExponential(2).padEnd(12) +
    mean(a.kl.slice(-50)).toExponential(2)
  );
}
console.log(
  "\nThe prediction: if clipping geometry drives it, D's entropy falls like the rest --\n" +
  "the geometry is shared by every arm. If D holds while the others fall, the mechanism is\n" +
  "not live here and the anomaly stays open. A fourth story for this anomaly gets the same\n" +
  "treatment as the three already falsified."
);
