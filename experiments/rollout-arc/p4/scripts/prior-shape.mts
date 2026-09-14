// WHAT IS THE PRIOR, ACTUALLY? $0, no GPU, from files already on disk.
//
// Six phases have reported one number for the opening prior -- item-wise modal share, 0.93 --
// and then argued about whether RL moves it. A modal share of 0.93 is compatible with two very
// different distributions:
//
//   (a) the model emits ONE opening and nothing else            -> support 1, nothing to move
//   (b) the model emits several and one dominates               -> support k, mass to redistribute
//
// The director's hypothesis is that instruction tuning concentrated the prior and a blanker
// base checkpoint would have more room. Whether that hypothesis is even well-posed depends on
// which of (a) or (b) we are in, and that has never been measured -- only the modal share has.
//
// This measures the SHAPE: support size, how much of the alphabet is touched, how much mass
// sits outside the mode, and whether the non-modal mass is admissible. No bootstrap, no
// inference -- these are counts.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing, validOpenings } from "../../scripts/p4-vl-server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const RUNS = join(here, "..", "runs");
const ART = join(here, "..", "artifacts");
const prompts = readFileSync(join(RUNS, "prompts-heldout-v1.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const byId = new Map(prompts.map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
const fd = (r: string) => ((parseSpecResponse(r)[0]?.degrees ?? []) as number[]).join(",") || "(none)";
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };

function shape(file: string, label: string) {
  const path = existsSync(join(ART, file)) ? join(ART, file) : join(RUNS, file);
  if (!existsSync(path)) { console.log(`  ${label.padEnd(22)} (absent)`); return; }
  const support: number[] = [], modal: number[] = [], admitSupport: number[] = [], modalAdmissible: number[] = [];
  const nonModalAdmitRate: number[] = [], unparseableShare: number[] = [];
  for (const l of readFileSync(path, "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    // histogram of first-chord identity, plus whether each distinct opening ever passed
    const h = new Map<string, number>(), passed = new Map<string, number>();
    let unparseable = 0;
    for (const raw of r.completions) {
      const d = fd(raw);
      if (d === "(none)") unparseable++;
      h.set(d, (h.get(d) ?? 0) + 1);
      if (scoreVoicing(prog, raw, 2, "common-practice").correct) passed.set(d, (passed.get(d) ?? 0) + 1);
    }
    const n = r.completions.length;
    const top = Math.max(...h.values());
    const mode = [...h.entries()].find(([, c]) => c === top)![0];
    support.push(h.size);
    modal.push(top / n);
    admitSupport.push([...passed.keys()].filter((k) => (passed.get(k) ?? 0) > 0).length);
    modalAdmissible.push((passed.get(mode) ?? 0) > 0 ? 1 : 0);
    unparseableShare.push(unparseable / n);
    // of the mass NOT on the mode, how much of it is admissible?
    const offMode = n - top;
    const offModePass = [...passed.entries()].filter(([k]) => k !== mode).reduce((s, [, c]) => s + c, 0);
    if (offMode > 0) nonModalAdmitRate.push(offModePass / offMode);
  }
  console.log(
    `  ${label.padEnd(22)} support ${mean(support).toFixed(2)} (median ${med(support)})  ` +
    `modal ${(100 * mean(modal)).toFixed(1)}%  ` +
    `distinct-passing ${mean(admitSupport).toFixed(2)}  ` +
    `mode-is-admissible ${(100 * mean(modalAdmissible)).toFixed(0)}%  ` +
    `off-mode pass ${(100 * mean(nonModalAdmitRate)).toFixed(1)}%  ` +
    `unparseable ${(100 * mean(unparseableShare)).toFixed(1)}%`,
  );
}

// The alphabet, measured on the HELD-OUT pool rather than carried over from the trained one.
// arm_guards.py reads `openings_per_item` off the bridge for the 32-item TRAINING fixture
// ({"16": 32}); the held-out prompts file has no `prefixes` column, so that 16 is NOT a
// measurement of this pool. Deriving it here is the difference between a number and a
// number's cousin -- which is the error class this arc keeps paying for.
const alpha = new Map<number, number>();
for (const r of prompts as Array<{ progression: unknown }>) {
  const n = validOpenings(r.progression, 2).length;
  alpha.set(n, (alpha.get(n) ?? 0) + 1);
}
console.log(`\n=== ADMISSIBLE OPENINGS PER HELD-OUT ITEM (2 voices), measured on THIS pool ===`);
for (const [k, v] of [...alpha.entries()].sort((a, b) => a[0] - b[0])) console.log(`  ${k} openings: ${v} items`);

console.log(`\n=== SHAPE OF THE OPENING PRIOR, n=${prompts.length} held-out items, G=64 ===`);
console.log(`  support            = distinct first-chords emitted per item (out of 64 samples)`);
console.log(`  modal              = share of the single most common one  <- the only number six phases reported`);
console.log(`  distinct-passing   = how many DIFFERENT openings ever produced an admissible passage`);
console.log(`  off-mode pass      = pass rate of the mass that is NOT the mode`);
console.log();
// The director's hypothesis, measured. Same 75 items, same G=64, same generation seed.
// ARM A runs the base checkpoint through OUR envelope with the stopping rule made comparable
// (--eos-token-ids 151645,151643); without that override it would never stop at the turn
// boundary and would read as a format failure that was really a config mismatch.
shape("mc64-heldout-q3base-chatml.jsonl", "Qwen3-4B-BASE ChatML");
shape("mc64-heldout-q3base-raw.jsonl", "Qwen3-4B-BASE no-tmpl");
console.log();
shape("mc64-heldout-base.jsonl", "INSTRUCT (pod)");
shape("mc64-heldout-C7.jsonl", "C7  beta=1e-4");
shape("mc64-heldout-C9.jsonl", "C9  the flattener");
shape("mc64-heldout-B07.jsonl", "B07 beta=0");
shape("mc64-heldout-B09.jsonl", "B09 beta=0");
// ⚑ There WAS a second row here labelled "BASE (local rig)". It was a defect, caught on
// review: `shape()` resolves ART before RUNS (line 33), and `mc64-heldout-base.jsonl` exists in
// BOTH, so that row re-read the POD file and printed it twice under two labels. A reader would
// have taken two identical rows as a local-vs-pod agreement check. The real cross-platform
// comparison is `platform-concentration.mts` and it is already done: -0.40pp [-1.13, +0.27].
// Removed rather than repaired: this script measures the SHAPE of a prior, and a
// platform contrast belongs in the script that was written to make one.
console.log(`\n  If support is ~1, the prior has no mass to redistribute and a flatter checkpoint is`);
console.log(`  the only lever. If support is >1 with a dominant mode, the mass is already there and`);
console.log(`  the question is why 200 steps of a verifier reward will not move it.`);
