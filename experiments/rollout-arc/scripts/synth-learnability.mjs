#!/usr/bin/env node
// P1f: pass@8 + guess-test on synth-v0 through the rollout loop.
//
// Same family, same pin, same frozen bars as P1d/P1e. Two things change, both
// declared in the P1f lock before the run: n goes 32 -> 64 test songs per
// level, and the report carries a SECOND criterion beside the primary one
// (non-degenerate, findings 22 / 23 / 26) which is counted, never substituted.
// Everything else is a control: model, think:false, T=1, n=8, seed 0+attempt,
// the bounded 4-measure page, the parallel cap, distance 1-3, D0-D3, the
// format gate, the reward, and the bars in p0-report.mjs.
//
//   pnpm exec tsx experiments/rollout-arc/scripts/synth-learnability.mjs --n 8 --split test --songs 64

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpStdioExecutor } from "../../../src/dataset/experiment/mcp-executor.ts";
import { ROLLOUT_TOOLS, extractVerdict, runEpisode } from "../../../src/dataset/experiment/env.ts";
import { SynthEnv, openingMessages } from "../../../src/dataset/synth-v0/env.ts";
import { splitOf, userPrompt } from "../../../src/dataset/synth-v0/task.ts";
import { buildRecord, generateCorpus } from "../../../src/dataset/synth-v0/generate.ts";
import { buildP0Report } from "./p0-report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const OUT_DIR_DEFAULT = join(REPO, "experiments", "rollout-arc", "p1f");

/**
 * Fresh generator seed. P1e ran 20260911; P1f is the same date with an explicit
 * run index, so every case in this run is new. Recorded in the pin.
 */
const P1F_GENERATOR_SEED = 2026091102;

/** Preregistered from P1e's measured rates, not chosen after the fact. */
const P1F_SONGS_PER_LEVEL = 64;
const TOOLS_PATH = join(REPO, "src", "dataset", "tool-schemas.json");
const HOST = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");

function parseArgs(argv) {
  const out = {
    model: "qwen3:4b-instruct-2507-q4_K_M",
    n: 8,
    seed: 0,
    split: "test",
    limit: Infinity,
    skipGuess: false,
    skipRollout: false,
    out: OUT_DIR_DEFAULT,
    songs: P1F_SONGS_PER_LEVEL,
    generatorSeed: P1F_GENERATOR_SEED,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") out.model = argv[++i];
    else if (a === "--out") out.out = resolve(argv[++i]);
    else if (a === "--n") out.n = Number(argv[++i]);
    else if (a === "--seed") out.seed = Number(argv[++i]);
    else if (a === "--split") out.split = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--songs") out.songs = Number(argv[++i]);
    else if (a === "--generator-seed") out.generatorSeed = Number(argv[++i]);
    else if (a === "--skip-guess") out.skipGuess = true;
    else if (a === "--skip-rollout") out.skipRollout = true;
    else throw new Error(`unknown flag ${a}`);
  }
  if (!Number.isInteger(out.n) || out.n < 1) throw new Error("--n must be a positive integer");
  if (!["train", "test", "all"].includes(out.split)) throw new Error("--split train|test|all");
  if (!Number.isInteger(out.songs) || out.songs < 1) throw new Error("--songs must be a positive integer");
  if (!Number.isInteger(out.generatorSeed)) throw new Error("--generator-seed must be an integer");
  return out;
}

function ollamaTools() {
  const catalog = JSON.parse(readFileSync(TOOLS_PATH, "utf8"));
  const allow = new Set(ROLLOUT_TOOLS);
  return catalog.tools.filter((t) => allow.has(t.name)).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema },
  }));
}

function toOllama(messages) {
  return messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls) {
      return {
        role: "assistant",
        content: m.content ?? "",
        tool_calls: m.tool_calls.map((tc) => ({
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (m.role === "tool") return { role: "tool", content: m.content, tool_name: m.name };
    return { role: m.role, content: m.content ?? "" };
  });
}

async function post(path, body) {
  const res = await fetch(`${HOST}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`ollama ${res.status}: ${raw.slice(0, 400)}`);
  return JSON.parse(raw);
}

function selectedCases(corpus, split, limit) {
  const all = corpus.cases.filter((c) => split === "all" || splitOf(c) === split);
  return all.slice(0, Number.isFinite(limit) ? limit : all.length);
}

async function guessTest(args, cases) {
  const lines = [];
  let done = 0;
  const total = cases.length * args.n;
  for (const c of cases) {
    const rec = buildRecord(c);
    const prompt = `${userPrompt(c)}\n\nAnswer with just the value, nothing else.`;
    for (let attempt = 0; attempt < args.n; attempt++) {
      const result = await post("/api/generate", {
        model: args.model,
        prompt,
        stream: false,
        keep_alive: "30m",
        think: false,
        options: { temperature: 1, num_predict: 40, seed: args.seed + attempt },
      });
      const content = result.response ?? "";
      lines.push(JSON.stringify({
        id: rec.id,
        family: c.level,
        attempt,
        seed: args.seed + attempt,
        answer: extractVerdict(content),
        raw: String(content).trim().slice(0, 600),
      }));
      done++;
      if (done % 10 === 0 || done === total) process.stderr.write(`  guess ${done}/${total} last=${rec.id}\n`);
    }
  }
  const path = join(args.out, "preds-guess.jsonl");
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

async function rolloutPassk(args, cases, corpus) {
  const tools = ollamaTools();
  const exec = new McpStdioExecutor();
  // Isolated AI_JAM_HOME, seeded with THIS run's library and deleted on close.
  // The operator's real library is never touched.
  await exec.start({ seedSongs: corpus.songs });
  const env = new SynthEnv(exec);
  const lines = [];
  let done = 0;
  const total = cases.length * args.n;
  try {
    for (const c of cases) {
      const rec = buildRecord(c);
      for (let attempt = 0; attempt < args.n; attempt++) {
        const seed = args.seed + attempt;
        const policy = async (messages) => {
          let result;
          try {
            result = await post("/api/chat", {
              model: args.model,
              messages: toOllama(messages),
              tools,
              stream: false,
              keep_alive: "30m",
              think: false,
              options: { temperature: args.n === 1 ? 0 : 1, num_predict: 256, seed },
            });
          } catch (err) {
            // Ollama 500s on truncated tool-call JSON. That is a failed
            // attempt, not a harness crash.
            return { role: "assistant", content: "" };
          }
          const msg = result.message ?? {};
          const calls = [];
          for (const tc of msg.tool_calls ?? []) {
            let arguments_ = {};
            const raw = tc.function?.arguments ?? tc.arguments;
            try {
              arguments_ = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
            } catch {
              arguments_ = {};
            }
            calls.push({ name: tc.function?.name ?? tc.name, arguments: arguments_ });
          }
          if (calls.length) {
            return { role: "assistant", content: msg.content ?? "", tool_calls: calls };
          }
          return { role: "assistant", content: String(msg.content ?? "").trim() };
        };
        const { reward } = await runEpisode(env, c, policy, openingMessages(c));
        lines.push(JSON.stringify({
          id: rec.id,
          family: c.level,
          attempt,
          seed,
          answer: reward.verdict,
          raw: reward.verdict,
          reward: reward.reward,
          format_ok: reward.format_ok,
          tool_turns: reward.tool_turns,
        }));
        done++;
        if (done % 5 === 0 || done === total) {
          process.stderr.write(`  rollout ${done}/${total} last=${rec.id} r=${reward.reward} v=${JSON.stringify(reward.verdict)}\n`);
        }
      }
    }
  } finally {
    await exec.close();
  }
  const path = join(args.out, "preds-pass8.jsonl");
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

function readJsonl(p) {
  return readFileSync(p, "utf8").trim().split(/\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
}

const round4 = (x) => Math.round(x * 1e4) / 1e4;

function histOf(values) {
  const out = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function mean(values) {
  return values.length ? round4(values.reduce((a, b) => a + b, 0) / values.length) : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });
  const corpus = generateCorpus(args.generatorSeed, { testPerLevel: args.songs });
  const cases = selectedCases(corpus, args.split, args.limit);
  const goldRows = cases.map((c) => {
    const rec = buildRecord(c);
    return {
      id: rec.id,
      family: c.level,
      gold: rec.observation.gold.verdict,
      song_id: c.song_id,
      after: c.after,
      distance: c.distance,
    };
  });
  writeFileSync(join(args.out, "gold.jsonl"), goldRows.map((g) => JSON.stringify(g)).join("\n") + "\n");

  const trainN = corpus.cases.filter((c) => splitOf(c) === "train").length;
  const testN = corpus.cases.filter((c) => splitOf(c) === "test").length;
  const pin = {
    phase: "P1f",
    kebab_parity: true,
    written_before_sampled_run: true,
    model: args.model,
    model_note: "Same pin as P1c/P1e. think:false. Local Ollama, not Comfy Cloud.",
    n: args.n,
    split: args.split,
    seed: args.seed,
    generator_seed: args.generatorSeed,
    generator_seed_note:
      "Fresh. P1e ran 20260911, so every case measured here is new. P1f is a replication of the secondary criterion on cases it was not derived from.",
    songs_per_level: args.songs,
    songs_per_level_note:
      "Preregistered from P1e's measured rates, not chosen after the fact. At the primary bar's 17.2% leak-free in-band, n >= 59 is needed to expect 10, so 64 is the smallest round n that clears it; at 32.0% non-degenerate the expectation is 20.5.",
    train_per_level: trainN / 4,
    library_songs: corpus.songs.length,
    library_note:
      "One song per case, so doubling the test split grows the isolated library (P1e 320 -> P1f 448). Train-per-level is unchanged at 48. Library size is not a control the lock names, and lookup is by kebab id; the tool-turn histogram is the check that search did not change shape.",
    sampled: { temperature: args.n === 1 ? 0 : 1, n: args.n, seed: args.seed },
    guess_test: { temperature: 1, n: args.n, tools: "none" },
    host: HOST,
    framework: "Ollama /api/chat through SynthEnv.runEpisode",
    hardware: "local RTX 5090, 32 GB",
    gold_n: goldRows.length,
    train_n: trainN,
    test_n: testN,
    test_clusters: [...new Set(goldRows.map((g) => g.song_id))].length,
    levels: ["D0", "D1", "D2", "D3"],
    band: [0.125, 0.5],
    go_rule: {
      min_in_band_after_leak: 10,
      sampled_pass1_below: 0.8,
      any_level: true,
      finding: "24 - INTELLECT-2, arXiv:2505.07291 (pass@8 in [12.5%, 50%])",
      unchanged_since: "P0",
    },
    secondary_rule: {
      min_non_degenerate_after_leak: 10,
      definition: "0 < c < n; at the pinned n = 8, 1 <= c <= 7",
      sampled_pass1_below: 0.8,
      any_level: true,
      findings:
        "22 - DAPO, arXiv:2503.14476; 23 - Foster et al., arXiv:2502.12272; 26 - Absolute Zero, arXiv:2505.03335",
      declared_before_run: true,
      first_use: "P1f",
      note:
        "Reported beside the primary bar, never in place of it. A CLEAR here is not a GO: the P1f lock sends that to a director gate.",
      disclosure:
        "Recomputed from P1e's committed receipts with its own leak filter, this criterion already clears at D2 (11) and D3 (12). It is frozen here before P1f runs so this is a replication on fresh cases at double n, not a discovery announced from the run that motivated it.",
    },
    stopping_rule:
      "Primary clears -> GO, P2 unlocks under a director gate. Primary fails and secondary clears -> reported as exactly that, and the decision to train is a director gate. Both fail -> the arc ships the null; there is no P1g.",
    spend: 0,
  };
  writeFileSync(join(args.out, "pin.json"), JSON.stringify(pin, null, 2) + "\n");
  process.stderr.write(
    `[synth-learnability] phase=${pin.phase} out=${args.out} model=${args.model} cases=${cases.length} n=${args.n} ` +
      `songs/level=${args.songs} gen_seed=${args.generatorSeed} library=${corpus.songs.length} clusters=${pin.test_clusters}\n`,
  );

  const guessPath = args.skipGuess ? null : await guessTest(args, cases);
  const sampledPath = args.skipRollout ? null : await rolloutPassk(args, cases, corpus);
  if (sampledPath) {
    const sampled = readJsonl(sampledPath);
    const guess = guessPath ? readJsonl(guessPath) : null;
    const levels = {};
    const summaryLevels = {};
    let hits = 0;
    for (const level of pin.levels) {
      const g = goldRows.filter((r) => r.family === level);
      const ids = new Set(g.map((r) => r.id));
      const s = sampled.filter((x) => ids.has(x.id));
      const k = guess ? guess.filter((x) => ids.has(x.id)) : null;
      const r = buildP0Report({ goldRows: g, greedyPreds: null, sampledPreds: s, guessPreds: k, pin });
      levels[level] = r;
      hits += r.cases.reduce((a, c) => a + c.correct, 0);
      // Every level is reported, whatever it says. Dropping the one that looks
      // bad is the error this arc has refused at every phase.
      summaryLevels[level] = {
        n: r.sampled.overall.n,
        pass1: round4(r.sampled.overall.pass1),
        pass8: round4(r.sampled.overall.pass8),
        band_hist: r.sampled.overall.histogram,
        correct_hist: r.learnability.correct_histogram,
        correct_hist_leak_free: r.learnability.correct_histogram_leak_free,
        leak_n: r.guess_test ? r.guess_test.leak_n : 0,
        guess_pass8: r.guess_test ? round4(r.guess_test.overall.pass8) : null,
        in_band_after_leak: r.learnability.in_band_after_leak,
        non_degenerate_after_leak: r.learnability.non_degenerate_after_leak,
        primary: r.verdict.existing_corpus,
        secondary: r.secondary_verdict.non_degenerate,
        tool_turns: histOf(s.map((x) => x.tool_turns)),
        mean_tool_turns: mean(s.map((x) => x.tool_turns)),
      };
    }
    const summary = {
      rollouts: sampled.length,
      hits,
      any_primary_go: Object.values(summaryLevels).some((l) => l.primary === "GO"),
      any_secondary_clear: Object.values(summaryLevels).some((l) => l.secondary === "CLEAR"),
      levels: summaryLevels,
      tool_turns: histOf(sampled.map((x) => x.tool_turns)),
      mean_tool_turns: mean(sampled.map((x) => x.tool_turns)),
    };
    writeFileSync(join(args.out, "report.json"), JSON.stringify({ pin, summary, levels }, null, 2) + "\n");
    process.stderr.write(
      `[synth-learnability] primary_go=${summary.any_primary_go} secondary_clear=${summary.any_secondary_clear} ` +
        `hits=${summary.hits}/${summary.rollouts} mean_tool_turns=${summary.mean_tool_turns}\n`,
    );
  }
  process.stdout.write(JSON.stringify({ pin, gold: join(args.out, "gold.jsonl"), guess: guessPath, sampled: sampledPath }, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});
