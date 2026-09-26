// ─── Scan the tracked tree for derived content of uncleared songs ────────────
//
// The file-reading half of the derived-content guard. src/dataset/
// derived-content.ts decides what a file's text contains; this walks
// `git ls-files`, reads each file, and hands the text over. Every mode (the
// tree, --ref, --history) reads a file through one function, classify: gzip
// is decompressed (by a .gz name or by its magic bytes, within a bound), and
// binary content carries no text to read except MIDI, which is found by its
// name or by its header and judged whole (judgeMidi).
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
  isMidiFile,
  judge,
  judgeMidi,
  scanFileText,
  smfHeaderOffset,
  songClearance,
  uninspectedFinding,
  type Finding,
  type JudgeContext,
  type KeyedNotes,
  type SongClearance,
} from "../src/dataset/derived-content.js";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Formats whose bytes carry no text the scanner can read. MIDI among them is judged by its bytes. */
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|ogg|wav|mp3|flac|mid|midi|kar|rmi|smf|pyc|woff2?|ttf|safetensors|bin|zip|tar|pdf)$/i;

/** Whether bytes are binary: a NUL in the first 8 KB. */
function isBinary(buf: Uint8Array): boolean {
  return buf.subarray(0, 8192).includes(0);
}

/** Whether a path may be read as text: its name is not a binary format's. */
function isTextPath(path: string): boolean {
  return !BINARY_EXT.test(scanPath(path));
}

/**
 * The most one gzip stream may inflate to: 64 MiB. The largest in this
 * repository's history inflates to 0.84 MiB (measured 2026-09-26).
 */
export const MAX_INFLATE = 64 * 2 ** 20;

/** gzip's magic bytes: 1F 8B, then 08 (deflate, the only method gzip defines). */
function isGzip(buf: Uint8Array): boolean {
  return buf.length >= 3 && buf[0] === 0x1f && buf[1] === 0x8b && buf[2] === 0x08;
}

/** What a file is to a scan. */
export type Content =
  | { kind: "text"; bytes: Buffer }
  | { kind: "midi"; bytes: Buffer }
  | { kind: "other" }
  | { kind: "uninspected"; reason: string };

/**
 * How every scan reads one file, given its path and its bytes as stored. The
 * tree, --ref and --history all read through this, one path at a time, so
 * they reach the same verdicts.
 *
 * 1. gzip is decompressed when the name ends in .gz or the bytes start with
 *    gzip's magic, whatever the name. One layer is opened. zlib inflates in
 *    16 KiB chunks and stops the moment its output passes `maxInflate`, so no
 *    file can hold more than that in memory. Past the bound, or when the bytes
 *    do not decompress, the file is uninspected: a finding, never a skip.
 * 2. Text is read under a text name when there is no NUL in the first 8 KB,
 *    unless it holds a MIDI header: then it is MIDI after text.
 * 3. Otherwise it is MIDI by name or by header (isMidiFile), or not judged.
 */
export function classify(path: string, raw: Buffer, maxInflate: number = MAX_INFLATE): Content {
  let bytes = raw;
  if (path.endsWith(".gz") || isGzip(raw)) {
    try {
      bytes = gunzipSync(raw, { maxOutputLength: maxInflate });
    } catch (e) {
      const code = (e as { code?: string }).code;
      return {
        kind: "uninspected",
        reason:
          code === "ERR_BUFFER_TOO_LARGE"
            ? `gzip content inflates past ${maxInflate} bytes, the scan's bound, so it was not read`
            : `gzip content does not decompress (${code ?? (e as Error).message}), so it was not read`,
      };
    }
  }
  const text = isTextPath(path) && !isBinary(bytes);
  if (text ? smfHeaderOffset(bytes) >= 0 : isMidiFile(scanPath(path), bytes)) return { kind: "midi", bytes };
  return text ? { kind: "text", bytes } : { kind: "other" };
}

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
  /** Files with no text to scan, MIDI and uninspected files included. */
  binary: string[];
  /** Files judged as MIDI, by their bytes (a subset of `binary`). */
  midi: string[];
  /** Files that could not be read (a subset of `binary`); each is also a finding. */
  uninspected: string[];
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
  readRaw: (path: string) => Buffer = (p) => readFileSync(join(root, p)),
): RepoScan {
  const evidence = loadLibraryEvidence(root);
  const clearance = songClearance(evidence);
  const songIds = new Set(clearance.keys());
  const texts = new Map<string, string>();
  const binary: string[] = [];
  const midiBytes = new Map<string, Buffer>();
  const uninspected: Finding[] = [];
  for (const f of files) {
    const raw = readRaw(f);
    const c = classify(f, raw);
    if (c.kind === "text") {
      texts.set(f, c.bytes.toString("utf8"));
      continue;
    }
    binary.push(f);
    if (c.kind === "midi") midiBytes.set(f, c.bytes);
    else if (c.kind === "uninspected") uninspected.push(uninspectedFinding(f, c.reason, raw.length));
  }
  const records = indexRecords(texts, songIds);
  const sc = { songIds, recordIds: new Set(records.keys()) };
  const jc: JudgeContext = { ...sc, clearance, evidence, records };
  const findings: Finding[] = [...uninspected];
  const keyed: { path: string; notes: KeyedNotes }[] = [];
  for (const [path, text] of texts) {
    const notes = scanFileText(scanPath(path), text, sc);
    for (const n of notes) keyed.push({ path, notes: n });
    findings.push(...judge(path, notes, jc));
  }
  for (const [path, bytes] of midiBytes) findings.push(...judgeMidi(path, bytes, jc));
  return {
    findings,
    keyed,
    clearance,
    evidence,
    context: jc,
    scanned: texts.size,
    binary,
    midi: [...midiBytes.keys()],
    uninspected: uninspected.map((f) => f.path),
  };
}

/** Judge one file's text with a finished scan's context, as the scan itself would. */
export function judgeText(scan: RepoScan, path: string, text: string): Finding[] {
  return judge(path, scanFileText(scanPath(path), text, scan.context), scan.context);
}

/**
 * Judge one file's bytes, as stored, with a finished scan's context, as the
 * scan itself would (classify): text as text, MIDI whole, an unreadable file
 * as uninspected, other binary content not at all.
 */
export function judgeBytes(scan: RepoScan, path: string, raw: Buffer): Finding[] {
  const c = classify(path, raw);
  if (c.kind === "text") return judgeText(scan, path, c.bytes.toString("utf8"));
  if (c.kind === "midi") return judgeMidi(path, c.bytes, scan.context);
  if (c.kind === "uninspected") return [uninspectedFinding(path, c.reason, raw.length)];
  return [];
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
    // Every blob is read, whatever its name. As in the tree scan, the header
    // and not the name says whether it is MIDI, so a MIDI file committed as
    // .bin or .png is judged too. On this repository's history that reads 113
    // more blobs (13.3 MiB of audio and images) than text and MIDI names
    // alone (measured 2026-09-26).
    if (status !== "D" && newMode !== "160000" && !/^0+$/.test(sha)) pairs.push([sha, p] as const);
  }
  const pathsOf = new Map<string, Set<string>>();
  for (const [sha, p] of pairs) pathsOf.set(sha, (pathsOf.get(sha) ?? new Set()).add(p));
  const out = git(["cat-file", "--batch"], [...pathsOf.keys()].join("\n") + "\n");
  // Each (blob, path) pair is read as the tree scan reads that path (classify),
  // so a blob under two names gets each name's verdict. The content a blob
  // yields is the same under every name that yields any (gzip is opened by
  // its magic bytes whatever the name), so text and MIDI bytes are kept once
  // per blob, with the paths that read them.
  const texts = new Map<string, { text: string; paths: string[] }>();
  const midis = new Map<string, { bytes: Buffer; paths: string[] }>();
  const unread = new Map<string, { reason: string; size: number; paths: string[] }[]>();
  for (let off = 0; off < out.length; ) {
    const nl = out.indexOf(10, off);
    const [sha, type, size] = out.subarray(off, nl).toString().split(" ");
    if (type === "missing" || size === undefined) {
      // "<sha> missing": nothing follows the header
      off = nl + 1;
      continue;
    }
    const end = nl + 1 + Number(size);
    const raw = out.subarray(nl + 1, end);
    off = end + 1;
    if (type !== "blob") continue;
    for (const p of pathsOf.get(sha)!) {
      const c = classify(p, raw);
      if (c.kind === "text") {
        const e = texts.get(sha) ?? { text: c.bytes.toString("utf8"), paths: [] }; // decoded once per blob
        e.paths.push(p);
        texts.set(sha, e);
      } else if (c.kind === "midi") {
        const e = midis.get(sha) ?? { bytes: Buffer.from(c.bytes), paths: [] };
        e.paths.push(p);
        midis.set(sha, e);
      } else if (c.kind === "uninspected") {
        unread.set(sha, [...(unread.get(sha) ?? []), { reason: c.reason, size: raw.length, paths: [p] }]);
      }
      // "other": binary content that is not MIDI (images, audio), nothing to judge
    }
  }
  const evidence = loadLibraryEvidence(root);
  const clearance = songClearance(evidence);
  const songIds = new Set(clearance.keys());
  // index every historical version of every v0 record, keyed by record id
  const records = new Map<string, SourceRecord>();
  for (const { text, paths } of texts.values()) {
    if (!paths.some((p) => p.startsWith("datasets/") && p.endsWith(".json"))) continue;
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
  // versions of a path: the blobs it had that the scan reads (text, MIDI or unreadable)
  const versions = new Map<string, Set<string>>();
  const read = (sha: string, p: string): void => void versions.set(p, (versions.get(p) ?? new Set()).add(sha));
  for (const [sha, e] of texts) for (const p of e.paths) read(sha, p);
  for (const [sha, e] of midis) for (const p of e.paths) read(sha, p);
  for (const [sha, es] of unread) for (const e of es) for (const p of e.paths) read(sha, p);
  const add = (p: string, sha: string, f: Finding[]): void => {
    if (!f.length) return;
    const e = result.get(p) ?? { path: p, versions: versions.get(p)?.size ?? 1, dirtyBlobs: [], presentAtHead: head.has(p), songs: [] };
    e.dirtyBlobs.push(sha);
    e.songs = [...new Set([...e.songs, ...f.map((x) => x.songKey)])].sort();
    result.set(p, e);
  };
  for (const [sha, { text, paths }] of texts) {
    for (const p of paths) add(p, sha, judge(p, scanFileText(scanPath(p), text, sc), jc));
  }
  for (const [sha, { bytes, paths }] of midis) {
    for (const p of paths) add(p, sha, judgeMidi(p, bytes, jc));
  }
  for (const [sha, es] of unread) {
    for (const e of es) for (const p of e.paths) add(p, sha, [uninspectedFinding(p, e.reason, e.size)]);
  }
  for (const e of result.values()) e.dirtyBlobs.sort();
  return [...result.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** Files and a reader of their stored bytes for a commit, from git objects rather than the working tree. */
export function atRef(ref: string, root: string = REPO_ROOT): { files: string[]; readRaw: (p: string) => Buffer } {
  const files = execFileSync("git", ["ls-tree", "-r", "-z", "--name-only", ref], { cwd: root, maxBuffer: 1 << 28 })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
  return { files, readRaw: (p) => execFileSync("git", ["show", `${ref}:${p}`], { cwd: root, maxBuffer: 1 << 28 }) };
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
  const scan = at ? scanRepo(REPO_ROOT, at.files, at.readRaw) : scanRepo();
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
  const skipped = scan.binary.length - scan.midi.length - scan.uninspected.length;
  console.log(
    `\n${scan.findings.length} findings in ${byPath.size} files; ${scan.scanned} text files scanned, ` +
      `${scan.midi.length} MIDI files judged by their bytes, ${scan.uninspected.length} unreadable (findings), ` +
      `${skipped} other binary files skipped.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
