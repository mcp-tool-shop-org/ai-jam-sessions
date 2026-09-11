#!/usr/bin/env node
// ─── Kimi N=8 no-tool guess-test (dispatch §6 P0 step 4) ─────────────────────
//
// Seed: src/dataset/acoustic-v1/toolless-baseline.mjs (the dispatch's
// coverage-v1-sft/scripts/ path was a slip — that file does not exist).
// Difference: repeats (--n), replayable seeds, keep_alive stays up, gold
// matching is score_v1's labelOf rather than substring-includes.
//
//   node guess-test.mjs --sft sft-test.jsonl --gold gold-test.jsonl \
//     --model qwen2.5:7b --n 8 --options temperature=1 --out guess.jsonl

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractAnswer } from "../../coverage-v1-sft/scripts/ollama-grade.mjs";

function usage(msg) {
  if (msg) process.stderr.write(msg + "\n");
  process.stderr.write(
    "usage: node guess-test.mjs --sft sft-test.jsonl --gold gold-test.jsonl --model NAME --out preds.jsonl [--n 8] [--seed 0] [--host URL] [--options k=v] [--keep-alive duration] [--num-predict N]\n",
  );
  process.exit(1);
}

function parseOptionsFlag(raw, dest) {
  for (const part of String(raw).split(",")) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq < 1) usage(`--options expected k=v (got ${JSON.stringify(p)})`);
    const k = p.slice(0, eq);
    const v = p.slice(eq + 1);
    if (v === "true") dest[k] = true;
    else if (v === "false") dest[k] = false;
    else if (v !== "" && Number.isFinite(Number(v))) dest[k] = Number(v);
    else dest[k] = v;
  }
}

function parseArgs(argv) {
  const out = {
    sft: null,
    gold: null,
    model: null,
    out: null,
    n: 8,
    seed: 0,
    host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
    keepAlive: "30m",
    numPredict: 40,
    extraOptions: {},
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sft") out.sft = argv[++i];
    else if (a === "--gold") out.gold = argv[++i];
    else if (a === "--model") out.model = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--n") out.n = Number(argv[++i]);
    else if (a === "--seed") out.seed = Number(argv[++i]);
    else if (a === "--host") out.host = argv[++i];
    else if (a === "--keep-alive") out.keepAlive = argv[++i];
    else if (a === "--num-predict") out.numPredict = Number(argv[++i]);
    else if (a === "--options") parseOptionsFlag(argv[++i], out.extraOptions);
    else usage(`unknown flag ${a}`);
  }
  if (!out.sft || !out.gold || !out.model || !out.out) usage();
  if (!Number.isInteger(out.n) || out.n < 1) usage("--n must be a positive integer");
  if (out.n > 1) {
    const t = out.extraOptions.temperature;
    if (t === undefined || t === 0) usage(`--n ${out.n} requires --options temperature=… > 0`);
  }
  if (out.host.endsWith("/")) out.host = out.host.slice(0, -1);
  return out;
}

function readJsonl(p) {
  return readFileSync(p, "utf8").trim().split(/\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function userTurn(messages) {
  const u = (messages ?? []).find((m) => m.role === "user");
  if (!u?.content) throw new Error("missing user turn");
  return String(u.content);
}

async function postGenerate(host, body) {
  const res = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`ollama ${res.status}: ${raw.slice(0, 400)}`);
  return JSON.parse(raw);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sft = new Map(readJsonl(args.sft).map((r) => [r.id, r]));
  const gold = readJsonl(args.gold);
  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  const outLines = [];
  const t0 = Date.now();
  const total = gold.length * args.n;
  let done = 0;

  process.stderr.write(
    `[guess-test] model=${args.model} cases=${gold.length} n=${args.n} host=${args.host}\n`,
  );

  for (const g of gold) {
    const rec = sft.get(g.id);
    if (!rec) throw new Error(`gold id ${g.id} missing from sft`);
    const prompt = `${userTurn(rec.messages)}\n\nAnswer with just the value, nothing else.`;
    for (let attempt = 0; attempt < args.n; attempt++) {
      const options = {
        temperature: 0,
        num_predict: args.numPredict,
        ...args.extraOptions,
        seed: args.seed + attempt,
      };
      const result = await postGenerate(args.host, {
        model: args.model,
        prompt,
        stream: false,
        keep_alive: args.keepAlive,
        options,
      });
      const content = result.response ?? "";
      outLines.push(JSON.stringify({
        id: g.id,
        family: g.family,
        attempt,
        seed: options.seed,
        answer: extractAnswer(content),
        raw: String(content).trim().slice(0, 600),
      }));
      done++;
      if (done % 5 === 0 || done === total) {
        process.stderr.write(`  ${done}/${total} last=${g.id} attempt=${attempt}\n`);
      }
    }
  }

  writeFileSync(args.out, outLines.join("\n") + "\n", "utf8");
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  process.stderr.write(`[guess-test] wrote ${args.out} wall=${wall}s\n`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack || err) + "\n");
    process.exit(1);
  });
}
