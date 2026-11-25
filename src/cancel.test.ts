import { describe, expect, it } from "vitest";
import {
  RequestCancelledError,
  isCancelledError,
  throwIfAborted,
  toCancelledError,
} from "./cancel.js";

describe("cancel helpers", () => {
  it("detects RequestCancelledError, AbortError, and code='cancelled'", () => {
    expect(isCancelledError(new RequestCancelledError())).toBe(true);
    const domAbort = new Error("aborted");
    domAbort.name = "AbortError";
    expect(isCancelledError(domAbort)).toBe(true);
    expect(isCancelledError({ code: "cancelled" })).toBe(true);
    expect(isCancelledError(new Error("boom"))).toBe(false);
    expect(isCancelledError("not an error")).toBe(false);
    expect(isCancelledError(null)).toBe(false);
  });

  it("normalizes reasons into RequestCancelledError", () => {
    const existing = new RequestCancelledError("already");
    expect(toCancelledError(existing)).toBe(existing);
    expect(toCancelledError(new Error("from-err")).message).toBe("from-err");
    expect(toCancelledError(new Error("")).message).toBe("Request cancelled");
    expect(toCancelledError("user stopped").message).toBe("user stopped");
    expect(toCancelledError(undefined, "fallback").message).toBe("fallback");
  });

  it("throwIfAborted throws only when the signal is aborted", () => {
    const ac = new AbortController();
    expect(() => throwIfAborted(undefined)).not.toThrow();
    expect(() => throwIfAborted(ac.signal)).not.toThrow();

    ac.abort("stop now");
    expect(() => throwIfAborted(ac.signal)).toThrow(RequestCancelledError);
    expect(() => throwIfAborted(ac.signal)).toThrow("stop now");
  });
});
