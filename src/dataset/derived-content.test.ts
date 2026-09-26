// ─── Derived content of uncleared songs stays out of the tree ────────────────
//
// The 2026-09-25 sweep removed note-level and measurement-level content of
// songs the library evidence gate does not clear: experiment inputs, model
// outputs that echo them, eval traces, training lines, piano rolls
// (docs/findings/derived-content-inventory.md). This test scans every file
// `git ls-files` lists and fails when such content comes back.
//
// "Cleared" is the packager's gate, not a list kept here: see songClearance in
// derived-content.ts. The exceptions below are reviewed one by one. Each names
// the songs it covers and a ceiling on how much it may hold, so an exception
// cannot quietly grow; one that no longer matches anything fails as stale.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { judgeText, scanHistory, scanRepo, trackedFiles, type RepoScan } from "../../scripts/derived-content-scan.js";
import {
  countNoteIndicators,
  isDataPath,
  judge,
  mentionedSongIds,
  noteUnits,
  scanFileText,
  songClearance,
  type Finding,
} from "./derived-content.js";
import { evidenceRefusal, loadLibraryEvidence, type LibraryEvidence, type SourceRecord } from "./package-public.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ─── Reviewed exceptions ─────────────────────────────────────────────────────
//
// Kept in derived-content-exceptions.json, not here: this file is scanned with
// the rest of the tree, and a literal song id beside a fixture's notes would
// itself be a finding.

interface Exception {
  path: string;
  /** Song ids the exception covers; "*" only where every entry is the same boilerplate. */
  songs: readonly string[] | "*";
  /** Ceiling on the units any one song may reach in this file. */
  maxUnits: number;
  reason: string;
}

interface ExceptionsFile {
  not_derived: Exception[];
  held_for_owner: { reason: string; songs: string[]; maxUnits: number; paths: string[] };
}

const exceptionsFile = JSON.parse(
  readFileSync(join(REPO_ROOT, "src", "dataset", "derived-content-exceptions.json"), "utf8"),
) as ExceptionsFile;
/** Content keyed to an uncleared song that is not a copy of its arrangement. */
const NOT_DERIVED: readonly Exception[] = exceptionsFile.not_derived;
/** Held for the owner: a published surface depends on these (see the JSON). */
const HELD_FOR_OWNER: readonly Exception[] = exceptionsFile.held_for_owner.paths.map((path) => ({
  path,
  songs: exceptionsFile.held_for_owner.songs,
  maxUnits: exceptionsFile.held_for_owner.maxUnits,
  reason: exceptionsFile.held_for_owner.reason,
}));
const EXCEPTIONS = [...NOT_DERIVED, ...HELD_FOR_OWNER];

function coveredBy(f: Finding, e: Exception): boolean {
  if (f.path !== e.path) return false;
  const songs = f.songKey.split("|");
  const inList = e.songs === "*" || songs.every((s) => (e.songs as readonly string[]).includes(s));
  return inList && f.units <= e.maxUnits;
}

function describeFinding(f: Finding): string {
  const at = f.recordId ? `${f.songKey} @ ${f.recordId}` : f.songKey;
  return `${f.path}: ${f.level} content keyed to ${at} (${f.units} units; ${f.where.slice(0, 3).join(", ")}) — ${f.reason}`;
}

// ─── Fixtures: song ids come from the evidence, never from this file ─────────
//
// This file is scanned with the rest of the tree. Its fixtures pair notes with
// song ids built at run time from the library, so the source never pairs a
// literal uncleared id with notes.

const evidence = loadLibraryEvidence(REPO_ROOT);
const clearance = songClearance(evidence);
const UNCLEARED = [...clearance.values()].find((c) => !c.cleared)!.songId;
const CLEARED = [...clearance.values()].find((c) => c.cleared)!.songId;
const songIds = new Set(clearance.keys());

/** The shape of an E-R item the sweep removed: an item id, a song id, a melody. */
function erItem(songId: string, rightHand: string): string {
  return JSON.stringify([
    {
      itemId: `${songId}:m1-8`,
      songId,
      melody: [{ number: 1, rightHand }],
      sourceChords: [{ measure: 1, impliedChord: "C" }],
    },
  ]);
}
const SCALE = ["C4", "D4", "E4", "F4"].map((p) => `${p}:q`).join(" ");

function fakeEvidence(): Map<string, LibraryEvidence> {
  const ev = new Map<string, LibraryEvidence>();
  const add = (songId: string, arrangementLicense: string, titleVerdict = "matches") =>
    ev.set(songId, {
      songId,
      arrangementLicense,
      titleVerdict,
      midiSha256: songId.padEnd(64, "0").slice(0, 64),
      sourceSite: "test",
      path: `songs/library/test/${songId}.json`,
    });
  add("song-cleared", "CC-BY-SA-3.0-DE");
  add("song-unknown", "unknown");
  add("song-wrongtitle", "Public-Domain", "contradicts");
  return ev;
}

function judgeFake(path: string, text: string, records: Map<string, SourceRecord> = new Map()): Finding[] {
  const ev = fakeEvidence();
  const cl = songClearance(ev);
  const ids = new Set(cl.keys());
  const sc = { songIds: ids, recordIds: new Set(records.keys()) };
  return judge(path, scanFileText(path, text, sc), { ...sc, clearance: cl, evidence: ev, records });
}

// ─── The cleared set is the gate's ───────────────────────────────────────────

describe("songClearance is the evidence gate", () => {
  it("clears a redistributable licence and refuses an unknown one or a contradicting title", () => {
    const cl = songClearance(fakeEvidence());
    expect(cl.get("song-cleared")?.cleared).toBe(true);
    expect(cl.get("song-unknown")?.cleared).toBe(false);
    expect(cl.get("song-unknown")?.refusal).toMatch(/arrangement licence is "unknown"/);
    expect(cl.get("song-wrongtitle")?.cleared).toBe(false);
    expect(cl.get("song-wrongtitle")?.refusal).toMatch(/contradicts/);
  });

  it("agrees with evidenceRefusal on every library song", () => {
    for (const ev of evidence.values()) {
      const probe = {
        id: `${ev.songId}:x`,
        schema_version: "x",
        provenance: { record_verdict: "public" as const },
        scope: { song_id: ev.songId },
        observation: { midi_sidecar: { midi_sha256: ev.midiSha256 } },
      };
      expect(clearance.get(ev.songId)?.cleared, ev.songId).toBe(evidenceRefusal(probe, evidence) === null);
    }
  });
});

// ─── What counts as note-level ───────────────────────────────────────────────

describe("note indicators", () => {
  it.each([
    ["hand string", "D4+D5+F5:h A4:w E5:q.", 3],
    ["pitch run", "the melody E5 D#5 E5 D#5 E5 B4", 6],
    ["quoted run", '"C#5","B4","C5","D5"', 4],
    ["REMI", "Bar_1 Position_0 Pitch_60 Velocity_40 Pitch_64", 2],
    ["ABC tune", "X:1\nT:t\nM:4/4\nK:C\n|CDEF|", 4],
    ["MIDI array", '"pitches": [60, 62, 64, 65]', 4],
    ["note field", '{"hand":"left","measure":85,"beat":0.06,"pitch":47,"name":"B2"}', 1],
  ])("counts a %s", (_kind, text, units) => {
    expect(noteUnits(countNoteIndicators(text))).toBe(units);
  });

  it.each([
    ["chord symbols", "| Cmaj7 | Am7 | Dm7 | G7 |"],
    ["a blues progression in chord symbols", "C7 F7 C7 G7 | F7 F7 C7 C7"],
    ["a single pitch in prose", "the melody peaks on G5 before the cadence"],
    ["rests", "R:w R:h"],
    ["a threshold", '{"pitch_fail_cents": 50, "timing_ms": 40}'],
    ["a frequency in a pitch field", '{"pitch": 440, "t": 0}'],
  ])("does not count %s", (_kind, text) => {
    const ind = countNoteIndicators(text);
    expect(noteUnits(ind)).toBe(0);
    expect(ind.measureFields).toBe(0);
  });

  it("counts take measurements separately from notes", () => {
    const ind = countNoteIndicators('{"f0_hz":299.7,"cents_from_target":35.1,"onset_ms":-9.8}');
    expect(noteUnits(ind)).toBe(0);
    expect(ind.measureFields).toBe(3);
  });

  it("reads a one-word song id only in identifier form", () => {
    const ids = new Set(["wave", "all-the-things-you-are"]);
    expect(mentionedSongIds("a sine wave at 440 Hz", ids)).toEqual([]);
    expect(mentionedSongIds('{"songId": "wave"}', ids)).toEqual(["wave"]);
    expect(mentionedSongIds("pianoroll/wave-m001-004.svg", ids)).toEqual(["wave"]);
    expect(mentionedSongIds("played all-the-things-you-are twice", ids)).toEqual(["all-the-things-you-are"]);
  });
});

// ─── Attribution and judgment ────────────────────────────────────────────────

describe("scanFileText + judge", () => {
  it("flags an E-R item of an uncleared song and passes the same item of a cleared one", () => {
    expect(judgeFake("items.json", erItem("song-unknown", SCALE))).toHaveLength(1);
    expect(judgeFake("items.json", erItem("song-cleared", SCALE))).toEqual([]);
    expect(judgeFake("items.json", erItem("song-wrongtitle", SCALE))[0]?.reason).toMatch(/contradicts/);
  });

  it("keys a training line by its _meta and strips a line-id suffix to find the record", () => {
    const line = JSON.stringify({
      messages: [{ role: "tool", content: '{"pitch":60,"beat":1,"measure":2}' }],
      _meta: { song_id: "song-cleared", prompt_id: "song-cleared:m001-004:piano:mcp-session:v1::ground::s6" },
    });
    const f = judgeFake("sft.jsonl", `${line}\n`);
    expect(f).toHaveLength(1);
    expect(f[0].rule).toBe("unevidenced-record");
    expect(f[0].recordId).toBe("song-cleared:m001-004:piano:mcp-session:v1");
  });

  it("judges a v0 record by its own sidecar: a cleared song built from other bytes fails", () => {
    const ev = fakeEvidence();
    const good: SourceRecord = {
      id: "song-cleared:m001-004:piano:mcp-session:v1",
      schema_version: "jam-actions-v0/1.0.0",
      provenance: { record_verdict: "internal" },
      scope: { song_id: "song-cleared" },
      observation: { midi_sidecar: { midi_sha256: ev.get("song-cleared")!.midiSha256, timed_events: [{ note: 60, t_ticks: 0 }] } },
    };
    const bad = { ...good, observation: { midi_sidecar: { midi_sha256: "f".repeat(64), timed_events: [{ note: 60, t_ticks: 0 }] } } };
    expect(judgeFake("r.json", JSON.stringify(good), new Map([[good.id, good]]))).toEqual([]);
    const f = judgeFake("r.json", JSON.stringify(bad), new Map([[bad.id, bad as SourceRecord]]));
    expect(f[0]?.rule).toBe("unevidenced-record");
    expect(f[0]?.reason).toMatch(/not the evidenced file/);
  });

  it("keys a snapshot line by its first tab field", () => {
    const text = JSON.stringify({ lines: [`song-unknown\tm1\t${SCALE}\tC`, `song-cleared\tm1\t${SCALE}\tC`] });
    expect(judgeFake("snap.json", text).map((f) => f.songKey)).toEqual(["song-unknown"]);
  });

  it("holds data files to one unit and prose to NOTE_UNIT_FLOOR", () => {
    expect(isDataPath("a.jsonl") && isDataPath("b.svg") && !isDataPath("c.md")).toBe(true);
    const one = JSON.stringify({ songId: "song-unknown", tool: '{"pitch":60,"beat":1}' });
    expect(judgeFake("one.json", one)).toHaveLength(1);
    expect(judgeFake("prose.md", '"song-unknown" names G5 then C4 E4 G4')).toEqual([]);
    expect(judgeFake("prose.md", '"song-unknown" quotes E5 D#5 E5 D#5 E5 B4')).toHaveLength(1);
  });

  it("does not judge measurements quoted in prose", () => {
    const md = '"song-unknown" returned {"f0_hz": 440, "cents_from_target": 0.03, "onset_ms": null}';
    expect(judgeFake("notes.md", md)).toEqual([]);
    expect(judgeFake("preds.jsonl", `${JSON.stringify({ id: "song-unknown", answer: md })}\n`)[0]?.level).toBe(
      "measurement-level",
    );
  });
});

// ─── The tree ────────────────────────────────────────────────────────────────

describe("derived content of uncleared songs stays out of the tree", () => {
  let scan: RepoScan;
  beforeAll(() => {
    scan = scanRepo(REPO_ROOT);
  });

  it("fixtures here use a real uncleared and a real cleared song id", () => {
    expect(clearance.get(UNCLEARED)?.cleared).toBe(false);
    expect(clearance.get(CLEARED)?.cleared).toBe(true);
    expect(songIds.size).toBeGreaterThan(100);
  });

  it("finds nothing outside the reviewed exceptions (fails closed)", () => {
    const unexpected = scan.findings.filter((f) => !EXCEPTIONS.some((e) => coveredBy(f, e)));
    expect(unexpected.map(describeFinding), "note- or measurement-level content of uncleared songs").toEqual([]);
  });

  it("every exception still matches something and names real songs (none stale)", () => {
    for (const e of EXCEPTIONS) {
      expect(existsSync(join(REPO_ROOT, e.path)), `${e.path} is gone: remove its exception`).toBe(true);
      expect(scan.findings.some((f) => coveredBy(f, e)), `${e.path}: exception matches nothing`).toBe(true);
      if (e.songs !== "*") for (const s of e.songs) expect(songIds.has(s), `${e.path}: unknown song ${s}`).toBe(true);
      expect(e.reason.length).toBeGreaterThan(20);
    }
  });

  it("goes red when a removed E-R item comes back (mutation check)", () => {
    // Re-adding an item of an uncleared song, in the shape the sweep removed
    // from experiments/rollout-arc/p3/runs/er-items.json, is a finding.
    const back = judgeText(scan, "experiments/rollout-arc/p3/runs/er-items.json", erItem(UNCLEARED, SCALE));
    expect(back.map((f) => f.songKey)).toEqual([UNCLEARED]);
    expect(EXCEPTIONS.some((e) => back.every((f) => coveredBy(f, e)))).toBe(false);
    // The same item of a cleared song is not.
    expect(judgeText(scan, "experiments/rollout-arc/p3/runs/er-items.json", erItem(CLEARED, SCALE))).toEqual([]);
  });

  it("scanHistory finds content a later commit deleted, under every path the same blob had", () => {
    const dir = mkdtempSync(join(tmpdir(), "derived-content-history-"));
    try {
      const git = (...args: string[]) =>
        execFileSync("git", ["-C", dir, "-c", "user.name=guard-test", "-c", "user.email=guard-test@example.invalid", "-c", "core.autocrlf=false", ...args]);
      git("init", "-q");
      const item = erItem(UNCLEARED, SCALE);
      for (const d of ["a", "b"]) {
        mkdirSync(join(dir, d));
        writeFileSync(join(dir, d, "items.json"), item); // one blob, two paths
      }
      writeFileSync(join(dir, "clean.json"), erItem(CLEARED, SCALE));
      git("add", "-A");
      git("commit", "-q", "-m", "add");
      git("rm", "-q", "a/items.json");
      git("commit", "-q", "-m", "remove one path");
      const rows = scanHistory(dir, REPO_ROOT);
      expect(rows.map((r) => [r.path, r.presentAtHead])).toEqual([
        ["a/items.json", false],
        ["b/items.json", true],
      ]);
      expect(rows[0].dirtyBlobs).toHaveLength(1);
      expect(rows[0].dirtyBlobs).toEqual(rows[1].dirtyBlobs);
      expect(rows[0].songs).toEqual([UNCLEARED]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("every committed piano roll belongs to a record that passes the evidence gate", () => {
    const rolls = trackedFiles(REPO_ROOT).filter((f) => /^datasets\/[^/]+\/pianoroll\/[^/]+\.svg$/.test(f));
    expect(rolls.length).toBeGreaterThan(0);
    const orphans: string[] = [];
    for (const roll of rolls) {
      const record = roll.replace("/pianoroll/", "/records/").replace(/\.svg$/, ".json");
      if (!existsSync(join(REPO_ROOT, record))) {
        orphans.push(`${roll}: no record at ${record}`);
        continue;
      }
      const rec = JSON.parse(readFileSync(join(REPO_ROOT, record), "utf8")) as SourceRecord;
      const refusal = evidenceRefusal(rec, evidence);
      if (refusal) orphans.push(`${roll}: ${refusal}`);
    }
    expect(orphans).toEqual([]);
  });
});
