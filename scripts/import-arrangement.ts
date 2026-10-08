/**
 * Import a piano arrangement's notes as data, for a sung exemplar that is accompanied
 * by someone else's arrangement rather than this project's block chords.
 *
 *   pnpm exec tsx scripts/import-arrangement.ts --midi <file.mid> --out src/vocal/arrangements/<id>.json \
 *       --id <id> --source-url <url> --source-commit <sha> --licence CC0-1.0 --credit "<who made it>" \
 *       [--pickup-ticks 192 --pickups 4608,29376,...] [--beats-per-bar 3] [--offset-ticks 768]
 *
 * The notes are committed as JSON, not as a MIDI file: the derived-content guard
 * admits a tracked MIDI file only as a cleared library song's evidenced file, and an
 * exemplar's accompaniment is not a library song. The source file's sha256 and the
 * commit it was read at are recorded, so the import can be checked against it.
 *
 * `--pickups` names the ticks where the source starts a partial measure of
 * `--pickup-ticks` (LilyPond's mid-piece \partial). The arrangement module moves each
 * pickup into the last beat of the bar before, so every downbeat lands on the bar grid.
 *
 * `--offset-ticks` delays every note (and every tempo change after the first) by that
 * much: a piece that opens with an upbeat (`\partial` at the start) gets silent beats
 * before it, so its first full bar starts on the grid. `--pickups` are given after it.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseMidi } from "midi-file";

const args = process.argv.slice(2);
const opt = (name: string, dflt?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const midiPath = opt("midi");
const out = opt("out");
if (!midiPath || !out) {
  console.error("usage: import-arrangement.ts --midi <file.mid> --out <file.json> --id <id> ...");
  process.exit(2);
}
const bytes = readFileSync(midiPath);
const midi = parseMidi(bytes);
const tempos: { tick: number; bpm: number }[] = [];
const notes: { tick: number; dur: number; midi: number; vel: number; track: string }[] = [];
midi.tracks.forEach((track, i) => {
  let tick = 0;
  let name = `track${i}`;
  const open = new Map<number, { tick: number; vel: number }[]>();
  for (const e of track as Array<Record<string, any>>) {
    tick += e.deltaTime;
    if (e.type === "trackName") name = String(e.text).replace(/:$/, "");
    else if (e.type === "setTempo") tempos.push({ tick, bpm: Math.round((60_000_000 / e.microsecondsPerBeat) * 1000) / 1000 });
    else if (e.type === "noteOn" && e.velocity > 0) {
      if (!open.has(e.noteNumber)) open.set(e.noteNumber, []);
      open.get(e.noteNumber)!.push({ tick, vel: e.velocity });
    } else if (e.type === "noteOff" || (e.type === "noteOn" && e.velocity === 0)) {
      const on = open.get(e.noteNumber)?.shift();
      if (on) notes.push({ tick: on.tick, dur: tick - on.tick, midi: e.noteNumber, vel: on.vel, track: name });
    }
  }
});
const offset = Number(opt("offset-ticks", "0"));
for (const n of notes) n.tick += offset;
for (const t of tempos) if (t.tick > 0) t.tick += offset;
notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
const doc = {
  schema: "ai-jam-sessions/arrangement/v1",
  id: opt("id"),
  credit: opt("credit"),
  licence: opt("licence"),
  source: { url: opt("source-url"), commit: opt("source-commit"), file: midiPath.replace(/\\/g, "/").split("/").pop(), sha256: createHash("sha256").update(bytes).digest("hex") },
  ppq: midi.header.ticksPerBeat,
  beats_per_bar: Number(opt("beats-per-bar", "4")),
  pickup_ticks: Number(opt("pickup-ticks", "0")),
  pickups: (opt("pickups", "") as string).split(",").filter(Boolean).map(Number),
  tempos,
  notes,
};
writeFileSync(out, JSON.stringify(doc) + "\n");
console.log(`${out}: ${notes.length} notes, ${tempos.length} tempo events, ppq ${doc.ppq}, ${doc.pickups.length} pickups`);
