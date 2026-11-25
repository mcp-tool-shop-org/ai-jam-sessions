import { createServer, type Server as HttpServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { initializeFromLibrary } from "../songs/library.js";
import { getAllSongs } from "../songs/registry.js";
import { analyzeHarmony } from "../analysis/index.js";
import { formatStructuredSystemPrompt } from "../dataset/eval/llm-backends/ollama.js";
import type { ChordProposerBackend } from "../maker/chord-proposer.js";
import {
  buildJudgePrompt,
  estimateJudgeContextTokens,
  JUDGE_CHARS_PER_TOKEN,
  JUDGE_CTX_MARGIN_TOKENS,
  JUDGE_DEFAULT_MAX_TOKENS,
  JUDGE_NUM_CTX,
  makeUnreachablePanelJudge,
  OllamaBwsJudge,
} from "./ollama-bws-judge.js";
import { OllamaSpecRealizer } from "./ollama-spec-realizer.js";
import { MIN_PANEL_JUDGES, renderVoicingText } from "./bws.js";
import { nearestToneRealization, rootPositionRealization, type ChordProgression } from "./realize.js";
import { refineRealization } from "./refine.js";
import { progressionFromAnalysis } from "./index.js";
import { runComposePanelTool } from "./compose-panel-tool.js";
import type { PanelSystemSpec } from "./panel-run.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));


describe("OllamaBwsJudge", () => {
  it("probes at seed 7 and parses judge text, including a thrown callStructured", async () => {
    const seeds: number[] = [];
    let raw = '{"best":1,"worst":2}';
    let throwNext = true;
    const seen: Array<{ systemPrompt: string; userMessage: string; outputSchema: Record<string, unknown> }> = [];
    const backendFactory = (seed: number): ChordProposerBackend => {
      seeds.push(seed);
      return {
        async probe() {},
        async callStructured(args) {
          seen.push(args);
          if (throwNext) {
            throwNext = false;
            throw new Error("structured-failed");
          }
          return {};
        },
        lastRawText() {
          return raw;
        },
      };
    };

    const judge = new OllamaBwsJudge("judge-model", "granite", { backendFactory });
    expect(judge.model).toBe("judge-model");
    expect(judge.family).toBe("granite");

    await judge.probe();
    const parsed = await judge.judge("C major", ["alpha voice", "beta voice"]);
    expect(parsed).toEqual({ best: 0, worst: 1 });
    expect(seen[0].systemPrompt).toContain("voice-leading quality and musicality");
    expect(seen[0].userMessage).toContain("Progression key: C major.");
    expect(seen[0].userMessage).toContain("Option 1:\nalpha voice");
    expect(seen[0].userMessage).toContain("Option 2:\nbeta voice");
    expect(seen[0].outputSchema).toEqual({});

    raw = '{"best":1,"worst":1}';
    const dropped = await judge.judge("C major", ["alpha voice", "beta voice"], 5);
    expect(dropped).toBeNull();
    expect(seeds).toEqual([7, 7, 12]);
  });

  it("rethrows RequestCancelledError on abort instead of dropping the vote", async () => {
    const ac = new AbortController();
    const judge = new OllamaBwsJudge("judge-model", "granite", {
      backendFactory: () => ({
        async probe() {},
        async callStructured() {
          ac.abort("judge cancelled");
          throw new Error("aborted");
        },
        lastRawText: () => null,
      }),
    });
    await expect(judge.judge("C major", ["a", "b"], 0, ac.signal)).rejects.toThrow("judge cancelled");
  });
});

describe("OllamaBwsJudge — drop attribution, think: false, and num_ctx sizing", () => {
  const servers: HttpServer[] = [];

  afterEach(async () => {
    for (const s of servers.splice(0)) {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
  });

  async function startFakeOllamaServer(handlers: {
    show?: (model: string) => { status?: number; capabilities?: string[] };
    chat: (
      body: Record<string, unknown>,
      respondJson: (status: number, payload: unknown) => void,
    ) => void;
  }): Promise<{
    url: string;
    chatRequests: Array<Record<string, unknown>>;
    showModels: string[];
  }> {
    const chatRequests: Array<Record<string, unknown>> = [];
    const showModels: string[] = [];
    const srv = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/api/tags") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ models: [] }));
        return;
      }
      let raw = "";
      req.setEncoding("utf8");
      req.on("data", (c) => {
        raw += c;
      });
      req.on("end", () => {
        const body = JSON.parse(raw || "{}") as Record<string, unknown>;
        if (req.method === "POST" && req.url === "/api/show") {
          const model = String(body.model ?? "");
          showModels.push(model);
          const reply = handlers.show?.(model) ?? { capabilities: ["completion"] };
          res.writeHead(reply.status ?? 200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ capabilities: reply.capabilities ?? [] }));
          return;
        }
        if (req.method === "POST" && req.url === "/api/chat") {
          chatRequests.push(body);
          let sent = false;
          const respondJson = (status: number, payload: unknown) => {
            if (sent || res.writableEnded || res.destroyed) return;
            sent = true;
            res.writeHead(status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(payload));
          };
          handlers.chat(body, respondJson);
          return;
        }
        res.writeHead(404);
        res.end();
      });
    });
    servers.push(srv);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const addr = srv.address();
    if (!addr || typeof addr === "string") throw new Error("unexpected address");
    return { url: `http://127.0.0.1:${addr.port}`, chatRequests, showModels };
  }

  const PROG: ChordProgression = {
    key: "C major",
    chords: [
      { measure: 1, chordSymbol: "C" },
      { measure: 2, chordSymbol: "F" },
      { measure: 3, chordSymbol: "G" },
      { measure: 4, chordSymbol: "C" },
    ],
  };

  const SYSTEMS: PanelSystemSpec[] = [
    { id: "floor", note: "invalid", realize: (p) => rootPositionRealization(p, 4) },
    { id: "nearest", note: "baseline", realize: (p) => nearestToneRealization(p, 4) },
    { id: "refined", note: "valid", realize: (p) => refineRealization(nearestToneRealization(p, 4), { voices: 4, style: "lead-sheet" }).realization },
    { id: "engine", note: "engine", realize: (p) => refineRealization(nearestToneRealization(p, 4), { voices: 4, style: "lead-sheet" }).realization },
  ];

  it("reports timeout, empty_reply (after thinking), parse_failure, and unreachable per judge and voids under-quorum songs", async () => {
    const fake = await startFakeOllamaServer({
      show: (model) =>
        model === "thinking-empty"
          ? { capabilities: ["completion", "thinking"] }
          : { capabilities: ["completion"] },
      chat: (body, respond) => {
        const model = String(body.model ?? "");
        if (model === "slow-timeout") {
          // Intentionally hold open past 60 ms timeoutMs
          return;
        }
        if (model === "thinking-empty") {
          respond(200, {
            model,
            message: { role: "assistant", content: "", thinking: "spent all 128 tokens thinking" },
            eval_count: 128,
            done: true,
          });
          return;
        }
        if (model === "garbage-json") {
          respond(200, {
            model,
            message: { role: "assistant", content: "I cannot decide between options." },
            done: true,
          });
          return;
        }
        respond(404, { error: "model not found" });
      },
    });

    const judges = [
      new OllamaBwsJudge("slow-timeout", "fam-timeout", { baseUrl: fake.url, timeoutMs: 60 }),
      new OllamaBwsJudge("thinking-empty", "fam-empty", { baseUrl: fake.url }),
      new OllamaBwsJudge("garbage-json", "fam-parse", { baseUrl: fake.url }),
      new OllamaBwsJudge("missing-tag", "fam-unreachable", { baseUrl: fake.url }),
    ];

    const res = await runComposePanelTool({
      progressions: [{ id: "song-a", progression: PROG }],
      systems: SYSTEMS,
      judges,
      bootstrap: 20,
      seed: 1,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.payload.votesCollected).toBe(0);
    expect(res.payload.votesCounted).toBe(0);
    expect(res.payload.minJudgesPerSong).toBe(MIN_PANEL_JUDGES);
    expect(res.payload.validSongs).toEqual([]);
    expect(res.payload.interpretable).toBe(false);
    expect(res.payload.drops.total).toBe(4);
    expect(res.payload.drops.byReason).toEqual({
      timeout: 1,
      empty_reply: 1,
      parse_failure: 1,
      unreachable: 1,
    });
    expect(res.payload.drops.byJudge).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: "fam-timeout",
          droppedCount: 1,
          byReason: { timeout: 1, empty_reply: 0, parse_failure: 0, unreachable: 0 },
          tuples: [expect.objectContaining({ songId: "song-a", reason: "timeout" })],
        }),
        expect.objectContaining({
          family: "fam-empty",
          droppedCount: 1,
          byReason: { timeout: 0, empty_reply: 1, parse_failure: 0, unreachable: 0 },
          tuples: [expect.objectContaining({ songId: "song-a", reason: "empty_reply" })],
        }),
        expect.objectContaining({
          family: "fam-parse",
          droppedCount: 1,
          byReason: { timeout: 0, empty_reply: 0, parse_failure: 1, unreachable: 0 },
          tuples: [expect.objectContaining({ songId: "song-a", reason: "parse_failure" })],
        }),
        expect.objectContaining({
          family: "fam-unreachable",
          droppedCount: 1,
          byReason: { timeout: 0, empty_reply: 0, parse_failure: 0, unreachable: 1 },
          tuples: [expect.objectContaining({ songId: "song-a", reason: "unreachable" })],
        }),
      ]),
    );
    expect(res.payload.voidedSongs).toEqual([
      expect.objectContaining({
        songId: "song-a",
        votesCast: 0,
        minJudges: MIN_PANEL_JUDGES,
        reason: `INSUFFICIENT_JUDGES: 0 of ${MIN_PANEL_JUDGES} judges voted`,
      }),
    ]);
    expect(res.text).toContain("timeout: 1");
    expect(res.text).toContain("empty_reply: 1");
    expect(res.text).toContain("parse_failure: 1");
    expect(res.text).toContain("unreachable: 1");
    expect(res.text).toContain(`INSUFFICIENT_JUDGES: 0 of ${MIN_PANEL_JUDGES} judges voted`);
    expect(res.text).toContain("VOIDED");
  });

  it("sends think: false only when /api/show advertises thinking, records per-judge think, and leaves realizer calls untouched", async () => {
    const fake = await startFakeOllamaServer({
      show: (model) => {
        // Deliberately use deceptive names so capability detection cannot guess by name.
        if (model === "plain-sounding-name") return { capabilities: ["completion", "thinking"] };
        if (model === "gemma4:31b") return { capabilities: ["completion", "tools"] };
        return { status: 404 };
      },
      chat: (body, respond) => {
        if (body.model === "qwen2.5:7b") {
          respond(200, {
            model: "qwen2.5:7b",
            message: { role: "assistant", content: '[{"measure":1,"degrees":[0,1,2,0]}]' },
            done: true,
          });
          return;
        }
        respond(200, {
          model: body.model,
          message: { role: "assistant", content: '{"best":1,"worst":4}' },
          done: true,
        });
      },
    });

    const jThinking = new OllamaBwsJudge("plain-sounding-name", "fam-a", { baseUrl: fake.url });
    const jPlain = new OllamaBwsJudge("gemma4:31b", "fam-b", { baseUrl: fake.url });
    const jNoShow = new OllamaBwsJudge("old-server-model", "fam-c", { baseUrl: fake.url });
    await Promise.all([jThinking.probe(), jPlain.probe(), jNoShow.probe()]);

    const res = await runComposePanelTool({
      progressions: [{ id: "song-a", progression: PROG }],
      systems: SYSTEMS,
      judges: [jThinking, jPlain, jNoShow],
      bootstrap: 20,
      seed: 1,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const realizer = new OllamaSpecRealizer("qwen2.5:7b", { baseUrl: fake.url });
    await realizer.proposeRealization(PROG, 0);

    const reqThinking = fake.chatRequests.find((r) => r.model === "plain-sounding-name")!;
    const reqPlain = fake.chatRequests.find((r) => r.model === "gemma4:31b")!;
    const reqNoShow = fake.chatRequests.find((r) => r.model === "old-server-model")!;
    const reqRealizer = fake.chatRequests.find((r) => r.model === "qwen2.5:7b")!;

    expect(reqThinking.think).toBe(false);
    expect("think" in reqPlain).toBe(false);
    expect("think" in reqNoShow).toBe(false);
    expect("think" in reqRealizer).toBe(false);
    expect((reqThinking.options as Record<string, unknown>).num_ctx).toBe(JUDGE_NUM_CTX);
    expect((reqRealizer.options as Record<string, unknown>).num_ctx).toBeUndefined();

    expect(res.payload.judges).toEqual([
      { family: "fam-a", model: "plain-sounding-name", think: false },
      { family: "fam-b", model: "gemma4:31b", think: null },
      { family: "fam-c", model: "old-server-model", think: null },
    ]);
  });

  it("sends explicit power-of-two JUDGE_NUM_CTX = 16_384 on judge requests", async () => {
    expect(JUDGE_NUM_CTX).toBe(16_384);
    expect(JUDGE_NUM_CTX & (JUDGE_NUM_CTX - 1)).toBe(0);

    const fake = await startFakeOllamaServer({
      show: () => ({ capabilities: ["completion"] }),
      chat: (_body, respond) =>
        respond(200, {
          model: "judge-a",
          message: { role: "assistant", content: '{"best":1,"worst":2}' },
          done: true,
        }),
    });
    const judge = new OllamaBwsJudge("judge-a", "fam-a", { baseUrl: fake.url });
    await judge.judge("C major", ["m1 C: C3 E3 G3 C4", "m1 C: C3 G3 C4 E4"]);
    const chatOpts = fake.chatRequests[0].options as Record<string, unknown>;
    expect(chatOpts.num_ctx).toBe(JUDGE_NUM_CTX);
    expect(chatOpts.num_predict).toBe(JUDGE_DEFAULT_MAX_TOKENS);
  });

  it("fits the largest real judge prompt + schema suffix + num_predict + margin within JUDGE_NUM_CTX", () => {
    initializeFromLibrary(join(REPO_ROOT, "songs", "library"));
    const songs = getAllSongs();
    expect(songs.length).toBeGreaterThan(0);

    let maxChars = 0;
    let maxSongId = "";
    let maxProg: ChordProgression | null = null;
    for (const song of songs) {
      const prog = progressionFromAnalysis(analyzeHarmony(song, { measureRange: [1, 99999] }));
      const floor = rootPositionRealization(prog, 4);
      const near = nearestToneRealization(prog, 4);
      // Accidental-heavy 4-voice upper bound matching refined/engine length per measure
      const sharpUpperBound = {
        ...near,
        frames: near.frames.map((f) => ({ ...f, voices: f.voices.map(() => 61) })),
      };
      const options = [
        renderVoicingText(floor),
        renderVoicingText(near),
        renderVoicingText(sharpUpperBound),
        renderVoicingText(sharpUpperBound),
      ];
      const { system, user } = buildJudgePrompt(prog.key, options);
      const sysWithSchema = formatStructuredSystemPrompt(system, {});
      const chars = sysWithSchema.length + user.length;
      if (chars > maxChars) {
        maxChars = chars;
        maxSongId = song.id;
        maxProg = prog;
      }
    }

    // Also include a real refineRealization pass on the longest shipped progression
    const refinedMax = refineRealization(nearestToneRealization(maxProg!, 4), {
      voices: 4,
      style: "lead-sheet",
      maxPasses: 1,
    }).realization;
    const refinedPrompt = buildJudgePrompt(maxProg!.key, [
      renderVoicingText(rootPositionRealization(maxProg!, 4)),
      renderVoicingText(nearestToneRealization(maxProg!, 4)),
      renderVoicingText(refinedMax),
      renderVoicingText(refinedMax),
    ]);
    const refinedTokensEst = estimateJudgeContextTokens(
      formatStructuredSystemPrompt(refinedPrompt.system, {}),
      refinedPrompt.user,
    );
    const maxTokensEst =
      Math.ceil(maxChars / JUDGE_CHARS_PER_TOKEN) + JUDGE_DEFAULT_MAX_TOKENS + JUDGE_CTX_MARGIN_TOKENS;

    expect(maxSongId).toBe("bethena");
    expect(maxChars).toBeGreaterThan(20_000);
    expect(refinedTokensEst).toBeLessThanOrEqual(maxTokensEst);
    expect(maxTokensEst).toBeLessThanOrEqual(JUDGE_NUM_CTX);
  });

  it("makeUnreachablePanelJudge emits an unreachable drop", async () => {
    const down = makeUnreachablePanelJudge("aya-expanse:32b", "aya", "ECONNREFUSED");
    expect(await down.judge("C major", ["a", "b"], 0)).toBeNull();
    expect(await down.judgeDetailed?.("C major", ["a", "b"], 0)).toEqual({
      ok: false,
      reason: "unreachable",
      detail: "ECONNREFUSED",
    });
  });
});
