"""Tests for the planter: plan mutations, rendering through the real splicer, and
the presence checks (pytest; synthetic takes, no data files).

    python -m pytest scripts/test_planter.py -q

Tests that need the placers' per-cut `xfade_s` / `break_before` fields skip until
vocal_clock honours them.
"""
from __future__ import annotations

import copy
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(__file__))
import planter as pl  # noqa: E402
import vocal_clock as vc  # noqa: E402

SR = 48000
SYL_S = 0.4
LEAD_S = 1.0


def take(seconds: float = 5.0, seed: int = 0) -> np.ndarray:
    """A sung-ish take: the pitch changes every syllable, and a fast random
    loudness texture (like consonants and vibrato on a real voice) gives the
    spectrum movement everywhere, so material played twice is recognisable."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(seconds * SR)) / SR
    hz = 200.0 * 2 ** (np.floor(t / SYL_S) % 5 * 2 / 12)
    f = hz * 2 ** (15 / 1200 * np.sin(2 * np.pi * 5 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = sum((0.5 / k) * np.sin(k * ph) * (1 + 0.4 * np.sin(2 * np.pi * (3 + 2 * k) * t + k)) for k in range(1, 6))
    knots = np.arange(0, seconds + 0.04, 0.02)
    env = np.interp(t, knots, rng.uniform(0.4, 1.0, len(knots)))
    x = x * env + 0.003 * rng.standard_normal(len(t))
    return np.repeat((0.3 * x)[:, None], 2, axis=1)


def plan_of(n_cuts: int = 8, key: str = "take-a", clock_events: bool = False) -> dict:
    cuts = []
    for i in range(n_cuts):
        cs = 0.5 + SYL_S * i
        ps = cs + LEAD_S
        cuts.append({"id": f"v{i:02d}", "source_key": key, "cut_start": cs, "cut_end": cs + SYL_S,
                     "clip_seconds": SYL_S, "placed_start": ps, "src_vowel_onset": cs + 0.05, "t_sec": ps + 0.05})
    return {"sample_rate": SR, "total_samples": int((0.5 + SYL_S * n_cuts + LEAD_S + 1.5) * SR), "cuts": cuts}


def clock_of(plan: dict, rest_before: str | None = None) -> dict:
    """Notes that end where the next starts, except a long rest before `rest_before`."""
    events = []
    for c in plan["cuts"]:
        dur = SYL_S - (0.3 if c["id"] == rest_before else 0.0)
        events.append({"id": c["id"], "t_sec": c["t_sec"], "dur_sec": dur})
    # the rest belongs to the note before the cut named
    if rest_before:
        ids = [c["id"] for c in plan["cuts"]]
        prev = ids[ids.index(rest_before) - 1]
        for e in events:
            e["dur_sec"] = SYL_S - 0.3 if e["id"] == prev else SYL_S
    return {"events": events}


SOURCES = {"take-a": take()}


def supports_break_before() -> bool:
    cuts = plan_of(3)["cuts"]
    cuts[1]["break_before"] = True
    return len(vc.warp_runs(cuts)) == 2


def supports_xfade() -> bool:
    p = plan_of(3)
    q = copy.deepcopy(p)
    q["cuts"][1]["xfade_s"] = 0.0
    a, _ = vc.place_local(p, SOURCES, SR)
    b, _ = vc.place_local(q, SOURCES, SR)
    return not np.allclose(a, b)


needs_break = pytest.mark.skipif(not supports_break_before(), reason="vocal_clock.warp_runs does not honour break_before yet")
needs_xfade = pytest.mark.skipif(not supports_xfade(), reason="vocal_clock placers do not honour xfade_s yet")


def spec(kind, cut="v04", sev=0.1, mode="local", join_type="boundary"):
    return pl.make_spec(kind, {"cut_id": cut, "join_type": join_type}, sev, mode, 1)


# ─── mutations ───────────────────────────────────────────────────────────────

def test_mutate_never_changes_the_given_plan():
    p = plan_of()
    before = copy.deepcopy(p)
    for kind in ("replay", "skip", "click", "sham"):
        pl.mutate(p, spec(kind))
    assert p == before


def test_replay_starts_the_cut_earlier_and_keeps_its_end():
    q, w = pl.mutate(plan_of(), spec("replay", sev=0.1))
    c = next(c for c in q["cuts"] if c["id"] == "v04")
    assert c["cut_start"] == pytest.approx(0.5 + 4 * SYL_S - 0.1)
    assert c["cut_start"] + c["clip_seconds"] == pytest.approx(0.5 + 5 * SYL_S)
    assert w["t"] == pytest.approx(0.5 + 4 * SYL_S + LEAD_S)
    assert w["lag_s"] == pytest.approx(0.1)


def test_replay_is_measured_from_where_the_previous_clip_had_got_to():
    # the clip before runs 30 ms ahead of this one in the take: a 0.1 s replay
    # starts 0.1 s before *that* point, so exactly 0.1 s plays twice
    p = plan_of()
    prev = next(c for c in p["cuts"] if c["id"] == "v03")
    prev["placed_start"] -= 0.03
    q, w = pl.mutate(p, spec("replay", sev=0.1))
    c = next(c for c in q["cuts"] if c["id"] == "v04")
    assert c["cut_start"] == pytest.approx(0.5 + 4 * SYL_S + 0.03 - 0.1)
    assert w["lag_s"] == pytest.approx(0.1)


def test_replay_and_skip_need_the_same_take_before_the_join():
    p = plan_of()
    next(c for c in p["cuts"] if c["id"] == "v03")["source_key"] = "take-b"
    for kind in ("replay", "skip"):
        with pytest.raises(ValueError, match="another take"):
            pl.mutate(p, spec(kind))


def test_skip_starts_later_and_refuses_to_eat_the_cut():
    q, _ = pl.mutate(plan_of(), spec("skip", sev=0.1))
    c = next(c for c in q["cuts"] if c["id"] == "v04")
    assert c["cut_start"] == pytest.approx(0.5 + 4 * SYL_S + 0.1)
    with pytest.raises(ValueError):
        pl.mutate(plan_of(), spec("skip", sev=SYL_S))
    with pytest.raises(ValueError):
        pl.mutate(plan_of(), spec("replay", cut="v00", sev=0.6))


def test_inside_joins_get_a_forced_break_in_warp_mode_only():
    q, _ = pl.mutate(plan_of(), spec("sham", mode="warp", join_type="inside"))
    assert next(c for c in q["cuts"] if c["id"] == "v04")["break_before"] is True
    q, _ = pl.mutate(plan_of(), spec("click", mode="local", join_type="boundary"))
    assert "break_before" not in next(c for c in q["cuts"] if c["id"] == "v04")


def test_click_sets_the_seam_crossfade():
    q, _ = pl.mutate(plan_of(), spec("click", sev=0.001))
    assert next(c for c in q["cuts"] if c["id"] == "v04")["xfade_s"] == 0.001


def test_a_warp_click_inside_a_run_also_breaks_the_run():
    if not supports_break_before():
        with pytest.raises(ValueError, match="break_before"):
            pl.mutate(plan_of(), spec("click", sev=0.0, mode="warp", join_type="inside"))
        return
    q, _ = pl.mutate(plan_of(), spec("click", sev=0.0, mode="warp", join_type="inside"))
    c = next(c for c in q["cuts"] if c["id"] == "v04")
    assert c["break_before"] is True and c["xfade_s"] == 0.0


def test_a_warp_click_refuses_a_cut_that_does_not_start_a_run():
    # labelled "boundary" but the cut sits inside a run: xfade_s alone would be ignored
    with pytest.raises(ValueError, match="start a run"):
        pl.mutate(plan_of(), spec("click", sev=0.0, mode="warp", join_type="boundary"))


def test_local_sham_splits_the_cut_into_continuous_halves():
    q, w = pl.mutate(plan_of(), spec("sham"))
    t = w["t"]
    ids = [c["id"] for c in q["cuts"]]
    assert ids[ids.index("v04") + 1] == "v04~sham"
    head = next(c for c in q["cuts"] if c["id"] == "v04")
    tail = next(c for c in q["cuts"] if c["id"] == "v04~sham")
    assert tail["cut_start"] == pytest.approx(head["cut_end"])
    assert tail["placed_start"] - tail["cut_start"] == pytest.approx(head["placed_start"] - head["cut_start"])
    assert t == pytest.approx(tail["placed_start"])
    assert "t_sec" not in tail


def test_a_warp_sham_continues_the_take_exactly_or_refuses():
    if not supports_break_before():
        pytest.skip("needs break_before")
    p = plan_of()
    q, w = pl.mutate(p, spec("sham", mode="warp", join_type="inside"))
    c = next(c for c in q["cuts"] if c["id"] == "v04")
    prev = next(c for c in q["cuts"] if c["id"] == "v03")
    assert c["cut_start"] == pytest.approx(prev["cut_end"])          # continuous in the take
    # a 0.1 s hole in the take before the cut: seamless would move the vowel too far
    p2 = plan_of()
    for cc in p2["cuts"][4:]:
        cc["cut_start"] += 0.1; cc["cut_end"] += 0.1; cc["src_vowel_onset"] += 0.1
    with pytest.raises(ValueError, match="move the vowel"):
        pl.mutate(p2, spec("sham", mode="warp", join_type="inside"))


def test_replay_and_skip_record_any_gap_before_the_seam():
    _, w = pl.mutate(plan_of(), spec("skip", sev=0.05))
    assert w["gap_s"] == pytest.approx(0.0, abs=1e-3)


def test_replay_and_skip_record_how_far_the_vowel_moved():
    _, w = pl.mutate(plan_of(), spec("replay", sev=0.1))
    assert w["vowel_moved_s"] == pytest.approx(0.1)               # later by the replayed span
    _, w = pl.mutate(plan_of(), spec("skip", sev=0.05))
    assert w["vowel_moved_s"] == pytest.approx(-0.05)             # earlier by the skipped span


@needs_break
def test_a_warp_replay_reports_the_stretch_its_run_absorbed():
    q, w = pl.mutate(plan_of(), spec("replay", mode="warp", join_type="inside", sev=0.1))
    _, joins = pl.render(q, SOURCES, None, "warp", joins=True)
    got = pl.run_stretch(joins, "v04")
    assert got and got["run_stretch_min"] < 1.0 <= got["run_stretch_max"] + 1e-9


def test_a_replay_that_would_also_move_its_vowel_is_refused_unless_allowed():
    # the clip before reaches 60 ms short of this cut's start in the take, so a
    # 0.05 s replay must start the cut 110 ms earlier: its vowel moves 60 ms too far
    p = plan_of()
    prev = next(c for c in p["cuts"] if c["id"] == "v03")
    prev["placed_start"] += 0.06
    with pytest.raises(ValueError, match="beyond the plant"):
        pl.mutate(p, spec("replay", sev=0.05))
    _, w = pl.mutate(p, spec("replay", sev=0.05), max_vowel_move=None)
    assert w["vowel_moved_s"] == pytest.approx(0.11)
    _, w = pl.mutate(p, spec("replay", sev=0.05), max_vowel_move=0.07)
    assert w["vowel_moved_s"] == pytest.approx(0.11)


def test_pools_hold_only_joins_that_can_take_the_plant_and_report_empty_ones():
    p = plan_of()
    joins = pl.candidate_joins(p, None, "local")
    pools = pl.eligible_pools(p, joins, ["replay", "skip"], "local", None)
    assert len(pools[("replay", 0.1)]) == len(joins)         # every clip before is the same take
    assert pools[("skip", 0.2)] and all(
        pl._plantable(p, pl.make_spec("skip", j, 0.2, "local", 0), None) for j in pools[("skip", 0.2)])
    p2 = plan_of()
    for c in p2["cuts"]:
        c["source_key"] = f"take-{c['id']}"                 # every join switches take: nothing can replay
    pools2 = pl.eligible_pools(p2, pl.candidate_joins(p2, None, "local"), ["replay"], "local", None)
    assert all(not v for v in pools2.values())


def test_a_replay_after_a_pause_is_refused_unless_allowed():
    # the clip before ends 60 ms before this cut starts on the timeline: a pause
    p = plan_of()
    prev = next(c for c in p["cuts"] if c["id"] == "v03")
    prev["placed_start"] -= 0.06 + vc.JOIN_EXTEND_MAX_S        # reaches its end well before the seam
    with pytest.raises(ValueError, match="pause before the seam"):
        pl.mutate(p, spec("replay", sev=0.05), max_vowel_move=None)
    _, w = pl.mutate(p, spec("replay", sev=0.05), max_vowel_move=None, max_gap=None)
    assert w["gap_s"] > 0.05


def test_a_named_clock_that_is_missing_is_refused_in_warp_mode():
    p = plan_of()
    p["clock"] = "nowhere/score-clock.json"
    with pytest.raises(SystemExit, match="not on disk"):
        pl.load_plan_clock(p, "warp")
    assert pl.load_plan_clock(p, "local") is None
    assert pl.load_plan_clock(plan_of(), "warp") is None          # no clock named: fine


def test_unknown_kind_and_cut_are_refused():
    with pytest.raises(ValueError):
        pl.make_spec("smear", {"cut_id": "v01", "join_type": "boundary"}, 0.1, "local", 0)
    with pytest.raises(ValueError):
        pl.mutate(plan_of(), spec("replay", cut="nope"))


# ─── candidate joins ─────────────────────────────────────────────────────────

def test_joins_skip_score_rests_and_type_warp_joins():
    p = plan_of()
    local = pl.candidate_joins(p, clock_of(p, rest_before="v05"), "local")
    assert [j["cut_id"] for j in local] == [f"v{i:02d}" for i in range(1, 8) if i != 5]
    assert {j["join_type"] for j in local} == {"boundary"}
    warp = pl.candidate_joins(p, None, "warp")
    assert len(warp) == 7 and {j["join_type"] for j in warp} == {"inside"}   # one take, one run


# ─── rendering through the real splicer ──────────────────────────────────────

def test_a_local_replay_renders_measurably_and_a_sham_does_not():
    p = plan_of()
    clean = pl.render(p, SOURCES, None, "local")
    q, w = pl.mutate(p, spec("replay", sev=0.1))
    replay = pl.verify("replay", clean, pl.render(q, SOURCES, None, "local"), SR, w["t"], w["lag_s"])
    assert replay["present"], replay
    q, w = pl.mutate(p, spec("sham"))
    sham_audio = pl.render(q, SOURCES, None, "local")
    sham = pl.verify("sham", clean, sham_audio, SR, w["t"])
    assert sham["present"], sham
    assert sham["measured"]["change_db"] < -40          # a local sham is the same audio


def test_a_local_skip_changes_the_audio():
    p = plan_of()
    clean = pl.render(p, SOURCES, None, "local")
    q, w = pl.mutate(p, spec("skip", sev=0.1))
    assert pl.verify("skip", clean, pl.render(q, SOURCES, None, "local"), SR, w["t"])["present"]


def test_the_clean_render_verifies_as_none():
    clean = pl.render(plan_of(), SOURCES, None, "local")
    assert pl.verify("none", clean, clean, SR, 2.5)["present"]


@needs_xfade
def test_a_hard_seam_clicks():
    p = plan_of()
    clean = pl.render(p, SOURCES, None, "local")
    # 53 ms: not a whole number of the 200 Hz test tone's periods, so the two sides
    # of a butt splice are out of phase (a real voice is never exactly periodic)
    q, w = pl.mutate(p, spec("replay", sev=0.053))
    q, w = pl.mutate(q, spec("click", sev=0.0))
    assert pl.verify("click", pl.render(p, SOURCES, None, "local"), pl.render(q, SOURCES, None, "local"), SR, w["t"])["present"]
    assert clean.shape == pl.render(q, SOURCES, None, "local").shape


@needs_break
def test_warp_forced_break_makes_a_seam_and_a_replay_there_is_measurable():
    p = plan_of()
    clean = pl.render(p, SOURCES, None, "warp")
    q, w = pl.mutate(p, spec("sham", mode="warp", join_type="inside"))
    c = next(c for c in q["cuts"] if c["id"] == "v04")
    assert c["break_before"] is True and abs(w["vowel_moved_s"]) <= pl.SHAM_TIMING_S
    sham = pl.verify("sham", clean, pl.render(q, SOURCES, None, "warp"), SR, w["t"])
    assert sham["present"]          # a warp seam re-cuts WSOLA phase, so the samples may differ
    q, w = pl.mutate(p, spec("replay", mode="warp", join_type="inside", sev=0.1))
    assert pl.verify("replay", clean, pl.render(q, SOURCES, None, "warp"), SR, w["t"], w["lag_s"])["present"]


def test_warp_replay_refuses_when_the_placer_ignores_break_before():
    if supports_break_before():
        pytest.skip("the placer honours break_before")
    with pytest.raises(ValueError, match="break_before"):
        pl.mutate(plan_of(), spec("replay", mode="warp", join_type="inside"))


# ─── the shared chain and the clip window ────────────────────────────────────

def test_the_chain_is_seeded_bounded_and_kind_blind():
    x = SOURCES["take-a"][: SR]
    a, pa = pl.chain(x, SR, np.random.default_rng(3))
    b, pb = pl.chain(x, SR, np.random.default_rng(3))
    assert pa == pb and np.array_equal(a, b)
    assert np.abs(a).max() <= 0.99 + 1e-9
    assert -6.0 <= pa["gain_db"] <= 3.0 and -0.3 <= pa["tilt"] <= 0.3


def test_the_clip_window_keeps_the_join_inside():
    rng = np.random.default_rng(0)
    for t in (0.5, 5.0, 29.0):
        lo, hi = pl.clip_window(t, 30.0, rng)
        assert hi - lo == pytest.approx(pl.CLIP_S)
        assert 0.0 <= lo and hi <= 30.0
    assert pl.clip_window(1.0, 4.0, rng) == (0.0, 4.0)


def test_build_writes_labels_and_drops_unplantable_specs(tmp_path):
    import json

    import soundfile as sf
    src = tmp_path / "take.wav"
    sf.write(src, SOURCES["take-a"], SR)
    p = plan_of(key=str(src))
    pick = tmp_path / "pick"
    pick.mkdir()
    (pick / "plan.json").write_text(json.dumps(p), encoding="utf-8")
    s = pl.build(str(pick), str(tmp_path / "out"), 10, ["replay", "skip", "sham", "none"], "local", seed=1)
    rows = [json.loads(l) for l in (tmp_path / "out" / "labels.jsonl").read_text(encoding="utf-8").splitlines()]
    assert s["kept"] == len(rows) and s["kept"] + s["dropped"] + s["skipped_empty_pool"] == 10
    assert s["eligible"]["sham"]["0.0"] == 7 and s["eligible"]["replay"]["0.1"] > 0
    assert {r["kind"] for r in rows} <= {"replay", "skip", "sham", "none"}
    assert all((tmp_path / "out" / r["clip"]).is_file() for r in rows)
    assert all(r["defect"] == (r["kind"] in ("replay", "skip", "click")) for r in rows)
    assert all("vowel_moved_s" in r["timing"] for r in rows if r["kind"] in ("replay", "skip"))


@needs_break
def test_a_warp_hard_seam_clicks_with_an_explicit_crossfade():
    # #93: a run's first cut carrying xfade_s sets that seam's head and the previous
    # run's tail even without overlap, so a zero crossfade is a butt splice
    p = plan_of()
    q, _ = pl.mutate(p, spec("replay", mode="warp", join_type="inside", sev=0.053))
    hard, w = pl.mutate(q, spec("click", sev=0.0, mode="warp", join_type="inside"))
    soft = pl.render(q, SOURCES, None, "warp")
    got = pl.verify("click", soft, pl.render(hard, SOURCES, None, "warp"), SR, w["t"])
    assert got["present"], got


def test_a_click_is_found_at_the_earlier_edge_when_the_audio_before_stops_first():
    # a hard edge 15 ms before the cut, nothing at the cut: still a click
    rng = np.random.default_rng(1)
    clean = take()[: 3 * SR]
    planted = clean.copy()
    planted[int(1.985 * SR)] += 0.6
    got = pl.verify("click", clean, planted, SR, 2.0, gap_s=0.015)
    assert got["present"], got
    assert not pl.verify("click", clean, planted, SR, 2.0)["present"]     # looking only at the cut misses it


def test_a_click_after_a_pause_is_refused():
    p = plan_of()
    prev = next(c for c in p["cuts"] if c["id"] == "v03")
    prev["placed_start"] -= 0.06 + vc.JOIN_EXTEND_MAX_S
    with pytest.raises(ValueError, match="pause before the seam"):
        pl.mutate(p, spec("click", sev=0.0))
    _, w = pl.mutate(p, spec("click", sev=0.0), max_gap=None)
    assert w["gap_s"] > 0.05


# ─── PR 2: stretch, compounds, pitch ─────────────────────────────────────────

def test_a_stretch_keeps_both_vowels_on_time_sets_the_ratio_and_never_breaks_the_run():
    p = plan_of()

    def on_time(x):
        return x["src_vowel_onset"] + x["placed_start"] - x["cut_start"]

    for ratio in (1.6, 2.0):               # < 1 needs more take between vowels than this grid has
        q, w = pl.mutate(p, spec("stretch", sev=ratio, mode="warp", join_type="inside"))
        c = next(c for c in q["cuts"] if c["id"] == "v04")
        prev = next(c for c in q["cuts"] if c["id"] == "v03")
        orig = next(c for c in p["cuts"] if c["id"] == "v04")
        assert "break_before" not in c
        assert on_time(c) == pytest.approx(on_time(orig))
        assert (on_time(c) - on_time(prev)) / (c["src_vowel_onset"] - prev["src_vowel_onset"]) == pytest.approx(ratio)
        assert w["stretch_of"] == "v03"


def test_a_stretch_is_refused_in_local_mode_and_past_a_neighbour():
    with pytest.raises(ValueError, match="warp"):
        pl.mutate(plan_of(), spec("stretch", sev=2.0, mode="local"))
    with pytest.raises(ValueError, match="neighbour"):
        pl.mutate(plan_of(), spec("stretch", sev=0.3, mode="warp", join_type="inside"))


def test_the_placer_reports_the_planted_stretch():
    p = plan_of()
    q, w = pl.mutate(p, spec("stretch", sev=1.6, mode="warp", join_type="inside"))
    _, joins = pl.render(q, SOURCES, None, "warp", joins=True)
    assert pl.verify_stretch(1.6, joins, w["stretch_of"])["present"]
    _, clean_joins = pl.render(p, SOURCES, None, "warp", joins=True)
    assert not pl.verify_stretch(1.6, clean_joins, w["stretch_of"])["present"]


def _paused_plan():
    """The clip before reaches exactly this cut's start in the take, but 80 ms
    early on the timeline: a pause and no vowel move."""
    p = plan_of()
    prev = next(c for c in p["cuts"] if c["id"] == "v03")
    prev["clip_seconds"] = SYL_S - (vc.JOIN_EXTEND_MAX_S - vc.XFADE_S)
    prev["placed_start"] -= 0.08
    return p


def _late_plan():
    p = plan_of()
    next(c for c in p["cuts"] if c["id"] == "v03")["placed_start"] += 0.06
    return p


def test_compound_kinds_require_their_own_excess_and_refuse_the_other():
    _, w = pl.mutate(_paused_plan(), spec("replay+pause", sev=0.05))
    assert w["gap_s"] > pl.MAX_GAP_S
    with pytest.raises(ValueError, match="no pause"):
        pl.mutate(plan_of(), spec("replay+pause", sev=0.05))
    _, w = pl.mutate(_late_plan(), spec("replay+late-vowel", sev=0.05))
    assert w["vowel_moved_s"] - 0.05 > pl.MAX_VOWEL_MOVE_S
    with pytest.raises(ValueError, match="enough"):
        pl.mutate(plan_of(), spec("replay+late-vowel", sev=0.05))
    with pytest.raises(ValueError, match="pause here too"):
        pl.mutate(_paused_plan(), spec("skip+late-vowel", sev=0.05))
    _, w = pl.mutate(_paused_plan(), spec("click+pause", sev=0.0))
    assert w["gap_s"] > pl.MAX_GAP_S


def test_compounds_stay_out_of_the_clean_pools():
    joins = pl.candidate_joins(_late_plan(), None, "local")
    pools = pl.eligible_pools(_late_plan(), joins, ["replay", "replay+late-vowel"], "local", None)
    clean = {j["cut_id"] for j in pools[("replay", 0.05)]}
    late = {j["cut_id"] for j in pools[("replay+late-vowel", 0.05)]}
    assert "v04" in late and "v04" not in clean and not (clean & late)


def _clock_for(plan):
    return {"events": [{"id": c["id"], "t_sec": c["t_sec"], "dur_sec": SYL_S - 0.05} for c in plan["cuts"]]}


def test_a_pitch_plant_shifts_one_note_and_a_vocoded_sham_does_not():
    pytest.importorskip("pyworld")
    p = plan_of()
    clock = _clock_for(p)
    clean = pl.render(p, SOURCES, None, "local")
    for semis, expect in ((12.0, True), (1.0, True), (-1.0, True)):
        _, w = pl.mutate(p, spec("pitch", cut="v04", sev=semis, mode="local", join_type="note"), clock)
        planted = pl.shift_note(clean, SR, w["t"], w["note_end"], semis)
        got = pl.verify_pitch(clean, planted, SR, w["t"], w["note_end"], semis)
        assert got["present"] == expect, (semis, got)
        assert got["measured"]["cents"] == pytest.approx(100 * semis, abs=40)
    _, w = pl.mutate(p, spec("vocoded", cut="v04", sev=0.0, mode="local", join_type="note"), clock)
    sham = pl.shift_note(clean, SR, w["t"], w["note_end"], 0.0)
    assert pl.verify_pitch(clean, sham, SR, w["t"], w["note_end"], 0.0)["present"]
    outside = slice(0, int((w["t"] - 0.1) * SR))
    assert np.allclose(sham[outside], clean[outside])          # only the note is touched


def test_pitch_needs_a_long_enough_note():
    p = plan_of()
    clock = {"events": [{"id": "v04", "t_sec": 3.15, "dur_sec": 0.1}]}
    with pytest.raises(ValueError, match="no note"):
        pl.mutate(p, spec("pitch", cut="v04", sev=1.0, mode="local", join_type="note"), clock)


def test_labels_carry_the_pick_and_alternate(tmp_path):
    import json

    import soundfile as sf
    src = tmp_path / "take.wav"
    sf.write(src, SOURCES["take-a"], SR)
    p = plan_of(key=str(src))
    p.update({"pick_of": "song/pad16", "alt": 3})
    pick = tmp_path / "pick"
    pick.mkdir()
    (pick / "plan.json").write_text(json.dumps(p), encoding="utf-8")
    pl.build(str(pick), str(tmp_path / "out"), 4, ["skip", "none"], "local", seed=2)
    rows = [json.loads(l) for l in (tmp_path / "out" / "labels.jsonl").read_text(encoding="utf-8").splitlines()]
    assert rows and all(r["pick"] == "song/pad16" and r["alt"] == 3 for r in rows)
