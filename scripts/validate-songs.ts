#!/usr/bin/env npx tsx
// ─── Validate All Builtin Songs ──────────────────────────────────────────────
//
// Loads all JSON files from songs/builtin/, validates each against the
// SongEntry schema, and reports errors. Exits with code 1 if any fail.
//
// Usage: npx tsx scripts/validate-songs.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSong } from "../src/songs/registry.js";
import { GENRES } from "../src/songs/types.js";
import type { SongEntry, Genre } from "../src/songs/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILTIN_DIR = join(__dirname, "..", "songs", "builtin");

let totalFiles = 0;
let passed = 0;
let failed = 0;
const byGenre: Record<string, number> = {};
const byDifficulty: Record<string, number> = {};

const files = readdirSync(BUILTIN_DIR).filter(f => f.endsWith(".json")).sort();
totalFiles = files.length;

for (const file of files) {
  const filePath = join(BUILTIN_DIR, file);
  try {
    const raw = readFileSync(filePath, "utf-8");
    const song = JSON.parse(raw) as SongEntry;
    const errors = validateSong(song);

    if (errors.length > 0) {
      console.error(`FAIL ${file}:`);
      for (const e of errors) {
        console.error(`  - ${e}`);
      }
      failed++;
    } else {
      passed++;
      byGenre[song.genre] = (byGenre[song.genre] ?? 0) + 1;
      byDifficulty[song.difficulty] = (byDifficulty[song.difficulty] ?? 0) + 1;
    }
  } catch (err) {
    console.error(`FAIL ${file}: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

// Summary
console.log(`\n─── Validation Summary ───`);
console.log(`Total files: ${totalFiles}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

console.log(`\nBy genre:`);
for (const g of GENRES) {
  const count = byGenre[g] ?? 0;
  const bar = count > 0 ? "█".repeat(count) : "";
  console.log(`  ${g.padEnd(12)} ${String(count).padStart(3)} ${bar}`);
}

console.log(`\nBy difficulty:`);
for (const d of ["beginner", "intermediate", "advanced"]) {
  const count = byDifficulty[d] ?? 0;
  console.log(`  ${d.padEnd(14)} ${String(count).padStart(3)}`);
}

if (failed > 0) {
  console.error(`\n${failed} song(s) failed validation.`);
  process.exit(1);
} else {
  console.log(`\nAll ${passed} songs are valid.`);
}
