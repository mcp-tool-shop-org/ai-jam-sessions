// Freeze the P4 population into the repository.
//
// THE DEFECT THIS FIXES. songs/library ships 14 songs with redistributable MIDI;
// the other 94 are fetched from source and never enter git (see package.json's
// own description). A dev rig that has fetched them sees 108 ready songs and
// builds a 107-progression pool; a FRESH CLONE SEES 14. Every P4 figure was
// measured against a pool that cannot be rebuilt from the repository, and the
// smoke run discovered it by serving a 14-song pool to a trainer asking for 32.
//
// The task needs only the derived data — chord symbols per measure — which is
// small and carries no MIDI. Freezing it makes the population reproducible on any
// clone, any container, any runner, and retroactively pins what P4 measured.
//
// Run this ONCE, on a rig with the full library. It is not part of any run.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../../../../src/songs/library.js";
import { getAllSongs } from "../../../../src/songs/registry.js";
import { analyzeHarmony } from "../../../../src/analysis/index.js";
import { progressionFromAnalysis } from "../../../../src/compose/index.js";
import { shuffled } from "../../scripts/p4-vl-server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..");
const BARS = Number(process.env.BARS ?? 8);
const SEED = Number(process.env.SEED ?? 20260913);
const TAKE = Number(process.env.TAKE ?? 32);

initializeFromLibrary(join(REPO, "songs", "library"));
const songs = getAllSongs();

const pool: Array<{ songId: string; genre: string; progression: unknown }> = [];
for (const song of songs) {
  let progression;
  try {
    progression = progressionFromAnalysis(analyzeHarmony(song, { measureRange: [1, BARS] }));
  } catch {
    continue;
  }
  const named = progression.chords.filter((c) => c.chordSymbol && c.chordSymbol !== "N/C");
  if (named.length < 4) continue;
  pool.push({ songId: song.id, genre: song.genre, progression });
}

if (pool.length < TAKE) {
  throw new Error(
    `HALT: only ${pool.length} progressions available, need ${TAKE}. This rig's song ` +
      `library is not fully fetched — emit the fixture from a rig where it is.`
  );
}

// The SAME shuffle the bridge and the P4 probe use, so the frozen set is the set
// that was measured, not a new draw that happens to be the same size.
const ordered = shuffled(pool, SEED);
const take = ordered.slice(0, TAKE);
const genres: Record<string, number> = {};
for (const p of take) genres[p.genre] = (genres[p.genre] ?? 0) + 1;

const fixture = {
  schema: "p4-progressions/1",
  provenance: {
    emitted: new Date().toISOString().slice(0, 10),
    why:
      "songs/library ships only 14 redistributable songs; the other 94 are fetched from " +
      "source and are not in git. Without this fixture a fresh clone builds a 14-song pool " +
      "and every P4 figure is unreproducible.",
    pool_available_at_emit: pool.length,
    shuffle: `mulberry32(${SEED})`,
    bars: BARS,
    note: "Derived chord symbols only — no MIDI, no audio, nothing licence-encumbered.",
  },
  genres,
  n: take.length,
  progressions: take.map((p) => ({ songId: p.songId, genre: p.genre, progression: p.progression })),
};

const out = join(HERE, "..", "fixtures");
mkdirSync(out, { recursive: true });
const path = join(out, "progressions-v1.json");
writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n");

console.log(`pool available: ${pool.length}`);
console.log(`frozen: ${take.length} progressions -> ${path}`);
console.log(`genres: ${Object.entries(genres).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  ")}`);
console.log(`first 3: ${take.slice(0, 3).map((p) => p.songId).join(", ")}`);
