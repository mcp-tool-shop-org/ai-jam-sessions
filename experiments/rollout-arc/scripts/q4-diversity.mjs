#!/usr/bin/env node
// ─── Does q4 branch where bf16 does not? ─────────────────────────────────────
//
// bf16 on the all-knobs stack emits EIGHT BYTE-IDENTICAL completions in 88-92%
// of groups, at temperature 1.0 / top_p 1.0 / top_k disabled. GRPO's advantage is
// group-relative, so a group with no within-group variation carries no gradient.
// That is why seven corpus configurations all returned non-degenerate ~0.06.
//
// The open question is whether a COARSER POLICY branches on the same inputs. It
// is the precondition for any explorer/trainee design, and it is free to test.
//
// TWO THINGS THIS SCRIPT IS CAREFUL ABOUT, because getting them wrong is the
// defect that invalidated this whole arc:
//
//   1. THE SAME CORPUS. Not "the same settings" — the same seed and the same
//      knobs, so the only thing differing from the bf16 run is the policy.
//
//   2. THE SAME SAMPLER. Ollama's defaults are top_k 40 / top_p 0.9, which
//      TRUNCATE the distribution; TRL uses top_k 0 / top_p 1.0, which does not.
//      Every earlier q4 measurement in this arc ran truncated and was compared
//      against an untruncated bf16 run. Here both are untruncated.
//
// WHAT IT STILL CANNOT CONTROL, stated rather than hidden: Ollama and
// transformers are different serving stacks. A difference measured here is
// "q4-through-Ollama vs bf16-through-TRL", not precision alone. That is weaker
// than a within-stack comparison and the writeup must say so.
//
//   pnpm exec tsx experiments/rollout-arc/scripts/q4-diversity.mjs --limit 128
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpStdioExecutor } from "../../../src/dataset/experiment/mcp-executor.ts";
import { MAX_PARALLEL, MAX_TURNS, ROLLOUT_TOOLS, scoreReward } from "../../../src/dataset/experiment/env.ts";
import { boundListMeasures } from "../../../src/dataset/search-v0/window.ts";
import { generateCorpus } from "../../../src/dataset/synth-v0/generate.ts";
import { synthTask, userPrompt } from "../../../src/dataset/synth-v0/task.ts";
import { SYNTH_SYSTEM } from "../../../src/dataset/synth-v0/env.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const HOST = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");

// The bf16 all-knobs stack, exactly: seed and every difficulty flag.
const STACK = {
  seed: 2026091207,
  trainPerLevel: 128,
  testPerLevel: 16,
  levels: ["D1"],
  parallelOnly: true,
  decoyBeforeBound: true,
  varyRightHand: true,
  octaves: [1, 2, 3, 4, 5],
};

function parseArgs(argv) {
  const out = { model: "qwen3:4b-instruct-2507-q4_K_M", n: 8, limit: 128, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") out.model = argv[++i];
    else if (a === "--n") out.n = Number(argv[++i]);
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--out") out.out = resolve(argv[++i]);
    else throw new Error(`unknown flag ${a}`);
  }
  return out;
}

async function chat(body) {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outPath = args.out ?? join(REPO, "experiments", "rollout-arc", "p2", "runs", "q4-diversity", "q4-diversity.json");
  mkdirSync(dirname(outPath), { recursive: true });

  const corpus = generateCorpus(STACK.seed, STACK);
  const cases = corpus.cases.filter((c) => c.split === "train" && STACK.levels.includes(c.level)).slice(0, args.limit);
  if (cases.length !== args.limit) throw new Error(`wanted ${args.limit} cases, corpus gave ${cases.length}`);

  const exec = new McpStdioExecutor();
  await exec.start({ seedSongs: corpus.songs });

  // The catalog is our own shape; Ollama wants OpenAI-style function specs, and
  // only the nine rollout tools (play_song is never exposed to a policy).
  const catalog = JSON.parse(
    (await import("node:fs")).readFileSync(join(REPO, "src", "dataset", "tool-schemas.json"), "utf8"),
  );
  const allow = new Set(ROLLOUT_TOOLS);
  const tools = catalog.tools
    .filter((t) => allow.has(t.name))
    .map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema } }));
  if (tools.length !== ROLLOUT_TOOLS.length) {
    throw new Error(`tool catalog gave ${tools.length} of ${ROLLOUT_TOOLS.length} rollout tools`);
  }

  const groups = [];
  for (let gi = 0; gi < cases.length; gi++) {
    const c = cases[gi];
    const completions = [];
    for (let s = 0; s < args.n; s++) {
      const messages = [
        { role: "system", content: SYNTH_SYSTEM },
        { role: "user", content: userPrompt(c) },
      ];
      const transcript = [...messages];
      let text = "";
      let errored = null;
      for (let turn = 0; turn <= MAX_TURNS; turn++) {
        let r;
        try {
          r = await chat({
          model: args.model,
          messages,
          tools,
          stream: false,
          think: false,
          // MATCHED TO TRL: top_k 0 and top_p 1.0 disable truncation. Ollama's
          // defaults (40 / 0.9) would truncate and make the comparison invalid.
            options: { temperature: 1, top_p: 1, top_k: 0, num_predict: 512, seed: s },
          });
        } catch (e) {
          // q4 sometimes emits tool-call arguments the server cannot parse
          // ("unexpected end of JSON input"). That is a property of the policy
          // worth counting, not a reason to lose the run.
          errored = String(e.message).slice(0, 120);
          break;
        }
        const m = r.message ?? {};
        text += (m.content ?? "") + JSON.stringify(m.tool_calls ?? []);
        messages.push(m);
        transcript.push({ role: "assistant", content: m.content ?? "", tool_calls: (m.tool_calls ?? []).map((t) => ({ name: t.function?.name, arguments: t.function?.arguments ?? {} })) });
        const calls = (m.tool_calls ?? []).slice(0, MAX_PARALLEL);
        if (!calls.length || turn === MAX_TURNS) break;
        for (const t of calls) {
          const name = t.function?.name;
          let a = t.function?.arguments ?? {};
          if (name === "list_measures") {
            const b = boundListMeasures(a);
            if (!b.ok) {
              messages.push({ role: "tool", content: b.reason });
              transcript.push({ role: "tool", name, content: b.reason });
              continue;
            }
            a = b.arguments;
          }
          const obs = await exec.call(name, a);
          messages.push({ role: "tool", content: obs.text });
          transcript.push({ role: "tool", name, content: obs.text });
        }
      }
      const reward = errored
        ? { reward: 0, verdict: null }
        : scoreReward({ gold: String(c.measure), transcript, verdicts: synthTask.verdicts, maxTurns: MAX_TURNS });
      completions.push({ text: errored ? `__ERROR__${errored}` : text, reward: reward.reward, verdict: reward.verdict ?? null, errored: Boolean(errored) });
    }
    const errs = completions.filter((x) => x.errored).length;
    // Diversity is measured on the completions that actually returned. A group
    // whose only "variety" is server errors is not a branching group.
    const ok = completions.filter((x) => !x.errored);
    const distinct = new Set(ok.map((x) => x.text)).size;
    const k = completions.filter((x) => x.reward >= 1).length;
    groups.push({ id: c.song_id, level: c.level, k, distinct, errors: errs, identical: ok.length > 1 && distinct === 1 });
    if ((gi + 1) % 8 === 0) console.log(`[q4] ${gi + 1}/${cases.length}  identical-so-far ${groups.filter((g) => g.identical).length}/${groups.length}`);
  }
  await exec.close();

  const n = groups.length;
  const identical = groups.filter((g) => g.identical).length;
  const totalErrors = groups.reduce((a, g) => a + g.errors, 0);
  const nondegen = groups.filter((g) => g.k > 0 && g.k < args.n).length;
  const summary = {
    model: args.model,
    sampling: { temperature: 1, top_p: 1, top_k: 0, n: args.n, note: "matched to TRL; Ollama defaults 40/0.9 would truncate" },
    corpus: STACK,
    groups: n,
    accuracy: groups.reduce((s, g) => s + g.k, 0) / (n * args.n),
    byte_identical_groups: identical,
    byte_identical_rate: identical / n,
    non_degenerate: nondegen,
    non_degenerate_rate: nondegen / n,
    mean_distinct_completions: groups.reduce((s, g) => s + g.distinct, 0) / n,
    malformed_tool_call_completions: totalErrors,
    malformed_rate: totalErrors / (n * args.n),
    malformed_note: "q4 emits tool-call arguments Ollama cannot parse; counted, excluded from the distinct-completion count, and scored 0",
    k_spread: groups.reduce((m, g) => ((m[g.k] = (m[g.k] ?? 0) + 1), m), {}),
    bf16_reference: { byte_identical_rate: 0.922, non_degenerate_rate: 0.0625, accuracy: 0.835, note: "same corpus, TRL/transformers" },
  };
  writeFileSync(outPath, JSON.stringify({ summary, groups }, null, 2));
  console.log("\n" + JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
