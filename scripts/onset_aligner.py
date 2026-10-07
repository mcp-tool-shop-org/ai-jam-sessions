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
# `ax` is that dictionary's schwa ("the" = dh ax, "a" = ax): without it a word whose
# first vowel is a schwa had no vowel onset. The sound check's phrase has none.
VOWELS = {"aa", "ae", "ah", "ao", "aw", "ax", "ay", "eh", "er", "ey", "ih", "iy", "ow", "oy", "uh", "uw"}

# Words outside the bundled dictionary (ds_cmudict-07b), spelled from in-dictionary
# parts. Found on the whole-song hymn exemplars, 2026-10-07; "ev'ry" is two syllables
# as the 1919 hymnal prints it ("every" is three in the dictionary).
EXTRA_WORDS = {
    "ev'ry": "eh v r iy",
    "fruited": "f r uw t ih d",
    "majesties": "m ae jh ax s t iy z",
    "nobleness": "n ow b ax l n ax s",
    "selfcontrol": "s eh l f k ax n ch _r ow l",
    "undimmed": "ah n d ih m d",
}
DICTIONARY = os.path.join("dictionaries", "ds_cmudict-07b.txt")
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


# ─── Whole songs: phrase by phrase, a vowel onset per syllable ──────────────

def word_groups(events: list[dict]) -> list[list[dict]]:
    """Clock events grouped into words (a word starts at syllable 0)."""
    out: list[list[dict]] = []
    for e in events:
        if e["syllable"] == 0 or not out:
            out.append([e])
        else:
            out[-1].append(e)
    return out


def phrase_spans(clock: dict, gap: float = 0.3) -> list[tuple[float, float, list[list[dict]]]]:
    """The clock split at every rest of at least `gap` seconds, each boundary in the
    middle of its rest: (start, end, word groups). A whole song aligns badly in one
    piece; a phrase at a time is what the aligner is good at."""
    evs = clock["events"]
    total = float(clock["total_seconds"])
    cuts = [0.0]
    for a, b in zip(evs, evs[1:]):
        end = float(a["t_sec"]) + float(a["dur_sec"])
        if float(b["t_sec"]) - end >= gap:
            cuts.append((end + float(b["t_sec"])) / 2)
    cuts.append(total)
    spans = []
    for lo, hi in zip(cuts, cuts[1:]):
        inside = [e for e in evs if lo <= float(e["t_sec"]) < hi]
        if inside:
            spans.append((lo, hi, word_groups(inside)))
    return spans


def syllable_onsets(tiers: dict, groups: list[list[dict]]) -> dict[str, float | None]:
    """Each syllable's vowel onset (seconds within the phrase), from an aligned
    phrase: the word's vowel phones in order, one per syllable. A word whose vowel
    count differs from its syllables is left undated, never guessed."""
    got = [(a, b, m) for a, b, m in tiers.get("words", []) if m not in NON_LEXICAL]
    if [m.lower() for _, _, m in got] != [g[0]["word"].lower() for g in groups]:
        raise ValueError(f"aligner words {[m for _, _, m in got]} do not match the expected {[g[0]['word'] for g in groups]}")
    phones = [(a, b, m) for a, b, m in tiers.get("phones", []) if m not in NON_LEXICAL]
    out: dict[str, float | None] = {}
    for (a, b, _), g in zip(got, groups):
        vowels = [p[0] for p in phones if p[0] >= a - 1e-6 and p[1] <= b + 1e-6 and p[2].lower() in VOWELS]
        for k, e in enumerate(g):
            out[e["id"]] = vowels[k] if len(vowels) == len(g) else None
    return out


def write_dictionary(path: str, extra: dict[str, str] | None = None) -> str:
    """The bundled dictionary plus `extra` words, as the aligner reads it (-d)."""
    with open(os.path.join(HFA_ROOT, DICTIONARY), encoding="utf-8", errors="replace") as fh:
        base = fh.read().replace("\r\n", "\n").rstrip("\n")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(base + "\n" + "".join(f"{w}\t{p}\n" for w, p in (extra or {}).items()))
    return path


def align_phrases(vocal_path: str, clock: dict, work_dir: str, gap: float = 0.3, language: str = "en",
                  extra_words: dict[str, str] | None = None) -> dict[str, float | None]:
    """Vowel onset (seconds on the clock) of every syllable of a placed vocal, aligned
    phrase by phrase with the known words. None where the aligner gives no answer."""
    import numpy as np
    import soundfile as sf
    y, sr = sf.read(vocal_path, always_2d=True)
    mono = y.mean(axis=1).astype(np.float32)
    in_dir = os.path.join(work_dir, "hfa-in")
    out_dir = os.path.join(work_dir, "hfa-out")
    shutil.rmtree(in_dir, ignore_errors=True)
    shutil.rmtree(out_dir, ignore_errors=True)
    os.makedirs(in_dir)
    spans = phrase_spans(clock, gap)
    for i, (lo, hi, groups) in enumerate(spans):
        sf.write(os.path.join(in_dir, f"phrase-{i:03d}.wav"), mono[int(lo * sr):int(hi * sr)], sr, subtype="PCM_16")
        with open(os.path.join(in_dir, f"phrase-{i:03d}.lab"), "w", encoding="utf-8") as fh:
            fh.write(" ".join(g[0]["word"].lower() for g in groups))
    dic = write_dictionary(os.path.join(work_dir, "dictionary.txt"), EXTRA_WORDS if extra_words is None else extra_words)
    py = os.path.join(HFA_ROOT, ".venv", "Scripts", "python.exe")
    if not os.path.isfile(py):
        py = os.path.join(HFA_ROOT, ".venv", "bin", "python")
    cmd = [py, os.path.join(HFA_ROOT, "onnx_infer.py"), "-m", HFA_MODEL, "-wf", os.path.abspath(in_dir),
           "-o", os.path.abspath(out_dir), "-l", language, "-d", os.path.abspath(dic), "-np", "AP"]
    proc = subprocess.run(cmd, cwd=HFA_ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise SystemExit(f"HubertFA failed ({proc.returncode}):\n{proc.stderr[-2000:]}")
    onsets: dict[str, float | None] = {}
    for i, (lo, _hi, groups) in enumerate(spans):
        path = os.path.join(out_dir, "TextGrid", f"phrase-{i:03d}.TextGrid")
        if not os.path.isfile(path):
            onsets.update({e["id"]: None for g in groups for e in g})
            continue
        with open(path, encoding="utf-8") as fh:
            rel = syllable_onsets(read_textgrid(fh.read()), groups)
        onsets.update({k: (None if v is None else lo + v) for k, v in rel.items()})
    return onsets
