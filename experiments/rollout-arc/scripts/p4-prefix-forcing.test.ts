// Prefix forcing — the bridge half.
//
// A SEPARATE file from p4-vl-server.test.ts for the same reason the bridge is a
// separate file from p2-env-server.mjs: the opening alphabet and the forcing
// receipts change together and change with nothing else. The existing 15 tests are
// the committed receipt surface for /cases, /score and the pool gate.
//
// What is asserted here is not "the code runs". It is that the alphabet the TRAINER
// will force is byte-for-byte the alphabet the PUBLISHED exploring-starts run
// measured. Two derivations that drift by one candidate would force openings nobody
// measured, and nothing would throw: the completions would still parse, still score,
// and the run would look exactly as healthy as a correct one.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderSpecRealization } from "../../../src/compose/index.js";
import {
  startVlServer,
  scoreVoicing,
  validOpenings,
  openingPrefix,
  vlCaseRow,
} from "./p4-vl-server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, "..", "p4", "runs");
const FIXTURE = join(HERE, "..", "p4", "fixtures", "progressions-v1.json");

const lines = (p: string) =>
  readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the opening alphabet is the alphabet the published run measured", () => {
  const prompts = lines(join(RUNS, "spec-prompts-4bar-random.jsonl")) as Array<{
    itemId: string;
    progression: { chords: Array<{ measure: number; chordSymbol: string }> };
  }>;
  const forced = lines(join(RUNS, "spec-4bar-prefixed.jsonl")) as Array<{
    itemId: string;
    openings_available: number;
    prefixes: string[];
  }>;
  const byId = new Map(prompts.map((p) => [p.itemId, p.progression]));

  it("reproduces every item's opening COUNT from the committed exploring-starts run", () => {
    expect(forced.length).toBeGreaterThan(0);
    for (const row of forced) {
      const prog = byId.get(row.itemId);
      expect(prog, `no progression for ${row.itemId}`).toBeDefined();
      expect(validOpenings(prog!, 2)).toHaveLength(row.openings_available);
    }
  });

  it("reproduces the exact prefix STRINGS that run generated from", () => {
    for (const row of forced) {
      const prog = byId.get(row.itemId)!;
      const openings = validOpenings(prog, 2);
      // That run assigned rollout i the opening i mod |valid|, so its prefix list is
      // the alphabet cycled. Byte equality, not shape equality.
      const rebuilt = row.prefixes.map((_, i) => openingPrefix(prog, openings[i % openings.length]!));
      expect(rebuilt).toEqual(row.prefixes);
    }
  });

  it("admits ONLY openings that render the full voice count", () => {
    // The alphabet is decided by rendering, never by the chord's apparent
    // cardinality: a triad has no fourth note for degree 3 to sing, and the renderer
    // is the only authority the verifier will agree with.
    let checked = 0;
    for (const row of forced.slice(0, 8)) {
      const prog = byId.get(row.itemId)!;
      const first = prog.chords.find((c) => c.chordSymbol && c.chordSymbol !== "N/C")!;
      for (const degrees of validOpenings(prog, 2)) {
        const real = renderSpecRealization(prog as never, [{ measure: first.measure, degrees }] as never, 2);
        expect(real.frames.find((f) => f.measure === first.measure)!.voices).toHaveLength(2);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("cuts the prefix mid-array so the model continues instead of restarting", () => {
    const prog = byId.get(forced[0]!.itemId)!;
    const pfx = openingPrefix(prog, validOpenings(prog, 2)[0]!);
    expect(pfx).toMatch(/^\[\{"measure": \d+, "degrees": \[\d+(, \d+)*\]\},$/);
    // Trailing comma: still an OPEN array. Closing it without removing the comma is
    // invalid JSON, which is exactly what "partial assistant turn" has to mean.
    expect(() => JSON.parse(pfx + "]")).toThrow();
    expect(() => JSON.parse(pfx.slice(0, -1) + "]")).not.toThrow();
  });
});

describe("/cases carries one prefix per valid opening", () => {
  let env: Awaited<ReturnType<typeof startVlServer>>;
  let base = "";

  beforeAll(async () => {
    env = await startVlServer({ port: 0, voices: 2, style: "common-practice", fixture: FIXTURE });
    base = `http://${env.host}:${env.port}`;
  }, 120_000);
  afterAll(async () => {
    await env?.close();
  });

  it("puts openings and a matching prefix list on every row", async () => {
    const body = (await (await fetch(`${base}/cases?limit=6`)).json()) as {
      cases: Array<{ openings: number[][]; prefixes: string[] }>;
    };
    expect(body.cases).toHaveLength(6);
    for (const c of body.cases) {
      expect(c.openings.length).toBeGreaterThan(0);
      expect(c.prefixes).toHaveLength(c.openings.length);
      for (const o of c.openings) expect(o).toHaveLength(2);
    }
  });

  it("/health summarises the alphabet so a receipt never has to infer it", async () => {
    const body = (await (await fetch(`${base}/health`)).json()) as {
      openings: { min: number; max: number; histogram: Record<string, number> };
      counters: Record<string, number>;
    };
    expect(body.openings.min).toBeGreaterThan(0);
    expect(body.openings.max).toBeLessThanOrEqual(16);
    expect(Object.keys(body.openings.histogram).length).toBeGreaterThan(0);
    // The independent forcing check has to exist before a forced run can claim it.
    expect(body.counters.first_measure_wrong).toBe(0);
  });
});

describe("first_measure_ok — the independent proof a forced opening reached the scorer", () => {
  const fx = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
    progressions: Array<{ songId: string; progression: { chords: Array<{ measure: number; chordSymbol: string }> } }>;
  };
  const prog = fx.progressions[0]!.progression;
  const named = prog.chords.filter((c) => c.chordSymbol && c.chordSymbol !== "N/C");
  const tail = named.slice(1).map((c) => `{"measure": ${c.measure}, "degrees": [0, 1]}`).join(",");

  it("is true when the completion opens on the progression's first named measure", () => {
    const row = vlCaseRow("x", prog, 2, "common-practice");
    const s = scoreVoicing(prog, `${row.prefixes[0]!}${tail}]`, 2, "common-practice");
    expect(s.first_measure_ok).toBe(true);
    expect(s.first_measure).toBe(named[0]!.measure);
  });

  it("is FALSE when the first measure is missing — which is what a lost prefix looks like", () => {
    const s = scoreVoicing(prog, `[${tail}]`, 2, "common-practice");
    expect(s.first_measure_ok).toBe(false);
    // And the structure gate independently refuses it, so a prefix that escapes
    // scoring COLLAPSES the reward rather than inflating it. Two failures, not one.
    expect(s.correct).toBe(false);
    expect(s.verdict).toBe("structure");
  });

  it("counts a lost first measure on /health, because the trainer gates on the delta", async () => {
    const srv = await startVlServer({ port: 0, voices: 2, style: "common-practice", fixture: FIXTURE });
    try {
      const b = `http://${srv.host}:${srv.port}`;
      const gold = fx.progressions[0]!.songId;
      const post = (content: string) =>
        fetch(`${b}/score`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ gold, messages: [{ role: "assistant", content }] }),
        });
      const row = vlCaseRow(gold, prog, 2, "common-practice");
      await post(`${row.prefixes[0]!}${tail}]`);
      let h = (await (await fetch(`${b}/health`)).json()) as { counters: Record<string, number> };
      expect(h.counters.first_measure_wrong).toBe(0);
      await post(`[${tail}]`);
      h = (await (await fetch(`${b}/health`)).json()) as { counters: Record<string, number> };
      expect(h.counters.first_measure_wrong).toBe(1);
    } finally {
      await srv.close();
    }
  });
});
