import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicBackend } from "./anthropic.js";

const sdk = vi.hoisted(() => {
  class RateLimitError extends Error {
    status = 429;
    constructor(message?: string) {
      super(message ?? "rate limit");
      this.name = "RateLimitError";
    }
  }
  class InternalServerError extends Error {
    status = 500;
    constructor(message?: string) {
      super(message ?? "internal");
      this.name = "InternalServerError";
    }
  }
  const create = vi.fn();
  const construct = vi.fn();
  class Anthropic {
    messages = { create };
    constructor(opts: { apiKey: string }) {
      construct(opts);
    }
  }
  return { RateLimitError, InternalServerError, create, construct, Anthropic };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: sdk.Anthropic,
  RateLimitError: sdk.RateLimitError,
  InternalServerError: sdk.InternalServerError,
}));

const MODEL = "claude-sonnet-4-5";
const previousKey = process.env.ANTHROPIC_API_KEY;

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

function message(
  content: Block[],
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
  },
) {
  return { id: "msg_test", model: MODEL, content, usage };
}

const tools = [
  { name: "first_tool", description: "first", inputSchema: { type: "object" } },
  {
    name: "second_tool",
    description: "second",
    inputSchema: { type: "object", properties: { n: { type: "number" } } },
  },
];

describe("AnthropicBackend", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    sdk.create.mockReset();
    sdk.construct.mockClear();
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
    vi.useRealTimers();
  });

  it("throws when ANTHROPIC_API_KEY is unset", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => new AnthropicBackend(MODEL)).toThrow(
      /^ANTHROPIC_API_KEY is not set in environment\./,
    );
  });

  it("callWithTools returns the tool input and the text, and caches only the last tool", async () => {
    sdk.create.mockResolvedValue(
      message(
        [
          { type: "tool_use", id: "tu_1", name: "second_tool", input: { n: 3 } },
          { type: "text", text: "used the tool" },
        ],
        { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 0 },
      ),
    );
    const backend = new AnthropicBackend(MODEL);
    const result = await backend.callWithTools({
      systemPrompt: "system text",
      userMessage: "user text",
      tools,
    });

    expect(result.toolCalls).toEqual([{ tool: "second_tool", arguments: { n: 3 } }]);
    expect(result.rawText).toBe("used the tool");

    const arg = sdk.create.mock.calls[0][0] as {
      model: string;
      max_tokens: number;
      system: Array<{ cache_control: { type: string } }>;
      tools: Array<Record<string, unknown>>;
      messages: Array<{ role: string; content: string }>;
    };
    expect(arg.model).toBe(MODEL);
    expect(arg.max_tokens).toBe(2048);
    expect(arg.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(arg.tools).toEqual([
      { name: "first_tool", description: "first", input_schema: { type: "object" } },
      {
        name: "second_tool",
        description: "second",
        input_schema: { type: "object", properties: { n: { type: "number" } } },
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(arg.messages).toEqual([{ role: "user", content: "user text" }]);
    expect(sdk.construct).toHaveBeenCalledTimes(1);
    expect(sdk.construct).toHaveBeenCalledWith({ apiKey: "test-key" });
  });

  it("callWithTools sets rawText null when the message has no text block", async () => {
    sdk.create.mockResolvedValue(
      message(
        [{ type: "tool_use", id: "tu_2", name: "first_tool", input: { n: 1 } }],
        { input_tokens: 1, output_tokens: 1 },
      ),
    );
    const backend = new AnthropicBackend(MODEL);
    const result = await backend.callWithTools({
      systemPrompt: "system text",
      userMessage: "user text",
      tools,
    });
    expect(result.toolCalls).toEqual([{ tool: "first_tool", arguments: { n: 1 } }]);
    expect(result.rawText).toBeNull();
  });

  it("callStructured returns the predict_continuation input", async () => {
    const input = { answer: 4, label: "four" };
    sdk.create.mockResolvedValue(
      message(
        [{ type: "tool_use", id: "tu_3", name: "predict_continuation", input }],
        { input_tokens: 2, output_tokens: 2 },
      ),
    );
    const backend = new AnthropicBackend(MODEL);
    await expect(
      backend.callStructured({
        systemPrompt: "system text",
        userMessage: "user text",
        outputSchema: { type: "object" },
      }),
    ).resolves.toEqual(input);

    const arg = sdk.create.mock.calls[0][0] as {
      max_tokens: number;
      tools: Array<{ name: string; cache_control: { type: string } }>;
      tool_choice: { type: string; name: string };
    };
    expect(arg.max_tokens).toBe(2048);
    expect(arg.tools[0].name).toBe("predict_continuation");
    expect(arg.tools[0].cache_control).toEqual({ type: "ephemeral" });
    expect(arg.tool_choice).toEqual({ type: "tool", name: "predict_continuation" });
  });

  it("callStructured throws when predict_continuation was not called", async () => {
    sdk.create.mockResolvedValue(
      message(
        [{ type: "tool_use", id: "tu_x", name: "other_tool", input: { n: 1 } }],
        { input_tokens: 2, output_tokens: 2 },
      ),
    );
    const backend = new AnthropicBackend(MODEL);
    await expect(
      backend.callStructured({
        systemPrompt: "system text",
        userMessage: "user text",
        outputSchema: { type: "object" },
      }),
    ).rejects.toThrow(
      `Anthropic model ${MODEL} did not call predict_continuation tool.`,
    );
  });

  it("callPlain joins text blocks and defaults max_tokens to 16", async () => {
    sdk.create.mockResolvedValue(
      message(
        [
          { type: "text", text: "alpha" },
          { type: "text", text: "beta" },
        ],
        { input_tokens: 1, output_tokens: 1 },
      ),
    );
    const backend = new AnthropicBackend(MODEL);
    await expect(
      backend.callPlain({ systemPrompt: "system text", userMessage: "user text" }),
    ).resolves.toBe("alpha\nbeta");
    const arg = sdk.create.mock.calls[0][0] as { max_tokens: number };
    expect(arg.max_tokens).toBe(16);
  });

  it("callPlain uses the maxTokens argument", async () => {
    sdk.create.mockResolvedValue(
      message([{ type: "text", text: "C" }], { input_tokens: 1, output_tokens: 1 }),
    );
    const backend = new AnthropicBackend(MODEL);
    await expect(
      backend.callPlain({ systemPrompt: "s", userMessage: "u", maxTokens: 32 }),
    ).resolves.toBe("C");
    const arg = sdk.create.mock.calls[0][0] as { max_tokens: number };
    expect(arg.max_tokens).toBe(32);
  });

  it("prices uncached input at $3, cached input at $0.30, and output at $15 per million", async () => {
    const backend = new AnthropicBackend(MODEL);

    sdk.create.mockResolvedValueOnce(
      message([{ type: "text", text: "a" }], {
        input_tokens: 1_000_000,
        cache_read_input_tokens: 0,
        output_tokens: 0,
      }),
    );
    await backend.callPlain({ systemPrompt: "s", userMessage: "u" });
    expect(backend.lastCallMetadata().costEstimate).toBe(3);

    sdk.create.mockResolvedValueOnce(
      message([{ type: "text", text: "b" }], {
        input_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
        output_tokens: 0,
      }),
    );
    await backend.callPlain({ systemPrompt: "s", userMessage: "u" });
    expect(backend.lastCallMetadata().costEstimate).toBe(0.3);

    sdk.create.mockResolvedValueOnce(
      message([{ type: "text", text: "c" }], {
        input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 1_000_000,
      }),
    );
    await backend.callPlain({ systemPrompt: "s", userMessage: "u" });
    expect(backend.lastCallMetadata().costEstimate).toBe(15);
  });

  it("retries one RateLimitError after 1s and returns the second create()", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    sdk.create
      .mockRejectedValueOnce(new sdk.RateLimitError("slow"))
      .mockResolvedValueOnce(
        message([{ type: "text", text: "B" }], { input_tokens: 1, output_tokens: 1 }),
      );
    const backend = new AnthropicBackend(MODEL);
    const pending = backend.callPlain({ systemPrompt: "s", userMessage: "u" });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe("B");
    expect(sdk.create).toHaveBeenCalledTimes(2);
  });

  it("retries one InternalServerError the same way", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    sdk.create
      .mockRejectedValueOnce(new sdk.InternalServerError("unavailable"))
      .mockResolvedValueOnce(
        message([{ type: "text", text: "ok" }], { input_tokens: 1, output_tokens: 1 }),
      );
    const backend = new AnthropicBackend(MODEL);
    const pending = backend.callPlain({ systemPrompt: "s", userMessage: "u" });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe("ok");
    expect(sdk.create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a generic Error", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    sdk.create.mockRejectedValue(new Error("boom"));
    const backend = new AnthropicBackend(MODEL);
    const pending = backend.callPlain({ systemPrompt: "s", userMessage: "u" });
    const settled = expect(pending).rejects.toThrow("boom");
    await vi.runAllTimersAsync();
    await settled;
    expect(sdk.create).toHaveBeenCalledTimes(1);
  });

  it("constructs the SDK client once across two callPlain calls", async () => {
    sdk.create.mockResolvedValue(
      message([{ type: "text", text: "A" }], { input_tokens: 1, output_tokens: 1 }),
    );
    const backend = new AnthropicBackend(MODEL);
    await backend.callPlain({ systemPrompt: "s", userMessage: "one" });
    await backend.callPlain({ systemPrompt: "s", userMessage: "two" });
    expect(sdk.construct).toHaveBeenCalledTimes(1);
    expect(sdk.create).toHaveBeenCalledTimes(2);
  });
});
