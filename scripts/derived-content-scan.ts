// ─── Scan the tracked tree for derived content of uncleared songs ────────────
//
// The file-reading half of the derived-content guard. src/dataset/
// derived-content.ts decides what a file's text contains; this walks
// `git ls-files`, reads each file (gunzipping .gz), and hands the text over.
//
// Used by src/dataset/derived-content.test.ts (the CI guard). Run directly to
// print findings for the working tree, for any commit (read from git objects;
// the song evidence is read from the working tree), or for every blob of every
// ref of a repository or mirror:
//
//   pnpm exec tsx scripts/derived-content-scan.ts [--json] [--ref <commit>]
//   pnpm exec tsx scripts/derived-content-scan.ts [--json] --history <git dir>
//
// `--ref 46ce824` reproduces the pre-sweep scan behind
// docs/findings/derived-content-inventory.md; `--history` is the before/after
// check in docs/findings/history-rewrite-runbook.md.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { loadLibraryEvidence, type LibraryEvidence, type SourceRecord } from "../src/dataset/package-public.js";
import {
  isEvidencedRecordShape,
  judge,
  scanFileText,
  songClearance,
  type Finding,
  type JudgeContext,
  type KeyedNotes,
  type SongClearance,
} from "../src/dataset/derived-content.js";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Formats whose bytes carry no text the scanner can read. */
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|ogg|wav|mp3|flac|mid|midi|pyc|woff2?|ttf|safetensors|bin|zip|tar|pdf)$/i;

/**
 * Files `git ls-files` lists that exist on disk. A tracked file deleted in the
 * working tree but not yet staged is still listed; it holds no content.
 */
export function trackedFiles(root: string = REPO_ROOT): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 1 << 28 })
    .toString("utf8")
    .split("\0")
    .filter((f) => f && existsSync(join(root, f)))
    .sort();
}

/** A tracked file's text, or null for binary content. .gz is decompressed. */
export function readTrackedText(root: string, path: string): string | null {
  let buf = readFileSync(join(root, path));
  if (path.endsWith(".gz")) buf = gunzipSync(buf);
  else if (BINARY_EXT.test(path) || buf.subarray(0, 8192).includes(0)) return null;
  return buf.toString("utf8");
}

/** The path a .gz is scanned as: "run.log.gz" reads as "run.log". */
function scanPath(path: string): string {
  return path.endsWith(".gz") ? path.slice(0, -3) : path;
}

export interface RepoScan {
  findings: Finding[];
  /** Every keyed note group, cleared or not, for the inventory. */
  keyed: { path: string; notes: KeyedNotes }[];
  clearance: Map<string, SongClearance>;
  evidence: Map<string, LibraryEvidence>;
  /** The context the scan judged with, so a caller can judge one more file the same way. */
  context: JudgeContext;
  scanned: number;
  binary: string[];
}

/** Record-shaped objects in tracked JSON and JSONL under datasets/, by id. */
function indexRecords(
  texts: Map<string, string>,
  songIds: ReadonlySet<string>,
): Map<string, SourceRecord> {
  const records = new Map<string, SourceRecord>();
  const take = (o: unknown): void => {
    if (isEvidencedRecordShape(o, songIds) && !records.has(o.id)) records.set(o.id, o);
  };
  for (const [path, text] of texts) {
    if (!path.startsWith("datasets/")) continue;
    if (path.endsWith(".json")) {
      try {
        take(JSON.parse(text));
      } catch {
        // not a record
      }
    } else if (path.endsWith(".jsonl")) {
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          take(JSON.parse(line));
        } catch {
          // not a record
        }
      }
    }
  }
  return records;
}

export function scanRepo(
  root: string = REPO_ROOT,
  files: string[] = trackedFiles(root),
  read: (path: string) => string | null = (p) => readTrackedText(root, p),
): RepoScan {
  const evidence = loadLibraryEvidence(root);
  const clearance = songClearance(evidence);
  const songIds = new Set(clearance.keys());
  const texts = new Map<string, string>();
  const binary: string[] = [];
  for (const f of files) {
    const t = read(f);
    if (t === null) binary.push(f);
    else texts.set(f, t);
  }
  const records = indexRecords(texts, songIds);
  const sc = { songIds, recordIds: new Set(records.keys()) };
  const jc: JudgeContext = { ...sc, clearance, evidence, records };
  const findings: Finding[] = [];
  const keyed: { path: string; notes: KeyedNotes }[] = [];
  for (const [path, text] of texts) {
    const notes = scanFileText(scanPath(path), text, sc);
    for (const n of notes) keyed.push({ path, notes: n });
    findings.push(...judge(path, notes, jc));
  }
  return { findings, keyed, clearance, evidence, context: jc, scanned: texts.size, binary };
}

/** Judge one file's text with a finished scan's context, as the scan itself would. */
export function judgeText(scan: RepoScan, path: string, text: string): Finding[] {
  return judge(path, scanFileText(scanPath(path), text, scan.context), scan.context);
}

export interface HistoryPath {
  path: string;
  /** Blob versions of this path reachable from any ref. */
  versions: number;
  /** Blob ids of the versions that hold uncleared content. */
  dirtyBlobs: string[];
  /** Whether HEAD's tree has this path. */
  presentAtHead: boolean;
  songs: string[];
}

/**
 * Scan every blob reachable from any ref of `gitDir` (a repository or a bare
 * mirror). For a history rewrite: paths absent at HEAD whose versions hold
 * uncleared content can go by path; paths still present need their dirty
 * versions dropped by blob id. Song evidence is read from `root`.
 */
export function scanHistory(gitDir: string, root: string = REPO_ROOT): HistoryPath[] {
  const git = (args: string[], input?: string): Buffer => {
    const r = spawnSync("git", ["-C", gitDir, ...args], { input, maxBuffer: 2 ** 31 - 1 });
    if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.toString()}`);
    return r.stdout;
  };
  // Every (blob, path) pair any commit on any ref adds or modifies. `rev-list
  // --objects` would name each blob once, under the first path it meets, and
  // miss the same blob at a second path (a rename, or one record in two
  // datasets).
  const pairs: (readonly [string, string])[] = [];
  for (const line of git(["log", "--all", "-m", "--raw", "--no-renames", "--no-abbrev", "--format="]).toString("utf8").split("\n")) {
    // ":100644 100644 <old> <new> M\t<path>"; mode 160000 is a submodule commit, not a blob
    if (!line.startsWith(":")) continue;
    const tab = line.indexOf("\t");
    const [, newMode, , sha, status] = line.slice(0, tab).split(" ");
    const p = line.slice(tab + 1);
    if (status !== "D" && newMode !== "160000" && !/^0+$/.test(sha) && !BINARY_EXT.test(p)) pairs.push([sha, p] as const);
  }
  const pathsOf = new Map<string, Set<string>>();
  for (const [sha, p] of pairs) pathsOf.set(sha, (pathsOf.get(sha) ?? new Set()).add(p));
  const pathOf = new Map<string, string>([...pathsOf].map(([sha, ps]) => [sha, [...ps][0]]));
  const out = git(["cat-file", "--batch"], [...pathOf.keys()].join("\n") + "\n");
  const blobs = new Map<string, string>();
  for (let off = 0; off < out.length; ) {
    const nl = out.indexOf(10, off);
    const [sha, type, size] = out.subarray(off, nl).toString().split(" ");
    if (type === "missing" || size === undefined) {
      // "<sha> missing": nothing follows the header
      off = nl + 1;
      continue;
    }
    const end = nl + 1 + Number(size);
    let buf = out.subarray(nl + 1, end);
    off = end + 1;
    if (type !== "blob") continue;
    const p = pathOf.get(sha)!;
    if (p.endsWith(".gz")) {
      try {
        buf = gunzipSync(buf);
      } catch {
        continue;
      }
    } else if (buf.subarray(0, 8192).includes(0)) continue;
    blobs.set(sha, buf.toString("utf8"));
  }
  const evidence = loadLibraryEvidence(root);
  const clearance = songClearance(evidence);
  const songIds = new Set(clearance.keys());
  // index every historical version of every v0 record, keyed by record id
  const records = new Map<string, SourceRecord>();
  for (const [sha, text] of blobs) {
    const p = pathOf.get(sha)!;
    if (!p.startsWith("datasets/") || !p.endsWith(".json")) continue;
    try {
      const o = JSON.parse(text);
      if (isEvidencedRecordShape(o, songIds) && !records.has(o.id)) records.set(o.id, o);
    } catch {
      // not a record
    }
  }
  const sc = { songIds, recordIds: new Set(records.keys()) };
  const jc: JudgeContext = { ...sc, clearance, evidence, records };
  const head = new Set(
    spawnSync("git", ["-C", gitDir, "ls-tree", "-r", "--name-only", "HEAD"], { maxBuffer: 2 ** 30 })
      .stdout.toString("utf8")
      .split("\n")
      .filter(Boolean),
  );
  const result = new Map<string, HistoryPath>();
  const versions = new Map<string, Set<string>>();
  for (const [sha, p] of pairs) if (blobs.has(sha)) versions.set(p, (versions.get(p) ?? new Set()).add(sha));
  for (const [sha, text] of blobs) {
    for (const p of pathsOf.get(sha)!) {
      const f = judge(p, scanFileText(scanPath(p), text, sc), jc);
      if (!f.length) continue;
      const e = result.get(p) ?? { path: p, versions: versions.get(p)?.size ?? 1, dirtyBlobs: [], presentAtHead: head.has(p), songs: [] };
      e.dirtyBlobs.push(sha);
      e.songs = [...new Set([...e.songs, ...f.map((x) => x.songKey)])].sort();
      result.set(p, e);
    }
  }
  for (const e of result.values()) e.dirtyBlobs.sort();
  return [...result.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** Files and a reader for a commit, from git objects rather than the working tree. */
export function atRef(ref: string, root: string = REPO_ROOT): { files: string[]; read: (p: string) => string | null } {
  const files = execFileSync("git", ["ls-tree", "-r", "-z", "--name-only", ref], { cwd: root, maxBuffer: 1 << 28 })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
  const read = (p: string): string | null => {
    let buf = execFileSync("git", ["show", `${ref}:${p}`], { cwd: root, maxBuffer: 1 << 28 });
    if (p.endsWith(".gz")) buf = gunzipSync(buf);
    else if (BINARY_EXT.test(p) || buf.subarray(0, 8192).includes(0)) return null;
    return buf.toString("utf8");
  };
  return { files, read };
}

function main(): void {
  const histAt = process.argv.indexOf("--history");
  if (histAt >= 0) {
    const rows = scanHistory(process.argv[histAt + 1] ?? REPO_ROOT);
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
      return;
    }
    for (const r of rows) {
      console.log(`${r.presentAtHead ? "present" : "history"}  ${r.dirtyBlobs.length}/${r.versions}  ${r.path}`);
    }
    console.log(`\n${rows.length} paths hold uncleared content in some version.`);
    return;
  }
  const refAt = process.argv.indexOf("--ref");
  const ref = refAt >= 0 ? process.argv[refAt + 1] : null;
  const at = ref ? atRef(ref) : null;
  const scan = at ? scanRepo(REPO_ROOT, at.files, at.read) : scanRepo();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(scan.findings, null, 2)}\n`);
    return;
  }
  const byPath = new Map<string, Finding[]>();
  for (const f of scan.findings) byPath.set(f.path, [...(byPath.get(f.path) ?? []), f]);
  for (const [path, fs] of byPath) {
    const units = fs.reduce((n, f) => n + f.units, 0);
    console.log(`${path}  (${fs.length} key${fs.length === 1 ? "" : "s"}, ${units} units)`);
  }
  console.log(`\n${scan.findings.length} findings in ${byPath.size} files; ${scan.scanned} text files scanned, ${scan.binary.length} binary skipped.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
