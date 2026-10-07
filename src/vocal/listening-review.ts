// ─── The listening review: marks, sessions, loudness and catch trials ─────────
//
// The pure half of the cockpit's Review mode (apps/cockpit/src/review.ts). A
// person plays a sung mix and presses M wherever something sounds wrong; each
// mark carries who made it, at what level, and the session it was made in. A
// session records the listening conditions that cannot be held fixed (device,
// the volume the listener set), so a person's ear becomes a measured instrument
// rather than a fixed one. Catch trials — planted defects and sham edits from
// the planter (scripts/planter.py) — are scored here: hits, misses, and false
// alarms on shams, per defect kind and severity.
//
// The bundle is what `scripts/review_marks.py page` writes as review.json, and
// the export is the format `review_marks.py report` reads, so the cockpit and
// the report share one schema. The design is the planted-defects program,
// research-and-development (rnd) v1.1.1.0.1.

/** Must equal SCHEMA in scripts/review_marks.py. */
export const REVIEW_SCHEMA = "ai-jam-sessions/review-marks/v1";

/** Integrated loudness every source is played at. EBU R128's broadcast target:
 * quiet enough that the peak cap below rarely engages on a gain-staged mix, and
 * the level check plays at the same loudness, so the volume the listener sets
 * for the check is the volume they review at. */
export const TARGET_LUFS = -23;

/** Playback never drives a sample past this, whatever the loudness asks for. */
export const PEAK_CEILING = 0.98;

export type ReviewerLevel = "listener" | "musician" | "professional" | "model";
export type Device = "headphones" | "speakers" | "laptop";

export interface Reviewer {
  name: string;
  level: ReviewerLevel;
}

export interface ReviewSyllable {
  start: number;
  end: number;
  lyric: string;
  word: string;
  take: string;
}

export interface ReviewJoin {
  t: number;
  switch: boolean;
}

export interface ReviewEntry {
  key: string;
  song: string;
  variant: string;
  duration: number;
  files: { mix: string; vocal: string };
  peaks: number[];
  syllables: ReviewSyllable[];
  joins: ReviewJoin[];
  phrases: { start: number; end: number; take?: string | null }[];
  placement?: string;
}

export interface ReviewBundle {
  schema: string;
  categories: string[];
  levels: Record<string, string>;
  before: number;
  after: number;
  entries: ReviewEntry[];
}

export interface ReviewMark {
  id: string;
  t: number;
  cats: string[];
  note: string;
  at: string;
  by: Reviewer;
  session: string | null;
}

export interface ListeningConditions {
  device: Device;
  /** When the listener confirmed the level check at TARGET_LUFS; null = never. */
  levelSetAt: string | null;
  targetLufs: number;
}

export interface ReviewSession {
  id: string;
  startedAt: string;
  reviewer: Reviewer;
  conditions: ListeningConditions;
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: string; message: string; hint: string };

const LEVELS: readonly ReviewerLevel[] = ["listener", "musician", "professional", "model"];
const DEVICES: readonly Device[] = ["headphones", "speakers", "laptop"];

export const DEVICE_LABELS: Record<Device, string> = {
  headphones: "Headphones",
  speakers: "Speakers",
  laptop: "Laptop or phone speaker",
};

export const CATEGORY_LABELS: Record<string, string> = {
  stutter: "Stutter / repeat",
  click: "Click / pop",
  word: "Wrong or slurred word",
  pitch: "Off pitch",
  timing: "Early / late",
  level: "Volume jump",
  tone: "Voice changes",
  noise: "Breath / noise",
  other: "Other",
};

export function isLevel(x: unknown): x is ReviewerLevel {
  return typeof x === "string" && (LEVELS as readonly string[]).includes(x);
}

export function isDevice(x: unknown): x is Device {
  return typeof x === "string" && (DEVICES as readonly string[]).includes(x);
}

function fail<T>(code: string, message: string, hint: string): Result<T> {
  return { ok: false, code, message, hint };
}

const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Validates review.json. Untrusted input: every field the UI reads is checked. */
export function parseBundle(raw: unknown): Result<ReviewBundle> {
  const hint = "Build it with: python scripts/review_marks.py page --run <run> --variant <pick> --out <folder>";
  if (!raw || typeof raw !== "object") return fail("REVIEW_NOT_OBJECT", "review.json is not a JSON object.", hint);
  const b = raw as Record<string, unknown>;
  if (b.schema !== REVIEW_SCHEMA) {
    return fail("REVIEW_SCHEMA", `review.json has schema ${JSON.stringify(b.schema)}, expected ${REVIEW_SCHEMA}.`, hint);
  }
  if (!Array.isArray(b.entries) || b.entries.length === 0) return fail("REVIEW_NO_ENTRIES", "review.json lists no mixes.", hint);
  if (!num(b.before) || !num(b.after)) return fail("REVIEW_WINDOW", "review.json has no mark window (before/after).", hint);
  const entries: ReviewEntry[] = [];
  for (const [i, e] of (b.entries as unknown[]).entries()) {
    const r = e as Record<string, unknown> | null;
    const files = r?.files as Record<string, unknown> | undefined;
    if (!r || typeof r.key !== "string" || !num(r.duration) || r.duration <= 0
        || typeof files?.mix !== "string" || typeof files?.vocal !== "string"
        || !Array.isArray(r.syllables) || !Array.isArray(r.joins)) {
      return fail("REVIEW_ENTRY", `Mix ${i + 1} in review.json is missing its key, duration, files, syllables or joins.`, hint);
    }
    entries.push({
      key: r.key,
      song: typeof r.song === "string" ? r.song : r.key,
      variant: typeof r.variant === "string" ? r.variant : "",
      duration: r.duration,
      files: { mix: files.mix as string, vocal: files.vocal as string },
      peaks: Array.isArray(r.peaks) ? (r.peaks as unknown[]).filter(num) : [],
      syllables: (r.syllables as ReviewSyllable[]).filter((s) => num(s?.start) && num(s?.end)),
      joins: (r.joins as ReviewJoin[]).filter((j) => num(j?.t)),
      phrases: Array.isArray(r.phrases) ? (r.phrases as ReviewEntry["phrases"]).filter((p) => num(p?.start) && num(p?.end)) : [],
      placement: typeof r.placement === "string" ? r.placement : undefined,
    });
  }
  const categories = Array.isArray(b.categories) ? (b.categories as unknown[]).filter((c): c is string => typeof c === "string") : [];
  const levels = b.levels && typeof b.levels === "object" ? (b.levels as Record<string, string>) : {};
  return { ok: true, value: { schema: REVIEW_SCHEMA, categories, levels, before: b.before, after: b.after, entries } };
}

// ─── Marks ───────────────────────────────────────────────────────────────────

export function newMark(t: number, by: Reviewer, session: string | null, now: Date, id: string): ReviewMark {
  return { id, t: round3(t), cats: [], note: "", at: now.toISOString(), by: { ...by }, session };
}

const round3 = (t: number) => Math.round(t * 1000) / 1000;

export function addMark(marks: readonly ReviewMark[], m: ReviewMark): ReviewMark[] {
  return [...marks, m].sort((a, b) => a.t - b.t);
}

export function updateMark(marks: readonly ReviewMark[], id: string, fn: (m: ReviewMark) => ReviewMark): ReviewMark[] {
  return marks.map((m) => (m.id === id ? fn({ ...m, cats: [...m.cats], by: { ...m.by } }) : m)).sort((a, b) => a.t - b.t);
}

export function nudgeMark(marks: readonly ReviewMark[], id: string, dt: number, duration: number): ReviewMark[] {
  return updateMark(marks, id, (m) => ({ ...m, t: round3(Math.min(duration, Math.max(0, m.t + dt))) }));
}

export function toggleCategory(marks: readonly ReviewMark[], id: string, cat: string): ReviewMark[] {
  return updateMark(marks, id, (m) => ({ ...m, cats: m.cats.includes(cat) ? m.cats.filter((c) => c !== cat) : [...m.cats, cat] }));
}

export function removeMark(marks: readonly ReviewMark[], id: string): ReviewMark[] {
  return marks.filter((m) => m.id !== id);
}

/** What was sung in a mark's window: the words, the takes, and any switch between takes. */
export function markContext(entry: ReviewEntry, t: number, before: number, after: number): string {
  const lo = t - before;
  const hi = t + after;
  const syl = entry.syllables.filter((s) => s.end > lo && s.start < hi);
  if (!syl.length) return "between phrases";
  const words: string[] = [];
  for (const s of syl) if (words[words.length - 1] !== s.word) words.push(s.word);
  const takes = [...new Set(syl.map((s) => s.take))].join(", ");
  const sw = entry.joins.filter((j) => j.switch && j.t >= lo - 0.25 && j.t <= hi + 0.25).length;
  return `“${words.join(" ")}” · ${takes}` + (sw ? ` · ${sw === 1 ? "a switch" : `${sw} switches`} between takes` : "");
}

export function syllableAt(entry: ReviewEntry, t: number): ReviewSyllable | undefined {
  return entry.syllables.find((s) => s.start <= t && t < s.end);
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/** A session can start only once the listener has said what they are listening on
 * and confirmed the level check: those are what make their marks comparable. */
export function sessionBlocker(reviewer: Reviewer, device: Device | null, levelSetAt: string | null): string | null {
  if (!reviewer.name.trim()) return "Enter your name.";
  if (!device) return "Choose what you are listening on.";
  if (!levelSetAt) return "Play the level check and set a comfortable volume.";
  return null;
}

export function startSession(reviewer: Reviewer, device: Device, levelSetAt: string, now: Date, id: string): ReviewSession {
  return {
    id,
    startedAt: now.toISOString(),
    reviewer: { name: reviewer.name.trim(), level: reviewer.level },
    conditions: { device, levelSetAt, targetLufs: TARGET_LUFS },
  };
}

export interface ReviewExport {
  schema: string;
  exported_at: string;
  reviewer: Reviewer;
  sessions: ReviewSession[];
  entries: Record<string, { song: string; variant: string; marks: ReviewMark[] }>;
}

/** The download: what `review_marks.py report --marks` reads (entries.<key>.marks),
 * plus the sessions each mark points to. Mixes with no marks are left out. */
export function exportMarks(
  bundle: ReviewBundle,
  store: Record<string, ReviewMark[]>,
  reviewer: Reviewer,
  sessions: readonly ReviewSession[],
  now: Date,
): ReviewExport {
  const entries: ReviewExport["entries"] = {};
  const used = new Set<string>();
  for (const e of bundle.entries) {
    const ms = store[e.key] ?? [];
    if (!ms.length) continue;
    entries[e.key] = { song: e.song, variant: e.variant, marks: ms.map((m) => ({ ...m })) };
    for (const m of ms) if (m.session) used.add(m.session);
  }
  return {
    schema: REVIEW_SCHEMA,
    exported_at: now.toISOString(),
    reviewer: { ...reviewer },
    sessions: sessions.filter((s) => used.has(s.id)),
    entries,
  };
}

// ─── Loudness (ITU-R BS.1770-4 integrated loudness, EBU R128 gating) ─────────

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

/** The two K-weighting stages for any sample rate (the coefficients libebur128 derives). */
export function kWeighting(sr: number): [Biquad, Biquad] {
  let K = Math.tan((Math.PI * 1681.974450955533) / sr);
  const Q1 = 0.7071752369554196;
  const Vh = 10 ** (3.999843853973347 / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q1 + K * K;
  const shelf = {
    b0: (Vh + (Vb * K) / Q1 + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q1 + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q1 + K * K) / a0,
  };
  K = Math.tan((Math.PI * 38.13547087602444) / sr);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  const highpass = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q2 + K * K) / a0 };
  return [shelf, highpass];
}

function filter(x: ArrayLike<number>, f: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const out = f.b0 * v + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = out;
    y[i] = out;
  }
  return y;
}

/** Integrated loudness in LUFS of one to two channels (left/right weight 1).
 * -Infinity for silence or audio shorter than one 400 ms block. */
export function integratedLoudness(channels: readonly ArrayLike<number>[], sr: number): number {
  const block = Math.round(0.4 * sr);
  const step = Math.round(0.1 * sr);
  const n = Math.min(...channels.map((c) => c.length));
  if (!channels.length || n < block) return -Infinity;
  const [shelf, hp] = kWeighting(sr);
  const weighted = channels.map((c) => filter(filter(c, shelf), hp));
  const power: number[] = [];
  for (let s = 0; s + block <= n; s += step) {
    let z = 0;
    for (const w of weighted) {
      let acc = 0;
      for (let i = s; i < s + block; i++) acc += w[i] * w[i];
      z += acc / block;
    }
    power.push(z);
  }
  const lk = (z: number) => -0.691 + 10 * Math.log10(z);
  const abs = power.filter((z) => z > 0 && lk(z) > -70);
  if (!abs.length) return -Infinity;
  const mean = (zs: number[]) => zs.reduce((a, b) => a + b, 0) / zs.length;
  const relGate = lk(mean(abs)) - 10;
  const rel = abs.filter((z) => lk(z) > relGate);
  return lk(mean(rel));
}

export function peakOf(channels: readonly ArrayLike<number>[]): number {
  let p = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  return p;
}

export interface PlaybackGain {
  gain: number;
  /** The loudness playback actually reaches: below the target when the peak cap engaged. */
  playedLufs: number;
  capped: boolean;
}

/** The gain that plays a source at TARGET_LUFS, capped so no sample passes PEAK_CEILING. */
export function playbackGain(lufs: number, peak: number, target = TARGET_LUFS): PlaybackGain {
  if (!Number.isFinite(lufs) || peak <= 0) return { gain: 1, playedLufs: lufs, capped: false };
  const want = 10 ** ((target - lufs) / 20);
  const cap = PEAK_CEILING / peak;
  const gain = Math.min(want, cap);
  return { gain, playedLufs: lufs + 20 * Math.log10(gain), capped: cap < want };
}

// ─── Catch trials ────────────────────────────────────────────────────────────

/** One row of the planter's labels.jsonl: a 10 s clip with a defect planted at t,
 * a sham edit at t, or nothing. */
export interface CatchClip {
  clip: string;
  kind: string;
  t: number | null;
  severity: number | null;
  present: boolean;
}

export const SHAM = "sham";
export const NONE = "none";

export interface ClipOutcome {
  clip: string;
  kind: string;
  severity: number | null;
  /** planted clips: heard or missed; sham and clean clips: a false alarm, or quiet. */
  outcome: "hit" | "miss" | "false-alarm" | "correct-rejection";
}

/** A mark covers [m - before, m + after]: the press comes after the sound. A planted
 * defect is a hit when any mark covers it; on a sham or a clean clip any mark is a
 * false alarm. Plants the planter could not verify are not scored. */
export function scoreClip(c: CatchClip, marks: readonly { t: number }[], before: number, after: number): ClipOutcome | null {
  const base = { clip: c.clip, kind: c.kind, severity: c.severity };
  if (c.kind === SHAM || c.kind === NONE) return { ...base, outcome: marks.length ? "false-alarm" : "correct-rejection" };
  if (!c.present || c.t === null) return null;
  const t = c.t;
  return { ...base, outcome: marks.some((m) => m.t - before <= t && t <= m.t + after) ? "hit" : "miss" };
}

export interface CatchSummary {
  /** kind -> severity -> {hits, n} */
  planted: Record<string, Record<string, { hits: number; n: number }>>;
  shamFalseAlarms: { n: number; marked: number };
  cleanFalseAlarms: { n: number; marked: number };
}

export function summarizeCatch(outcomes: readonly ClipOutcome[]): CatchSummary {
  const s: CatchSummary = { planted: {}, shamFalseAlarms: { n: 0, marked: 0 }, cleanFalseAlarms: { n: 0, marked: 0 } };
  for (const o of outcomes) {
    if (o.outcome === "hit" || o.outcome === "miss") {
      const sev = String(o.severity);
      const row = ((s.planted[o.kind] ??= {})[sev] ??= { hits: 0, n: 0 });
      row.n++;
      if (o.outcome === "hit") row.hits++;
    } else {
      const fa = o.kind === SHAM ? s.shamFalseAlarms : s.cleanFalseAlarms;
      fa.n++;
      if (o.outcome === "false-alarm") fa.marked++;
    }
  }
  return s;
}
