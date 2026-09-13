// Score the Verbalized Sampling control against standard sampling, on one pool, one model.
//
// The question: does asking the model for a SET of candidates with probabilities move
// top_first_measure_share, with no training at all? If prompting alone moves it, every RL
// arm aimed at the prior has to beat a free baseline.
//
// PARSING DISCIPLINE: the outer envelope {probability, voicing} is sliced here, and each
// inner `voicing` is handed to the SAME parseSpecResponse/scoreVoicing that scores every
// other completion in this arc. The per-measure format has exactly one implementation.
//
// Both statistics are reported, because they are different objects:
//   passing-only : the arc's published definition (score-curriculum.mts populates its
//                  first-measure histogram inside `if (s.correct)`), which blends the
//                  POLICY'S PRIOR with the VERIFIER'S ADMISSIBILITY PROFILE
//   all          : the policy's raw opening distribution, verifier removed
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);
const firstDeg = (raw: string) => ((parseSpecResponse(raw)[0]?.degrees ?? []) as number[]).join(",") || "(none)";

type Stat = { pass: number; total: number; hPass: Map<string, number>; hAll: Map<string, number>; nPass: number };
const blank = (): Stat => ({ pass: 0, total: 0, hPass: new Map(), hAll: new Map(), nPass: 0 });

function tally(s: Stat, prog: unknown, raw: string) {
  s.total++;
  const d = firstDeg(raw);
  s.hAll.set(d, (s.hAll.get(d) ?? 0) + 1);
  if (scoreVoicing(prog, raw, VOICES, STYLE).correct) {
    s.pass++; s.nPass++;
    s.hPass.set(d, (s.hPass.get(d) ?? 0) + 1);
  }
}

// Tolerant outer parse: models wrap JSON in prose or fences. Slice the outermost array.
function outerArray(raw: string): unknown[] | null {
  const i = raw.indexOf("["), j = raw.lastIndexOf("]");
  if (i < 0 || j <= i) return null;
  try {
    const v = JSON.parse(raw.slice(i, j + 1));
    return Array.isArray(v) ? v : null;
  } catch { return null; }
}

function progMap(promptsFile: string) {
  return new Map(readFileSync(join(RUNS, promptsFile), "utf8").trim().split("\n").filter(Boolean)
    .map((l) => JSON.parse(l)).map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
}

function report(label: string, s: Stat, extra = "") {
  const share = (h: Map<string, number>, n: number) => (n ? Math.max(...h.values()) / n : 0);
  console.log(
    `${label.padEnd(22)} pass ${(s.pass / Math.max(1, s.total)).toFixed(4)} (${s.pass}/${s.total})   ` +
    `topFirst passing ${share(s.hPass, s.nPass).toFixed(3)} (${s.hPass.size} distinct)   ` +
    `ALL ${share(s.hAll, s.total).toFixed(3)} (${s.hAll.size} distinct)${extra}`
  );
}

// --- standard sampling control (already on disk) ---
const stdFile = process.env.STD_FILE ?? "mc-heldout-base.jsonl";
if (existsSync(join(RUNS, stdFile))) {
  const byId = progMap("prompts-heldout-v1.jsonl");
  const s = blank();
  for (const l of readFileSync(join(RUNS, stdFile), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    for (const raw of r.completions) tally(s, prog, raw);
  }
  report("STANDARD (base)", s);
} else {
  console.log(`(standard control ${stdFile} not present)`);
}

// --- verbalized sampling ---
const vsFile = process.env.VS_FILE ?? "vs-heldout-base.jsonl";
if (!existsSync(join(RUNS, vsFile))) {
  console.log(`(VS generations ${vsFile} not present yet -- run probe_generate on prompts-vs-heldout.jsonl)`);
} else {
  const byId = progMap("prompts-vs-heldout.jsonl");
  const s = blank();
  let completions = 0, envelopeOk = 0, kSum = 0;
  const probs: number[] = [];
  for (const l of readFileSync(join(RUNS, vsFile), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    for (const raw of r.completions) {
      completions++;
      const arr = outerArray(raw);
      if (!arr) continue;
      // A bare per-measure array (the model ignoring the envelope) is NOT a VS response and
      // must not be counted as one -- that would silently compare the control to itself.
      const cands = arr.filter((e) => e && typeof e === "object" && "voicing" in (e as object));
      if (!cands.length) continue;
      envelopeOk++; kSum += cands.length;
      for (const c of cands as Array<{ probability?: number; voicing?: unknown }>) {
        if (typeof c.probability === "number") probs.push(c.probability);
        if (c.voicing == null) continue;
        tally(s, prog, JSON.stringify(c.voicing));
      }
    }
  }
  const meanP = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : NaN;
  report("VERBALIZED SAMPLING", s,
    `\n${" ".repeat(22)}envelope ok ${envelopeOk}/${completions} completions, mean k ${(kSum / Math.max(1, envelopeOk)).toFixed(2)}, mean stated probability ${meanP.toFixed(3)}`);
}
console.log("\nIf VS moves topFirst materially, prompting alone beats the RL arms measured so far,");
console.log("and any prior-flattening arm must be priced against a free baseline.");
