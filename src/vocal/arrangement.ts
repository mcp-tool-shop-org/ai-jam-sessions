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
 * The score clock of a hymn sung over its arrangement: the same schema the block-chord
 * exemplars' clocks have, timed by the arrangement's tempo map. Each syllable is one
 * event; a held note becomes its melisma. Anchors name the arrangement onset.
 */
export function arrangementClock(hymn: Hymn): ScoreClock {
  if (!hymn.arrangement) throw new Error(`${hymn.id} has no arrangement`);
  const p = place(getArrangement(hymn.arrangement), hymn.transpose);
  const sung = sungNotes(hymn, p);
  const bad = unmatched(sung, p);
  if (bad.length) throw new Error(`${hymn.id}: ${bad.length} sung notes have no arrangement note under them (first at tick ${bad[0].tick})`);
  const syl = syllabify(hymnLyrics(hymn.id)!);
  if (syl.length !== sung.length) throw new Error(`${hymn.id}: ${syl.length} lyric tokens for ${sung.length} sung notes`);
  const bar = p.ppq * p.beatsPerBar;
  const sec = (t: number) => roundToSample(tickToSec(p, t));
  const anchor = (t: number) => `arrangement-onset:m${Math.floor(t / bar) + 1}:beat${(t % bar) / p.ppq}`;
  const events: ScoreClockEvent[] = [];
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
  });
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
    clock: { source: "arrangement", bed_measures: [1, bars], measure_starts_sec: starts, measure_durations_sec: durs, durations: "notated" },
    midi: { file: `src/vocal/arrangements/${hymn.arrangement}.json`, ppq: p.ppq, ticks_per_measure: bar, melody_track: "hymn", sec_per_tick: 60 / hymn.bpm / p.ppq },
    events,
  };
}

/** The bed's notes in seconds, for the offline renderer. */
export function bedNotes(hymn: Hymn): { t: number; dur: number; midi: number; vel: number }[] {
  if (!hymn.arrangement) throw new Error(`${hymn.id} has no arrangement`);
  const p = place(getArrangement(hymn.arrangement), hymn.transpose);
  return p.notes.map((n) => {
    const t = tickToSec(p, n.tick);
    return { t, dur: tickToSec(p, n.tick + n.dur) - t, midi: n.midi, vel: n.vel };
  });
}
