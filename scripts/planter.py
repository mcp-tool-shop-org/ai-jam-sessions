#!/usr/bin/env python3
"""Plant known defects into a pick's vocal by mutating its plan, not its audio.

    python scripts/planter.py --dir tmp/vocal-clock/sing/<song>/<pick> [--n 500]
        [--kinds replay,skip,click,stretch,pitch,sham,vocoded,none[,replay+pause,...]] [--mode warp|local] [--seed 7] [--out tmp/planter/<name>]

Every plant is a change to plan.json, rendered through the production splicer
(vocal_clock.place_warp / place_local), so a planted join carries exactly the
signature of a real join and the label is the change itself: exact, free, and
never a judgement (R&D seat entry 2026-10-07-planted-defects-program-for-sung-mixes).

Kinds, by mutation of one cut at a join:
  replay  the cut starts `severity` s before the point its take had reached in the
          clip (or run) before it, so exactly that much audio plays twice (the
          "Gr-grace" mechanism the Director's marks found);
  skip    the cut starts `severity` s after that point, so exactly that much of the
          take is never heard;
  click   the seam's crossfade is shortened to `severity` s (shorter is harsher);
  stretch (warp only) the cut's vowel anchor moves in the take while its time on
          the timeline stays put, so the WSOLA stretch from the previous vowel to it
          becomes `severity`, outside review_marks.STRETCH (0.67-1.5);
  pitch   one note of the rendered vocal is shifted `severity` semitones with a
          formant-preserving vocoder (WORLD), ramped in and out (needs pyworld);
  vocoded the same note resynthesised by the same vocoder unshifted: the pitch
          plant's sham, so the vocoder's own trace is no clue;
  <kind>+pause, <kind>+late-vowel, <kind>+early-vowel
          compound plants: a replay, skip or click that also leaves a pause before
          the seam, or moves its vowel beyond its own shift. These are the shapes
          the cut-and-shift defects had; they are labelled as their own kinds, with
          the measured gap_s / vowel_moved_s, and kept out of the clean pools;
  sham    a real seam with continuous source and no defect: what a detector that
          only finds splices must fail on (in warp mode the new run starts exactly
          where the run before ended, in the take and on the timeline);
  none    no change: a clean clip around a clean join.

In warp mode (the default, what ships) a seam exists only between runs. A join
inside a run gets `break_before`, which makes it a real seam. Joins at score rests
are skipped: nothing is spliced there. `xfade_s` and `break_before` are per-cut
fields honoured by the placers. This module only sets them.

Each rendered plant is checked against the clean render (`verify`). A plant whose
defect is not measurably present is dropped and logged, never labelled. Every
written clip, clean or planted, goes through the same random processing `chain`,
so the processing is no clue. Output goes under tmp/ (gitignored): never commit
clips.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import phrase_evidence as pe  # noqa: E402
import vocal_clock as vc  # noqa: E402

SCHEMA = "ai-jam-sessions/plant-spec/v1"
LABELS_SCHEMA = "ai-jam-sessions/planter-labels/v1"
BASE_KINDS = ("replay", "skip", "click", "stretch", "pitch", "sham", "vocoded", "none")
COMPOUNDS = ("replay+pause", "replay+late-vowel", "replay+early-vowel",
             "skip+pause", "skip+late-vowel", "skip+early-vowel", "click+pause")
KINDS = BASE_KINDS + COMPOUNDS
DEFECTS = ("replay", "skip", "click", "stretch", "pitch") + COMPOUNDS
DEFAULT_KINDS = ("replay", "skip", "click", "stretch", "pitch", "sham", "vocoded", "none")
LEVELS = {
    "replay": (0.02, 0.05, 0.1, 0.2),
    "skip": (0.02, 0.05, 0.1, 0.2),
    "click": (0.005, 0.002, 0.001, 0.0),
    "stretch": (0.5, 0.6, 1.6, 2.0),
    "pitch": (-12.0, -1.0, 1.0, 12.0),
    "sham": (0.0,),
    "vocoded": (0.0,),
    "none": (0.0,),
}
for _k in COMPOUNDS:
    LEVELS[_k] = LEVELS[_k.split("+")[0]]
UNITS = {
    "replay": "seconds of source played twice",
    "skip": "seconds of source skipped",
    "click": "crossfade seconds at the seam (shorter is harsher)",
    "stretch": "warp ratio from the previous vowel to this cut's vowel (1 = natural)",
    "pitch": "semitones the note is shifted (formant-preserving)",
    "sham": "none",
    "vocoded": "none (the note resynthesised unshifted: the pitch plant's sham)",
    "none": "none",
}
for _k in COMPOUNDS:
    UNITS[_k] = UNITS[_k.split("+")[0]] + "; plus the measured " + ("pause (gap_s)" if _k.endswith("pause") else "vowel move (vowel_moved_s)")
MIN_CUT_S = 0.05             # a skip never leaves less of the cut than this
SHAM_TIMING_S = 0.03         # a warp sham may move the cut's vowel by at most this
MAX_VOWEL_MOVE_S = 0.03      # a replay/skip may move its vowel at most this far beyond its own shift
MAX_GAP_S = 0.03             # ... and leave at most this much pause on the timeline before its seam
ANCHOR_MARGIN_S = 0.02       # a moved vowel anchor stays this far from its neighbours in the take
STRETCH_TOL = 0.1            # stretch present: the placed ratio is within 10% of the target
PITCH_MIN_NOTE_S = 0.25      # notes shorter than this are not pitch-planted
PITCH_RAMP_S = 0.02          # the shift ramps in and out over this
PITCH_PRESENT_CENTS = 50.0   # pitch present: the note's median f0 moved at least this much
CLIP_S = 10.0
CLIP_EDGE_S = 2.0            # the join sits at least this far inside a clip
REPEAT_DELTA = 0.1           # replay present: repeat similarity rises at least this much
CLICK_DELTA = 2.0            # click present: click z rises at least this much
CHANGE_DB = -30.0            # skip present: the planted audio differs from the clean by more than this (dB re clean)


# ─── the plan ────────────────────────────────────────────────────────────────

def word_cuts(plan: dict) -> list[dict]:
    """The cuts the placers play: one clip per word, in placed order."""
    cuts = [c for c in plan["cuts"] if c.get("word_clip_id", c["id"]) == c["id"]]
    return sorted(cuts, key=lambda c: c["placed_start"])


def score_ends(clock: dict | None) -> dict[str, float]:
    return {e["id"]: e["t_sec"] + e["dur_sec"] for e in (clock or {}).get("events", [])}


def candidate_joins(plan: dict, clock: dict | None, mode: str = "warp") -> list[dict]:
    """Joins a plant can go at: every cut after the first, except where a score
    rest of WARP_REST_S or more comes first (a fade into silence, not a splice).
    In warp mode a join is a "boundary" when the cut already starts a run and
    "inside" when it sits inside a run (planting there forces a break)."""
    cuts = word_cuts(plan)
    ends = score_ends(clock)
    run_starts = set()
    if mode == "warp":
        run_starts = {r[0]["id"] for r in vc.warp_runs(cuts, ends)[1:]}
    out = []
    for k in range(1, len(cuts)):
        c, p = cuts[k], cuts[k - 1]
        rest = c["t_sec"] - ends[p["id"]] if p["id"] in ends and "t_sec" in c else 0.0
        if rest >= vc.WARP_REST_S:
            continue
        join_type = "boundary" if mode == "local" or c["id"] in run_starts else "inside"
        out.append({"cut_id": c["id"], "index": k, "join_type": join_type, "t": float(c["placed_start"])})
    return out


def make_spec(kind: str, join: dict, severity: float, mode: str, seed: int) -> dict:
    if kind not in KINDS:
        raise ValueError(f"unknown kind {kind!r}")
    return {"schema": SCHEMA, "kind": kind, "cut_id": join["cut_id"], "join_type": join["join_type"],
            "severity": float(severity), "units": UNITS[kind], "mode": mode, "seed": int(seed)}


def _run_of(plan: dict, cut: dict, clock: dict | None) -> tuple[list[list[dict]], int]:
    """Warp runs of the plan as the placer will build them, and the index of the
    run holding `cut`. Raises ValueError unless `cut` starts that run: in warp mode
    a seam, and the run's `xfade_s`, exist only at a run's first cut."""
    runs = vc.warp_runs(word_cuts(plan), score_ends(clock))
    k = next(i for i, r in enumerate(runs) if any(c["id"] == cut["id"] for c in r))
    if runs[k][0]["id"] != cut["id"]:
        raise ValueError(f"{cut['id']}: the placer did not start a run here (break_before not honoured)")
    return runs, k


def _prev_play(plan: dict, cut: dict, mode: str, clock: dict | None) -> tuple[float, "callable"]:
    """Where, in its take, the audio before the join has got to when cut `cut`
    starts (s_end), and a map from that take's time to the timeline. Replay and
    skip are measured from s_end, so a severity is exactly the span heard twice or
    never. Raises ValueError when the audio before is another take."""
    t = float(cut["placed_start"])
    if mode == "warp":
        runs, k = _run_of(plan, cut, clock)
        if k == 0:
            raise ValueError(f"{cut['id']}: no audio before the first run")
        prev = runs[k - 1]
        if prev[-1]["source_key"] != cut["source_key"]:
            raise ValueError(f"{cut['id']}: the run before is another take, so nothing can replay")
        src, dst = vc.warp_map(prev)
        s_end = float(np.interp(min(t, dst[-1]), dst, src))
        return s_end, (lambda x: float(np.interp(x, src, dst)))
    cuts = word_cuts(plan)
    i = next(i for i, c in enumerate(cuts) if c["id"] == cut["id"])
    if i == 0:
        raise ValueError(f"{cut['id']}: no clip before the first")
    p = cuts[i - 1]
    if p["source_key"] != cut["source_key"]:
        raise ValueError(f"{cut['id']}: the clip before is another take, so nothing can replay")
    reach = p["cut_start"] + p.get("clip_seconds", p["cut_end"] - p["cut_start"]) + vc.JOIN_EXTEND_MAX_S - vc.XFADE_S
    s_end = min(p["cut_start"] + (t - p["placed_start"]), reach)
    return s_end, (lambda x: p["placed_start"] + (x - p["cut_start"]))


def mutate(plan: dict, spec: dict, clock: dict | None = None,
           max_vowel_move: float | None = MAX_VOWEL_MOVE_S, max_gap: float | None = MAX_GAP_S) -> tuple[dict, dict]:
    """A new plan with the spec's defect, and where it is: {"t": the join's time on
    the timeline, "lag_s": for a replay, how far back the repeated audio was first
    heard, ...}. The given plan is never changed. Raises ValueError when the defect
    cannot be planted here.

    A replay of d moves its vowel +d and a skip -d: that shift IS the defect. Where
    the source gap before the cut moves it further, the plant is a compound defect
    (a replay plus a late vowel), refused unless `max_vowel_move` is None. Where the
    previous run ended before the seam, a forced break leaves a pause there: a
    replay plus a pause, refused beyond `max_gap` unless it is None."""
    out = copy.deepcopy(plan)
    byid = {c["id"]: c for c in out["cuts"]}
    if spec["cut_id"] not in byid:
        raise ValueError(f"no cut {spec['cut_id']!r}")
    c = byid[spec["cut_id"]]
    kind, s = spec["kind"], float(spec["severity"])
    where = {"t": float(c["placed_start"])}
    if kind == "none":
        return out, where
    base, _, extra = kind.partition("+")
    if kind in ("pitch", "vocoded"):
        # an audio-level plant on one note: the plan is unchanged; build() applies it
        note = next((e for e in (clock or {}).get("events", []) if e["id"] == spec["cut_id"]), None)
        if note is None or note["dur_sec"] < PITCH_MIN_NOTE_S:
            raise ValueError(f"{spec['cut_id']}: no note of {PITCH_MIN_NOTE_S}+ s to shift")
        where.update({"t": float(note["t_sec"]), "note_end": float(note["t_sec"] + note["dur_sec"])})
        return out, where
    if spec["mode"] == "warp" and spec["join_type"] == "inside" and base != "stretch":
        c["break_before"] = True                 # a stretch lives inside a run: never break it
    end = c["cut_start"] + c.get("clip_seconds", c["cut_end"] - c["cut_start"])
    if base in ("replay", "skip"):
        s_end, to_timeline = _prev_play(out, c, spec["mode"], clock)
        gap = max(0.0, where["t"] - to_timeline(s_end))
        excess = c["cut_start"] - s_end          # the vowel's move beyond its own shift, whatever d is
        _compound_gate(extra, gap, excess, max_gap, max_vowel_move)
        where["gap_s"] = round(gap, 4)
        start = s_end - s if base == "replay" else s_end + s
        if start < 0 or start > c["cut_end"] - MIN_CUT_S:
            raise ValueError(f"{c['id']}: no room for a {s} s {kind}")
        # placed_start stays, so the cut's shift (placed_start - cut_start) changes by
        # the same amount and its vowel lands that much later (replay) or earlier
        # (skip): a replay IS a relative shift between neighbours. Recorded so a heard
        # replay can be told from a heard late vowel.
        where["vowel_moved_s"] = round(float(c["cut_start"] - start), 4)
        c["cut_start"] = start
        if "clip_seconds" in c:
            c["clip_seconds"] = end - start
        if base == "replay":
            where["lag_s"] = round(where["t"] - to_timeline(start), 4)
    elif base == "stretch":
        where.update(_stretch(out, c, s, spec, clock))
    elif base == "click":
        c["xfade_s"] = s
        if spec["mode"] == "warp":
            _run_of(out, c, clock)          # place_warp reads xfade_s only from a run's first cut
        # With no crossfade the seam has two hard edges: where the audio before it
        # stops and where this cut starts. Where those are apart, the seam is a click
        # plus a pause, refused beyond max_gap like a replay's.
        try:
            s_end, to_timeline = _prev_play(out, c, spec["mode"], clock)
            gap = max(0.0, where["t"] - to_timeline(s_end))
        except ValueError:                  # another take before: no source gap to measure
            gap = 0.0
        _compound_gate(extra, gap, 0.0, max_gap, None)
        where["gap_s"] = round(gap, 4)
    elif kind == "sham":
        if spec["mode"] == "local":
            where["t"] = _split(out, c)
        else:
            where.update(_seamless(out, c, clock))
    return out, where


def _compound_gate(extra: str, gap: float, excess: float, max_gap: float | None,
                   max_vowel_move: float | None) -> None:
    """A clean plant (no suffix) refuses a pause or vowel move beyond tolerance. A
    compound plant requires its own excess and refuses the other, so each label
    names one shape. Tolerances of None switch the clean filters off."""
    pause = max_gap is not None and gap > max_gap
    vowel = max_vowel_move is not None and abs(excess) > max_vowel_move
    if not extra:
        if pause:
            raise ValueError(f"a {gap * 1000:.0f} ms pause before the seam")
        if vowel:
            raise ValueError(f"vowel moves {excess * 1000:.0f} ms beyond the plant")
        return
    tol_gap = MAX_GAP_S if max_gap is None else max_gap
    tol_vowel = MAX_VOWEL_MOVE_S if max_vowel_move is None else max_vowel_move
    if extra == "pause":
        if gap <= tol_gap:
            raise ValueError("no pause here for a +pause plant")
        if abs(excess) > tol_vowel:
            raise ValueError("the vowel also moves: not a pure +pause plant")
    elif extra in ("late-vowel", "early-vowel"):
        if gap > tol_gap:
            raise ValueError("a pause here too: not a pure vowel-move plant")
        if (extra == "late-vowel" and excess <= tol_vowel) or (extra == "early-vowel" and excess >= -tol_vowel):
            raise ValueError(f"the vowel does not move {extra.split('-')[0]} enough here")
    else:
        raise ValueError(f"unknown compound +{extra}")


def _stretch(plan: dict, c: dict, ratio: float, spec: dict, clock: dict | None) -> dict:
    """Make the warp stretch from the previous vowel to cut c's vowel equal `ratio`.
    Both vowels keep their places on the timeline: c's anchor moves in the take
    (src_vowel_onset + d, placed_start - d keeps their sum), so the stretch between
    them changes and the next segment absorbs the difference. Refused outside warp
    mode, at a run's first cut, or where the anchor would cross a neighbour."""
    if spec["mode"] != "warp":
        raise ValueError("stretch is a warp-placement defect")
    runs = vc.warp_runs(word_cuts(plan), score_ends(clock))
    run = next(r for r in runs if any(x["id"] == c["id"] for x in r))
    i = next(j for j, x in enumerate(run) if x["id"] == c["id"])
    if i == 0:
        raise ValueError(f"{c['id']}: starts a run, so no previous vowel shares its stretch")
    prev = run[i - 1]
    if prev.get("src_vowel_onset") is None or c.get("src_vowel_onset") is None:
        raise ValueError(f"{c['id']}: no vowel anchors to stretch between")

    def shift(x):
        return x["placed_start"] - x["cut_start"]

    s0, d0 = prev["src_vowel_onset"], prev["src_vowel_onset"] + shift(prev)
    v, d1 = c["src_vowel_onset"], c["src_vowel_onset"] + shift(c)
    if d1 - d0 <= 0:
        raise ValueError(f"{c['id']}: the vowels are not in order on the timeline")
    v_new = s0 + (d1 - d0) / ratio
    after = run[i + 1].get("src_vowel_onset") if i + 1 < len(run) else None
    limit = after if after is not None else run[-1]["cut_end"]
    if not (s0 + ANCHOR_MARGIN_S < v_new < limit - ANCHOR_MARGIN_S):
        raise ValueError(f"{c['id']}: a {ratio} stretch would move the anchor past a neighbour")
    delta = v_new - v
    c["src_vowel_onset"] = v_new
    c["placed_start"] -= delta                  # keeps v + shift, the vowel's time, unchanged
    return {"t": float(d0), "span_s": round(float(d1 - d0), 4), "anchor_moved_s": round(float(delta), 4),
            "stretch_of": prev["id"]}


def shift_note(audio: np.ndarray, sr: int, t0: float, t1: float, semitones: float) -> np.ndarray:
    """The audio with [t0, t1] shifted `semitones` by WORLD (formant-preserving:
    the spectral envelope is kept, only f0 moves), ramped in and out over
    PITCH_RAMP_S and crossfaded back into the original at both ends. semitones=0
    is the vocoder sham: the same resynthesis, no shift."""
    import pyworld as pw
    out = audio.copy()
    mono = _mono(audio).astype(np.float64)
    pad = int(0.05 * sr)
    a, b = max(0, int(t0 * sr) - pad), min(len(mono), int(t1 * sr) + pad)
    x = np.ascontiguousarray(mono[a:b])
    f0, tt = pw.harvest(x, sr, frame_period=5.0)
    f0 = pw.stonemask(x, f0, tt, sr)
    sp = pw.cheaptrick(x, f0, tt, sr)
    ap = pw.d4c(x, f0, tt, sr)
    ramp = np.clip(np.minimum(tt - (t0 - a / sr), (t1 - a / sr) - tt) / PITCH_RAMP_S, 0.0, 1.0)
    f0s = f0 * 2.0 ** (semitones * ramp / 12.0)
    y = pw.synthesize(f0s, sp, ap, sr, frame_period=5.0)[: b - a]
    y = np.pad(y, (0, (b - a) - len(y)))
    fade = np.clip(np.minimum(np.arange(b - a), (b - a - 1) - np.arange(b - a)) / pad, 0.0, 1.0)
    seg = x * (1 - fade) + y * fade
    if out.ndim == 2:
        out[a:b] = seg[:, None] * np.ones((1, out.shape[1]))
    else:
        out[a:b] = seg
    return out


def verify_pitch(clean: np.ndarray, planted: np.ndarray, sr: int, t0: float, t1: float, semitones: float) -> dict:
    """The note's median f0 moved by at least PITCH_PRESENT_CENTS in the planted
    direction (pyin on both, the gate's primary tracker); a vocoded sham must not
    move it."""
    m = 0.03
    lo, hi = int((t0 + m) * sr), int((t1 - m) * sr)
    fa = vc.track_f0(_mono(clean)[lo:hi], sr)["f0"]
    fb = vc.track_f0(_mono(planted)[lo:hi], sr)["f0"]
    both = (fa > 0) & (fb > 0) & np.isfinite(fa) & np.isfinite(fb)
    if both.sum() < 5:
        return {"present": False, "measured": {"cents": None, "voiced_frames": int(both.sum())}}
    cents = float(np.median(1200 * np.log2(fb[both] / fa[both])))
    want = 100.0 * semitones
    if semitones == 0:
        present = abs(cents) < PITCH_PRESENT_CENTS
    else:
        present = np.sign(cents) == np.sign(want) and abs(cents) >= min(PITCH_PRESENT_CENTS, abs(want) / 2)
    return {"present": bool(present), "measured": {"cents": round(cents, 1), "voiced_frames": int(both.sum())}}


def verify_stretch(target: float, placed_joins: list[dict], cut_id: str) -> dict:
    """A stretch plant is present when the placer reports the planted ratio for the
    segment starting at `cut_id`'s vowel, outside the band a listener tolerates
    (review_marks.STRETCH)."""
    import review_marks as rm
    got = next((j.get("stretch") for j in placed_joins if j["id"] == cut_id), None)
    present = (got is not None and abs(got - target) <= STRETCH_TOL * target
               and not rm.STRETCH[0] <= got <= rm.STRETCH[1])
    return {"present": bool(present), "measured": {"stretch": got, "band": list(rm.STRETCH)}}


def _seamless(plan: dict, c: dict, clock: dict | None) -> dict:
    """Warp sham: cut c starts a run exactly where the run before it ended, in its
    take and on the timeline, so the seam replays, skips and pauses nothing. Its
    vowel then lands by the previous run's shift; refused if that moves it more than
    SHAM_TIMING_S (an onset-timing defect, not a clean seam)."""
    runs, k = _run_of(plan, c, clock)
    if k == 0:
        raise ValueError(f"{c['id']}: no audio before the first run")
    prev = runs[k - 1]
    if prev[-1]["source_key"] != c["source_key"]:
        raise ValueError(f"{c['id']}: the run before is another take, so no seam can be seamless")
    src, dst = vc.warp_map(prev)
    start, placed = src[-1], dst[-1]
    if start > c["cut_end"] - MIN_CUT_S:
        raise ValueError(f"{c['id']}: the run before already covers this cut")
    moved = (placed - start) - (c["placed_start"] - c["cut_start"])
    if abs(moved) > SHAM_TIMING_S:
        raise ValueError(f"{c['id']}: a seamless seam here would move the vowel {moved * 1000:.0f} ms")
    end = c["cut_start"] + c.get("clip_seconds", c["cut_end"] - c["cut_start"])
    c["cut_start"], c["placed_start"] = float(start), float(placed)
    if "clip_seconds" in c:
        c["clip_seconds"] = end - start
    return {"t": float(placed), "vowel_moved_s": round(moved, 4)}


def _split(plan: dict, c: dict) -> float:
    """Local-mode sham: cut c becomes two cuts from continuous source, so the
    splicer makes a real seam that changes nothing. Returns the seam's time."""
    length = c.get("clip_seconds", c["cut_end"] - c["cut_start"])
    m = c["cut_start"] + length / 2
    tail = dict(c, id=f"{c['id']}~sham", cut_start=m, placed_start=c["placed_start"] + (m - c["cut_start"]))
    for key in ("word_clip_id", "t_sec"):
        tail.pop(key, None)
    if tail.get("src_vowel_onset") is not None and tail["src_vowel_onset"] < m:
        tail.pop("src_vowel_onset")
    if "clip_seconds" in c:
        tail["clip_seconds"] = c["cut_start"] + length - m
        c["clip_seconds"] = m - c["cut_start"]
    c["cut_end"] = m
    plan["cuts"].insert(plan["cuts"].index(c) + 1, tail)
    return float(tail["placed_start"])


# ─── rendering and checking ──────────────────────────────────────────────────

def load_sources(plan: dict) -> dict[str, np.ndarray]:
    import soundfile as sf
    sources = {}
    for key in sorted({c["source_key"] for c in plan["cuts"]}):
        data, sr = sf.read(key, always_2d=True, dtype="float64")
        if sr != plan["sample_rate"]:
            raise ValueError(f"{key} is {sr} Hz, the plan is {plan['sample_rate']} Hz")
        sources[key] = data
    return sources


def render(plan: dict, sources: dict, clock: dict | None, mode: str = "warp", joins: bool = False):
    """The placed vocal (and, with joins=True, the placer's joins too)."""
    sr = int(plan["sample_rate"])
    out, js = vc.place_warp(plan, sources, sr, clock) if mode == "warp" else vc.place_local(plan, sources, sr)
    return (out, js) if joins else out


def run_stretch(placed_joins: list[dict], cut_id: str) -> dict:
    """The stretch range (warp ratio between vowels) across the placed run that holds
    `cut_id`: what the rest of a planted run absorbed. Empty in local mode."""
    me = next((j for j in placed_joins if j["id"] == cut_id), None)
    if me is None or "run" not in me:
        return {}
    ratios = [j["stretch"] for j in placed_joins if j.get("run") == me["run"] and j.get("stretch") is not None]
    return {"run_stretch_min": min(ratios), "run_stretch_max": max(ratios)} if ratios else {}


def _mono(x: np.ndarray) -> np.ndarray:
    return x.mean(axis=1) if x.ndim == 2 else x


def _db(x: np.ndarray) -> float:
    return 10 * np.log10(float(np.mean(x ** 2)) + 1e-20)


def repeat_at_lag(f: "pe.Features", t: float, lag_s: float, span_s: float | None = None) -> float | None:
    """phrase_evidence's repeat measurement, at one known lag and over exactly the
    repeated span: how well the spectral changes in [t, t + lag] match those in
    [t - lag, t] (capped at REPEAT_WIN_S), so the earlier window never crosses the
    seam."""
    i = f._frame(t)
    lag = max(2, int(round(lag_s * f.fps)))
    w = min(lag, max(2, int(pe.REPEAT_WIN_S * f.fps)))
    if span_s is not None:
        w = min(w, max(2, int(round(span_s * f.fps))))       # only the audio actually heard twice
    if i - lag < 0 or i + w >= len(f.dmel):
        return None
    a, b = f.dmel[i:i + w].ravel(), f.dmel[i - lag:i - lag + w].ravel()
    a, b = (a - a.mean()) / (a.std() + 1e-9), (b - b.mean()) / (b.std() + 1e-9)
    return float(np.mean(a * b))


def verify(kind: str, clean: np.ndarray, planted: np.ndarray, sr: int, t: float, lag_s: float | None = None,
           span_s: float | None = None, gap_s: float | None = None) -> dict:
    """Is the planted defect measurably there (or, for sham and none, measurably
    absent)? Compares the planted render with the clean one around the join, with
    phrase_evidence's own join measurements. A replay is measured at its known lag,
    over exactly the span played twice."""
    a, b = _mono(clean), _mono(planted)
    n = min(len(a), len(b))
    lo, hi = max(0, int((t - 0.2) * sr)), min(n, int((t + 0.6) * sr))
    change_db = round(_db(b[lo:hi] - a[lo:hi]) - _db(a[lo:hi]), 1) if hi > lo else None
    nof0 = {"times": np.zeros(0), "f0": np.zeros(0)}
    fa, fb = pe.Features(a[:n], sr, nof0), pe.Features(b[:n], sr, nof0)
    m = {"change_db": change_db}
    for name, fn in (("repeat", "repeat"), ("click", "click")):
        va, vb = getattr(fa, fn)(t), getattr(fb, fn)(t)
        m[f"{name}_clean"] = None if va is None else round(va, 3)
        m[f"{name}_planted"] = None if vb is None else round(vb, 3)
    if lag_s is not None:
        va, vb = repeat_at_lag(fa, t, lag_s, span_s), repeat_at_lag(fb, t, lag_s, span_s)
        m["repeat_clean"] = None if va is None else round(va, 3)
        m["repeat_planted"] = None if vb is None else round(vb, 3)
        m["lag_s"] = lag_s
    rep = None if None in (m["repeat_clean"], m["repeat_planted"]) else m["repeat_planted"] - m["repeat_clean"]
    clk = None if None in (m["click_clean"], m["click_planted"]) else m["click_planted"] - m["click_clean"]
    kind = kind.partition("+")[0]
    if kind == "replay":
        present = rep is not None and rep >= REPEAT_DELTA
    elif kind == "skip":
        present = change_db is not None and change_db > CHANGE_DB
    elif kind == "click":
        # the audio before the seam may stop up to gap_s before the cut starts: a
        # hard edge at either end counts
        edges = [clk] + ([fb.click(t - gap_s) - fa.click(t - gap_s)]
                         if gap_s and fa.click(t - gap_s) is not None and fb.click(t - gap_s) is not None else [])
        best = max((e for e in edges if e is not None), default=None)
        m["click_delta_best"] = None if best is None else round(best, 3)
        present = best is not None and best >= CLICK_DELTA
    else:
        # sham and none are clean by construction: a sham's seam continues the take
        # exactly (mutate refuses any that cannot). A seam is still a seam, so its
        # measurements may move; they are recorded for the study, never used to drop
        # it, or the shams would be filtered towards whatever the detector finds easy.
        present = True
    return {"present": bool(present), "measured": m}


def chain(x: np.ndarray, sr: int, rng: np.random.Generator) -> tuple[np.ndarray, dict]:
    """The shared random processing every clip passes through: a gain, a gentle
    spectral tilt and a little noise. Same distribution for every kind, so none
    of it marks a plant."""
    gain_db = float(rng.uniform(-6.0, 3.0))
    tilt = float(rng.uniform(-0.3, 0.3))
    noise_db = float(rng.uniform(-70.0, -50.0))
    y = x.astype(np.float64) * 10 ** (gain_db / 20)
    hp = np.diff(y, axis=0, prepend=y[:1])            # first difference: a gentle high-pass
    y = y + tilt * hp
    y = y + rng.standard_normal(y.shape) * 10 ** (noise_db / 20)
    peak = float(np.abs(y).max())
    if peak > 0.99:
        y *= 0.99 / peak
    return y, {"gain_db": round(gain_db, 2), "tilt": round(tilt, 3), "noise_db": round(noise_db, 1)}


def clip_window(t: float, total_s: float, rng: np.random.Generator, clip_s: float = CLIP_S) -> tuple[float, float]:
    """A clip around the join, with the join anywhere at least CLIP_EDGE_S inside it."""
    if total_s <= clip_s:
        return 0.0, total_s
    lo = t - rng.uniform(CLIP_EDGE_S, clip_s - CLIP_EDGE_S)
    lo = min(max(0.0, lo), total_s - clip_s)
    return lo, lo + clip_s


# ─── the batch ───────────────────────────────────────────────────────────────

def load_plan_clock(plan: dict, mode: str) -> dict | None:
    """The plan's score clock. In warp mode it decides where runs end (score rests)
    and the release trim, so a clock the plan names but that is not on disk would
    silently change the clean render: every plant would be measured against audio
    that is not the shipped audio. That is refused. A plan with no clock renders
    without one."""
    path = plan.get("clock")
    if not path:
        return None
    if isinstance(path, str) and os.path.exists(path):
        return vc.load_clock(path)
    if mode == "warp":
        raise SystemExit(f"the plan's clock {path!r} is not on disk; a warp render without it is not the shipped audio")
    return None


def _plantable(plan: dict, spec: dict, clock: dict | None, max_vowel_move: float | None = MAX_VOWEL_MOVE_S,
               max_gap: float | None = MAX_GAP_S) -> bool:
    try:
        mutate(plan, spec, clock, max_vowel_move, max_gap)
        return True
    except ValueError:
        return False


def eligible_pools(plan: dict, joins: list[dict], kinds: list[str], mode: str, clock: dict | None,
                   max_vowel_move: float | None = MAX_VOWEL_MOVE_S,
                   max_gap: float | None = MAX_GAP_S) -> dict[tuple[str, float], list[dict]]:
    """For every (kind, severity), the joins that can take that plant cleanly. The
    counts are themselves a finding about the mix: how many joins can take a clean
    replay of each size. mutate() still guards each draw."""
    notes = [{"cut_id": e["id"], "join_type": "note", "t": float(e["t_sec"])}
             for e in (clock or {}).get("events", []) if e["dur_sec"] >= PITCH_MIN_NOTE_S]
    return {(k, sev): [j for j in (notes if k in ("pitch", "vocoded") else joins)
                       if _plantable(plan, make_spec(k, j, sev, mode, 0), clock, max_vowel_move, max_gap)]
            for k in kinds for sev in LEVELS[k]}


def build(vdir: str, out_dir: str, n: int, kinds: list[str], mode: str = "warp", seed: int = 7,
          max_vowel_move: float | None = MAX_VOWEL_MOVE_S, max_gap: float | None = MAX_GAP_S) -> dict:
    import soundfile as sf
    plan = json.load(open(os.path.join(vdir, "plan.json"), encoding="utf-8"))
    clock = load_plan_clock(plan, mode)
    sources = load_sources(plan)
    sr = int(plan["sample_rate"])
    clean, clean_joins = render(plan, sources, clock, mode, joins=True)
    joins = candidate_joins(plan, clock, mode)
    if not joins:
        raise SystemExit(f"{vdir}: no joins to plant at")
    rng = np.random.default_rng(seed)
    # Draw from the joins that can take each (kind, severity) cleanly, severities in
    # turn. An empty pool is reported and skipped, never filled from another size.
    pools = eligible_pools(plan, joins, kinds, mode, clock, max_vowel_move, max_gap)
    os.makedirs(os.path.join(out_dir, "clips"), exist_ok=True)
    kept, dropped, skipped = [], [], 0
    for i in range(n):
        kind = kinds[i % len(kinds)]
        levels = LEVELS[kind]
        severity = levels[(i // len(kinds)) % len(levels)]
        pool = pools[(kind, severity)]
        if not pool:
            skipped += 1
            continue
        join = pool[int(rng.integers(len(pool)))]
        spec = make_spec(kind, join, severity, mode, int(rng.integers(1 << 31)))
        try:
            planted_plan, where = mutate(plan, spec, clock, max_vowel_move, max_gap)
        except ValueError as exc:
            dropped.append({"spec": spec, "reason": str(exc)})
            continue
        t = where["t"]
        if kind == "none":
            planted, placed_joins = clean, clean_joins
        elif kind in ("pitch", "vocoded"):
            planted, placed_joins = shift_note(clean, sr, t, where["note_end"], spec["severity"]), clean_joins
        else:
            planted, placed_joins = render(planted_plan, sources, clock, mode, joins=True)
        if kind == "stretch":
            check = verify_stretch(spec["severity"], placed_joins, where["stretch_of"])
            check["measured"].update({k: where[k] for k in ("span_s", "anchor_moved_s")})
        elif kind in ("pitch", "vocoded"):
            check = verify_pitch(clean, planted, sr, t, where["note_end"], spec["severity"])
        else:
            check = verify(kind, clean, planted, sr, t, where.get("lag_s"),
                           spec["severity"] if kind.startswith("replay") else None, where.get("gap_s"))
        timing = {k: where[k] for k in ("vowel_moved_s", "gap_s", "lag_s") if k in where}
        if mode == "warp" and kind != "none":
            timing.update(run_stretch(placed_joins, spec["cut_id"]))
        if not check["present"]:
            dropped.append({"spec": spec, "reason": "not measurably as intended", "measured": check["measured"]})
            continue
        lo, hi = clip_window(t, len(planted) / sr, rng)
        clip, proc = chain(planted[int(lo * sr):int(hi * sr)], sr, rng)
        name = f"clips/{i:05d}.wav"
        sf.write(os.path.join(out_dir, name), clip, sr, subtype="PCM_16")
        kept.append({"clip": name, "kind": kind, "defect": kind in DEFECTS,
                     "pick": plan.get("pick_of") or os.path.basename(os.path.normpath(vdir)), "alt": plan.get("alt"),
                     "t_in_clip": round(t - lo, 4), "severity": spec["severity"], "units": spec["units"],
                     "join_type": spec["join_type"], "cut_id": spec["cut_id"], "chain": proc,
                     "timing": timing, "measured": check["measured"], "spec": spec})
    with open(os.path.join(out_dir, "labels.jsonl"), "w", encoding="utf-8") as fh:
        for row in kept:
            fh.write(json.dumps(row) + "\n")
    summary = {"schema": LABELS_SCHEMA, "pick": os.path.basename(os.path.normpath(vdir)), "mode": mode, "seed": seed,
               "max_vowel_move_s": max_vowel_move, "max_gap_s": max_gap,
               "requested": n, "kept": len(kept), "dropped": len(dropped), "skipped_empty_pool": skipped,
               "joins": len(joins),
               "eligible": {k: {str(sev): len(pools[(k, sev)]) for sev in LEVELS[k]} for k in kinds},
               "empty_pools": [f"{k}@{sev}" for (k, sev), pool in pools.items() if not pool],
               "by_kind": {k: sum(r["kind"] == k for r in kept) for k in kinds}, "dropped_rows": dropped}
    with open(os.path.join(out_dir, "summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=1)
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", required=True, help="a pick folder (plan.json; the plan's takes on disk)")
    ap.add_argument("--n", type=int, default=500)
    ap.add_argument("--kinds", default=",".join(DEFAULT_KINDS),
                    help=f"comma list from {', '.join(KINDS)}")
    ap.add_argument("--mode", choices=("warp", "local"), default="warp")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--max-gap", default=str(MAX_GAP_S),
                    help="seconds of pause a replay/skip may leave before its seam (default 0.03); 'off' keeps them")
    ap.add_argument("--max-vowel-move", default=str(MAX_VOWEL_MOVE_S),
                    help="seconds a replay/skip may move its vowel beyond its own shift (default 0.03); "
                         "'off' keeps compound plants")
    ap.add_argument("--out", help="output folder (default tmp/planter/<pick>-<mode>-<seed>)")
    a = ap.parse_args()
    kinds = [k.strip() for k in a.kinds.split(",") if k.strip()]
    bad = [k for k in kinds if k not in KINDS]
    if bad:
        ap.error(f"unknown kinds {bad}; choose from {', '.join(KINDS)}")
    out = a.out or os.path.join("tmp", "planter", f"{os.path.basename(os.path.normpath(a.dir))}-{a.mode}-{a.seed}")
    mvm = None if a.max_vowel_move.lower() == "off" else float(a.max_vowel_move)
    mg = None if a.max_gap.lower() == "off" else float(a.max_gap)
    s = build(a.dir, out, a.n, kinds, a.mode, a.seed, mvm, mg)
    print(f"{out}: kept {s['kept']} of {s['requested']} ({s['by_kind']}), dropped {s['dropped']}, "
          f"skipped {s['skipped_empty_pool']} (empty pools: {', '.join(s['empty_pools']) or 'none'}), {s['joins']} candidate joins")
    print("eligible joins per kind and severity: " + json.dumps(s["eligible"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
