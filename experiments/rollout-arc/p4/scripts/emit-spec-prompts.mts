// P4 substrate probe, stage 1 — emit the voice-leading (part-writing) prompts.
//
// P3 established that reharmonization has no setting where difficulty is MUSICAL
// and inside the band: the frozen gate saturates at 0.898, adding ABC syntax buys
// 49 points of NOTATION difficulty, and adding self-consistency drops to ~0.048.
// Voice-leading has the property reharmonization lacks — the output is JSON, so
// notation cannot confound, and the gate is entirely counterpoint.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../../../../src/songs/library.js";
import { getAllSongs } from "../../../../src/songs/registry.js";
import { analyzeHarmony } from "../../../../src/analysis/index.js";
import { progressionFromAnalysis, specSystem, buildSpecUser } from "../../../../src/compose/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..", "..", "..");
const VOICES = Number(process.env.VOICES ?? 4);
const LO = 1;
const HI = Number(process.env.BARS ?? 8);

initializeFromLibrary(join(REPO, "songs", "library"));
const all = getAllSongs();

const out: Array<Record<string, unknown>> = [];
for (const song of all) {
  let progression;
  try {
    progression = progressionFromAnalysis(analyzeHarmony(song, { measureRange: [LO, HI] }));
  } catch {
    continue;
  }
  const named = progression.chords.filter((c) => c.chordSymbol && c.chordSymbol !== "N/C");
  // Need a real progression to voice: at least 4 named chords.
  if (named.length < 4) continue;
  out.push({
    itemId: song.id,
    songId: song.id,
    chords: named.length,
    key: progression.key,
    progression,
    system: specSystem(VOICES),
    user: buildSpecUser(progression, VOICES),
  });
}

const dir = join(__dirname, "..", "runs");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "spec-prompts.jsonl"), out.map((o) => JSON.stringify(o)).join("\n") + "\n");
console.log(`items=${out.length} voices=${VOICES} bars=${LO}-${HI}`);
console.log(`mean named chords per item: ${(out.reduce((a, o) => a + (o.chords as number), 0) / out.length).toFixed(1)}`);
console.log(`\n--- sample user (${out[0]!.songId}) ---\n${String(out[0]!.user).slice(0, 420)}`);
