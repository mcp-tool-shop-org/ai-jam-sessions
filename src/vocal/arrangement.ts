/**
 * A sung exemplar over someone else's piano arrangement.
 *
 * The block-chord exemplars (realizeHymn) are built so the cockpit's session engine
 * can play them: each hand a gapless chain of chords. A real piano arrangement is not
 * that shape: a held bass under moving notes, broken chords, staccato. So an
 * arrangement exemplar never goes through the session engine. Its piano bed is
 * rendered from the arrangement's own notes at their own times, and its score clock
 * is built here from the same tempo map, so the bed and the voice share one timeline
 * by construction.
 *
 * The arrangement is committed as note data (src/vocal/arrangements/<id>.json, made by
 * scripts/import-arrangement.ts). The hymn supplies the tune and the words; the voice
 * sings the hymn's melody, laid onto the arrangement at each verse's upbeat and checked
 * against it: every sung note must start where the arrangement plays a note of the same
 * pitch class (in any register: a verse may carry the tune in the tenor).
 */

import type { Hymn } from "./hymns.js";
import { BREATH_BEATS, parseMelody, verseSection, hymnLyrics } from "./hymns.js";
import {
  SCORE_CLOCK_SAMPLE_RATE,
  SCORE_CLOCK_SCHEMA,
  roundToSample,
  syllabify,
  type ScoreClock,
  type ScoreClockEvent,
} from "./score-clock.js";
import { readFileSync } from "node:fs";
import {
  GLORY_BREATH_S,
  GLORY_STRETCH,
  applyMoves,
  dottedMoves,
  ruleAmount,
  shapedTempos,
  shapes,
  stretchSpans,
  syllableGains,
  type Interpretation,
  type Shape,
} from "./interpretation.js";

export interface ArrangementNote {
  tick: number;
  dur: number;
  midi: number;
  vel: number;
  track: string;
}

export interface Arrangement {
  schema: string;
  id: string;
  credit: string;
  licence: string;
  source: { url: string; commit: string; file: string; sha256: string };
  ppq: number;
  beats_per_bar: number;
  /** Length of each partial measure the source starts a verse with, in ticks. */
  pickup_ticks: number;
  /** Where each partial measure starts, in the source's ticks. */
  pickups: number[];
  tempos: { tick: number; bpm: number }[];
  notes: ArrangementNote[];
}

const loaded = new Map<string, Arrangement>();

/** An arrangement's notes, read from src/vocal/arrangements/<id>.json on first use. */
export function getArrangement(id: string): Arrangement {
  if (!/^[a-z0-9.-]+$/.test(id)) throw new Error(`not an arrangement id: '${id}'`);
  if (!loaded.has(id)) {
    const url = new URL(`./arrangements/${id}.json`, import.meta.url);
    loaded.set(id, JSON.parse(readFileSync(url, "utf8")) as Arrangement);
  }
  return loaded.get(id)!;
}

/** The arrangement on the bar grid, in the sung key. */
export interface Placed {
  ppq: number;
  beatsPerBar: number;
  notes: ArrangementNote[];
  tempos: { tick: number; bpm: number }[];
  totalTicks: number;
  /** Where each verse's upbeat starts, on the grid (one per partial measure). */
  verseUpbeats: number[];
}

/**
 * Move each partial measure into the last beat of the bar before it, so every
 * downbeat after it lands on the bar grid. A tick after k partial measures moves back
 * k * pickup_ticks; the pickup's own notes land where the bar before was resting.
 */
export function place(a: Arrangement, transpose: number): Placed {
  const shiftOf = (tick: number) => a.pickups.filter((p) => p <= tick).length * a.pickup_ticks;
  const notes = a.notes
    .map((n) => ({ ...n, tick: n.tick - shiftOf(n.tick), midi: n.midi + transpose }))
    .sort((x, y) => x.tick - y.tick || x.midi - y.midi);
  const tempos = a.tempos.map((t) => ({ ...t, tick: t.tick - shiftOf(t.tick) }));
  const end = Math.max(...a.notes.map((n) => n.tick + n.dur));
  const totalTicks = end - shiftOf(end);
  const verseUpbeats = a.pickups.map((p) => p - shiftOf(p));
  const bar = a.ppq * a.beats_per_bar;
  if (totalTicks % bar !== 0) throw new Error(`${a.id}: ${totalTicks} ticks is not a whole number of bars`);
  return { ppq: a.ppq, beatsPerBar: a.beats_per_bar, notes, tempos, totalTicks, verseUpbeats };
}

/** Seconds at a tick, through the tempo map. */
export function tickToSec(p: Pick<Placed, "ppq" | "tempos">, tick: number): number {
  let sec = 0;
  let at = 0;
  let bpm = p.tempos[0]?.tick === 0 ? p.tempos[0].bpm : 120;
  for (const t of p.tempos) {
    if (t.tick > tick) break;
    sec += ((t.tick - at) / p.ppq) * (60 / bpm);
    at = t.tick;
    bpm = t.bpm;
  }
  return sec + ((tick - at) / p.ppq) * (60 / bpm);
}

export interface SungNote {
  verse: number;
  tick: number;
  dur: number;
  midi: number;
  held: boolean;
}

/** The hymn's melody, verse by verse, from each verse's upbeat; rests before the upbeat dropped. */
export function sungNotes(hymn: Hymn, p: Placed): SungNote[] {
  if (p.verseUpbeats.length !== hymn.verses.length) {
    throw new Error(`${hymn.id}: the arrangement has ${p.verseUpbeats.length} verse upbeats, the hymn ${hymn.verses.length} verses`);
  }
  const out: SungNote[] = [];
  hymn.verses.forEach((_, v) => {
    const events = parseMelody(verseSection(hymn, v).melody, hymn.beatsPerBar);
    const first = events.findIndex((e) => e.midi !== null);
    let tick = p.verseUpbeats[v];
    for (const e of events.slice(first)) {
      const len = Math.round(e.beats * p.ppq);
      if (e.midi !== null) {
        const breath = e.breath ? Math.round(BREATH_BEATS * p.ppq) : 0;
        out.push({ verse: v, tick, dur: len - breath, midi: e.midi + hymn.transpose, held: e.held });
      }
      tick += len;
    }
  });
  return out;
}

/** Sung notes the arrangement does not play at the same moment in the same pitch class. */
export function unmatched(sung: SungNote[], p: Placed): SungNote[] {
  const at = new Map<number, Set<number>>();
  for (const n of p.notes) {
    if (!at.has(n.tick)) at.set(n.tick, new Set());
    at.get(n.tick)!.add(((n.midi % 12) + 12) % 12);
  }
  // A held note continues a sounding syllable: the arrangement may tie it too, with no new onset.
  return sung.filter((s) => !s.held && !at.get(s.tick)?.has(((s.midi % 12) + 12) % 12));
}

/**
 * The arrangement and the sung line as performed: placed on the grid, then shaped by
 * the hymn's interpretation (src/vocal/interpretation.ts), or by `interp` when given
 * (a number is every rule at that amount; 0 = as written). Piano and voice are shaped
 * together. `glory` marks each sung note that is a stressed "Glo" of the refrain.
 */
export function performed(hymn: Hymn, interp: Interpretation | number = hymn.interpretation ?? 0): { p: Placed; sung: SungNote[]; shape: Shape; glory: boolean[]; breathBefore: number[] } {
  if (!hymn.arrangement) throw new Error(`${hymn.id} has no arrangement`);
  const p = place(getArrangement(hymn.arrangement), hymn.transpose);
  let sung = sungNotes(hymn, p);
  const bar = p.ppq * p.beatsPerBar;
  const shape: Shape = { verseStarts: p.verseUpbeats.map((u) => Math.ceil(u / bar) * bar), barTicks: bar, totalTicks: p.totalTicks, tempos: p.tempos };
  const syl = syllabify(hymnLyrics(hymn.id) ?? "");
  // a "Glo" of the refrain ("Glory, glory, hallelujah"), not the verses' "the glory of"
  const word = (i: number) => syl[i]?.word ?? "";
  const isGlo = (i: number) => syl.length === sung.length && !syl[i].continues && /^glo/i.test(syl[i].lyric)
    && (/^glory$/i.test(word(i - 1)) || /^(glory|hallelujah)$/i.test(word(i + 2)));
  const glory = sung.map((_, i) => isGlo(i));
  const breathBefore = sung.map(() => 0);
  if (shapes(interp)) {
    const moves = dottedMoves(sung, p.ppq, ruleAmount(interp, "dotted"));
    sung = applyMoves(sung, moves);
    p.notes = applyMoves(p.notes, moves);
    p.tempos = shapedTempos(shape, p.ppq, interp);
    const aGlory = ruleAmount(interp, "glory");
    if (aGlory > 0) {
      // each stressed "Glo" lengthened (the tempo slows across it, piano with it) ...
      const spans = sung.flatMap((n, i) => (glory[i] && sung[i + 1] ? [{ from: n.tick, to: sung[i + 1].tick }] : []));
      p.tempos = stretchSpans(p.tempos, spans, 1 + GLORY_STRETCH * aGlory);
      // ... and a breath before the refrain's first "Glory": the note before it ends early
      sung = sung.map((n, i) => {
        if (!glory[i + 1] || /glory|hallelujah/i.test(syl[i].word)) return n;
        let bpm = p.tempos[0].bpm;
        for (const t of p.tempos) if (t.tick <= n.tick + n.dur) bpm = t.bpm;
        const breath = Math.round(GLORY_BREATH_S * aGlory * (bpm / 60) * p.ppq);
        if (n.dur - breath < p.ppq / 4) return n;
        breathBefore[i + 1] = GLORY_BREATH_S * aGlory;
        return { ...n, dur: n.dur - breath };
      });
    }
  }
  return { p, sung, shape, glory, breathBefore };
}

/**
 * The score clock of a hymn sung over its arrangement: the same schema the block-chord
 * exemplars' clocks have, timed by the arrangement's tempo map. Each syllable is one
 * event; a held note becomes its melisma. Anchors name the arrangement onset. Given
 * `interp`, the clock records it, so the bed renderer plays the same performance.
 */
export function arrangementClock(hymn: Hymn, interp?: Interpretation | number): ScoreClock {
  const it = interp ?? hymn.interpretation ?? 0;
  const { p, sung, shape, glory, breathBefore } = performed(hymn, it);
  const bad = unmatched(sung, p);
  if (bad.length) throw new Error(`${hymn.id}: ${bad.length} sung notes have no arrangement note under them (first at tick ${bad[0].tick})`);
  const syl = syllabify(hymnLyrics(hymn.id)!);
  if (syl.length !== sung.length) throw new Error(`${hymn.id}: ${syl.length} lyric tokens for ${sung.length} sung notes`);
  const bar = p.ppq * p.beatsPerBar;
  const sec = (t: number) => roundToSample(tickToSec(p, t));
  const anchor = (t: number) => `arrangement-onset:m${Math.floor(t / bar) + 1}:beat${(t % bar) / p.ppq}`;
  const events: ScoreClockEvent[] = [];
  const eventGlory: boolean[] = [];
  sung.forEach((n, i) => {
    const t = sec(n.tick);
    const end = sec(n.tick + n.dur);
    if (syl[i].continues) {
      const ev = events[events.length - 1];
      (ev.melisma ??= []).push({
        midi: n.midi, t_sec: t, t_samples: Math.round(t * SCORE_CLOCK_SAMPLE_RATE), dur_sec: roundToSample(end - t),
        anchor: anchor(n.tick), midi_tick: n.tick, engine_note: null,
      });
      ev.dur_sec = roundToSample(end - ev.t_sec);
      return;
    }
    events.push({
      id: `v${String(events.length).padStart(2, "0")}`,
      lyric: syl[i].lyric, word: syl[i].word, syllable: syl[i].syllable, syllables: syl[i].syllables,
      midi: n.midi, t_sec: t, t_samples: Math.round(t * SCORE_CLOCK_SAMPLE_RATE), dur_sec: roundToSample(end - t),
      anchor: anchor(n.tick), midi_tick: n.tick, t_midi_sec: Math.round(tickToSec(p, n.tick) * 1e6) / 1e6, engine_note: null,
    });
    eventGlory.push(glory[i]);
    if (breathBefore[i] > 0) events[events.length - 1].breath_before_s = breathBefore[i];
  });
  if (shapes(it)) {
    const gains = syllableGains(events.map((e, i) => ({ tick: e.midi_tick, midi: e.midi, glory: eventGlory[i] })), shape, p.ppq, it);
    events.forEach((e, i) => { e.gain_db = gains[i]; });
  }
  const bars = p.totalTicks / bar;
  const starts: Record<string, number> = {};
  const durs: Record<string, number> = {};
  for (let b = 0; b < bars; b++) {
    starts[String(b + 1)] = sec(b * bar);
    durs[String(b + 1)] = roundToSample(tickToSec(p, (b + 1) * bar) - tickToSec(p, b * bar));
  }
  const total = sec(p.totalTicks);
  const last = events[events.length - 1];
  return {
    schema: SCORE_CLOCK_SCHEMA,
    song_id: hymn.id,
    bpm: hymn.bpm,
    time_signature: `${p.beatsPerBar}/4`,
    sample_rate: SCORE_CLOCK_SAMPLE_RATE,
    total_seconds: total,
    total_samples: Math.round(total * SCORE_CLOCK_SAMPLE_RATE),
    last_event_end_sec: roundToSample(last.t_sec + last.dur_sec),
    clock: {
      source: "arrangement", bed_measures: [1, bars], measure_starts_sec: starts, measure_durations_sec: durs, durations: "notated",
      ...(interp !== undefined ? { interpretation: typeof interp === "number" ? { amount: interp } : interp } : {}),
    },
    midi: { file: `src/vocal/arrangements/${hymn.arrangement}.json`, ppq: p.ppq, ticks_per_measure: bar, melody_track: "hymn", sec_per_tick: 60 / hymn.bpm / p.ppq },
    events,
  };
}

/** The bed's notes in seconds, for the offline renderer. */
export function bedNotes(hymn: Hymn, interp?: Interpretation | number): { t: number; dur: number; midi: number; vel: number }[] {
  const { p } = performed(hymn, interp);
  return p.notes.map((n) => {
    const t = tickToSec(p, n.tick);
    return { t, dur: tickToSec(p, n.tick + n.dur) - t, midi: n.midi, vel: n.vel };
  });
}
