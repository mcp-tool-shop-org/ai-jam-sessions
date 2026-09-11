#!/usr/bin/env node
// ─── pass@k over multi-attempt ollama-grade / guess-test jsonl ───────────────
//
// Gold matching is byte-identical to score_v1.mjs (label after the last colon,
// then the same normaliser). pass@k is the Chen et al. unbiased estimator
// from n attempts with c correct:
//   pass@k = 1 - C(n-c, k) / C(n, k)
// so pass@1 = c/n and pass@n = 1 iff c ≥ 1.
//
//   node score-passk.mjs gold-test.jsonl preds.jsonl [--k 8] [--out report.json]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LEARNABILITY_BAND = Object.freeze({ lo: 0.125, hi: 0.5 });

const norm = (s) =>
  String(s ?? "").trim().replace(/^["']|["']$/g, "").trim()
    .replace(/\s+/g, " ").replace(/\.$/, "").toLowerCase();

/** Label after the final colon, else the whole string. Matches score_v1.mjs. */
export const labelOf = (s) => {
  const t = String(s ?? "").trim().split(/\n/).find((l) => l.trim()) ?? "";
  if (t.includes(":")) {
    const tail = t.split(":").pop().trim();
    if (tail) return norm(tail);
  }
  return norm(t);
};

export function comb(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c;
}

/** Chen, Yu, Jurafsky, Manning 2021-style unbiased pass@k. */
export function passAtK(n, c, k) {
  if (n <= 0) return 0;
  if (k > n) k = n;
  if (n - c < k) return 1;
  return 1 - comb(n - c, k) / comb(n, k);
}

export function bandOf(rate) {
  if (rate < LEARNABILITY_BAND.lo) return "below";
  if (rate > LEARNABILITY_BAND.hi) return "above";
  return "in_band";
}

function readJsonl(p) {
  return readFileSync(p, "utf8").trim().split(/\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
}

export function groupAttempts(preds) {
  const byId = new Map();
  for (const p of preds) {
    const slot = byId.get(p.id) ?? [];
    slot.push(p);
    byId.set(p.id, slot);
  }
  for (const [id, slot] of byId) {
    slot.sort((a, b) => (a.attempt ?? 0) - (b.attempt ?? 0));
    byId.set(id, slot);
  }
  return byId;
}

export function scoreCase(gold, attempts) {
  const g = norm(gold);
  const hits = attempts.map((p) => labelOf(p.answer) === g);
  const c = hits.filter(Boolean).length;
  const n = attempts.length;
  // INTELLECT-2's [12.5%, 50%] band is a per-case sample success rate
  // (c/8), not Chen pass@8 — at n=k=8 that estimator is binary and the
  // band would be empty by construction.
  const rate = n ? c / n : 0;
  return {
    n,
    correct: c,
    pass1: passAtK(n, c, 1),
    pass8: passAtK(n, c, Math.min(8, n)),
    rate,
    band: bandOf(rate),
    greedy_hit: hits[0] === true,
  };
}

export function scorePassK(goldRows, preds, k = 8) {
  const gold = new Map(goldRows.map((g) => [g.id, g]));
  const byId = groupAttempts(preds);
  const families = [...new Set([...gold.values()].map((g) => g.family))].sort();
  const cases = [];
  for (const g of goldRows) {
    const attempts = byId.get(g.id) ?? [];
    const scored = scoreCase(g.gold, attempts);
    cases.push({
      id: g.id,
      family: g.family,
      gold: g.gold,
      ...scored,
    });
  }

  const summarise = (rows) => {
    const n = rows.length;
    const pass1 = n ? rows.reduce((s, r) => s + r.pass1, 0) / n : 0;
    const pass8 = n ? rows.reduce((s, r) => s + r.pass8, 0) / n : 0;
    const greedy = n ? rows.filter((r) => r.greedy_hit).length / n : 0;
    const histogram = { below: 0, in_band: 0, above: 0 };
    for (const r of rows) histogram[r.band]++;
    return { n, pass1, pass8, greedy_pass1: greedy, histogram };
  };

  const per_family = Object.fromEntries(
    families.map((f) => [f, summarise(cases.filter((c) => c.family === f))]),
  );
  const constant = families.filter(
    (f) => new Set(goldRows.filter((g) => g.family === f).map((g) => g.gold)).size < 2,
  );

  return {
    k,
    overall: summarise(cases),
    per_family,
    constant_gold_families: constant,
    cases,
  };
}

function parseCli(argv) {
  const rest = [];
  const out = { gold: null, preds: null, k: 8, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--k") out.k = Number(argv[++i]);
    else if (a === "--out") out.out = argv[++i];
    else if (a.startsWith("-")) throw new Error(`unknown flag ${a}`);
    else rest.push(a);
  }
  out.gold = rest[0];
  out.preds = rest[1];
  if (!out.gold || !out.preds) throw new Error("usage: score-passk.mjs <gold.jsonl> <preds.jsonl> [--k 8] [--out report.json]");
  if (!Number.isInteger(out.k) || out.k < 1) throw new Error("--k must be a positive integer");
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const args = parseCli(process.argv.slice(2));
  const report = scorePassK(readJsonl(args.gold), readJsonl(args.preds), args.k);
  const text = JSON.stringify(report, null, 2);
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true });
    writeFileSync(args.out, text + "\n", "utf8");
  }
  process.stdout.write(text + "\n");
}
