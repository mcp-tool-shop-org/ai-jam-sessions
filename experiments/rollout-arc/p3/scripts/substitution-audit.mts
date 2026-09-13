// Substrate probe, audit — is the model making real harmonic substitutions, or
// shuffling text to clear the non-triviality guard?
//
// Raised by external brief 011's reviewer as reason (b) that 0.489 might be an
// artifact. No model in the loop; this reads the committed completions.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAbcChords } from "../../../../src/maker/abc-chord-proposer.js";
import type { ERItem } from "../../../../src/maker/er-gate.js";

const runs = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const items: ERItem[] = JSON.parse(readFileSync(join(runs, "er-items.json"), "utf8"));
const byId = new Map(items.map((i) => [i.itemId, i]));
const rows = readFileSync(join(runs, "er-g8.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

const changed: number[] = [];
const distinctChords: number[] = [];
const vocab = new Map<string, number>();
let analysed = 0;

for (const r of rows) {
  const item = byId.get(r.itemId)!;
  const measureNumbers = item.sourceChords.map((s) => s.measure);
  const src = item.sourceChords.map((s) => s.impliedChord);
  for (const abc of r.completions as string[]) {
    const ch = parseAbcChords(abc, measureNumbers).map((c) => c.intendedChord);
    if (!ch.length) continue;
    analysed++;
    const n = Math.min(ch.length, src.length);
    let diff = 0;
    for (let i = 0; i < n; i++) if (ch[i] !== src[i]) diff++;
    changed.push(diff / n);
    distinctChords.push(new Set(ch).size);
    for (const c of ch) vocab.set(c, (vocab.get(c) ?? 0) + 1);
  }
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const top = [...vocab.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

console.log(`completions analysed: ${analysed}`);
console.log(`mean fraction of bars changed vs source harmony: ${mean(changed).toFixed(3)}`);
console.log(`  (the non-triviality guard requires only 0.333)`);
console.log(`completions changing EVERY bar: ${changed.filter((f) => f === 1).length} / ${analysed}`);
console.log(`mean distinct chord symbols per 8-bar completion: ${mean(distinctChords).toFixed(2)}`);
console.log(`distinct chord symbols across the corpus: ${vocab.size}`);
console.log(`most used: ${top.map(([c, n]) => `${c}(${n})`).join(" ")}`);
