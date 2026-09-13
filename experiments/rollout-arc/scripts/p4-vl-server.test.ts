import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseSpecResponse, renderSpecRealization, verifyVoiceLeading } from "../../../src/compose/index.js";
import { startVlServer, scoreVoicing, lastAssistantText, shuffled } from "./p4-vl-server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, "..", "p4", "runs");

let env: Awaited<ReturnType<typeof startVlServer>>;
let base = "";

beforeAll(async () => {
  env = await startVlServer({ port: 0, voices: 2, style: "film-ambient", seed: 20260913 });
  base = `http://${env.host}:${env.port}`;
}, 120_000);

afterAll(async () => {
  await env?.close();
});

const get = async (path: string) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const post = async (path: string, body: unknown) => {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("/health describes the task, and declares no tools", () => {
  it("reports the pool and an EMPTY tool list", async () => {
    const { status, body } = await get("/health");
    expect(status).toBe(200);
    expect(body.task).toBe("voice-leading/spec");
    expect(body.voices).toBe(2);
    expect(body.style).toBe("film-ambient");
    // The whole point of this surface: no tool loop to confound the measurement.
    expect(body.tools).toEqual([]);
    expect(Number(body.pool_size)).toBeGreaterThan(50);
  });
});

describe("/cases yields rows the trainer can read", () => {
  it("carries prompt and gold on every row", async () => {
    const { body } = await get("/cases?limit=8");
    const cases = body.cases as Array<Record<string, unknown>>;
    expect(body.n).toBe(8);
    for (const c of cases) {
      expect(typeof c.gold).toBe("string");
      expect(c.gold).toBe(c.song_id);
      const prompt = c.prompt as Array<{ role: string; content: string }>;
      expect(prompt).toHaveLength(2);
      expect(prompt[0]!.role).toBe("system");
      expect(prompt[1]!.role).toBe("user");
      expect(prompt[1]!.content).toContain("Measure");
    }
  });

  it("a limit takes a prefix of an ALREADY-shuffled pool, so it is a random sample", async () => {
    // The trap this exists for: the song library is ordered by genre, so a
    // contiguous slice of the RAW order is a genre block, not a sample.
    const { body } = await get("/cases?limit=32");
    const ids = (body.cases as Array<{ song_id: string }>).map((c) => c.song_id);
    expect(new Set(ids).size).toBe(32);
  });

  it("shuffled() is deterministic for a seed and differs between seeds", () => {
    const xs = Array.from({ length: 40 }, (_, i) => i);
    expect(shuffled(xs, 1)).toEqual(shuffled(xs, 1));
    expect(shuffled(xs, 1)).not.toEqual(shuffled(xs, 2));
    expect([...shuffled(xs, 7)].sort((a, b) => a - b)).toEqual(xs);
  });
});

describe("/score speaks the contract reward.py already reads", () => {
  it("returns every field jam_verdict_reward consumes", async () => {
    const { body: cases } = await get("/cases?limit=1");
    const row = (cases.cases as Array<{ gold: string }>)[0]!;
    const { status, body } = await post("/score", {
      gold: row.gold,
      messages: [{ role: "assistant", content: '[{"measure": 1, "degrees": [0, 1]}]' }],
    });
    expect(status).toBe(200);
    for (const key of ["reward", "format_ok", "correct", "verdict", "tool_turns"]) {
      expect(body).toHaveProperty(key);
    }
    expect(typeof body.reward).toBe("number");
    expect(body.tool_turns).toBe(0);
  });

  it("rejects a missing gold, and an unknown song id", async () => {
    expect((await post("/score", { messages: [] })).status).toBe(400);
    expect((await post("/score", { gold: "no-such-song", messages: [] })).status).toBe(404);
  });

  it("unparseable output is format_ok false and reward 0, not an error", async () => {
    const { body: cases } = await get("/cases?limit=1");
    const row = (cases.cases as Array<{ gold: string }>)[0]!;
    const { status, body } = await post("/score", {
      gold: row.gold,
      messages: [{ role: "assistant", content: "I cannot voice this progression." }],
    });
    expect(status).toBe(200);
    expect(body.format_ok).toBe(false);
    expect(body.reward).toBe(0);
  });
});

describe("lastAssistantText", () => {
  it("takes the final assistant turn, and tolerates a bare string", () => {
    expect(lastAssistantText([{ role: "user", content: "x" }, { role: "assistant", content: "y" }])).toBe("y");
    expect(lastAssistantText([{ role: "assistant", content: [{ text: "a" }, { text: "b" }] }])).toBe("ab");
    expect(lastAssistantText("raw")).toBe("raw");
    expect(lastAssistantText([])).toBe("");
  });
});

// THE TEST THAT MATTERS. A bridge that scores differently from the probe would
// make the smoke run measure a different population than P4 reported, which is
// precisely the rate-mismatch the smoke run exists to rule out.
describe("the bridge agrees with the probe that produced the P4 numbers", () => {
  it("reproduces scoreVoicing on every committed completion of the randomized run", () => {
    const prompts = readFileSync(join(RUNS, "spec-prompts-v2-random.jsonl"), "utf8")
      .trim().split("\n").map((l) => JSON.parse(l));
    const byId = new Map(prompts.map((p) => [p.itemId, p.progression]));
    const rows = readFileSync(join(RUNS, "spec-g8-v2-random.jsonl"), "utf8")
      .trim().split("\n").map((l) => JSON.parse(l));

    let checked = 0;
    let admitted = 0;
    for (const r of rows) {
      const progression = byId.get(r.itemId);
      expect(progression, `no progression for ${r.itemId}`).toBeDefined();
      for (const raw of r.completions as string[]) {
        // What the probe computed, inline.
        const expected = verifyVoiceLeading(
          renderSpecRealization(progression, parseSpecResponse(raw), 2),
          { style: "film-ambient" },
        ).admitted;
        // What the bridge will report to the trainer.
        const got = scoreVoicing(progression, raw, 2, "film-ambient");
        expect(got.correct).toBe(expected);
        expect(got.reward).toBe(expected ? 1 : 0);
        checked++;
        if (expected) admitted++;
      }
    }
    expect(checked).toBe(256);
    // The published P4 figure for this cell: p = 0.4492 (115 of 256).
    expect(admitted / checked).toBeCloseTo(0.4492, 3);
  });
});
