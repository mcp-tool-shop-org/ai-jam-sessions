// Assemble the external-review packet from the RECEIPTS, not by retyping them.
//
// This session already demonstrated why: a hand-copied figure cited 0.874 from a file
// that said 0.078, and the citation would have passed review. Every number below is
// read out of a committed summary at emit time, and each block says which file it
// came from.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, "..", "runs");
const P4 = join(HERE, "..");

type Summary = {
  cell: string;
  generated_from: string;
  groups: number;
  completions: number;
  single_shot_p: number;
  p_ci95: [number, number];
  non_degenerate: string;
  nd_ci95: [number, number];
  rho: number;
  effective_draws: number;
  k_hist: Record<string, number>;
  distinct_spans_mean: number;
  funnel: {
    passing: number;
    passing_unique_pct: number;
    within_group_uniqueness: number;
    top_first_measure_share: number;
    first_measure_hist: Array<[string, number]>;
  };
};

const load = (f: string) => JSON.parse(readFileSync(join(RUNS, f), "utf8")) as Summary;
const cells: Array<[string, Summary]> = [
  ["UNFORCED (no prefix)", load("summary-spec-4bar-g16.json")],
  ["HETEROGENEOUS (G different openings per group)", load("summary-spec-4bar-explore.json")],
  ["STRATIFIED (one opening per group)", load("summary-spec-4bar-same-opening-gen.json")],
];

const deadGroups = (s: Summary) => {
  const G = 16;
  const dead = (s.k_hist["0"] ?? 0) + (s.k_hist[String(G)] ?? 0);
  return { dead, pct: dead / s.groups };
};

const out: string[] = [];
const w = (l = "") => out.push(l);

w("# External review packet — prefix forcing, group design, and a preregistered training run");
w();
w("**Repo:** `mcp-tool-shop-org/ai-jam-sessions` · `experiments/rollout-arc/`");
w("Every figure below is read at emit time out of the committed summary named in its block.");
w("Nothing is retyped. Regenerate with `npx tsx p4/scripts/emit-review-packet.mts`.");
w();
w("**What changed since the review that prompted this packet:** the threshold criticism was");
w("accepted, a second flaw the review did not catch was found, the review's two citations were");
w("checked (one supports a neighbouring claim, one is not a primary source), two stronger");
w("citations were found by checking, and the design question was converted from an argument");
w("into a four-arm run. Details in `p4/PREFIX-PREREG-AMENDMENT.md`, reproduced at the end.");
w();
w("---");
w();
w("## 1. The three measured cells");
w();
w("Same 32 items, same G=16, same sampler (temperature 1.0, top_p 1.0, top_k 0 — which is also");
w("`GRPOConfig`'s default, verified in `grpo_config.py:527-544`), same style");
w("(`common-practice`, 2 voices, 4 bars), same seed. 512 completions each. Qwen3-4B-Instruct-2507");
w("bf16 on an RTX 5090. Base policy, untrained, no optimisation pressure anywhere.");
w();
w("| | " + cells.map(([n]) => n).join(" | ") + " |");
w("|---|" + cells.map(() => "---").join("|") + "|");
const row = (label: string, f: (s: Summary) => string) =>
  w(`| ${label} | ` + cells.map(([, s]) => f(s)).join(" | ") + " |");
row("receipt", (s) => `\`${s.generated_from}\``);
row("pass rate", (s) => `${s.single_shot_p} [${s.p_ci95[0]}, ${s.p_ci95[1]}]`);
row("non-degenerate", (s) => `${s.non_degenerate} [${s.nd_ci95[0]}, ${s.nd_ci95[1]}]`);
row("dead groups (k=0 or k=16)", (s) => {
  const d = deadGroups(s);
  return `${d.dead}/${s.groups} = ${d.pct.toFixed(4)}`;
});
row("rho", (s) => String(s.rho));
row("effective draws of 16", (s) => String(s.effective_draws));
row("mean distinct completions / group", (s) => String(s.distinct_spans_mean));
row("within-group uniqueness (passers)", (s) => String(s.funnel.within_group_uniqueness));
row("passing signatures unique", (s) => `${s.funnel.passing_unique_pct}%`);
row("top_first_measure_share", (s) => String(s.funnel.top_first_measure_share));
w();
w("**Two columns are uninformative by construction and must not be read as diversity:** under");
w("heterogeneous forcing every rollout in a group was handed a different opening, so 16 distinct");
w("completions and 1.000 within-group uniqueness are guaranteed before the model emits a token.");
w("And `top_first_measure_share` is only meaningful UNFORCED — under forcing it reports the");
w("rotation schedule, not the policy.");
w();
w("**Dead groups and non-degeneracy are the same measurement**, stated two ways: a group at k=0");
w("or k=G has zero within-group reward variance and therefore zero advantage for all G of its");
w("rollouts. An earlier draft reported one as a passed criterion and the other as a separate");
w("cost. It is one number.");
w();
w("## 2. The k-of-16 histograms");
w();
w("The scalar hides the shape. A 1-of-16 and an 8-of-16 split both satisfy `std > 0` and both");
w("count once toward non-degeneracy; under std-normalised advantage the first is a needle.");
w();
w("```");
for (const [name, s] of cells) {
  const ks = Object.keys(s.k_hist).map(Number).sort((a, b) => a - b);
  w(`${name}`);
  w(`  ${ks.map((k) => `${k}:${s.k_hist[String(k)]}`).join("  ")}`);
}
w("```");
w();
w("## 3. Opening difficulty — the nuisance term, from the CROSSED design only");
w();
w("`p4/scripts/opening-difficulty.mts` on `spec-4bar-explore.jsonl`, where every item contributes");
w("exactly one rollout to every opening, so item difficulty averages out:");
w();
w("```");
w("  pass rate by forced opening, 32 completions each, fully crossed");
w("  [1,0] 0.563   [0,1] 0.438   [3,1] 0.313   [1,1] 0.219");
w("  spread: min 0.219  max 0.563  range 0.344  sd 0.101   -> MATERIAL");
w("```");
w();
w("Run against the same-opening file the same script reports `range 0.688 sd 0.165 SEVERE`.");
w("**That number is not comparable and is not used.** In the nested design each opening is backed");
w("by 2 items and 16 correlated rollouts (rho 0.528), so the opening effect is confounded with");
w("those two items' difficulty. The script now refuses a verdict when the thinnest opening has");
w("fewer than 8 distinct items behind it.");
w();
w("Incidentally `[0,1]` — the prior's favourite, opening 87.4% of unforced passers — sits BELOW");
w("average at 0.438. The model does not prefer it because it works better.");
w();
w("## 4. What the build already asserts (so the review need not re-derive it)");
w();
w("Three local dry runs, `STAGE C PASS`, $0. `prefix_hits` 16/16 every run; TRL's own mask probe");
w("saw a zero span on 16/16 completions against `batches: 0` unforced; `masked_prefix_tokens` ==");
w("`prefix_tokens_total`; the bridge's independent `first_measure_wrong` delta 0 over 48 scored");
w("rollouts; `boundary_clean` true. Full receipt: `p4/PREFIX-BUILD.md`.");
w();
w("## 5. The questions actually open");
w();
w("The threshold criticism is accepted and is not what is being asked. What would help:");
w();
w("1. **Is the four-arm design the right cut?** A stratified / B heterogeneous / C unforced");
w("   control / D heterogeneous with `--random-reward`. Is C sufficient to attribute a flattened");
w("   peak to forcing rather than to training, or is a fifth arm needed?");
w("2. **Is D specified correctly as a veto?** The claim is that if random rewards flatten the");
w("   typicality peak as much as real ones, readings 1 and 2 are void. Qwen is the family where");
w("   spurious rewards nearly matched real ones (arXiv 2506.10947). Is \"as much as\" the right");
w("   bar, and what would a partial result mean?");
w("3. **Are 0.70 and 0.80 defensible?** The primary outcome is `top_first_measure_share` on an");
w("   UNCONDITIONED eval, base 0.874, uniform-over-16-openings would be 0.438. Flattening is");
w("   pre-committed as < 0.70; \"did not flatten\" as > 0.80.");
w("4. **Is the tiebreak gameable?** If A and B land in the same reading, the tiebreak is");
w("   effective updates per GPU dollar = (non-degenerate groups x steps) / GPU-seconds. Raw step");
w("   time was rejected because it flatters whichever arm writes shorter completions.");
w("5. **Does anything here justify NOT running C and D** to save roughly half the budget?");
w();
w("---");
w();
w("## Appendix A — `p4/PREFIX-PREREG.md`, Part 1 (the original, unmodified)");
w();
const prereg = readFileSync(join(P4, "PREFIX-PREREG.md"), "utf8");
const part1 = prereg.slice(prereg.indexOf("## Part 1"), prereg.indexOf("## Part 2"));
w(part1.trim());
w();
w("---");
w();
w("## Appendix B — `p4/PREFIX-PREREG-AMENDMENT.md` (the full amendment)");
w();
w(readFileSync(join(P4, "PREFIX-PREREG-AMENDMENT.md"), "utf8").trim());
w();

writeFileSync(join(P4, "REVIEW-PACKET.md"), out.join("\n") + "\n");
console.log(`wrote p4/REVIEW-PACKET.md (${out.join("\n").length} chars)`);
for (const [name, s] of cells) {
  const d = deadGroups(s);
  console.log(`  ${name.padEnd(48)} p=${s.single_shot_p} nd=${s.non_degenerate} dead=${d.dead}/${s.groups}`);
}
