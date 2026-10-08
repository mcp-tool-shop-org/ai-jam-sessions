"""The voice gate's judgement, on synthetic frames (no model, no pyannote environment)."""
import numpy as np

import voice_gate as vg

STEP = 0.017


def clock(*notes):
    return {"events": [{"id": f"v{i:02d}", "lyric": "la", "t_sec": s, "dur_sec": d} for i, (s, d) in enumerate(notes)]}


def timeline(seconds=6.0):
    t = (np.arange(int(seconds / STEP)) + 0.5) * STEP
    return t, np.zeros_like(t), np.zeros_like(t)


def test_a_clean_vocal_passes():
    t, v, o = timeline()
    v[(t >= 1.0) & (t < 2.0)] = 1.0
    v[(t >= 3.0) & (t < 4.0)] = 1.0
    r = vg.judge(t, v, o, clock((1.0, 1.0), (3.0, 1.0)))
    assert r["verdict"] == "PASS" and r["stats"]["voice_mean_sung"] == 1.0


def test_a_separate_patch_of_voice_in_a_rest_is_flagged_and_a_blip_is_not():
    t, v, o = timeline()
    v[(t >= 1.0) & (t < 2.0)] = 1.0
    v[(t >= 2.9) & (t < 3.2)] = 1.0          # 0.3 s, apart from both notes: a honk
    v[(t >= 3.9) & (t < 3.98)] = 1.0         # 80 ms: a breath
    r = vg.judge(t, v, o, clock((1.0, 1.0), (5.0, 0.5)))
    assert [round(x["t"], 1) for x in r["voice_in_rest"]] == [2.9]


def test_a_note_held_into_the_rest_is_its_release_until_it_runs_too_long():
    t, v, o = timeline(8.0)
    v[(t >= 1.0) & (t < 3.0)] = 1.0          # a 1 s note held 1 s into the rest: a release
    r = vg.judge(t, v, o, clock((1.0, 1.0), (6.0, 1.0)))
    assert r["voice_in_rest"] == [] and r["overlong_release"] == []
    v[(t >= 1.0) & (t < 5.5)] = 1.0          # held 3.5 s: flagged
    r = vg.judge(t, v, o, clock((1.0, 1.0), (6.0, 1.0)))
    assert len(r["overlong_release"]) == 1


def test_two_voices_longer_than_a_crossfade_are_flagged():
    t, v, o = timeline()
    v[(t >= 1.0) & (t < 3.0)] = 1.0
    o[(t >= 1.50) & (t < 1.54)] = 1.0        # a 40 ms crossfade
    o[(t >= 2.20) & (t < 2.50)] = 1.0        # 0.3 s of two voices
    r = vg.judge(t, v, o, clock((1.0, 2.0)))
    assert [round(x["t"], 1) for x in r["two_voices"]] == [2.2]


def test_a_note_with_no_voice_is_silent_and_a_soft_ending_is_not():
    t, v, o = timeline()
    v[(t >= 1.0) & (t < 2.0)] = 1.0
    v[(t >= 2.0) & (t < 3.0)] = 0.25         # one chunk in four hears it: a soft held ending
    r = vg.judge(t, v, o, clock((1.0, 1.0), (2.0, 1.0), (4.0, 1.0)))
    assert [x["id"] for x in r["silent_notes"]] == ["v02"]
