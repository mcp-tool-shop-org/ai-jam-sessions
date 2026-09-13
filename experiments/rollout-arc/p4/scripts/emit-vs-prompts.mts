// Verbalized Sampling prompts -- the TRAINING-FREE control for the typicality prior.
//
// Zhang et al. 2025, arXiv:2510.01171 (retrieval-verified; SUPPORTED by both groundedness
// lenses): mode collapse in aligned models traces to typicality bias, and asking the model
// for a SET of candidates WITH their probabilities recovers 1.6-2.1x diversity at inference
// time, with no training at all.
//
// WHY THIS RUNS BEFORE ANY PRIOR-FLATTENING RL ARM IS PRICED: if prompting alone moves
// top_first_measure_share, then an RL arm aimed at the prior has to beat a free baseline,
// and the arc's history is cheap controls killing expensive hypotheses.
//
// The system prompt is reused VERBATIM except for its final output instruction, and the
// per-measure object shape is unchanged -- so the candidates the model returns are parsed
// by the SAME parseSpecResponse that scores every other completion in this arc. No second
// implementation of the format (the arc lost a well-formedness regex to exactly that).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RUNS = join(dirname(fileURLToPath(import.meta.url)), "..", "runs");
const K = Number(process.env.VS_K ?? 5);
const SRC = process.env.VS_SRC ?? "prompts-heldout-v1.jsonl";
const OUT = process.env.VS_OUT ?? "prompts-vs-heldout.jsonl";

const OLD_TAIL = "Output ONLY a JSON array, one object per measure, no prose.";

const rows = readFileSync(join(RUNS, SRC), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
let patched = 0;
const out = rows.map((r: { system: string; user: string }) => {
  const i = r.system.indexOf(OLD_TAIL);
  if (i < 0) throw new Error("HALT: system prompt does not contain the expected output instruction; refusing to guess");
  patched++;
  const system =
    r.system.slice(0, i) +
    `Output ONLY a JSON array of exactly ${K} objects, no prose. Each object is:\n` +
    `{"probability": <number between 0 and 1>, "voicing": [one object per measure, as described above]}\n` +
    `Give ${K} DIFFERENT voicings that span the range of plausible choices -- not ${K} variants\n` +
    `of one voicing -- and give each the probability you would actually assign it.\n` +
    `Example shape (4 voices, 2 measures, abbreviated):\n` +
    `[{"probability": 0.4, "voicing": [{"measure": 1, "degrees": [0, 1, 2, 0], "bassOctave": 3}, {"measure": 2, "degrees": [2, 0, 1, 2]}]}]`;
  const user =
    r.user.replace(
      /Return one JSON object per measure above with its "degrees".*$/s,
      `Return ${K} candidate voicings, each with its probability, in the JSON shape described above.`
    );
  if (user === r.user) throw new Error("HALT: user prompt tail did not match; refusing to guess");
  return { ...r, system, user, vs_k: K };
});

writeFileSync(join(RUNS, OUT), out.map((o) => JSON.stringify(o)).join("\n") + "\n");
console.log(`wrote ${OUT}: ${out.length} prompts, K=${K}, system instruction patched on ${patched}/${rows.length}`);
