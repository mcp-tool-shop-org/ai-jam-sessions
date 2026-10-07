"""Tests for the phrase-by-phrase pick (pytest; no listener, no audio).

    python -m pytest scripts/test_phrase_picker.py -q

A two-phrase clock and two takes with hand-written verify rows, so which take
sings which phrase has one right answer.
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import phrase_scores as ps  # noqa: E402
import vocal_clock as vc  # noqa: E402

A, B = "run/take-01/take-48k.wav", "run/take-02/take-48k.wav"


def clock():
    def ev(i, word, t):
        return {"id": f"v{i:02d}", "lyric": word, "word": word, "syllable": 0, "syllables": 1, "midi": 60,
                "t_sec": t, "dur_sec": 0.4, "anchor": "test"}
    # phrase 0: "oh say" (1.0-1.9); rest; phrase 1: "can you" (3.0-3.9)
    return {"song_id": "t", "sample_rate": 48000, "total_seconds": 5.0, "total_samples": 5 * 48000,
            "events": [ev(0, "oh", 1.0), ev(1, "say", 1.5), ev(2, "can", 3.0), ev(3, "you", 3.5)]}


def rows(errs_ms):
    """Verify rows for a take whose vowel lands err ms off each syllable (None = undated)."""
    c = clock()
    return [{"id": e["id"], "lyric": e["lyric"], "t_score": e["t_sec"],
             "t_vowel": None if err is None else e["t_sec"] + err / 1000.0, "dip_db": 20.0, "method": "rise"}
            for e, err in zip(c["events"], errs_ms)]


def scores(intel, fails=None):
    """intel: {take: [phrase 0, phrase 1]}; fails likewise (pitch-gate fails per phrase)."""
    return {"takes": {t: {"phrases": {str(i): {"intelligibility": v, "mean_abs_cents": 10.0,
                                                 "pitch_fails": (fails or {}).get(t, [0, 0])[i]} for i, v in enumerate(vals)}}
                      for t, vals in intel.items()}}


def pick(cands, sc=None):
    c = clock()
    return vc.repin_words(c, cands, {A: 5.0, B: 5.0}, phrases=vc.rank_phrases(c, cands, sc))


def sources(plan):
    return {cut["id"]: vc.take_name(cut["source_key"]) for cut in plan["cuts"]}


def test_each_phrase_comes_whole_from_the_take_the_listener_understood_best():
    cands = [{"key": A, "rows": rows([5, 5, 5, 5])}, {"key": B, "rows": rows([20, 20, 20, 20])}]
    plan = pick(cands, scores({"take-01": [0.5, 1.0], "take-02": [1.0, 0.5]}))
    assert plan["mode"] == "repin-phrases"
    assert sources(plan) == {"v00": "take-02", "v01": "take-02", "v02": "take-01", "v03": "take-01"}
    assert [(p["index"], p["take"], p["rank"]) for p in plan["phrases"]] == [(0, "take-02", 0), (1, "take-01", 0)]


def test_a_take_that_cannot_date_a_word_of_the_phrase_gives_way_to_the_next():
    cands = [{"key": A, "rows": rows([5, 5, 5, 5])}, {"key": B, "rows": rows([20, None, 20, 20])}]
    plan = pick(cands, scores({"take-01": [0.5, 0.5], "take-02": [1.0, 1.0]}))
    assert sources(plan)["v00"] == sources(plan)["v01"] == "take-01", "never half a phrase from each"
    assert plan["phrases"][0]["take"] == "take-01" and plan["phrases"][0]["rank"] == 1
    assert sources(plan)["v02"] == "take-02"


def test_a_phrase_no_single_take_can_sing_falls_back_to_the_word_level_pick():
    cands = [{"key": A, "rows": rows([None, 5, 5, 5])}, {"key": B, "rows": rows([5, None, 5, 5])}]
    plan = pick(cands, scores({"take-01": [1.0, 1.0], "take-02": [0.5, 0.5]}))
    assert plan["phrases"][0] == {"index": 0, "start": 0.0, "end": 2.45, "take": None, "fallback": "word-level"}
    assert sources(plan)["v00"] == "take-02" and sources(plan)["v01"] == "take-01"


def test_after_intelligibility_a_wrong_note_outranks_a_late_onset():
    # take-01 is in the gate everywhere but fails a note in phrase 0; take-02 is late but in tune
    cands = [{"key": A, "rows": rows([5, 5, 5, 5])}, {"key": B, "rows": rows([60, 60, 5, 5])}]
    plan = pick(cands, scores({"take-01": [1.0, 1.0], "take-02": [1.0, 1.0]}, {"take-01": [1, 0], "take-02": [0, 0]}))
    assert [(p["take"], p["pitch_fails"]) for p in plan["phrases"]] == [("take-02", 0), ("take-01", 0)]


def test_without_scores_the_take_with_more_syllables_in_the_gate_leads():
    cands = [{"key": A, "rows": rows([80, 90, 5, 5])}, {"key": B, "rows": rows([5, 5, 80, 90])}]
    ranked = vc.rank_phrases(clock(), cands)
    assert [r["ranked"][0]["take"] for r in ranked] == ["take-02", "take-01"]
    assert ranked[0]["ranked"][0]["within_gate"] == 2 and ranked[0]["ranked"][1]["within_gate"] == 0


def test_the_word_level_pick_is_unchanged_without_phrases():
    cands = [{"key": A, "rows": rows([5, 5, 5, 5])}, {"key": B, "rows": rows([20, 20, 20, 20])}]
    c = clock()
    plan = vc.repin_words(c, cands, {A: 5.0, B: 5.0})
    assert plan["mode"] == "repin-words" and "phrases" not in plan
    assert set(sources(plan).values()) == {"take-01"}, "the tighter take wins every word"


def test_take_names_come_from_the_take_folder_on_any_platform():
    assert vc.take_name("E:/x/take-07/take-48k.wav") == "take-07"
    assert vc.take_name(r"C:\run\take-03\take-48k.wav") == "take-03"


@pytest.mark.parametrize("expected,heard,want", [
    ("amazing grace how sweet the sound", "amazing grace how sweet the sound", 6),
    ("amazing grace how sweet the sound", "amazing grace", 2),
    ("confirm thy soul in selfcontrol", "confirm the soul in self control", 4),
    ("god mend thine ev'ry flaw", "god mend thine every flower", 4),
    ("america may god thy gold refine", "america the beautiful", 1),
])
def test_the_listener_is_scored_on_words_heard_in_order(expected, heard, want):
    assert ps.heard_matches(expected.split(), heard) == want
