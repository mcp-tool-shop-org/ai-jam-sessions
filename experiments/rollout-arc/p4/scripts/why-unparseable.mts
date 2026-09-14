// WHY does 25.9% fail to parse? Free, from the file. "Truncated at the cap" and "emitted
// something the parser cannot read" have completely different fixes -- more tokens / an
// earlier stop, versus a few-shot or a grammar -- and spending GPU to learn which would be
// spending to learn what the lengths column already records.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
const here = dirname(fileURLToPath(import.meta.url));
const RUNS = join(here, "..", "runs"), ART = join(here, "..", "artifacts");
const CAP = 384;
const parses = (r: string) => ((parseSpecResponse(r)[0]?.degrees ?? []) as number[]).length > 0;
for (const [f, label] of [["mc64-heldout-q3base-raw.jsonl", "BASE no-template"],
                          ["mc64-heldout-q3base-chatml.jsonl", "BASE ChatML"]] as const) {
  const p = existsSync(join(RUNS, f)) ? join(RUNS, f) : join(ART, f);
  let bad = 0, badAtCap = 0, ok = 0, okAtCap = 0, total = 0;
  const samples: string[] = [];
  for (const l of readFileSync(p, "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { completions: string[]; lengths: number[] };
    r.completions.forEach((c, i) => {
      total++;
      const cap = r.lengths[i]! >= CAP;
      if (parses(c)) { ok++; if (cap) okAtCap++; }
      else { bad++; if (cap) badAtCap++; if (!cap && samples.length < 3) samples.push(c); }
    });
  }
  console.log(`\n=== ${label} ===`);
  console.log(`  unparseable ${bad}/${total} = ${(100*bad/total).toFixed(1)}%`);
  console.log(`    of those, TRUNCATED at the ${CAP}-token cap : ${badAtCap} = ${(100*badAtCap/bad).toFixed(1)}%`);
  console.log(`    of those, stopped on its own and still bad  : ${bad-badAtCap} = ${(100*(bad-badAtCap)/bad).toFixed(1)}%`);
  console.log(`  parseable ${ok}/${total}, of which at cap ${okAtCap} (${(100*okAtCap/Math.max(1,ok)).toFixed(1)}%)`);
  samples.forEach((s, i) => console.log(`  -- non-truncated failure ${i+1} (${s.length} chars): ${JSON.stringify(s.slice(0, 220))}`));
}
