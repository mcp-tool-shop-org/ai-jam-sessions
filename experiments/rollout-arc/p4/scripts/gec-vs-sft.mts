// Is GEC just SFT with extra steps?
//
// GEC would inject the nearest-tone heuristic's solution into degenerate groups to
// manufacture a positive advantage. If the model's OWN passing solutions are all
// identical to what the heuristic produces, then the only thing the loop can teach
// is the heuristic, and SFT on heuristic outputs is the same thing for less money.
//
// If the model passes with solutions the heuristic would NOT produce, the RL loop is
// preserving something distillation would destroy — and that is the whole case for
// GEC over SFT. This is measurable, so measure it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSpecResponse,
  renderSpecRealization,
  nearestToneRealization,
  rootPositionRealization,
  verifyVoiceLeading,
} from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const STYLE = "common-practice";
const VOICES = 2;

const prompts = readFileSync(join(RUNS, "spec-prompts-4bar-random.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));
const byId = new Map(prompts.map((p) => [p.itemId, p.progression]));
const rows = readFileSync(join(RUNS, "spec-4bar-g16.jsonl"), "utf8")
  .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

/** A realization's voicing sequence, as a comparable signature. */
const realSig = (r: { frames: Array<{ voices: number[] }> }) =>
  r.frames.map((f) => f.voices.join(",")).join("|");

let passing = 0;
let matchHeuristic = 0;
let novel = 0;
const novelSigs = new Set<string>();
let heuristicAdmits = 0;
let itemsWithNovel = 0;
let itemsWithPassing = 0;

for (const r of rows) {
  const prog = byId.get(r.itemId);
  if (!prog) continue;

  // What the heuristic would produce for this progression, and whether the gate
  // even admits it — SFT on a solution the verifier rejects would teach failure.
  const hRealization = (nearestToneRealization as (p: unknown, v: number) => never)(prog, VOICES);
  const hSig = realSig(hRealization);
  const hAdmitted = verifyVoiceLeading(hRealization, { style: STYLE }).admitted;
  if (hAdmitted) heuristicAdmits++;

  let itemPassing = 0;
  let itemNovel = 0;
  for (const raw of r.completions as string[]) {
    const s = scoreVoicing(prog, raw, VOICES, STYLE);
    if (!s.correct) continue;
    passing++;
    itemPassing++;
    const mSig = realSig(renderSpecRealization(prog, parseSpecResponse(raw), VOICES));
    if (mSig === hSig) {
      matchHeuristic++;
    } else {
      novel++;
      itemNovel++;
      novelSigs.add(`${r.itemId}::${mSig}`);
    }
  }
  if (itemPassing) itemsWithPassing++;
  if (itemNovel) itemsWithNovel++;
}

const pct = (a: number, b: number) => ((100 * a) / Math.max(1, b)).toFixed(1);
console.log(`progressions                     : ${rows.length}`);
console.log(`heuristic admitted by the gate   : ${heuristicAdmits}/${rows.length} (${pct(heuristicAdmits, rows.length)}%)`);
console.log(`passing model completions        : ${passing}`);
console.log(`  identical to the heuristic     : ${matchHeuristic} (${pct(matchHeuristic, passing)}%)`);
console.log(`  NOVEL — gate-valid, not the heuristic : ${novel} (${pct(novel, passing)}%)`);
console.log(`  distinct novel solutions       : ${novelSigs.size}`);
console.log(`items with >=1 novel passer      : ${itemsWithNovel}/${itemsWithPassing}`);
console.log(
  `\nverdict: ${
    novel === 0
      ? "GEC == SFT. Every passing solution is the heuristic's; the loop can only distil it."
      : novel / passing < 0.1
        ? "GEC ~= SFT. Novel solutions are a rounding error."
        : "GEC != SFT. The policy passes with solutions the heuristic does not produce; distillation would discard them."
  }`
);
