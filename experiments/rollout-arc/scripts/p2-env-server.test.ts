import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { McpStdioExecutor } from "../../../src/dataset/experiment/mcp-executor.js";
import { MAX_TURNS, scoreReward } from "../../../src/dataset/experiment/env.js";
import { boundListMeasures } from "../../../src/dataset/search-v0/window.js";
import { synthTask } from "../../../src/dataset/synth-v0/task.js";
import { caseRow, normaliseMessages, startEnvServer } from "./p2-env-server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const P1F = join(REPO, "experiments", "rollout-arc", "p1f");

// A small corpus: the forwarding contract does not depend on its size, and the
// suite should not pay for 1280 songs to prove it.
const SEED = 2026091103;
const TRAIN_PER_LEVEL = 4;
const TEST_PER_LEVEL = 2;

type Env = Awaited<ReturnType<typeof startEnvServer>>;

let env: Env;
let direct: McpStdioExecutor;
let base: string;

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const get = async (path: string) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json() };
};

beforeAll(async () => {
  env = await startEnvServer({ port: 0, seed: SEED, trainPerLevel: TRAIN_PER_LEVEL, testPerLevel: TEST_PER_LEVEL });
  base = `http://${env.host}:${env.port}`;
  // A second, independent executor over the same library. Every /tool assertion
  // below compares the bridge against this rather than against a fixture, so a
  // change in the real MCP server moves both sides together.
  direct = new McpStdioExecutor();
  await direct.start({ seedSongs: env.corpus.songs });
}, 120_000);

afterAll(async () => {
  await direct?.close();
  await env?.close();
});

describe("/tool forwards to the real MCP server", () => {
  it("returns byte-identical text to a direct executor call", async () => {
    const c = env.corpus.cases[0];
    const args = { id: c.song_id, startMeasure: c.after, endMeasure: c.after + 3 };
    const mine = await post("/tool", { name: "list_measures", arguments: args });
    const theirs = await direct.call("list_measures", args);
    expect(mine.status).toBe(200);
    expect(mine.body.text).toBe(theirs.text);
    expect(mine.body.isError).toBe(theirs.isError);
    expect(mine.body.executed).toBe(true);
    // Without this the assertion above is satisfied by two identical -32602s.
    expect(mine.body.isError).toBe(false);
    expect(mine.body.text).toContain("Measure");
  });

  it("song_info forwards byte-identically too", async () => {
    const c = env.corpus.cases[1];
    const mine = await post("/tool", { name: "song_info", arguments: { id: c.song_id } });
    const theirs = await direct.call("song_info", { id: c.song_id });
    expect(mine.body.text).toBe(theirs.text);
    expect(mine.body.isError).toBe(theirs.isError);
    expect(mine.body.isError).toBe(false);
    expect(mine.body.text).toContain(c.title);
  });

  it("applies the SAME page bound the P1c–P1f rollouts used, and does not execute a refusal", async () => {
    const c = env.corpus.cases[0];
    const wide = { id: c.song_id, startMeasure: 1, endMeasure: 10 };
    const mine = await post("/tool", { name: "list_measures", arguments: wide });
    const bound = boundListMeasures(wide);
    expect(bound.ok).toBe(false);
    expect(mine.body.text).toBe((bound as { ok: false; reason: string }).reason);
    expect(mine.body.executed).toBe(false);
    expect(mine.body.isError).toBe(true);
    // The unbounded call would have dumped the whole song. That is the P1b failure.
    const unbounded = await direct.call("list_measures", wide);
    expect(unbounded.text.length).toBeGreaterThan(mine.body.text.length);
  });

  it("refuses a window with no bounds at all, with the bound's own words", async () => {
    const c = env.corpus.cases[0];
    const mine = await post("/tool", { name: "list_measures", arguments: { id: c.song_id } });
    const bound = boundListMeasures({ id: c.song_id });
    expect(mine.body.text).toBe((bound as { ok: false; reason: string }).reason);
    expect(mine.body.executed).toBe(false);
  });

  it("the wrong argument name is a -32602, which is why the happy paths assert on isError", async () => {
    const c = env.corpus.cases[0];
    const wrong = await post("/tool", { name: "list_measures", arguments: { songId: c.song_id, startMeasure: 1, endMeasure: 4 } });
    expect(wrong.body.isError).toBe(true);
    expect(wrong.body.text).toContain("-32602");
  });

  it("hands back the executor's own refusal for a tool outside the rollout catalog", async () => {
    const mine = await post("/tool", { name: "play_song", arguments: {} });
    const theirs = await direct.call("play_song", {});
    expect(mine.body.text).toBe(theirs.text);
    expect(mine.body.executed).toBe(false);
  });
});

describe("/score forwards to the one scoreReward", () => {
  const transcriptFor = (verdict: string, toolTurns: number) => {
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: "s" },
      { role: "user", content: "u" },
    ];
    for (let i = 0; i < toolTurns; i++) {
      messages.push({ role: "assistant", content: "", tool_calls: [{ function: { name: "list_measures", arguments: {} } }] });
      messages.push({ role: "tool", name: "list_measures", content: "obs" });
    }
    messages.push({ role: "assistant", content: verdict });
    return messages;
  };

  it("is byte-identical to scoreReward over P1f rollouts", async () => {
    const preds = readFileSync(join(P1F, "preds-pass8.jsonl"), "utf8").trim().split(/\n/).map((l) => JSON.parse(l));
    const gold = new Map(
      readFileSync(join(P1F, "gold.jsonl"), "utf8").trim().split(/\n/).map((l) => {
        const g = JSON.parse(l);
        return [g.id, g.gold as string];
      }),
    );
    // Deterministic spread across the file rather than the first N, which would
    // all be D0.
    const sample = preds.filter((_, i) => i % 47 === 0);
    expect(sample.length).toBeGreaterThan(20);
    for (const p of sample) {
      const messages = transcriptFor(p.answer ?? "", p.tool_turns ?? 0);
      const g = gold.get(p.id)!;
      const mine = await post("/score", { gold: g, messages });
      const theirs = scoreReward({
        gold: g,
        transcript: normaliseMessages(messages),
        verdicts: synthTask.verdicts,
        maxTurns: MAX_TURNS,
      });
      expect(JSON.stringify(mine.body)).toBe(JSON.stringify(theirs));
    }
  }, 120_000);

  it("reproduces the reward P1f actually recorded, on all 2048 rollouts", () => {
    const preds = readFileSync(join(P1F, "preds-pass8.jsonl"), "utf8").trim().split(/\n/).map((l) => JSON.parse(l));
    const gold = new Map(
      readFileSync(join(P1F, "gold.jsonl"), "utf8").trim().split(/\n/).map((l) => {
        const g = JSON.parse(l);
        return [g.id, g.gold as string];
      }),
    );
    expect(preds.length).toBe(2048);
    let checked = 0;
    for (const p of preds) {
      const rebuilt = scoreReward({
        gold: gold.get(p.id)!,
        transcript: normaliseMessages(transcriptFor(p.answer ?? "", p.tool_turns ?? 0)) as never,
        verdicts: synthTask.verdicts,
        maxTurns: MAX_TURNS,
      });
      expect(rebuilt.reward).toBe(p.reward);
      expect(rebuilt.format_ok).toBe(p.format_ok);
      expect(rebuilt.tool_turns).toBe(p.tool_turns);
      checked++;
    }
    expect(checked).toBe(2048);
  });

  it("rejects a scoring call with no gold rather than inventing one", async () => {
    const r = await post("/score", { messages: [] });
    expect(r.status).toBe(400);
  });
});

describe("the dataset the trainer reads", () => {
  it("serves train and test from the same corpus the tools serve", async () => {
    const health = await get("/health");
    const train = await get("/cases?split=train");
    const test = await get("/cases?split=test");
    expect(health.body.library_songs).toBe(env.corpus.songs.length);
    expect(train.body.n).toBe(TRAIN_PER_LEVEL * 4);
    expect(test.body.n).toBe(TEST_PER_LEVEL * 4);
    expect(health.body.limits).toMatchObject({ max_turns: 5, max_parallel: 2, max_list_window: 4 });
  });

  it("names neither the gold measure nor the song id in the prompt", async () => {
    const { body } = await get("/cases?split=train");
    for (const row of body.cases) {
      expect(row.user).not.toContain(row.song_id);
      expect(row.user).not.toMatch(new RegExp(`\\b${row.gold}\\b`));
      expect(row.prompt[0].role).toBe("system");
      expect(row.prompt[1].content).toBe(row.user);
    }
  });

  it("train and test share no song_id", async () => {
    const train = await get("/cases?split=train");
    const test = await get("/cases?split=test");
    const trainIds = new Set(train.body.cases.map((r: { song_id: string }) => r.song_id));
    for (const r of test.body.cases) expect(trainIds.has(r.song_id)).toBe(false);
  });

  it("caseRow is the same row whether it came over HTTP or in process", async () => {
    const { body } = await get("/cases?split=test&limit=3");
    for (const row of body.cases) {
      const c = env.corpus.cases.find((x: { song_id: string }) => x.song_id === row.song_id)!;
      expect(JSON.stringify(caseRow(c))).toBe(JSON.stringify(row));
    }
  });
});

describe("normaliseMessages preserves exactly what scoreReward reads", () => {
  it("keeps tool_calls presence across both call shapes", () => {
    const openai = normaliseMessages([{ role: "assistant", content: "", tool_calls: [{ function: { name: "x", arguments: {} } }] }]);
    const inRepo = normaliseMessages([{ role: "assistant", content: "", tool_calls: [{ name: "x", arguments: {} }] }]);
    expect(openai[0].tool_calls).toHaveLength(1);
    expect(inRepo[0].tool_calls).toHaveLength(1);
    expect(openai[0].tool_calls[0].name).toBe("x");
    expect(inRepo[0].tool_calls[0].name).toBe("x");
  });

  it("drops an empty tool_calls array so a final turn stays final", () => {
    const [m] = normaliseMessages([{ role: "assistant", content: "42", tool_calls: [] }]);
    expect(m.tool_calls).toBeUndefined();
  });

  it("throws on a non-array rather than scoring nothing", () => {
    expect(() => normaliseMessages("nope" as never)).toThrow();
  });
});
