import { describe, expect, it } from "vitest";
import { BATTLE_HYMN } from "./hymns.js";
import { arrangementClock, bedNotes, getArrangement, place, sungNotes, tickToSec, unmatched, type Arrangement } from "./arrangement.js";

describe("the Battle Hymn over Kimi-K3's arrangement", () => {
  const a = getArrangement("battle-hymn-kimi-k3");
  const p = place(a, BATTLE_HYMN.transpose);

  it("puts every downbeat on the bar grid: each partial measure moves into the bar before", () => {
    expect(p.totalTicks % (p.ppq * 4)).toBe(0);
    expect(p.totalTicks / (p.ppq * 4)).toBe(86);
    expect(p.verseUpbeats.map((t) => (t + a.pickup_ticks) % (p.ppq * 4))).toEqual([0, 0, 0, 0, 0]);
  });

  it("sings the hymn's tune where the arrangement plays it, in some register, every verse", () => {
    const sung = sungNotes(BATTLE_HYMN, p);
    expect(sung).toHaveLength(424);
    expect(unmatched(sung, p)).toEqual([]);
    // a wrong note would be caught
    const off = sung.map((n, i) => (i === 3 ? { ...n, midi: n.midi + 1 } : n));
    expect(unmatched(off, p)).toHaveLength(1);
  });

  it("times the song by the arrangement's tempo map, coda included", () => {
    expect(tickToSec(p, p.ppq)).toBeCloseTo(60 / 76, 9);
    const c = arrangementClock(BATTLE_HYMN);
    expect(c.events).toHaveLength(414);
    expect(c.clock.source).toBe("arrangement");
    const bars = Object.values(c.clock.measure_durations_sec);
    expect(bars[0]).toBeCloseTo(4 * 60 / 76, 4);
    expect(bars[bars.length - 1]).toBeCloseTo(4 * 60 / 50, 4);   // the coda's fermata bar
    expect(c.events[0].lyric).toBe("Mine");
    expect(c.events[0].t_sec).toBeCloseTo(tickToSec(p, p.verseUpbeats[0]), 4);
    expect(c.events.filter((e) => e.melisma).length).toBe(10);
  });

  it("gives the bed every arrangement note, in the sung key", () => {
    const bed = bedNotes(BATTLE_HYMN);
    expect(bed).toHaveLength(a.notes.length);
    expect(Math.min(...bed.map((n) => n.midi))).toBe(Math.min(...a.notes.map((n) => n.midi)) + BATTLE_HYMN.transpose);
  });

  it("refuses an arrangement whose verses do not match the hymn's", () => {
    expect(() => sungNotes(BATTLE_HYMN, { ...p, verseUpbeats: p.verseUpbeats.slice(0, 4) })).toThrow(/4 verse upbeats/);
    const fewer: Arrangement = { ...a, pickups: a.pickups.slice(0, 4) };
    expect(() => place(fewer, 0)).toThrow(/not a whole number of bars/);
    expect(() => getArrangement("../etc")).toThrow(/not an arrangement id/);
  });
});
