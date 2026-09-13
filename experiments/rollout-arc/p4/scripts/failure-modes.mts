// WHICH RULE FAILS — gate 3 applied to the training outcome rather than to the substrate.
//
// "Pass rate went up" is not the same claim as "it learned part-writing". If the entire
// lift comes from fixing ONE hard gate, the capability acquired is that rule and nothing
// else -- which is exactly how `film-ambient` failed gate 3 earlier in this arc, with
// `overlap` accounting for 168 of 168 failures.
//
// This is DESCRIPTIVE. It is not preregistered, it can generate a hypothesis and cannot
// confirm one, and it is counted rather than eyeballed: the bridge's own verdict, per
// completion, tallied. Reading impressions off streaming generations is how a fitted
// mechanism gets built, and this arc has retired that trap twice already.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);
const POOL = process.env.POOL ?? "trained";
const PROMPTS = process.env.PROMPTS ?? `prompts-${POOL}-v1.jsonl`;
const ARMS = (process.env.ARMS ?? "base,A,B,C,D").split(",");

const byId = new Map(
  readFileSync(join(RUNS, PROMPTS), "utf8").trim().split("\n").map((l) => JSON.parse(l))
    .map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression])
);

type Tally = { total: number; pass: number; rules: Record<string, number> };
const tallies: Record<string, Tally> = {};

for (const arm of ARMS) {
  const f = join(RUNS, `mc-${POOL}-${arm}.jsonl`);
  if (!existsSync(f)) continue;
  const t: Tally = { total: 0, pass: 0, rules: {} };
  for (const l of readFileSync(f, "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId);
    if (!prog) continue;
    for (const c of r.completions) {
      const s = scoreVoicing(prog, c, VOICES, STYLE);
      t.total++;
      if (s.correct) { t.pass++; continue; }
      // Every failing gate is counted, not just the first: a completion can break
      // several rules and attributing it to one would invent a ranking.
      for (const rule of s.failing_rules as string[]) t.rules[rule] = (t.rules[rule] ?? 0) + 1;
    }
  }
  tallies[arm] = t;
}

const arms = Object.keys(tallies);
if (!arms.length) {
  console.log(`(no mc-${POOL}-* evals present)`);
} else {
  const allRules = [...new Set(arms.flatMap((a) => Object.keys(tallies[a]!.rules)))].sort(
    (x, y) => (tallies[arms[0]!]!.rules[y] ?? 0) - (tallies[arms[0]!]!.rules[x] ?? 0)
  );
  console.log(`=== ${POOL} pool — failing hard gates per 100 completions ===`);
  console.log("rule".padEnd(22) + arms.map((a) => a.padEnd(10)).join("") + "  base->best delta");
  for (const rule of allRules) {
    const per100 = (a: string) => (100 * (tallies[a]!.rules[rule] ?? 0)) / tallies[a]!.total;
    const b = per100("base");
    const best = Math.min(...arms.filter((a) => a !== "base").map(per100));
    console.log(
      rule.padEnd(22) + arms.map((a) => per100(a).toFixed(1).padEnd(10)).join("") +
        `  ${(best - b >= 0 ? "+" : "")}${(best - b).toFixed(1)}`
    );
  }
  console.log("pass rate".padEnd(22) + arms.map((a) => (100 * tallies[a]!.pass / tallies[a]!.total).toFixed(1).padEnd(10)).join(""));
  console.log("completions".padEnd(22) + arms.map((a) => String(tallies[a]!.total).padEnd(10)).join(""));
  console.log(
    "\nA lift concentrated in ONE row is one rule learned, not part-writing. A lift spread\n" +
      "across rows is the broader claim. Counted from the bridge's verdicts, not from reading\n" +
      "completions."
  );
}
