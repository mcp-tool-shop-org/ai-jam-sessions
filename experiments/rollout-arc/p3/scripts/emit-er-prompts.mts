// Substrate probe, stage 1 — emit the ABC-reharmonization prompts.
//
// The P2 arc died because a completion was a tool call copied from the prompt
// plus one number: 1.09 distinct spans of 8, entropy 2e-4. This probe points the
// same instrument at a GENERATIVE surface — write an ABC lead sheet — scored by
// the deterministic E-R gate (chord fidelity AND melody consonance AND a
// non-triviality guard). Nothing here calls a model; it only writes prompts.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../../../../src/songs/library.js";
import { getAllSongs } from "../../../../src/songs/registry.js";
import { selectERItems } from "../../../../src/maker/er-gate.js";
import { ABC_REHARM_SYSTEM, buildAbcReharmUser } from "../../../../src/maker/abc-chord-proposer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const itemsPerGenre = Number(process.env.ITEMS_PER_GENRE ?? 4);

initializeFromLibrary(join(__dirname, "..", "..", "..", "..", "songs", "library"));
const songs = getAllSongs();
const items = selectERItems(songs, { itemsPerGenre, sectionBars: 8 });

const out = items.map((item) => ({
  itemId: item.itemId,
  songId: item.songId,
  system: ABC_REHARM_SYSTEM,
  user: buildAbcReharmUser(item),
}));

const dir = join(__dirname, "..", "runs");
mkdirSync(dir, { recursive: true });
const path = join(dir, "er-prompts.jsonl");
writeFileSync(path, out.map((o) => JSON.stringify(o)).join("\n") + "\n");
writeFileSync(join(dir, "er-items.json"), JSON.stringify(items, null, 2));
console.log(`items=${items.length} itemsPerGenre=${itemsPerGenre}`);
console.log(`genres=${new Set(items.map((i) => i.itemId.split(":")[0])).size} songs`);
console.log(`wrote ${path}`);
console.log(`\n--- sample user prompt (${out[0]!.itemId}) ---\n${out[0]!.user.slice(0, 700)}`);
