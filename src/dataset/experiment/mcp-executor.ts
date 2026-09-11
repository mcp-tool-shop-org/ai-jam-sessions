// ─── MCP stdio executor (dispatch L2) ────────────────────────────────────────
//
// One long-lived dist/mcp-server.js per worker. Isolated AI_JAM_HOME so
// transpose_song cannot write into the operator's library. play_song is
// never sent. Tool errors come back as truncated observations, never as
// process death.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { saveSong } from "../../songs/loader.js";
import type { SongEntry } from "../../songs/types.js";
import { ROLLOUT_TOOLS } from "./env.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const SERVER_ENTRY = join(REPO_ROOT, "dist", "mcp-server.js");

export interface ToolObservation {
  name: string;
  text: string;
  isError: boolean;
  executed: boolean;
}

function lastLine(text: string): string {
  const lines = String(text ?? "").trim().split(/\n/).filter((l) => l.trim());
  return lines.length ? lines[lines.length - 1]! : String(text ?? "").trim();
}

function contentText(res: { content?: Array<{ type: string; text?: string }> }): string {
  return (res.content ?? [])
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n");
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class McpStdioExecutor {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private home: string | null = null;
  private childPid: number | null = null;
  readonly serverEntry: string;

  constructor(serverEntry: string = SERVER_ENTRY) {
    this.serverEntry = serverEntry;
  }

  get pid(): number | null {
    return this.childPid;
  }

  /**
   * Isolated AI_JAM_HOME. seedSongs are written to <home>/songs/ before the
   * server process starts so initializeFromLibrary sees them. The real
   * library is never touched.
   */
  async start(opts?: { seedSongs?: readonly SongEntry[] }): Promise<void> {
    if (this.client) return;
    if (!existsSync(this.serverEntry)) {
      throw new Error(`${this.serverEntry} not found — run pnpm build first`);
    }
    this.home = mkdtempSync(join(tmpdir(), "jam-rollout-"));
    if (opts?.seedSongs?.length) {
      const dir = join(this.home, "songs");
      for (const song of opts.seedSongs) saveSong(song, dir);
    }
    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: [this.serverEntry],
      env: {
        ...process.env,
        HOME: this.home,
        USERPROFILE: this.home,
        AI_JAM_HOME: this.home,
      },
      cwd: REPO_ROOT,
      stderr: "ignore",
    });
    this.client = new Client({ name: "rollout-executor", version: "0.0.1" });
    await this.client.connect(this.transport);
    this.childPid = this.transport.pid;
  }

  async call(name: string, args: Record<string, unknown>): Promise<ToolObservation> {
    if (!this.client) throw new Error("executor not started");
    if (name === "play_song") {
      return {
        name,
        text: "play_song is excluded from this environment",
        isError: true,
        executed: false,
      };
    }
    if (!(ROLLOUT_TOOLS as readonly string[]).includes(name)) {
      return {
        name,
        text: `tool ${name} is not in the rollout catalog`,
        isError: true,
        executed: false,
      };
    }
    try {
      const res = await this.client.callTool({ name, arguments: args }) as {
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      };
      const isError = res.isError === true;
      const raw = contentText(res);
      return {
        name,
        text: isError ? lastLine(raw) : raw,
        isError,
        executed: true,
      };
    } catch (err) {
      return {
        name,
        text: lastLine(String((err as Error).message ?? err)),
        isError: true,
        executed: true,
      };
    }
  }

  async close(): Promise<void> {
    const pid = this.childPid;
    try {
      await this.client?.close();
    } catch {
      /* already gone */
    }
    this.client = null;
    this.transport = null;
    if (pid != null && processAlive(pid)) {
      try {
        process.kill(pid);
      } catch {
        /* ignore */
      }
    }
    if (pid != null) {
      const t0 = Date.now();
      while (processAlive(pid) && Date.now() - t0 < 2000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (processAlive(pid)) {
        throw new Error(`MCP server pid ${pid} still alive after close`);
      }
    }
    this.childPid = null;
    if (this.home) {
      rmSync(this.home, { recursive: true, force: true });
      this.home = null;
    }
  }
}
