// ─── Every published package still passes the library evidence gate ──────────
//
// The packages under datasets/*-public (and acoustic-v0, which is published
// from its own directory) are what Hugging Face and Zenodo serve. The library
// provenance blocks under songs/ are re-derived from the MIDI bytes and can
// change after a package is published — that is exactly how 58 records of
// jam-actions-v0 0.5.x came to carry an arrangement licence the evidence no
// longer supported (docs/findings/published-dataset-licence-audit.md).
//
// So the gate is re-run here, on the committed packages, every time the suite
// runs. A provenance change that un-clears a song turns this red on the
// published sets themselves, not only on the next packaging run.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  REDISTRIBUTABLE_ARRANGEMENT_LICENSES,
  assertPublicRecordsHaveEvidence,
  evidenceRefusal,
  loadLibraryEvidence,
  type LibraryEvidence,
  type SourceRecord,
} from "./package-public.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const evidence = loadLibraryEvidence(REPO_ROOT);

function readJsonl(rel: string): SourceRecord[] {
  return readFileSync(join(REPO_ROOT, rel), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as SourceRecord);
}

/** A song id may name one song, or several joined by "|" (compare records). */
function songsOf(record: SourceRecord): string[] {
  return String(record.scope.song_id).split("|");
}

function songRefusal(songId: string, ev: ReadonlyMap<string, LibraryEvidence>): string | null {
  const e = ev.get(songId);
  if (!e) return `no library provenance block for "${songId}"`;
  if (!REDISTRIBUTABLE_ARRANGEMENT_LICENSES.includes(e.arrangementLicense)) {
    return `"${songId}" arrangement licence is "${e.arrangementLicense || "absent"}"`;
  }
  if (e.titleVerdict === "contradicts") return `"${songId}" file title contradicts the catalogue`;
  return null;
}

// ─── Unit behaviour of the gate ──────────────────────────────────────────────

function fakeEvidence(over: Partial<LibraryEvidence> = {}): Map<string, LibraryEvidence> {
  return new Map([
    [
      "song-a",
      {
        songId: "song-a",
        arrangementLicense: "CC-BY-SA-3.0-DE",
        titleVerdict: "matches",
        midiSha256: "a".repeat(64),
        sourceSite: "piano-midi.de",
        path: "songs/library/classical/song-a.json",
        ...over,
      },
    ],
  ]);
}

function fakeRecord(sha = "a".repeat(64), songId = "song-a"): SourceRecord {
  return {
    id: `${songId}:m001-004:piano:mcp-session:v1`,
    schema_version: "jam-actions-v0/1.0.0",
    provenance: { record_verdict: "public" },
    scope: { song_id: songId },
    observation: { midi_sidecar: { midi_sha256: sha } },
  };
}

describe("evidenceRefusal", () => {
  it("clears a record whose song and source file match the evidence", () => {
    expect(evidenceRefusal(fakeRecord(), fakeEvidence())).toBeNull();
  });

  it("refuses an arrangement licence outside the allowlist", () => {
    expect(evidenceRefusal(fakeRecord(), fakeEvidence({ arrangementLicense: "unknown" }))).toMatch(/arrangement licence is "unknown"/);
    expect(evidenceRefusal(fakeRecord(), fakeEvidence({ arrangementLicense: "all-rights-reserved" }))).not.toBeNull();
  });

  it("refuses a file whose own title contradicts the catalogue", () => {
    expect(evidenceRefusal(fakeRecord(), fakeEvidence({ titleVerdict: "contradicts" }))).toMatch(/contradicts/);
  });

  it("refuses a record built from a different MIDI file than the evidence describes", () => {
    expect(evidenceRefusal(fakeRecord("b".repeat(64)), fakeEvidence())).toMatch(/not the evidenced file/);
  });

  it("refuses a record with no source-file hash, and a song with no provenance block", () => {
    const noSidecar = { ...fakeRecord(), observation: {} } as SourceRecord;
    expect(evidenceRefusal(noSidecar, fakeEvidence())).toMatch(/no observation\.midi_sidecar\.midi_sha256/);
    expect(evidenceRefusal(fakeRecord("a".repeat(64), "song-z"), fakeEvidence())).toMatch(/no library provenance block/);
  });

  it("fails closed and names every refused record", () => {
    const records = [fakeRecord(), fakeRecord("c".repeat(64))];
    expect(() => assertPublicRecordsHaveEvidence(records, fakeEvidence())).toThrow(/EVIDENCE GATE refused 1 record/);
  });
});

// ─── The committed packages ──────────────────────────────────────────────────

describe("published packages pass the library evidence gate", () => {
  it("jam-actions-v0-public: every record is cleared, source file included", () => {
    const records = readJsonl("datasets/jam-actions-v0-public/records.jsonl");
    expect(records.length).toBeGreaterThan(0);
    const refused = records
      .map((r) => ({ id: r.id, reason: evidenceRefusal(r, evidence) }))
      .filter((x) => x.reason !== null);
    expect(refused).toEqual([]);
  });

  // The acoustic and v1 records carry reductions or takes rather than the
  // source file, so their sidecar hash is not the library file's hash by
  // design. The song-level evidence must still clear every song they use.
  for (const rel of [
    "datasets/jam-actions-acoustic-v0/records.jsonl",
    "datasets/jam-actions-v1-public/records.jsonl",
    "datasets/jam-actions-v1-probe-public/records.jsonl",
  ]) {
    it(`${rel}: every song a record uses is cleared`, () => {
      const records = readJsonl(rel);
      expect(records.length).toBeGreaterThan(0);
      const refused = records.flatMap((r) =>
        songsOf(r)
          .map((s) => ({ id: r.id, reason: songRefusal(s, evidence) }))
          .filter((x) => x.reason !== null),
      );
      expect(refused).toEqual([]);
    });
  }
});
