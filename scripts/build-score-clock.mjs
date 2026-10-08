/**
 * Build the canonical score clock for a song's vocal line and write it to
 * `scores/<song>.score-clock.v1.json` (committed — it is the clock the bed
 * renderer and the vocal placement instrument both read).
 *
 *   pnpm exec tsx scripts/build-score-clock.mjs [--song amazing-grace]
 *       [--track TUBULARBEL] [--measures 1-10] [--out scores/...json] [--check]
 *       [--rests]   (notes end where the arrangement's notes end; '_' in --lyrics holds a syllable)
 *       [--interpretation '{"amount":1,"rules":{"glory":1}}']   (an arrangement hymn: a variant
 *        performance for an A/B, recorded in the clock; write it with --out, not over the canonical clock)
 *
 * `--check` re-derives and exits 1 if the committed file differs (CI-style
 * drift guard). See src/vocal/score-clock.ts for what the clock means.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { initializeFromLibrary, getSong } from "../src/songs/index.ts";
import { deriveScoreClock, parseMidiTracks } from "../src/vocal/score-clock.ts";
import { getVocalTune } from "../src/vocal/tunes.ts";
import { getHymn, hymnLyrics, loadExemplarSong } from "../src/vocal/hymns.ts";
import { arrangementClock } from "../src/vocal/arrangement.ts";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const songId = opt("song", "amazing-grace");
const track = opt("track", "TUBULARBEL");
const [startMeasure, endMeasure] = opt("measures", "1-10").split("-").map(Number);
const out = opt("out", join("scores", `${songId}.score-clock.v1.json`));
const check = args.includes("--check");
const interpArg = opt("interpretation", undefined);
const interp = interpArg === undefined ? undefined : JSON.parse(interpArg);
if (interp !== undefined && !args.includes("--out")) {
  console.error("--interpretation builds a variant: give it its own --out");
  process.exit(2);
}
// Notated rests: each note ends where the arrangement's note ends (a full song
// with breaths and interludes). Without it, every note is held to the next onset.
const rests = args.includes("--rests");
const listTracks = args.includes("--list-tracks");
// Lyrics: one token per melody note, syllables joined by "-" inside a word
// ("A-ma-zing grace how sweet…"). Overrides the tune registered in tunes.ts.
const lyricsArg = opt("lyrics", null);

initializeFromLibrary(
  join(process.cwd(), "songs", "library"),
  join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".ai-jam-sessions", "songs"),
);
// A sung exemplar's arrangement is built from src/vocal/hymns.ts, outside the library.
const exemplar = loadExemplarSong(songId);
const song = exemplar?.song ?? getSong(songId);
if (!song) {
  console.error(`song '${songId}' not in the library or src/vocal/hymns.ts`);
  process.exit(2);
}
const midiFile = exemplar?.midiFile ?? join("songs", "library", song.genre, `${songId}.mid`);
const midiBytesOf = () => exemplar?.midiBytes ?? readFileSync(midiFile);
if (!exemplar && !existsSync(midiFile)) {
  console.error(`no MIDI source at ${midiFile}`);
  process.exit(2);
}
if (listTracks) {
  const { info, tracks } = parseMidiTracks(midiBytesOf());
  console.error(`${midiFile}: ${info.ppq} ppq, ${info.numerator}/${info.denominator}, ${info.bpm} BPM, ${info.ticksPerMeasure} ticks/measure`);
  for (const t of tracks) {
    if (t.notes.length === 0) continue;
    const first = t.notes[0];
    const range = [Math.min(...t.notes.map((n) => n.midi)), Math.max(...t.notes.map((n) => n.midi))];
    console.error(`  ${(t.name || "(unnamed)").padEnd(14)} ${String(t.notes.length).padStart(5)} notes  midi ${range[0]}–${range[1]}  first @ tick ${first.tick} (measure ${Math.floor(first.tick / info.ticksPerMeasure) + 1})`);
  }
  console.error("pick the monophonic track that carries the tune with --track NAME");
  process.exit(0);
}
const tune = getVocalTune(songId);
// A whole-song hymn (src/vocal/hymns.ts) carries every verse, holds included.
const lyrics = lyricsArg ?? tune?.lyrics ?? hymnLyrics(songId);
if (!lyrics) {
  console.error(`no lyrics: pass --lyrics "A-ma-zing grace how sweet…" (one token per melody note, syllables joined by '-') or register a tune in src/vocal/tunes.ts`);
  process.exit(2);
}

// A hymn sung over an arrangement is timed by the arrangement, not the session engine.
const clock = getHymn(songId)?.arrangement ? arrangementClock(getHymn(songId), interp) : deriveScoreClock(song, {
  midiFile: midiFile.replace(/\\/g, "/"),
  midiBytes: midiBytesOf(),
  melodyTrack: track,
  lyrics,
  startMeasure,
  endMeasure,
  rests,
});
const text = JSON.stringify(clock, null, 2) + "\n";

if (check) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current !== text) {
    console.error(`score clock drift: ${out} does not match the derivation`);
    process.exit(1);
  }
  console.error(`score clock ${out} is current (${clock.events.length} events, ${clock.total_seconds}s)`);
  process.exit(0);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, text);
console.error(`wrote ${out}: ${clock.events.length} events, total ${clock.total_seconds}s (${clock.total_samples} samples @ ${clock.sample_rate})`);
for (const e of clock.events) {
  console.error(`  ${e.id} ${e.lyric.padEnd(6)} t=${e.t_sec.toFixed(4)} dur=${e.dur_sec.toFixed(4)} midi=${e.midi} ${e.anchor}`);
}
