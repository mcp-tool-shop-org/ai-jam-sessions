// ─── Compose: the cross-family Ollama BWS judge (blind best-worst) ────────────
//
// The judge half of the $0 quality smoke-screen (bws.ts is the pure core). It
// presents a judge model with k ANONYMIZED, shuffled realizations of the SAME
// progression and asks for the best + worst by voice-leading / musicality. The
// judge never sees which system produced which option (reasoning-hidden), and no
// judge grades its own generator (the generator here is deterministic or a
// different local model) — EXTERNAL_VERIFIER discipline.
//
// Cross-family is the caller's job: instantiate one OllamaBwsJudge per local
// family (mistral / granite / qwen3.6 / gemma4 / aya-expanse / hermes — all on the
// rig, zero API cost) so the panel spans ≥3 disjoint families. Fail-soft: an
// unparseable or unreachable judgment yields null (that tuple is dropped for that
// family), never a fabricated vote. Ollama detail isolated here (DECOMPOSE_BY_SECRETS).
// ─────────────────────────────────────────────────────────────────────────────

import { OllamaBackend, OllamaTimeoutError } from "../dataset/eval/llm-backends/ollama.js";
import { isCancelledError, throwIfAborted, toCancelledError } from "../cancel.js";
import type { ChordProposerBackend } from "../maker/chord-proposer.js";
import { buildJudgePrompt, parseJudgeResponse } from "./bws-judge-text.js";
import type { PanelJudge } from "./panel-run.js";

export { buildJudgePrompt, parseJudgeResponse };

/** Default completion budget (`num_predict`) for BWS judge calls. */
export const JUDGE_DEFAULT_MAX_TOKENS = 128;

/**
 * Conservative characters-per-token estimate for symbolic voicing prompts
 * (`mN Chord: C#3 E3 G#3 B3` tokenizes more densely than prose — calibrated at
 * ~2.20 chars/token from 1,477 chars / ~670 tokens on 8-bar Bach Prelude).
 */
export const JUDGE_CHARS_PER_TOKEN = 2;

/** Token safety margin added on top of estimated prompt + completion tokens. */
export const JUDGE_CTX_MARGIN_TOKENS = 1_024;

/**
 * Explicit context window (`options.num_ctx`) for BWS judge `/api/chat` calls:
 * worst-case 4-option prompt across shipped library songs (`bethena`, 219
 * measures, 20,150 chars with schema suffix = 10,075 est. tokens) + 128
 * `num_predict` + 1,024 margin = 11,227 tokens -> next power of two = 16_384
 * (halving the 32,768 server default).
 */
export const JUDGE_NUM_CTX = 16_384;

/** Reason a single judge call failed to yield a usable BWS vote. */
export type JudgeDropReason = "timeout" | "empty_reply" | "parse_failure" | "unreachable";

/** Structured result from a BWS judge call, distinguishing votes from drops. */
export type JudgeCallOutcome =
  | { ok: true; vote: { best: number; worst: number } }
  | { ok: false; reason: JudgeDropReason; detail?: string };

/** Conservatively estimate total tokens required for a judge call. */
export function estimateJudgeContextTokens(
  systemPrompt: string,
  userMessage: string,
  maxTokens = JUDGE_DEFAULT_MAX_TOKENS,
  charsPerToken = JUDGE_CHARS_PER_TOKEN,
  marginTokens = JUDGE_CTX_MARGIN_TOKENS,
): number {
  const promptChars = systemPrompt.length + userMessage.length;
  return Math.ceil(promptChars / charsPerToken) + maxTokens + marginTokens;
}

export interface OllamaBwsJudgeOptions {
  seed?: number;
  maxTokens?: number;
  numCtx?: number;
  baseUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  backendFactory?: (seed: number) => ChordProposerBackend;
}

/** A single-family BWS judge backed by a local Ollama model. */
export class OllamaBwsJudge implements PanelJudge {
  readonly model: string;
  readonly family: string;
  readonly numCtx: number;
  private readonly seed: number;
  private readonly signal?: AbortSignal;
  private readonly makeBackend: (seed: number) => ChordProposerBackend;
  private resolvedSupportsThinking?: boolean;

  constructor(model: string, family: string, opts: OllamaBwsJudgeOptions = {}) {
    this.model = model;
    this.family = family;
    this.seed = opts.seed ?? 7;
    this.signal = opts.signal;
    const { baseUrl, backendFactory, signal, timeoutMs } = opts;
    const maxTokens = opts.maxTokens ?? JUDGE_DEFAULT_MAX_TOKENS;
    this.numCtx = opts.numCtx ?? JUDGE_NUM_CTX;
    const numCtx = this.numCtx;
    this.makeBackend =
      backendFactory ??
      ((seed) =>
        new OllamaBackend(
          model,
          baseUrl,
          { seed, num_predict: maxTokens, num_ctx: numCtx },
          { signal, timeoutMs },
        ));
  }

  /**
   * The `think` flag used on judge `/api/chat` requests: `false` when `/api/show`
   * reports thinking capability, otherwise `null` (omitted from request body).
   */
  thinkSetting(): boolean | null {
    return this.resolvedSupportsThinking === true ? false : null;
  }

  private async ensureThinkingSupport(
    backend: ChordProposerBackend,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (this.resolvedSupportsThinking !== undefined) {
      return this.resolvedSupportsThinking;
    }
    if (!backend.supportsThinking) {
      this.resolvedSupportsThinking = false;
      return false;
    }
    this.resolvedSupportsThinking = await backend.supportsThinking({ signal });
    return this.resolvedSupportsThinking;
  }

  async probe(signal?: AbortSignal): Promise<void> {
    const effectiveSignal = signal ?? this.signal;
    throwIfAborted(effectiveSignal, "Ollama judge probe cancelled");
    const backend = this.makeBackend(this.seed);
    await backend.probe({ signal: effectiveSignal });
    await this.ensureThinkingSupport(backend, effectiveSignal);
  }

  /**
   * Judge one tuple of rendered options and return either a 0-based
   * `{best, worst}` vote or a structured drop reason.
   */
  async judgeDetailed(
    key: string,
    options: string[],
    tupleSeed = 0,
    signal?: AbortSignal,
  ): Promise<JudgeCallOutcome> {
    const effectiveSignal = signal ?? this.signal;
    throwIfAborted(effectiveSignal, "compose_panel cancelled");
    const backend = this.makeBackend(this.seed + tupleSeed);

    if (this.resolvedSupportsThinking === undefined) {
      try {
        await this.ensureThinkingSupport(backend, effectiveSignal);
      } catch (err) {
        if (effectiveSignal?.aborted || isCancelledError(err)) {
          throw toCancelledError(effectiveSignal?.reason ?? err, "compose_panel cancelled");
        }
        if (err instanceof OllamaTimeoutError || (err instanceof Error && err.name === "OllamaTimeoutError")) {
          return { ok: false, reason: "timeout", detail: err.message };
        }
        return {
          ok: false,
          reason: "unreachable",
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    }

    const { system, user } = buildJudgePrompt(key, options);
    let structuredErr: unknown;
    try {
      await backend.callStructured({
        systemPrompt: system,
        userMessage: user,
        outputSchema: {},
        ...(this.resolvedSupportsThinking === true ? { think: false } : {}),
        signal: effectiveSignal,
      });
    } catch (err) {
      if (effectiveSignal?.aborted || isCancelledError(err)) {
        throw toCancelledError(effectiveSignal?.reason ?? err, "compose_panel cancelled");
      }
      structuredErr = err;
    }
    throwIfAborted(effectiveSignal, "compose_panel cancelled");

    if (
      structuredErr instanceof OllamaTimeoutError ||
      (structuredErr instanceof Error && structuredErr.name === "OllamaTimeoutError")
    ) {
      return {
        ok: false,
        reason: "timeout",
        detail: structuredErr instanceof Error ? structuredErr.message : String(structuredErr),
      };
    }

    const rawOrNull = backend.lastRawText();
    if (structuredErr !== undefined && rawOrNull === null) {
      return {
        ok: false,
        reason: "unreachable",
        detail: structuredErr instanceof Error ? structuredErr.message : String(structuredErr),
      };
    }

    const raw = rawOrNull ?? "";
    if (raw.trim().length === 0) {
      return {
        ok: false,
        reason: "empty_reply",
        detail: "Judge returned empty message.content.",
      };
    }

    const parsed = parseJudgeResponse(raw, options.length);
    if (!parsed) {
      return {
        ok: false,
        reason: "parse_failure",
        detail: `Unparseable judge reply: ${raw.slice(0, 120)}`,
      };
    }
    return { ok: true, vote: parsed };
  }

  /** Judge one tuple of rendered options → 0-based {best, worst}, or null (dropped). */
  async judge(
    key: string,
    options: string[],
    tupleSeed = 0,
    signal?: AbortSignal,
  ): Promise<{ best: number; worst: number } | null> {
    const out = await this.judgeDetailed(key, options, tupleSeed, signal);
    return out.ok ? out.vote : null;
  }
}

/**
 * Represent a judge whose initial reachability probe failed while `>= 3` other
 * judges responded, so every tuple assigned to it is explicitly reported as
 * `"unreachable"` rather than dropped silently before the panel runs.
 */
export function makeUnreachablePanelJudge(
  model: string,
  family: string,
  detail = "Model did not respond during reachability probe.",
): PanelJudge {
  return {
    family,
    model,
    thinkSetting: () => null,
    async judge() {
      return null;
    },
    async judgeDetailed() {
      return { ok: false, reason: "unreachable", detail };
    },
  };
}
