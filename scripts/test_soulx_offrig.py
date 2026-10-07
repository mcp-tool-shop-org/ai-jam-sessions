"""Tests for rendering takes away from the local GPU (pytest; no GPU, no network).

    python -m pytest scripts/test_soulx_offrig.py -q

The render itself needs SoulX-Singer on a GPU and is exercised by a real run
(docs/vocal-offrig.md). What is tested here is everything around it: the take a
render leaves behind, the numbering sing_clock.py reads, the refusal of a take
sung from another target, and the pins the pod is built from.
"""
from __future__ import annotations

import json
import os
import re
import sys

import numpy as np
import pytest
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sing_clock  # noqa: E402
import soulx_batch  # noqa: E402
import soulx_take  # noqa: E402

POD = os.path.join(HERE, "pod")


def write_generated(dir_, seconds=0.5, sr=24000, amp=0.5):
    os.makedirs(dir_, exist_ok=True)
    t = np.arange(int(seconds * sr)) / sr
    path = os.path.join(dir_, "generated.wav")
    sf.write(path, amp * np.sin(2 * np.pi * 220 * t), sr)
    return path


def test_finish_take_makes_the_clocks_stereo_take_and_a_receipt(tmp_path):
    src = write_generated(str(tmp_path), seconds=0.5)
    r = soulx_take.finish_take(src, str(tmp_path), 48000, 3.21, {"target_sha256": "abc", "control": "score"})
    y, sr = sf.read(os.path.join(tmp_path, "take-48k.wav"), always_2d=True)
    assert sr == 48000 and y.shape == (24000, 2), "0.5 s of 24 kHz mono becomes 0.5 s of 48 kHz stereo"
    assert np.allclose(y[:, 0], y[:, 1])
    assert r["generated_sr"] == 24000 and r["generated_frames"] == 12000
    assert r["take_frames"] == 24000 and r["seconds"] == pytest.approx(0.5)
    assert r["peak"] == pytest.approx(0.5, abs=0.01)
    assert r["elapsed_s"] == 3.2
    assert r["target_sha256"] == "abc" and r["control"] == "score", "how the take was made is kept"
    on_disk = json.load(open(os.path.join(tmp_path, "take.receipt.json"), encoding="utf-8"))
    assert on_disk == r
    assert r["take_sha256"] == soulx_take.sha256(os.path.join(tmp_path, "take-48k.wav"))


def test_finish_take_refuses_a_missing_render(tmp_path):
    with pytest.raises(SystemExit, match="no generated.wav"):
        soulx_take.finish_take(os.path.join(tmp_path, "generated.wav"), str(tmp_path), 48000, 1.0, {})


def test_batch_numbers_takes_the_way_sing_clock_reads_them(tmp_path):
    dirs = soulx_batch.take_dirs(str(tmp_path), 7, 3)
    assert [os.path.basename(d) for d in dirs] == ["take-07", "take-08", "take-09"]
    with pytest.raises(SystemExit):
        soulx_batch.take_dirs(str(tmp_path), 0, 3)
    with pytest.raises(SystemExit):
        soulx_batch.take_dirs(str(tmp_path), 1, 0)


def test_batch_paths_are_resolved_before_it_changes_directory(tmp_path, monkeypatch):
    from types import SimpleNamespace
    monkeypatch.chdir(tmp_path)
    a = soulx_batch.absolute_paths(SimpleNamespace(target="ajs/t.json", prompt_wav="p.mp3", prompt_meta="p.json",
                                                   out_dir="out", model="m.pt", config="c.yaml"))
    assert a.target == os.path.join(str(tmp_path), "ajs", "t.json")
    assert all(os.path.isabs(getattr(a, n)) for n in soulx_batch.PATH_ARGS)


def test_a_take_from_the_same_target_is_reused(tmp_path):
    tdir = str(tmp_path / "take-01")
    assert sing_clock.stale_take(tdir, "sha-a") is None, "no take yet: nothing to refuse"
    src = write_generated(tdir)
    soulx_take.finish_take(src, tdir, 48000, 1.0, {"target_sha256": "sha-a"})
    assert sing_clock.stale_take(tdir, "sha-a") is None


def test_a_take_sung_from_another_target_is_refused(tmp_path):
    tdir = str(tmp_path / "take-01")
    soulx_take.finish_take(write_generated(tdir), tdir, 48000, 1.0, {"target_sha256": "sha-old"})
    why = sing_clock.stale_take(tdir, "sha-new")
    assert why and "sha-old"[:7] in why and "render it again" in why


def test_a_take_without_its_receipt_is_refused(tmp_path):
    tdir = str(tmp_path / "take-01")
    soulx_take.finish_take(write_generated(tdir), tdir, 48000, 1.0, {"target_sha256": "sha-a"})
    os.remove(os.path.join(tdir, "take.receipt.json"))
    assert "no readable take.receipt.json" in sing_clock.stale_take(tdir, "sha-a")


def test_the_pods_packages_are_all_pinned_and_torch_is_the_cuda_12_8_build():
    lines = [ln.strip() for ln in open(os.path.join(POD, "soulx-requirements.txt"), encoding="utf-8")]
    pins = [ln for ln in lines if ln and not ln.startswith("#")]
    assert pins and all(re.fullmatch(r"[A-Za-z0-9_.\-]+==[A-Za-z0-9_.+\-]+", p) for p in pins), "exact pins only"
    names = [p.split("==")[0].lower() for p in pins]
    assert len(names) == len(set(names)), "one pin per package"
    assert "torch==2.11.0+cu128" in pins and "torchaudio==2.11.0+cu128" in pins
    assert not {"colorama", "pyreadline3"} & set(names), "Windows-only packages stay off the pod"


def test_the_setup_script_pins_what_it_installs():
    text = open(os.path.join(POD, "soulx-setup.sh"), encoding="utf-8").read()
    assert "\r" not in text, "LF only: bash on the pod reads a CR as part of the command"
    for name, pattern in [("SOULX_COMMIT", r"[0-9a-f]{40}"), ("HF_REVISION", r"[0-9a-f]{40}"),
                          ("MODEL_SHA256", r"[0-9a-f]{64}"), ("UV_VERSION", r"\d+\.\d+\.\d+"),
                          ("PYTHON_VERSION", r"3\.10\.\d+")]:
        assert re.search(rf"^{name}={pattern}$", text, re.M), f"{name} is pinned"
    assert "sha256sum --check --quiet" in text, "the weights are checked by hash, not trusted by name"
    assert "set -euo pipefail" in text
    patch = open(os.path.join(POD, "soulx-audio-utils.patch"), encoding="utf-8", newline="").read()
    assert "\r" not in patch and patch.startswith("diff --git a/soulxsinger/utils/audio_utils.py")


def test_assemble_drops_each_segments_lead_pad_and_tiles_on_the_clock():
    sr = 100
    segs = [{"time": [0, 1000], "lead_pad_ms": 500}, {"time": [1000, 2000], "lead_pad_ms": 500}]
    # each render: 0.5 s of the singer's noisy start (9s), then the segment proper
    a = np.concatenate([np.full(50, 9.0), np.full(100, 1.0)])
    b = np.concatenate([np.full(50, 9.0), np.full(100, 2.0)])
    out = soulx_batch.assemble(segs, [a, b], sr)
    assert len(out) == 200 and not np.any(out == 9.0), "the pad, and the noise in it, never reaches the take"
    assert np.all(out[:100] == 1.0) and np.all(out[100:] == 2.0)


def test_assemble_without_pads_is_soulx_own_tiling():
    out = soulx_batch.assemble([{"time": [0, 500]}, {"time": [500, 1000]}], [np.ones(50), np.full(50, 2.0)], 100)
    assert np.all(out[:50] == 1.0) and np.all(out[50:] == 2.0)
