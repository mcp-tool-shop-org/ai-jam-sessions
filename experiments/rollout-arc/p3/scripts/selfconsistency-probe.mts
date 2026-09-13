// Would a SELF-CONSISTENCY constraint bite? Instead of matching the body's melody
// to the item's (ill-posed: the source right hand is polyphonic), require that the
// notes the model WROTE are consonant with the chords it WROTE. A fixed two-note
// figure cannot sit consonantly under eight different chords, so this kills the
// placeholder without demanding transcription.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAbcBody } from "../../../../src/maker/abc-syntax.js";

const runs = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const rows = readFileSync(join(runs, "er-g8.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const body = (c: string) => c.split(/K:[^\n]*\n/)[1] ?? c;

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const noteToPc = (tok: string): number | null => {
  const m = /^([\^_=]*)([A-Ga-g])/.exec(tok);
  if (!m) return null;
  let pc = PC[m[2]!.toUpperCase()]!;
  for (const a of m[1]!) pc += a === "^" ? 1 : a === "_" ? -1 : 0;
  return ((pc % 12) + 12) % 12;
};
// Pitch classes a chord symbol implies (root + quality skeleton). Deliberately
// generous: we are asking "could this note belong", not grading voice leading.
const chordPcs = (sym: string): Set<number> | null => {
  const m = /^([A-G][#b]?)(.*)$/.exec(sym.trim());
  if (!m) return null;
  let root = PC[m[1]![0]!]!;
  if (m[1]![1] === "#") root += 1;
  if (m[1]![1] === "b") root -= 1;
  root = ((root % 12) + 12) % 12;
  const q = m[2]!.toLowerCase();
  const third = /m(?!aj)|min|dim|ø/.test(q) ? 3 : /sus4/.test(q) ? 5 : /sus2/.test(q) ? 2 : 4;
  const fifth = /dim|ø|b5/.test(q) ? 6 : /aug|\+|#5/.test(q) ? 8 : 7;
  const set = new Set([root, (root + third) % 12, (root + fifth) % 12]);
  if (/7|9|11|13/.test(q)) set.add((root + (/maj7|maj9/.test(q) ? 11 : 10)) % 12);
  if (/9|add9/.test(q)) set.add((root + 2) % 12);
  if (/6/.test(q)) set.add((root + 9) % 12);
  return set;
};

let bodies = 0, pass = 0;
const rates: number[] = [];
for (const r of rows) {
  for (const c of r.completions as string[]) {
    const b = body(c);
    if (!validateAbcBody(b).ok) continue;
    bodies++;
    const bars = b.split("|").map((x) => x.trim()).filter(Boolean);
    let checked = 0, fit = 0;
    for (const bar of bars) {
      const sym = /"([^"]*)"/.exec(bar)?.[1];
      if (!sym) continue;
      const pcs = chordPcs(sym);
      if (!pcs) continue;
      const music = bar.replace(/"[^"]*"/g, "");
      for (const tok of music.match(/[\^_=]*[A-Ga-g]/g) ?? []) {
        const pc = noteToPc(tok);
        if (pc === null) continue;
        checked++;
        if (pcs.has(pc)) fit++;
      }
    }
    if (!checked) continue;
    const rate = fit / checked;
    rates.push(rate);
    if (rate >= 0.75) pass++;
  }
}
const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
console.log(`syntactically valid bodies: ${bodies}`);
console.log(`mean fraction of WRITTEN notes that fit the WRITTEN chord: ${mean.toFixed(3)}`);
console.log(`bodies at >= 0.75 self-consistency: ${pass} / ${rates.length} = ${(pass / rates.length).toFixed(3)}`);
