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

let stdStat: Stat | null = null, vsStat: Stat | null = null;
const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);
const firstDeg = (raw: string) => ((parseSpecResponse(raw)[0]?.degrees ?? []) as number[]).join(",") || "(none)";

// Per-item opening lists are kept so the comparison can be made at MATCHED n.
// VS yields 40 realizations per item (8 completions x K=5) against standard sampling's 16,
// and modal share is biased UPWARD at small n -- fewer draws show less of the tail. So a
// raw 40-draw vs 16-draw comparison is rigged in favour of VS looking more diverse.
// The matched-n figure subsamples VS down to 16 per item, many times, and averages.
type Stat = { pass: number; total: number; hPass: Map<string, number>; hAll: Map<string, number>; nPass: number; byItem: Map<string, string[]> };
const blank = (): Stat => ({ pass: 0, total: 0, hPass: new Map(), hAll: new Map(), nPass: 0, byItem: new Map() });

function tally(s: Stat, prog: unknown, raw: string, itemId = "") {
  s.total++;
  const d = firstDeg(raw);
  if (itemId) { const l = s.byItem.get(itemId) ?? []; l.push(d); s.byItem.set(itemId, l); }
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
    for (const raw of r.completions) tally(s, prog, raw, r.itemId);
  }
  report("STANDARD (base)", s);
  stdStat = s;
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
        tally(s, prog, JSON.stringify(c.voicing), r.itemId);
      }
    }
  }
  const meanP = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : NaN;
  vsStat = s;
  report("VERBALIZED SAMPLING", s,
    `\n${" ".repeat(22)}envelope ok ${envelopeOk}/${completions} completions, mean k ${(kSum / Math.max(1, envelopeOk)).toFixed(2)}, mean stated probability ${meanP.toFixed(3)}`);
}
console.log("\nIf VS moves topFirst materially, prompting alone beats the RL arms measured so far,");
console.log("and any prior-flattening arm must be priced against a free baseline.");

// ---- ITEM-WISE opening concentration at MATCHED n ----
// Two corrections at once: item-wise (immune to which items contribute) and matched-n
// (immune to the upward bias of modal share at small sample size).
let rs = 20260913;
const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0), rs / 4294967296);
function itemwiseConc(byItem: Map<string, string[]>, n: number, reps: number) {
  const per: number[] = [];
  for (const [, list] of byItem) {
    if (list.length < n) continue;
    let acc = 0;
    for (let r = 0; r < reps; r++) {
      const pool = list.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
      const h = new Map<string, number>();
      for (const d of pool.slice(0, n)) h.set(d, (h.get(d) ?? 0) + 1);
      acc += Math.max(...h.values()) / n;
    }
    per.push(acc / reps);
  }
  return { mean: per.reduce((a, b) => a + b, 0) / Math.max(1, per.length), items: per.length };
}
function report2(label: string, s: Stat) {
  const full = itemwiseConc(s.byItem, Math.min(...[...s.byItem.values()].map((v) => v.length)), 1);
  const m16 = itemwiseConc(s.byItem, 16, 200);
  const realizations = [...s.byItem.values()].reduce((a, b) => a + b.length, 0) / Math.max(1, s.byItem.size);
  console.log(`  ${label.padEnd(22)} item-wise@full ${full.mean.toFixed(4)}   item-wise@n=16 ${m16.mean.toFixed(4)}   (${realizations.toFixed(0)} realizations/item, ${m16.items} items)`);
}
console.log(`\n  ITEM-WISE opening concentration -- composition-immune, and at MATCHED n=16`);
if (stdStat) report2("STANDARD (base)", stdStat);
if (vsStat) report2("VERBALIZED SAMPLING", vsStat);
console.log(`  base arm-C reference: training moved item-wise concentration -9.00pp [-12.00, -6.00]`);
