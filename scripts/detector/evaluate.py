#!/usr/bin/env python3
"""Score a trained defect head on its held-out clips (Step B).

    python scripts/detector/evaluate.py --run tmp/stepb/heads/<encoder>/<tag>-seed<k>

Reports, with the encoder and its licence in the header:
  - per defect kind, clip-level AUC against clean clips (none, sham, vocoded);
  - the operating point where 5% of all clean clips (none, sham, vocoded) are
    flagged, and at it each kind's hit rate per severity: the detector's
    psychometric curve, on the same severity axis as the Director's catch trials;
  - the splice-shortcut check: the defect score's AUC for shams against plain clean
    clips (0.5 = seam-blind, 1.0 = it learned "seam"), and each one's flag rate at
    the operating point;
  - event-level F1 with a 200 ms collar (DCASE-style), from frames above threshold.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from heads import OUTPUTS, base_kind  # noqa: E402

CLEAN = ("none", "sham", "vocoded")
FA_TARGET = 0.05
COLLAR_S = 0.2


def auc(pos: list[float], neg: list[float]) -> float | None:
    if not pos or not neg:
        return None
    p, n = np.asarray(pos), np.asarray(neg)
    wins = (p[:, None] > n[None, :]).sum() + 0.5 * (p[:, None] == n[None, :]).sum()
    return float(wins / (len(p) * len(n)))


def clip_scores(probs: list[np.ndarray]) -> np.ndarray:
    """(clips, outputs) clip scores: each output's peak over frames."""
    return np.stack([p.max(axis=0) for p in probs])


def threshold_at(scores: np.ndarray, rate: float) -> float:
    """The score above which `rate` of these clips fall."""
    return float(np.quantile(scores, 1.0 - rate)) if len(scores) else 1.0


def events(frame_probs: np.ndarray, fps: float, thr: float) -> list[tuple[float, float]]:
    on = frame_probs >= thr
    out, start = [], None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        if not v and start is not None:
            out.append((start / fps, i / fps))
            start = None
    if start is not None:
        out.append((start / fps, len(on) / fps))
    return out


def event_f1(pred: list[list[tuple]], gold: list[list[tuple]], collar: float = COLLAR_S) -> dict:
    """Onset-based F1: a predicted event matches an unmatched gold event whose onset
    is within the collar."""
    tp = fp = fn = 0
    for p, g in zip(pred, gold):
        used = set()
        for a, _ in p:
            hit = next((j for j, (ga, _) in enumerate(g) if j not in used and abs(a - ga) <= collar), None)
            if hit is None:
                fp += 1
            else:
                used.add(hit)
                tp += 1
        fn += len(g) - len(used)
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    return {"f1": round(2 * prec * rec / (prec + rec), 3) if prec + rec else 0.0,
            "precision": round(prec, 3), "recall": round(rec, 3), "tp": tp, "fp": fp, "fn": fn}


def evaluate(rows: list[dict], probs: list[np.ndarray], fps: float, meta: dict) -> dict:
    scores = clip_scores(probs)
    defect_peak = scores[:, : len(OUTPUTS)].max(axis=1)
    kinds = [base_kind(r["kind"]) for r in rows]
    clean_idx = [i for i, r in enumerate(rows) if r["kind"] in CLEAN]
    none_idx = [i for i, r in enumerate(rows) if r["kind"] == "none"]
    sham_idx = [i for i, r in enumerate(rows) if r["kind"] == "sham"]
    thr = threshold_at(defect_peak[clean_idx], FA_TARGET) if clean_idx else 0.5
    report = {"encoder": meta.get("encoder"), "licence": meta.get("licence"), "clips": len(rows),
              "threshold": round(thr, 4), "fa_target_on_clean": FA_TARGET, "per_kind": {}}
    for j, k in enumerate(OUTPUTS):
        pos = [i for i, r in enumerate(rows) if kinds[i] == k and r.get("defect")]
        if not pos:
            continue
        curve = defaultdict(list)
        for i in pos:
            curve[rows[i]["severity"]].append(bool(defect_peak[i] >= thr))
        report["per_kind"][k] = {
            "n": len(pos),
            "auc_vs_clean": None if not clean_idx else round(auc(scores[pos, j].tolist(), scores[clean_idx, j].tolist()), 4),
            "hit_rate_by_severity": {str(s): round(float(np.mean(v)), 3) for s, v in sorted(curve.items())},
        }
    report["shortcut_check"] = {
        "flagged_none": round(float(np.mean(defect_peak[none_idx] >= thr)), 3) if none_idx else None,
        "flagged_sham": round(float(np.mean(defect_peak[sham_idx] >= thr)), 3) if sham_idx else None,
        "defect_auc_sham_vs_none": None if not (sham_idx and none_idx) else
        round(auc(defect_peak[sham_idx].tolist(), defect_peak[none_idx].tolist()), 4),
        "seam_output_auc_sham_vs_none": None if not (sham_idx and none_idx) else
        round(auc(scores[sham_idx, -1].tolist(), scores[none_idx, -1].tolist()), 4),
    }
    pred = [events(p[:, : len(OUTPUTS)].max(axis=1), fps, thr) for p in probs]
    gold = [[tuple(r["event_in_clip"])] if r.get("defect") and r.get("event_in_clip") else [] for r in rows]
    report["event_f1"] = event_f1(pred, gold)
    return report


def markdown(rep: dict) -> str:
    lines = [f"# Defect head: {rep['encoder']} (licence: {rep['licence']})", "",
             f"{rep['clips']} held-out clips; threshold {rep['threshold']} flags {rep['fa_target_on_clean']:.0%} of clean clips (none, sham, vocoded).", "",
             "| kind | n | AUC vs clean | hit rate by severity |", "|---|---|---|---|"]
    for k, v in rep["per_kind"].items():
        curve = ", ".join(f"{s}: {h}" for s, h in v["hit_rate_by_severity"].items())
        lines.append(f"| {k} | {v['n']} | {v['auc_vs_clean']} | {curve} |")
    sc = rep["shortcut_check"]
    lines += ["", f"Shortcut check: defect-score AUC sham vs none {sc['defect_auc_sham_vs_none']} "
                  f"(0.5 = seam-blind, 1.0 = learned 'seam'); flagged none {sc['flagged_none']}, sham {sc['flagged_sham']}; "
                  f"seam output AUC sham vs none {sc['seam_output_auc_sham_vs_none']}.",
              "", f"Event F1 (200 ms collar): {rep['event_f1']}"]
    return "\n".join(lines) + "\n"


def main() -> int:  # pragma: no cover - needs a trained run
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", required=True)
    a = ap.parse_args()
    run = Path(a.run)
    rows = json.loads((run / "test_rows.json").read_text(encoding="utf-8"))
    npz = np.load(run / "test_probs.npz")
    probs = [npz[str(i)] for i in range(len(rows))]
    meta = json.loads((run.parents[1] / ".." / "features" / run.parent.name / "meta.json").resolve().read_text(encoding="utf-8"))
    rep = evaluate(rows, probs, meta["fps"], meta)
    (run / "report.json").write_text(json.dumps(rep, indent=1), encoding="utf-8")
    (run / "report.md").write_text(markdown(rep), encoding="utf-8")
    print(markdown(rep))
    return 0


if __name__ == "__main__":
    sys.exit(main())
