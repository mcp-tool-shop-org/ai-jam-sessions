// ─── POSIX parent-death guard for detached SoulX child trees ─────────────────
//
// Keeps a detached SoulX process group tied to its spawning Node parent without
// invoking a shell (`sh -c`). The parent keeps stdin open as a lifetime pipe; if
// the parent dies (including SIGKILL), stdin hits EOF and the guard kills its
// entire process group (`-process.pid`).
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from "node:child_process";
import { isEntrypoint } from "../entry-guard.js";

export interface PosixParentGuardDeps {
  argv?: readonly string[];
  stdin?: Pick<NodeJS.ReadStream, "on" | "once" | "removeListener" | "resume" | "pause">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  spawner?: typeof spawn;
  exit?: (code: number) => void;
  killGroup?: (pid: number) => void;
}

/**
 * Run the child command while watching stdin for parent EOF. On EOF before child
 * completion, kills the entire detached process group (`-process.pid`).
 */
export function startPosixParentGuard(deps: PosixParentGuardDeps = {}): void {
  const argv = deps.argv ?? process.argv;
  const idx = argv[2] === "--ajs-parent-guard" ? 3 : 2;
  const cmd = argv[idx];
  const args = argv.slice(idx + 1);

  const exit = deps.exit ?? ((code: number) => process.exit(code));
  if (!cmd) {
    exit(2);
    return;
  }

  const stdin = deps.stdin ?? process.stdin;
  const stderr = deps.stderr ?? process.stderr;
  const spawner = deps.spawner ?? spawn;
  const killGroup =
    deps.killGroup ??
    ((pid: number) => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        /* process group already gone */
      }
    });

  let childDone = false;
  const detachStdin = () => {
    stdin.removeListener("end", onParentEof);
    stdin.removeListener("close", onParentEof);
    stdin.pause?.();
  };

  const onParentEof = () => {
    if (childDone) return;
    childDone = true;
    detachStdin();
    killGroup(process.pid);
    exit(137);
  };

  stdin.on("error", () => {});
  stdin.once("end", onParentEof);
  stdin.once("close", onParentEof);
  stdin.resume();

  const child = spawner(cmd, args, {
    stdio: ["ignore", "inherit", "inherit"],
  });

  child.on("error", (err) => {
    if (childDone) return;
    childDone = true;
    detachStdin();
    stderr.write(`[posix-parent-guard] failed to spawn ${cmd}: ${err.message}\n`);
    exit(127);
  });

  child.on("exit", (code, sig) => {
    if (childDone) return;
    childDone = true;
    detachStdin();
    exit(code ?? (sig ? 1 : 0));
  });
}

if (isEntrypoint(import.meta.url)) {
  startPosixParentGuard();
}
