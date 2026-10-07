import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaBackend } from "./ollama.js";

const BASE = "http://ollama.invalid:11434";
const MODEL = "qwen2.5:7b";

function installFetch(
  impl: (url: string, init?: RequestInit) => Promise<{
    ok: boolean;
    status: number;
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  }>,
) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function okChat(message: Record<string, unknown>, counts?: { prompt?: number; eval?: number }) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: MODEL,
      message,
      done: true,
      ...(counts?.prompt !== undefined ? { prompt_eval_count: counts.prompt } : {}),
      ...(counts?.eval !== undefined ? { eval_count: counts.eval } : {}),
    }),
    text: async () => "",
  };
}

describe("OllamaBackend", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("callWithTools posts to /api/chat and returns the parsed tool call", async () => {
    const fetchMock = installFetch(async () =>
      okChat({
        role: "assistant",
        content: "calling",
        tool_calls: [
          { function: { name: "list_measures", arguments: { id: "song-1", startMeasure: 1 } } },
        ],
      }),
    );
    const backend = new OllamaBackend(MODEL, BASE);
    const result = await backend.callWithTools({
      systemPrompt: "sys",
      userMessage: "user",
      tools: [{ name: "list_measures", description: "list", inputSchema: { type: "object" } }],
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/chat`);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      model: MODEL,
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "user" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "list_measures",
            description: "list",
            parameters: { type: "object" },
          },
        },
      ],
      stream: false,
    });
    expect(result.toolCalls).toEqual([
      { tool: "list_measures", arguments: { id: "song-1", startMeasure: 1 } },
    ]);
    expect(result.rawText).toBe("calling");
  });

  it("callWithTools throws the no-tool-call error when content is empty", async () => {
    installFetch(async () => okChat({ role: "assistant", content: "", tool_calls: [] }));
    const backend = new OllamaBackend(MODEL, BASE);
    await expect(
      backend.callWithTools({ systemPrompt: "sys", userMessage: "user", tools: [] }),
    ).rejects.toThrow(
      `Model ${MODEL} returned no tool calls. ` +
        "Ensure you are using a model with native tool-use support (hermes3:8b, qwen2.5:7b, llama3.1:8b+).",
    );
  });

  it("posts a non-ok body as the HTTP error string", async () => {
    installFetch(async () => ({
      ok: false,
      status: 500,
      text: async () => "upstream exploded",
    }));
    const backend = new OllamaBackend(MODEL, BASE);
    await expect(
      backend.callPlain({ systemPrompt: "sys", userMessage: "user" }),
    ).rejects.toThrow("Ollama returned HTTP 500: upstream exploded");
  });

  it("uses an empty snippet when the error body cannot be read", async () => {
    installFetch(async () => ({
      ok: false,
      status: 502,
      text: async () => {
        throw new Error("unreadable");
      },
    }));
    const backend = new OllamaBackend(MODEL, BASE);
    await expect(
      backend.callPlain({ systemPrompt: "sys", userMessage: "user" }),
    ).rejects.toThrow("Ollama returned HTTP 502: ");
  });

  it("probe wraps a non-ok /api/tags response", async () => {
    const fetchMock = installFetch(async () => ({ ok: false, status: 500 }));
    const backend = new OllamaBackend(MODEL, BASE);
    await expect(backend.probe()).rejects.toThrow(
      `Ollama not reachable at ${BASE}. ` +
        "Run `ollama serve` or set OLLAMA_HOST environment variable.\n" +
        "Underlying error: Error: HTTP 500",
    );
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/tags`);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("GET");
  });

  it("callStructured returns parsed JSON and keeps the raw text", async () => {
    const raw = '{"tokens":["a"]}';
    installFetch(async () => okChat({ role: "assistant", content: raw }));
    const backend = new OllamaBackend(MODEL, BASE, { temperature: 0, seed: 3 });
    await expect(
      backend.callStructured<{ tokens: string[] }>({
        systemPrompt: "sys",
        userMessage: "user",
        outputSchema: { type: "object" },
      }),
    ).resolves.toEqual({ tokens: ["a"] });
    expect(backend.lastRawText()).toBe(raw);
  });

  it("callStructured throws the invalid-JSON error with the raw snippet", async () => {
    installFetch(async () => okChat({ role: "assistant", content: "not-json{{" }));
    const backend = new OllamaBackend(MODEL, BASE);
    await expect(
      backend.callStructured({
        systemPrompt: "sys",
        userMessage: "user",
        outputSchema: { type: "object" },
      }),
    ).rejects.toThrow(
      `Model ${MODEL} returned invalid JSON in callStructured.\n` +
        "Raw response (first 500 chars): not-json{{",
    );
  });

  it("generateText posts genOptions and returns the text", async () => {
    const fetchMock = installFetch(async () => okChat({ role: "assistant", content: "X:1" }));
    const backend = new OllamaBackend(MODEL, BASE, { temperature: 0, seed: 3 });
    await expect(
      backend.generateText({ systemPrompt: "sys", userMessage: "user" }),
    ).resolves.toBe("X:1");
    expect(backend.lastRawText()).toBe("X:1");
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: MODEL,
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "user" },
      ],
      stream: false,
      options: { temperature: 0, seed: 3 },
    });
  });

  it("generateText stores an empty string when content is missing", async () => {
    installFetch(async () => okChat({ role: "assistant" }));
    const backend = new OllamaBackend(MODEL, BASE);
    await expect(
      backend.generateText({ systemPrompt: "sys", userMessage: "user" }),
    ).resolves.toBe("");
    expect(backend.lastRawText()).toBe("");
  });

  it("callPlain sends num_predict when maxTokens is set", async () => {
    const fetchMock = installFetch(async () => okChat({ role: "assistant", content: "B" }));
    const backend = new OllamaBackend(MODEL, BASE);
    await expect(
      backend.callPlain({ systemPrompt: "sys", userMessage: "user", maxTokens: 12 }),
    ).resolves.toBe("B");
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/chat`);
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: MODEL,
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "user" },
      ],
      stream: false,
      options: { num_predict: 12 },
    });
  });
});
