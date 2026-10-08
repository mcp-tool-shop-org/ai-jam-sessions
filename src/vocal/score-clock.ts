/**
 * Score clock — the ONE clock a vocal stem is placed on.
 *
 * Two clocks were mixed as if they were one (Director, 2026-09-04). The
 * MIDI file has a tick map (3/4 at 75 BPM, every bar 2.4 s) and the session
 * plays a DIFFERENT timeline: each measure's parsed beats run per hand and
 * the next measure starts when the longer hand finishes, so the bars the
 * Director hears are 3.2–4.0 s. `bar.dur / 3` (the hymn grid) is neither.
 *
 * This module derives, from the arrangement the session actually plays:
 *   - the session-nominal schedule of every piano note (the bed)
 *   - one lyric event per melody note of the MIDI melody track, with its
 *     `t_sec` = the session-nominal onset of the SAME note in the arrangement
 *
 * Everything is sample-rounded at 48 kHz so the bed and the vocal timeline
 * share one length and `place_exact` has nothing to guess.
 */

import { parseMeasure } from "../note-parser.js";
import type { SongEntry } from "../songs/types.js";
import type { Beat } from "../types.js";

export const SCORE_CLOCK_SCHEMA = "ai-jam-sessions/score-clock/v1";
export const SCORE_CLOCK_SAMPLE_RATE = 48000;

// ─── MIDI (read-only, melody track) ─────────────────────────────────────────

export interface MidiMelodyNote {
  tick: number;
  durationTicks: number;
  midi: number;
  velocity: number;
}

export interface MidiScoreInfo {
  ppq: number;
  numerator: number;
  denominator: number;
  bpm: number;
  ticksPerMeasure: number;
  trackNames: string[];
}

function readVarLen(b: Uint8Array, i: number): [number, number] {
  let v = 0;
  for (;;) {
    const c = b[i++];
    v = (v << 7) | (c & 0x7f);
    if (!(c & 0x80)) return [v, i];
  }
}

/** Parse the header plus every track; return score info and per-track notes. */
export function parseMidiTracks(bytes: Uint8Array): {
  info: MidiScoreInfo;
  tracks: { name: string; notes: MidiMelodyNote[] }[];
} {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (tag(0) !== "MThd") throw new Error("not a MIDI file (no MThd)");
  const ntrk = dv.getUint16(10);
  const ppq = dv.getUint16(12);
  if (ppq & 0x8000) throw new Error("SMPTE time division is not supported");
  let numerator = 4;
  let denominator = 4;
  let bpm = 120;
  let sawTempo = false;
  let sawTimeSig = false;
  const tracks: { name: string; notes: MidiMelodyNote[] }[] = [];
  let i = 14;
  for (let t = 0; t < ntrk; t++) {
    if (tag(i) !== "MTrk") throw new Error(`track ${t}: no MTrk at ${i}`);
    const len = dv.getUint32(i + 4);
    const trk = bytes.subarray(i + 8, i + 8 + len);
    i += 8 + len;
    let j = 0;
    let tick = 0;
    let running = 0;
    let name = "";
    const open = new Map<number, { tick: number; velocity: number }>();
    const notes: MidiMelodyNote[] = [];
    const close = (n: number, at: number) => {
      const o = open.get(n);
      if (!o) return;
      open.delete(n);
      notes.push({ tick: o.tick, durationTicks: at - o.tick, midi: n, velocity: o.velocity });
    };
    while (j < trk.length) {
      const [delta, j1] = readVarLen(trk, j);
      j = j1;
      tick += delta;
      let status = trk[j];
      if (status === 0xff) {
        const type = trk[j + 1];
        const [l, j2] = readVarLen(trk, j + 2);
        const payload = trk.subarray(j2, j2 + l);
        j = j2 + l;
        if (type === 0x03) name = String.fromCharCode(...payload);
        else if (type === 0x51 && !sawTempo) {
          bpm = 60e6 / ((payload[0] << 16) | (payload[1] << 8) | payload[2]);
          sawTempo = true;
        } else if (type === 0x58 && !sawTimeSig) {
          numerator = payload[0];
          denominator = 2 ** payload[1];
          sawTimeSig = true;
        }
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const [l, j2] = readVarLen(trk, j + 1);
        j = j2 + l;
        continue;
      }
      if (status & 0x80) {
        running = status;
        j += 1;
      } else {
        status = running;
      }
      const kind = status & 0xf0;
      if (kind === 0x90 || kind === 0x80 || kind === 0xa0 || kind === 0xb0 || kind === 0xe0) {
        const a = trk[j];
        const b = trk[j + 1];
        j += 2;
        if (kind === 0x90 && b > 0) {
          close(a, tick);
          open.set(a, { tick, velocity: b });
        } else if (kind === 0x80 || (kind === 0x90 && b === 0)) {
          close(a, tick);
        }
      } else {
        j += 1; // program change / channel pressure: one data byte
      }
    }
    for (const n of [...open.keys()]) close(n, tick);
    notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
    tracks.push({ name, notes });
  }
  const ticksPerMeasure = Math.round(ppq * numerator * (4 / denominator));
  return {
    info: { ppq, numerator, denominator, bpm, ticksPerMeasure, trackNames: tracks.map((t) => t.name) },
    tracks,
  };
}

// ─── Melody-track auto-detect ───────────────────────────────────────────────

const MELODY_KEYWORDS = [
  "melody", "tune", "lead", "vocal", "voice", "soprano", "solo", "tubularbel",
];

const ACCOMP_KEYWORDS = [
  "bass", "drums", "perc", "chords", "comp", "accomp", "rhythm", "pad",
  "strings", "drum", "bass", "arpeggio", "arp", "harmony", "bassline",
];

/** Score a track for how likely it is the melody. Higher = more likely. */
function scoreTrack(name: string, noteCount: number): number {
  const lower = name.toLowerCase();
  let score = 0;
  if (noteCount === 0) return -Infinity; // never pick an empty track

  // Exact melody keywords
  for (const kw of MELODY_KEYWORDS) {
    if (lower === kw) score += 100;
    else if (lower.includes(kw)) score += 50;
  }

  // Accompaniment penalty
  for (const kw of ACCOMP_KEYWORDS) {
    if (lower.includes(kw)) score -= 80;
  }

  // Note count bonus (log-scaled so a track with 2× notes gets +7, not +2×)
  score += Math.log2(noteCount + 1) * 10;

  return score;
}

/**
 * Auto-detect the melody track from parsed MIDI tracks.
 * Returns the name of the best candidate, or `null` if every track is empty.
 */
export function detectMelodyTrack(
  tracks: { name: string; notes: MidiMelodyNote[] }[],
): string | null {
  const scored = tracks
    .map((t) => ({ name: t.name, score: scoreTrack(t.name, t.notes.length) }))
    .filter((s) => s.score !== -Infinity)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  return scored[0].name;
}

export interface ScheduledNote {
  measure: number;
  hand: "right" | "left";
  /** Position of this beat within the hand's beat list (0-based). */
  beatIndex: number;
  /** Session-nominal onset, seconds (not yet sample-rounded). */
  t: number;
  dur: number;
  midi: number;
  velocity: number;
}

export interface SessionSchedule {
  bpm: number;
  measureStarts: { number: number; start: number; dur: number }[];
  notes: ScheduledNote[];
  /** End of the last requested measure, seconds. */
  endSec: number;
}

function beatsTotal(beats: Beat[]): number {
  return beats.reduce((s, b) => s + (b.notes[0]?.durationMs ?? 0) / 1000, 0);
}

/**
 * The timeline `Session.play()` follows for measures `start..end`: hands run
 * in parallel from the measure start, each beat advancing by its own
 * duration, and the measure lasts as long as its longer hand (session.ts
 * `measureDurationSec`). Rests are omitted from `notes` but still advance
 * the cursor.
 */
export function sessionSchedule(
  song: SongEntry,
  start = 1,
  end = song.measures.length,
  bpm = song.tempo,
): SessionSchedule {
  const measureStarts: SessionSchedule["measureStarts"] = [];
  const notes: ScheduledNote[] = [];
  let t = 0;
  for (const m of song.measures) {
    if (m.number < start) continue;
    if (m.number > end) break;
    const pm = parseMeasure(m, bpm);
    const walk = (beats: Beat[], hand: "right" | "left") => {
      let cursor = t;
      beats.forEach((beat, beatIndex) => {
        const dur = (beat.notes[0]?.durationMs ?? 0) / 1000;
        for (const n of beat.notes) {
          if (n.note < 0) continue;
          notes.push({ measure: m.number, hand, beatIndex, t: cursor, dur, midi: n.note, velocity: n.velocity });
        }
        cursor += dur;
      });
    };
    walk(pm.rightBeats, "right");
    walk(pm.leftBeats, "left");
    const dur = Math.max(beatsTotal(pm.rightBeats), beatsTotal(pm.leftBeats));
    measureStarts.push({ number: m.number, start: t, dur });
    t += dur;
  }
  notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
  return { bpm, measureStarts, notes, endSec: t };
}

// ─── The clock ──────────────────────────────────────────────────────────────

export interface ScoreClockEvent {
  id: string;
  lyric: string;
  /** The transcribable word this syllable belongs to, and its index in it. */
  word: string;
  syllable: number;
  syllables: number;
  midi: number;
  t_sec: number;
  t_samples: number;
  dur_sec: number;
  anchor: string;
  midi_tick: number;
  t_midi_sec: number;
  engine_note: { measure: number; hand: "right" | "left"; t_sec: number } | null;
  /**
   * The notes after the first that this syllable is held across (a melisma,
   * `_` in the lyrics), in order. `t_sec` / `midi` above are the first note;
   * `dur_sec` spans the whole syllable, so the first note's own length is
   * `melisma[0].t_sec - t_sec`. Absent when the syllable has one note. One
   * event is one vowel onset: the timing gate and the picker never see these.
   */
  melisma?: ScoreClockNote[];
  /**
   * The interpretation's gain for this syllable, in dB above the quietest
   * (src/vocal/interpretation.ts), applied to the placed vocal before the mix.
   * Absent: sung as placed.
   */
  gain_db?: number;
  /** A breath before this syllable (src/vocal/interpretation.ts, glory): the mix gates the voice across it. */
  breath_before_s?: number;
}

/** A note a held syllable continues onto. */
export interface ScoreClockNote {
  midi: number;
  t_sec: number;
  t_samples: number;
  dur_sec: number;
  anchor: string;
  midi_tick: number;
  engine_note: { measure: number; hand: "right" | "left"; t_sec: number } | null;
}

export interface ScoreClock {
  schema: typeof SCORE_CLOCK_SCHEMA;
  song_id: string;
  bpm: number;
  time_signature: string;
  sample_rate: number;
  total_seconds: number;
  total_samples: number;
  last_event_end_sec: number;
  clock: {
    /** "arrangement": timed by an arrangement's own tempo map (src/vocal/arrangement.ts). */
    source: "session-nominal" | "arrangement";
    /** An arrangement clock built with an interpretation other than its hymn's own (a variant for an A/B). */
    interpretation?: import("./interpretation.js").Interpretation;
    bed_measures: [number, number];
    measure_starts_sec: Record<string, number>;
    measure_durations_sec: Record<string, number>;
    /**
     * "notated": a note ends where the melody track's note ends, so a rest is
     * silence on the clock. Absent: legato, every note held to the next onset
     * (the single-phrase clocks).
     */
    durations?: "notated";
  };
  midi: {
    file: string;
    ppq: number;
    ticks_per_measure: number;
    melody_track: string;
    sec_per_tick: number;
  };
  events: ScoreClockEvent[];
}

export interface LyricSyllable {
  lyric: string;
  word: string;
  syllable: number;
  syllables: number;
  /** A `_` token: the previous syllable is held onto the next melody note. */
  continues?: true;
}

/** The lyric token that holds the previous syllable onto the next note. */
export const HOLD_TOKEN = "_";

/**
 * "A-ma-zing grace how sweet the sound" → one entry per melody note, each
 * knowing which whole word a transcriber will report it inside. A `_` holds
 * the previous syllable onto the next note: as its own token after a word
 * ("A-ma-zing _ grace" sings "zing" across two notes, as New Britain does),
 * or as a part inside one ("pre-_-cious" holds "pre").
 */
export function syllabify(lyrics: string): LyricSyllable[] {
  const out: LyricSyllable[] = [];
  for (const word of lyrics.trim().split(/\s+/)) {
    const parts = word.split("-");
    if (parts.some((p) => p === "")) throw new Error(`lyric '${word}': empty syllable`);
    const real = parts.filter((p) => p !== HOLD_TOKEN);
    const whole = real.join("");
    let k = -1;
    for (const p of parts) {
      if (p === HOLD_TOKEN) {
        const prev = out[out.length - 1];
        if (!prev) throw new Error(`lyrics cannot start with '${HOLD_TOKEN}': there is no syllable to hold`);
        if (k < 0 && real.length > 0) throw new Error(`lyric '${word}': '${HOLD_TOKEN}' before the word's first syllable`);
        out.push({ lyric: prev.lyric, word: prev.word, syllable: prev.syllable, syllables: prev.syllables, continues: true });
      } else {
        k += 1;
        out.push({ lyric: p, word: whole, syllable: k, syllables: real.length });
      }
    }
  }
  return out;
}

export function roundToSample(sec: number, sampleRate = SCORE_CLOCK_SAMPLE_RATE): number {
  return Math.round(sec * sampleRate) / sampleRate;
}

export interface DeriveOptions {
  songId?: string;
  midiFile: string;
  midiBytes: Uint8Array;
  melodyTrack: string;
  lyrics: string;
  startMeasure: number;
  endMeasure: number;
  sampleRate?: number;
  /**
   * End each note where the melody track's own note ends, so a notated rest
   * is silence on the clock (a full song: breaths between phrases, the piano's
   * interludes between verses). The length is the note's ticks scaled into its
   * bar's session length, not the piano's: the session plays each hand as a
   * chain of chords as long as their longest note, so a breath the piano holds
   * through never shows in the schedule. Default false: legato, each note held
   * to the next onset, which is what the single-phrase clocks were derived with.
   */
  rests?: boolean;
}

/** A gap shorter than this between a note's end and the next onset is legato, not a rest. */
export const REST_MIN_SEC = 0.05;

/**
 * Derive the clock: melody notes come from the MIDI track (the tick map);
 * each one's `t_sec` is the session-nominal onset of the same pitch in the
 * same measure, chosen by nearest position-within-measure. The one melody
 * note that has no faithful piano onset (the m1 pickup, which the ingest
 * parks at t=0 in front of a 2.4 s hole) is anchored one hymn beat ahead of
 * the m2 downbeat, inside the piano's rest — the Director's placement.
 */
export function deriveScoreClock(song: SongEntry, opts: DeriveOptions): ScoreClock {
  const sr = opts.sampleRate ?? SCORE_CLOCK_SAMPLE_RATE;
  const { info, tracks } = parseMidiTracks(opts.midiBytes);
  const track = tracks.find((t) => t.name === opts.melodyTrack);
  if (!track) throw new Error(`melody track '${opts.melodyTrack}' not in ${JSON.stringify(info.trackNames)}`);
  if (Math.abs(info.bpm - song.tempo) > 0.01) {
    throw new Error(`MIDI tempo ${info.bpm} != song tempo ${song.tempo}`);
  }
  const secPerTick = 60 / info.bpm / info.ppq;
  const schedule = sessionSchedule(song, opts.startMeasure, opts.endMeasure);
  const starts = new Map(schedule.measureStarts.map((m) => [m.number, m]));

  const syllables = syllabify(opts.lyrics);
  const rests = opts.rests ?? false;
  const lastTick = (opts.endMeasure) * info.ticksPerMeasure;
  const melody = track.notes.filter((n) => n.tick < lastTick);
  // Legato needs one note past the last syllable (its onset ends the last
  // note). With notated rests every note carries its own end.
  if (melody.length < syllables.length + (rests ? 0 : 1)) {
    throw new Error(rests
      ? `melody track has ${melody.length} notes before measure ${opts.endMeasure + 1}; need ${syllables.length} (one per syllable and '${HOLD_TOKEN}')`
      : `melody track has ${melody.length} notes before measure ${opts.endMeasure + 1}; need ${syllables.length + 1} (syllables + terminator)`);
  }

  const events: ScoreClockEvent[] = [];
  const onsetFor = (n: MidiMelodyNote): { t: number; dur: number | null; anchor: string; engine: ScoreClockEvent["engine_note"] } => {
    const measure = Math.floor(n.tick / info.ticksPerMeasure) + 1;
    const frac = (n.tick % info.ticksPerMeasure) / info.ticksPerMeasure;
    const bar = starts.get(measure);
    if (!bar) throw new Error(`measure ${measure} outside schedule`);
    if (measure === opts.startMeasure && frac > 0) {
      // Pickup in the opening measure: the ingest plays it at t=0 (see the
      // module docstring); the vocal takes it one hymn beat before the next
      // downbeat, inside the piano's rest.
      const next = starts.get(measure + 1);
      if (!next) throw new Error("pickup needs a following measure");
      return { t: next.start - bar.dur / 3, dur: null, anchor: "hymn-pickup-during-piano-rest", engine: null };
    }
    const candidates = schedule.notes.filter((s) => s.measure === measure && s.midi === n.midi);
    if (candidates.length === 0) {
      throw new Error(`no piano note ${n.midi} in measure ${measure} for melody tick ${n.tick}`);
    }
    let best = candidates[0];
    let bestErr = Infinity;
    for (const c of candidates) {
      const err = Math.abs((c.t - bar.start) / bar.dur - frac);
      if (err < bestErr) { best = c; bestErr = err; }
    }
    const ties = candidates.filter((c) => Math.abs((c.t - bar.start) / bar.dur - frac) === bestErr && c.t !== best.t);
    if (ties.length > 0) throw new Error(`ambiguous piano onset for melody tick ${n.tick} (midi ${n.midi}, m${measure})`);
    return {
      t: best.t,
      dur: (n.durationTicks / info.ticksPerMeasure) * bar.dur,
      anchor: `piano-onset:m${measure}:${best.hand}:beat${best.beatIndex}`,
      engine: { measure, hand: best.hand, t_sec: roundToSample(best.t, sr) },
    };
  };

  const onsets = melody.slice(0, syllables.length + 1).map(onsetFor);
  const spanOf = (k: number): { t: number; end: number } => {
    const t = roundToSample(onsets[k].t, sr);
    const next = k + 1 < onsets.length ? roundToSample(onsets[k + 1].t, sr) : null;
    if (next !== null && next <= t) throw new Error(`non-increasing clock at event ${k}: ${t} -> ${next}`);
    let end = next;
    const own = onsets[k].dur;
    if (rests && own !== null) {
      const noteEnd = roundToSample(t + own, sr);
      if (next === null || noteEnd < next - REST_MIN_SEC) end = noteEnd;
    }
    if (end === null) throw new Error(`the last note (event ${k}) has no end: a pickup cannot close a song`);
    return { t, end };
  };
  for (let k = 0; k < syllables.length; k++) {
    const n = melody[k];
    const s = syllables[k];
    const { t, end } = spanOf(k);
    if (s.continues) {
      const prev = events[events.length - 1];
      const prevEnd = roundToSample(prev.t_sec + prev.dur_sec, sr);
      if (prevEnd !== t) throw new Error(`a rest inside a held syllable at note ${k} ('${s.lyric}'): ${prevEnd} -> ${t}`);
      (prev.melisma ??= []).push({
        midi: n.midi,
        t_sec: t,
        t_samples: Math.round(t * sr),
        dur_sec: roundToSample(end - t, sr),
        anchor: onsets[k].anchor,
        midi_tick: n.tick,
        engine_note: onsets[k].engine,
      });
      prev.dur_sec = roundToSample(end - prev.t_sec, sr);
      continue;
    }
    events.push({
      id: `v${String(events.length).padStart(2, "0")}`,
      lyric: s.lyric,
      word: s.word,
      syllable: s.syllable,
      syllables: s.syllables,
      midi: n.midi,
      t_sec: t,
      t_samples: Math.round(t * sr),
      dur_sec: roundToSample(end - t, sr),
      anchor: onsets[k].anchor,
      midi_tick: n.tick,
      t_midi_sec: +(n.tick * secPerTick).toFixed(6),
      engine_note: onsets[k].engine,
    });
  }

  const totalSamples = Math.round(schedule.endSec * sr);
  const measureStarts: Record<string, number> = {};
  const measureDurs: Record<string, number> = {};
  for (const m of schedule.measureStarts) {
    measureStarts[String(m.number)] = roundToSample(m.start, sr);
    measureDurs[String(m.number)] = roundToSample(m.dur, sr);
  }
  const last = events[events.length - 1];
  return {
    schema: SCORE_CLOCK_SCHEMA,
    song_id: opts.songId ?? song.id,
    bpm: song.tempo,
    time_signature: `${info.numerator}/${info.denominator}`,
    sample_rate: sr,
    total_seconds: totalSamples / sr,
    total_samples: totalSamples,
    last_event_end_sec: roundToSample(last.t_sec + last.dur_sec, sr),
    clock: {
      source: "session-nominal",
      bed_measures: [opts.startMeasure, opts.endMeasure],
      measure_starts_sec: measureStarts,
      measure_durations_sec: measureDurs,
      ...(rests ? { durations: "notated" as const } : {}),
    },
    midi: {
      file: opts.midiFile,
      ppq: info.ppq,
      ticks_per_measure: info.ticksPerMeasure,
      melody_track: opts.melodyTrack,
      sec_per_tick: +secPerTick.toFixed(9),
    },
    events,
  };
}
