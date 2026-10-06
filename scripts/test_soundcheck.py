"""Tests for the vocal sound check (pytest; no GPU, no SoulX, synthetic audio only).

    E:/AI/SoulX-Singer/.venv/Scripts/python -m pytest scripts/test_soundcheck.py -q

The takes here are synthetic vowels placed at KNOWN offsets from the score, so
every number the sound check reports has an exact expected answer. The detector
dates a vowel half-way up its attack (RISE_FRACTION), so a syllable with a 10 ms
attack reads 5 ms after the moment it starts; ATTACK_LAG_MS accounts for that.
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
import soundcheck as sc  # noqa: E402
import vocal_clock as vc  # noqa: E402

SONG = os.path.join(os.path.dirname(__file__), "..", "scores", "america-the-beautiful.score-clock.v1.json")
ATTACK = 0.010
ATTACK_LAG_MS = ATTACK * 1000 / 2


def vowel(sr, dur, f0=220.0):
    n = int(dur * sr)
    t = np.arange(n) / sr
    env = np.clip(t / ATTACK, 0, 1) * np.exp(-t / max(dur, 1e-3) * 1.5)
    return env * (np.sin(2 * np.pi * f0 * t) + 0.5 * np.sin(2 * np.pi * 2 * f0 * t)) * 0.3


def write_take(tmp_path, name, clock, offset_ms):
    """A take whose vowel for event e starts at t_sec + offset_ms(e) / 1000."""
    sr = clock["sample_rate"]
    x = np.zeros(int(clock["total_seconds"] * sr))
    for e in clock["events"]:
        start = e["t_sec"] + offset_ms(e) / 1000.0
        y = vowel(sr, e["dur_sec"] * 0.85)
        i = int(round(start * sr))
        x[i:i + len(y)] += y[: len(x) - i]
    d = tmp_path / name
    d.mkdir()
    path = d / "take-48k.wav"
    sf.write(str(path), x, sr, subtype="PCM_16")
    return str(path)


@pytest.fixture
def clock(tmp_path):
    c = sc.build_clock(vc.load_clock(SONG))
    p = tmp_path / "clock.json"
    json.dump(c, open(p, "w"), indent=2)
    return vc.load_clock(str(p))


def test_clock_is_a_score_clock_at_the_songs_tempo_and_pitch(clock):
    song = vc.load_clock(SONG)
    prof = clock["soundcheck"]["profile"]
    assert clock["schema"] == "ai-jam-sessions/score-clock/v1"
    assert clock["bpm"] == song["bpm"]
    assert len(clock["events"]) == len(sc.PHRASE) == 16
    assert {e["midi"] for e in clock["events"]} == {prof["median_midi"]}
    # every group gets two held and two short notes
    for g in sc.GROUPS:
        lengths = [e["length"] for e in clock["events"] if e["group"] == g]
        assert sorted(lengths) == ["held", "held", "short", "short"]
    # events are contiguous and the clock leaves at least a bar of air after the last
    ev = clock["events"]
    for a, b in zip(ev, ev[1:]):
        assert b["t_sec"] == pytest.approx(a["t_sec"] + a["dur_sec"], abs=1e-6)
    assert clock["total_seconds"] >= clock["last_event_end_sec"] + 1.0


def test_a_steady_group_lead_is_corrected_and_random_scatter_is_not(tmp_path, clock):
    # fricatives always land 30 ms late; stops lean late too (+20) but scatter
    # ±35 around it, too loose to correct; the others are on time
    def make(k):
        def off(e):
            if e["group"] == "fricative":
                return 30.0
            if e["group"] == "stop":
                return 20.0 + (35.0 if (k + int(e["id"][1:])) % 2 else -35.0)
            return 0.0
        return off
    takes = [write_take(tmp_path, f"take-{k:02d}", clock, make(k)) for k in range(3)]
    r = sc.analyze(clock, takes, None)
    g = r["groups"]
    assert g["fricative"]["mean_ms"] == pytest.approx(30 + ATTACK_LAG_MS, abs=3)
    assert g["fricative"]["correction_ms"] == pytest.approx(-(30 + ATTACK_LAG_MS), abs=3)
    assert g["stop"]["correction_ms"] is None
    assert abs(g["stop"]["mean_ms"]) >= sc.CORRECT_MIN_BIAS_MS
    assert "spread" in g["stop"]["why"]
    # on-time groups read only the detector's attack lag, below the correction floor
    assert g["none"]["correction_ms"] is None
    assert "under" in g["none"]["why"]


def test_takes_needed_follows_the_union_bound():
    # one syllable, p = 0.5, 95 %: (0.5)^N <= 0.05  ->  N = 5
    assert sc.takes_needed(0.5, 1, 0.95) == 5
    # spreading the 5 % over 14 syllables makes each one stricter
    n = sc.takes_needed(0.5, 14, 0.95)
    assert 0.5 ** n <= 0.05 / 14 < 0.5 ** (n - 1)
    assert sc.takes_needed(1.0, 14) == 1
    with pytest.raises(ValueError):
        sc.takes_needed(0.0, 3)


def test_analyze_plans_takes_from_the_hit_rate(tmp_path, clock):
    # short notes miss the gate by 60 ms in every take; held notes are on time
    off = lambda e: 60.0 if e["length"] == "short" else 0.0  # noqa: E731
    takes = [write_take(tmp_path, f"take-{k:02d}", clock, off) for k in range(3)]
    r = sc.analyze(clock, takes, None)
    # placement fixes raw offsets: every vowel is dated, so the picker can use them all
    assert r["length_risk"]["held"]["hits"] == r["length_risk"]["short"]["hits"] == 24
    # ...but a pipeline WITHOUT placement would lose every short note
    held, short = sc.hit_rate(sc_rows(clock, takes), "held", "raw_in_gate"), sc.hit_rate(sc_rows(clock, takes), "short", "raw_in_gate")
    assert held["hits"] == held["n"] == 24
    assert short["hits"] == 0
    # Laplace smoothing: never claims certainty from three takes
    assert short["p"] == pytest.approx(1 / 26, abs=1e-4)
    prof = clock["soundcheck"]["profile"]
    assert r["plan"]["basis"] == "dated"
    plan = r["plans"]["raw_in_gate"]
    assert plan["song_syllables"] == prof["syllables"]
    assert plan["held"] + plan["short"] == prof["syllables"]
    # only the note lengths the SONG contains drive the plan: America is all
    # quarter notes, so the short-note misses here must not inflate it
    expected = []
    if plan["held"]:
        expected.append(sc.takes_needed(held["p"], prof["syllables"]))
    if plan["short"]:
        expected.append(sc.takes_needed(short["p"], prof["syllables"]))
    assert plan["takes_needed"] == max(expected)
    if plan["short"] == 0:
        assert plan["takes_needed"] < sc.takes_needed(short["p"], prof["syllables"])

    # a song WITH short notes is planned on the short-note rate
    song = vc.load_clock(SONG)
    song["events"] = song["events"] + [dict(song["events"][0], id="x", dur_sec=0.2)] * 6
    r2 = sc.analyze(dict(clock, soundcheck={"profile": sc.song_profile(song)}), takes, None)
    p2 = r2["plans"]["raw_in_gate"]
    assert p2["short"] == 6
    assert p2["takes_needed"] == sc.takes_needed(short["p"], p2["song_syllables"])


def sc_rows(clock, takes):
    return [sc.take_errors(clock, t) for t in takes]


def test_an_undated_vowel_is_what_costs_takes(tmp_path, clock):
    # a vowel-first word with no audible rise: the detector cannot date it, so the
    # picker cannot place it, however close to the clock the rest sits
    def silent_on_none(e):
        return 0.0
    paths = []
    for k in range(3):
        p = write_take(tmp_path, f"take-{k:02d}", clock, silent_on_none)
        data, sr = sf.read(p)
        e = next(e for e in clock["events"] if e["word"] == "on")   # a held, vowel-first word mid-phrase
        data[int((e["t_sec"] - 0.12) * sr):int((e["t_sec"] + e["dur_sec"]) * sr)] = 0.0
        sf.write(p, data, sr, subtype="PCM_16")
        paths.append(p)
    r = sc.analyze(clock, paths, None)
    assert r["groups"]["none"]["dated"] == 9 and r["groups"]["none"]["syllables"] == 12
    assert r["length_risk"]["held"]["hits"] == 24 - 3
    assert r["plans"]["dated"]["takes_needed"] > sc.takes_needed(r["length_risk"]["short"]["p"], 14)


def aligner_at(clock, takes_offsets):
    """Fake aligner output: per take, each vowel's onset at score + offset_ms(e)."""
    return [[e["t_sec"] + off(e) / 1000.0 for e in clock["events"]] for off in takes_offsets]


def test_the_aligner_is_primary_and_the_offset_between_instruments_is_measured(tmp_path, clock):
    # every vowel exactly on the clock; the aligner says so, and the detector reads
    # half-way up a 10 ms attack: 5 ms later, on every word, by definition
    takes = [write_take(tmp_path, f"take-{k:02d}", clock, lambda e: 0.0) for k in range(2)]
    r = sc.analyze(clock, takes, None, aligner=aligner_at(clock, [lambda e: 0.0] * 2))
    c = r["cross_check"]
    assert r["primary"] == "aligner"
    assert c["offset_ms"] == pytest.approx(ATTACK_LAG_MS, abs=1.5)
    assert all(s["agree"] == s["both"] == 8 for s in c["groups"].values())
    assert c["flagged"] == []
    # the footprint is the aligner's reading: exactly on the clock
    assert all(abs(g["mean_ms"]) < 0.5 for g in r["groups"].values())
    assert r["plan"]["basis"] == "agreed"


def test_a_disagreement_is_flagged_and_does_not_count_as_confirmed(tmp_path, clock):
    takes = [write_take(tmp_path, f"take-{k:02d}", clock, lambda e: 0.0) for k in range(2)]
    # the aligner places "low" 120 ms early in take 1: the detector does not
    wrong = lambda e: -120.0 if e["word"] == "low" else 0.0  # noqa: E731
    r = sc.analyze(clock, takes, None, aligner=aligner_at(clock, [wrong, lambda e: 0.0]))
    c = r["cross_check"]
    flagged = [f for f in c["flagged"] if f["status"] == "disagree"]
    assert [f["word"] for f in flagged] == ["low"]
    assert flagged[0]["gap_ms"] == pytest.approx(120, abs=2)
    assert c["groups"]["sonorant"]["agree"] == 7
    # confirmed placements count one fewer than placeable ones
    agreed = sc.hit_rate(r["rows"], basis="agreed")["hits"]
    dated = sc.hit_rate(r["rows"], basis="dated")["hits"]
    assert dated - agreed == 1


def test_a_vowel_only_the_aligner_finds_is_reported_as_aligner_only(tmp_path, clock):
    p = write_take(tmp_path, "take-00", clock, lambda e: 0.0)
    data, sr = sf.read(p)
    e = next(e for e in clock["events"] if e["word"] == "on")
    data[int((e["t_sec"] - 0.12) * sr):int((e["t_sec"] + e["dur_sec"]) * sr)] = 0.0
    sf.write(p, data, sr, subtype="PCM_16")
    r = sc.analyze(clock, [p], None, aligner=aligner_at(clock, [lambda e: 0.0]))
    row = next(x for x in r["rows"][0] if x["word"] == "on")
    assert row["status"] == "aligner-only"
    assert row["error_ms"] == pytest.approx(0.0, abs=0.01)   # the primary reading still exists
    assert r["cross_check"]["groups"]["none"]["statuses"]["aligner-only"] == 1


def test_without_the_aligner_the_detector_is_primary(tmp_path, clock):
    take = write_take(tmp_path, "take-00", clock, lambda e: 0.0)
    r = sc.analyze(clock, [take], None)
    assert r["primary"] == "detector" and r["cross_check"] is None
    assert "agreed" not in r["plans"] and r["plan"]["basis"] == "dated"


TEXTGRID = """File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 3.0
tiers? <exists>
size = 2
item []:
	item [1]:
		class = "IntervalTier"
		name = "words"
		xmin = 0.0
		xmax = 3.0
		intervals: size = 4
			intervals [1]:
				xmin = 0.0
				xmax = 0.5
				text = "SP"
			intervals [2]:
				xmin = 0.5
				xmax = 1.2
				text = "day"
			intervals [3]:
				xmin = 1.2
				xmax = 2.0
				text = "oh"
			intervals [4]:
				xmin = 2.0
				xmax = 3.0
				text = "SP"
	item [2]:
		class = "IntervalTier"
		name = "phones"
		xmin = 0.0
		xmax = 3.0
		intervals: size = 5
			intervals [1]:
				xmin = 0.0
				xmax = 0.5
				text = "SP"
			intervals [2]:
				xmin = 0.5
				xmax = 0.58
				text = "d"
			intervals [3]:
				xmin = 0.58
				xmax = 1.2
				text = "ey"
			intervals [4]:
				xmin = 1.2
				xmax = 2.0
				text = "ow"
			intervals [5]:
				xmin = 2.0
				xmax = 3.0
				text = "SP"
"""


def test_the_textgrid_reader_finds_each_words_first_vowel():
    import onset_aligner as oa
    tiers = oa.read_textgrid(TEXTGRID)
    assert len(tiers["words"]) == 4 and len(tiers["phones"]) == 5
    # "day": the vowel starts after the d; "oh": the word IS the vowel
    assert oa.vowel_onsets(tiers, ["day", "oh"]) == [0.58, 1.2]
    with pytest.raises(ValueError, match="do not match"):
        oa.vowel_onsets(tiers, ["day", "go"])


@pytest.mark.xfail(strict=True, reason=(
    "KNOWN DEFECT in vocal_clock.rise_onset (found by the sound check, 2026-10-06): a window "
    "is 'silent' only when its envelope peak is exactly 0, so a near-silent window (filter "
    "ringing, a noise floor) is dated as a vowel. A dropped syllable would be placed as a clip "
    "of nothing. Strict: this test fails loudly the day the detector is fixed, so the fix is "
    "noticed and this marker removed."))
def test_a_silent_window_is_not_dated_as_a_vowel(tmp_path, clock):
    p = write_take(tmp_path, "take-00", clock, lambda e: 0.0)
    data, sr = sf.read(p)
    first = clock["events"][0]   # silence before it AND over it: only filter ringing remains
    data[: int((first["t_sec"] + first["dur_sec"]) * sr)] = 0.0
    sf.write(p, data, sr, subtype="PCM_16")
    row = next(r for r in sc.take_errors(clock, p) if r["id"] == first["id"])
    assert row["t_vowel"] is None
