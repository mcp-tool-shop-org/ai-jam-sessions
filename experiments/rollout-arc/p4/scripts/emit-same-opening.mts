// SAME-OPENING GROUPS — the control that decides the training architecture.
//
// Exploring starts handed every rollout in a group a DIFFERENT opening, and the
// group stopped being a group: pass rate by forced opening ranges 0.219 to 0.563
// (scripts/opening-difficulty.mts), so part of GRPO's within-group advantage would
// grade which opening the rollout was handed.
//
// The fix that preserves GRPO exactly is to make the opening part of the GROUP
// IDENTITY: one group = one (item, opening), all G rollouts sharing both. That is
// only viable if such a group still SPLITS — if the policy varies measures 2-4 when
// measure 1 is pinned. Nothing measured so far bears on it: the 1.000 within-group
// uniqueness of the exploring-starts run is confounded by construction, because each
// rollout had a different prefix.
//
// So: identical to emit-exploring-starts.mts in every respect except that all G
// prefixes of an item are the SAME. The opening varies ACROSS items (item i takes
// valid opening i mod |valid|) so the reading is not a property of one voicing.
//
// Thresholds are preregistered in ../PREFIX-PREREG.md and are NOT restated here, so
// this script cannot quietly disagree with them.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The opening alphabet comes from the BRIDGE, not from a local copy. The
// exploring-starts emitter derived its own, and two derivations that drift by one
// candidate would make this control measure a different alphabet than the thing it
// controls. `p4-vl-server.test.ts` holds them equal against the committed run.
import { validOpenings, openingPrefix } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const VOICES = 2;
const G = Number(process.env.GENS ?? 16);

const rows = readFileSync(join(RUNS, "spec-prompts-4bar-random.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));

const out = rows.map((r, itemIndex) => {
  const openings = validOpenings(r.progression, VOICES);
  // ONE opening for the whole group, rotating across items so the result is not a
  // property of whichever voicing happened to be chosen.
  const [a, b] = openings[itemIndex % openings.length]!;
  const prefix = openingPrefix(r.progression, [a, b]);
  return {
    ...r,
    openings_available: openings.length,
    group_opening: [a, b],
    prefixes: Array.from({ length: G }, () => prefix),
  };
});

writeFileSync(
  join(RUNS, "spec-4bar-same-opening.jsonl"),
  out.map((o) => JSON.stringify(o)).join("\n") + "\n"
);

const openingHist: Record<string, number> = {};
for (const o of out) {
  const k = o.group_opening.join(",");
  openingHist[k] = (openingHist[k] ?? 0) + 1;
}
console.log(`items: ${out.length} | G: ${G} | one opening per group`);
console.log(`group openings used: ${JSON.stringify(openingHist)}`);
console.log(`distinct openings across items: ${Object.keys(openingHist).length}`);
console.log(`sample: ${out[0]!.songId} -> ${out[0]!.prefixes[0]}`);
