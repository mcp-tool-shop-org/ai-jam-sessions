/**
 * The landing page's data for the two sung exemplars: the sung line from each
 * hymn's score clock (the clock the vocal was placed on), the piano bed's notes
 * from the same arrangement the bed was rendered from (realizeHymn, or for a hymn
 * sung over a piano arrangement, that arrangement as performed: bedNotes), and the
 * lyric lines, so the three.js view and the sing-along line read one timeline.
 *
 *   npx tsx scripts/site-hymn-visual.ts           # write site/src/data/hymns.visual.json
 *   npx tsx scripts/site-hymn-visual.ts --check   # exit 1 if the committed file is stale
 *
 * Both hymns are public domain (sources in src/vocal/hymns.ts).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { AMAZING_GRACE, AMERICA_THE_BEAUTIFUL, PPQ, realizeHymn, type Hymn } from "../src/vocal/hymns.js";
import { bedNotes } from "../src/vocal/arrangement.js";

const OUT = "site/src/data/hymns.visual.json";
const LINE_GAP_S = 0.3; // a rest this long ends a sung line (the phrase pick's gap)
const ALIGN_TOL_S = 0.02;

interface ClockEvent {
  id: string;
  lyric: string;
  word: string;
  syllable: number;
  midi: number;
  t_sec: number;
  dur_sec: number;
  melisma?: Array<{ midi: number; t_sec: number; dur_sec: number }>;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function songData(hymn: Hymn, clockPath: string) {
  const clock = JSON.parse(readFileSync(clockPath, "utf8")) as { total_seconds: number; events: ClockEvent[] };
  const sec = 60 / hymn.bpm / PPQ;
  const real = hymn.arrangement ? null : realizeHymn(hymn);

  // The clock was derived from this arrangement: its first sung note must be the
  // MELODY track's first note, or the piano lane would drift from the voice. (An
  // arrangement's clock is checked note by note against it when it is built.)
  if (real) {
    const firstMelody = Math.min(...real.tracks.MELODY.map((n) => n.tick)) * sec;
    const firstSung = clock.events[0].t_sec;
    if (Math.abs(firstMelody - firstSung) > ALIGN_TOL_S) {
      throw new Error(`${hymn.id}: melody starts at ${firstMelody.toFixed(3)} s, the clock at ${firstSung.toFixed(3)} s`);
    }
  }

  const melody: number[][] = []; // [t, dur, midi, syllable index]
  const syllables: Array<{ t: number; text: string; word: string; end: number; pos: number }> = [];
  clock.events.forEach((e, i) => {
    const held = e.melisma ?? [];
    const end = held.length ? held[held.length - 1].t_sec + held[held.length - 1].dur_sec : e.t_sec + e.dur_sec;
    const firstDur = held.length ? held[0].t_sec - e.t_sec : e.dur_sec;
    melody.push([r3(e.t_sec), r3(firstDur), e.midi, i]);
    for (const h of held) melody.push([r3(h.t_sec), r3(h.dur_sec), h.midi, i]);
    syllables.push({ t: r3(e.t_sec), text: e.lyric, word: e.word, end: r3(end), pos: e.syllable });
  });

  // Lines: split where the singer rests at least LINE_GAP_S.
  const lines: Array<{ t0: number; t1: number; from: number; to: number }> = [];
  syllables.forEach((s, i) => {
    const last = lines[lines.length - 1];
    if (last && s.t - syllables[i - 1].end < LINE_GAP_S) {
      last.t1 = s.end;
      last.to = i;
    } else {
      lines.push({ t0: s.t, t1: s.end, from: i, to: i });
    }
  });

  const piano: number[][] = []; // [t, dur, midi, velocity]
  if (real) {
    for (const [name, notes] of Object.entries(real.tracks)) {
      if (name === "MELODY") continue;
      for (const n of notes) piano.push([r3(n.tick * sec), r3(n.dur * sec), n.midi, n.velocity]);
    }
  } else {
    for (const n of bedNotes(hymn)) piano.push([r3(n.t), r3(n.dur), n.midi, n.vel]);
  }
  piano.sort((a, b) => a[0] - b[0] || a[2] - b[2]);

  return {
    id: hymn.id,
    title: hymn.title,
    tune: hymn.tune,
    composer: hymn.composer,
    textAuthor: hymn.textAuthor,
    key: hymn.key,
    bpm: hymn.bpm,
    verses: hymn.verses.length,
    duration: clock.total_seconds,
    melody,
    // [t, text, word, end, position in its word (0 starts a word)]
    syllables: syllables.map((s) => [s.t, s.text, s.word, s.end, s.pos]),
    lines: lines.map((l) => [r3(l.t0), r3(l.t1), l.from, l.to]),
    piano,
  };
}

export function build(): string {
  const songs = [
    songData(AMAZING_GRACE, "scores/amazing-grace-new-britain.score-clock.v1.json"),
    songData(AMERICA_THE_BEAUTIFUL, "scores/america-the-beautiful-materna.score-clock.v1.json"),
  ];
  return JSON.stringify({ schema: "ai-jam-sessions/site-hymns/v1", songs }) + "\n";
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!);
if (isMain) {
  const text = build();
  if (process.argv.includes("--check")) {
    const committed = readFileSync(OUT, "utf8");
    if (committed !== text) {
      console.error(`${OUT} is stale: run npx tsx scripts/site-hymn-visual.ts`);
      process.exit(1);
    }
    console.log(`${OUT} is current`);
  } else {
    writeFileSync(OUT, text);
    console.log(`wrote ${OUT} (${text.length} bytes)`);
  }
}
