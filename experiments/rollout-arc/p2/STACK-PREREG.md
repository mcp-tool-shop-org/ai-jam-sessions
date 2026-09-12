# Preregistration — all within-window knobs stacked

**Written before the pod exists.** The band needs accuracy ≈ 0.90 at the measured ρ = 0.714;
parallel-only alone gives 0.958. This asks whether stacking the untested knobs closes six
points.

## Three corrections to the proposed configuration

The stack came from an external reviewer. Its shape is right; three of its claims are not,
and two would have changed what the run measures.

**1. Octaves do not expand the answer space.** The claim was that `octaves = [1,5]` takes the
verdict space "from 13 values to 40+, crashing the uniform guessing baseline to ~18%."
**The answer is a measure number.** `SYNTH_VERDICTS` is 120 values, fixed, and octaves change
chord *voicings*, not verdicts. The guessing baseline is 1/120 either way. Octaves are still
worth including — one chord name with five spellings defeats literal text matching — but not
for that reason.

**2. `distance = 4` does not stay inside the first page — it is the first measure of the
second.** `MAX_LIST_WINDOW` is 4, so one page from the bound covers `[after, after+3]`.
Distance 4 **requires paging**, which is the one thing this policy will not do. The claim
that it "completely bypasses the unlearnable multi-turn pagination wall" is backwards.
**Excluded from this run**: distance 5–11 gave accuracy 0.000, and mixing an untested paging
requirement into a stack means a null cannot be attributed. Distance 4 is a separate,
interesting question — 14 of 55 answers did reach +4 — and it gets its own run or none.

**3. The decoy is not a distractor inside the window.** `decoyBeforeBound` plants **the target
chord itself, strictly before the bound**, outside the page. It punishes a policy that ignores
"at or after"; it does not add local confusion. Included, for what it actually does.

## The configuration

| knob | setting | what it actually does | ever measured on bf16? |
|---|---|---|---|
| `parallelOnly` | true | D1's distractor is the parallel (same root, third flipped) — the one proven failure | yes: 0.958 |
| `decoyBeforeBound` | true | target chord planted before the bound; makes "at or after" load-bearing | **no** |
| `octaves` | [1,2,3,4,5] | 5× the catalog; one chord name, five spellings | **no** |
| `varyRightHand` | true | right hand stops being a constant in all 120 measures | **no** |
| distances | **1–3 (default)** | answer stays in the first page — no paging | yes |
| levels | D1 | | |

n = 128 at G = 8. Verified: all four knobs build together and every song passes
`validateSong` at octaves 1–5.

## Pre-committed readings

1. **Stack works.** Accuracy in [0.85, 0.90] and non-degenerate ≥ 0.125. A trainable bf16
   population exists inside this corpus, and the next step is a training run on it.
2. **Structural floor.** Accuracy ≥ 0.94. Four stacked knobs move nothing, the corpus is
   genuinely exhausted for within-window friction, and **the algorithmic question becomes
   live on evidence** rather than on the 2%-of-cases assumption I rejected.
3. **Overshoot.** Accuracy ≤ 0.50 with non-degenerate falling. Degenerate at the bottom, the
   same trap distance walked into. Not a success; bisect by dropping knobs.
4. **Partial.** Accuracy 0.90–0.94. Moved but not enough. Then the per-knob contribution
   matters and the next run is an ablation, not another stack.

## The honest prior

**I expect reading 4 — movement, short of the band.** Each knob alone is weak, and the three
untested ones are structural variety rather than reasoning difficulty. Six points is a lot to
ask of variety. **If it lands in band that is a genuine surprise and I will say so** — the
same commitment I made on the parallel pin, where my stated prior of 0.092 proved right in
direction and low in magnitude.

## Guards

`dataset_rows` 128, distinct prompts 128, `/health` must echo all four knobs. `clipped_ratio`
> 0 flags the cell. all-wrong is its own line. CUDA verified over SSH **before** staging.
Dead-man armed before launch. Pod terminated on fetch.
