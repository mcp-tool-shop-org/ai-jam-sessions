/**
 * Interpretation: timing and emphasis shaped the way performers shape them, applied
 * to an arrangement exemplar's piano and voice together (src/vocal/arrangement.ts).
 *
 * The rules and their amounts are the research seat's brief, rnd v1.1.1.2.3
 * ("expressive timing and emphasis for a sung hymn performance"), after the KTH
 * performance rules (Friberg, Sundberg, Frydén), Repp, Windsor & Desain 2002 on
 * dotted rhythms, and Sluijter & van Heuven 1996 on stress. Its central finding sets
 * the defaults: listeners prefer each shaping just above the point it becomes audible
 * and reject it when exaggerated, so `amount` 1 is the small, preferred setting and
 * the Director's ear sets the rest (an A/B at 1x and 2.5x).
 *
 *  - Dotted pairs are softened to a ratio of 0.70 (the written 0.75 sounds stiff;
 *    performers play about 2.4:1), in the voice AND in the arrangement notes that
 *    move with it, so the parts stay together.
 *  - The tempo builds verse by verse (76/77/78/80/80), each two-bar line breathes a
 *    gentle slow-fast-slow arch (about +-2.5%), the last verse eases over its last
 *    two lines, and the coda slows along the Friberg-Sundberg final-ritard curve
 *    (q = 2.5) instead of in steps. The same shaping in every verse: performers
 *    repeat their timing across repeats.
 *  - Each syllable gets a gain in dB, applied to the placed vocal: emphasis on the
 *    strong beats, a phrase arch, and High-loud, summed and capped at +4 dB at
 *    amount 1 (louder sounds like a volume knob, not effort).
 *
 *  - Opt-in, the refrain's "Glory" package: each stressed "Glo" lengthened 6% (the
 *    tempo slows across it), a 70 ms breath before the refrain's first "Glory", and
 *    +2 dB on every "Glo". It is off unless named in `rules`, until the Director's
 *    A/B decides it.
 *
 * Nothing is random: no "humanise" jitter, which lowers listeners' ratings.
 *
 * Each rule can be set on its own (`rules`), so a blind A/B can change one rule and
 * hold the rest; a rule not named follows `amount`, except the opt-in ones.
 */

export type Rule =
  | "dotted" | "verseTempo" | "lineArch" | "lastVerseEase" | "coda"
  | "emphasis" | "phraseArch" | "highLoud" | "glory";

/** Rules that are off unless named: not yet chosen by ear. */
export const OPT_IN_RULES: readonly Rule[] = ["glory"];

export interface Interpretation {
  /** Scales every rule: 0 = as written, 1 = the brief's preferred amount. */
  amount: number;
  /** One rule's own amount, overriding `amount` for that rule. */
  rules?: Partial<Record<Rule, number>>;
}

/** The amount one rule plays at. */
export function ruleAmount(i: Interpretation | number, rule: Rule): number {
  const it = typeof i === "number" ? { amount: i } : i;
  return it.rules?.[rule] ?? (OPT_IN_RULES.includes(rule) ? 0 : it.amount);
}

/** Whether anything is shaped at all. */
export function shapes(i: Interpretation | number): boolean {
  const it = typeof i === "number" ? { amount: i } : i;
  return it.amount > 0 || Object.values(it.rules ?? {}).some((v) => (v ?? 0) > 0);
}

export const DOTTED_RATIO = 0.7;
export const VERSE_BPM = [76, 77, 78, 80, 80];
export const LINE_ARCH = 0.025;
export const LAST_VERSE_EASE = 0.04;
export const CODA_Q = 2.5;
export const EMPHASIS_DB = 2;
export const PHRASE_ARCH_DB = 3;
export const HIGH_LOUD_DB_PER_OCTAVE = 3;
export const GAIN_CAP_DB = 4;
export const GLORY_STRETCH = 0.06;
export const GLORY_BREATH_S = 0.07;
export const GLORY_DB = 2;

export interface TimedNote {
  tick: number;
  dur: number;
  midi: number;
}

/**
 * Soften every sung 3:1 pair (a dotted note and its short partner, back to back:
 * 0.75 + 0.25 of a beat, or 1.5 + 0.5) towards DOTTED_RATIO of the pair: the short
 * note starts earlier and the pair keeps its length. Returns the moves as
 * old tick -> new tick, to apply to the voice and the arrangement alike.
 */
export function dottedMoves(sung: TimedNote[], ppq: number, amount: number): Map<number, number> {
  const moves = new Map<number, number>();
  for (let i = 0; i + 1 < sung.length; i++) {
    const a = sung[i];
    const b = sung[i + 1];
    const long = b.tick - a.tick;                                   // the written span of the dotted note
    const next = sung[i + 2];
    const short = next && next.tick - b.tick <= long ? next.tick - b.tick : b.dur;
    if (short > ppq / 2 || Math.abs(long - 3 * short) > ppq / 16 || a.dur < long - ppq / 2) continue;
    const ratio = 0.75 + (DOTTED_RATIO - 0.75) * amount;
    moves.set(b.tick, a.tick + Math.round(ratio * (long + short)));
  }
  return moves;
}

/** Apply onset moves to notes: a note starting at a moved tick starts at its new tick
 * and keeps its end; a note ending there ends at the new tick. */
export function applyMoves<T extends TimedNote>(notes: T[], moves: Map<number, number>): T[] {
  return notes.map((n) => {
    const end = n.tick + n.dur;
    const tick = moves.get(n.tick) ?? n.tick;
    const newEnd = moves.get(end) ?? end;
    return { ...n, tick, dur: Math.max(1, newEnd - tick) };
  });
}

export interface Shape {
  /** First tick of the sung verse (its downbeat) and its 16 bars. */
  verseStarts: number[];
  barTicks: number;
  totalTicks: number;
  /** The arrangement's own tempo map (opening tempo, coda steps). */
  tempos: { tick: number; bpm: number }[];
}

/** The written tempo at a tick. */
function writtenBpm(tempos: Shape["tempos"], tick: number): number {
  let bpm = tempos[0]?.bpm ?? 120;
  for (const t of tempos) if (t.tick <= tick) bpm = t.bpm;
  return bpm;
}

/** v(x) = [1 + (v_end^q - 1) x]^(1/q): the Friberg-Sundberg final ritard, relative tempo. */
export function finalRitard(x: number, vEnd: number, q = CODA_Q): number {
  return Math.pow(1 + (Math.pow(vEnd, q) - 1) * Math.min(1, Math.max(0, x)), 1 / q);
}

/**
 * A tempo event on every beat: the verse build, the line arch, the last verse's
 * easing and the coda's ritard, each scaled by its rule's amount (all 0 gives back
 * the written map).
 */
export function shapedTempos(s: Shape, ppq: number, interp: Interpretation | number): { tick: number; bpm: number }[] {
  const aBuild = ruleAmount(interp, "verseTempo");
  const aArch = ruleAmount(interp, "lineArch");
  const aEase = ruleAmount(interp, "lastVerseEase");
  const aCoda = ruleAmount(interp, "coda");
  const beat = ppq;
  const out: { tick: number; bpm: number }[] = [];
  const codaStart = s.tempos.length > 1 ? s.tempos[1].tick : s.totalTicks;
  const codaEnd = s.totalTicks - s.barTicks;            // the last bar is the fermata
  const startBpm = writtenBpm(s.tempos, 0);
  const endBpm = writtenBpm(s.tempos, s.totalTicks - 1);
  const lineTicks = 2 * s.barTicks;
  for (let tick = 0; tick < s.totalTicks; tick += beat) {
    let bpm = writtenBpm(s.tempos, tick);
    const v = s.verseStarts.findIndex((st, i) => tick >= st && tick < (s.verseStarts[i + 1] ?? codaStart));
    if (tick >= codaStart) {
      // one smooth curve from the opening tempo to the written last tempo, then hold
      const x = codaEnd > codaStart ? (tick - codaStart) / (codaEnd - codaStart) : 1;
      const smooth = startBpm * finalRitard(x, endBpm / startBpm);
      bpm = tick >= codaEnd ? endBpm : bpm + (smooth - bpm) * aCoda;
    } else if (v >= 0) {
      const base = VERSE_BPM[Math.min(v, VERSE_BPM.length - 1)] ?? bpm;
      const within = tick - s.verseStarts[v];
      const x = (within % lineTicks) / lineTicks;
      const arch = LINE_ARCH * (Math.sin(Math.PI * x) - 2 / Math.PI);   // slow-fast-slow, mean zero
      const verseLen = (s.verseStarts[v + 1] ?? codaStart) - s.verseStarts[v];
      const lastLines = v === s.verseStarts.length - 1 && within >= verseLen - 2 * lineTicks
        ? -LAST_VERSE_EASE * ((within - (verseLen - 2 * lineTicks)) / (2 * lineTicks)) : 0;
      bpm = (bpm + (base - bpm) * aBuild) * (1 + arch * aArch + lastLines * aEase);
    }
    out.push({ tick, bpm: Math.round(bpm * 1000) / 1000 });
  }
  return out;
}

/**
 * Slow the tempo by `factor` across each span (a note lengthened by that factor), and
 * restore the map's own tempo at the span's end. Spans must not overlap.
 */
export function stretchSpans(tempos: { tick: number; bpm: number }[], spans: { from: number; to: number }[], factor: number): { tick: number; bpm: number }[] {
  if (!spans.length || factor === 1) return tempos;
  const at = (tick: number) => { let b = tempos[0].bpm; for (const t of tempos) if (t.tick <= tick) b = t.bpm; return b; };
  const inside = (tick: number) => spans.some((sp) => tick >= sp.from && tick < sp.to);
  const out = tempos.map((t) => (inside(t.tick) ? { tick: t.tick, bpm: t.bpm / factor } : t));
  for (const sp of spans) {
    out.push({ tick: sp.from, bpm: at(sp.from) / factor }, { tick: sp.to, bpm: at(sp.to) });
  }
  const byTick = new Map<number, number>();
  for (const t of out) byTick.set(t.tick, Math.round(t.bpm * 1000) / 1000);   // span edges win over the beat events
  return [...byTick.entries()].sort((a, b) => a[0] - b[0]).map(([tick, bpm]) => ({ tick, bpm }));
}

export interface GainInput {
  tick: number;
  midi: number;
  /** A stressed "Glo" of the refrain (the opt-in glory rule). */
  glory?: boolean;
}

/**
 * Each sung syllable's gain in dB: emphasis on the strong beats (1 and 3), a phrase
 * arch over each two-bar line, and High-loud above the tune's median pitch, summed
 * and, at amount 1 or less, held within GAIN_CAP_DB of the quietest syllable.
 */
export function syllableGains(events: GainInput[], s: Shape, ppq: number, interp: Interpretation | number): number[] {
  if (!events.length) return [];
  const aEmph = ruleAmount(interp, "emphasis");
  const aArch = ruleAmount(interp, "phraseArch");
  const aHigh = ruleAmount(interp, "highLoud");
  const aGlory = ruleAmount(interp, "glory");
  const amount = Math.max(aEmph, aArch, aHigh, aGlory);
  const sorted = [...events.map((e) => e.midi)].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const lineTicks = 2 * s.barTicks;
  const raw = events.map((e) => {
    const inBar = e.tick % s.barTicks;
    const strong = inBar === 0 || inBar === 2 * ppq ? EMPHASIS_DB : 0;
    let v = -1;
    s.verseStarts.forEach((st, i) => { if (e.tick >= st) v = i; });
    const x = v >= 0 ? ((e.tick - s.verseStarts[v]) % lineTicks) / lineTicks : 0.5;
    const arch = PHRASE_ARCH_DB * Math.sin(Math.PI * x);
    const high = Math.min(HIGH_LOUD_DB_PER_OCTAVE, Math.max(0, ((e.midi - median) / 12) * HIGH_LOUD_DB_PER_OCTAVE));
    return strong * aEmph + arch * aArch + high * aHigh + (e.glory ? GLORY_DB * aGlory : 0);
  });
  const floor = Math.min(...raw);
  return raw.map((g) => {
    const above = g - floor;
    const capped = amount <= 1 ? Math.min(above, GAIN_CAP_DB) : above;
    return Math.round(capped * 100) / 100;
  });
}
