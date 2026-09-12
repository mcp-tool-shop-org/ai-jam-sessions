#!/usr/bin/env node
// ─── P2 dry stage — $0, no weights, no pod ───────────────────────────────────
//
// The lock's §5 ladder is dry -> smoke -> train, and a pod bills from boot, so
// everything that can fail without weights fails here.
//
// This stage answers two questions and nothing else:
//   1. Can the generator supply a training corpus at scale, with every gate the
//      experiment contract enforces still green?
//   2. Does the TRAIN split carry the same non-degenerate rate the TEST split
//      measured twice (32.0% in P1e, 32.0% in P1f)? If train and test are drawn
//      differently, the population P2 trains on is not the one that was gated.
//
// It does NOT pre-filter the training corpus by pass rate. Filtering is online
// per step against the current policy (lock §2; NVIDIA's production DAPO filters
// prompt groups where std > 0), so a pre-measured offline population would be
// stale by step one.
//
//   node experiments/rollout-arc/scripts/p2-dry.mjs --train-per-level 256

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCorpus, buildRecord, rederiveOnSong } from "../../../src/dataset/synth-v0/generate.ts";
import { splitOf, SYNTH_SCHEMA_VERSION, synthTask } from "../../../src/dataset/synth-v0/task.ts";
import { assertNoStraddle, assertGoldVaries } from "../../../src/dataset/experiment/split.ts";
import { publishedOwner } from "../../../src/dataset/experiment/registry.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const OUT_DIR = join(REPO, "experiments", "rollout-arc", "p2");

/** Fresh seed. P1f ran 2026091102; the training corpus must share no case with it. */
const P2_GENERATOR_SEED = 2026091103;

function parseArgs(argv) {
  const out = { trainPerLevel: 256, testPerLevel: 64, seed: P2_GENERATOR_SEED, out: OUT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--train-per-level") out.trainPerLevel = Number(argv[++i]);
    else if (a === "--test-per-level") out.testPerLevel = Number(argv[++i]);
    else if (a === "--seed") out.seed = Number(argv[++i]);
    else if (a === "--out") out.out = resolve(argv[++i]);
    else throw new Error(`unknown flag ${a}`);
  }
  if (!Number.isInteger(out.trainPerLevel) || out.trainPerLevel < 1) throw new Error("--train-per-level must be a positive integer");
  return out;
}

const args = parseArgs(process.argv.slice(2));
const gates = [];
const gate = (name, fn) => {
  try {
    const detail = fn();
    gates.push({ name, pass: true, detail: detail ?? null });
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    gates.push({ name, pass: false, detail: reason });
    console.log(`  FAIL  ${name} — ${reason}`);
  }
};

console.log(`\n== P2 dry — generating corpus (seed ${args.seed}, train ${args.trainPerLevel}/level, test ${args.testPerLevel}/level)`);
const t0 = Date.now();
const corpus = generateCorpus(args.seed, { trainPerLevel: args.trainPerLevel, testPerLevel: args.testPerLevel });
const genMs = Date.now() - t0;

const train = corpus.cases.filter((c) => splitOf(c) === "train");
const test = corpus.cases.filter((c) => splitOf(c) === "test");
const songById = new Map(corpus.songs.map((s) => [s.id, s]));
console.log(`   ${corpus.songs.length} songs, ${corpus.cases.length} cases (train ${train.length}, test ${test.length}) in ${(genMs / 1000).toFixed(1)}s`);

console.log(`\n== Gates (experiment contract)`);

gate("gold re-derives from both engines on every TRAIN case", () => {
  let checked = 0;
  for (const c of train) {
    const song = songById.get(c.song_id);
    if (!song) throw new Error(`song ${c.song_id} missing`);
    const m = rederiveOnSong(song, c.chord, c.after);
    if (!m) throw new Error(`${c.song_id}: ${c.chord} at or after ${c.after} is no longer measurable`);
    if (m.measure !== c.measure || m.chord !== c.chord) {
      throw new Error(`${c.song_id}: measured ${m.chord}@${m.measure} !== constructed ${c.chord}@${c.measure}`);
    }
    checked++;
  }
  return `${checked} cases re-derived`;
});

gate("no song_id straddles train/test", () => {
  assertNoStraddle(corpus.cases, (c) => c.song_id, splitOf);
  return `${new Set(corpus.cases.map((c) => c.song_id)).size} distinct song ids`;
});

gate("gold varies on both splits, per level", () => {
  assertGoldVaries(corpus.cases, (c) => String(c.measure), splitOf, (c) => c.level);
  const d = new Set(train.map((c) => c.measure));
  return `${d.size} distinct gold values on train`;
});

gate("schemaVersion is not a published owner's", () => {
  const owner = publishedOwner(SYNTH_SCHEMA_VERSION);
  if (owner && owner !== synthTask.id) throw new Error(`${SYNTH_SCHEMA_VERSION} owned by ${owner}`);
  return `${SYNTH_SCHEMA_VERSION} unregistered`;
});

gate("prompt names neither the measure nor the song id", () => {
  // Word-boundary, not substring: titles read "Synth D2 Study bbi", so a bare
  // includes("2") matches the level tag and reports a leak that is not there.
  for (const c of train) {
    const rec = buildRecord(c);
    if (new RegExp(`\\b${c.measure}\\b`).test(rec.user)) {
      throw new Error(`${rec.id}: prompt leaks the gold measure — ${JSON.stringify(rec.user)}`);
    }
    if (rec.user.includes(c.song_id)) throw new Error(`${rec.id}: prompt leaks the song id`);
  }
  return `${train.length} prompts clean`;
});

gate("every synthetic id is namespaced and kebab-case", () => {
  for (const s of corpus.songs) {
    if (!s.id.startsWith("synth-")) throw new Error(`${s.id} is not namespaced synth-`);
    if (!/^[a-z0-9-]+$/.test(s.id)) throw new Error(`${s.id} is not kebab-case`);
  }
  return `${corpus.songs.length} ids`;
});

const byLevel = {};
for (const c of train) byLevel[c.level] = (byLevel[c.level] ?? 0) + 1;
const dist = {};
for (const c of train) dist[c.distance] = (dist[c.distance] ?? 0) + 1;

console.log(`\n== Training corpus shape`);
console.log(`   per level: ${Object.entries(byLevel).map(([k, v]) => `${k}=${v}`).join(", ")}`);
console.log(`   per distance: ${Object.entries(dist).map(([k, v]) => `d${k}=${v}`).join(", ")}`);
console.log(`   distinct gold measures: ${new Set(train.map((c) => c.measure)).size}`);

const RATE = 0.320; // leak-free non-degenerate, measured twice on the test split
console.log(`\n== Projected trainable population (at the twice-replicated ${(RATE * 100).toFixed(1)}% non-degenerate rate)`);
console.log(`   ${train.length} generated train cases -> ~${Math.round(train.length * RATE)} expected non-degenerate`);
console.log(`   online filtering discards ~${((1 - RATE) * 100).toFixed(0)}%, so expect ~${(1 / RATE).toFixed(1)}x generation per batch`);

const allPass = gates.every((g) => g.pass);
console.log(`\n== ${allPass ? "DRY PASS" : "DRY FAIL"} — ${gates.filter((g) => g.pass).length}/${gates.length} gates`);
console.log(`   No weights loaded. No pod. $0.`);

mkdirSync(args.out, { recursive: true });
const report = {
  stage: "P2-dry",
  generator_seed: args.seed,
  train_per_level: args.trainPerLevel,
  test_per_level: args.testPerLevel,
  songs: corpus.songs.length,
  cases: { total: corpus.cases.length, train: train.length, test: test.length },
  per_level: byLevel,
  per_distance: dist,
  distinct_gold_train: new Set(train.map((c) => c.measure)).size,
  gates,
  all_pass: allPass,
  projected: {
    non_degenerate_rate_prior: RATE,
    expected_trainable: Math.round(train.length * RATE),
    expected_generation_multiplier: Number((1 / RATE).toFixed(2)),
  },
  generation_ms: genMs,
  spend: 0,
};
writeFileSync(join(args.out, "dry-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`   receipt: ${join(args.out, "dry-report.json")}`);
process.exit(allPass ? 0 : 1);
