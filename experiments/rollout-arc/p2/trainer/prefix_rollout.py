"""Prefix forcing (exploring starts) inside a live GRPO batch.

The base policy clears the full chorale rulebook 39% of the time by opening on
root-and-third: `[0,1]` opens 87.4% of passing completions at zero optimisation
pressure, so it is the prior, not a ceiling. Pre-filling each rollout's assistant
turn with a valid opening it would not have chosen breaks the funnel completely
(non-degeneracy 0.4375 -> 0.9375, within-group uniqueness 0.356 -> 1.000).

This module is the training-time form of that intervention, and it exists as a
separate file because prefix mechanics change together and change with nothing
else in `train.py`.

WHY `rollout_func` AND NOT THE CHAT TEMPLATE
--------------------------------------------
The obvious route -- `chat_template_kwargs={"continue_final_message": True}` with
the opening as a partial assistant message -- cannot work in TRL 1.13.0.
`GRPOTrainer._tokenize_prompts` hardcodes `add_generation_prompt=True`, and
transformers raises on both being set (`tokenization_utils_base.py:3099`). The
only seam that can force a prefix is `rollout_func`, which owns tokenisation and
generation and whose `env_mask` extra field becomes `tool_mask`, multiplied into
`loss_mask` at `grpo_trainer.py:2519`.

WHERE THE PREFIX LIVES, AND WHY IT MATTERS TWICE
------------------------------------------------
The forced opening goes in `completion_ids`, never in `prompt_ids`:

  * the reward must judge it. TRL decodes `completion_ids` to build the assistant
    message the reward function receives, so a prefix parked in the prompt would
    be scored by everything EXCEPT the measure it pinned. (PREFIX-PREREG.md §3.4)
  * the loss must not. `env_mask` is 0 across every prefix token, so no gradient
    lands on tokens the model did not choose -- otherwise training reinforces the
    diversity that was injected. Prefix-GRPO (arXiv 2607.19395) deliberately DOES
    update prefix tokens; `--prefix-in-loss` selects that, and the choice is
    recorded on the receipt either way. (PREFIX-PREREG.md §3.2)

Five assertions, each closing a failure that throws nothing and leaves the
headline metrics looking good. They halt; they do not warn.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from typing import Any

import torch
from trl.models import unwrap_model_for_generation
from trl.trainer.utils import pad


class PrefixForcingError(RuntimeError):
    """A forcing invariant broke. Never downgraded to a warning: every one of
    these failures leaves a run that trains successfully on the wrong thing."""


def new_stats() -> dict[str, Any]:
    return {
        "calls": 0,
        "groups": 0,
        "rollouts": 0,
        "prefix_hits": 0,
        "prefix_tokens_total": 0,
        "prefix_tokens_max": 0,
        "masked_prefix_tokens": 0,
        "openings_per_group_min": None,
        "openings_per_group_max": None,
        "max_new_tokens": None,
        "boundary_clean": True,
        # WHICH openings were actually forced. One group of G < n cannot cover n
        # openings (pigeonhole), so alphabet coverage is a property of the POOL, not
        # of any group, and a property of the pool is exactly the kind of thing that
        # should be measured rather than argued. This set caught a parity gap that
        # halved the intervention while every other metric read healthy.
        "opening_indices_seen": set(),
    }


def _group_blocks(prompts: list, group_size: int) -> list[list[int]]:
    """A5 -- the documentation and the code disagree, so this is asserted.

    `rollout_func`'s docstring says it "receives the raw per-process prompt slice
    with no duplication". `_get_train_sampler` passes
    `mini_repeat_count=self.num_generations` unconditionally, so on the
    non-vLLM path the prompts arrive ALREADY repeated G times. Assigning a
    per-rollout prefix to the wrong shape would silently give every group one
    opening (or sixteen groups one rollout each), and nothing would throw.
    """
    n = len(prompts)
    if group_size <= 0:
        raise PrefixForcingError(f"num_generations is {group_size}")
    if n % group_size != 0:
        raise PrefixForcingError(
            f"HALT: {n} prompts is not a multiple of G={group_size}. Prefix assignment "
            f"needs the group structure and this batch does not have one."
        )
    keys = [json.dumps(p, sort_keys=True, default=str) for p in prompts]
    blocks = [list(range(g, g + group_size)) for g in range(0, n, group_size)]
    for b in blocks:
        if len({keys[i] for i in b}) != 1:
            raise PrefixForcingError(
                "HALT: prompts did not arrive as runs of G identical prompts. TRL's "
                "`rollout_func` docstring claims the slice is deduplicated; this build "
                "assumes the repeated shape that `RepeatSampler(mini_repeat_count=G)` "
                "actually produces. One of the two changed -- re-read "
                "`grpo_trainer._get_train_sampler` before touching anything else."
            )
    return blocks


def _prefix_for(row: dict, mode: str, index_in_group: int, group_size: int) -> tuple[str, int]:
    if mode == "stratified":
        prefix = row.get("prefix")
        if not isinstance(prefix, str) or not prefix:
            raise PrefixForcingError(
                "HALT: --prefix-mode stratified needs a `prefix` column on every row; "
                f"got {prefix!r}. The trainer expands (item x opening) rows before training."
            )
        return prefix, int(row.get("opening_index", -1))
    prefixes = row.get("prefixes")
    if not isinstance(prefixes, (list, tuple)) or not prefixes:
        raise PrefixForcingError(
            "HALT: --prefix-mode heterogeneous needs a non-empty `prefixes` column on "
            f"every row; got {type(prefixes).__name__}. The bridge serves one prefix per "
            "valid opening on /cases."
        )
    # A group must SPAN the opening space, and `i % len` does not when G < |valid|:
    # at G=8 with 16 valid openings it returns openings 0-7 on every group of every
    # item, and openings 8-15 are NEVER FORCED. Nothing throws, `openings_per_group`
    # still reads 8, and half the intervention silently does not happen.
    #
    # So: stride across the alphabet, and rotate the starting point per item with a
    # STABLE hash (Python's `hash()` on str is salted per process, so it would make
    # runs unreproducible).
    #
    # THE STRIDE MUST BE COPRIME TO n. The obvious stride n//G is 2 at G=8, n=16, and
    # 2 shares a factor with 16: every rollout of an item then lands on the SAME
    # PARITY as its offset, and that item can never be handed an even opening. The
    # first two-item dry run drew two odd offsets and covered exactly
    # [1,3,5,7,9,11,13,15] -- half the alphabet, with `openings_per_group` still
    # reading a healthy 8. Measured, not imagined: `opening_indices_seen` on
    # `runs/dry-prefix-het/dry-run.json` said so before this fix existed.
    n = len(prefixes)
    if group_size >= n:
        idx = index_in_group % n  # exact cover, then a balanced repeat
    else:
        stride = n // group_size
        while stride < n and math.gcd(stride, n) != 1:
            stride += 1  # smallest spread-preserving stride that can reach every residue
        offset = int(hashlib.sha1(str(row.get("id", "")).encode("utf-8")).hexdigest()[:8], 16)
        idx = (offset + index_in_group * stride) % n
    return str(prefixes[idx]), idx


def make_prefix_rollout(mode: str, prefix_in_loss: bool, stats: dict[str, Any]):
    """Build the `rollout_func` TRL calls once per generation batch.

    `mode` is "heterogeneous" (a different opening per rollout, the group spans the
    opening space) or "stratified" (one opening per group, the opening is part of
    the group identity so the group-relative advantage stays exactly valid).
    PREFIX-PREREG.md Part 1 fixes which one a run uses, and why.
    """
    if mode not in ("heterogeneous", "stratified"):
        raise PrefixForcingError(f"unknown prefix mode {mode!r}")

    def rollout(prompts: list, trainer) -> dict[str, Any]:
        rows = getattr(trainer, "_batch_inputs", None)
        if rows is None:
            raise PrefixForcingError(
                "HALT: the trainer did not stash its batch rows. Prefix forcing needs the "
                "dataset row behind each rollout (the prompts alone cannot carry it), which "
                "PrefixTrainer._generate_and_score_completions records."
            )
        if len(rows) != len(prompts):
            raise PrefixForcingError(
                f"HALT: {len(rows)} stashed rows against {len(prompts)} prompts; the "
                "row-to-rollout alignment prefix assignment depends on is broken."
            )

        tokenizer = trainer.processing_class
        pad_id = trainer._tokenizer.pad_token_id
        eos_id = trainer._tokenizer.eos_token_id
        device = trainer.accelerator.device
        mode_is_train = trainer.model.training
        group_size = trainer.num_generations if mode_is_train else trainer.num_generations_eval
        blocks = _group_blocks(prompts, group_size)

        # Prefix per rollout, in batch order.
        prefixes: list[str] = [""] * len(prompts)
        for block in blocks:
            for slot, idx in enumerate(block):
                prefixes[idx], opening_idx = _prefix_for(rows[idx], mode, slot, group_size)
                stats["opening_indices_seen"].add(opening_idx)
            distinct = len({prefixes[i] for i in block})
            lo, hi = stats["openings_per_group_min"], stats["openings_per_group_max"]
            stats["openings_per_group_min"] = distinct if lo is None else min(lo, distinct)
            stats["openings_per_group_max"] = distinct if hi is None else max(hi, distinct)

        # Head = the prompt exactly as TRL would render it. Rendered as TEXT and as
        # IDS so the boundary between head and prefix can be checked rather than
        # assumed (A6 below).
        head_text = tokenizer.apply_chat_template(
            conversation=prompts,
            chat_template=trainer.chat_template,
            add_generation_prompt=True,
            tokenize=False,
            **trainer.chat_template_kwargs,
        )
        head_ids = tokenizer.apply_chat_template(
            conversation=prompts,
            chat_template=trainer.chat_template,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            **trainer.chat_template_kwargs,
        )["input_ids"]

        # A6 -- the prefix must be tokenised as its own span. Tokenising
        # `head + prefix` jointly (what the local probe did) can merge the boundary
        # token, and then `prompt_ids` would not be a prefix of what was generated:
        # TRL recomputes logprobs over cat([prompt_ids, completion_ids]), so a merged
        # boundary silently scores a different sequence than the one sampled.
        full_ids: list[list[int]] = []
        prefix_ids: list[list[int]] = []
        for i, (h_text, h_ids) in enumerate(zip(head_text, head_ids, strict=True)):
            joint = tokenizer(h_text + prefixes[i], add_special_tokens=False)["input_ids"]
            h_list = list(h_ids)
            if list(joint[: len(h_list)]) != h_list:
                stats["boundary_clean"] = False
                raise PrefixForcingError(
                    "HALT: tokenising head+prefix jointly does not preserve the head's own "
                    "token ids -- the boundary merged. prompt_ids would not be a prefix of "
                    "the generated sequence and every recomputed logprob would be for a "
                    f"different string. Item {rows[i].get('id')!r}."
                )
            full_ids.append(list(joint))
            prefix_ids.append(list(joint[len(h_list) :]))

        max_prefix = max(len(p) for p in prefix_ids)
        stats["prefix_tokens_max"] = max(stats["prefix_tokens_max"], max_prefix)
        stats["prefix_tokens_total"] += sum(len(p) for p in prefix_ids)

        # The forced opening spends completion budget. Subtract it so a forced run and
        # an unforced run are held to the SAME completion length, rather than the
        # forced one quietly getting `max_completion_length` on top of its prefix.
        gen_cfg = copy.deepcopy(trainer.generation_config)
        budget = max(1, int(trainer.max_completion_length) - max_prefix)
        gen_cfg.max_new_tokens = budget
        stats["max_new_tokens"] = budget

        tensors = [torch.tensor(ids) for ids in full_ids]
        # A4 -- left padding. Prefixes differ in length, and a right-padded batch
        # begins generating after pad tokens.
        padded = pad(tensors, padding_value=pad_id, padding_side="left").to(device)
        attn = pad([torch.ones_like(t) for t in tensors], padding_value=0, padding_side="left").to(device)

        with (
            unwrap_model_for_generation(
                trainer.model_wrapped,
                trainer.accelerator,
                gather_deepspeed3_params=trainer.args.ds3_gather_for_generation,
            ) as unwrapped_model,
            torch.no_grad(),
        ):
            generated = unwrapped_model.generate(
                input_ids=padded, attention_mask=attn, generation_config=gen_cfg
            )

        # Cut at the padded prompt length and mask everything after the first EOS,
        # keeping the EOS itself -- mirroring `_generate_single_turn` so a forced run
        # and an unforced run agree about where a completion ends.
        plen = padded.size(1)
        tail = generated[:, plen:]
        is_eos = tail == eos_id
        eos_idx = torch.full((is_eos.size(0),), is_eos.size(1), dtype=torch.long, device=tail.device)
        eos_idx[is_eos.any(dim=1)] = is_eos.int().argmax(dim=1)[is_eos.any(dim=1)]
        seq_idx = torch.arange(is_eos.size(1), device=tail.device).expand(is_eos.size(0), -1)
        keep = (seq_idx <= eos_idx.unsqueeze(1)).int()
        tails = [t[m].tolist() for t, m in zip(tail.cpu(), keep.bool().cpu(), strict=True)]

        completion_ids = [prefix_ids[i] + tails[i] for i in range(len(prompts))]
        if prefix_in_loss:
            # Prefix-GRPO's choice: the injected opening receives gradient.
            env_mask = [[1] * len(c) for c in completion_ids]
        else:
            env_mask = [[0] * len(prefix_ids[i]) + [1] * len(tails[i]) for i in range(len(prompts))]
            stats["masked_prefix_tokens"] += sum(len(p) for p in prefix_ids)

        # A1 -- the mask says exactly what was intended. An off-by-one here trains on
        # one injected token per rollout and nothing anywhere would show it.
        for i, m in enumerate(env_mask):
            if len(m) != len(completion_ids[i]):
                raise PrefixForcingError(f"HALT: env_mask length {len(m)} != completion length {len(completion_ids[i])}")
            zeros = len(m) - sum(m)
            expected_zeros = 0 if prefix_in_loss else len(prefix_ids[i])
            if zeros != expected_zeros:
                raise PrefixForcingError(
                    f"HALT: {zeros} masked tokens against {expected_zeros} prefix tokens "
                    f"(prefix_in_loss={prefix_in_loss}). The loss mask does not match the intent."
                )

        # A2/A3 -- the completion the reward will see starts with the forced opening.
        # If TRL had opened a fresh assistant turn instead of continuing, or the batch
        # had been right-padded, this is where it shows. It is also the proof that the
        # prefix is INSIDE what gets scored.
        decoded = tokenizer.batch_decode(completion_ids, skip_special_tokens=True)
        for i, text in enumerate(decoded):
            if text.startswith(prefixes[i]):
                stats["prefix_hits"] += 1
            else:
                raise PrefixForcingError(
                    "HALT: a completion does not start with its forced prefix, so the "
                    "forcing did not take and the scored text is not what was pinned.\n"
                    f"  item     {rows[i].get('id')!r}\n"
                    f"  prefix   {prefixes[i]!r}\n"
                    f"  produced {text[:80]!r}"
                )

        stats["calls"] += 1
        stats["groups"] += len(blocks)
        stats["rollouts"] += len(prompts)
        return {
            "prompt_ids": head_ids,
            "completion_ids": completion_ids,
            # None: no sampling-side logprobs to correct against. TRL recomputes the
            # policy logprobs itself on this path, exactly as it does for its own
            # `transformers.generate` branch.
            "logprobs": None,
            # Popped by `_generate` into `tool_mask` and multiplied into `loss_mask`.
            "env_mask": env_mask,
        }

    return rollout
