#!/usr/bin/env python3
"""Alternate picks: more shipped-pipeline mixes from takes already rendered.

    python scripts/alt_picks.py --pick tmp/vocal-clock/sing/<song>/pad16 --n 8 [--seed 1] \
        [--out tmp/vocal-clock/alt] [--no-mix]

A phrase-by-phrase pick (sing_clock.py --by-phrase) chooses one take per phrase
from the run's rendered takes. Any other choice among the takes a listener
understood about as well is an equally valid mix, with different joins between
takes and different source gaps inside them. This builds N such alternates for a
pick, CPU only (no singer, no GPU): the same candidates, receipts and phrase
scores the pick used, a different take per phrase, then the same warp placement
and mix. The planter (scripts/planter.py) takes each one as another --dir, so a
detector trained on planted defects sees many join positions, not one mix's
fourteen (planted-defects program, rnd v1.1.1.0.1).

First it re-runs the pick with its own ranking and stops unless that reproduces
the shipped plan cut for cut: alternates are only comparable if they come from the
inputs the pick actually used. Each alternate's plan.json records `pick_of`
("<song>/<pick>"), `alt` (1..N) and the take of every phrase.

Each alternate then goes through the pick's own timing and pitch gates (energy
detector, FCPE with the pYIN recheck), and the summary records whether it passed.
An alternate is training material, not a release, but one that fails a gate
carries natural defects nobody labelled: the planter should use the passing ones
as its clean material.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vocal_clock as vc  # noqa: E402

PY = sys.executable
INTEL_SLACK = 0.1   # a take is an alternative when the listener heard within this share of the best take
FAILS_SLACK = 1     # and it fails at most this many more notes of the phrase's pitch gate
GATE_SLACK = 2      # "as clean as the pick": at most this many more syllables off, and notes failed, than the pick


def load_candidates(plan: dict) -> tuple[list[dict], dict[str, float]]:
    """The pick's candidates as `repin` loaded them: verify tables and take lengths."""
    import soundfile as sf
    cands, totals = [], {}
    for c in plan["candidates"]:
        rec = json.load(open(c["receipt"], encoding="utf-8"))
        info = sf.info(c["key"])
        totals[c["key"]] = info.frames / info.samplerate
        cands.append({"key": c["key"], "rows": rec["table"], "receipt": c["receipt"]})
    return cands, totals


def alternatives(ph: dict, intel_slack: float = INTEL_SLACK, fails_slack: int = FAILS_SLACK) -> list[int]:
    """Candidates in a phrase's ranking that are about as good as its best: heard
    within `intel_slack` of the best intelligibility and failing at most
    `fails_slack` more notes. Phrases without scores keep only their top take."""
    ranked = ph["ranked"]
    best = ranked[0]
    if best.get("intelligibility") is None:
        return [best["candidate"]]
    bi, bf = best["intelligibility"], best.get("pitch_fails") or 0
    return [r["candidate"] for r in ranked
            if r.get("intelligibility") is not None and r["intelligibility"] >= bi - intel_slack
            and (r.get("pitch_fails") or 0) <= bf + fails_slack]


def reorder(phrases: list[dict], rng: np.random.Generator, **slack) -> list[dict]:
    """A copy of the phrase rankings with each phrase's alternatives shuffled to the
    front, the rest after them in their original order. repin_words then takes the
    first that sings every word inside the word limit, so a shuffled-in take that
    cannot falls through to the next, as in the pick itself."""
    out = []
    for ph in phrases:
        alts = alternatives(ph, **slack)
        order = [alts[i] for i in rng.permutation(len(alts))]
        rest = [r for r in ph["ranked"] if r["candidate"] not in order]
        by = {r["candidate"]: r for r in ph["ranked"]}
        out.append({**ph, "ranked": [by[c] for c in order] + rest})
    return out


def signature(plan: dict) -> tuple:
    """Which take sings each phrase: two plans with the same signature are the same mix."""
    return tuple(p.get("take") for p in plan.get("phrases", []))


def same_cuts(a: dict, b: dict) -> bool:
    key = lambda c: (c["id"], c["source_key"], round(c["cut_start"], 6), round(c["placed_start"], 6))  # noqa: E731
    return [key(c) for c in a["cuts"]] == [key(c) for c in b["cuts"]]


def gate_counts(vdir: str) -> dict:
    """What the gates found, read from a folder's receipts: syllables both timing
    instruments put more than the gate off, and notes the pitch gate failed. (The
    receipts' overall verdict also folds in the transcript checks, which are not run
    here, so it reads FAIL even on the shipped pick: the counts are what compare.)"""
    r = json.load(open(os.path.join(vdir, "receipt.json"), encoding="utf-8"))
    p = json.load(open(os.path.join(vdir, "pitch.json"), encoding="utf-8"))
    ac = r["checks"].get("aligner_cross_check") or {}
    return {"timing_off": ac.get("both_off"), "pitch_fail": len(p["per_note"].get("fail", []))}


def gates(vdir: str, clock_path: str, plan_path: str, bed: str) -> dict:
    """The pick's timing gate (energy detector, cross-checked by the aligner) and
    pitch gate (FCPE, re-read by pYIN) on an alternate's placed vocal."""
    vocal = os.path.join(vdir, "placed-local.wav")
    vc_py = os.path.join(HERE, "vocal_clock.py")
    timing_receipt = os.path.join(vdir, "receipt.json")
    subprocess.run([PY, vc_py, "verify", "--clock", clock_path, "--vocal", vocal, "--bed", bed, "--plan", plan_path,
                    "--receipt", timing_receipt, "--aligner"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run([PY, vc_py, "pitch", "--clock", clock_path, "--vocal", vocal, "--verify-receipt", timing_receipt,
                    "--receipt", os.path.join(vdir, "pitch.json")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return gate_counts(vdir)


def build(pick_dir: str, n: int, seed: int, out_root: str, mix: bool = True, gate: bool = True) -> dict:
    pick_dir = os.path.normpath(pick_dir)
    plan0 = json.load(open(os.path.join(pick_dir, "plan.json"), encoding="utf-8"))
    if plan0.get("mode") != "repin-phrases":
        raise SystemExit(f"{pick_dir}: not a phrase-by-phrase pick (mode {plan0.get('mode')!r})")
    if not os.path.exists(plan0["clock"]):
        raise SystemExit(f"{plan0['clock']} is missing: warp placement needs the score clock")
    song = os.path.basename(os.path.dirname(pick_dir))
    pick = os.path.basename(pick_dir)
    run = os.path.dirname(os.path.dirname(plan0["candidates"][0]["key"]))
    scores_path = os.path.join(run, "phrase-scores.json")
    clock = vc.load_clock(plan0["clock"])
    cands, totals = load_candidates(plan0)
    scores = json.load(open(scores_path, encoding="utf-8"))
    phrases = vc.rank_phrases(clock, cands, scores, 0.3)
    again = vc.repin_words(clock, cands, totals, split_words=True, phrases=phrases)
    if not same_cuts(again, plan0):
        raise SystemExit(f"{pick_dir}: re-picking from its own inputs does not reproduce plan.json; "
                         "the receipts or phrase scores changed since, so alternates would not be comparable")
    pick_counts = gate_counts(pick_dir) if gate else None
    rng = np.random.default_rng(seed)
    seen = {signature(plan0)}
    made, tries = [], 0
    while len(made) < n and tries < 20 * n:
        tries += 1
        plan = vc.repin_words(clock, cands, totals, split_words=True, phrases=reorder(phrases, rng))
        sig = signature(plan)
        if sig in seen:
            continue
        seen.add(sig)
        k = len(made) + 1
        plan.update({"clock": plan0["clock"], "candidates": plan0["candidates"], "pick_of": f"{song}/{pick}", "alt": k, "alt_seed": seed})
        vdir = os.path.join(out_root, song, f"{pick}-alt{k:02d}")
        os.makedirs(vdir, exist_ok=True)
        path = os.path.join(vdir, "plan.json")
        json.dump(plan, open(path, "w", encoding="utf-8"), indent=2)
        placed = os.path.join(vdir, "placed.json")
        subprocess.run([PY, os.path.join(HERE, "vocal_clock.py"), "place", "--local", "--warp", "--plan", path,
                        "--out-dir", vdir, "--out-info", placed, "--out-graph", os.path.join(vdir, "graph.json")],
                       check=True, stdout=subprocess.DEVNULL)
        bed = os.path.join(run, "piano-bed.wav")
        if mix and os.path.exists(bed):
            subprocess.run([PY, os.path.join(HERE, "vocal_clock.py"), "mix", "--local", "--bed", bed,
                            "--vocal", os.path.join(vdir, "placed-local.wav"), "--plan", path, "--out-dir", vdir,
                            "--out-info", os.path.join(vdir, "mix.json")], check=True, stdout=subprocess.DEVNULL)
        changed = sum(a != b for a, b in zip(sig, signature(plan0)))
        row = {"alt": k, "dir": vdir.replace("\\", "/"), "phrases_changed": changed, "of": len(sig)}
        if gate and os.path.exists(bed):
            row.update(gates(vdir, plan0["clock"], path, bed))
            row["as_clean_as_pick"] = all(row[k] is not None and pick_counts[k] is not None and row[k] <= pick_counts[k] + GATE_SLACK
                                          for k in ("timing_off", "pitch_fail"))
        made.append(row)
        verdict = "" if "timing_off" not in row else (
            f"; {row['timing_off']} syllables off, {row['pitch_fail']} notes failed "
            f"(pick: {pick_counts['timing_off']}, {pick_counts['pitch_fail']})" + ("" if row["as_clean_as_pick"] else " NOT AS CLEAN"))
        print(f"{song}/{pick} alt {k}: {changed} of {len(sig)} phrases from a different take{verdict} -> {vdir}")
    summary = {"pick_of": f"{song}/{pick}", "seed": seed, "pick_gates": pick_counts, "gate_slack": GATE_SLACK, "requested": n, "made": len(made), "tries": tries,
               "alternatives_per_phrase": [len(alternatives(ph)) for ph in phrases],
               "as_clean_as_pick": [r["alt"] for r in made if r.get("as_clean_as_pick")], "alts": made}
    os.makedirs(os.path.join(out_root, song), exist_ok=True)
    json.dump(summary, open(os.path.join(out_root, song, f"{pick}-alts.json"), "w", encoding="utf-8"), indent=1)
    if len(made) < n:
        print(f"only {len(made)} distinct alternates exist within the slack (asked for {n})")
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pick", required=True, help="a phrase-by-phrase pick folder (plan.json)")
    ap.add_argument("--n", type=int, default=8)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default=os.path.join("tmp", "vocal-clock", "alt"))
    ap.add_argument("--no-mix", action="store_true", help="place the vocal only; skip the mix with the piano bed")
    ap.add_argument("--no-gates", action="store_true", help="skip the timing and pitch gates")
    a = ap.parse_args()
    build(a.pick, a.n, a.seed, a.out, mix=not a.no_mix, gate=not a.no_gates)
    return 0


if __name__ == "__main__":
    sys.exit(main())
