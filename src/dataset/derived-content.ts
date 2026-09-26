// ─── Derived-content guard (2026-09-25) ──────────────────────────────────────
//
// The library evidence gate (package-public.ts) decides which songs a public
// record may come from. It runs on the packages. It never looked at the rest
// of the tree, and the 2026-09-25 sweep found note-level copies of uncleared
// songs in experiment inputs, model outputs, eval traces and docs
// (docs/findings/derived-content-inventory.md).
//
// This module finds note-level content in a file and says which song it is
// keyed to. It is pure: text in, findings out. scripts/derived-content-scan.ts
// feeds it every file `git ls-files` lists (or every file of a commit, for the
// inventory), and the guard test (derived-content.test.ts) runs that scan.
//
// "Cleared" is not redefined here. A song is cleared when a record built from
// exactly the evidenced file would pass `evidenceRefusal`, the packager's own
// gate. A record-shaped object that carries its own
// `observation.midi_sidecar.midi_sha256` is judged by `evidenceRefusal` on
// that record, so a record built from a superseded file of a cleared song
// still fails.
//
// Note-level means an encoding from which individual pitches can be read:
// hand strings ("C4+E4:q"), runs of four or more pitch names, REMI
// Pitch_NN tokens, ABC tunes, piano-roll rectangles, MIDI-number arrays,
// note events. Measurement-level means values measured on a take of the song
// (f0, cents off target, onset offsets). In a data file one such unit keyed
// to an uncleared song is a finding; in prose and code a finding needs
// NOTE_UNIT_FLOOR note units, so a named chord or a single pitch is not one.
// Chord symbols, labels, counts and prose are metadata and are not counted.
//
// A MIDI file is judged by its bytes, not its text (judgeMidi, at the end):
// it passes only when it is exactly a cleared song's evidenced file.

import { createHash } from "node:crypto";
import { parseMidi } from "midi-file";
import { evidenceRefusal, type LibraryEvidence, type SourceRecord } from "./package-public.js";

// ─── The cleared set ─────────────────────────────────────────────────────────

/** Whether the library evidence gate clears a song, and why not. */
export interface SongClearance {
  songId: string;
  cleared: boolean;
  /** `evidenceRefusal`'s reason, or null when cleared. */
  refusal: string | null;
}

/**
 * Judge every song in `evidence` by the packager's gate: a song is cleared
 * when a record built from exactly the evidenced file passes
 * `evidenceRefusal`. Keys are the songs' ids as the library spells them.
 */
export function songClearance(
  evidence: ReadonlyMap<string, LibraryEvidence>,
): Map<string, SongClearance> {
  const out = new Map<string, SongClearance>();
  for (const ev of evidence.values()) {
    const probe: SourceRecord = {
      id: `${ev.songId}:clearance-probe`,
      schema_version: "clearance-probe",
      provenance: { record_verdict: "public" },
      scope: { song_id: ev.songId },
      observation: { midi_sidecar: { midi_sha256: ev.midiSha256 } },
    };
    const refusal = evidenceRefusal(probe, evidence);
    out.set(ev.songId, { songId: ev.songId, cleared: refusal === null, refusal });
  }
  return out;
}

// ─── Note indicators ─────────────────────────────────────────────────────────

/** Counts of note-bearing units in a piece of text or one JSON value. */
export interface NoteIndicators {
  /** Hand-string tokens with a duration ("C4:q", "D4+F4+A4:h."), rests excluded. */
  handTokens: number;
  /** Pitches inside runs of 4+ pitch names ("E5 D#5 E5 B4"). */
  pitchRunNotes: number;
  /** Pitches inside runs of 4+ quoted pitch names ('"C4","E4","G4","B4"'). */
  quotedRunNotes: number;
  /** REMI pitch tokens ("Pitch_60"). */
  remiPitchTokens: number;
  /** ABC tunes (an X: header followed by a K: line). */
  abcBlocks: number;
  /** <rect> elements inside an SVG document. */
  svgRects: number;
  /** Numbers inside a pitch/notes/midi array of 4+ MIDI numbers. */
  midiArrayNotes: number;
  /** "pitch"/"note"/"midi" fields with a MIDI number, inside strings or source. */
  noteFields: number;
  /** Parsed objects that carry a MIDI number and a time or position. */
  events: number;
  /**
   * Measurements taken from a rendered or performed take: f0, cents off the
   * target, onset offsets. Thresholds ("pitch_fail_cents") are settings, not
   * measurements, and are not counted.
   */
  measureFields: number;
}

/** Note units a prose or code file needs for one song before it is a finding. */
export const NOTE_UNIT_FLOOR = 4;

/** Data files (JSON, JSONL, logs, SVG): read by models and scripts, judged unit by unit. */
export function isDataPath(path: string): boolean {
  return /\.(json|jsonl|log|svg)(\.gz)?$/i.test(path);
}

const PITCH = "[A-G](?:#|b)?-?\\d";
// A bare pitch name in a run or a list. Octaves 7 and up are left out: "C7 F7
// C7 G7" is a blues progression in chord symbols, and a melody that high is
// rare enough that splitting its run costs little.
const RUN_PITCH = "[A-G](?:#|b)?-?[0-6]";
// Grammar of src/note-parser.ts; suffixes are DURATION_MAP in src/types.ts.
const HAND_TOKEN = new RegExp(
  `(?<![A-Za-z0-9#+])(?:R|${PITCH}(?:\\+${PITCH})*):(?:w|h\\.|ht|h|q\\.|qt|q|e\\.|et|e|s)(?![A-Za-z0-9])`,
  "g",
);
const PITCH_RUN = new RegExp(
  `(?<![A-Za-z0-9#])${RUN_PITCH}(?:[\\s,;\\-–>→|]+${RUN_PITCH}){3,}(?![A-Za-z0-9#])`,
  "g",
);
const QUOTED_RUN = new RegExp(
  `\\\\?"${RUN_PITCH}\\\\?"(?:\\s*,\\s*\\\\?"${RUN_PITCH}\\\\?"){3,}`,
  "g",
);
const PITCH_ONLY = new RegExp(PITCH, "g");
/** A MIDI note number, 0-127. */
const MIDI_NO = "(?:12[0-7]|1[01]\\d|\\d{1,2})";
const REMI_PITCH = /(?<![A-Za-z])(?:Pitch|Note-On|NoteOn|Note_On)_\d+/g;
const ABC_TUNE = /X:[ \t]*\d+[ \t]*(?:\\r)?(?:\\n|\r?\n)[\s\S]{0,400}?K:/g;
const SVG_RECT = /<rect\b/g;
const MIDI_ARRAY = new RegExp(
  `\\\\?["']?(?:pitches|notes|midi|midi_notes|melody|pitch_seq|pitch_sequence|note_numbers)\\\\?["']?\\s*:\\s*\\[\\s*${MIDI_NO}(?:\\s*,\\s*${MIDI_NO}){3,}(?![\\d.])`,
  "g",
);
const NOTE_FIELD = new RegExp(
  `\\\\?["']?(?:pitch|note|midi|midi_note|midiNote)\\\\?["']?\\s*:\\s*${MIDI_NO}(?![\\d.])`,
  "g",
);
const MIDI_NUMBER = /\d{1,3}/g;
const MEASURE_KEYS =
  "f0_hz|f0|pitch_hz|ref_hz|measured_hz|detected_hz|cents_from_target|cents_mean|cents_median|cents_sd|cents_swift|onset_ms|onset_s|onset_sec|timing_offset_ms|onset_delta_ms";
const MEASURE_FIELD = new RegExp(`\\\\?["']?(?:${MEASURE_KEYS})\\\\?["']?\\s*:\\s*-?\\d`, "g");
const MEASURE_KEY = new RegExp(`^(?:${MEASURE_KEYS})$`);

/** Whether an object key names a take measurement (see MEASURE_KEYS). */
export function isMeasureKey(k: string): boolean {
  return MEASURE_KEY.test(k);
}

export function emptyIndicators(): NoteIndicators {
  return {
    handTokens: 0,
    pitchRunNotes: 0,
    quotedRunNotes: 0,
    remiPitchTokens: 0,
    abcBlocks: 0,
    svgRects: 0,
    midiArrayNotes: 0,
    noteFields: 0,
    events: 0,
    measureFields: 0,
  };
}

function addInto(a: NoteIndicators, b: NoteIndicators): void {
  for (const k of Object.keys(a) as (keyof NoteIndicators)[]) a[k] += b[k];
}

/** Note-bearing units: the sum the floor is applied to. An ABC tune counts 4. */
export function noteUnits(i: NoteIndicators): number {
  return (
    i.handTokens +
    i.pitchRunNotes +
    i.quotedRunNotes +
    i.remiPitchTokens +
    4 * i.abcBlocks +
    i.svgRects +
    i.midiArrayNotes +
    i.noteFields +
    i.events
  );
}

function countIn(rx: RegExp, s: string): RegExpMatchArray[] {
  return [...s.matchAll(rx)];
}

/** Count note-bearing units in a string. */
export function countNoteIndicators(s: string): NoteIndicators {
  const c = emptyIndicators();
  const hand = countIn(HAND_TOKEN, s);
  c.handTokens = hand.filter((m) => !m[0].startsWith("R:")).length;
  // Pitch names inside hand tokens are not counted again as a run.
  const rest = hand.length ? s.replace(HAND_TOKEN, " ") : s;
  for (const m of countIn(PITCH_RUN, rest)) c.pitchRunNotes += (m[0].match(PITCH_ONLY) ?? []).length;
  for (const m of countIn(QUOTED_RUN, s)) c.quotedRunNotes += (m[0].match(PITCH_ONLY) ?? []).length;
  c.remiPitchTokens = countIn(REMI_PITCH, s).length;
  c.abcBlocks = countIn(ABC_TUNE, s).length;
  if (s.includes("<svg")) c.svgRects = countIn(SVG_RECT, s).length;
  for (const m of countIn(MIDI_ARRAY, s)) {
    const nums = m[0].slice(m[0].indexOf("[")).match(MIDI_NUMBER) ?? [];
    c.midiArrayNotes += nums.length;
  }
  c.noteFields = countIn(NOTE_FIELD, s).length;
  c.measureFields = countIn(MEASURE_FIELD, s).length;
  return c;
}

/** A key that places an event in time: t, t_sec, t0, onset, start, beat, measure, tick, dur… */
const TIME_KEY = /^(?:t(?:$|_|\d)|time|onset|start|beat|measure|bar(?:$|_)|tick|dur|position|window)/i;

export function isNoteEvent(o: Record<string, unknown>): boolean {
  const pitched = ["note", "midi", "pitch"].some((k) => {
    const v = o[k];
    return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 127;
  });
  return pitched && Object.keys(o).some((k) => TIME_KEY.test(k));
}

// ─── Attribution ─────────────────────────────────────────────────────────────

/** Fields whose value names a song. */
const SONG_FIELDS = ["songId", "song_id", "songID", "song_slug", "song"];
/** Fields whose value is an id that starts with a song id ("song:m001-004:…"). */
const ID_FIELDS = [
  "itemId",
  "item_id",
  "id",
  "record_id",
  "recordId",
  "promptId",
  "prompt_id",
  "targetId",
  "target_id",
  "record_ref",
  "recordRef",
  "sourceRecordId",
  "source_record_id",
  "key",
  "record",
];
/**
 * A v0 window record id: "<song>:m<NNN>-<NNN>:<instrument>:<task>:v<N>".
 * Training lines append a suffix ("…:v1::ground::s6"); the match is the record.
 */
const V0_RECORD_ID = /^([a-z0-9-]+):m\d{3}-\d{3}:[a-z0-9-]+:[a-z0-9-]+:v\d+/;

/** What a finding is keyed to. */
export interface KeyContext {
  /** One song id, or several joined by "|". */
  songKey: string;
  /** The v0 window record id the content hangs off, when there is one. */
  recordId?: string;
}

export interface ScanContext {
  /** Every library song id, in the library's spelling. */
  songIds: ReadonlySet<string>;
  /**
   * Ids of record-shaped objects in the tree (see `isEvidencedRecordShape`).
   * Content under such an id is judged by that record's own evidence.
   */
  recordIds?: ReadonlySet<string>;
}

export function songKeyOf(value: string, songIds: ReadonlySet<string>): string | null {
  if (songIds.has(value)) return value;
  const parts = value.split("|").map((p) => p.split(":")[0]);
  if (parts.length > 1 && parts.every((p) => songIds.has(p))) return parts.join("|");
  const base = value.split(":")[0];
  return songIds.has(base) ? base : null;
}

/** Objects that describe their parent rather than hold content: a training line's `_meta`. */
const META_FIELDS = ["_meta", "meta", "metadata"];

export function contextOf(o: Record<string, unknown>, sc: ScanContext): KeyContext | null {
  const own = ownContextOf(o, sc);
  if (own?.recordId) return own;
  for (const k of META_FIELDS) {
    const m = o[k];
    if (m && typeof m === "object" && !Array.isArray(m)) {
      const meta = ownContextOf(m as Record<string, unknown>, sc);
      if (meta) {
        const songKey = own?.songKey ?? meta.songKey;
        return meta.recordId ? { songKey, recordId: meta.recordId } : { songKey };
      }
    }
  }
  return own;
}

function ownContextOf(o: Record<string, unknown>, sc: ScanContext): KeyContext | null {
  const { songIds } = sc;
  let songKey: string | null = null;
  let recordId: string | undefined;
  for (const k of SONG_FIELDS) {
    const v = o[k];
    if (typeof v === "string") {
      songKey = songKeyOf(v, songIds);
      if (songKey) break;
    }
  }
  const scope = o.scope as { song_id?: unknown } | undefined;
  if (!songKey && scope && typeof scope.song_id === "string") songKey = songKeyOf(scope.song_id, songIds);
  for (const k of ID_FIELDS) {
    const v = o[k];
    if (typeof v !== "string") continue;
    const rec = V0_RECORD_ID.exec(v);
    const canonical = rec ? rec[0] : v;
    if (sc.recordIds?.has(canonical)) recordId ??= canonical;
    // A v0 window id whose record is not in the tree still names a record,
    // and judge() fails it closed.
    else if (rec && songIds.has(rec[1])) recordId ??= canonical;
    if (!songKey) songKey = songKeyOf(v, songIds);
  }
  if (!songKey) return null;
  return recordId ? { songKey, recordId } : { songKey };
}

/**
 * A jam-actions-v0 window record: one library song in `scope.song_id` and, in
 * `observation.midi_sidecar.midi_sha256`, the hash of the library file it was
 * cut from. The evidence gate can judge such a record on its own, sidecar
 * included. Acoustic and v1 records are not this shape on purpose: their
 * sidecar hashes a reduction or a take, not the library file
 * (published-evidence.test.ts), so they are judged by song.
 */
export function isEvidencedRecordShape(o: unknown, songIds: ReadonlySet<string>): o is SourceRecord {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const r = o as {
    id?: unknown;
    schema_version?: unknown;
    scope?: { song_id?: unknown };
    observation?: { midi_sidecar?: { midi_sha256?: unknown } };
  };
  return (
    typeof r.id === "string" &&
    typeof r.schema_version === "string" &&
    r.schema_version.startsWith("jam-actions-v0/") &&
    typeof r.scope?.song_id === "string" &&
    songIds.has(r.scope.song_id) &&
    typeof r.observation?.midi_sidecar?.midi_sha256 === "string"
  );
}

const WORD_CHAR = /[A-Za-z0-9]/;
const QUOTES = new Set(['"', "'", "`"]);

/**
 * Whether the text at `i` names song `id` as an identifier. A hyphenated id
 * ("all-the-things-you-are") only needs word boundaries. A one-word id is an
 * English word too ("wave", "respect", "misty"), so it counts only in
 * identifier form: quoted ("wave"), a path segment (/wave.json, /wave/), or
 * the head of a record or file id (wave:m001…, wave-m001…).
 */
function isIdMention(s: string, i: number, id: string): boolean {
  const before = i === 0 ? "" : s[i - 1];
  const after = s[i + id.length] ?? "";
  if (WORD_CHAR.test(before) || WORD_CHAR.test(after)) return false;
  if (before === "-" || (after === "-" && !/^-m\d/.test(s.slice(i + id.length, i + id.length + 3)))) return false;
  if (id.includes("-")) return true;
  if (QUOTES.has(before) && after === before) return true;
  if (before === "/" && (after === "." || after === "/")) return true;
  const tail = s.slice(i + id.length, i + id.length + 4);
  return /^(?::m\d|-m\d)/.test(tail);
}

/** Positions at which `s` names a library song id. */
export function songIdMentions(s: string, songIds: ReadonlySet<string>): { id: string; at: number }[] {
  const out: { id: string; at: number }[] = [];
  for (const id of songIds) {
    let from = 0;
    for (;;) {
      const i = s.indexOf(id, from);
      if (i < 0) break;
      if (isIdMention(s, i, id)) out.push({ id, at: i });
      from = i + id.length;
    }
  }
  // "nuvole-bianche" is inside "nuvole-bianche-na": keep the longer.
  return out.filter((a) => !out.some((b) => b !== a && b.id.includes(a.id) && b.at <= a.at && a.at < b.at + b.id.length));
}

/** Song ids named in a string, each once. */
export function mentionedSongIds(s: string, songIds: ReadonlySet<string>): string[] {
  return [...new Set(songIdMentions(s, songIds).map((m) => m.id))];
}

/** One file's note-level content for one key. */
export interface KeyedNotes {
  songKey: string;
  recordId?: string;
  indicators: NoteIndicators;
  /** Where it sits: JSON path, "line N", or "file". At most 5 are kept. */
  where: string[];
}

class Acc {
  readonly byKey = new Map<string, KeyedNotes>();
  add(ctx: KeyContext, ind: NoteIndicators, where: string): void {
    const key = ctx.recordId ? `${ctx.songKey}@${ctx.recordId}` : ctx.songKey;
    let e = this.byKey.get(key);
    if (!e) {
      e = { songKey: ctx.songKey, indicators: emptyIndicators(), where: [] };
      if (ctx.recordId) e.recordId = ctx.recordId;
      this.byKey.set(key, e);
    }
    addInto(e.indicators, ind);
    if (e.where.length < 5 && !e.where.includes(where)) e.where.push(where);
  }
}

function hasUnits(i: NoteIndicators): boolean {
  return noteUnits(i) > 0 || i.measureFields > 0;
}

/** A tab-separated snapshot line keyed by its first field: "<song>\tm12\t…". */
export function tsvLead(s: string, songIds: ReadonlySet<string>): string | null {
  const tab = s.indexOf("\t");
  return tab > 0 && songIds.has(s.slice(0, tab)) ? s.slice(0, tab) : null;
}

const PITCH_NAME = new RegExp(`^${RUN_PITCH}$`);
const MIDI_ARRAY_KEY = /^(?:pitches|notes|midi|midi_notes|melody|pitch_seq|pitch_sequence|note_numbers)$/;

/** A parsed array that is itself note content: 4+ pitch names, or 4+ MIDI numbers under a note key. */
export function arrayIndicators(arr: unknown[], key: string): NoteIndicators | null {
  if (arr.length < 4) return null;
  if (arr.every((x) => typeof x === "string" && PITCH_NAME.test(x))) {
    return { ...emptyIndicators(), quotedRunNotes: arr.length };
  }
  if (MIDI_ARRAY_KEY.test(key) && arr.every((x) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 127)) {
    return { ...emptyIndicators(), midiArrayNotes: arr.length };
  }
  return null;
}

function walkJson(
  node: unknown,
  ctx: KeyContext | null,
  where: string,
  acc: Acc,
  sc: ScanContext,
  fallback: KeyContext | null,
  key = "",
): void {
  if (Array.isArray(node)) {
    const ind = arrayIndicators(node, key);
    if (ind) {
      const target = ctx ?? fallback;
      if (target) acc.add(target, ind, where);
      return;
    }
    node.forEach((x, i) => walkJson(x, ctx, `${where}[${i}]`, acc, sc, fallback, key));
    return;
  }
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    const own = contextOf(o, sc);
    const here = own ?? ctx;
    if (isNoteEvent(o)) {
      const target = here ?? fallback;
      if (target) acc.add(target, { ...emptyIndicators(), events: 1 }, where);
    }
    const measured = Object.entries(o).filter(([k, v]) => MEASURE_KEY.test(k) && typeof v === "number").length;
    if (measured) {
      const target = here ?? fallback;
      if (target) acc.add(target, { ...emptyIndicators(), measureFields: measured }, where);
    }
    for (const [k, v] of Object.entries(o)) {
      const keyed = songKeyOf(k, sc.songIds);
      walkJson(v, keyed ? { songKey: keyed } : here, `${where}.${k}`, acc, sc, fallback, k);
    }
    return;
  }
  if (typeof node === "string" && node.length >= 4) {
    const ind = countNoteIndicators(node);
    if (!hasUnits(ind)) return;
    const lead = tsvLead(node, sc.songIds);
    let target: KeyContext | null = lead ? { songKey: lead } : ctx;
    if (!target) {
      const named = mentionedSongIds(node, sc.songIds);
      if (named.length) target = { songKey: named.join("|") };
    }
    target ??= fallback;
    if (target) acc.add(target, ind, where);
  }
}

/** Song ids a path names; the longest wins where one contains another. */
export function pathSongIds(path: string, songIds: ReadonlySet<string>): string[] {
  return mentionedSongIds(path, songIds);
}

function pathFallback(path: string, sc: ScanContext): KeyContext | null {
  const named = pathSongIds(path, sc.songIds);
  return named.length === 1 ? { songKey: named[0] } : null;
}

const NOTE_MATCHERS: [keyof NoteIndicators, RegExp][] = [
  ["handTokens", HAND_TOKEN],
  ["pitchRunNotes", PITCH_RUN],
  ["quotedRunNotes", QUOTED_RUN],
  ["remiPitchTokens", REMI_PITCH],
  ["abcBlocks", ABC_TUNE],
  ["midiArrayNotes", MIDI_ARRAY],
  ["noteFields", NOTE_FIELD],
  ["measureFields", MEASURE_FIELD],
];

/** Look this far back (and a little ahead) for the id a note match belongs to. */
const WINDOW_BEFORE = 2000;
const WINDOW_AFTER = 200;

function scanPlainText(text: string, path: string, acc: Acc, sc: ScanContext): void {
  const fallback = pathFallback(path, sc);
  if (/\.svg$/i.test(path) || text.trimStart().startsWith("<svg")) {
    const ind = countNoteIndicators(text);
    if (!hasUnits(ind)) return;
    const named = mentionedSongIds(text, sc.songIds);
    const target = fallback ?? (named.length ? { songKey: named.join("|") } : null);
    if (target) acc.add(target, ind, "file");
    return;
  }
  // Positions of every song id mention, for nearest-id attribution.
  const mentions = songIdMentions(text, sc.songIds);
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (pos: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const handSpans: [number, number][] = [];
  for (const [kind, rx] of NOTE_MATCHERS) {
    for (const m of text.matchAll(rx)) {
      const at = m.index ?? 0;
      if (kind === "pitchRunNotes" && handSpans.some(([a, b]) => at >= a && at < b)) continue;
      if (kind === "handTokens") {
        handSpans.push([at, at + m[0].length]);
        if (m[0].startsWith("R:")) continue;
      }
      const ind = emptyIndicators();
      if (kind === "handTokens" || kind === "remiPitchTokens" || kind === "noteFields" || kind === "measureFields") ind[kind] = 1;
      else if (kind === "abcBlocks") ind.abcBlocks = 1;
      else if (kind === "midiArrayNotes") ind.midiArrayNotes = (m[0].slice(m[0].indexOf("[")).match(MIDI_NUMBER) ?? []).length;
      else ind[kind] = (m[0].match(PITCH_ONLY) ?? []).length;
      let best: { id: string; d: number } | null = null;
      for (const mm of mentions) {
        if (mm.at > at + WINDOW_AFTER || mm.at < at - WINDOW_BEFORE) continue;
        // Prefer an id before the match: a heading or an object's id field.
        const d = mm.at <= at ? at - mm.at : 3 * (mm.at - at);
        if (!best || d < best.d) best = { id: mm.id, d };
      }
      const target = best ? { songKey: best.id } : fallback;
      if (target) acc.add(target, ind, `line ${lineOf(at)}`);
    }
  }
}

/**
 * Note-level content in one file, grouped by what it is keyed to. `text` is
 * the file's content (already gunzipped for .gz). Unkeyed content is dropped:
 * the guard is about content tied to a song.
 */
export function scanFileText(path: string, text: string, sc: ScanContext): KeyedNotes[] {
  const acc = new Acc();
  const fallback = pathFallback(path, sc);
  const lower = path.toLowerCase();
  const isJsonl = lower.endsWith(".jsonl") || lower.endsWith(".jsonl.gz") || lower.endsWith(".log.gz");
  if (lower.endsWith(".json")) {
    let parsed: unknown;
    let ok = true;
    try {
      parsed = JSON.parse(text);
    } catch {
      ok = false;
    }
    if (ok) walkJson(parsed, null, "$", acc, sc, fallback);
    else scanPlainText(text, path, acc, sc);
  } else if (isJsonl || lower.endsWith(".log")) {
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      let obj: unknown;
      try {
        obj = JSON.parse(line);
      } catch {
        const sub = new Acc();
        scanPlainText(line, path, sub, sc);
        for (const e of sub.byKey.values()) acc.add(e.recordId ? { songKey: e.songKey, recordId: e.recordId } : { songKey: e.songKey }, e.indicators, `line ${i + 1}`);
        return;
      }
      const named = mentionedSongIds(line, sc.songIds);
      const lineFallback = named.length ? { songKey: named.join("|") } : fallback;
      walkJson(obj, null, `line ${i + 1}`, acc, sc, lineFallback);
    });
  } else {
    scanPlainText(text, path, acc, sc);
  }
  return [...acc.byKey.values()].filter((e) => hasUnits(e.indicators));
}

// ─── Findings ────────────────────────────────────────────────────────────────

/** Why content is not cleared. */
export type FindingRule =
  /** keyed to a song the evidence gate does not clear */
  | "uncleared-song"
  /** keyed to a v0 window record that is absent or fails evidenceRefusal */
  | "unevidenced-record"
  /** a MIDI file whose bytes are no song's evidenced file */
  | "unevidenced-midi";

export interface Finding {
  path: string;
  songKey: string;
  recordId?: string;
  rule: FindingRule;
  /**
   * note-level when note units reach NOTE_UNIT_FLOOR, else measurement-level.
   * A MIDI file is always note-level: it is an arrangement, whatever it holds.
   */
  level: "note-level" | "measurement-level";
  reason: string;
  /** Note units, or measurement fields for a measurement-level finding. */
  units: number;
  indicators: NoteIndicators;
  where: string[];
}

export interface JudgeContext extends ScanContext {
  clearance: ReadonlyMap<string, SongClearance>;
  evidence: ReadonlyMap<string, LibraryEvidence>;
  /** v0 window records present in the tree, by id. */
  records: ReadonlyMap<string, SourceRecord>;
}

/**
 * Turn one file's keyed notes into findings for keys that are not cleared.
 * In a data file (isDataPath) one note unit makes a note-level finding and
 * one measurement field a measurement-level finding. In prose and code a
 * finding needs NOTE_UNIT_FLOOR note units, and measurements are not judged.
 */
export function judge(path: string, keyed: KeyedNotes[], jc: JudgeContext): Finding[] {
  const out: Finding[] = [];
  // A data file is what a model or a script reads, so any note or measurement
  // it keys to an uncleared song counts, however sparse. Prose and code quote
  // music to explain it: there a finding needs NOTE_UNIT_FLOOR note units, so
  // a named chord or a single pitch is commentary, and measured values quoted
  // in prose are not findings at all.
  const isData = isDataPath(path);
  const noteFloor = isData ? 1 : NOTE_UNIT_FLOOR;
  for (const k of keyed) {
    const notes = noteUnits(k.indicators);
    const level =
      notes >= noteFloor
        ? "note-level"
        : isData && k.indicators.measureFields >= 1
          ? "measurement-level"
          : null;
    if (!level) continue;
    const units = level === "note-level" ? notes : k.indicators.measureFields;
    const uncleared = k.songKey.split("|").filter((id) => !(jc.clearance.get(id)?.cleared ?? false));
    if (uncleared.length) {
      const reasons = uncleared.map((id) => `${id}: ${jc.clearance.get(id)?.refusal ?? "no library provenance block"}`);
      out.push({
        path,
        songKey: k.songKey,
        ...(k.recordId ? { recordId: k.recordId } : {}),
        rule: "uncleared-song",
        level,
        reason: reasons.join("; "),
        units,
        indicators: k.indicators,
        where: k.where,
      });
      continue;
    }
    if (k.recordId) {
      const rec = jc.records.get(k.recordId);
      const refusal = rec
        ? evidenceRefusal(rec, jc.evidence)
        : `record ${k.recordId} is not in the tree, so the file it was built from cannot be matched to the evidence`;
      if (refusal) {
        out.push({
          path,
          songKey: k.songKey,
          recordId: k.recordId,
          rule: "unevidenced-record",
          level,
          reason: refusal,
          units,
          indicators: k.indicators,
          where: k.where,
        });
      }
    }
  }
  return out;
}

// ─── MIDI files ──────────────────────────────────────────────────────────────
//
// A MIDI file is an arrangement note for note, so it is judged whole, by its
// bytes. It is cleared only when its sha256 is the `midi_sha256` of a song the
// gate clears: exactly the file that song's provenance block describes. Any
// other bytes are a finding, whatever the file is called. That covers the
// library files of uncleared songs, a superseded file of a cleared song (the
// pre-Mutopia Satie and Debussy bytes), and MIDI saved under another name.

const MIDI_NAME = /\.(mid|midi|kar|rmi|smf)$/i;

/** Whether a file is MIDI: by its name, or by its header whatever the name. */
export function isMidiFile(path: string, bytes: Uint8Array): boolean {
  if (MIDI_NAME.test(path)) return true;
  const tag = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4));
  // a Standard MIDI File, or one wrapped in RIFF (.rmi)
  return tag(0) === "MThd" || (tag(0) === "RIFF" && tag(8) === "RMID");
}

/**
 * Note-on events in a Standard MIDI File, or null when the bytes are not a
 * whole one. midi-file accepts a bare "MThd" or a header whose tracks are
 * missing, so the header's track count must match the tracks read.
 */
export function midiNoteOns(bytes: Uint8Array): number | null {
  try {
    const midi = parseMidi(bytes);
    if (!midi.header.numTracks || midi.tracks.length !== midi.header.numTracks) return null;
    return midi.tracks.reduce((n, track) => n + track.filter((e) => e.type === "noteOn").length, 0);
  } catch {
    return null;
  }
}

/** The song a MIDI file's name claims ("…/satie-gymnopedie-no1.mid"), if it names one. */
function songNamedBy(path: string, songIds: ReadonlySet<string>): string | null {
  const base = (path.split("/").pop() ?? path).replace(/\.gz$/i, "").replace(MIDI_NAME, "");
  return songIds.has(base) ? base : null;
}

/**
 * Judge one MIDI file by its bytes. It passes when they are a cleared song's
 * evidenced file. Bytes that are an uncleared song's evidenced file are keyed
 * to that song; bytes that are no song's evidenced file are keyed to the song
 * the file name claims, or to the file name.
 */
export function judgeMidi(path: string, bytes: Uint8Array, jc: JudgeContext): Finding[] {
  const sha = createHash("sha256").update(bytes).digest("hex");
  const owners = [...jc.evidence.values()].filter((ev) => ev.midiSha256 === sha).map((ev) => ev.songId);
  if (owners.some((id) => jc.clearance.get(id)?.cleared ?? false)) return [];
  const noteOns = midiNoteOns(bytes);
  const base = {
    path,
    level: "note-level" as const,
    units: noteOns ?? 0,
    indicators: { ...emptyIndicators(), events: noteOns ?? 0 },
    where: [
      `sha256 ${sha.slice(0, 12)}…`,
      noteOns === null ? "does not parse as a Standard MIDI File" : `${noteOns} note-on events`,
    ],
  };
  if (owners.length) {
    return [
      {
        ...base,
        songKey: owners.join("|"),
        rule: "uncleared-song",
        reason: owners.map((id) => `${id}: ${jc.clearance.get(id)?.refusal ?? "no library provenance block"}`).join("; "),
      },
    ];
  }
  const named = songNamedBy(path, jc.songIds);
  const ev = named ? [...jc.evidence.values()].find((e) => e.songId === named) : undefined;
  const theirs = ev ? `; ${ev.songId}'s evidenced file is ${ev.midiSha256.slice(0, 12)}… (${ev.path})` : "";
  return [
    {
      ...base,
      songKey: named ?? (path.split("/").pop() ?? path),
      rule: "unevidenced-midi",
      reason: `the bytes are no song's evidenced MIDI file${theirs}`,
    },
  ];
}

