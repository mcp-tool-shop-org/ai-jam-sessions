import { describe, expect, it } from "vitest";
import { BATTLE_HYMN } from "./hymns.js";
import { arrangementClock, bedNotes, performed, tickToSec, unmatched } from "./arrangement.js";
import {
  DOTTED_RATIO,
  GAIN_CAP_DB,
  GLORY_BREATH_S,
  GLORY_DB,
  VERSE_BPM,
  applyMoves,
  dottedMoves,
  finalRitard,
  ruleAmount,
  shapedTempos,
  stretchSpans,
  syllableGains,
  type Shape,
} from "./interpretation.js";

const PPQ = 384;

describe("per-rule amounts", () => {
  it("lets one rule differ from the rest, and keeps the opt-in rules off unless named", () => {
    expect(ruleAmount(1, "dotted")).toBe(1);
    expect(ruleAmount({ amount: 1, rules: { dotted: 0 } }, "dotted")).toBe(0);
    expect(ruleAmount({ amount: 1, rules: { dotted: 0 } }, "coda")).toBe(1);
    expect(ruleAmount(1, "glory")).toBe(0);
    expect(ruleAmount({ amount: 0, rules: { glory: 1 } }, "glory")).toBe(1);
  });
});

describe("dotted pairs", () => {
  it("softens a dotted eighth and sixteenth, and a dotted quarter and eighth, to 0.70 of the pair", () => {
    const sung = [
      { tick: 0, dur: 288, midi: 60 }, { tick: 288, dur: 96, midi: 62 },       // 0.75 + 0.25
      { tick: 384, dur: 576, midi: 64 }, { tick: 960, dur: 192, midi: 65 },    // 1.5 + 0.5
      { tick: 1152, dur: 384, midi: 67 },
    ];
    const moves = dottedMoves(sung, PPQ, 1);
    expect(moves.get(288)).toBe(Math.round(DOTTED_RATIO * 384));
    expect(moves.get(960)).toBe(384 + Math.round(DOTTED_RATIO * 768));
    expect(dottedMoves(sung, PPQ, 0).get(288)).toBe(288);                      // amount 0: as written
    expect(dottedMoves([{ tick: 0, dur: 192, midi: 60 }, { tick: 192, dur: 192, midi: 60 }], PPQ, 1).size).toBe(0);
  });

  it("moves a note's start and the end of a note that reached it, keeping other ends", () => {
    const moved = applyMoves([{ tick: 0, dur: 288, midi: 60 }, { tick: 288, dur: 96, midi: 62 }], new Map([[288, 269]]));
    expect(moved).toEqual([{ tick: 0, dur: 269, midi: 60 }, { tick: 269, dur: 115, midi: 62 }]);
  });
});

describe("tempo", () => {
  const shape: Shape = { verseStarts: [4 * 1536, 20 * 1536], barTicks: 1536, totalTicks: 40 * 1536, tempos: [{ tick: 0, bpm: 76 }, { tick: 37 * 1536, bpm: 50 }] };

  it("gives back the written map at amount 0", () => {
    const t = shapedTempos(shape, PPQ, 0);
    expect(new Set(t.filter((x) => x.tick < 37 * 1536).map((x) => x.bpm))).toEqual(new Set([76]));
  });

  it("builds the verses, arches each line about its mean, and ritards the coda", () => {
    const t = shapedTempos(shape, PPQ, 1);
    const at = (tick: number) => t.filter((x) => x.tick <= tick).at(-1)!.bpm;
    const mean = (from: number, to: number) => { const v = t.filter((x) => x.tick >= from && x.tick < to).map((x) => x.bpm); return v.reduce((a, b) => a + b, 0) / v.length; };
    expect(mean(4 * 1536, 6 * 1536)).toBeCloseTo(VERSE_BPM[0], 0);
    expect(mean(20 * 1536, 22 * 1536)).toBeCloseTo(VERSE_BPM[1], 0);
    expect(at(4 * 1536)).toBeLessThan(at(5 * 1536));                         // slow at the line's start, faster mid-line
    expect(at(38 * 1536)).toBeLessThan(at(37 * 1536));                       // the coda slows
    expect(at(39 * 1536)).toBe(50);                                          // and holds the last tempo
    expect(finalRitard(0, 0.66)).toBe(1);
  });

  it("turns one tempo rule off and leaves the others", () => {
    const at = (t: { tick: number; bpm: number }[], tick: number) => t.filter((x) => x.tick <= tick).at(-1)!.bpm;
    const noArch = shapedTempos(shape, PPQ, { amount: 1, rules: { lineArch: 0 } });
    expect(new Set(noArch.filter((x) => x.tick >= 4 * 1536 && x.tick < 6 * 1536).map((x) => x.bpm))).toEqual(new Set([VERSE_BPM[0]]));
    const steps = shapedTempos(shape, PPQ, { amount: 1, rules: { coda: 0 } });
    expect(at(steps, 38 * 1536)).toBe(50);                                   // the written step, not the curve
    expect(at(steps, 4 * 1536)).toBe(at(shapedTempos(shape, PPQ, 1), 4 * 1536));
  });

  it("slows the tempo across a lengthened span and restores it after", () => {
    const t = stretchSpans([{ tick: 0, bpm: 76 }, { tick: 384, bpm: 80 }], [{ from: 192, to: 480 }], 1.06);
    expect(t).toEqual([{ tick: 0, bpm: 76 }, { tick: 192, bpm: 71.698 }, { tick: 384, bpm: 75.472 }, { tick: 480, bpm: 80 }]);
    expect(stretchSpans([{ tick: 0, bpm: 76 }], [], 1.06)).toEqual([{ tick: 0, bpm: 76 }]);
    expect(finalRitard(1, 0.66)).toBeCloseTo(0.66, 9);
  });
});

describe("gain", () => {
  const shape: Shape = { verseStarts: [0], barTicks: 1536, totalTicks: 8 * 1536, tempos: [{ tick: 0, bpm: 76 }] };
  const events = [{ tick: 0, midi: 60 }, { tick: 384, midi: 60 }, { tick: 768, midi: 72 }, { tick: 1536, midi: 79 }];

  it("stresses strong beats and high notes, within the cap at amount 1", () => {
    const g = syllableGains(events, shape, PPQ, 1);
    expect(g[0]).toBeGreaterThan(g[1] - 0.5);                               // beat 1 against beat 2 (the arch rises across)
    expect(Math.max(...g)).toBeLessThanOrEqual(GAIN_CAP_DB);
    expect(Math.min(...g)).toBe(0);
    expect(syllableGains([], shape, PPQ, 1)).toEqual([]);
  });

  it("adds the glory stress only where it is named and asked for", () => {
    const marked = events.map((e, i) => ({ ...e, glory: i === 1 }));
    const off = syllableGains(marked, shape, PPQ, 1);
    const on = syllableGains(marked, shape, PPQ, { amount: 0, rules: { glory: 1 } });
    expect(off).toEqual(syllableGains(events, shape, PPQ, 1));
    expect(on).toEqual([0, GLORY_DB, 0, 0]);
  });

  it("lets the over-application arm pass the cap, as the A/B needs", () => {
    expect(Math.max(...syllableGains(events, shape, PPQ, 2.5))).toBeGreaterThan(GAIN_CAP_DB);
  });
});

describe("the Battle Hymn performed", () => {
  it("keeps every sung note on its arrangement note after the shaping", () => {
    const { p, sung } = performed(BATTLE_HYMN, 1);
    expect(unmatched(sung, p)).toEqual([]);
    expect(Math.min(...arrangementClock(BATTLE_HYMN, 1).events.map((e) => e.dur_sec))).toBeGreaterThanOrEqual(0.18);
  });

  it("stresses only the refrain's Glory, with a breath before each refrain, and stays on the arrangement", () => {
    const glory = { amount: 1, rules: { glory: 1 } };
    const { p, sung, glory: marked } = performed(BATTLE_HYMN, glory);
    expect(unmatched(sung, p)).toEqual([]);
    const clock = arrangementClock(BATTLE_HYMN, glory);
    expect(clock.clock.interpretation).toEqual(glory);
    expect(marked.filter(Boolean).length).toBeGreaterThanOrEqual(30);       // six a refrain, five refrains
    const breaths = clock.events.filter((e) => e.breath_before_s);
    expect(breaths.map((e) => e.word)).toEqual(Array(5).fill("Glory"));
    expect(breaths[0].breath_before_s).toBeCloseTo(GLORY_BREATH_S, 9);
    const verseGlory = clock.events.find((e) => e.word === "glory" || (e.word === "Glory" && e.t_sec < breaths[0].t_sec));
    const canonical = arrangementClock(BATTLE_HYMN);
    if (verseGlory) expect(verseGlory.gain_db).toBe(canonical.events.find((e) => e.id === verseGlory.id)!.gain_db);
    expect(canonical.clock.interpretation).toBeUndefined();
    expect(canonical.events.some((e) => e.breath_before_s)).toBe(false);
  });

  it("is the written performance at amount 0, and the bed follows the same map", () => {
    const written = arrangementClock(BATTLE_HYMN, 0);
    expect(written.events.every((e) => e.gain_db === undefined)).toBe(true);
    const { p } = performed(BATTLE_HYMN, 1);
    const bed = bedNotes(BATTLE_HYMN, 1);
    expect(bed[bed.length - 1].t).toBeCloseTo(tickToSec(p, p.notes[p.notes.length - 1].tick), 6);
  });
});
