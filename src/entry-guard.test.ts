import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isEntrypoint, resolveArgvMainPath } from "./entry-guard.js";

describe("entry-guard", () => {
  it("resolves an existing path to its real path", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajs-entry-guard-"));
    const file = join(dir, "bin.js");
    try {
      writeFileSync(file, "export {};\n");
      expect(resolveArgvMainPath(file)).toBe(file);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to path.resolve when realpath cannot see the path", () => {
    const missing = join(tmpdir(), "ajs-entry-guard-missing", "no-such-bin.js");
    expect(() => resolveArgvMainPath(missing)).not.toThrow();
    expect(resolveArgvMainPath(missing).endsWith("no-such-bin.js")).toBe(true);
  });

  it("matches the process entry after realpath, and rejects a different module url", () => {
    const argvPath = process.argv[1];
    expect(argvPath).toBeTruthy();
    const entryHref = pathToFileURL(resolveArgvMainPath(argvPath!)).href;
    expect(isEntrypoint(entryHref)).toBe(true);
    expect(isEntrypoint("file:///not-the-entry.mjs")).toBe(false);
  });

  it("treats a symlink to the entry file as the same module", () => {
    const argvPath = process.argv[1];
    expect(argvPath).toBeTruthy();
    const dir = mkdtempSync(join(tmpdir(), "ajs-entry-guard-link-"));
    const link = join(dir, "linked-entry.js");
    try {
      symlinkSync(argvPath!, link);
      expect(resolveArgvMainPath(link)).toBe(resolveArgvMainPath(argvPath!));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
