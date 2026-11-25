import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OLLAMA_CALL_TIMEOUT_MS,
  OLLAMA_TIMEOUT_ENV,
  OllamaBackend,
  OllamaTimeoutError,
  formatStructuredSystemPrompt,
  resolveOllamaTimeoutMs,
} from "./ollama.js";
import { RequestCancelledError } from "../../../cancel.js";

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

  it("aborts in-flight fetch against a hanging fake HTTP server when timeoutMs expires", async () => {
    let socketClosed = false;
    const srv = createServer((req) => {
      req.on("close", () => {
        socketClosed = true;
      });
      // Deliberately never write headers or body.
    });
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const addr = srv.address();
    if (!addr || typeof addr === "string") throw new Error("unexpected address");
    const url = `http://127.0.0.1:${addr.port}`;

    try {
      const backend = new OllamaBackend(MODEL, url, undefined, { timeoutMs: 80 });
      await expect(
        backend.callPlain({ systemPrompt: "sys", userMessage: "user" }),
      ).rejects.toThrow(OllamaTimeoutError);
      // Give the socket close event a tick to propagate.
      await new Promise((r) => setTimeout(r, 30));
      expect(socketClosed).toBe(true);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  });

  it("aborts immediately when the caller AbortSignal aborts", async () => {
    const srv = createServer(() => {
      // Never respond.
    });
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const addr = srv.address();
    if (!addr || typeof addr === "string") throw new Error("unexpected address");
    const url = `http://127.0.0.1:${addr.port}`;

    try {
      const ac = new AbortController();
      const backend = new OllamaBackend(MODEL, url, undefined, {
        signal: ac.signal,
        timeoutMs: 30_000,
      });
      setTimeout(() => ac.abort("user aborted"), 40);
      await expect(
        backend.generateText({ systemPrompt: "sys", userMessage: "user" }),
      ).rejects.toThrow(RequestCancelledError);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  });

  it("uses OLLAMA_TIMEOUT_MS env override and logs it to stderr when set", () => {
    const prev = process.env[OLLAMA_TIMEOUT_ENV];
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      delete process.env[OLLAMA_TIMEOUT_ENV];
      expect(resolveOllamaTimeoutMs()).toBe(OLLAMA_CALL_TIMEOUT_MS);

      process.env[OLLAMA_TIMEOUT_ENV] = "1500";
      expect(resolveOllamaTimeoutMs()).toBe(1500);
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${OLLAMA_TIMEOUT_ENV}=1500ms`),
      );

      process.env[OLLAMA_TIMEOUT_ENV] = "not-a-number";
      expect(resolveOllamaTimeoutMs()).toBe(OLLAMA_CALL_TIMEOUT_MS);
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Ignoring invalid ${OLLAMA_TIMEOUT_ENV}`),
      );
    } finally {
      errSpy.mockRestore();
      if (prev === undefined) delete process.env[OLLAMA_TIMEOUT_ENV];
      else process.env[OLLAMA_TIMEOUT_ENV] = prev;
    }
  });

  it("keeps OLLAMA_CALL_TIMEOUT_MS at 120_000 ms (2x measured gemma4 cold call rounded up to 30 s)", () => {
    expect(OLLAMA_CALL_TIMEOUT_MS).toBe(120_000);
    expect(OLLAMA_TIMEOUT_ENV).toBe("OLLAMA_TIMEOUT_MS");
  });

  it("supportsThinking inspects /api/show capabilities and never guesses from model name", async () => {
    const fetchMock = installFetch(async (url, init) => {
      expect(url).toBe(`${BASE}/api/show`);
      const body = JSON.parse(String(init?.body)) as { model?: string };
      if (body.model === "alpha-model") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ capabilities: ["completion", "thinking"] }),
        };
      }
      if (body.model === "gemma4:31b") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ capabilities: ["completion", "tools"] }),
        };
      }
      return { ok: false, status: 404, text: async () => "not found" };
    });

    await expect(new OllamaBackend("alpha-model", BASE).supportsThinking()).resolves.toBe(true);
    await expect(new OllamaBackend("gemma4:31b", BASE).supportsThinking()).resolves.toBe(false);
    await expect(new OllamaBackend("missing-model", BASE).supportsThinking()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("forwards think only when passed and clears lastRawText on failed subsequent callStructured", async () => {
    let call = 0;
    const seenBodies: Array<Record<string, unknown>> = [];
    installFetch(async (_url, init) => {
      call++;
      seenBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (call === 1) return okChat({ role: "assistant", content: '{"ok":true}' });
      if (call === 2) return okChat({ role: "assistant", content: '{"ok":true}' });
      return { ok: false, status: 500, text: async () => "server down" };
    });

    const backend = new OllamaBackend(MODEL, BASE, { seed: 7, num_predict: 128 });
    await backend.callStructured({
      systemPrompt: "sys",
      userMessage: "user",
      outputSchema: {},
      think: false,
    });
    expect(seenBodies[0].think).toBe(false);
    expect(backend.lastRawText()).toBe('{"ok":true}');

    await backend.callStructured({
      systemPrompt: "sys",
      userMessage: "user",
      outputSchema: {},
    });
    expect("think" in seenBodies[1]).toBe(false);
    expect(seenBodies[0].messages).toEqual([
      { role: "system", content: formatStructuredSystemPrompt("sys", {}) },
      { role: "user", content: "user" },
    ]);

    await expect(
      backend.callStructured({
        systemPrompt: "sys",
        userMessage: "user",
        outputSchema: {},
      }),
    ).rejects.toThrow("Ollama returned HTTP 500");
    expect(backend.lastRawText()).toBeNull();
  });
});
