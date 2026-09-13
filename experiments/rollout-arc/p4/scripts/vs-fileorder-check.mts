// Were the first 12 items HARDER, or was the partial VS reading wrong for another reason?
// If item difficulty explains it, STANDARD sampling must also show a depressed pass rate on
// exactly those items. If standard is normal there, difficulty is not the explanation.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpecResponse } from "../../../../src/compose/index.js";
import { scoreVoicing } from "../../scripts/p4-vl-server.mjs";
const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const order = readFileSync(join(RUNS, "prompts-heldout-v1.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const byId = new Map(order.map((p: { itemId: string; progression: unknown }) => [p.itemId, p.progression]));
const first12 = new Set(order.slice(0, 12).map((p: { itemId: string }) => p.itemId));
const outer = (raw: string) => { const i = raw.indexOf("["), j = raw.lastIndexOf("]");
  if (i < 0 || j <= i) return null; try { const v = JSON.parse(raw.slice(i, j + 1)); return Array.isArray(v) ? v : null; } catch { return null; } };

function rate(file: string, vs: boolean) {
  let pe = 0, te = 0, pr = 0, tr = 0;
  for (const l of readFileSync(join(RUNS, file), "utf8").trim().split("\n").filter(Boolean)) {
    const r = JSON.parse(l) as { itemId: string; completions: string[] };
    const prog = byId.get(r.itemId); if (!prog) continue;
    const early = first12.has(r.itemId);
    const outs: string[] = [];
    for (const raw of r.completions) {
      if (!vs) { outs.push(raw); continue; }
      const arr = outer(raw); if (!arr) continue;
      for (const c of (arr as Array<{ voicing?: unknown }>)) if (c && typeof c === "object" && "voicing" in c && c.voicing != null) outs.push(JSON.stringify(c.voicing));
    }
    for (const o of outs) {
      const ok = scoreVoicing(prog, o, 2, "common-practice").correct ? 1 : 0;
      if (early) { pe += ok; te++; } else { pr += ok; tr++; }
    }
  }
  return { early: pe / Math.max(1, te), rest: pr / Math.max(1, tr), te, tr };
}
const s = rate("mc-heldout-base.jsonl", false);
const v = rate("vs-heldout-base.jsonl", true);
console.log(`\n${"".padEnd(22)} first 12 items      remaining 63 items`);
console.log(`STANDARD sampling      ${s.early.toFixed(4)} (n=${s.te})      ${s.rest.toFixed(4)} (n=${s.tr})`);
console.log(`VERBALIZED SAMPLING    ${v.early.toFixed(4)} (n=${v.te})      ${v.rest.toFixed(4)} (n=${v.tr})`);
console.log(`\nIf the first 12 are simply harder, BOTH rows drop on the left. If only VS drops,`);
console.log(`item difficulty does not explain the partial reading and something else does.`);
