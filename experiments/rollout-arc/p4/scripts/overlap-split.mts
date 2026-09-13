// THE TEST THAT SHOULD HAVE BEEN RUN FIRST: split each eval pool by whether the song
// was actually TRAINED ON, and compare the lift on each half.
//
// Why this exists. The four-arm run trained on `fixtures/progressions-v1.json` -- 32
// songs at EIGHT BARS, 6-8 named chords. The eval pools are different objects:
//
//   spec-prompts-4bar-random.jsonl   32 songs, 4 chords, 15/32 songs also trained
//   spec-prompts-v2-holdout.jsonl    32 songs, 5 chords,  9/32 songs also trained
//
// So the pool labelled "in-sample" was 47% overlapping at a DIFFERENT window, and the
// pool labelled "held-out" was 72% unseen rather than the 91% claimed -- that figure
// came from comparing the holdout against the OTHER EVAL POOL instead of against the
// training fixture. Both labels were wrong.
//
// The labels were never the measurement, though. Memorisation is a claim about whether
// a lift concentrates on items the model saw, and both pools contain both kinds of
// item, so the claim is directly testable within each pool. That is this file.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, "..", "runs");
const FIX = join(HERE, "..", "fixtures", "progressions-v1.json");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);

const trained = new Set<string>(
  (JSON.parse(readFileSync(FIX, "utf8")).progressions as Array<{ songId: string }>).map((p) => p.songId)
);

function perItem(gen: string, prompts: string) {
  if (!existsSync(join(RUNS, gen))) return null;
  const meta = new Map<string, { prog: unknown; songId: string }>();
  for (const l of readFileSync(join(RUNS, prompts), "utf8").trim().split("\n")) {
    const p = JSON.parse(l) as { itemId: string; songId: string; progression: unknown };
    meta.set(p.itemId, { prog: p.progression, songId: p.songId });
  }
  const out = new Map<string, { rate: number; songId: string }>();
  for (const l of readFileSync(join(RUNS, gen), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const m = meta.get(r.itemId);
    if (!m) continue;
    let k = 0;
    for (const c of r.completions) if (scoreVoicing(m.prog, c, VOICES, STYLE).correct) k++;
    out.set(r.itemId, { rate: k / r.completions.length, songId: m.songId });
  }
  return out;
}

function stats(d: number[]) {
  const n = d.length;
  if (n < 2) return null;
  const mean = d.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  // t critical, two-sided 0.05, by df -- small samples here, so it matters.
  const T: Record<number, number> = { 5: 2.571, 8: 2.306, 10: 2.228, 14: 2.145, 16: 2.120, 22: 2.074, 31: 2.040 };
  const df = n - 1;
  const keys = Object.keys(T).map(Number).sort((a, b) => a - b);
  const t = T[keys.find((k) => k >= df) ?? 31]!;
  return { n, mean, lo: mean - t * se, hi: mean + t * se };
}

const pp = (v: number) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}`;

for (const [tag, pre, pr] of [
  ["POOL 1 — spec-prompts-4bar-random (4 chords)", "eval", "spec-prompts-4bar-random.jsonl"],
  ["POOL 2 — spec-prompts-v2-holdout (5 chords)", "held", "spec-prompts-v2-holdout.jsonl"],
] as const) {
  const base = perItem(`${pre}-base.jsonl`, pr);
  if (!base) continue;
  const ids = [...base.keys()];
  const seen = ids.filter((i) => trained.has(base.get(i)!.songId));
  const unseen = ids.filter((i) => !trained.has(base.get(i)!.songId));
  console.log(`\n=== ${tag} ===`);
  console.log(`  ${seen.length} items whose SONG was trained on, ${unseen.length} whose song was not`);
  console.log(
    "  arm".padEnd(20) + "TRAINED songs".padEnd(30) + "UNTRAINED songs".padEnd(30) + "difference"
  );
  for (const arm of ["A", "B", "C", "D"]) {
    const a = perItem(`${pre}-${arm}.jsonl`, pr);
    if (!a) continue;
    const dz = (set: string[]) => set.filter((i) => a.has(i)).map((i) => a.get(i)!.rate - base.get(i)!.rate);
    const s = stats(dz(seen));
    const u = stats(dz(unseen));
    if (!s || !u) continue;
    const gap = s.mean - u.mean;
    console.log(
      "  " + arm.padEnd(18) +
        `${pp(s.mean)}pp [${pp(s.lo)}, ${pp(s.hi)}] n=${s.n}`.padEnd(30) +
        `${pp(u.mean)}pp [${pp(u.lo)}, ${pp(u.hi)}] n=${u.n}`.padEnd(30) +
        `${pp(gap)}pp`
    );
  }
}
console.log(
  "\nMEMORISATION would put the lift on the TRAINED-songs column and nothing on the other.\n" +
    "A lift that is present in both columns is not memorisation, whatever the pools are called."
);
