// EXPLORING STARTS (prefix forcing) — build a prompt set where each rollout is
// pre-filled with a DIFFERENT valid opening voicing.
//
// The curriculum cell failed on representation: [0,1] opens 87.4% of passing
// completions, at zero optimisation pressure, so it is the base model's prior. GEC
// cannot fix that — it injects one heuristic answer and has no mechanism to make the
// policy sample outside its own prior.
//
// Classical fix (Sutton & Barto): exploring starts. Initialise the agent across the
// state space so it must learn the value of actions everywhere, not just on its
// preferred path. For an LLM that is prefix forcing: pre-fill the assistant turn with
// an opening the model would not have chosen, and let it complete the trajectory.
//
// IMPORTANT, and stated here so it cannot be claimed later: the pass rate this
// produces is P(complete correctly | forced opening). It is a CONDITIONAL and must
// never be compared to the unconditioned 0.389. What it can establish is whether the
// policy has any competence away from [0,1], or only on it.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSpecRealization } from "../../../../src/compose/index.js";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const VOICES = 2;
const G = Number(process.env.GENS ?? 16);

const rows = readFileSync(join(RUNS, "spec-prompts-4bar-random.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));

/** Which [bass, upper] degree pairs actually render two real pitches on measure 1?
 *  Determined by RENDERING each candidate, not by guessing the chord's cardinality. */
function validOpenings(progression: { chords: Array<{ measure: number; chordSymbol: string }> }): number[][] {
  const first = progression.chords.find((c) => c.chordSymbol && c.chordSymbol !== "N/C");
  if (!first) return [[0, 1]];
  const ok: number[][] = [];
  for (let a = 0; a <= 3; a++) {
    for (let b = 0; b <= 3; b++) {
      const spec = [{ measure: first.measure, degrees: [a, b] }];
      const real = renderSpecRealization(progression as never, spec as never, VOICES);
      const frame = real.frames.find((f) => f.measure === first.measure);
      if (frame && frame.voices.length === VOICES) ok.push([a, b]);
    }
  }
  return ok.length ? ok : [[0, 1]];
}

// Deterministic assignment: rollout i of a group gets opening i mod |valid|, so the
// group SPANS the opening space by construction rather than by luck.
const out = rows.map((r) => {
  const openings = validOpenings(r.progression);
  const first = r.progression.chords.find((c: { chordSymbol: string }) => c.chordSymbol && c.chordSymbol !== "N/C");
  const prefixes = Array.from({ length: G }, (_, i) => {
    const [a, b] = openings[i % openings.length]!;
    // The partial assistant turn the model will continue from.
    return `[{"measure": ${first.measure}, "degrees": [${a}, ${b}]},`;
  });
  return { ...r, openings_available: openings.length, prefixes };
});

writeFileSync(
  join(RUNS, "spec-4bar-prefixed.jsonl"),
  out.map((o) => JSON.stringify(o)).join("\n") + "\n"
);

const hist: Record<number, number> = {};
for (const o of out) hist[o.openings_available] = (hist[o.openings_available] ?? 0) + 1;
console.log(`items: ${out.length} | G: ${G}`);
console.log(`valid openings per item: ${JSON.stringify(hist)}`);
console.log(`sample prefixes for ${out[0]!.songId}:`);
for (const p of out[0]!.prefixes.slice(0, 5)) console.log(`  ${p}`);
