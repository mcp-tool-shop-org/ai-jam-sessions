// top_first_measure_share is computed over PASSING completions only (score-curriculum.mts:
// firstHist is populated inside `if (s.correct)`). So the arc's primary outcome measures
// the modal opening among admissible completions -- a blend of the POLICY'S PRIOR and the
// VERIFIER'S ADMISSIBILITY PROFILE.
//
// Those are different objects and only one of them is what "can RL move a typicality prior"
// is asking about. This reports both, from receipts already on disk, $0:
//   passing-only : the published statistic
//   all          : the policy's raw opening distribution, verifier removed
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const STYLE = process.env.STYLE ?? "common-practice";
const VOICES = Number(process.env.VOICES ?? 2);
const firstDeg = (raw: string) => ((parseSpecResponse(raw)[0]?.degrees ?? []) as number[]).join(",") || "(none)";

function report(genFile: string, promptsFile: string, label: string) {
  if (!existsSync(join(RUNS, genFile))) return;
  const byId = new Map(readFileSync(join(RUNS, promptsFile), "utf8").trim().split("\n")
    .map((l) => JSON.parse(l)).map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
  const hPass = new Map<string, number>(), hAll = new Map<string, number>();
  let nPass = 0, nAll = 0;
  for (const l of readFileSync(join(RUNS, genFile), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    for (const raw of r.completions) {
      const d = firstDeg(raw);
      hAll.set(d, (hAll.get(d) ?? 0) + 1); nAll++;
      if (scoreVoicing(prog, raw, VOICES, STYLE).correct) {
        hPass.set(d, (hPass.get(d) ?? 0) + 1); nPass++;
      }
    }
  }
  const share = (h: Map<string, number>, n: number) => (n ? Math.max(...h.values()) / n : 0);
  const modal = (h: Map<string, number>) => [...h.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
  console.log(
    `${label.padEnd(16)} passing ${share(hPass, nPass).toFixed(3)} (modal ${modal(hPass)}, ${hPass.size} distinct, n=${nPass})` +
    `   ALL ${share(hAll, nAll).toFixed(3)} (modal ${modal(hAll)}, ${hAll.size} distinct, n=${nAll})`
  );
}

console.log("\n=== HELD-OUT POOL — opening concentration, passing-only vs all completions ===");
for (const a of ["base", "A", "B", "C", "D"]) report(`mc-heldout-${a}.jsonl`, "prompts-heldout-v1.jsonl", a);
console.log("\n=== TRAINED POOL ===");
for (const a of ["base", "A", "B", "C", "D"]) report(`mc-trained-${a}.jsonl`, "prompts-trained-v1.jsonl", a);
console.log("\nIf 'passing' >> 'ALL', the published statistic is reporting what the RULEBOOK admits");
console.log("as much as what the POLICY prefers, and a prior-flattening arm aimed at it is aimed");
console.log("at a blend. The uniform-over-16-openings floor of 0.438 assumes equal admissibility.");

// METHOD CHECK. The arc's PRIMARY outcome was measured on the 4-bar random pool, not on
// the matched cell. Reproducing the published figures here proves this script computes the
// same statistic as score-curriculum.mts before any new number from it is believed.
// FOUR-ARM-RESULTS.md: base 0.889  A 0.841  B 0.848  C 0.820  D 0.829
console.log("\n=== METHOD CHECK — the published primary, 4-bar random pool ===");
console.log("expected (FOUR-ARM-RESULTS.md): base 0.889  A 0.841  B 0.848  C 0.820  D 0.829");
for (const a of ["base", "A", "B", "C", "D"]) report(`eval-${a}.jsonl`, "spec-prompts-4bar-random.jsonl", a);
