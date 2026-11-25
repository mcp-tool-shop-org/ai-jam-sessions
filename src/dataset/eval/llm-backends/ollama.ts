// ─── Ollama HTTP Backend ───────────────────────────────────────────────────────
//
// Raw Ollama HTTP adapter (localhost:11434). Primary local backend.
// Uses native fetch (Node 18+) — no extra dependencies.
//
// Supports:
//   callWithTools  — E1 (tool-use): Ollama /api/chat with tools param
//   callStructured — E2 (phrase continuation): Ollama /api/chat format:"json"
//   callPlain      — E3 (MCQ): plain /api/chat, returns text content
//
// Model recommendations for tool-use (E1):
//   - hermes3:8b   — best tool-use support among 8B class
//   - qwen2.5:7b   — solid alternative
//   Models WITHOUT native tool-use support will fail E1 with a clear error.
//
// Cost reporting: $0 (local inference).
// ─────────────────────────────────────────────────────────────────────────────

import type { LlmBackend, ToolSchema, ToolUseResult, CallMeta } from "../llm-runner.js";
import { isCancelledError, throwIfAborted, toCancelledError } from "../../../cancel.js";

/** Default per-HTTP-call timeout for Ollama requests (120 s). */
export const OLLAMA_CALL_TIMEOUT_MS = 120_000;

/** Optional env override for the per-call Ollama HTTP timeout in milliseconds. */
export const OLLAMA_TIMEOUT_ENV = "OLLAMA_TIMEOUT_MS";

export class OllamaTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = "OllamaTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export interface OllamaBackendOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface OllamaCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Resolve the per-call Ollama timeout in ms.
 * Priority: explicit positive finite number -> OLLAMA_TIMEOUT_MS env override -> OLLAMA_CALL_TIMEOUT_MS.
 * Logs to stderr whenever the env override is read so operators see non-default bounds.
 */
export function resolveOllamaTimeoutMs(explicit?: number): number {
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const raw = process.env[OLLAMA_TIMEOUT_ENV];
  if (raw !== undefined && raw.trim().length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      console.error(
        `[ollama] Using ${OLLAMA_TIMEOUT_ENV}=${parsed}ms override (default ${OLLAMA_CALL_TIMEOUT_MS}ms)`,
      );
      return parsed;
    }
    console.error(
      `[ollama] Ignoring invalid ${OLLAMA_TIMEOUT_ENV}="${raw}"; using default ${OLLAMA_CALL_TIMEOUT_MS}ms`,
    );
  }
  return OLLAMA_CALL_TIMEOUT_MS;
}

// ─── Ollama API types ─────────────────────────────────────────────────────────

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: unknown;
  };
}

interface OllamaChatResponse {
  model: string;
  message: OllamaMessage;
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

// ─── Backend implementation ───────────────────────────────────────────────────

export class OllamaBackend implements LlmBackend {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;
  private _lastMeta: CallMeta = {
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: 0,
    costEstimate: 0,
  };
  /** Raw text from the most recent callStructured call (for tolerant parsing). */
  private _lastRawText: string | null = null;
  /**
   * Optional Ollama generation options (temperature, seed, …) forwarded as the
   * /api/chat `options` field. Opt-in: prior callers pass nothing and get
   * Ollama's defaults, byte-identical to pre-existing behavior. The E2
   * continuation gate pins {temperature: 0, seed} here for replayable runs.
   */
  private readonly genOptions?: Record<string, number>;
  private readonly signal?: AbortSignal;
  private readonly timeoutMs: number;

  constructor(
    model: string,
    baseUrl?: string,
    genOptions?: Record<string, number>,
    backendOptions?: OllamaBackendOptions,
  ) {
    this.model = model;
    const raw = baseUrl ?? (process.env.OLLAMA_HOST ?? "http://localhost:11434");
    // Normalize: add http:// scheme if missing (Ollama sets OLLAMA_HOST as host:port)
    this.baseUrl = raw.startsWith("http://") || raw.startsWith("https://")
      ? raw
      : `http://${raw}`;
    this.genOptions = genOptions;
    this.signal = backendOptions?.signal;
    this.timeoutMs = resolveOllamaTimeoutMs(backendOptions?.timeoutMs);
  }

  private async runBounded<T>(
    url: string,
    run: (signal: AbortSignal) => Promise<T>,
    callOpts?: OllamaCallOptions,
  ): Promise<T> {
    const callerSignal = callOpts?.signal ?? this.signal;
    const timeoutMs =
      callOpts?.timeoutMs !== undefined
        ? resolveOllamaTimeoutMs(callOpts.timeoutMs)
        : this.timeoutMs;

    throwIfAborted(callerSignal, "Ollama call cancelled");

    const controller = new AbortController();
    let timedOut = false;
    const onCallerAbort = () => {
      controller.abort(callerSignal?.reason);
    };
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new OllamaTimeoutError(`Ollama request timed out after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);

    const abortPromise = new Promise<never>((_, reject) => {
      const onInnerAbort = () => {
        if (timedOut) {
          reject(
            new OllamaTimeoutError(
              `Ollama request to ${url} timed out after ${timeoutMs}ms (limit ${timeoutMs}ms; set ${OLLAMA_TIMEOUT_ENV} to override).`,
              timeoutMs,
            ),
          );
          return;
        }
        reject(toCancelledError(callerSignal?.reason, "Ollama call cancelled"));
      };
      if (controller.signal.aborted) {
        onInnerAbort();
        return;
      }
      controller.signal.addEventListener("abort", onInnerAbort, { once: true });
    });

    try {
      return await Promise.race([run(controller.signal), abortPromise]);
    } catch (err) {
      if (callerSignal?.aborted || (!timedOut && isCancelledError(err))) {
        throw toCancelledError(callerSignal?.reason ?? err, "Ollama call cancelled");
      }
      if (timedOut || err instanceof OllamaTimeoutError) {
        throw err instanceof OllamaTimeoutError
          ? err
          : new OllamaTimeoutError(
              `Ollama request to ${url} timed out after ${timeoutMs}ms (limit ${timeoutMs}ms; set ${OLLAMA_TIMEOUT_ENV} to override).`,
              timeoutMs,
            );
      }
      throw err;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  }

  private async post(
    endpoint: string,
    body: unknown,
    callOpts?: OllamaCallOptions,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${endpoint}`;
    const t0 = Date.now();
    return this.runBounded(
      url,
      async (signal) => {
        let resp: Response;
        try {
          resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal,
          });
        } catch (err) {
          if (signal.aborted || isCancelledError(err)) throw err;
          throw new Error(
            `Ollama not reachable at ${this.baseUrl}. ` +
              "Run `ollama serve` or set OLLAMA_HOST environment variable.\n" +
              `Underlying error: ${String(err)}`,
          );
        }
        const latencyMs = Date.now() - t0;

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(
            `Ollama returned HTTP ${resp.status}: ${text.slice(0, 200)}`,
          );
        }

        const data = (await resp.json()) as OllamaChatResponse;
        this._lastMeta = {
          promptTokens: data.prompt_eval_count ?? 0,
          completionTokens: data.eval_count ?? 0,
          latencyMs,
          costEstimate: 0, // local — free
        };
        return data;
      },
      callOpts,
    );
  }

  async probe(callOpts?: OllamaCallOptions): Promise<void> {
    // Lightweight reachability check — hits /api/tags (no model required)
    const url = `${this.baseUrl}/api/tags`;
    await this.runBounded(
      url,
      async (signal) => {
        try {
          const resp = await fetch(url, { method: "GET", signal });
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }
        } catch (err) {
          if (signal.aborted || isCancelledError(err)) throw err;
          throw new Error(
            `Ollama not reachable at ${this.baseUrl}. ` +
              "Run `ollama serve` or set OLLAMA_HOST environment variable.\n" +
              `Underlying error: ${String(err)}`,
          );
        }
      },
      callOpts,
    );
  }

  async callWithTools(args: {
    systemPrompt: string;
    userMessage: string;
    tools: ToolSchema[];
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<ToolUseResult> {
    const ollamaTools: OllamaTool[] = args.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const messages: OllamaMessage[] = [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userMessage },
    ];

    const data = (await this.post(
      "/api/chat",
      {
        model: this.model,
        messages,
        tools: ollamaTools,
        stream: false,
      },
      { signal: args.signal, timeoutMs: args.timeoutMs },
    )) as OllamaChatResponse;

    const toolCalls = data.message.tool_calls ?? [];
    if (toolCalls.length === 0 && !data.message.content) {
      throw new Error(
        `Model ${this.model} returned no tool calls. ` +
          "Ensure you are using a model with native tool-use support (hermes3:8b, qwen2.5:7b, llama3.1:8b+).",
      );
    }

    return {
      toolCalls: toolCalls.map((tc) => ({
        tool: tc.function.name,
        arguments: tc.function.arguments,
      })),
      rawText: data.message.content ?? null,
    };
  }

  async callStructured<T>(args: {
    systemPrompt: string;
    userMessage: string;
    outputSchema: Record<string, unknown>;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<T> {
    // Use format:"json" mode — system prompt describes the expected schema
    const schemaDescription = JSON.stringify(args.outputSchema, null, 2);
    const systemWithSchema =
      `${args.systemPrompt}\n\n` +
      `IMPORTANT: Respond with valid JSON matching this schema:\n${schemaDescription}`;

    const messages: OllamaMessage[] = [
      { role: "system", content: systemWithSchema },
      { role: "user", content: args.userMessage },
    ];

    const data = (await this.post(
      "/api/chat",
      {
        model: this.model,
        messages,
        format: "json",
        stream: false,
        ...(this.genOptions ? { options: this.genOptions } : {}),
      },
      { signal: args.signal, timeoutMs: args.timeoutMs },
    )) as OllamaChatResponse;

    const text = data.message.content ?? "";
    this._lastRawText = text;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `Model ${this.model} returned invalid JSON in callStructured.\n` +
          `Raw response (first 500 chars): ${text.slice(0, 500)}`,
      );
    }
  }

  /** Raw text from the most recent callStructured/generateText call. Used by tolerant parsers. */
  lastRawText(): string | null {
    return this._lastRawText;
  }

  /**
   * Seeded plain-text generation with NO JSON constraint — for non-JSON outputs
   * like ABC notation. Unlike callPlain, this forwards the backend's genOptions
   * (seed, num_predict) the same way callStructured does, so best-of-n stays
   * seeded and replayable. Sets lastRawText() for tolerant downstream parsing.
   */
  async generateText(args: {
    systemPrompt: string;
    userMessage: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<string> {
    const messages: OllamaMessage[] = [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userMessage },
    ];
    const data = (await this.post(
      "/api/chat",
      {
        model: this.model,
        messages,
        stream: false,
        ...(this.genOptions ? { options: this.genOptions } : {}),
      },
      { signal: args.signal, timeoutMs: args.timeoutMs },
    )) as OllamaChatResponse;
    const text = data.message.content ?? "";
    this._lastRawText = text;
    return text;
  }

  async callPlain(args: {
    systemPrompt: string;
    userMessage: string;
    maxTokens?: number;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<string> {
    const messages: OllamaMessage[] = [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userMessage },
    ];

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
    };
    if (args.maxTokens !== undefined) {
      body.options = { num_predict: args.maxTokens };
    }

    const data = (await this.post("/api/chat", body, {
      signal: args.signal,
      timeoutMs: args.timeoutMs,
    })) as OllamaChatResponse;
    return data.message.content ?? "";
  }

  lastCallMetadata(): CallMeta {
    return { ...this._lastMeta };
  }
}
