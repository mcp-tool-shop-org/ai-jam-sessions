#!/usr/bin/env python3
"""Vowel onsets from a singing forced aligner (HubertFA), as a measuring instrument.

The lyrics of every take are known exactly, so a phoneme aligner trained on
singing can place every phoneme, and the vowel onset is simply where a word's
first vowel phoneme begins. This is the primary onset instrument for the sound
check; the energy detector in vocal_clock.py becomes the independent cross-check
(docs/vocal-soundcheck.md).

HubertFA (https://github.com/wolfgitpr/HubertFA, Apache-2.0 code) runs in its own
environment on ONNX Runtime, so it needs no PyTorch build for the local GPU.
Defaults, overridable by environment:

    HFA_ROOT    E:/AI/HubertFA                         (checkout with .venv)
    HFA_MODEL   E:/AI-Models/HubertFA/v0.0.7/1218_hfa_model_new_dict/model.onnx

Its frames are 10 ms, so a boundary is placed to about +/-5 ms at best. The model
listens through a Chinese HuBERT encoder; English goes through its bundled CMU
dictionary. Its accuracy on English singing is measured, not assumed: see the
validation section of docs/vocal-soundcheck.md.

The TextGrid reader below is self-contained so callers need no extra package.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess

HFA_ROOT = os.environ.get("HFA_ROOT", "E:/AI/HubertFA")
HFA_MODEL = os.environ.get("HFA_MODEL", "E:/AI-Models/HubertFA/v0.0.7/1218_hfa_model_new_dict/model.onnx")

# ARPAbet vowels (stress-free, as the CMU dictionary bundled with the model writes them).
VOWELS = {"aa", "ae", "ah", "ao", "aw", "ay", "eh", "er", "ey", "ih", "iy", "ow", "oy", "uh", "uw"}
NON_LEXICAL = {"", "SP", "AP", "EP", "sil", "sp"}


def read_textgrid(text: str) -> dict[str, list[tuple[float, float, str]]]:
    """A TextGrid (long text format) as {tier name: [(xmin, xmax, mark), ...]}."""
    tiers: dict[str, list[tuple[float, float, str]]] = {}
    for block in re.split(r"\n\s*item \[\d+\]:", text)[1:]:
        name = re.search(r'name = "(.*?)"', block)
        if not name:
            continue
        rows = re.findall(r'xmin = ([-\d.eE+]+)\s+xmax = ([-\d.eE+]+)\s+text = "(.*?)"', block, flags=re.S)
        tiers[name.group(1)] = [(float(a), float(b), m) for a, b, m in rows]
    return tiers


def vowel_onsets(tiers: dict, words: list[str]) -> list[float | None]:
    """For each expected word, in order, where its first vowel phoneme begins.

    The aligner's word tier must hold the same words in the same order (it was
    given exactly these words); a mismatch is an error, not a guess."""
    got = [(a, b, m) for a, b, m in tiers.get("words", []) if m not in NON_LEXICAL]
    if [m.lower() for _, _, m in got] != [w.lower() for w in words]:
        raise ValueError(f"aligner words {[m for _, _, m in got]} do not match the expected {words}")
    phones = [(a, b, m) for a, b, m in tiers.get("phones", []) if m not in NON_LEXICAL]
    out = []
    for a, b, _ in got:
        inside = [p for p in phones if p[0] >= a - 1e-6 and p[1] <= b + 1e-6]
        v = next((p for p in inside if p[2].lower() in VOWELS), None)
        out.append(v[0] if v else None)
    return out


def align(take_paths: list[str], words: list[str], work_dir: str, language: str = "en") -> list[list[float | None]]:
    """Run HubertFA over the takes; return each take's vowel onsets, in word order.
    Each take is copied in as <n>.wav with a <n>.lab holding the words."""
    in_dir = os.path.join(work_dir, "hfa-in")
    out_dir = os.path.join(work_dir, "hfa-out")
    shutil.rmtree(in_dir, ignore_errors=True)
    os.makedirs(in_dir)
    for i, p in enumerate(take_paths):
        shutil.copyfile(p, os.path.join(in_dir, f"take-{i:02d}.wav"))
        with open(os.path.join(in_dir, f"take-{i:02d}.lab"), "w", encoding="utf-8") as fh:
            fh.write(" ".join(words))
    py = os.path.join(HFA_ROOT, ".venv", "Scripts", "python.exe")
    if not os.path.isfile(py):
        py = os.path.join(HFA_ROOT, ".venv", "bin", "python")
    cmd = [py, os.path.join(HFA_ROOT, "onnx_infer.py"), "-m", HFA_MODEL, "-wf", os.path.abspath(in_dir),
           "-o", os.path.abspath(out_dir), "-l", language, "-np", "AP"]
    proc = subprocess.run(cmd, cwd=HFA_ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise SystemExit(f"HubertFA failed ({proc.returncode}):\n{proc.stderr[-2000:]}")
    onsets = []
    for i in range(len(take_paths)):
        path = os.path.join(out_dir, "TextGrid", f"take-{i:02d}.TextGrid")
        if not os.path.isfile(path):
            raise SystemExit(f"HubertFA wrote no TextGrid for take {i + 1}: {path}")
        with open(path, encoding="utf-8") as fh:
            onsets.append(vowel_onsets(read_textgrid(fh.read()), words))
    return onsets
