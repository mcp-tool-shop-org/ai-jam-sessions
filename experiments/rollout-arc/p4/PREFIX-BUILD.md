# Prefix forcing inside GRPO — built, asserted, and proven locally for $0

**2026-09-12. RTX 5090, Qwen3-4B-Instruct-2507 bf16, TRL 1.13.0, transformers 5.17.0,
torch 2.11.0+cu128. Three local dry runs, `STAGE C PASS` on all three, no pod, $0.**

The previous session's handoff said this was a session, not a `$1` smoke, and that
`pod_smoke_p4.sh` would buy a green receipt for an architecture already abandoned. This is the
build. Nothing has been trained: two optimizer steps prove a loop closes, not that it learns.

---

## The seam, verified in the installed source rather than recalled

The obvious route is a partial assistant message plus
`chat_template_kwargs={"continue_final_message": True}`. **It cannot work in TRL 1.13.0.**
`GRPOTrainer._tokenize_prompts` hardcodes `add_generation_prompt=True` (grpo_trainer.py:1771
and :1798), and transformers raises when both are set
(`tokenization_utils_base.py:3099`: *"continue_final_message and add_generation_prompt are not
compatible"*). There is no config that reaches around it.

`rollout_func` is the only seam, and it is sufficient:

| what it gives | where |
|---|---|
| owns tokenisation and generation, returning `prompt_ids` / `completion_ids` / `logprobs` | grpo_trainer.py:2241 |
| an `env_mask` extra field, popped into `tool_mask` | grpo_trainer.py:2295 |
| ...which is multiplied into the loss mask | grpo_trainer.py:2519, :2986 |
| `logprobs: None` is legal — TRL recomputes policy logprobs itself off the vLLM path | grpo_trainer.py:2492 |

**And one place where the documentation and the code disagree.** The `rollout_func` docstring
says it "receives the raw per-process prompt slice with **no duplication**". `_get_train_sampler`
passes `mini_repeat_count=self.num_generations` **unconditionally** (grpo_trainer.py:1283), and
the non-vLLM generation path consumes `prompt_ids` one-for-one, so the prompts arrive **already
repeated G times**. Building to the docstring would have handed one opening to every rollout of
a group, or sixteen groups one rollout each, and nothing would have thrown. `_group_blocks`
asserts the repeated shape and halts on anything else.

## Where the prefix lives, and why it is two decisions not one

The forced opening goes in **`completion_ids`**, never in `prompt_ids`:

- **so the reward judges it.** TRL decodes `completion_ids` to build the assistant message the
  reward function receives. A prefix parked in the prompt would be scored by everything except
  the measure it pinned.
- **and `env_mask` is 0 across every prefix token**, so no gradient lands on tokens the model
  did not choose. Prefix-GRPO (arXiv `2607.19395`) deliberately *does* update prefix tokens;
  `--prefix-in-loss` selects that. Both are defensible and only one is what we meant, so the
  choice is a flag with a default and a receipt field, not an accident.

## The two group designs, both implemented

| `--prefix-mode` | group is | `openings_per_group` on the receipt |
|---|---|---|
| `heterogeneous` *(the run's default)* | one item, G rollouts, G different openings | **G** |
| `stratified` | one (item, opening) row, G rollouts sharing both | **1** |

`stratified` expands the dataset to one row per (item, opening) — 8 items became **128 rows** —
so the opening is part of the group identity and the group-relative advantage compares rollouts
that share a conditioning context exactly. `SAME-OPENING-RESULTS.md` measured the choice and
returned the preregistered **AMBIGUOUS** reading, whose fixed consequence is heterogeneous.

## The assertions, and what each one actually measured

Every one halts. None warns. The evidence column is from the dry runs below, not from reading
the code.

| # | closes | assertion | measured |
|---|---|---|---|
| A1 | prefix tokens silently in the loss | masked-token count == prefix token count exactly | `masked_prefix_tokens` **256** == `prefix_tokens_total` **256**; TRL's own mask probe saw a zero span on **16 of 16** completions, `zero_fraction` 0.1385 |
| A2 | TRL restarting the turn instead of continuing it | every decoded completion starts with its own prefix | `prefix_hits` **16 of 16** in every run |
| A3 | the prefix escaping the scorer | the bridge counts completions whose first parsed measure is not the progression's first | `first_measure_wrong` delta **0** over 48 scored rollouts |
| A4 | right padding | generation pads left; subsumed by A2 | a right-padded batch fails A2 by construction |
| A5 | the group not being a group | prompts must arrive as runs of G identical prompts | `openings_per_group` 8..8 heterogeneous, 1..1 stratified |
| A6 | a merged token boundary | `tokenize(head + prefix)[:len(head_ids)] == head_ids` | `boundary_clean` **true** |

A3 is deliberately **independent of the rollout function's own decode**: it is counted by the
bridge, in Node, from the text the verifier actually parsed. If the prefix were lost between
generation and scoring, A2 could still pass and A3 would not. The structure gate makes it
doubly safe — a realization missing its first measure fails `sounding_frames == expected_frames`
and scores 0, so a lost prefix *collapses* the reward rather than inflating it.

## The three dry runs

`--dry --no-tools --num-generations 8 --per-device-batch 8 --limit 8 --max-completion-length 384
--seed 7`, against the frozen 32-item fixture at `common-practice`, 2 voices.

| | `none` | `heterogeneous` | `stratified` |
|---|---|---|---|
| dataset rows | 8 | 8 | **128** (8 items x 16 openings) |
| `prompt_repeats` | 0.25 | 0.25 | 0.0156 |
| s/step (G=8, 384 tokens) | 16.97 | **13.25** | **11.66** |
| peak reserved of 32 579 MiB | 23 006 | 21 260 | 21 272 |
| TRL mask probe `with_zero_span` | **0 of 0 (no mask at all)** | 16 of 16 | 16 of 16 |
| `prefix_hits` / rollouts | n/a | **16/16** | **16/16** |
| `openings_per_group` | absent | **8..8** | **1..1** |
| `masked_prefix_tokens` | 0 | 256 | 256 |
| bridge `first_measure_wrong` delta | — | **0** | **0** |
| Stage C | PASS | **PASS** | **PASS** |

The mask row is the independent proof that `env_mask` is doing the work: the unforced control
produces **no `tool_mask` at all** (`batches: 0`), the forced runs produce one on every
completion. TRL's own probe, not ours.

`max_new_tokens` is **368**, not 384: the forced opening spends completion budget, so it is
subtracted. Without that a forced run would quietly get `max_completion_length` *on top of* its
prefix and its completions would not be comparable to an unforced run's.

**Forcing was faster and lighter here** — 13.25 s/step against 16.97, 21.3 GB against 23.0 — 
because a rollout handed the first measure writes fewer tokens to finish. Do not read that as a
throughput argument: it is a two-step sample, and the reason it holds (shorter completions) is
the same reason the two conditions are not directly comparable on cost.

## What this does not prove

- **Two optimizer steps are not training.** Nothing here says the policy improves, and the
  arc's own position is that a trained policy on this pool would lose to a nearest-tone
  heuristic that already scores 32/32 for free. The purchase is infrastructure validation.
- **The falsifier is unmeasured**, by definition: `top_first_measure_share` on an unconditioned
  eval requires an adapter that does not exist. `p3/scripts/probe_generate.py` now takes
  `--adapter` so the measurement will be possible after a run — it was not, before, and that
  gap would have been discovered after the spend.
- **G=8 on a 5090, not G=16 on a Blackwell.** 21.3 GB reserved at G=8 leaves 11.3 GB headroom
  here; G=16 has not been measured on this card and must not be extrapolated from it.

## A local-only trap, written down because it cost a run

On Windows, set **`PYTHONIOENCODING=utf-8`**. `--dry` sets `num_completions_to_print=2`, TRL
renders that table through rich, rich falls back to the legacy Windows console writer, and the
first non-cp1252 character in a completion (here `→`, from the prompt echoed in the panel)
raises `UnicodeEncodeError`. It fires **after step 1 has already run**, so the traceback points
at `trainer.train()` and reads like a training failure. Pods are Linux and never see it.

## Receipts

`p2/trainer/prefix_rollout.py` · `p2/trainer/train.py` (`--prefix-mode`, `--prefix-in-loss`) ·
`scripts/p4-vl-server.mjs` (`validOpenings`, `openingPrefix`, `first_measure_ok`) ·
`scripts/p4-prefix-forcing.test.ts` (9 tests, including byte-equality of the opening alphabet
against the committed exploring-starts run) · `p4/runs/dry-prefix-{none,het,strat}/dry-run.json`
