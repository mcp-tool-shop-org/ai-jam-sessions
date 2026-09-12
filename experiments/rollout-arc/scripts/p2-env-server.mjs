#!/usr/bin/env node
// ─── P2 Stage A — the two thin forwarders ────────────────────────────────────
//
// The lock's §6a architecture: TRL owns the training loop in Python, and the
// bridge to this repo is two endpoints that forward and never reimplement.
//
//   POST /tool   -> the SAME page bound (boundListMeasures) the P1c–P1f rollouts
//                   used, then the REAL dist/mcp-server.js over stdio.
//   POST /score  -> the ONE scoreReward in src/dataset/experiment/env.ts.
//
// A Python copy of the reward, the format gate or the page bound would be a
// second implementation that drifts. That is the failure the experiment
// contract's template was written about. There is one of each, and it is here.
//
// The corpus is built once at boot and is the single source of truth for BOTH
// the songs the tools serve and the prompts the trainer sees — GET /cases hands
// out the dataset, so a seed mismatch between the library and the dataset is
// unrepresentable rather than merely unlikely.
//
//   node experiments/rollout-arc/scripts/p2-env-server.mjs --port 8765
//
// Binds 127.0.0.1 only. $0. No weights, no GPU, no pod.

import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpStdioExecutor } from "../../../src/dataset/experiment/mcp-executor.ts";
import { MAX_PARALLEL, MAX_TURNS, ROLLOUT_TOOLS, scoreReward } from "../../../src/dataset/experiment/env.ts";
import { boundListMeasures, MAX_LIST_WINDOW } from "../../../src/dataset/search-v0/window.ts";
import { generateCorpus, buildRecord } from "../../../src/dataset/synth-v0/generate.ts";
import { SYNTH_SCHEMA_VERSION, splitOf, synthTask, userPrompt } from "../../../src/dataset/synth-v0/task.ts";
import { SYNTH_SYSTEM } from "../../../src/dataset/synth-v0/env.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");

/** The dry stage's seed. Train and test here share no case with P1f (2026091102). */
export const P2_GENERATOR_SEED = 2026091103;

export function parseArgs(argv) {
  const out = {
    port: 8765,
    host: "127.0.0.1",
    seed: P2_GENERATOR_SEED,
    trainPerLevel: 256,
    testPerLevel: 64,
    emit: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--host") out.host = argv[++i];
    else if (a === "--seed") out.seed = Number(argv[++i]);
    else if (a === "--train-per-level") out.trainPerLevel = Number(argv[++i]);
    else if (a === "--test-per-level") out.testPerLevel = Number(argv[++i]);
    else if (a === "--emit") out.emit = resolve(argv[++i]);
    else throw new Error(`unknown flag ${a}`);
  }
  if (!Number.isInteger(out.port) || out.port < 0 || out.port > 65535) throw new Error("--port must be 0-65535");
  if (!Number.isInteger(out.seed)) throw new Error("--seed must be an integer");
  if (!Number.isInteger(out.trainPerLevel) || out.trainPerLevel < 1) throw new Error("--train-per-level must be a positive integer");
  if (!Number.isInteger(out.testPerLevel) || out.testPerLevel < 1) throw new Error("--test-per-level must be a positive integer");
  if (out.host !== "127.0.0.1" && out.host !== "localhost") {
    // The MCP server has a writable tool (transpose_song) pointed at an
    // isolated home. Nothing about this process is hardened for a network.
    throw new Error("--host is 127.0.0.1 only; this server is never exposed");
  }
  return out;
}

/**
 * The dataset row the trainer consumes. `prompt` is the chat-template input;
 * `gold` is what /score is called with. The measure and the song id appear in
 * neither, which is the dry stage's gate 5.
 */
export function caseRow(c) {
  const rec = buildRecord(c);
  return {
    id: rec.id,
    song_id: c.song_id,
    split: splitOf(c),
    level: c.level,
    after: c.after,
    distance: c.distance,
    gold: rec.observation.gold.verdict,
    system: SYNTH_SYSTEM,
    user: userPrompt(c),
    prompt: [
      { role: "system", content: SYNTH_SYSTEM },
      { role: "user", content: userPrompt(c) },
    ],
  };
}

/**
 * Per-call environment response, byte-for-byte the branch SynthEnv.envResponse
 * takes: list_measures goes through the page bound first and a refusal is
 * returned as the observation WITHOUT executing; everything else forwards.
 *
 * The MAX_PARALLEL cap is per assistant turn, which a single call cannot see —
 * it is published in /health and enforced on the Python side.
 */
export async function envCall(executor, name, args) {
  if (name === "list_measures") {
    const bound = boundListMeasures(args ?? {});
    if (!bound.ok) {
      return { name, text: bound.reason, isError: true, executed: false, bounded: true };
    }
    const obs = await executor.call(name, bound.arguments);
    return { ...obs, bounded: true };
  }
  const obs = await executor.call(name, args ?? {});
  return { ...obs, bounded: false };
}

/**
 * Normalise a chat transcript to the SftMessage shape scoreReward reads.
 * scoreReward only looks at role, content, and whether an assistant turn
 * carries tool_calls — so this preserves exactly those, and accepts both the
 * OpenAI {function:{name,arguments}} and the in-repo {name, arguments} shapes.
 * It decides nothing; the reward is still computed by scoreReward alone.
 */
export function normaliseMessages(messages) {
  if (!Array.isArray(messages)) throw new Error("messages must be an array");
  return messages.map((m) => {
    if (!m || typeof m !== "object") throw new Error("each message must be an object");
    const role = m.role;
    const content = typeof m.content === "string" ? m.content : m.content == null ? "" : String(m.content);
    if (role === "assistant") {
      const calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
      const tool_calls = calls.map((tc) => ({
        name: tc?.function?.name ?? tc?.name ?? "",
        arguments: tc?.function?.arguments ?? tc?.arguments ?? {},
      }));
      return tool_calls.length ? { role, content, tool_calls } : { role, content };
    }
    if (role === "tool") return { role, content, name: m.name ?? m.tool_name ?? undefined };
    return { role, content };
  });
}

function json(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) reject(new Error("request body too large"));
      else chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) return resolveBody({});
      try {
        resolveBody(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`invalid JSON body: ${(err && err.message) || err}`));
      }
    });
    req.on("error", reject);
  });
}

export async function startEnvServer(opts = {}) {
  const args = { port: 8765, host: "127.0.0.1", seed: P2_GENERATOR_SEED, trainPerLevel: 256, testPerLevel: 64, ...opts };
  const corpus = generateCorpus(args.seed, {
    testPerLevel: args.testPerLevel,
    trainPerLevel: args.trainPerLevel,
  });
  const rows = corpus.cases.map(caseRow);
  const executor = new McpStdioExecutor();
  await executor.start({ seedSongs: corpus.songs });

  let toolCalls = 0;
  let scored = 0;
  let episodes = 0;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${args.host}`);
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, {
          ok: true,
          pid: process.pid,
          mcp_pid: executor.pid,
          schema_version: SYNTH_SCHEMA_VERSION,
          generator_seed: args.seed,
          library_songs: corpus.songs.length,
          cases: { total: rows.length, train: rows.filter((r) => r.split === "train").length, test: rows.filter((r) => r.split === "test").length },
          tools: [...ROLLOUT_TOOLS],
          limits: { max_turns: MAX_TURNS, max_parallel: MAX_PARALLEL, max_list_window: MAX_LIST_WINDOW },
          verdicts: synthTask.verdicts.length,
          counters: { tool_calls: toolCalls, scored, episodes },
        });
      }
      if (req.method === "GET" && url.pathname === "/cases") {
        const split = url.searchParams.get("split");
        if (split && !["train", "test", "all"].includes(split)) {
          return json(res, 400, { error: "split must be train|test|all" });
        }
        const picked = !split || split === "all" ? rows : rows.filter((r) => r.split === split);
        const limit = url.searchParams.get("limit");
        const n = limit == null ? picked.length : Number(limit);
        if (!Number.isInteger(n) || n < 0) return json(res, 400, { error: "limit must be a non-negative integer" });
        return json(res, 200, { n: Math.min(n, picked.length), cases: picked.slice(0, n) });
      }
      if (req.method === "POST" && url.pathname === "/reset") {
        // The library is immutable for every read tool, so there is no per-episode
        // state to clear here; the counter exists so a pooled environment that
        // never calls reset() is visible rather than silent.
        episodes++;
        return json(res, 200, { ok: true, episodes });
      }
      if (req.method === "POST" && url.pathname === "/tool") {
        const body = await readBody(req);
        const name = body.name;
        if (typeof name !== "string" || !name) return json(res, 400, { error: "name is required" });
        const obs = await envCall(executor, name, body.arguments ?? {});
        toolCalls++;
        return json(res, 200, obs);
      }
      if (req.method === "POST" && url.pathname === "/score") {
        const body = await readBody(req);
        if (typeof body.gold !== "string" || !body.gold) return json(res, 400, { error: "gold is required" });
        const transcript = normaliseMessages(body.messages ?? []);
        const reward = scoreReward({
          gold: body.gold,
          transcript,
          verdicts: synthTask.verdicts,
          maxTurns: MAX_TURNS,
        });
        scored++;
        return json(res, 200, reward);
      }
      if (req.method === "POST" && url.pathname === "/shutdown") {
        json(res, 200, { ok: true });
        await close();
        return;
      }
      return json(res, 404, { error: `no route ${req.method} ${url.pathname}` });
    } catch (err) {
      return json(res, 500, { error: String((err && err.message) || err) });
    }
  });

  await new Promise((r) => server.listen(args.port, args.host, r));
  const port = server.address().port;

  /** Compensator: the MCP child is killed and its isolated home removed. */
  const close = async () => {
    await new Promise((r) => server.close(r));
    await executor.close();
  };

  return { server, executor, corpus, rows, port, host: args.host, close };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const env = await startEnvServer(args);
  if (args.emit) {
    mkdirSync(args.emit, { recursive: true });
    for (const split of ["train", "test"]) {
      const picked = env.rows.filter((r) => r.split === split);
      writeFileSync(join(args.emit, `${split}.jsonl`), picked.map((r) => JSON.stringify(r)).join("\n") + "\n");
      process.stderr.write(`[p2-env] wrote ${picked.length} ${split} rows to ${join(args.emit, `${split}.jsonl`)}\n`);
    }
  }
  process.stderr.write(
    `[p2-env] http://${env.host}:${env.port} seed=${args.seed} library=${env.corpus.songs.length} ` +
      `cases=${env.rows.length} mcp_pid=${env.executor.pid}\n`,
  );
  const bye = async (sig) => {
    process.stderr.write(`[p2-env] ${sig} — closing MCP child and removing its isolated home\n`);
    await env.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void bye("SIGINT"));
  process.on("SIGTERM", () => void bye("SIGTERM"));
}
