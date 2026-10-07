"""Tests for the listening review's report (pytest; no audio, no browser).

    python -m pytest scripts/test_review_marks.py -q

Three syllables from two takes, with one switch and one air gap, so each kind of
marker has one right explanation.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import review_marks as rm  # noqa: E402


def cut(i, lyric, take, start, end):
    return {"id": f"v{i:02d}", "lyric": lyric, "word": lyric, "source_key": f"E:/run/{take}/take-48k.wav",
            "placed_start": start, "placed_end": end, "cut_start": start - 0.5, "cut_end": end - 0.5}


PLAN = {"cuts": [cut(0, "oh", "take-01", 1.0, 1.9), cut(1, "say", "take-01", 2.0, 2.9), cut(2, "can", "take-02", 4.0, 4.9),
                 cut(3, "you", "take-02", 5.0, 5.9)]}
GAPS = {"v00": 60.0, "v01": 5.0}       # air after v00; v01's join to v02 is a clean switch


def entry():
    syl = rm.syllables(PLAN)
    return {"syllables": syl, "joins": rm.joins(syl, GAPS)}


def test_joins_are_switches_between_takes_or_audible_air():
    js = entry()["joins"]
    assert [(j["after"], j["switch"], j["air_ms"]) for j in js] == [("v00", False, 60.0), ("v01", True, 5.0)]


def test_without_placement_gaps_only_switches_are_joins():
    assert [j["after"] for j in rm.joins(rm.syllables(PLAN))] == ["v01"]


def test_a_marker_just_after_a_switch_is_explained_by_the_switch():
    r = rm.explain({"t": 4.3, "cats": ["stutter"]}, entry(), {}, {})
    assert r["suspect"] == "join" and "switch take-01 -> take-02" in r["findings"][0]
    assert r["joins"][0]["ms_before_press"] == 300


def test_a_marker_after_air_names_the_gap():
    r = rm.explain({"t": 2.2}, entry(), {}, {})
    assert r["suspect"] == "join" and "60 ms of air" in r["findings"][0]


def test_gate_failures_in_the_window_are_reported():
    timing = {"v03": {"pass": False, "err_ms": 120.0, "aligner_err_ms": 110.0, "cross_check": "both_off"}}
    pitch = {"v03": [{"id": "v03", "status": "FAIL", "cents_mean": 80.0}, {"id": "v03.1", "status": "PASS", "cents_mean": 3.0}]}
    r = rm.explain({"t": 5.6}, entry(), timing, pitch)
    assert r["suspect"] == "gate"
    assert any("timing 120.0 ms" in f for f in r["findings"]) and any("v03) pitch FAIL" in f for f in r["findings"])


def test_a_marker_nothing_explains_points_at_the_raw_take():
    r = rm.explain({"t": 1.5}, entry(), {}, {})
    assert r["suspect"] == "render" and r["listen_raw"] == [{"take": "take-01", "from": 0.5, "to": 1.4}]


def test_a_marker_in_silence_says_so():
    assert rm.explain({"t": 8.0}, entry(), {}, {})["suspect"] == "silence"


def test_both_mark_formats_are_read():
    m = [{"t": 1.0}]
    assert rm.marks_by_entry({"schema": rm.SCHEMA, "entries": {"s:v": {"marks": m}}}) == {"s:v": m}
    assert rm.marks_by_entry({"s:v": m}) == {"s:v": m}


def test_take_names_come_from_the_folder():
    assert rm.take_name(r"C:\run\take-03\take-48k.wav") == "take-03"


def by(name, level):
    return {"name": name, "level": level}


def test_one_reviewer_marking_twice_counts_once_toward_heard():
    w = rm.weigh([{"t": 1.0, "by": by("a", "model")}, {"t": 1.3, "by": by("a", "model")}])
    assert w["heard"] == 0.4


def test_reviewers_who_agree_raise_how_sure_we_are_it_is_audible():
    w = rm.weigh([{"t": 1.0, "by": by("a", "model")}, {"t": 1.4, "by": by("b", "model")}])
    assert w["heard"] == 0.64


def test_a_listener_is_sure_where_but_a_professional_settles_what():
    w = rm.weigh([{"t": 1.0, "cats": ["stutter"], "by": by("mike", "listener")},
                  {"t": 1.2, "cats": ["pitch"], "by": by("pro", "professional")}])
    assert w["heard"] == 1.0
    assert list(w["categories"]) == ["pitch", "stutter"] and w["categories"]["stutter"] == 0.25


def test_a_mark_without_a_reviewer_is_a_listeners():
    assert rm.level_of({"t": 1.0}) == rm.LEVELS["listener"]


def test_marks_cluster_by_time():
    groups = rm.cluster([{"t": 5.0}, {"t": 1.0}, {"t": 1.8}, {"t": 2.7}])
    assert [[m["t"] for m in g] for g in groups] == [[1.0, 1.8, 2.7], [5.0]]
