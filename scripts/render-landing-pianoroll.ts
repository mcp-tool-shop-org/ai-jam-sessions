/**
 * Render a piano-roll SVG for the landing page exemplar.
 *
 *   pnpm exec tsx scripts/render-landing-pianoroll.ts \
 *       --song america-the-beautiful --measures 2-6 \
 *       --out site/public/america-the-beautiful-m2-6.svg
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { initializeFromLibrary, getSong } from "../src/songs/index.js";
import { renderPianoRoll } from "../src/piano-roll.js";

const args = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};

const songId = opt("song", "america-the-beautiful");
const [startMeasure, endMeasure] = opt("measures", "2-6").split("-").map(Number);
const out = opt("out", join("site", "public", `${songId}-m${startMeasure}-${endMeasure}.svg`));

initializeFromLibrary(
  join(process.cwd(), "songs", "library"),
  join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".ai-jam-sessions", "songs"),
);
const song = getSong(songId);
if (!song) {
  console.error(`song '${songId}' not in library`);
  process.exit(2);
}

const svg = renderPianoRoll(song, {
  startMeasure,
  endMeasure,
  pixelsPerBeat: 60,
  pitchRowHeight: 10,
  showMetronome: true,
  showDynamics: true,
  colorMode: "hand",
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, svg);
console.error(`wrote ${out}`);
