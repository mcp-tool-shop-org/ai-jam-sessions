"""Tests for the planter's two placement overrides (pytest; synthetic audio).

    python -m pytest scripts/test_placer_overrides.py -q

A cut may carry `xfade_s` (the crossfade at the join into it) and `break_before`
(warp placement starts a new run there). Production plans set neither, and
without them both placers must do exactly what they did before.
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import vocal_clock as vc  # noqa: E402

SR = 48000


def tone(seconds: float = 2.0) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    return (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float64)


def cut(cid: str, a: float, b: float, placed: float, **extra) -> dict:
    return {"id": cid, "source_key": "s", "cut_start": a, "cut_end": b, "clip_seconds": b - a,
            "placed_start": placed, "src_vowel_onset": a + 0.05, **extra}


def plan(cuts: list[dict]) -> dict:
    return {"total_samples": 2 * SR, "cuts": cuts}


def two_cuts(**second) -> dict:
    """One take, continuous in the source and on the timeline."""
    return plan([cut("a", 0.2, 0.6, 0.2), cut("b", 0.6, 1.0, 0.6, **second)])


def jump_at(y: np.ndarray, t: float, half: int = 48) -> float:
    """Largest sample-to-sample step within `half` samples of `t`."""
    i = int(t * SR)
    return float(np.abs(np.diff(y[i - half:i + half, 0])).max())


def test_an_explicit_default_crossfade_changes_nothing():
    src = {"s": tone()}
    shifted = plan([cut("a", 0.2, 0.6, 0.2), cut("b", 0.65, 1.0, 0.6)])
    explicit = plan([cut("a", 0.2, 0.6, 0.2), cut("b", 0.65, 1.0, 0.6, xfade_s=vc.XFADE_S)])
    a, ja = vc.place_local(shifted, src, SR)
    b, jb = vc.place_local(explicit, src, SR)
    assert np.array_equal(a, b) and ja == jb


def test_a_zero_crossfade_leaves_a_hard_edge_at_the_join():
    # skip 50 ms of source at the join: with the normal crossfade it is smoothed,
    # with none the waveform jumps (the planter's click plant)
    src = {"s": tone()}
    soft, _ = vc.place_local(plan([cut("a", 0.2, 0.6, 0.2), cut("b", 0.6127, 1.0, 0.6)]), src, SR)
    hard, _ = vc.place_local(plan([cut("a", 0.2, 0.6, 0.2), cut("b", 0.6127, 1.0, 0.6, xfade_s=0.0)]), src, SR)
    assert jump_at(hard, 0.6) > 3 * jump_at(soft, 0.6)


def test_break_before_starts_a_new_warp_run():
    cuts = [cut("a", 0.2, 0.6, 0.2), cut("b", 0.6, 1.0, 0.6)]
    assert len(vc.warp_runs(cuts)) == 1
    cuts[1]["break_before"] = True
    assert [len(r) for r in vc.warp_runs(cuts)] == [1, 1]


def test_a_forced_break_with_continuous_source_is_a_seam_and_nothing_else():
    # the sham: a real join between two runs of one take with nothing replayed or
    # skipped, so the audio stays close to the unbroken render
    src = {"s": tone()}
    whole, jw = vc.place_warp(two_cuts(), src, SR)
    split, js = vc.place_warp(two_cuts(break_before=True), src, SR)
    assert {j["run"] for j in jw} == {0} and {j["run"] for j in js} == {0, 1}
    i0, i1 = int(0.25 * SR), int(0.95 * SR)
    err = np.sqrt(np.mean((whole[i0:i1] - split[i0:i1]) ** 2)) / np.sqrt(np.mean(whole[i0:i1] ** 2))
    assert err < 0.25


def test_production_cuts_carry_neither_field_by_default():
    c = cut("a", 0.2, 0.6, 0.2)
    assert vc._xfade(c, SR) == int(vc.XFADE_S * SR)
    assert vc._xfade({**c, "xfade_s": 0.002}, SR) == 96


def test_an_explicit_zero_crossfade_is_a_hard_seam_in_warp_too():
    # a forced break that skips 13 ms of source: without an explicit crossfade the
    # two runs fade out and in (a dip); with xfade_s = 0 the seam is a hard edge
    src = {"s": tone()}
    dip, _ = vc.place_warp(plan([cut("a", 0.2, 0.6, 0.2), cut("b", 0.6127, 1.0, 0.6, break_before=True)]), src, SR)
    hard, _ = vc.place_warp(plan([cut("a", 0.2, 0.6, 0.2), cut("b", 0.6127, 1.0, 0.6, break_before=True, xfade_s=0.0)]), src, SR)
    assert jump_at(hard, 0.6, 240) > 3 * jump_at(dip, 0.6, 240)


def test_an_anchor_that_would_stretch_beyond_the_limit_is_dropped():
    # two vowel onsets dated 1 ms apart in the source but 0.5 s apart on the timeline:
    # keeping both would smear 1 ms of audio across half a second
    run = [cut("a", 0.2, 0.6, 0.2), cut("b", 0.6, 1.0, 0.6)]
    run[0]["src_vowel_onset"] = 0.300
    run[1]["src_vowel_onset"] = 0.301
    run[1]["placed_start"] = 1.1      # b's vowel lands 0.5 s after a's
    src, dst = vc.warp_map(run)
    ratios = [(d1 - d0) / (s1 - s0) for s0, s1, d0, d1 in zip(src, src[1:], dst, dst[1:])]
    assert all(1 / vc.WARP_MAX_RATIO <= r <= vc.WARP_MAX_RATIO for r in ratios)
    assert 0.301 not in src


def test_a_note_shorter_than_the_anchor_minimum_rides_between_its_neighbours():
    run = [cut("a", 0.2, 0.6, 0.2), cut("b", 0.6, 0.8, 0.62), cut("c", 0.8, 1.2, 0.8)]
    pinned, _ = vc.warp_map(run)
    loose, _ = vc.warp_map(run, frozenset({"b"}))
    assert run[1]["src_vowel_onset"] in pinned and run[1]["src_vowel_onset"] not in loose
    assert run[0]["src_vowel_onset"] in loose and run[2]["src_vowel_onset"] in loose
