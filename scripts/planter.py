#!/usr/bin/env python3
"""Plant known defects into a pick's vocal by mutating its plan, not its audio.

    python scripts/planter.py --dir tmp/vocal-clock/sing/<song>/<pick> [--n 500]
        [--kinds replay,skip,click,sham,none] [--mode warp|local] [--seed 7] [--out tmp/planter/<name>]

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
KINDS = ("replay", "skip", "click", "sham", "none")
LEVELS = {
    "replay": (0.02, 0.05, 0.1, 0.2),
    "skip": (0.02, 0.05, 0.1, 0.2),
    "click": (0.005, 0.002, 0.001, 0.0),
    "sham": (0.0,),
    "none": (0.0,),
}
UNITS = {
    "replay": "seconds of source played twice",
    "skip": "seconds of source skipped",
    "click": "crossfade seconds at the seam (shorter is harsher)",
    "sham": "none",
    "none": "none",
}
MIN_CUT_S = 0.05             # a skip never leaves less of the cut than this
SHAM_TIMING_S = 0.03         # a warp sham may move the cut's vowel by at most this
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


def mutate(plan: dict, spec: dict, clock: dict | None = None) -> tuple[dict, dict]:
    """A new plan with the spec's defect, and where it is: {"t": the join's time on
    the timeline, "lag_s": for a replay, how far back the repeated audio was first
    heard}. The given plan is never changed. Raises ValueError when the defect
    cannot be planted here."""
    out = copy.deepcopy(plan)
    byid = {c["id"]: c for c in out["cuts"]}
    if spec["cut_id"] not in byid:
        raise ValueError(f"no cut {spec['cut_id']!r}")
    c = byid[spec["cut_id"]]
    kind, s = spec["kind"], float(spec["severity"])
    where = {"t": float(c["placed_start"])}
    if kind == "none":
        return out, where
    if spec["mode"] == "warp" and spec["join_type"] == "inside":
        c["break_before"] = True
    end = c["cut_start"] + c.get("clip_seconds", c["cut_end"] - c["cut_start"])
    if kind in ("replay", "skip"):
        s_end, to_timeline = _prev_play(out, c, spec["mode"], clock)
        start = s_end - s if kind == "replay" else s_end + s
        if start < 0 or start > c["cut_end"] - MIN_CUT_S:
            raise ValueError(f"{c['id']}: no room for a {s} s {kind}")
        c["cut_start"] = start
        if "clip_seconds" in c:
            c["clip_seconds"] = end - start
        if kind == "replay":
            where["lag_s"] = round(where["t"] - to_timeline(start), 4)
    elif kind == "click":
        c["xfade_s"] = s
        if spec["mode"] == "warp":
            _run_of(out, c, clock)          # place_warp reads xfade_s only from a run's first cut
    elif kind == "sham":
        if spec["mode"] == "local":
            where["t"] = _split(out, c)
        else:
            where.update(_seamless(out, c, clock))
    if kind in ("replay", "skip"):
        s_end, to_timeline = _prev_play(out, c, spec["mode"], clock)
        where["gap_s"] = round(max(0.0, where["t"] - to_timeline(s_end)), 4)
    return out, where


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


def render(plan: dict, sources: dict, clock: dict | None, mode: str = "warp") -> np.ndarray:
    sr = int(plan["sample_rate"])
    out, _ = vc.place_warp(plan, sources, sr, clock) if mode == "warp" else vc.place_local(plan, sources, sr)
    return out


def _mono(x: np.ndarray) -> np.ndarray:
    return x.mean(axis=1) if x.ndim == 2 else x


def _db(x: np.ndarray) -> float:
    return 10 * np.log10(float(np.mean(x ** 2)) + 1e-20)


def repeat_at_lag(f: "pe.Features", t: float, lag_s: float) -> float | None:
    """phrase_evidence's repeat measurement, at one known lag and over exactly the
    repeated span: how well the spectral changes in [t, t + lag] match those in
    [t - lag, t] (capped at REPEAT_WIN_S), so the earlier window never crosses the
    seam."""
    i = f._frame(t)
    lag = max(2, int(round(lag_s * f.fps)))
    w = min(lag, max(2, int(pe.REPEAT_WIN_S * f.fps)))
    if i - lag < 0 or i + w >= len(f.dmel):
        return None
    a, b = f.dmel[i:i + w].ravel(), f.dmel[i - lag:i - lag + w].ravel()
    a, b = (a - a.mean()) / (a.std() + 1e-9), (b - b.mean()) / (b.std() + 1e-9)
    return float(np.mean(a * b))


def verify(kind: str, clean: np.ndarray, planted: np.ndarray, sr: int, t: float, lag_s: float | None = None) -> dict:
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
        va, vb = repeat_at_lag(fa, t, lag_s), repeat_at_lag(fb, t, lag_s)
        m["repeat_clean"] = None if va is None else round(va, 3)
        m["repeat_planted"] = None if vb is None else round(vb, 3)
        m["lag_s"] = lag_s
    rep = None if None in (m["repeat_clean"], m["repeat_planted"]) else m["repeat_planted"] - m["repeat_clean"]
    clk = None if None in (m["click_clean"], m["click_planted"]) else m["click_planted"] - m["click_clean"]
    if kind == "replay":
        present = rep is not None and rep >= REPEAT_DELTA
    elif kind == "skip":
        present = change_db is not None and change_db > CHANGE_DB
    elif kind == "click":
        present = clk is not None and clk >= CLICK_DELTA
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

def _plantable(plan: dict, spec: dict, clock: dict | None) -> bool:
    try:
        mutate(plan, spec, clock)
        return True
    except ValueError:
        return False


def build(vdir: str, out_dir: str, n: int, kinds: list[str], mode: str = "warp", seed: int = 7) -> dict:
    import soundfile as sf
    plan = json.load(open(os.path.join(vdir, "plan.json"), encoding="utf-8"))
    clock = vc.load_clock(plan["clock"]) if isinstance(plan.get("clock"), str) and os.path.exists(plan["clock"]) else None
    sources = load_sources(plan)
    sr = int(plan["sample_rate"])
    clean = render(plan, sources, clock, mode)
    joins = candidate_joins(plan, clock, mode)
    if not joins:
        raise SystemExit(f"{vdir}: no joins to plant at")
    rng = np.random.default_rng(seed)
    pools = {k: joins for k in kinds}
    if "sham" in kinds:
        # In warp mode most joins sit inside a stretched run, where no seam can be
        # seamless; draw shams only from the joins that can take one.
        pools["sham"] = [j for j in joins if _plantable(plan, make_spec("sham", j, 0.0, mode, 0), clock)]
    os.makedirs(os.path.join(out_dir, "clips"), exist_ok=True)
    kept, dropped = [], []
    for i in range(n):
        kind = kinds[i % len(kinds)]
        pool = pools[kind]
        if not pool:
            dropped.append({"spec": {"kind": kind}, "reason": "no join here can take this kind"})
            continue
        join = pool[int(rng.integers(len(pool)))]
        spec = make_spec(kind, join, float(rng.choice(LEVELS[kind])), mode, int(rng.integers(1 << 31)))
        try:
            planted_plan, where = mutate(plan, spec, clock)
        except ValueError as exc:
            dropped.append({"spec": spec, "reason": str(exc)})
            continue
        t = where["t"]
        planted = clean if kind == "none" else render(planted_plan, sources, clock, mode)
        check = verify(kind, clean, planted, sr, t, where.get("lag_s"))
        if not check["present"]:
            dropped.append({"spec": spec, "reason": "not measurably as intended", "measured": check["measured"]})
            continue
        lo, hi = clip_window(t, len(planted) / sr, rng)
        clip, proc = chain(planted[int(lo * sr):int(hi * sr)], sr, rng)
        name = f"clips/{i:05d}.wav"
        sf.write(os.path.join(out_dir, name), clip, sr, subtype="PCM_16")
        kept.append({"clip": name, "kind": kind, "defect": kind in ("replay", "skip", "click"),
                     "t_in_clip": round(t - lo, 4), "severity": spec["severity"], "units": spec["units"],
                     "join_type": spec["join_type"], "cut_id": spec["cut_id"], "chain": proc,
                     "measured": check["measured"], "spec": spec})
    with open(os.path.join(out_dir, "labels.jsonl"), "w", encoding="utf-8") as fh:
        for row in kept:
            fh.write(json.dumps(row) + "\n")
    summary = {"schema": LABELS_SCHEMA, "pick": os.path.basename(os.path.normpath(vdir)), "mode": mode, "seed": seed,
               "requested": n, "kept": len(kept), "dropped": len(dropped), "joins": len(joins),
               "sham_joins": len(pools.get("sham", [])),
               "by_kind": {k: sum(r["kind"] == k for r in kept) for k in kinds}, "dropped_rows": dropped}
    with open(os.path.join(out_dir, "summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=1)
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", required=True, help="a pick folder (plan.json; the plan's takes on disk)")
    ap.add_argument("--n", type=int, default=500)
    ap.add_argument("--kinds", default="replay,skip,click,sham,none")
    ap.add_argument("--mode", choices=("warp", "local"), default="warp")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", help="output folder (default tmp/planter/<pick>-<mode>-<seed>)")
    a = ap.parse_args()
    kinds = [k.strip() for k in a.kinds.split(",") if k.strip()]
    bad = [k for k in kinds if k not in KINDS]
    if bad:
        ap.error(f"unknown kinds {bad}; choose from {', '.join(KINDS)}")
    out = a.out or os.path.join("tmp", "planter", f"{os.path.basename(os.path.normpath(a.dir))}-{a.mode}-{a.seed}")
    s = build(a.dir, out, a.n, kinds, a.mode, a.seed)
    print(f"{out}: kept {s['kept']} of {s['requested']} ({s['by_kind']}), dropped {s['dropped']}, {s['joins']} candidate joins")
    return 0


if __name__ == "__main__":
    sys.exit(main())
