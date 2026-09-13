// Emit eval prompts FROM A FIXTURE, not from the song library.
//
// Every prompt file in this arc so far was emitted straight from `songs/library`, which
// ships 14 of 108 songs — so those files record a population that cannot be rebuilt from
// the repository, and worse, they record it at whatever window that script happened to
// use. That is how the arc ended up evaluating 4-chord and 5-chord pools against arms
// trained on 8-bar / 6-8 chord progressions and calling one of them "in-sample".
//
// A fixture pins the population. This pins the prompts to the fixture, using the BRIDGE'S
// OWN `vlCaseRow`, so an eval prompt is built by the same code path that built every
// training prompt. If the two ever diverge, they diverge together.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vlCaseRow } from "../../scripts/p4-vl-server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, "..", "runs");
const FIXTURES = join(HERE, "..", "fixtures");

const FIXTURE = process.env.FIXTURE ?? "progressions-heldout-v1.json";
const OUT = process.env.OUT ?? "prompts-heldout-v1.jsonl";
const VOICES = Number(process.env.VOICES ?? 2);
const STYLE = process.env.STYLE ?? "common-practice";

const fx = JSON.parse(readFileSync(join(FIXTURES, FIXTURE), "utf8"));
if (fx.schema !== "p4-progressions/1") throw new Error(`HALT: ${FIXTURE} is schema ${fx.schema}`);

const rows = fx.progressions.map(
  (p: { songId: string; genre: string; progression: { chords: Array<{ chordSymbol: string }> } }) => {
    const c = vlCaseRow(p.songId, p.progression, VOICES, STYLE);
    return {
      itemId: p.songId,
      songId: p.songId,
      genre: p.genre,
      chords: c.chords,
      progression: p.progression,
      system: c.system,
      user: c.user,
    };
  }
);

writeFileSync(join(RUNS, OUT), rows.map((r: unknown) => JSON.stringify(r)).join("\n") + "\n");
console.log(`${rows.length} prompts from ${FIXTURE} (${fx.provenance.slice ?? "[0, n)"}, ${fx.provenance.bars} bars)`);
console.log(`  voices ${VOICES}, style ${STYLE} -> runs/${OUT}`);
console.log(`  chords/item: ${Math.min(...rows.map((r: { chords: number }) => r.chords))}-${Math.max(...rows.map((r: { chords: number }) => r.chords))}`);
console.log(`  first 3: ${rows.slice(0, 3).map((r: { songId: string }) => r.songId).join(", ")}`);
