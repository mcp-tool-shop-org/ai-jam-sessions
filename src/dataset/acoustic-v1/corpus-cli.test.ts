import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { V1Record } from "./schema.js";

const state = vi.hoisted(() => ({
  calls: 0,
  records: [
    {
      id: "measures:fur-elise",
      family: "measures",
      split: "train",
      scope: { song_id: "fur-elise", key: "C major", phrase_window: "A" },
      provenance: { verdict_reason: "Allowlisted classical" },
      target_trace: {
        session: [{ role: "assistant", tool_calls: [{ tool: "count_measures", arguments: {} }] }],
      },
    },
  ] as V1Record[],
}));

vi.mock("./builder.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./builder.js")>();
  return {
    ...actual,
    buildAllRecords: () => {
      state.calls += 1;
      return state.records;
    },
  };
});

vi.mock("./library.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./library.js")>();
  return {
    ...actual,
    loadPublishableSongs: () => [{ id: "fur-elise", genre: "classical" }],
  };
});

const corpusFile = fileURLToPath(new URL("./generate-corpus.ts", import.meta.url));

async function runCli(args: string[]): Promise<{ stdout: string; dir: string }> {
  vi.resetModules();
  state.calls = 0;
  const dir = mkdtempSync(join(tmpdir(), "ajs-v1-cli-"));
  const argv = process.argv;
  const chunks: string[] = [];
  const orig = process.stdout.write;
  process.argv = [process.execPath, corpusFile, ...args, "--out", dir];
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;
  try {
    await import("./generate-corpus.ts");
    return { stdout: chunks.join(""), dir };
  } finally {
    process.stdout.write = orig;
    process.argv = argv;
  }
}

describe("generate-corpus command entry", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ["arithmetic", []],
    ["bare-label", ["--bare-label"]],
    ["plain-comparison", ["--plain-comparison"]],
    ["bare-label", ["--bare-label", "--plain-comparison"]],
  ] as const)("writes the %s variant when the flags are %j", async (variant, args) => {
    const { stdout, dir } = await runCli([...args]);
    dirs.push(dir);
    expect(state.calls).toBe(1);
    expect(stdout).toBe(
      "coverage floors reported, not asserted: majority shape count_measures at 100.0% (floors_met: false)\n" +
        `wrote 1 records (${variant}) to ${resolve(dir)}\n`,
    );
  });
});
