// ─── Shared request cancellation helper ───────────────────────────────────────
//
// Normalizes AbortSignal cancellations across MCP tool handlers, Ollama calls,
// maker/compose loops, and SoulX subprocess orchestration.
// ─────────────────────────────────────────────────────────────────────────────

export class RequestCancelledError extends Error {
  readonly code = "cancelled" as const;

  constructor(message = "Request cancelled") {
    super(message);
    this.name = "AbortError";
  }
}

/** True when `err` represents an explicit request/operation cancellation. */
export function isCancelledError(err: unknown): boolean {
  if (err instanceof RequestCancelledError) return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  if (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "cancelled"
  ) {
    return true;
  }
  return false;
}

/** Convert an AbortSignal reason or caught error into a RequestCancelledError. */
export function toCancelledError(
  reason?: unknown,
  fallbackMessage = "Request cancelled",
): RequestCancelledError {
  if (reason instanceof RequestCancelledError) return reason;
  if (reason instanceof Error) {
    return new RequestCancelledError(reason.message || fallbackMessage);
  }
  if (typeof reason === "string" && reason.trim().length > 0) {
    return new RequestCancelledError(reason);
  }
  return new RequestCancelledError(fallbackMessage);
}

/** Throw RequestCancelledError immediately if `signal` is already aborted. */
export function throwIfAborted(
  signal?: AbortSignal,
  message = "Request cancelled",
): void {
  if (signal?.aborted) {
    throw toCancelledError(signal.reason, message);
  }
}
