"""Tests for warp placement (pytest; synthetic audio only).

    python -m pytest scripts/test_warp_place.py -q
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import vocal_clock as vc  # noqa: E402

SR = 16000


def cut(i, take, cut_start, vowel, cut_end, shift):
    return {"id": f"v{i:02d}", "lyric": f"s{i}", "source_key": take, "cut_start": cut_start, "cut_end": cut_end,
            "src_vowel_onset": vowel, "placed_start": cut_start + shift, "placed_end": cut_end + shift}


def test_runs_follow_one_take_in_source_order():
    cuts = [cut(0, "A", 1.0, 1.1, 1.8, 0.0), cut(1, "A", 1.8, 1.9, 2.6, 0.1), cut(2, "B", 3.0, 3.1, 3.8, 0.0),
            cut(3, "B", 1.0, 1.1, 1.8, 3.0)]                       # back in B's source: a new run
    assert [[c["id"] for c in r] for r in vc.warp_runs(cuts)] == [["v00", "v01"], ["v02"], ["v03"]]


def test_each_vowel_lands_where_the_plan_puts_it():
    run = [cut(0, "A", 1.0, 1.1, 1.8, 0.05), cut(1, "A", 1.8, 1.9, 2.6, 0.15)]
    src, dst = vc.warp_map(run)
    assert np.isclose(np.interp(1.1, src, dst), 1.15) and np.isclose(np.interp(1.9, src, dst), 2.05)
    assert np.isclose(dst[-1] - src[-1], 0.15), "the run's end keeps the last clip's shift"


def test_an_anchor_that_would_run_backwards_is_dropped():
    run = [cut(0, "A", 1.0, 1.1, 1.8, 0.4), cut(1, "A", 1.8, 1.9, 2.6, -0.5)]
    src, dst = vc.warp_map(run)
    assert all(b > a for a, b in zip(src, src[1:])) and all(b > a for a, b in zip(dst, dst[1:]))


def test_wsola_stretches_time_and_keeps_pitch():
    t = np.arange(int(1.0 * SR)) / SR
    x = np.sin(2 * np.pi * 220.0 * t)[:, None]
    y = vc.wsola(x, SR, [0.0, 1.0], [0.0, 1.3])
    assert len(y) == int(round(1.3 * SR))
    mid = y[int(0.3 * SR):int(1.0 * SR), 0]
    spec = np.abs(np.fft.rfft(mid * np.hanning(len(mid))))
    peak_hz = np.argmax(spec) * SR / len(mid)
    assert abs(peak_hz - 220.0) < 3.0


def test_warp_placement_never_plays_a_source_moment_twice():
    # a take whose every sample is its own time: if a join replayed audio, a
    # value would come back after a later one had already played
    take = np.arange(int(3.0 * SR), dtype=float)[:, None] / SR / 10.0
    plan = {"total_samples": int(4.0 * SR), "cuts": [cut(0, "A", 0.5, 0.6, 1.4, 0.0), cut(1, "A", 1.4, 1.5, 2.3, 0.12)]}
    out, joins = vc.place_warp(plan, {"A": take}, SR)
    assert {j["run"] for j in joins} == {0}
    v = out[int(0.7 * SR):int(2.2 * SR), 0]
    assert np.all(np.diff(v) > -1e-3), "the source never runs backwards"
