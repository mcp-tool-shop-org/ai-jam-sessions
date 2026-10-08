"""Tests for the per-phrase evidence receipt's join measurements (pytest; synthetic audio).

    python -m pytest scripts/test_phrase_evidence.py -q

Each measurement is checked on a planted defect against the same signal without it,
so a measurement that cannot tell them apart fails here before it reaches the study.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(__file__))
import phrase_evidence as pe  # noqa: E402

SR = 48000


def sung(seconds: float, hz: float = 220.0, seed: int = 0) -> np.ndarray:
    """A voiced-ish tone: harmonics, a slow vibrato and a little noise."""
    t = np.arange(int(seconds * SR)) / SR
    f = hz * 2 ** (20 / 1200 * np.sin(2 * np.pi * 5 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = sum((0.5 / k) * np.sin(k * ph) for k in range(1, 6))
    x += 0.003 * np.random.default_rng(seed).standard_normal(len(t))
    return (0.3 * x).astype(np.float32)


def flat_f0(n_s: float) -> dict:
    t = np.arange(0, n_s, 0.005)
    return {"times": t, "f0": np.full(len(t), 220.0)}


def test_a_spliced_in_repeat_scores_higher_than_continuous_singing():
    # vowel-like material with a distinctive change, then the same 0.3 s played twice
    base = np.concatenate([sung(1.0, 220.0, 1), sung(0.6, 330.0, 2), sung(1.0, 247.0, 3)])
    cut = int(1.6 * SR)
    repeated = np.concatenate([base[:cut], base[cut - int(0.3 * SR):]])
    fa = pe.Features(base, SR, flat_f0(len(base) / SR))
    fb = pe.Features(repeated, SR, flat_f0(len(repeated) / SR))
    assert fb.repeat(1.6) > fa.repeat(1.6) + 0.1


def test_a_click_at_the_join_stands_out():
    x = sung(2.0)
    y = x.copy()
    y[SR] += 0.8                       # one-sample click at 1.0 s
    fx = pe.Features(x, SR, flat_f0(2.0))
    fy = pe.Features(y, SR, flat_f0(2.0))
    assert fy.click(1.0) > 6 and fy.click(1.0) > fx.click(1.0) + 3


def test_a_change_of_sound_across_the_join_is_a_spectral_jump():
    smooth = sung(2.0, 220.0, 1)
    jumpy = np.concatenate([sung(1.0, 220.0, 1), np.random.default_rng(5).standard_normal(SR).astype(np.float32) * 0.1])
    fs = pe.Features(smooth, SR, flat_f0(2.0))
    fj = pe.Features(jumpy, SR, flat_f0(2.0))
    assert fj.spectral_jump(1.0) > fs.spectral_jump(1.0) * 2


def test_an_octave_slip_at_the_join_is_flagged():
    t = np.arange(0, 2.0, 0.005)
    f0 = np.where(t < 1.0, 220.0, 440.0)
    feats = pe.Features(sung(2.0), SR, {"times": t, "f0": f0})
    r = feats.f0_step(1.0)
    assert r["octave"] and r["step_cents"] == pytest.approx(1200, abs=1)
    assert not feats.f0_step(0.5)["octave"]


def test_a_voicing_flip_is_flagged():
    t = np.arange(0, 2.0, 0.005)
    f0 = np.where((t > 0.99) & (t < 1.01), 0.0, 220.0)
    assert pe.Features(sung(2.0), SR, {"times": t, "f0": f0}).f0_step(1.0)["voicing_flip"]


def test_percentiles_rank_against_the_controls():
    assert pe.percentile(5.0, [1.0, 2.0, 3.0, 9.0]) == 0.75
    assert pe.percentile(None, [1.0]) is None and pe.percentile(1.0, []) is None


def test_edges_return_nothing_rather_than_a_number():
    feats = pe.Features(sung(1.0), SR, flat_f0(1.0))
    assert feats.repeat(0.05) is None and feats.click(0.05) is None and feats.spectral_jump(0.0) is None


def test_a_clip_with_a_click_at_its_join_ranks_high_against_its_own_controls(tmp_path):
    import json
    import soundfile as sf
    x = sung(10.0)
    y = x.copy()
    y[5 * SR] += 0.8
    folder = tmp_path / "mix"
    (folder / "clips").mkdir(parents=True)
    sf.write(folder / "clips" / "00000.wav", y, SR)
    sf.write(folder / "clips" / "00001.wav", x, SR)
    rows = [{"clip": "clips/00000.wav", "t_in_clip": 5.0}, {"clip": "clips/00001.wav", "t_in_clip": 5.0}]
    (folder / "labels.jsonl").write_text("\n".join(json.dumps(r) for r in rows))
    assert pe.build_clips(str(folder)) == 2
    hit = json.loads((folder / "evidence" / "00000.json").read_text())
    clean = json.loads((folder / "evidence" / "00001.json").read_text())
    assert hit["schema"] == pe.CLIP_SCHEMA and hit["controls"]["click_z"]["n"] == pe.CONTROLS
    assert hit["at_join"]["click_z_pct"] == 1.0
    assert clean["at_join"]["click_z_pct"] < 1.0
