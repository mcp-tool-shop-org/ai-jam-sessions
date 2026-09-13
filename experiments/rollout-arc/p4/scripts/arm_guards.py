"""Hard guards for one training arm. Exits 9 and says why, or exits 0 and says so.

A separate file, not a heredoc inside the pod script, for one reason: a heredoc can
only be exercised by paying for a GPU to reach it. This can be run against a receipt
that already exists, on a laptop, for nothing --

    python arm_guards.py ../runs/dry-prefix-het/dry-run.json heterogeneous 8

-- which is how it was tested before any pod existed.

The guards themselves are preregistered in ../PREFIX-PREREG-AMENDMENT.md section 6 and
are NOT restated here in prose, so the two cannot drift apart. An arm that trips one is
VOID before its rewards are read: a population or a forcing that is not what was asked
for does not produce a smaller version of the intended experiment, it produces a
different one.
"""

from __future__ import annotations

import json
import sys

def alphabet_size(pfx: dict) -> int | None:
    """|valid openings| for this pool, READ OFF THE RECEIPT rather than hard-coded.

    `openings_per_item` is a histogram of how many valid openings each item had --
    {"16": 32} for the frozen 2-voice pool. A literal 16 here would silently pass a
    3-voice run (64 openings) that covered a quarter of its alphabet.
    """
    hist = pfx.get("openings_per_item") or {}
    keys = [int(k) for k in hist]
    return max(keys) if keys else None


def check(receipt: dict, mode: str, want_items: int) -> list[str]:
    bad: list[str] = []
    pfx = receipt.get("prefix") or {}
    alphabet = alphabet_size(pfx)
    if mode != "none" and alphabet is None:
        bad.append("receipt carries no openings_per_item: the alphabet size is unknown")
        alphabet = 0

    # Stratified expands one row per (item, opening), so its row count is a DIFFERENT
    # number for the same pool. Hard-coding one expectation would void the arm the
    # amendment exists to run.
    want_rows = want_items * (alphabet or 0) if mode == "stratified" else want_items
    if receipt.get("dataset_rows") != want_rows:
        bad.append(f"dataset_rows {receipt.get('dataset_rows')} != {want_rows}")

    if receipt.get("rollout_mode") != "no-tools":
        bad.append(f"rollout_mode {receipt.get('rollout_mode')!r} != 'no-tools'")

    if receipt.get("final_adapter") is None:
        bad.append("no final_adapter on the receipt: the falsifier has nothing to load")

    declared = (pfx.get("mode") or "none")
    if declared != mode:
        bad.append(f"receipt says prefix mode {declared!r}, the arm asked for {mode!r}")

    if mode != "none":
        if not pfx.get("rollouts"):
            bad.append("prefix forcing recorded zero rollouts: nothing was forced")
        if pfx.get("prefix_hits") != pfx.get("rollouts"):
            bad.append(f"prefix_hits {pfx.get('prefix_hits')} != rollouts {pfx.get('rollouts')}")
        if pfx.get("masked_prefix_tokens") != pfx.get("prefix_tokens_total"):
            bad.append(
                f"masked_prefix_tokens {pfx.get('masked_prefix_tokens')} != "
                f"prefix_tokens_total {pfx.get('prefix_tokens_total')}: prefix tokens took gradient"
            )
        if not pfx.get("boundary_clean", False):
            bad.append("boundary_clean false: head+prefix tokenisation merged at the seam")
        # Coverage is a property of the POOL, not of any group (one group of G < n
        # cannot cover n openings). The first build shipped `i % n`, which forced
        # openings 0-7 forever while every other metric read healthy.
        covered = pfx.get("openings_covered")
        if covered != alphabet:
            bad.append(f"openings_covered {covered} != {alphabet}: part of the alphabet was never forced")
        # Independent of the trainer's own decode: counted by the bridge, in Node,
        # off the text the verifier actually parsed.
        before = (receipt.get("bridge") or {}).get("before") or {}
        after = (receipt.get("bridge") or {}).get("after") or {}
        b, a = before.get("first_measure_wrong"), after.get("first_measure_wrong")
        if b is None or a is None:
            bad.append("bridge does not report first_measure_wrong: no independent check the prefix was scored")
        elif a > b:
            bad.append(f"first_measure_wrong rose {b} -> {a}: the forced opening escaped scoring")
    else:
        if pfx.get("rollouts"):
            bad.append("--prefix-mode none but the rollout function ran")

    return bad


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: arm_guards.py <run.json> <mode> <items>", file=sys.stderr)
        return 2
    path, mode, want_items = sys.argv[1], sys.argv[2], int(sys.argv[3])
    receipt = json.load(open(path, encoding="utf-8"))
    pfx = receipt.get("prefix") or {}
    print(
        f"[p4] arm guards: mode={pfx.get('mode')} dataset_rows={receipt.get('dataset_rows')} "
        f"prompt_repeats={receipt.get('prompt_repeats')} rollouts={pfx.get('rollouts')} "
        f"prefix_hits={pfx.get('prefix_hits')} openings_covered={pfx.get('openings_covered')} "
        f"adapter={receipt.get('final_adapter')}"
    )
    bad = check(receipt, mode, want_items)
    if bad:
        print("[p4] ARM VOID: " + "; ".join(bad))
        return 9
    print("[p4] arm guards ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
