"""Tests for alternate picks (pytest; synthetic rankings, no audio).

    python -m pytest scripts/test_alt_picks.py -q
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import alt_picks as ap  # noqa: E402


def phrase(*takes):
    """A ranked phrase: (candidate, intelligibility, pitch_fails) in rank order."""
    return {"index": 0, "ranked": [{"candidate": c, "intelligibility": i, "pitch_fails": f} for c, i, f in takes]}


def test_alternatives_are_the_takes_about_as_good_as_the_best():
    ph = phrase((3, 1.0, 0), (5, 0.95, 1), (1, 0.85, 0), (2, 1.0, 2), (4, None, 0))
    assert ap.alternatives(ph) == [3, 5]          # 0.85 heard is too far down; 2 fails too many; 4 unscored
    assert ap.alternatives(ph, intel_slack=0.2, fails_slack=2) == [3, 5, 1, 2]


def test_a_phrase_without_scores_keeps_its_top_take():
    assert ap.alternatives(phrase((7, None, None), (2, None, None))) == [7]


def test_reorder_shuffles_only_the_alternatives_and_keeps_the_rest_in_order():
    ph = phrase((3, 1.0, 0), (5, 1.0, 0), (6, 1.0, 1), (1, 0.5, 0), (2, 0.4, 0))
    seen = set()
    for seed in range(40):
        got = [r["candidate"] for r in ap.reorder([ph], np.random.default_rng(seed))[0]["ranked"]]
        assert sorted(got[:3]) == [3, 5, 6] and got[3:] == [1, 2]
        seen.add(tuple(got[:3]))
    assert len(seen) > 1                           # it does reorder
    assert [r["candidate"] for r in ph["ranked"]] == [3, 5, 6, 1, 2]   # input untouched


def test_signature_and_same_cuts():
    a = {"phrases": [{"take": "take-01"}, {"take": None}],
         "cuts": [{"id": "v0", "source_key": "s", "cut_start": 1.0, "placed_start": 2.0}]}
    b = {"phrases": [{"take": "take-01"}, {"take": None}],
         "cuts": [{"id": "v0", "source_key": "s", "cut_start": 1.0000001, "placed_start": 2.0}]}
    assert ap.signature(a) == ("take-01", None)
    assert ap.same_cuts(a, b)
    b["cuts"][0]["source_key"] = "t"
    assert not ap.same_cuts(a, b)
