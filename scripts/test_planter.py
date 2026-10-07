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
    """A sung-ish take whose pitch changes every syllable, so material played
    twice is recognisable."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(seconds * SR)) / SR
    hz = 200.0 * 2 ** (np.floor(t / SYL_S) % 5 * 2 / 12)
    f = hz * 2 ** (15 / 1200 * np.sin(2 * np.pi * 5 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = sum((0.5 / k) * np.sin(k * ph) for k in range(1, 6)) + 0.003 * rng.standard_normal(len(t))
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
    q, w = pl.mutate(p, spec("replay", sev=0.05))
    q, w = pl.mutate(q, spec("click", sev=0.0))
    assert pl.verify("click", pl.render(p, SOURCES, None, "local"), pl.render(q, SOURCES, None, "local"), SR, w["t"])["present"]
    assert clean.shape == pl.render(q, SOURCES, None, "local").shape


@needs_break
def test_warp_forced_break_makes_a_seam_and_a_replay_there_is_measurable():
    p = plan_of()
    clean = pl.render(p, SOURCES, None, "warp")
    q, w = pl.mutate(p, spec("sham", mode="warp", join_type="inside"))
    assert pl.verify("sham", clean, pl.render(q, SOURCES, None, "warp"), SR, w["t"])["present"]
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
    assert s["kept"] == len(rows) and s["kept"] + s["dropped"] == 10
    assert {r["kind"] for r in rows} <= {"replay", "skip", "sham", "none"}
    assert all((tmp_path / "out" / r["clip"]).is_file() for r in rows)
    assert all(r["defect"] == (r["kind"] in ("replay", "skip", "click")) for r in rows)
