import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaInternBackend } from "./ollama-intern.js";

const BASE = "http://ollama.invalid:11434";
const MODEL = "qwen2.5:7b";

function installFetch(bodyFor: (url: string) => {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}) {
  const fetchMock = vi.fn(async (url: string) => bodyFor(url));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function chat(content: string, extra?: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: MODEL,
      message: { role: "assistant", content, ...extra },
      done: true,
      prompt_eval_count: 9,
      eval_count: 2,
    }),
    text: async () => "",
  };
}

describe("OllamaInternBackend", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("probe GETs /api/tags on the inner host", async () => {
    const fetchMock = installFetch(() => ({ ok: true, status: 200 }));
    const backend = new OllamaInternBackend(MODEL, BASE);
    await expect(backend.probe()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/tags`);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("GET");
  });

  it("callWithTools returns the inner tool call", async () => {
    const fetchMock = installFetch(() =>
      chat("", {
        tool_calls: [{ function: { name: "song_info", arguments: { id: "song-1" } } }],
      }),
    );
    const backend = new OllamaInternBackend(MODEL, BASE);
    const result = await backend.callWithTools({
      systemPrompt: "sys",
      userMessage: "user",
      tools: [{ name: "song_info", inputSchema: { type: "object" } }],
    });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/chat`);
    expect(result).toEqual({
      toolCalls: [{ tool: "song_info", arguments: { id: "song-1" } }],
      rawText: "",
    });
  });

  it("callStructured returns the parsed object and lastRawText", async () => {
    installFetch(() => chat('{"best":1}'));
    const backend = new OllamaInternBackend(MODEL, BASE);
    await expect(
      backend.callStructured<{ best: number }>({
        systemPrompt: "sys",
        userMessage: "user",
        outputSchema: { type: "object" },
      }),
    ).resolves.toEqual({ best: 1 });
    expect(backend.lastRawText()).toBe('{"best":1}');
  });

  it("callPlain returns the text and lastCallMetadata from the inner call", async () => {
    const fetchMock = installFetch(() => chat("B"));
    const backend = new OllamaInternBackend(MODEL, BASE);
    await expect(
      backend.callPlain({ systemPrompt: "sys", userMessage: "user", maxTokens: 4 }),
    ).resolves.toBe("B");
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/chat`);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.options).toEqual({ num_predict: 4 });
    const meta = backend.lastCallMetadata();
    expect(meta.promptTokens).toBe(9);
    expect(meta.completionTokens).toBe(2);
    expect(meta.costEstimate).toBe(0);
    expect(meta.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("callPlain surfaces the inner HTTP error", async () => {
    installFetch(() => ({
      ok: false,
      status: 500,
      text: async () => "intern down",
    }));
    const backend = new OllamaInternBackend(MODEL, BASE);
    await expect(
      backend.callPlain({ systemPrompt: "sys", userMessage: "user" }),
    ).rejects.toThrow("Ollama returned HTTP 500: intern down");
  });
});
