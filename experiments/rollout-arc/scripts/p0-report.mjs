#!/usr/bin/env node
// ─── P0 GO / NO-GO, frozen before the sampled run ────────────────────────────
//
// These thresholds are the operationalisation of dispatch §6 P0. They are
// written here, and tested, before any model is called. Do not edit them
// after looking at P0 numbers.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scorePassK, LEARNABILITY_BAND } from "./score-passk.mjs";

/** A "population" — not a handful of flukes. ~17% of the 59-case split. */
export const MIN_IN_BAND = 10;

/** "Well below ceiling." 0.80 is the line, not 1.00, so a near-solved family cannot sneak through. */
export const PASS1_CEILING = 0.8;

// ─── The secondary criterion, declared before the P1f run ────────────────────
//
// The dispatch carries four research findings on what a trainable case is.
// Findings 22 (DAPO, arXiv:2503.14476), 23 (Foster et al., arXiv:2502.12272)
// and 26 (Absolute Zero, arXiv:2505.03335) all say NON-DEGENERATE: a group the
// policy neither always nor never solves — learnability p(1-p) > 0,
// r_propose > 0, a group that is not discarded and refilled. Finding 24
// (INTELLECT-2, arXiv:2505.07291) gives the narrow [12.5%, 50%] band, which is
// a selectivity filter applied to a 285,000-case pool.
//
// MIN_IN_BAND above froze P0's GO rule on finding 24 alone. What follows is the
// other three, counted beside it and never in place of it. It adds fields; it
// does not read, relax, or reweight the primary bar.

/** Same population bar as the primary. A handful of flukes is not a population. */
export const MIN_NON_DEGENERATE = 10;

/** Non-degenerate is 0 < c < n. At the pinned n = 8 that is 1 ≤ c ≤ 7. */
export function isNonDegenerate(correct, n) {
  return Number.isFinite(n) && n > 0 && correct > 0 && correct < n;
}

export function countNonDegenerate(cases) {
  return (cases ?? []).filter((c) => isNonDegenerate(c.correct, c.n)).length;
}

/**
 * The full c-of-n histogram. Bucket names spell the n = 8 shape the pin fixes:
 * c = 0 and c = 8 are the two degenerate ends, 1–4 and 5–7 the interior either
 * side of the midpoint. by_c carries every count, so no binning is hidden.
 */
export function correctHistogram(cases) {
  const out = { c0: 0, c1_4: 0, c5_7: 0, c8: 0, by_c: {} };
  for (const c of cases ?? []) {
    const n = c.n ?? 0;
    const k = c.correct ?? 0;
    out.by_c[k] = (out.by_c[k] ?? 0) + 1;
    if (k === 0) out.c0++;
    else if (k >= n) out.c8++;
    else if (k <= Math.floor(n / 2)) out.c1_4++;
    else out.c5_7++;
  }
  return out;
}

/**
 * Secondary verdict. Same shape and the same two conjuncts as the primary, with
 * the in-band count swapped for the non-degenerate count. Reported alongside:
 * a CLEAR here is not a GO — §3 of the P1f lock sends that to a director gate.
 */
export function nonDegenerateVerdict({ nonDegenerateAfterLeak, sampledPass1, nGold }) {
  const reasons = [];
  const population = nonDegenerateAfterLeak >= MIN_NON_DEGENERATE;
  const headroom = sampledPass1 < PASS1_CEILING;
  if (!population) {
    reasons.push(
      `non-degenerate after leak-filter is ${nonDegenerateAfterLeak} (need ≥ ${MIN_NON_DEGENERATE} of ${nGold})`,
    );
  }
  if (!headroom) {
    reasons.push(`sampled pass@1 is ${sampledPass1.toFixed(3)} (need < ${PASS1_CEILING})`);
  }
  if (population && headroom) {
    return {
      non_degenerate: "CLEAR",
      reasons: [
        `${nonDegenerateAfterLeak} cases with 1 ≤ c ≤ 7 of 8 after leak-filter`,
        `sampled pass@1 ${sampledPass1.toFixed(3)} < ${PASS1_CEILING}`,
      ],
    };
  }
  return { non_degenerate: "FAIL", reasons };
}

export function trivialBaselinesFromGold(goldRows) {
  const byFamily = new Map();
  for (const g of goldRows) {
    const slot = byFamily.get(g.family) ?? [];
    slot.push(g.gold);
    byFamily.set(g.family, slot);
  }
  const overall = [...goldRows.map((g) => g.gold)];
  const majority = (labels) => {
    const counts = new Map();
    for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
    let best = labels[0];
    let n = 0;
    for (const [l, c] of counts) {
      if (c > n) {
        best = l;
        n = c;
      }
    }
    return { majority_class: best, majority: labels.length ? n / labels.length : 0, n: labels.length };
  };
  return {
    overall: majority(overall),
    per_family: Object.fromEntries([...byFamily.entries()].sort().map(([f, labels]) => [f, majority(labels)])),
  };
}

/**
 * A case the no-tool baseline already solves within 8 attempts is a leak,
 * not a tool-use task (Kimi k1.5 N=8 guess-test). It cannot count toward
 * the learnability population.
 */
export function applyLeakFilter(sampledCases, guessCases) {
  const leak = new Set((guessCases ?? []).filter((c) => c.correct > 0).map((c) => c.id));
  const kept = sampledCases.filter((c) => !leak.has(c.id));
  return { leak_ids: [...leak].sort(), kept };
}

export function existingCorpusVerdict({ inBandAfterLeak, sampledPass1, nGold }) {
  const reasons = [];
  const population = inBandAfterLeak >= MIN_IN_BAND;
  const headroom = sampledPass1 < PASS1_CEILING;
  if (!population) {
    reasons.push(
      `in-band after leak-filter is ${inBandAfterLeak} (need ≥ ${MIN_IN_BAND} of ${nGold})`,
    );
  }
  if (!headroom) {
    reasons.push(`sampled pass@1 is ${sampledPass1.toFixed(3)} (need < ${PASS1_CEILING})`);
  }
  if (population && headroom) {
    return {
      existing_corpus: "GO",
      reasons: [
        `${inBandAfterLeak} cases in pass@8 [${LEARNABILITY_BAND.lo}, ${LEARNABILITY_BAND.hi}] after leak-filter`,
        `sampled pass@1 ${sampledPass1.toFixed(3)} < ${PASS1_CEILING}`,
      ],
    };
  }
  return {
    existing_corpus: "NO-GO",
    new_family: "GO-candidate",
    reasons,
  };
}

export function buildP0Report({ goldRows, greedyPreds, sampledPreds, guessPreds, pin }) {
  const baselines = trivialBaselinesFromGold(goldRows);
  const greedy = greedyPreds ? scorePassK(goldRows, greedyPreds, 1) : null;
  const sampled = scorePassK(goldRows, sampledPreds, 8);
  const guess = guessPreds ? scorePassK(goldRows, guessPreds, 8) : null;
  const leak = applyLeakFilter(sampled.cases, guess?.cases);
  const inBandAfterLeak = leak.kept.filter((c) => c.band === "in_band").length;
  const nonDegenerateAfterLeak = countNonDegenerate(leak.kept);
  const verdict = existingCorpusVerdict({
    inBandAfterLeak,
    sampledPass1: sampled.overall.pass1,
    nGold: goldRows.length,
  });
  return {
    pin,
    band: LEARNABILITY_BAND,
    go_rule: {
      min_in_band_after_leak: MIN_IN_BAND,
      sampled_pass1_below: PASS1_CEILING,
    },
    secondary_rule: {
      min_non_degenerate_after_leak: MIN_NON_DEGENERATE,
      sampled_pass1_below: PASS1_CEILING,
      definition: "0 < c < n (findings 22 / 23 / 26); at n = 8, 1 ≤ c ≤ 7",
    },
    baselines,
    greedy: greedy
      ? { overall: greedy.overall, per_family: greedy.per_family, constant_gold_families: greedy.constant_gold_families }
      : null,
    sampled: {
      overall: sampled.overall,
      per_family: sampled.per_family,
      constant_gold_families: sampled.constant_gold_families,
    },
    guess_test: guess
      ? {
          overall: guess.overall,
          per_family: guess.per_family,
          leak_n: leak.leak_ids.length,
          leak_ids: leak.leak_ids,
        }
      : null,
    learnability: {
      in_band_raw: sampled.overall.histogram.in_band,
      in_band_after_leak: inBandAfterLeak,
      below: sampled.overall.histogram.below,
      above: sampled.overall.histogram.above,
      non_degenerate_raw: countNonDegenerate(sampled.cases),
      non_degenerate_after_leak: nonDegenerateAfterLeak,
      correct_histogram: correctHistogram(sampled.cases),
      correct_histogram_leak_free: correctHistogram(leak.kept),
    },
    verdict,
    secondary_verdict: nonDegenerateVerdict({
      nonDegenerateAfterLeak,
      sampledPass1: sampled.overall.pass1,
      nGold: goldRows.length,
    }),
    cases: sampled.cases,
  };
}

function readJsonl(p) {
  return readFileSync(p, "utf8").trim().split(/\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function parseCli(argv) {
  const out = { gold: null, sampled: null, greedy: null, guess: null, pin: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--gold") out.gold = argv[++i];
    else if (a === "--sampled") out.sampled = argv[++i];
    else if (a === "--greedy") out.greedy = argv[++i];
    else if (a === "--guess") out.guess = argv[++i];
    else if (a === "--pin") out.pin = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else throw new Error(`unknown flag ${a}`);
  }
  if (!out.gold || !out.sampled) throw new Error("usage: p0-report.mjs --gold gold.jsonl --sampled preds.jsonl [--greedy ...] [--guess ...] [--pin pin.json] [--out report.json]");
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const args = parseCli(process.argv.slice(2));
  const pin = args.pin ? JSON.parse(readFileSync(args.pin, "utf8")) : null;
  const report = buildP0Report({
    goldRows: readJsonl(args.gold),
    greedyPreds: args.greedy ? readJsonl(args.greedy) : null,
    sampledPreds: readJsonl(args.sampled),
    guessPreds: args.guess ? readJsonl(args.guess) : null,
    pin,
  });
  const text = JSON.stringify(report, null, 2);
  if (args.out) {
    mkdirSync(dirname(resolve(args.out)), { recursive: true });
    writeFileSync(args.out, text + "\n", "utf8");
  }
  process.stdout.write(text + "\n");
  process.stderr.write(
    `[p0-report] existing_corpus=${report.verdict.existing_corpus} in_band_after_leak=${report.learnability.in_band_after_leak} ` +
      `non_degenerate=${report.secondary_verdict.non_degenerate} non_degenerate_after_leak=${report.learnability.non_degenerate_after_leak} ` +
      `pass@1=${report.sampled.overall.pass1.toFixed(3)}\n`,
  );
}
