"""Tests for the timing gate's second instrument (pytest; no aligner run, no audio).

    python -m pytest scripts/test_aligner_gate.py -q

The aligner itself (HubertFA) needs its own environment and is exercised by a real
run (docs/vocal-clock.md). Tested here: reading an aligned phrase into a vowel onset
per syllable, splitting a whole-song clock into phrases, and the cross-check rule
that lets the aligner overrule a detector miss but never fail a syllable alone.
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import onset_aligner as oa  # noqa: E402
import vocal_clock as vc  # noqa: E402


def textgrid(words, phones, xmax=3.0):
    def tier(name, rows):
        body = "".join(
            f'\t\t\tintervals [{i}]:\n\t\t\t\txmin = {a}\n\t\t\t\txmax = {b}\n\t\t\t\ttext = "{m}"\n'
            for i, (a, b, m) in enumerate(rows, 1))
        return (f'\titem [{1 if name == "words" else 2}]:\n\t\tclass = "IntervalTier"\n\t\tname = "{name}"\n'
                f"\t\txmin = 0.0\n\t\txmax = {xmax}\n\t\tintervals: size = {len(rows)}\n{body}")
    return (f'File type = "ooTextFile"\nObject class = "TextGrid"\n\nxmin = 0\nxmax = {xmax}\ntiers? <exists>\nsize = 2\n'
            f"item []:\n{tier('words', words)}{tier('phones', phones)}")


def ev(i, word, syllable, syllables, t, dur=0.4, lyric=None):
    return {"id": f"v{i:02d}", "word": word, "lyric": lyric or word, "syllable": syllable, "syllables": syllables,
            "t_sec": t, "dur_sec": dur}


# "the beau-ti-ful": "the" begins on a schwa, "beautiful" has a vowel per syllable.
EVENTS = [ev(0, "the", 0, 1, 0.2), ev(1, "beautiful", 0, 3, 0.6, lyric="beau"),
          ev(2, "beautiful", 1, 3, 1.0, lyric="ti"), ev(3, "beautiful", 2, 3, 1.4, lyric="ful")]
TG = textgrid(
    [(0.0, 0.1, "SP"), (0.1, 0.5, "the"), (0.5, 1.9, "beautiful"), (1.9, 3.0, "SP")],
    [(0.0, 0.1, "SP"), (0.1, 0.2, "dh"), (0.2, 0.5, "ax"), (0.5, 0.55, "b"), (0.55, 0.6, "y"), (0.6, 0.95, "uw"),
     (0.95, 1.0, "dx"), (1.0, 1.35, "ax"), (1.35, 1.4, "f"), (1.4, 1.8, "ax"), (1.8, 1.9, "l"), (1.9, 3.0, "SP")])


def test_every_syllable_gets_its_own_vowel_onset_schwa_included():
    groups = oa.word_groups(EVENTS)
    assert [len(g) for g in groups] == [1, 3]
    on = oa.syllable_onsets(oa.read_textgrid(TG), groups)
    assert on == {"v00": 0.2, "v01": 0.6, "v02": 1.0, "v03": 1.4}, "the schwa ('ax') is a vowel"


def test_a_word_whose_vowels_do_not_match_its_syllables_is_left_undated():
    two = [ev(1, "beautiful", 0, 2, 0.6, lyric="beau"), ev(2, "beautiful", 1, 2, 1.0, lyric="tiful")]
    tg = textgrid([(0.5, 1.9, "beautiful")], [(0.6, 0.95, "uw"), (1.0, 1.35, "ax"), (1.4, 1.8, "ax")])
    assert oa.syllable_onsets(oa.read_textgrid(tg), oa.word_groups(two)) == {"v01": None, "v02": None}


def test_aligned_words_must_be_the_expected_words():
    with pytest.raises(ValueError, match="do not match"):
        oa.syllable_onsets(oa.read_textgrid(TG), oa.word_groups([ev(0, "a", 0, 1, 0.2)]))


def test_a_whole_song_is_aligned_phrase_by_phrase_split_mid_rest():
    events = [ev(0, "oh", 0, 1, 1.0, 1.0), ev(1, "say", 0, 1, 2.0, 0.5),   # ends 2.5; rest to 4.0
              ev(2, "can", 0, 1, 4.0, 0.5), ev(3, "you", 0, 1, 4.6, 0.5)]  # 0.1 s breath: not a phrase end
    spans = oa.phrase_spans({"events": events, "total_seconds": 6.0}, gap=0.3)
    assert [(lo, hi) for lo, hi, _ in spans] == [(0.0, 3.25), (3.25, 6.0)]
    assert [[g[0]["word"] for g in groups] for _, _, groups in spans] == [["oh", "say"], ["can", "you"]]


def test_the_dictionary_is_the_bundled_one_plus_the_extra_words(tmp_path, monkeypatch):
    (tmp_path / "dictionaries").mkdir()
    (tmp_path / "dictionaries" / "ds_cmudict-07b.txt").write_bytes(b"a\tax\r\nthe\tdh ax\r\n")
    monkeypatch.setattr(oa, "HFA_ROOT", str(tmp_path))
    out = oa.write_dictionary(str(tmp_path / "d.txt"), {"ev'ry": "eh v r iy"})
    assert open(out, encoding="utf-8").read() == "a\tax\nthe\tdh ax\nev'ry\teh v r iy\n"
    assert oa.EXTRA_WORDS["ev'ry"] == "eh v r iy", "two syllables, as the 1919 hymnal prints it"


def row(i, err_ms, ok=True, dated=True):
    t = 10.0 + i
    return {"id": f"v{i:02d}", "lyric": "x", "t_score": t, "t_vowel": (t + err_ms / 1000) if dated else None,
            "reason": "ok" if (ok and dated) else "no-rise-in-window", "method": "rise", "dip_db": 20.0, "peak": 0.5}


def test_the_aligner_rescues_a_detector_miss_it_places_on_time():
    rows = [row(i, 0.0) for i in range(12)] + [row(12, 286.0), row(13, 300.0), row(14, 0.0, dated=False), row(15, 120.0)]
    aligner = {f"v{i:02d}": 10.0 + i - 0.015 for i in range(12)}            # agrees, 15 ms early: the offset
    aligner.update({"v12": 22.0 - 0.015 + 0.001,                             # on time after the offset: rescued
                    "v13": 23.0 + 0.200,                                      # both late: fails
                    "v14": None,                                              # detector undated, no answer: fails
                    "v15": 25.0 - 0.015})                                     # detector late, aligner on time: rescued
    result = vc.gate({"total_seconds": 30.0, "total_samples": 30 * 48000}, rows, None, 30 * 48000, 30 * 48000, None, aligner)
    xc = result["checks"]["aligner_cross_check"]
    assert xc["used"] and xc["offset_ms"] == pytest.approx(-15.0) and xc["measured_from"] == 12
    assert xc["rescued_ids"] == ["v12", "v15"] and xc["failing_ids"] == ["v13", "v14"]
    by = {t["id"]: t for t in result["table"]}
    assert by["v12"]["pass"] and by["v12"]["cross_check"] == "rescued" and by["v12"]["aligner_err_ms"] == pytest.approx(1.0)
    assert not by["v13"]["pass"] and by["v13"]["cross_check"] == "both_off"
    assert by["v14"]["cross_check"] == "unconfirmed"
    assert not result["checks"]["onset_abs_ms"]["pass"]


def test_the_aligner_alone_never_fails_a_syllable_and_all_rescued_passes():
    rows = [row(i, 0.0) for i in range(12)] + [row(12, 286.0)]
    aligner = {f"v{i:02d}": 10.0 + i - 0.015 for i in range(12)}
    aligner["v03"] = 13.0 + 1.4                     # a gross aligner error on a detector pass
    aligner["v12"] = 22.0 - 0.015
    result = vc.gate({"total_seconds": 30.0, "total_samples": 30 * 48000}, rows, None, 30 * 48000, 30 * 48000, None, aligner)
    by = {t["id"]: t for t in result["table"]}
    assert by["v03"]["pass"] and by["v03"]["cross_check"] == "disputed", "marked, not failed"
    assert result["checks"]["onset_abs_ms"]["pass"], "the only miss is rescued"
    assert result["checks"]["aligner_cross_check"]["disputed_ids"] == ["v03"]


def test_too_few_agreeing_syllables_to_measure_the_offset_means_no_cross_check():
    rows = [row(i, 0.0) for i in range(3)] + [row(3, 286.0)]
    aligner = {f"v{i:02d}": 10.0 + i for i in range(4)}
    result = vc.gate({"total_seconds": 30.0, "total_samples": 30 * 48000}, rows, None, 30 * 48000, 30 * 48000, None, aligner)
    assert result["checks"]["aligner_cross_check"] == {"info": True, "used": False, "reason": "only 3 syllables to measure the instruments' offset from"}
    assert not result["checks"]["onset_abs_ms"]["pass"], "nothing rescued without a measured offset"


def test_without_the_aligner_the_gate_is_unchanged():
    rows = [row(0, 0.0), row(1, 286.0)]
    result = vc.gate({"total_seconds": 30.0, "total_samples": 30 * 48000}, rows, None, 30 * 48000, 30 * 48000, None)
    assert "aligner_cross_check" not in result["checks"]
    assert [t["pass"] for t in result["table"]] == [True, False]
