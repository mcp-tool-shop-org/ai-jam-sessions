#!/usr/bin/env python3
"""Vocal sound check: a timing footprint for one voice, taken before the song.

The same voice, backend and prompt sing a short calibration phrase several times
at the SONG's tempo, before the song is rendered. Every syllable's vowel onset is
measured with two instruments of different kinds:

  * a singing forced aligner (onset_aligner.py, HubertFA): the lyrics are known,
    so every phoneme is placed and the vowel onset is where the vowel phoneme
    begins. This is the primary instrument;
  * the gate's own energy detector (vocal_clock.measure_events): where the
    vowel band's energy rises through half its peak. This is the cross-check,
    and it is also what the word picker uses to place clips today.

Where they agree the reading is trusted; where they disagree it is flagged. The
detector reads a little later than the aligner by definition (half-way up the
rise, against the phoneme boundary), so agreement is judged after that offset,
which is MEASURED on every run from the clean-consonant words, never assumed.
The agreement tolerance is provisional until the aligner is validated against
hand-annotated singing (docs/vocal-soundcheck.md). Nothing is calibrated per song
or per voice by hand.

It reports bias and scatter per consonant group, held vs short notes, the
placement shift, agreement between the instruments, and how many takes the song
needs so EVERY syllable has at least one usable take.

"Usable" comes from the picker itself (vocal_clock.repin_words): it MOVES each
word clip so its vowel lands on the clock, so a take's raw offset is not what
fails the gate. A syllable is placeable when the detector dates its vowel, and
trustworthy when the aligner confirms that date.

    python scripts/soundcheck.py clock   --song scores/america-the-beautiful.score-clock.v1.json --out tmp/soundcheck/america/clock.json
    python scripts/soundcheck.py render  --clock tmp/soundcheck/america/clock.json --takes 3 --out-dir tmp/soundcheck/america \\
        --prompt-wav E:/AI/SoulX-Singer/example/audio/en_prompt.mp3 --prompt-meta E:/AI/SoulX-Singer/example/audio/en_prompt.json
    python scripts/soundcheck.py analyze --clock tmp/soundcheck/america/clock.json --takes "tmp/soundcheck/america/take-*/take-48k.wav" \\
        --aligner --receipt tmp/soundcheck/america/soundcheck.json

`render` runs the SoulX venv's python on the local GPU; `--aligner` runs HubertFA in
its own environment (onset_aligner.py). Everything else is numpy and the standard library.
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import statistics
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
import vocal_clock as vc  # noqa: E402

GATE_MS = vc.GATE_MS
SCHEMA = "ai-jam-sessions/soundcheck/v1"

# Monosyllables whose first sound puts them in one consonant group. The group is
# what the vowel waits behind: a stop is a short burst, a fricative a long hiss,
# a sonorant is voiced and blurs into the vowel, "none" starts on the vowel.
# Four of each, so every group has two held and two short notes.
CALIBRATION_WORDS: dict[str, str] = {
    "oh": "none", "all": "none", "eye": "none", "on": "none",
    "day": "stop", "key": "stop", "go": "stop", "two": "stop",
    "see": "fricative", "few": "fricative", "show": "fricative", "zoo": "fricative",
    "low": "sonorant", "may": "sonorant", "new": "sonorant", "row": "sonorant",
}
GROUPS = ("none", "stop", "fricative", "sonorant")

# Notes alternate held / short. The group order (none, stop, fricative, sonorant =
# A B C D) is A B C D | B A D C | D C B A | C D A B: every group sits on two held
# and two short notes, and no two neighbours share a group.
PHRASE = ["oh", "day", "see", "low", "key", "all", "may", "few",
          "new", "show", "go", "eye", "zoo", "row", "on", "two"]

# A group's lead is corrected only when it is steady: a mean at least this far
# from zero, a spread at most half the gate, and the same sign in every take.
CORRECT_MIN_BIAS_MS = 10.0
CORRECT_MAX_SD_MS = GATE_MS / 2

# The two instruments agree when the detector sits within this of the aligner,
# after the measured definitional offset. PROVISIONAL until the aligner is
# validated against hand-annotated singing; the first run on SoulX (2026-10-06)
# put 21 of 23 clean-consonant syllables within it.
AGREE_MS = 20.0
# Groups whose vowel follows a clean consonant: both instruments should work
# there, so they set the offset between the two definitions.
OFFSET_GROUPS = ("stop", "fricative")


# ─── The calibration clock ─────────────────────────────────────────────────

def song_profile(song: dict) -> dict:
    """Tempo, pitch centre and note lengths of the song the sound check is for."""
    evs = song["events"]
    if not evs:
        raise SystemExit("the song clock has no events")
    durs = sorted(float(e["dur_sec"]) for e in evs)
    midis = sorted(int(e["midi"]) for e in evs)
    held = statistics.median(durs)
    return {
        "song_id": song.get("song_id"),
        "bpm": song.get("bpm"),
        "median_midi": int(round(statistics.median(midis))),
        "midi_range": [midis[0], midis[-1]],
        "held_sec": round(held, 4),
        "short_sec": round(held / 2, 4),
        "syllables": len(evs),
        # The song's own notes split the same way the phrase does, for takes-needed.
        "short_count": sum(1 for d in durs if d <= 0.75 * held),
    }


def build_clock(song: dict, sample_rate: int | None = None) -> dict:
    """A score-clock v1 the existing pipeline renders unchanged: one bar of
    silence, the 16-word phrase at the song's median pitch alternating held and
    short notes at the song's tempo, one bar of air after."""
    prof = song_profile(song)
    sr = int(sample_rate or song.get("sample_rate", 48000))
    bar = float(next(iter(song["clock"]["measure_durations_sec"].values())))
    t = bar
    events = []
    for i, word in enumerate(PHRASE):
        dur = prof["held_sec"] if i % 2 == 0 else prof["short_sec"]
        events.append({
            "id": f"s{i:02d}", "lyric": word, "word": word, "syllable": 0, "syllables": 1,
            "midi": prof["median_midi"], "t_sec": round(t, 6), "t_samples": int(round(t * sr)),
            "dur_sec": dur, "group": CALIBRATION_WORDS[word], "length": "held" if i % 2 == 0 else "short",
        })
        t += dur
    total = math.ceil((t + bar) / bar) * bar
    return {
        "schema": "ai-jam-sessions/score-clock/v1",
        "song_id": f"soundcheck:{prof['song_id']}",
        "bpm": song.get("bpm"),
        "time_signature": song.get("time_signature"),
        "sample_rate": sr,
        "total_seconds": total,
        "total_samples": int(round(total * sr)),
        "last_event_end_sec": round(t, 6),
        "soundcheck": {"schema": SCHEMA, "for_song": song.get("_path") or prof["song_id"], "profile": prof},
        "events": events,
    }


# ─── Measuring ─────────────────────────────────────────────────────────────

def _ms(t: float | None, ref: float) -> float | None:
    return None if t is None else (float(t) - float(ref)) * 1000.0


def take_errors(clock: dict, path: str, aligner: list[float | None] | None = None) -> list[dict]:
    """One row per syllable: the detector's reading (the gate's own instrument) and,
    when given, the aligner's. `error_ms` is the PRIMARY reading against the score:
    the aligner's when it placed the vowel, else the detector's."""
    mono, sr, _ = vc.read_audio(path)
    if sr != int(clock["sample_rate"]):
        raise SystemExit(f"{path} is {sr} Hz, the clock is {clock['sample_rate']} Hz")
    rows = vc.measure_events(clock, mono, sr)
    out = []
    for k, (ev, r) in enumerate(zip(clock["events"], rows)):
        det_ms = _ms(r["t_vowel"], r["t_score"])
        t_aln = aligner[k] if aligner is not None else None
        aln_ms = _ms(t_aln, r["t_score"])
        dip = r.get("dip_db")
        out.append({
            "id": r["id"], "word": ev["word"], "group": ev["group"], "length": ev["length"], "t_score": r["t_score"],
            "t_vowel": r["t_vowel"], "detector_ms": det_ms, "reason": r["reason"], "dip_db": dip,
            "t_aligner": t_aln, "aligner_ms": aln_ms,
            "error_ms": aln_ms if aln_ms is not None else det_ms,
            "dated": r["t_vowel"] is not None,
            "clear": r["t_vowel"] is not None and dip is not None and float(dip) >= vc.DIP_CLEAR_DB,
        })
    return out


def cross_check(takes: list[list[dict]]) -> dict | None:
    """Agreement between the detector and the aligner. The offset between the two
    definitions is the median gap on clean-consonant words, measured here; a
    reading agrees when it sits within AGREE_MS of the aligner after that offset.
    Marks every row with `agree` and `status`."""
    rows = [r for t in takes for r in t]
    if not any(r["t_aligner"] is not None for r in rows):
        return None
    gaps = [r["detector_ms"] - r["aligner_ms"] for r in rows
            if r["group"] in OFFSET_GROUPS and r["detector_ms"] is not None and r["aligner_ms"] is not None]
    offset = statistics.median(gaps) if gaps else 0.0
    for r in rows:
        if r["detector_ms"] is not None and r["aligner_ms"] is not None:
            r["gap_ms"] = round(r["detector_ms"] - r["aligner_ms"] - offset, 1)
            r["agree"] = abs(r["gap_ms"]) <= AGREE_MS
            r["status"] = "agree" if r["agree"] else "disagree"
        else:
            r["gap_ms"] = None
            r["agree"] = False
            r["status"] = ("aligner-only" if r["aligner_ms"] is not None else
                           "detector-only" if r["detector_ms"] is not None else "neither")
    per_group = {}
    for g in GROUPS:
        gr = [r for r in rows if r["group"] == g]
        both = [r for r in gr if r["gap_ms"] is not None]
        per_group[g] = {"syllables": len(gr), "aligner_dated": sum(1 for r in gr if r["aligner_ms"] is not None),
                        "both": len(both), "agree": sum(1 for r in both if r["agree"]),
                        "median_abs_gap_ms": round(statistics.median(abs(r["gap_ms"]) for r in both), 1) if both else None,
                        "statuses": {s: sum(1 for r in gr if r["status"] == s) for s in
                                     ("agree", "disagree", "aligner-only", "detector-only", "neither")}}
    return {"offset_ms": round(offset, 1), "offset_from": f"median detector-minus-aligner over {len(gaps)} {'/'.join(OFFSET_GROUPS)} syllables",
            "agree_ms": AGREE_MS, "agree_ms_status": "provisional: pending validation against hand-annotated singing",
            "groups": per_group,
            "flagged": [{"word": r["word"], "id": r["id"], "status": r["status"], "gap_ms": r["gap_ms"],
                         "detector_ms": None if r["detector_ms"] is None else round(r["detector_ms"]),
                         "aligner_ms": None if r["aligner_ms"] is None else round(r["aligner_ms"])}
                        for r in rows if r["status"] != "agree"]}


def _stats(values: list[float]) -> dict:
    if not values:
        return {"n": 0, "mean_ms": None, "sd_ms": None, "max_abs_ms": None}
    return {
        "n": len(values),
        "mean_ms": round(statistics.fmean(values), 2),
        "sd_ms": round(statistics.stdev(values), 2) if len(values) > 1 else 0.0,
        "max_abs_ms": round(max(abs(v) for v in values), 2),
    }


def group_footprint(takes: list[list[dict]]) -> dict:
    """Bias and scatter per consonant group of the PRIMARY reading, pooled over takes,
    plus per-take means so 'consistent across renders' is checked, not assumed."""
    out = {}
    for g in GROUPS:
        pooled, per_take = [], []
        missed = 0
        for rows in takes:
            vals = [r["error_ms"] for r in rows if r["group"] == g and r["error_ms"] is not None]
            missed += sum(1 for r in rows if r["group"] == g and r["error_ms"] is None)
            pooled += vals
            if vals:
                per_take.append(statistics.fmean(vals))
        s = _stats(pooled)
        same_sign = bool(per_take) and (all(m > 0 for m in per_take) or all(m < 0 for m in per_take))
        steady = (s["n"] > 1 and abs(s["mean_ms"]) >= CORRECT_MIN_BIAS_MS
                  and s["sd_ms"] <= CORRECT_MAX_SD_MS and same_sign and len(per_take) == len(takes))
        rows_g = [r for rows in takes for r in rows if r["group"] == g]
        out[g] = {**s, "missed": missed, "per_take_mean_ms": [round(m, 2) for m in per_take],
                  "dated": sum(1 for r in rows_g if r["dated"]), "clear": sum(1 for r in rows_g if r["clear"]),
                  "syllables": len(rows_g),
                  "within_gate": sum(1 for v in pooled if abs(v) <= GATE_MS),
                  "correction_ms": round(-s["mean_ms"], 1) if steady else None,
                  "why": ("steady lead: same sign in every take, spread within half the gate" if steady
                          else "not corrected: " + ("too few onsets" if s["n"] < 2 else
                                                    "no take dated this group" if not per_take else
                                                    f"|mean| under {CORRECT_MIN_BIAS_MS:.0f} ms" if abs(s["mean_ms"]) < CORRECT_MIN_BIAS_MS else
                                                    f"spread over {CORRECT_MAX_SD_MS:.0f} ms" if s["sd_ms"] > CORRECT_MAX_SD_MS else
                                                    "sign differs between takes"))}
    return out


BASES = {
    # the picker can place it: the detector dated the vowel (vocal_clock.repin_words)
    "dated": lambda r: r["dated"],
    # ...and the aligner confirms that date, so the placement can be trusted
    "agreed": lambda r: r.get("agree", False),
    # ...and the picker prefers it: a clear onset
    "clear": lambda r: r["clear"],
    # the aligner placed it (what a picker driven by the aligner would need)
    "aligned": lambda r: r["aligner_ms"] is not None,
    # raw timing, before any placement: what a pipeline WITHOUT the picker would face
    "raw_in_gate": lambda r: r["error_ms"] is not None and abs(r["error_ms"]) <= GATE_MS,
}


def hit_rate(takes: list[list[dict]], length: str | None = None, basis: str = "dated") -> dict:
    """Share of syllables that count under `basis`, smoothed so three takes never
    claim certainty: (hits + 1) / (n + 2), Laplace's rule."""
    ok = BASES[basis]
    rows = [r for t in takes for r in t if length is None or r["length"] == length]
    hits = sum(1 for r in rows if ok(r))
    n = len(rows)
    return {"basis": basis, "n": n, "hits": hits, "raw": round(hits / n, 4) if n else None, "p": round((hits + 1) / (n + 2), 4)}


def takes_needed(p: float, syllables: int, confidence: float = 0.95) -> int:
    """Takes so that every one of `syllables` has at least one usable take, with
    probability >= confidence. Union bound: each syllable may fail with at most
    (1 - confidence) / syllables, and a syllable fails only if all N takes miss,
    (1 - p)^N. (Chen et al. 2021 pass@k; takes treated as independent renders.)"""
    if not 0 < p <= 1:
        raise ValueError(f"p must be in (0, 1], got {p}")
    if p == 1:
        return 1
    budget = (1 - confidence) / max(1, syllables)
    return max(1, math.ceil(math.log(budget) / math.log(1 - p)))


def plan_takes(takes: list[list[dict]], prof: dict, basis: str, confidence: float) -> dict:
    """Takes needed so every syllable of the SONG has at least one take that counts
    under `basis`. Only the note lengths the song contains drive it, and the union
    bound is spent across all of the song's syllables."""
    n_short = prof["short_count"]
    n_held = prof["syllables"] - n_short
    need = []
    if n_held:
        need.append(takes_needed(hit_rate(takes, "held", basis)["p"], prof["syllables"], confidence))
    if n_short:
        need.append(takes_needed(hit_rate(takes, "short", basis)["p"], prof["syllables"], confidence))
    return {"basis": basis, "song_syllables": prof["syllables"], "held": n_held, "short": n_short,
            "confidence": confidence, "takes_needed": max(need) if need else None}


def analyze(clock: dict, take_paths: list[str], song: dict | None, confidence: float = 0.95,
            aligner: list[list[float | None]] | None = None) -> dict:
    takes = [take_errors(clock, p, aligner[i] if aligner else None) for i, p in enumerate(take_paths)]
    cross = cross_check(takes)
    prof = (clock.get("soundcheck") or {}).get("profile") or (song_profile(song) if song else None)
    bases = [b for b in BASES if cross or b not in ("agreed", "aligned")]
    plan = plans = None
    if prof:
        plans = {b: plan_takes(takes, prof, b, confidence) for b in bases}
        # Headline: placements the aligner confirms when it ran, else what the picker can place.
        plan = plans["agreed" if cross else "dated"]
    shifts = [abs(r["detector_ms"]) for t in takes for r in t if r["detector_ms"] is not None]
    return {
        "schema": SCHEMA,
        "clock": clock.get("_path"),
        "takes": [{"path": p.replace("\\", "/"), "sha256": vc.sha256(p)} for p in take_paths],
        "gate_ms": GATE_MS,
        "primary": "aligner" if cross else "detector",
        "groups": group_footprint(takes),
        "cross_check": cross,
        "length_risk": {"held": hit_rate(takes, "held"), "short": hit_rate(takes, "short")},
        "plan": plan,
        "plans": plans,
        # how far placement has to move a clip to put its vowel on the clock
        "shift_ms": _stats(shifts),
        "rows": takes,
        "detector": vc.detector_info(),
    }


# ─── Rendering (the one step that needs the GPU) ───────────────────────────

def soulx_python() -> str:
    return os.environ.get("SOULX_PYTHON") or os.path.join(os.environ.get("SOULX_ROOT", "E:/AI/SoulX-Singer"), ".venv", "Scripts", "python.exe")


def render(clock_path: str, takes: int, out_dir: str, prompt_wav: str, prompt_meta: str) -> list[str]:
    here = os.path.dirname(os.path.abspath(__file__))
    py = soulx_python()
    os.makedirs(out_dir, exist_ok=True)
    target = os.path.join(out_dir, "soulx-target.json")
    subprocess.run([py, os.path.join(here, "export_soulx_target.py"), "--clock", clock_path, "--out", target], check=True)
    paths = []
    for i in range(1, takes + 1):
        take_dir = os.path.join(out_dir, f"take-{i:02d}")
        subprocess.run([py, os.path.join(here, "soulx_take.py"), "--target", target, "--prompt-wav", prompt_wav,
                        "--prompt-meta", prompt_meta, "--out-dir", take_dir], check=True)
        paths.append(os.path.join(take_dir, "take-48k.wav"))
    return paths


# ─── CLI ───────────────────────────────────────────────────────────────────

def _expand(patterns: list[str]) -> list[str]:
    out = []
    for p in patterns:
        hits = sorted(glob.glob(p))
        out += hits if hits else [p]
    missing = [p for p in out if not os.path.isfile(p)]
    if missing:
        raise SystemExit(f"no such take: {missing[0]}")
    return out


def print_report(r: dict) -> None:
    print(f"Sound check over {len(r['takes'])} take(s), gate ±{r['gate_ms']:.0f} ms, primary instrument: {r['primary']}")
    print(f"{'group':<10} {'dated':>6} {'clear':>6} {'mean':>8} {'sd':>7} {'raw in gate':>12}  correction")
    for g, s in r["groups"].items():
        mean = "-" if s["mean_ms"] is None else f"{s['mean_ms']:+.1f}"
        sd = "-" if s["sd_ms"] is None else f"{s['sd_ms']:.1f}"
        corr = f"{s['correction_ms']:+.1f} ms" if s["correction_ms"] is not None else s["why"]
        print(f"{g:<10} {s['dated']:>3}/{s['syllables']:<2} {s['clear']:>3}/{s['syllables']:<2} {mean:>8} {sd:>7} "
              f"{s['within_gate']:>8}/{s['syllables']:<3}  {corr}")
    c = r["cross_check"]
    if c:
        print(f"Cross-check: detector reads {c['offset_ms']:+.1f} ms from the aligner by definition ({c['offset_from']});"
              f" agree within ±{c['agree_ms']:.0f} ms ({c['agree_ms_status']})")
        for g, s in c["groups"].items():
            gap = "-" if s["median_abs_gap_ms"] is None else f"{s['median_abs_gap_ms']:.1f}"
            print(f"  {g:<10} aligner dated {s['aligner_dated']}/{s['syllables']}, agree {s['agree']}/{s['both']}, median |gap| {gap} ms")
        for f in c["flagged"]:
            print(f"  flag {f['word']:<5} {f['status']:<13} detector {f['detector_ms']} ms, aligner {f['aligner_ms']} ms, gap {f['gap_ms']}")
    sh = r["shift_ms"]
    if sh["n"]:
        print(f"Placement shift: mean {sh['mean_ms']:.0f} ms, max {sh['max_abs_ms']:.0f} ms")
    if r["plans"]:
        p = r["plans"]
        line = f"Takes needed for {p['dated']['song_syllables']} syllables at {p['dated']['confidence']:.0%} confidence: "
        parts = [f"{p['dated']['takes_needed']} placeable (vowel dated)"]
        if "agreed" in p:
            parts.insert(0, f"{p['agreed']['takes_needed']} confirmed by both instruments")
        parts += [f"{p['clear']['takes_needed']} with clear onsets", f"{p['raw_in_gate']['takes_needed']} without placement"]
        print(line + "; ".join(parts))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("clock"); s.add_argument("--song", required=True); s.add_argument("--out", required=True)
    s = sub.add_parser("render"); s.add_argument("--clock", required=True); s.add_argument("--takes", type=int, default=3)
    s.add_argument("--out-dir", required=True); s.add_argument("--prompt-wav", required=True); s.add_argument("--prompt-meta", required=True)
    s = sub.add_parser("analyze"); s.add_argument("--clock", required=True); s.add_argument("--takes", nargs="+", required=True)
    s.add_argument("--song"); s.add_argument("--confidence", type=float, default=0.95); s.add_argument("--receipt")
    s.add_argument("--aligner", action="store_true", help="measure with the singing forced aligner too (onset_aligner.py)")
    s.add_argument("--work-dir", help="where the aligner's input and output go (default: beside the clock)")
    a = ap.parse_args(argv)

    if a.cmd == "clock":
        clock = build_clock(vc.load_clock(a.song))
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        json.dump(clock, open(a.out, "w", encoding="utf-8"), indent=2)
        prof = clock["soundcheck"]["profile"]
        print(f"calibration clock -> {a.out}: {len(clock['events'])} syllables at MIDI {prof['median_midi']}, "
              f"held {prof['held_sec']}s / short {prof['short_sec']}s, {clock['total_seconds']}s")
        return 0
    clock = vc.load_clock(a.clock)
    if a.cmd == "render":
        for p in render(a.clock, a.takes, a.out_dir, a.prompt_wav, a.prompt_meta):
            print(f"take -> {p}")
        return 0
    takes = _expand(a.takes)
    aligner = None
    if a.aligner:
        import onset_aligner
        aligner = onset_aligner.align(takes, [e["word"] for e in clock["events"]],
                                      a.work_dir or os.path.dirname(os.path.abspath(a.clock)))
    r = analyze(clock, takes, vc.load_clock(a.song) if a.song else None, a.confidence, aligner)
    print_report(r)
    if a.receipt:
        json.dump(r, open(a.receipt, "w", encoding="utf-8"), indent=2)
        print(f"receipt -> {a.receipt}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
