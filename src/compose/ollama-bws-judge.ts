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

import { OllamaBackend } from "../dataset/eval/llm-backends/ollama.js";
import { isCancelledError, throwIfAborted, toCancelledError } from "../cancel.js";
import type { ChordProposerBackend } from "../maker/chord-proposer.js";
import { buildJudgePrompt, parseJudgeResponse } from "./bws-judge-text.js";

export { buildJudgePrompt, parseJudgeResponse };

export interface OllamaBwsJudgeOptions {
  seed?: number;
  maxTokens?: number;
  baseUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  backendFactory?: (seed: number) => ChordProposerBackend;
}

/** A single-family BWS judge backed by a local Ollama model. */
export class OllamaBwsJudge {
  readonly model: string;
  readonly family: string;
  private readonly seed: number;
  private readonly signal?: AbortSignal;
  private readonly makeBackend: (seed: number) => ChordProposerBackend;

  constructor(model: string, family: string, opts: OllamaBwsJudgeOptions = {}) {
    this.model = model;
    this.family = family;
    this.seed = opts.seed ?? 7;
    this.signal = opts.signal;
    const { baseUrl, backendFactory, signal, timeoutMs } = opts;
    const maxTokens = opts.maxTokens ?? 128;
    this.makeBackend =
      backendFactory ??
      ((seed) => new OllamaBackend(model, baseUrl, { seed, num_predict: maxTokens }, { signal, timeoutMs }));
  }

  async probe(signal?: AbortSignal): Promise<void> {
    const effectiveSignal = signal ?? this.signal;
    throwIfAborted(effectiveSignal, "Ollama judge probe cancelled");
    await this.makeBackend(this.seed).probe({ signal: effectiveSignal });
  }

  /** Judge one tuple of rendered options → 0-based {best, worst}, or null (dropped). */
  async judge(
    key: string,
    options: string[],
    tupleSeed = 0,
    signal?: AbortSignal,
  ): Promise<{ best: number; worst: number } | null> {
    const effectiveSignal = signal ?? this.signal;
    throwIfAborted(effectiveSignal, "compose_panel cancelled");
    const backend = this.makeBackend(this.seed + tupleSeed);
    const { system, user } = buildJudgePrompt(key, options);
    try {
      await backend.callStructured({
        systemPrompt: system,
        userMessage: user,
        outputSchema: {},
        signal: effectiveSignal,
      });
    } catch (err) {
      if (effectiveSignal?.aborted || isCancelledError(err)) {
        throw toCancelledError(effectiveSignal?.reason ?? err, "compose_panel cancelled");
      }
      // tolerant: rawText may still hold recoverable JSON; else null below
    }
    throwIfAborted(effectiveSignal, "compose_panel cancelled");
    return parseJudgeResponse(backend.lastRawText() ?? "", options.length);
  }
}
