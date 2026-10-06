// Shared "is this file the process entry?" check for the published bins.
//
// cli.ts and mcp-server.ts both export functions tests import. Without this
// guard, importing either module runs main() against the importer's argv
// (the test runner). The comparison uses pathToFileURL so Windows
// backslashes and drive-letter casing match.
//
// realpath argv[1] before comparing (es-main pattern): Node resolves
// import.meta.url to the module's real (symlink-resolved) path, but
// process.argv[1] is the path the process was invoked with. On Unix an
// npm/pnpm bin is a symlink (node_modules/.bin/ai-jam-sessions ->
// ../ai-jam-sessions/dist/cli.js), so the two strings never matched and
// main() never ran: the process exited 0 having printed nothing.
// realpathSync can throw (missing path, unusual fs). Fall back to
// path.resolve, which does not throw for a string, so a realpath failure
// degrades to the pre-fix comparison instead of crashing the guard.

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function resolveArgvMainPath(argvPath: string): string {
  try {
    return realpathSync(argvPath);
  } catch {
    return resolve(argvPath);
  }
}

/** True when `importMetaUrl` is this process's entry module. */
export function isEntrypoint(importMetaUrl: string): boolean {
  const argvPath = process.argv[1];
  if (argvPath === undefined) return false;
  return importMetaUrl === pathToFileURL(resolveArgvMainPath(argvPath)).href;
}
