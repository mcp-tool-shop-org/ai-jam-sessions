// How far from valid are the rejected bodies? A body that is one notation
// convention away from parsing is a very different training signal from one that
// is a pasted melody table. Measured, no model in the loop.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAbcBody } from "../../../../src/maker/abc-syntax.js";

const runs = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const rows = readFileSync(join(runs, "er-g8.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const body = (c: string) => c.split(/K:[^\n]*\n/)[1] ?? c;

// ABC spells a sharp ^C and a flat _C. Rewrite the common C#/Cb convention OUTSIDE
// quoted chord annotations, then re-validate: anything that now parses was a
// notation-convention miss, not malformed music.
function fixAccidentals(text: string): string {
  const parts = text.split(/("[^"]*")/); // keep chord annotations intact
  return parts
    .map((p, i) =>
      i % 2 === 1 ? p : p.replace(/([A-Ga-g])#/g, "^$1").replace(/([A-Ga-g])b(?![a-g])/g, "_$1")
    )
    .join("");
}

let rejected = 0;
let fixedByAccidental = 0;
const stillBroken = new Map<string, number>();

for (const r of rows) {
  for (const c of r.completions as string[]) {
    const b = body(c);
    const v = validateAbcBody(b);
    if (v.ok) continue;
    rejected++;
    const v2 = validateAbcBody(fixAccidentals(b));
    if (v2.ok) fixedByAccidental++;
    else stillBroken.set(v2.reason, (stillBroken.get(v2.reason) ?? 0) + 1);
  }
}

console.log(`rejected bodies: ${rejected}`);
console.log(`parse after ONLY rewriting C# -> ^C / Cb -> _C: ${fixedByAccidental} (${((100 * fixedByAccidental) / rejected).toFixed(1)}%)`);
console.log("still rejected, by first reason:");
for (const [r, n] of [...stillBroken.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n}  ${r}`);
}
