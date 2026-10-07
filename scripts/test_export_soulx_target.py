"""Tests for the SoulX target exporter (pytest; no g2p download, no GPU).

    python -m pytest scripts/test_export_soulx_target.py -q

A synthetic clock with a stand-in g2p, so every duration and boundary has an
exact expected value.
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import export_soulx_target as ex  # noqa: E402

PHONES = {"oh": ["OW1"], "say": ["S", "EY1"], "can": ["K", "AE1", "N"], "you": ["Y", "UW1"], "see": ["S", "IY1"]}


def g2p(word: str) -> list[str]:
    return PHONES[word.lower()]


def ev(i, word, t, dur, midi=60, melisma=None):
    e = {"id": f"v{i:02d}", "lyric": word, "word": word, "syllable": 0, "syllables": 1, "midi": midi, "t_sec": t, "dur_sec": dur}
    if melisma:
        e["melisma"] = melisma
    return e


def clock(events, total):
    return {"schema": "ai-jam-sessions/score-clock/v1", "song_id": "t", "total_seconds": total, "events": events}


def rows(seg):
    return list(zip(seg["text"].split(), seg["phoneme"].split(), map(int, seg["note_pitch"].split()),
                    map(int, seg["note_type"].split()), map(float, seg["duration"].split())))


# Two phrases: "oh say" (0.5-2.5 s) and "can you see" (4.0-7.0 s), a 1.5 s rest between,
# "say" held from 1.5 s onto a second note (midi 62) until 2.5 s.
PHRASES = [
    ev(0, "oh", 0.5, 1.0),
    ev(1, "say", 1.5, 1.0, melisma=[{"midi": 62, "t_sec": 2.0, "dur_sec": 0.5}]),
    ev(2, "can", 4.0, 1.0),
    ev(3, "you", 5.0, 0.8),
    ev(4, "see", 6.0, 1.0),
]


def test_one_segment_tiles_the_whole_clock_with_rests_as_silence():
    [seg] = ex.build_target(clock(PHRASES, 8.0), g2p)
    assert seg["time"] == [0, 8000]
    r = rows(seg)
    assert sum(d for *_, d in r) == pytest.approx(8.0)
    assert r[0] == ("<SP>", "<SP>", 0, 1, 0.5)
    assert [t for t, *_ in r] == ["<SP>", "oh", "say", "say", "<SP>", "can", "you", "<SP>", "see", "<SP>"]
    assert r[4][4] == pytest.approx(1.5), "the rest between the phrases is silence"
    assert r[7][4] == pytest.approx(0.2), "so is the short breath after 'you'"
    assert r[-1][4] == pytest.approx(1.0)


def test_a_held_syllable_continues_onto_its_extra_note_with_the_same_phonemes():
    [seg] = ex.build_target(clock(PHRASES, 8.0), g2p)
    r = rows(seg)
    first, held = r[2], r[3]
    assert first == ("say", "en_S-EY1", 60, 2, pytest.approx(0.5)), "the first note lasts until the held note starts"
    assert held == ("say", "en_S-EY1", 62, 3, pytest.approx(0.5)), "type 3: the same syllable continues, at the new pitch"


def test_segment_gap_splits_at_long_rests_only_and_the_segments_tile_the_clock():
    segs = ex.build_target(clock(PHRASES, 8.0), g2p, segment_gap=1.0)
    assert [s["time"] for s in segs] == [[0, 3240], [3240, 8000]], "the cut is mid-rest, (2.5 + 4.0) / 2, on the nearest 20 ms frame"
    for s in segs:
        assert sum(d for *_, d in rows(s)) == pytest.approx((s["time"][1] - s["time"][0]) / 1000)
    words = [t for s in segs for t, *_ in rows(s) if t != "<SP>"]
    assert words == ["oh", "say", "say", "can", "you", "see"], "every note once, in order"
    assert rows(segs[1])[0] == ("<SP>", "<SP>", 0, 1, pytest.approx(0.76))
    assert segs[0]["index"] == "t_0_3240"


def test_a_short_breath_is_not_a_segment_boundary_and_neither_is_a_held_note():
    assert len(ex.build_target(clock(PHRASES, 8.0), g2p, segment_gap=1.6)) == 1, "no rest is that long"
    segs = ex.build_target(clock(PHRASES, 8.0), g2p, segment_gap=0.1)
    assert [s["time"] for s in segs] == [[0, 3240], [3240, 5900], [5900, 8000]]
    assert all(["say", "say"] == [t for t, *_ in rows(s) if t == "say"] for s in segs if "say" in s["text"])


def test_boundaries_land_on_frames():
    events = [ev(0, "oh", 0.5, 1.0), ev(1, "see", 3.013, 1.0)]
    segs = ex.build_target(clock(events, 5.0), g2p, segment_gap=0.5)
    cut = segs[0]["time"][1] / 1000
    assert abs(cut / ex.FRAME_SEC - round(cut / ex.FRAME_SEC)) < 1e-9
    assert 1.5 < cut < 3.013


def test_a_note_that_overlaps_the_next_is_refused():
    events = [ev(0, "oh", 0.5, 1.0), ev(1, "see", 1.2, 1.0)]
    with pytest.raises(SystemExit, match="before the previous note ends"):
        ex.build_target(clock(events, 3.0), g2p)
