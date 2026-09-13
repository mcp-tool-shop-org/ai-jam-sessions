// Stratified sample for the manual audit required by ABC-VALIDATOR-SPEC.md
// §Acceptance 5. Prints accepted and rejected bodies so a human (or a different
// model family) can confirm each verdict is musically right — the validator is
// NOT judged by the pass rate it produces.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAbcBody } from "../../../../src/maker/abc-syntax.js";

const runs = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const rows = readFileSync(join(runs, "er-g8.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const body = (c: string) => c.split(/K:[^\n]*\n/)[1] ?? c;

const accepted: Array<{ id: string; text: string }> = [];
const rejected: Array<{ id: string; text: string; reason: string }> = [];

for (const r of rows) {
  for (const c of r.completions as string[]) {
    const b = body(c);
    const v = validateAbcBody(b);
    if (v.ok) accepted.push({ id: r.itemId, text: b });
    else rejected.push({ id: r.itemId, text: b, reason: v.reason });
  }
}

const nAcc = Number(process.argv[2] ?? 6);
const nRej = Number(process.argv[3] ?? 8);
const spread = <T,>(a: T[], n: number): T[] => {
  const step = Math.max(1, Math.floor(a.length / n));
  return a.filter((_, i) => i % step === 0).slice(0, n);
};

console.log(`accepted ${accepted.length} | rejected ${rejected.length}`);
console.log("\n========== ACCEPTED ==========");
for (const x of spread(accepted, nAcc)) {
  console.log(`--- ${x.id}\n${x.text.trim().slice(0, 200)}\n`);
}
console.log("\n========== REJECTED ==========");
for (const x of spread(rejected, nRej)) {
  console.log(`--- ${x.id}  [${x.reason.slice(0, 50)}]\n${x.text.trim().slice(0, 180)}\n`);
}
