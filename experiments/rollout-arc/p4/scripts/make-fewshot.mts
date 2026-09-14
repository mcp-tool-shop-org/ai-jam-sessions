// Build ONE few-shot exemplar for lever 1. Three rules, each of which the first draft broke:
//   1. It comes from the TRAINED pool (prompts-trained-v1.jsonl), never the 75 held-out items.
//      An exemplar drawn from the eval pool is leakage dressed as prompt engineering.
//   2. Its answer is VERIFIED by the same scoreVoicing the reward uses. The first draft
//      synthesised specs by repeating one opening across every measure and found none valid --
//      correctly, because that is not voice leading. Searching for a plausible-looking answer
//      and assuming it passes would have taught the model an inadmissible voicing while
//      looking like it worked.
//   3. It is a REAL completion, not a construction: pulled from an existing base-model eval of
//      the trained pool and kept only if the verifier marks it correct.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const P4 = join(here, "..");
const R = (f: string) => readFileSync(join(P4, "runs", f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const prompts = R("prompts-trained-v1.jsonl");
const byId = new Map(prompts.map((p: any) => [p.itemId, p]));
const held = new Set(R("prompts-heldout-v1.jsonl").map((p: any) => p.itemId));

let best: { item: any; text: string; score: number } | null = null;
for (const ev of R("mc-trained-base.jsonl")) {
  const item = byId.get(ev.itemId);
  if (!item) continue;
  if (held.has(ev.itemId)) { console.error(`HALT: ${ev.itemId} is in the HELD-OUT pool`); process.exit(1); }
  for (const c of ev.completions as string[]) {
    const sc = scoreVoicing(item.progression, c, 2, "common-practice");
    if (!sc.correct) continue;
    // ⚑ "correct" IS NOT ENOUGH, and the first selector proved it. Choosing the shortest
    // verifier-correct completion returned an 8-measure answer that repeated [0,1] identically
    // in every measure, on a progression that was mostly N/C, with first_measure_ok FALSE.
    // That exemplar teaches (a) an INADMISSIBLE opening and (b) emit-the-same-thing-every-bar
    // -- which is the exact collapse FORMAT-CLAUSE.md's third row exists to reject. Buying
    // format by teaching degeneracy would have scored as a win and been the failure.
    if (!sc.first_measure_ok) continue;                       // the opening must be admissible
    const t = c.trim();
    if (!t.startsWith("[") || !t.endsWith("]")) continue;      // the exemplar teaches the CONTAINER
    let spec: any[]; try { spec = JSON.parse(t); } catch { continue; }
    const shapes = new Set(spec.map((m: any) => JSON.stringify(m.degrees)));
    if (shapes.size < 3) continue;                             // must MOVE, not repeat one voicing
    const syms: string[] = ((item.progression?.chords ?? []) as any[]).map((c) => String(c.chordSymbol));
    const chords = new Set(syms);
    if (chords.has("N/C") || chords.size < 3) continue;        // a real progression, not a pedal
    const score = shapes.size * 100 + chords.size;             // prefer the most varied exemplar
    if (!best || score > best.score) best = { item, text: t, score };
  }
}
if (!best) { console.error("HALT: no exemplar that is correct AND opens admissibly AND actually moves"); process.exit(1); }
console.log(`exemplar item ${best.item.itemId} (trained pool, NOT held-out) | ${best.text.length} chars | distinct voicings ${new Set(JSON.parse(best.text).map((m:any)=>JSON.stringify(m.degrees))).size}`);
console.log(`verifier: ${JSON.stringify(scoreVoicing(best.item.progression, best.text, 2, "common-practice"))}`);
const block = `${best.item.user}\n\n${best.text}\n\n`;
writeFileSync(join(P4, "runs", "fewshot-exemplar.txt"), block, "utf8");
console.log(`\n--- written to runs/fewshot-exemplar.txt ---\n${block}`);
