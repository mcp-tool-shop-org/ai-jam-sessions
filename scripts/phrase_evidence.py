#!/usr/bin/env python3
"""Per-phrase evidence of audible defects, for a reviewed mix.

    python scripts/phrase_evidence.py --dir tmp/vocal-clock/sing/<song>/<pick> [--out <dir>/phrase-evidence.json]
    python scripts/phrase_evidence.py --clips tmp/stepb/<song>/<mix>      # per planted clip

The timing and pitch gates measure syllables and notes; the defects the Director
marked were mostly at joins (audio replayed or skipped where clips meet) and at the
edges of rendered segments, which neither gate can see (2026-10-07: 18 of his first
21 marks sat on a join). This receipt puts that evidence beside the gates, one row
per phrase, for the hearing records (sense-si ai-ears) and the decision-layer study.

Per phrase:
  - plan facts: joins between clips, switches between takes, air left between clips,
    how far neighbours were shifted apart (cut placement), stretch ratios (warp), and
    the distance from the nearest boundary between rendered segments;
  - at every join, four measurements on the placed vocal (after the R&D seat's entry
    2026-10-07-join-artefact-detection; none is validated for repeated or skipped
    fragments or for singing, so they are calibrated against the marks, not trusted):
      1. spectral jump: log-mel distance across the join (JUMP_HALF_S either side),
         over the take's median frame-to-frame distance;
      2. repeat/skip: the best similarity between the audio just after the join and
         audio up to REPEAT_MAX_LAG_S before it (a ridge means material plays twice);
      3. click/noise: the high-passed first difference within CLICK_S of the join, as
         a z-score against the surrounding CLICK_CONTEXT_S;
      4. F0: the largest pitch step (cents) and any octave jump or voicing flip within
         F0_S of the join, from FCPE;
    each also as a percentile against the same measurement at CONTROLS positions in the
    same take that are not near a join;
  - whole-phrase pitch-track flags: octave jumps and the largest step inside the phrase.

The receipt never reads review marks: they are the labels it is evaluated against.

`--clips` measures the planter's clips instead (scripts/planter.py: clips/*.wav plus
labels.jsonl). For every clip, the same four measurements at its join (`t_in_clip`),
each as a percentile against CONTROLS positions in the same clip clear of the join,
written to evidence/<clip>.json beside it. Only the audio is read: the plan facts a
mix row carries (switches, air, stretch) would tell a model where the planter worked,
which is the label, so a clip row has none of them.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import review_marks as rm  # noqa: E402
import vocal_clock as vc  # noqa: E402

SCHEMA = "ai-jam-sessions/phrase-evidence/v1"
REVISION = "1"
SR_FEAT = 16000                # features are computed at 16 kHz
HOP_S = 0.005                  # 5 ms frames
JUMP_HALF_S = 0.015            # spectral jump: frames this far either side of the join
REPEAT_WIN_S = 0.12            # repeat/skip: the window just after the join
REPEAT_MAX_LAG_S = 0.6         # ... compared against audio up to this far before it
REPEAT_MIN_LAG_S = 0.03
CLICK_S = 0.01
CLICK_CONTEXT_S = 0.2
F0_S = 0.02
OCTAVE_CENTS = 900             # a step this large in one frame is an octave slip
CONTROLS = 60
CONTROL_CLEAR_S = 0.2          # a control sits at least this far from any join
PHRASE_PAD_S = 0.3             # a join this close outside a phrase belongs to it


def load(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def logmel(mono: np.ndarray, sr: int) -> tuple[np.ndarray, int]:
    import librosa
    y = librosa.resample(mono.astype(np.float32), orig_sr=sr, target_sr=SR_FEAT)
    hop = int(HOP_S * SR_FEAT)
    m = librosa.feature.melspectrogram(y=y, sr=SR_FEAT, n_fft=512, hop_length=hop, n_mels=40, fmin=60, fmax=7600)
    return np.log(m + 1e-8).T, hop          # frames x mels


class Features:
    """The four join measurements over one placed vocal."""

    def __init__(self, mono: np.ndarray, sr: int, f0: dict):
        self.mel, hop = logmel(mono, sr)
        self.dmel = np.diff(self.mel, axis=0)                    # how the spectrum moves, frame to frame
        self.fps = SR_FEAT / hop
        d = np.linalg.norm(np.diff(self.mel, axis=0), axis=1)
        self.frame_dist = float(np.median(d[d > 0])) if np.any(d > 0) else 1.0
        self.mono, self.sr = mono, sr
        self.hp = np.diff(mono)                                  # first difference: a crude high-pass
        self.f0_t, self.f0 = f0["times"], f0["f0"]

    def _frame(self, t: float) -> int:
        return int(round(t * self.fps))

    def spectral_jump(self, t: float) -> float | None:
        i, k = self._frame(t), max(1, int(JUMP_HALF_S * self.fps))
        if i - k < 0 or i + k >= len(self.mel):
            return None
        a, b = self.mel[i - k:i].mean(axis=0), self.mel[i:i + k].mean(axis=0)
        return float(np.linalg.norm(a - b) / self.frame_dist)

    def repeat(self, t: float) -> float | None:
        """The best correlation between how the spectrum moves just after the join and
        how it moved at some point up to REPEAT_MAX_LAG_S before it. Compared on the
        frame-to-frame changes, not the spectra: a held vowel's spectrum is the same
        everywhere (0.90 on plain singing), but its changes are only noise, while
        material played twice repeats its changes exactly."""
        i, w = self._frame(t), max(2, int(REPEAT_WIN_S * self.fps))
        lo, hi = max(1, int(REPEAT_MIN_LAG_S * self.fps)), int(REPEAT_MAX_LAG_S * self.fps)
        if i + w >= len(self.dmel) or i - hi < 0:
            return None
        after = self.dmel[i:i + w].ravel()
        after = (after - after.mean()) / (after.std() + 1e-9)
        best = -1.0
        for lag in range(lo, hi + 1):
            before = self.dmel[i - lag:i - lag + w].ravel()
            before = (before - before.mean()) / (before.std() + 1e-9)
            best = max(best, float(np.mean(after * before)))
        return best

    def click(self, t: float) -> float | None:
        c, k, ctx = int(t * self.sr), int(CLICK_S * self.sr), int(CLICK_CONTEXT_S * self.sr)
        if c - ctx < 0 or c + ctx >= len(self.hp):
            return None
        near = np.abs(self.hp[c - k:c + k]).max()
        around = np.abs(np.concatenate([self.hp[c - ctx:c - k], self.hp[c + k:c + ctx]]))
        return float((near - around.mean()) / (around.std() + 1e-9))

    def f0_step(self, t: float) -> dict:
        sel = np.where((self.f0_t >= t - F0_S) & (self.f0_t <= t + F0_S))[0]
        if len(sel) < 2:
            return {"step_cents": None, "octave": False, "voicing_flip": False}
        f = self.f0[sel]
        voiced = f > 0
        steps = [abs(1200 * np.log2(b / a)) for a, b in zip(f[:-1], f[1:]) if a > 0 and b > 0]
        step = max(steps) if steps else None
        return {"step_cents": None if step is None else round(float(step), 1), "octave": bool(step is not None and step >= OCTAVE_CENTS),
                "voicing_flip": bool(voiced.any() and not voiced.all())}

    def at(self, t: float) -> dict:
        r = {"spectral_jump": self.spectral_jump(t), "repeat_similarity": self.repeat(t), "click_z": self.click(t)}
        r = {k: (None if v is None else round(v, 3)) for k, v in r.items()}
        r.update(self.f0_step(t))
        return r


def percentile(value: float | None, controls: list[float]) -> float | None:
    if value is None or not controls:
        return None
    return round(float(np.mean(np.asarray(controls) < value)), 3)


def segment_bounds(plan: dict) -> list[float]:
    """Boundaries between rendered segments, from the target of the run each take came from."""
    bounds = set()
    for run in {os.path.dirname(os.path.dirname(c["source_key"].replace("\\", "/"))) for c in plan["cuts"]}:
        tp = os.path.join(run, "target.json")
        if os.path.isfile(tp):
            for seg in load(tp)[1:]:
                bounds.add(round(seg["time"][0] / 1000.0, 3))
    return sorted(bounds)


def phrases_of(plan: dict, clock: dict, gap: float) -> list[tuple[float, float]]:
    if plan.get("phrases"):
        return [(float(p["start"]), float(p["end"])) for p in plan["phrases"]]
    import onset_aligner
    return [(lo, hi) for lo, hi, _ in onset_aligner.phrase_spans(clock, gap)]


def build(vdir: str, gap: float = 0.3, seed: int = 7) -> dict:
    plan = load(os.path.join(vdir, "plan.json"))
    placed = load(os.path.join(vdir, "placed.json"))
    clock = vc.load_clock(plan["clock"])
    syl = rm.syllables(plan)
    gaps = {j["id"]: j["gap_ms"] for j in placed.get("joins", [])}
    warp = {j["id"]: j for j in placed.get("joins", []) if "run" in j} if placed.get("mode") == "local-warp" else None
    joins = rm.joins(syl, gaps, warp)
    stretch = {j["id"]: j.get("stretch") for j in placed.get("joins", [])} if warp is not None else {}
    shift = {s["id"]: s["start"] - s["src_start"] for s in syl}
    bounds = segment_bounds(plan)

    mono, sr, _ = vc.read_audio(os.path.join(vdir, "placed-local.wav"))
    feats = Features(mono, sr, vc.track_f0(mono, sr, "fcpe"))
    phrases = phrases_of(plan, clock, gap)

    # Controls: positions inside sung phrases, clear of every join.
    rng = np.random.default_rng(seed)
    join_t = np.array([j["t"] for j in joins]) if joins else np.zeros(0)
    pool = [t for lo, hi in phrases for t in np.arange(lo + 0.25, hi - 0.25, 0.05)
            if not len(join_t) or np.min(np.abs(join_t - t)) > CONTROL_CLEAR_S]
    picks = rng.choice(pool, size=min(CONTROLS, len(pool)), replace=False) if pool else []
    ctrl = [feats.at(float(t)) for t in picks]
    cvals = {k: [c[k] for c in ctrl if c[k] is not None] for k in ("spectral_jump", "repeat_similarity", "click_z", "step_cents")}

    rows = []
    for i, (lo, hi) in enumerate(phrases):
        inside = [j for j in joins if lo - PHRASE_PAD_S <= j["t"] <= hi + PHRASE_PAD_S]
        at = []
        for j in inside:
            m = feats.at(j["t"])
            m.update({"t": round(j["t"], 3), "switch": j["switch"], "air_ms": j["air_ms"], "shift_diff_ms": j["shift_diff_ms"],
                      "stretch": j.get("stretch")})
            for k in ("spectral_jump", "repeat_similarity", "click_z", "step_cents"):
                m[f"{k}_pct"] = percentile(m[k], cvals[k])
            at.append(m)
        ids = [s["id"] for s in syl if lo <= s["start"] < hi]
        f0 = feats.f0[(feats.f0_t >= lo) & (feats.f0_t < hi)]
        voiced = f0[f0 > 0]
        steps = np.abs(1200 * np.log2(voiced[1:] / voiced[:-1])) if len(voiced) > 1 else np.zeros(0)
        strs = [stretch[k] for k in ids if stretch.get(k) is not None]
        shifts = [shift[k] for k in ids]
        before = [b for b in bounds if b <= lo + 1e-6]
        top = lambda key: max((m[key] for m in at if m[key] is not None), default=None)
        rows.append({
            "index": i, "start": round(lo, 3), "end": round(hi, 3), "syllables": len(ids),
            "takes": sorted({s["take"] for s in syl if lo <= s["start"] < hi}),
            "joins": len(at), "switches": sum(1 for m in at if m["switch"]),
            "air_ms_max": max((m["air_ms"] for m in at), default=0.0),
            "shift_diff_ms_max": max((abs(m["shift_diff_ms"]) for m in at), default=0),
            "shift_spread_ms": round(float(np.ptp(shifts) * 1000), 1) if shifts else 0.0,
            "stretch_min": min(strs, default=None), "stretch_max": max(strs, default=None),
            "segment_boundary_s": round(lo - before[-1], 3) if before else None,
            "spectral_jump_max": top("spectral_jump"), "repeat_similarity_max": top("repeat_similarity"),
            "click_z_max": top("click_z"), "f0_step_cents_max": top("step_cents"),
            "pct_max": max((m[k] for m in at for k in ("spectral_jump_pct", "repeat_similarity_pct", "click_z_pct", "step_cents_pct")
                            if m[k] is not None), default=None),
            "octave_jumps": int(np.sum(steps >= OCTAVE_CENTS)), "pitch_step_cents_max": round(float(steps.max()), 1) if len(steps) else None,
            "at_joins": at,
        })
    return {"schema": SCHEMA, "revision": REVISION, "dir": os.path.abspath(vdir).replace("\\", "/"),
            "placement": placed.get("mode", "local"), "vocal_sha256": vc.sha256(os.path.join(vdir, "placed-local.wav")),
            "instruments": {"mel": {"sr": SR_FEAT, "hop_s": HOP_S, "n_mels": 40}, "f0": "fcpe",
                            "params": {"jump_half_s": JUMP_HALF_S, "repeat_win_s": REPEAT_WIN_S, "repeat_lag_s": [REPEAT_MIN_LAG_S, REPEAT_MAX_LAG_S],
                                       "click_s": CLICK_S, "click_context_s": CLICK_CONTEXT_S, "f0_s": F0_S, "octave_cents": OCTAVE_CENTS,
                                       "controls": CONTROLS, "control_clear_s": CONTROL_CLEAR_S, "seed": seed}},
            "controls": {k: {"n": len(v), "median": round(float(np.median(v)), 3) if v else None} for k, v in cvals.items()},
            "segment_bounds": bounds, "phrases": rows}


CLIP_SCHEMA = "ai-jam-sessions/clip-evidence/v1"
CLIP_EDGE_S = 0.3              # a control sits at least this far inside the clip


def clip_evidence(wav: str, t: float, seed: int = 7) -> dict:
    """The four join measurements at time t of one clip, and their percentiles against
    positions in the same clip clear of t (CONTROL_CLEAR_S)."""
    mono, sr, frames = vc.read_audio(wav)
    dur = frames / sr
    feats = Features(mono, sr, vc.track_f0(mono, sr, "fcpe"))
    pool = [x for x in np.arange(CLIP_EDGE_S, dur - CLIP_EDGE_S, 0.05) if abs(x - t) > CONTROL_CLEAR_S]
    rng = np.random.default_rng(seed)
    picks = rng.choice(pool, size=min(CONTROLS, len(pool)), replace=False) if pool else []
    ctrl = [feats.at(float(x)) for x in picks]
    keys = ("spectral_jump", "repeat_similarity", "click_z", "step_cents")
    cvals = {k: [c[k] for c in ctrl if c[k] is not None] for k in keys}
    m = feats.at(t)
    for k in keys:
        m[f"{k}_pct"] = percentile(m[k], cvals[k])
    return {"schema": CLIP_SCHEMA, "revision": REVISION, "t": round(t, 4), "seconds": round(dur, 3), "at_join": m,
            "controls": {k: {"n": len(v), "median": round(float(np.median(v)), 3) if v else None} for k, v in cvals.items()}}


def build_clips(folder: str, seed: int = 7) -> int:
    """evidence/<clip>.json for every row of a planter folder's labels.jsonl."""
    rows = [json.loads(line) for line in open(os.path.join(folder, "labels.jsonl"), encoding="utf-8") if line.strip()]
    out_dir = os.path.join(folder, "evidence")
    os.makedirs(out_dir, exist_ok=True)
    for r in rows:
        ev = clip_evidence(os.path.join(folder, r["clip"]), float(r["t_in_clip"]), seed)
        ev["clip"] = r["clip"]
        name = os.path.splitext(os.path.basename(r["clip"]))[0] + ".json"
        with open(os.path.join(out_dir, name), "w", encoding="utf-8") as f:
            json.dump(ev, f, indent=1)
    return len(rows)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", action="append", default=[], help="a pick folder (plan.json, placed.json, placed-local.wav); repeatable")
    ap.add_argument("--clips", action="append", default=[], help="a planter output folder (clips/, labels.jsonl); repeatable")
    ap.add_argument("--gap", type=float, default=0.3)
    a = ap.parse_args()
    if not a.dir and not a.clips:
        ap.error("give --dir (a mix) or --clips (a planter folder)")
    for c in a.clips:
        n = build_clips(c)
        print(f"{os.path.join(c, 'evidence')}: {n} clips measured")
    for d in a.dir:
        out = build(d, a.gap)
        path = os.path.join(d, "phrase-evidence.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=1)
        n = sum(r["joins"] for r in out["phrases"])
        print(f"{path}: {len(out['phrases'])} phrases, {n} joins measured, {out['controls']['spectral_jump']['n']} controls")
    return 0


if __name__ == "__main__":
    sys.exit(main())
