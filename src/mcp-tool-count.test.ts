import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const README_PATH = join(REPO_ROOT, "README.md");
const HANDBOOK_PATH = join(REPO_ROOT, "site", "src", "content", "docs", "handbook", "mcp-tools.md");

export function parseReadmeCounts(readmeText: string): { tools: number; prompts: number; line416: string } {
  const lines = readmeText.split(/\r?\n/);
  const line416 = lines[415] ?? "";
  const match = line416.match(/^(\d+)\s+tools\s+and\s+(\d+)\s+prompt\s+templates\s+across\s+eight\s+categories:$/);
  if (!match) {
    throw new Error(
      `README.md:416 does not match "<N> tools and <M> prompt templates across eight categories:" (got ${JSON.stringify(line416)})`,
    );
  }
  return {
    tools: Number(match[1]),
    prompts: Number(match[2]),
    line416,
  };
}

export function parseHandbookCounts(handbookText: string): {
  frontmatterTools: number;
  frontmatterPrompts: number;
  bodyTools: number;
  bodyPrompts: number;
} {
  const fmMatch = handbookText.match(
    /^description:\s*All\s+(\d+)\s+MCP\s+tools\s+and\s+(\d+)\s+prompt\s+templates\b/m,
  );
  if (!fmMatch) {
    throw new Error("handbook/mcp-tools.md frontmatter description count line not found");
  }
  const bodyMatch = handbookText.match(
    /^AI\s+Jam\s+Sessions\s+exposes\s+(\d+)\s+tools\s+and\s+(\d+)\s+prompt\s+templates\b/m,
  );
  if (!bodyMatch) {
    throw new Error("handbook/mcp-tools.md body summary count line not found");
  }
  return {
    frontmatterTools: Number(fmMatch[1]),
    frontmatterPrompts: Number(fmMatch[2]),
    bodyTools: Number(bodyMatch[1]),
    bodyPrompts: Number(bodyMatch[2]),
  };
}

export function assertDocCountsMatchRegistry(params: {
  readmeText: string;
  handbookText: string;
  registeredToolCount: number;
  registeredPromptCount: number;
}): void {
  const readme = parseReadmeCounts(params.readmeText);
  const handbook = parseHandbookCounts(params.handbookText);
  expect(readme.tools).toBe(params.registeredToolCount);
  expect(readme.prompts).toBe(params.registeredPromptCount);
  expect(handbook.frontmatterTools).toBe(params.registeredToolCount);
  expect(handbook.frontmatterPrompts).toBe(params.registeredPromptCount);
  expect(handbook.bodyTools).toBe(params.registeredToolCount);
  expect(handbook.bodyPrompts).toBe(params.registeredPromptCount);
}

describe("live MCP tool & prompt counts match README.md and handbook", () => {
  it("README.md:416 and handbook/mcp-tools.md match the server's live registries", async () => {
    const tmpHome = mkdtempSync(join(tmpdir(), "ajs-count-test-"));
    const prevAiJamHome = process.env.AI_JAM_HOME;
    process.env.AI_JAM_HOME = join(tmpHome, ".ai-jam-sessions");

    let client: Client | null = null;
    try {
      const { prepareMcpServer } = await import("./mcp-server.js");
      const server = await prepareMcpServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      client = new Client({ name: "count-check", version: "1.0.0" }, { capabilities: {} });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const [{ tools }, { prompts }] = await Promise.all([
        client.listTools(),
        client.listPrompts(),
      ]);

      const readmeText = readFileSync(README_PATH, "utf8");
      const handbookText = readFileSync(HANDBOOK_PATH, "utf8");

      assertDocCountsMatchRegistry({
        readmeText,
        handbookText,
        registeredToolCount: tools.length,
        registeredPromptCount: prompts.length,
      });
    } finally {
      await client?.close().catch(() => {});
      if (prevAiJamHome === undefined) delete process.env.AI_JAM_HOME;
      else process.env.AI_JAM_HOME = prevAiJamHome;
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it("fails if README.md:416 or the live registry count drifts alone", () => {
    const readmeText = readFileSync(README_PATH, "utf8");
    const handbookText = readFileSync(HANDBOOK_PATH, "utf8");
    const readme = parseReadmeCounts(readmeText);

    const mutatedReadme = readmeText.replace(
      readme.line416,
      `${readme.tools + 1} tools and ${readme.prompts} prompt templates across eight categories:`,
    );
    expect(() =>
      assertDocCountsMatchRegistry({
        readmeText: mutatedReadme,
        handbookText,
        registeredToolCount: readme.tools,
        registeredPromptCount: readme.prompts,
      }),
    ).toThrow();

    expect(() =>
      assertDocCountsMatchRegistry({
        readmeText,
        handbookText,
        registeredToolCount: readme.tools + 1,
        registeredPromptCount: readme.prompts,
      }),
    ).toThrow();
  });
});
