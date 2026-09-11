#!/usr/bin/env node
// Prove the P1 loop against a local Ollama model. $0. No pod.
//
//   pnpm exec tsx experiments/rollout-arc/scripts/local-rollout.mjs [model]

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpStdioExecutor } from "../../../src/dataset/experiment/mcp-executor.ts";
import { ROLLOUT_TOOLS, runEpisode } from "../../../src/dataset/experiment/env.ts";
import { SearchEnv, openingMessages } from "../../../src/dataset/search-v0/env.ts";
import { plants } from "../../../src/dataset/search-v0/task.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const MODEL = process.argv[2] ?? "qwen2.5:7b";
const HOST = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");
const TOOLS_PATH = join(REPO, "src", "dataset", "tool-schemas.json");

function ollamaTools() {
  const catalog = JSON.parse(readFileSync(TOOLS_PATH, "utf8"));
  const allow = new Set(ROLLOUT_TOOLS);
  return catalog.tools.filter((t) => allow.has(t.name)).map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: t.inputSchema,
    },
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

async function chat(tools, messages) {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: toOllama(messages),
      tools,
      stream: false,
      keep_alive: "10m",
      options: { temperature: 0, num_predict: 256 },
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`ollama ${res.status}: ${raw.slice(0, 400)}`);
  return JSON.parse(raw);
}

async function main() {
  const c = plants().find((x) => x.song_id === "solace" && x.chord === "Gaug" && x.after === 1);
  if (!c) throw new Error("solace Gaug from-1 plant missing");
  const tools = ollamaTools();
  const exec = new McpStdioExecutor();
  await exec.start();
  const env = new SearchEnv(exec);
  try {
    const policy = async (messages) => {
      const result = await chat(tools, messages);
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
    process.stderr.write(`[local-rollout] model=${MODEL} case=search:${c.song_id}:${c.chord}:m${c.measure}\n`);
    const { reward, messages } = await runEpisode(env, c, policy, openingMessages(c));
    const toolNames = messages.filter((m) => m.role === "tool").map((m) => m.name);
    const out = {
      model: MODEL,
      id: `search:${c.song_id}:${c.chord}:m${c.measure}`,
      gold: String(c.measure),
      reward,
      tool_names: toolNames,
      assistant_final: [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "",
    };
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } finally {
    await exec.close();
    await fetch(`${HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, keep_alive: 0 }),
    }).catch(() => {});
  }
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});
