"""Tests for filling undated syllables from the aligner (pytest).

    python -m pytest scripts/test_aligner_fill.py -q
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import vocal_clock as vc  # noqa: E402


def test_the_aligner_fills_only_what_the_detector_left_undated():
    rows = [{"id": "v1", "t_vowel": 1.00, "method": "rise", "dip_db": 20.0},
            {"id": "v2", "t_vowel": None, "method": None, "dip_db": None},
            {"id": "v3", "t_vowel": None, "method": None, "dip_db": None}]
    filled = vc.fill_undated(rows, {"v1": 1.20, "v2": 1.55, "v3": None})
    assert filled == ["v2"]
    assert rows[0]["t_vowel"] == 1.00 and rows[0]["method"] == "rise"     # the detector's dates stand
    assert rows[1]["t_vowel"] == 1.55 and rows[1]["method"] == "aligner"
    assert rows[2]["t_vowel"] is None                                     # nobody dated it: still undated
