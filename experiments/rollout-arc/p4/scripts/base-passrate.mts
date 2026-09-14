// Pass rate and item-wise concentration for the base-probe arms, on the same 75 held-out items
// and the same verifier call every other number in this arc used. prior-shape.mts characterises
// the SHAPE of the prior; this is the quantity six phases actually optimised, so the two arms
// have to be quotable on it or they cannot be compared to anything already published.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const RUNS = join(here, "..", "runs"), ART = join(here, "..", "artifacts");
const byId = new Map(readFileSync(join(RUNS, "prompts-heldout-v1.jsonl"), "utf8").trim().split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
const fd = (r: string) => ((parseSpecResponse(r)[0]?.degrees ?? []) as number[]).join(",") || "(none)";
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
function read(f: string, label: string) {
  const p = existsSync(join(ART, f)) ? join(ART, f) : join(RUNS, f);
  if (!existsSync(p)) { console.log(`  ${label.padEnd(24)} (absent)`); return; }
  const rate: number[] = [], conc: number[] = [], anyPass: number[] = [];
  for (const l of readFileSync(p, "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    const h = new Map<string, number>(); let k = 0;
    for (const raw of r.completions) {
      h.set(fd(raw), (h.get(fd(raw)) ?? 0) + 1);
      if (scoreVoicing(prog, raw, 2, "common-practice").correct) k++;
    }
    rate.push(k / r.completions.length);
    anyPass.push(k > 0 ? 1 : 0);
    conc.push(Math.max(...h.values()) / r.completions.length);  // all-completions form, as published
  }
  console.log(`  ${label.padEnd(24)} pass ${(100 * mean(rate)).toFixed(2)}%   items with >=1 pass ${(100 * mean(anyPass)).toFixed(0)}%   concentration(all) ${mean(conc).toFixed(4)}`);
}
console.log(`\n=== PASS RATE, 75 held-out items, G=64 ===`);
console.log(`  concentration(all) is the ORIGINAL all-completions form the arc published, kept here`);
console.log(`  so these rows are comparable to every prior number. It is not the parseable-only form.\n`);
read("mc64-heldout-q3base-fewshot.jsonl", "BASE no-tmpl +FEWSHOT");
read("mc64-heldout-q3base-chatml.jsonl", "Qwen3-4B-BASE ChatML");
read("mc64-heldout-q3base-raw.jsonl", "Qwen3-4B-BASE no-tmpl");
console.log();
read("mc64-heldout-base.jsonl", "INSTRUCT base");
read("mc64-heldout-C7.jsonl", "C7 trained");
read("mc64-heldout-B07.jsonl", "B07 trained");
