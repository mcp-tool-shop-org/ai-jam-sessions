"""Tests for the pitch gate's second tracker (pytest; synthetic rows, no audio).

    python -m pytest scripts/test_pitch_recheck.py -q
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import vocal_clock as vc  # noqa: E402


def row(i, status, cents):
    return {"id": f"v{i:02d}", "status": status, "cents_mean": cents, "cents_median": cents, "cents_sd": 5.0, "reason": "x"}


def test_a_note_the_second_tracker_passes_is_rescued():
    rows = [row(0, "FAIL", 80.0), row(1, "PASS", 3.0)]
    out = vc.recheck_pitch(rows, {"v00": row(0, "PASS", 6.0)})
    assert rows[0]["status"] == "PASS" and rows[0]["cents_mean"] == 6.0 and rows[0]["tracker"] == "pyin"
    assert rows[0]["cross_check"] == "rescued" and rows[0]["pyin_status"] == "PASS"
    assert out["rescued_ids"] == ["v00"] and out["both_off"] == 0 and out["rechecked"] == 1


def test_a_note_both_trackers_put_off_still_fails():
    rows = [row(0, "FAIL", 80.0)]
    out = vc.recheck_pitch(rows, {"v00": row(0, "FAIL", 70.0)})
    assert rows[0]["status"] == "FAIL" and rows[0]["cents_mean"] == 80.0 and rows[0]["cross_check"] == "both_off"
    assert out["both_off_ids"] == ["v00"]


def test_the_second_tracker_never_makes_a_note_worse():
    rows = [row(0, "WARN", 30.0)]
    vc.recheck_pitch(rows, {"v00": row(0, "FAIL", 90.0)})
    assert rows[0]["status"] == "WARN" and rows[0]["cents_mean"] == 30.0


def test_an_untrackable_note_can_be_rescued_to_warn():
    rows = [row(0, "untrackable", None)]
    out = vc.recheck_pitch(rows, {"v00": row(0, "WARN", 28.0)})
    assert rows[0]["status"] == "WARN" and out["rescued"] == 1


def test_notes_without_a_second_reading_are_left_alone():
    rows = [row(0, "FAIL", 80.0)]
    out = vc.recheck_pitch(rows, {})
    assert rows[0]["status"] == "FAIL" and "cross_check" not in rows[0] and out["rechecked"] == 0


def test_a_note_improved_but_still_failing_is_off_on_both_not_rescued():
    rows = [row(0, "untrackable", None)]
    out = vc.recheck_pitch(rows, {"v00": row(0, "FAIL", 60.0)})
    assert rows[0]["status"] == "FAIL" and rows[0]["cross_check"] == "both_off"
    assert out["rescued"] == 0 and out["both_off_ids"] == ["v00"]
