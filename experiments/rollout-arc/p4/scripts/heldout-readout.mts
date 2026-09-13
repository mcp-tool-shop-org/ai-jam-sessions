// Read the held-out eval against HELDOUT-PREREG.md, with the clustering taken
// seriously.
//
// 512 completions per arm sounds like a lot. It is 32 items x 16 rollouts, and the
// rollouts within an item are CORRELATED -- that is what rho measures, and this arc
// has already learned the hard way that rho is a real number here (0.6-0.75), not a
// rounding error. Treating 512 correlated completions as 512 independent draws
// inflates every interval by roughly sqrt(1 + 15*rho), which is a factor of 3 to 4.
//
// So: the preregistered thresholds are reported as written (they are effect-size
// thresholds and were fixed before the data), AND a design-effect-corrected interval
// is reported beside each one. A threshold cleared by an effect that does not clear
// zero is a real thing to know about, and the honest place to learn it is here rather
// than from a reviewer.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const POD = join(RUNS, "pod-4arm");

type S = {
  generated_from: string;
  groups: number;
  completions: number;
  single_shot_p: number;
  rho: number;
  non_degenerate: string;
  funnel: { top_first_measure_share: number };
};

const load = (dir: string, f: string): S | null => {
  const p = join(dir, f);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as S) : null;
};

const ARMS = ["base", "A", "B", "C", "D"] as const;
const LABEL: Record<string, string> = {
  base: "base (untrained)",
  A: "A stratified",
  B: "B heterogeneous",
  C: "C unforced",
  D: "D random reward",
};
// Preregistered: half the in-sample lift. HELDOUT-PREREG.md, pre-committed readings.
const BAR: Record<string, number> = { A: 0.032, B: 0.056 };
const CONTROL_BAND = 0.02;

/** Effective sample size under within-item correlation. deff = 1 + (m-1) * ICC. */
function effN(n: number, m: number, rho: number) {
  const deff = 1 + (m - 1) * Math.max(0, rho);
  return { deff, n_eff: n / deff };
}

function diffCI(p1: number, n1: number, p2: number, n2: number) {
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const d = p1 - p2;
  return { d, se, lo: d - 1.96 * se, hi: d + 1.96 * se };
}

for (const [dir, title, pool] of [
  [POD, "IN-SAMPLE (the eval pool IS the training pool)", "eval"],
  [RUNS, "HELD-OUT (29 of 32 items never trained on)", "held"],
] as const) {
  const rows = ARMS.map((a) => [a, load(dir, `summary-${pool}-${a}.json`)] as const).filter(
    (r): r is readonly [(typeof ARMS)[number], S] => r[1] !== null
  );
  console.log(`\n=== ${title} ===`);
  if (!rows.length) {
    console.log("  (no summaries found)");
    continue;
  }
  const base = rows.find((r) => r[0] === "base")?.[1];
  const G = base ? base.completions / base.groups : 16;
  console.log(
    "arm".padEnd(18) +
      "pass".padEnd(9) +
      "rho".padEnd(7) +
      "n_eff".padEnd(8) +
      "lift vs base".padEnd(15) +
      "95% CI on lift".padEnd(20) +
      "prereg bar"
  );
  for (const [a, s] of rows) {
    const { n_eff } = effN(s.completions, G, s.rho);
    let lift = "-";
    let ci = "-";
    let verdict = "";
    if (base && a !== "base") {
      const be = effN(base.completions, G, base.rho);
      const r = diffCI(s.single_shot_p, n_eff, base.single_shot_p, be.n_eff);
      lift = `${r.d >= 0 ? "+" : ""}${(100 * r.d).toFixed(1)}pp`;
      ci = `[${(100 * r.lo).toFixed(1)}, ${(100 * r.hi).toFixed(1)}]pp`;
      if (BAR[a] !== undefined) {
        verdict = r.d >= BAR[a] ? `CLEARS +${(100 * BAR[a]).toFixed(1)}pp` : `MISSES +${(100 * BAR[a]).toFixed(1)}pp`;
        if (r.lo > 0) verdict += ", CI excludes 0";
        else verdict += ", CI INCLUDES 0";
      } else {
        verdict = Math.abs(r.d) <= CONTROL_BAND ? `within +/-2pp control band` : `OUTSIDE control band`;
      }
    }
    console.log(
      LABEL[a].padEnd(18) +
        s.single_shot_p.toFixed(4).padEnd(9) +
        s.rho.toFixed(3).padEnd(7) +
        n_eff.toFixed(1).padEnd(8) +
        lift.padEnd(15) +
        ci.padEnd(20) +
        verdict
    );
  }
  console.log(
    "topFirst".padEnd(18) + rows.map(([a, s]) => `${a}:${s.funnel.top_first_measure_share}`).join("  ")
  );
}
console.log(
  "\nThresholds are EFFECT SIZES fixed before the data (HELDOUT-PREREG.md). The CI column is\n" +
    "reported beside them because an effect that clears a threshold and does not clear zero is\n" +
    "a different result from one that does, and n_eff is what 32 correlated items actually buy."
);
