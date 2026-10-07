import { describe, expect, it } from "vitest";
import {
  PEAK_CEILING,
  REVIEW_SCHEMA,
  TARGET_LUFS,
  addMark,
  exportMarks,
  integratedLoudness,
  isDevice,
  isLevel,
  markContext,
  newMark,
  nudgeMark,
  parseBundle,
  peakOf,
  playbackGain,
  removeMark,
  scoreClip,
  sessionBlocker,
  startSession,
  summarizeCatch,
  syllableAt,
  toggleCategory,
  updateMark,
  type ReviewBundle,
  type ReviewEntry,
  type Reviewer,
} from "./listening-review.js";

const NOW = new Date("2026-10-07T20:00:00Z");
const ME: Reviewer = { name: "Mike", level: "listener" };

const ENTRY: ReviewEntry = {
  key: "amazing-grace:pad16",
  song: "amazing-grace",
  variant: "pad16",
  duration: 30,
  files: { mix: "ag-mix.flac", vocal: "ag-vocal.flac" },
  peaks: [0.1, 0.5],
  syllables: [
    { start: 10.0, end: 10.4, lyric: "A", word: "amazing", take: "take-05" },
    { start: 10.4, end: 10.8, lyric: "ma", word: "amazing", take: "take-05" },
    { start: 10.8, end: 11.3, lyric: "zing", word: "amazing", take: "take-09" },
    { start: 11.3, end: 12.0, lyric: "grace", word: "grace", take: "take-09" },
  ],
  joins: [{ t: 10.8, switch: true }, { t: 10.4, switch: false }],
  phrases: [{ start: 9.5, end: 12.5, take: "take-05" }],
};

const BUNDLE: ReviewBundle = {
  schema: REVIEW_SCHEMA,
  categories: ["stutter", "click"],
  levels: { listener: "Listener" },
  before: 1.0,
  after: 0.2,
  entries: [ENTRY],
};

function sine(hz: number, seconds: number, amp: number, sr = 48000): Float64Array {
  const x = new Float64Array(Math.round(seconds * sr));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * hz * i) / sr);
  return x;
}

describe("parseBundle", () => {
  it("accepts what review_marks.py page writes and keeps only well-formed rows", () => {
    const raw = JSON.parse(JSON.stringify({ ...BUNDLE, entries: [{ ...ENTRY, syllables: [...ENTRY.syllables, { start: "x" }], placement: "local-warp" }] }));
    const r = parseBundle(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.entries[0].syllables).toHaveLength(4);
      expect(r.value.entries[0].placement).toBe("local-warp");
      expect(r.value.categories).toEqual(["stutter", "click"]);
    }
  });

  it("names what is wrong with a bad bundle, with a hint", () => {
    const cases: [unknown, string][] = [
      [null, "REVIEW_NOT_OBJECT"],
      [{ ...BUNDLE, schema: "other/v9" }, "REVIEW_SCHEMA"],
      [{ ...BUNDLE, entries: [] }, "REVIEW_NO_ENTRIES"],
      [{ ...BUNDLE, before: "1" }, "REVIEW_WINDOW"],
      [{ ...BUNDLE, entries: [{ ...ENTRY, files: { mix: "a" } }] }, "REVIEW_ENTRY"],
      [{ ...BUNDLE, entries: [{ ...ENTRY, duration: 0 }] }, "REVIEW_ENTRY"],
    ];
    for (const [raw, code] of cases) {
      const r = parseBundle(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe(code);
        expect(r.hint).toMatch(/review_marks\.py page/);
      }
    }
  });

  it("fills optional fields with safe defaults", () => {
    const { song: _s, variant: _v, peaks: _p, phrases: _ph, ...bare } = ENTRY;
    const r = parseBundle({ schema: REVIEW_SCHEMA, before: 1, after: 0.2, entries: [bare] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const e = r.value.entries[0];
      expect([e.song, e.variant, e.peaks, e.phrases]).toEqual([ENTRY.key, "", [], []]);
      expect(r.value.categories).toEqual([]);
      expect(r.value.levels).toEqual({});
    }
  });
});

describe("marks", () => {
  it("keeps marks in time order and edits copies, never the input", () => {
    const a = newMark(12.3456, ME, "s1", NOW, "a");
    const b = newMark(4.2, ME, "s1", NOW, "b");
    const ms = addMark(addMark([], a), b);
    expect(ms.map((m) => m.id)).toEqual(["b", "a"]);
    expect(a.t).toBe(12.346);
    const moved = nudgeMark(ms, "b", 10, 30);
    expect(moved.map((m) => m.id)).toEqual(["a", "b"]);
    expect(ms[0].t).toBe(4.2);
    expect(nudgeMark(ms, "b", -10, 30).find((m) => m.id === "b")!.t).toBe(0);
    expect(nudgeMark(ms, "a", 100, 30).find((m) => m.id === "a")!.t).toBe(30);
  });

  it("toggles categories, updates notes and removes", () => {
    let ms = addMark([], newMark(5, ME, null, NOW, "a"));
    ms = toggleCategory(ms, "a", "stutter");
    ms = toggleCategory(ms, "a", "click");
    ms = toggleCategory(ms, "a", "stutter");
    expect(ms[0].cats).toEqual(["click"]);
    ms = updateMark(ms, "a", (m) => ({ ...m, note: "Gr-grace" }));
    expect(ms[0].note).toBe("Gr-grace");
    expect(removeMark(ms, "a")).toEqual([]);
    expect(removeMark(ms, "zz")).toHaveLength(1);
  });

  it("says what was sung in the second before the press", () => {
    expect(markContext(ENTRY, 11.0, 1.0, 0.2)).toBe("“amazing” · take-05, take-09 · a switch between takes");
    expect(markContext(ENTRY, 12.2, 1.0, 0.2)).toBe("“amazing grace” · take-09");
    expect(markContext(ENTRY, 25, 1.0, 0.2)).toBe("between phrases");
    const two = { ...ENTRY, joins: [{ t: 10.4, switch: true }, { t: 10.8, switch: true }] };
    expect(markContext(two, 11.0, 1.0, 0.2)).toMatch(/2 switches/);
    expect(syllableAt(ENTRY, 10.5)?.lyric).toBe("ma");
    expect(syllableAt(ENTRY, 20)).toBeUndefined();
  });
});

describe("sessions", () => {
  it("will not start until name, device and level check are given", () => {
    expect(sessionBlocker({ name: " ", level: "listener" }, "headphones", "t")).toMatch(/name/);
    expect(sessionBlocker(ME, null, "t")).toMatch(/listening on/);
    expect(sessionBlocker(ME, "speakers", null)).toMatch(/level check/);
    expect(sessionBlocker(ME, "speakers", "t")).toBeNull();
  });

  it("records the conditions the marks were made under", () => {
    const s = startSession({ name: " Mike ", level: "musician" }, "laptop", "2026-10-07T19:59:00Z", NOW, "s1");
    expect(s).toEqual({
      id: "s1",
      startedAt: NOW.toISOString(),
      reviewer: { name: "Mike", level: "musician" },
      conditions: { device: "laptop", levelSetAt: "2026-10-07T19:59:00Z", targetLufs: TARGET_LUFS },
    });
    expect(isDevice("speakers") && !isDevice("radio")).toBe(true);
    expect(isLevel("professional") && !isLevel("god")).toBe(true);
  });

  it("exports in the shape review_marks.py report reads, with the sessions used", () => {
    const s1 = startSession(ME, "headphones", "t", NOW, "s1");
    const s2 = startSession(ME, "speakers", "t", NOW, "s2");
    const store = { [ENTRY.key]: [newMark(11, ME, "s1", NOW, "a")], "other:x": [newMark(1, ME, "s2", NOW, "b")] };
    const out = exportMarks(BUNDLE, store, ME, [s1, s2], NOW);
    expect(out.schema).toBe(REVIEW_SCHEMA);
    expect(Object.keys(out.entries)).toEqual([ENTRY.key]);
    expect(out.entries[ENTRY.key]).toMatchObject({ song: "amazing-grace", variant: "pad16" });
    expect(out.entries[ENTRY.key].marks[0].session).toBe("s1");
    expect(out.sessions.map((s) => s.id)).toEqual(["s1"]);
    expect(exportMarks(BUNDLE, {}, ME, [s1], NOW).entries).toEqual({});
  });
});

describe("loudness", () => {
  it("reads a full-scale 997 Hz sine in one channel at -3.01 LUFS (BS.1770's reference)", () => {
    expect(integratedLoudness([sine(997, 3, 1)], 48000)).toBeCloseTo(-3.01, 1);
  });

  it("adds two channels and works at 44.1 kHz", () => {
    const x = sine(997, 3, 1, 44100);
    expect(integratedLoudness([x, x], 44100)).toBeCloseTo(0, 1);
    expect(integratedLoudness([sine(997, 3, 0.1)], 48000)).toBeCloseTo(-23.01, 1);
  });

  it("gates silence out and returns -Infinity for nothing to measure", () => {
    const x = new Float64Array(48000 * 6);
    x.set(sine(997, 3, 0.1), 0);
    // half silent: ungated it would read about -26; gated, only the blocks that
    // straddle the tone's end (partly silent) pull it a little under -23
    const l = integratedLoudness([x], 48000);
    expect(l).toBeGreaterThan(-23.5);
    expect(l).toBeLessThan(-23.0);
    expect(integratedLoudness([new Float64Array(48000)], 48000)).toBe(-Infinity);
    expect(integratedLoudness([new Float64Array(1000)], 48000)).toBe(-Infinity);
    expect(integratedLoudness([], 48000)).toBe(-Infinity);
  });

  it("plays at the target unless the peak would pass the ceiling", () => {
    const g = playbackGain(-17, 0.5);
    expect(g.capped).toBe(false);
    expect(g.playedLufs).toBeCloseTo(TARGET_LUFS, 6);
    const loud = playbackGain(-40, 0.9);
    expect(loud.capped).toBe(true);
    expect(loud.gain * 0.9).toBeCloseTo(PEAK_CEILING, 9);
    expect(loud.playedLufs).toBeLessThan(TARGET_LUFS);
    expect(playbackGain(-Infinity, 0)).toEqual({ gain: 1, playedLufs: -Infinity, capped: false });
    expect(peakOf([[0.1, -0.7], [0.3]])).toBe(0.7);
  });
});

describe("catch trials", () => {
  const W = [1.0, 0.2] as const;

  it("counts a planted defect as heard when a mark's window covers it", () => {
    const c = { clip: "c1", kind: "replay", t: 5.0, severity: 100, present: true };
    expect(scoreClip(c, [{ t: 5.6 }], ...W)?.outcome).toBe("hit");
    expect(scoreClip(c, [{ t: 4.9 }], ...W)?.outcome).toBe("hit");
    expect(scoreClip(c, [{ t: 6.3 }], ...W)?.outcome).toBe("miss");
    expect(scoreClip(c, [], ...W)?.outcome).toBe("miss");
    expect(scoreClip({ ...c, present: false }, [{ t: 5.5 }], ...W)).toBeNull();
    expect(scoreClip({ ...c, t: null }, [], ...W)).toBeNull();
  });

  it("treats any mark on a sham or a clean clip as a false alarm", () => {
    expect(scoreClip({ clip: "s", kind: "sham", t: 5, severity: null, present: false }, [{ t: 1 }], ...W)?.outcome).toBe("false-alarm");
    expect(scoreClip({ clip: "n", kind: "none", t: null, severity: null, present: false }, [], ...W)?.outcome).toBe("correct-rejection");
  });

  it("summarises hits per kind and severity, and false alarms per control", () => {
    const s = summarizeCatch([
      { clip: "a", kind: "replay", severity: 100, outcome: "hit" },
      { clip: "b", kind: "replay", severity: 100, outcome: "miss" },
      { clip: "c", kind: "replay", severity: 50, outcome: "miss" },
      { clip: "d", kind: "sham", severity: null, outcome: "false-alarm" },
      { clip: "e", kind: "sham", severity: null, outcome: "correct-rejection" },
      { clip: "f", kind: "none", severity: null, outcome: "correct-rejection" },
    ]);
    expect(s.planted.replay["100"]).toEqual({ hits: 1, n: 2 });
    expect(s.planted.replay["50"]).toEqual({ hits: 0, n: 1 });
    expect(s.shamFalseAlarms).toEqual({ n: 2, marked: 1 });
    expect(s.cleanFalseAlarms).toEqual({ n: 1, marked: 0 });
  });
});
