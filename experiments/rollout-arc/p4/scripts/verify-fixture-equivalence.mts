// Does the frozen fixture contain the SAME progressions P4 measured?
//
// The fixture is only worth anything if it reproduces the published population
// exactly. Score the 256 committed completions of the randomized run using the
// FIXTURE's progressions rather than the run's own prompt file: if the fixture is
// the same draw, the admit rate must come back at the published 0.4492.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, "..", "runs");
const FIXTURE = join(HERE, "..", "fixtures", "progressions-v1.json");

const fx = JSON.parse(readFileSync(FIXTURE, "utf8"));
const byIdFixture = new Map<string, unknown>(fx.progressions.map((r: { songId: string; progression: unknown }) => [r.songId, r.progression]));

const prompts = readFileSync(join(RUNS, "spec-prompts-v2-random.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));
const byIdRun = new Map(prompts.map((p) => [p.itemId, p.progression]));

const rows = readFileSync(join(RUNS, "spec-g8-v2-random.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));

// 1. same song set?
const runIds = [...byIdRun.keys()].sort();
const fxIds = [...byIdFixture.keys()].sort();
const sameSet = runIds.length === fxIds.length && runIds.every((id, i) => id === fxIds[i]);
console.log(`run songs: ${runIds.length} | fixture songs: ${fxIds.length} | identical set: ${sameSet}`);
if (!sameSet) {
  console.log("  only in run    :", runIds.filter((i) => !byIdFixture.has(i)).join(", ") || "(none)");
  console.log("  only in fixture:", fxIds.filter((i) => !byIdRun.has(i)).join(", ") || "(none)");
}

// 2. byte-identical progressions?
let progMismatch = 0;
for (const id of runIds) {
  if (JSON.stringify(byIdRun.get(id)) !== JSON.stringify(byIdFixture.get(id))) progMismatch++;
}
console.log(`progressions differing between run and fixture: ${progMismatch}`);

// 3. same verdicts, on the real completions
let checked = 0;
let admittedFixture = 0;
let disagreements = 0;
for (const r of rows) {
  const fromRun = byIdRun.get(r.itemId);
  const fromFx = byIdFixture.get(r.itemId);
  for (const raw of r.completions as string[]) {
    const a = scoreVoicing(fromRun, raw, 2, "film-ambient");
    const b = scoreVoicing(fromFx, raw, 2, "film-ambient");
    if (a.correct !== b.correct) disagreements++;
    if (b.correct) admittedFixture++;
    checked++;
  }
}
const rate = admittedFixture / checked;
console.log(`completions scored: ${checked} | verdict disagreements: ${disagreements}`);
console.log(`admit rate from FIXTURE: ${rate.toFixed(4)} (published P4 figure: 0.4492)`);
console.log(
  sameSet && progMismatch === 0 && disagreements === 0 && Math.abs(rate - 0.4492) < 0.0005
    ? "EQUIVALENT — the fixture is the population P4 measured"
    : "NOT EQUIVALENT — the fixture does not reproduce the published population"
);
