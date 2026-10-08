"""Tests for the Step B defect heads (pytest; synthetic features, CPU, no weights).

    python -m pytest scripts/detector/test_detector.py -q
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(__file__))
import evaluate as ev  # noqa: E402
import features as ft  # noqa: E402
import heads as hd  # noqa: E402

FPS = 37.5
T = 150                 # 4 s of frames
L, D = 3, 16


def row(kind, severity=0.1, t=2.0, span=(2.0, 2.1), defect=None, song="s1", i=0):
    return {"clip": f"clips/{i:05d}.wav", "kind": kind, "severity": severity, "t_in_clip": t,
            "event_in_clip": list(span), "defect": hd.base_kind(kind) in hd.OUTPUTS if defect is None else defect,
            "song": song, "mix": f"{song}/pad16", "features": f"mem://{i}"}


def synthetic(rows, seed=0):
    """Features where each defect kind lights its own dimension over its span, and
    every seam (plants and shams) lights a shared 'seam' dimension: so a head that
    keys on the seam would flag shams, and one that learned the defect would not."""
    rng = np.random.default_rng(seed)
    store = {}
    for r in rows:
        x = rng.normal(0, 1, (L, T, D)).astype(np.float32)
        a, b = int(r["event_in_clip"][0] * FPS), int(np.ceil(r["event_in_clip"][1] * FPS)) + 1
        k = hd.base_kind(r["kind"])
        if k in hd.OUTPUTS:
            x[:, a:b, hd.OUTPUTS.index(k)] += 3.0
        if k in hd.SEAM_KINDS:
            x[:, a:b, D - 1] += 3.0
        store[r["features"]] = x
    return lambda path: store[path]


def dataset(n_per=12, song="s1", start=0):
    rows, i = [], start
    for k in ("replay", "click", "sham", "none"):
        for _ in range(n_per):
            rows.append(row(k, song=song, i=i, span=(2.0, 2.02) if k != "replay" else (2.0, 2.1)))
            i += 1
    return rows


def test_pool_frames_averages_pairs_and_drops_a_ragged_tail():
    x = np.arange(2 * 5 * 1, dtype=np.float32).reshape(2, 5, 1)
    y = ft.pool_frames(x, 2)
    assert y.shape == (2, 2, 1) and y[0, 0, 0] == pytest.approx(0.5)
    assert ft.pool_frames(x, 1) is x


def test_encoder_table_states_both_licences():
    assert "NC" in ft.ENCODERS["mert"]["licence"] and ft.ENCODERS["dasheng"]["licence"] == "Apache-2.0"


def test_frame_targets_mark_the_kind_and_the_seam():
    y = hd.frame_targets(row("replay", span=(2.0, 2.1)), T, FPS)
    assert y[int(2.05 * FPS), hd.OUTPUTS.index("replay")] == 1 and y[int(2.05 * FPS), -1] == 1
    s = hd.frame_targets(row("sham", span=(1.98, 2.02)), T, FPS)
    assert s[:, : len(hd.OUTPUTS)].sum() == 0 and s[:, -1].sum() > 0
    p = hd.frame_targets(row("pitch", span=(1.0, 1.5)), T, FPS)
    assert p[:, -1].sum() == 0                                    # a pitch slip is not a seam
    c = hd.frame_targets(row("replay+pause", span=(1.9, 2.05)), T, FPS)
    assert c[int(1.95 * FPS), hd.OUTPUTS.index("replay")] == 1


def test_split_holds_out_a_whole_song():
    rows = dataset(song="s1") + dataset(song="s2", start=100)
    tr, te = hd.split(rows, holdout_song="s2")
    assert {r["song"] for r in tr} == {"s1"} and {r["song"] for r in te} == {"s2"}
    with pytest.raises(ValueError):
        hd.split(rows)


def test_a_head_learns_defects_not_seams_on_synthetic_features():
    pytest.importorskip("torch")
    train_rows = dataset(song="s1") + dataset(song="s2", start=100)
    test_rows = dataset(n_per=8, song="s3", start=200)
    load = synthetic(train_rows + test_rows)
    head = hd.train(train_rows, FPS, epochs=30, batch=8, load=load)
    probs = hd.predict(head, test_rows, load=load)
    rep = ev.evaluate(test_rows, probs, FPS, {"encoder": "synthetic", "licence": "n/a"})
    assert rep["per_kind"]["replay"]["auc_vs_clean"] > 0.95
    assert rep["per_kind"]["click"]["auc_vs_clean"] > 0.95
    sc = rep["shortcut_check"]
    assert sc["flagged_sham"] <= 0.25                             # shams are not flagged as defects
    assert sc["defect_auc_sham_vs_none"] is not None              # the shortcut is measured, never hidden
    assert sc["seam_output_auc_sham_vs_none"] > 0.9               # while the seam output still sees them
    assert "licence: n/a" in ev.markdown(rep)


def test_event_f1_matches_onsets_within_the_collar():
    pred = [[(2.05, 2.2)], [(5.0, 5.1)], []]
    gold = [[(2.0, 2.1)], [], [(1.0, 1.1)]]
    got = ev.event_f1(pred, gold)
    assert (got["tp"], got["fp"], got["fn"]) == (1, 1, 1)


def test_events_and_auc_basics():
    probs = np.array([0, 0.9, 0.9, 0, 0.8])
    assert ev.events(probs, 10.0, 0.5) == [(0.1, 0.3), (0.4, 0.5)]
    assert ev.auc([0.9, 0.8], [0.1, 0.2]) == 1.0
    assert ev.auc([], [0.1]) is None
