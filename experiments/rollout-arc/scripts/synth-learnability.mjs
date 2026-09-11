#!/usr/bin/env node
// P1d: pass@8 + guess-test on synth-v0 through the rollout loop.
// Same pin as P1c. Does not edit the frozen bars.
//
//   pnpm exec tsx experiments/rollout-arc/scripts/synth-learnability.mjs --n 8 --split test

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpStdioExecutor } from "../../../src/dataset/experiment/mcp-executor.ts";
import { ROLLOUT_TOOLS, extractVerdict, runEpisode } from "../../../src/dataset/experiment/env.ts";
import { SynthEnv, openingMessages } from "../../../src/dataset/synth-v0/env.ts";
import { plants, splitOf, userPrompt } from "../../../src/dataset/synth-v0/task.ts";
import { buildRecord, generateCorpus } from "../../../src/dataset/synth-v0/generate.ts";
import { buildP0Report } from "./p0-report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const OUT_DIR = join(REPO, "experiments", "rollout-arc", "p1d");
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
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") out.model = argv[++i];
    else if (a === "--n") out.n = Number(argv[++i]);
    else if (a === "--seed") out.seed = Number(argv[++i]);
    else if (a === "--split") out.split = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--skip-guess") out.skipGuess = true;
    else if (a === "--skip-rollout") out.skipRollout = true;
    else throw new Error(`unknown flag ${a}`);
  }
  if (!Number.isInteger(out.n) || out.n < 1) throw new Error("--n must be a positive integer");
  if (!["train", "test", "all"].includes(out.split)) throw new Error("--split train|test|all");
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

function selectedCases(split, limit) {
  const all = plants().filter((c) => split === "all" || splitOf(c) === split);
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
  const path = join(OUT_DIR, "preds-guess.jsonl");
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

async function rolloutPassk(args, cases) {
  const tools = ollamaTools();
  const exec = new McpStdioExecutor();
  await exec.start({ seedSongs: generateCorpus().songs });
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
          const result = await post("/api/chat", {
            model: args.model,
            messages: toOllama(messages),
            tools,
            stream: false,
            keep_alive: "30m",
            think: false,
            options: { temperature: args.n === 1 ? 0 : 1, num_predict: 256, seed },
          });
          const msg = result.message ?? {};
          const calls = (msg.tool_calls ?? []).map((tc) => ({
            name: tc.function?.name ?? tc.name,
            arguments: typeof tc.function?.arguments === "string"
              ? JSON.parse(tc.function.arguments || "{}")
              : (tc.function?.arguments ?? {}),
          }));
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
  const path = join(OUT_DIR, "preds-pass8.jsonl");
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

function readJsonl(p) {
  return readFileSync(p, "utf8").trim().split(/\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(OUT_DIR, { recursive: true });
  const cases = selectedCases(args.split, args.limit);
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
  writeFileSync(join(OUT_DIR, "gold.jsonl"), goldRows.map((g) => JSON.stringify(g)).join("\n") + "\n");

  const pin = {
    phase: "P1d",
    written_before_sampled_run: true,
    model: args.model,
    model_note: "Same pin as P1c. think:false. Local Ollama, not Comfy Cloud.",
    n: args.n,
    split: args.split,
    seed: args.seed,
    generator_seed: 20260911,
    sampled: { temperature: args.n === 1 ? 0 : 1, n: args.n, seed: args.seed },
    guess_test: { temperature: 1, n: args.n, tools: "none" },
    host: HOST,
    framework: "Ollama /api/chat through SynthEnv.runEpisode",
    hardware: "local RTX 5090, 32 GB",
    gold_n: goldRows.length,
    train_n: plants().filter((c) => splitOf(c) === "train").length,
    test_n: plants().filter((c) => splitOf(c) === "test").length,
    test_clusters: [...new Set(goldRows.map((g) => g.song_id))].length,
    levels: ["D0", "D1", "D2", "D3"],
    band: [0.125, 0.5],
    go_rule: { min_in_band_after_leak: 10, sampled_pass1_below: 0.8, any_level: true },
    spend: 0,
  };
  writeFileSync(join(OUT_DIR, "pin.json"), JSON.stringify(pin, null, 2) + "\n");
  process.stderr.write(`[synth-learnability] model=${args.model} cases=${cases.length} n=${args.n} clusters=${pin.test_clusters}\n`);

  const guessPath = args.skipGuess ? null : await guessTest(args, cases);
  const sampledPath = args.skipRollout ? null : await rolloutPassk(args, cases);
  if (sampledPath) {
    const sampled = readJsonl(sampledPath);
    const guess = guessPath ? readJsonl(guessPath) : null;
    const levels = {};
    for (const level of ["D0", "D1", "D2", "D3"]) {
      const g = goldRows.filter((r) => r.family === level);
      const s = sampled.filter((p) => g.some((x) => x.id === p.id));
      const k = guess ? guess.filter((p) => g.some((x) => x.id === p.id)) : null;
      levels[level] = buildP0Report({ goldRows: g, greedyPreds: null, sampledPreds: s, guessPreds: k, pin });
    }
    writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify({ pin, levels }, null, 2) + "\n");
  }
  process.stdout.write(JSON.stringify({ pin, gold: join(OUT_DIR, "gold.jsonl"), guess: guessPath, sampled: sampledPath }, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});
