// Do accepted bodies carry the ITEM's melody, or a placeholder? The E-R gate reads
// the melody from the item, never from the ABC body, so a body of repeated filler
// notes still clears consonance. This measures what the model actually wrote.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAbcBody } from "../../../../src/maker/abc-syntax.js";

const runs = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const rows = readFileSync(join(runs, "er-g8.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const body = (c: string) => c.split(/K:[^\n]*\n/)[1] ?? c;

const distinct: number[] = [];
let placeholderish = 0;
for (const r of rows) {
  for (const c of r.completions as string[]) {
    const b = body(c);
    if (!validateAbcBody(b).ok) continue;
    const music = b.replace(/"[^"]*"/g, "");
    const notes = music.match(/[\^_=]*[A-Ga-g][,']*/g) ?? [];
    const d = new Set(notes).size;
    distinct.push(d);
    if (d <= 3) placeholderish++;
  }
}
const mean = distinct.reduce((a, b) => a + b, 0) / distinct.length;
console.log(`accepted bodies: ${distinct.length}`);
console.log(`mean DISTINCT pitches in the tune body: ${mean.toFixed(2)}`);
console.log(`bodies using <= 3 distinct pitches across all 8 bars: ${placeholderish} (${((100 * placeholderish) / distinct.length).toFixed(1)}%)`);
