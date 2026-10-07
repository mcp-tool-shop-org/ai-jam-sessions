#!/usr/bin/env python3
"""A listening review: the Director marks what he hears, the report says what was there.

    python scripts/review_marks.py page --run tmp/vocal-clock/sing/<song> --variant phrase16 \
        [--variant word16] [--run ...] --out tmp/vocal-clock/review
    python -m http.server 8766 --bind 127.0.0.1 --directory tmp/vocal-clock/review
    python scripts/review_marks.py report --review tmp/vocal-clock/review --marks marks.json

`page` builds one page for every <run>/<variant> given. A variant folder holds what
sing_clock.py leaves after a pick: plan.json, receipt.json, pitch.json,
placed.json, placed-local.wav (the vocal stem) and mix-local.wav. The page plays the mix (or the
vocal alone); M drops a marker where something sounds wrong, with categories and a
note, and every mark records who made it and at what level (LEVELS). Marks stay in that browser's localStorage (`?test` keeps a separate store, so
checking the page never touches real marks) and Export downloads them as JSON.

`report` joins each marker to what the plan and the gates know about that moment:
the syllables sung in the second before the press (a listener presses after the
sound), which take sang each one and where in that take, every join between clips
near it (a switch between takes, or air left between clips), and the timing and
pitch rows of those syllables. A marker with no gate finding and no join nearby
points at the render itself; the report names the raw take span to listen to.
Marks from several reviewers (one --marks per export) that fall within CLUSTER_S
become one finding, weighed by each reviewer's level: how sure we are that
something is audible there, and, separately, what it is.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

SCHEMA = "ai-jam-sessions/review-marks/v1"
TEMPLATE = os.path.join(HERE, "review_marks.html")
PEAKS = 1600            # overview waveform buckets
BEFORE = 1.0            # a marker looks back this far: the press comes after the sound
AFTER = 0.2             # and a little forward, for an early press
JOIN_NEAR = 0.25        # a join this close to a syllable in the window counts as near it
AIR_MS = 15.0           # silence between two clips longer than this is a gap a listener can hear
SHIFT_MS = 30.0         # neighbours moved this differently: the join replays or skips audio
STRETCH = (0.67, 1.5)   # warp placement: a stretch outside this may be heard as smeared or rushed
CATEGORIES = ["stutter", "click", "word", "pitch", "timing", "level", "tone", "noise", "other"]
CLUSTER_S = 1.0         # marks by different reviewers this close together are one finding

# Who is listening decides how much a mark settles, and it settles two different
# things (the Director, 2026-10-07): WHERE something sounds off, and WHAT it is.
# Anyone in the audience is an authority on the first; naming the cause takes
# training. A listener's mark therefore counts fully as detection and little as
# diagnosis. An AI listener earns its weights by validation against people, so
# until it has one it counts for little on both.
LEVELS = {
    "listener": {"label": "Listener (no music training)", "detect": 1.0, "diagnose": 0.25},
    "musician": {"label": "Musician", "detect": 1.0, "diagnose": 0.6},
    "professional": {"label": "Vocal or audio professional", "detect": 1.0, "diagnose": 1.0},
    "model": {"label": "AI listener (unvalidated)", "detect": 0.4, "diagnose": 0.2},
}


def take_name(key: str) -> str:
    """The take folder (take-07) from a source path, on any platform."""
    return os.path.basename(os.path.dirname(key.replace("\\", "/"))) or key


def load(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def syllables(plan: dict) -> list[dict]:
    """The placed clips in time order, one per syllable."""
    out = []
    for c in sorted(plan["cuts"], key=lambda c: c["placed_start"]):
        out.append({"id": c["id"], "lyric": c.get("lyric", ""), "word": c.get("word", ""), "take": take_name(c["source_key"]),
                    "start": round(c["placed_start"], 4), "end": round(c["placed_end"], 4),
                    "src_start": round(c["cut_start"], 4), "src_end": round(c["cut_end"], 4)})
    return out


def joins(syl: list[dict], gaps: dict[str, float] | None = None, warp: dict[str, dict] | None = None) -> list[dict]:
    """Every boundary between consecutive clips that a listener may hear: a switch
    between takes, air, or neighbours moved by different amounts.

    Placement runs each clip on in its own source until just after the next one
    starts. When the next clip was moved later than this one (shift_diff_ms > 0),
    that run-on already holds the next syllable's start, which then plays again:
    "Gr-grace". Moved earlier, the difference is skipped. The Director's first marks
    (2026-10-07) named exactly these sounds at exactly these joins.

    Air is what placement left (placed.json `joins[].gap_ms`, the silence after a
    clip once it has been extended toward the next): the plan's own spans leave
    out that extension and overstate it."""
    gaps = gaps or {}
    out = []
    # Warp placement (placed.json mode local-warp) plays a run of one take as one
    # stretched piece: a join inside a run neither replays nor skips, but a
    # stretch far from 1 may be heard.
    warp = warp or {}
    for a, b in zip(syl, syl[1:]):
        air_ms = float(gaps.get(a["id"], 0.0))
        switch = a["take"] != b["take"]
        shift_diff = round(((b["start"] - b["src_start"]) - (a["start"] - a["src_start"])) * 1000.0)
        wa, wb = warp.get(a["id"]), warp.get(b["id"])
        stretch = None
        if wa and wb and wa["run"] == wb["run"]:
            shift_diff = 0                                           # one continuous piece: nothing replayed or skipped
            st = wa.get("stretch")
            stretch = st if st is not None and not STRETCH[0] <= st <= STRETCH[1] else None
        elif wa and wb and air_ms > 0:
            shift_diff = 0                                           # separate runs with silence between: nothing overlaps
        if switch or air_ms > AIR_MS or abs(shift_diff) > SHIFT_MS or stretch is not None:
            out.append({"t": b["start"], "after": a["id"], "before": b["id"], "from_take": a["take"], "to_take": b["take"],
                        "switch": switch, "air_ms": air_ms, "shift_diff_ms": shift_diff, "lyric": b["lyric"],
                        "stretch": stretch, "after_lyric": a["lyric"]})
    return out


def peaks(path: str, n: int = PEAKS) -> list[float]:
    import numpy as np
    import soundfile as sf
    x, _sr = sf.read(path, always_2d=True, dtype="float32")
    mono = np.abs(x).max(axis=1)
    if len(mono) == 0:
        return [0.0] * n
    edges = np.linspace(0, len(mono), n + 1).astype(int)
    p = [float(mono[a:max(a + 1, b)].max()) for a, b in zip(edges, edges[1:])]
    top = max(p) or 1.0
    return [round(v / top, 3) for v in p]


def to_flac(src: str, dst: str) -> None:
    """FLAC, not MP3: lossless and without an encoder delay, so page time = plan time."""
    if os.path.isfile(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is needed to build the review page")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-c:a", "flac", dst], check=True)


def entry(run: str, variant: str, out_dir: str) -> dict:
    song = os.path.basename(os.path.normpath(run))
    vdir = os.path.join(run, variant)
    plan = load(os.path.join(vdir, "plan.json"))
    syl = syllables(plan)
    placed = os.path.join(vdir, "placed.json")
    if not os.path.isfile(placed):
        raise SystemExit(f"{placed} is missing: it records the air placement left between clips")
    pinfo = load(placed)
    gaps = {j["id"]: j["gap_ms"] for j in pinfo.get("joins", [])}
    warp = {j["id"]: j for j in pinfo.get("joins", []) if "run" in j} if pinfo.get("mode") == "local-warp" else None
    key = f"{song}:{variant}"
    files = {}
    for kind, name in (("mix", "mix-local.wav"), ("vocal", "placed-local.wav")):
        src = os.path.join(vdir, name)
        if not os.path.isfile(src):
            raise SystemExit(f"{src} is missing: run the pick and the local mix first")
        dst = f"{song}-{variant}-{kind}.flac"
        to_flac(src, os.path.join(out_dir, dst))
        files[kind] = dst
    phrases = [{"start": p["start"], "end": p["end"], "take": p.get("take")} for p in plan.get("phrases", [])]
    return {"key": key, "song": song, "variant": variant, "dir": os.path.abspath(vdir).replace("\\", "/"),
            "duration": plan["total_seconds"], "files": files, "peaks": peaks(os.path.join(vdir, "placed-local.wav")),
            "syllables": syl, "joins": joins(syl, gaps, warp), "phrases": phrases,
            "placement": pinfo.get("mode", "local")}


def cmd_page(a) -> int:
    if len(a.run) == 0:
        raise SystemExit("give at least one --run")
    os.makedirs(a.out, exist_ok=True)
    entries = [entry(run, v, a.out) for run in a.run for v in a.variant]
    data = {"schema": SCHEMA, "categories": CATEGORIES, "levels": {k: v["label"] for k, v in LEVELS.items()}, "before": BEFORE, "after": AFTER, "entries": entries}
    with open(os.path.join(a.out, "review.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    html = open(TEMPLATE, encoding="utf-8").read().replace("__DATA__", json.dumps(data))
    with open(os.path.join(a.out, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)
    for e in entries:
        n = sum(1 for j in e["joins"] if j["switch"])
        st = sum(1 for j in e["joins"] if j.get("stretch") is not None)
        rp = sum(1 for j in e["joins"] if not j["switch"] and j["shift_diff_ms"] > SHIFT_MS)
        sk = sum(1 for j in e["joins"] if not j["switch"] and j["shift_diff_ms"] < -SHIFT_MS)
        air = sum(1 for j in e["joins"] if not j["switch"] and j["air_ms"] > AIR_MS)
        print(f"{e['key']}: {len(e['syllables'])} syllables, {n} take switches; inside takes {rp} joins replay, {sk} skip, {air} leave air" + (f"; {st} stretch outside {STRETCH[0]}-{STRETCH[1]}" if e["placement"] == "local-warp" else ""))
    print(f"page -> {os.path.join(a.out, 'index.html')}  (serve the folder; marks live in the browser)")
    return 0


def gate_rows(vdir: str) -> tuple[dict, dict]:
    """Timing rows by syllable id and pitch rows by note id (v12, v12.1) from the variant's receipts."""
    timing, pitch = {}, {}
    rp = os.path.join(vdir, "receipt.json")
    if os.path.isfile(rp):
        timing = {r["id"]: r for r in load(rp).get("table", [])}
    pp = os.path.join(vdir, "pitch.json")
    if os.path.isfile(pp):
        for r in load(pp).get("rows", []):
            pitch.setdefault(r["id"].split(".")[0], []).append(r)
    return timing, pitch


def explain(mark: dict, e: dict, timing: dict, pitch: dict) -> dict:
    """What the plan and the gates know about the second before a marker."""
    t = float(mark["t"])
    lo, hi = t - BEFORE, t + AFTER
    near = [s for s in e["syllables"] if s["end"] > lo and s["start"] < hi]
    rows = []
    for s in near:
        tr = timing.get(s["id"], {})
        notes = pitch.get(s["id"], [])
        rows.append({**s, "err_ms": tr.get("err_ms"), "aligner_err_ms": tr.get("aligner_err_ms"), "cross_check": tr.get("cross_check"),
                     "timing_pass": tr.get("pass"),
                     "pitch": [{"id": r["id"], "status": r["status"], "cents": r.get("cents_mean")} for r in notes]})
    js = [dict(j, ms_before_press=round((t - j["t"]) * 1000.0)) for j in e["joins"] if lo - JOIN_NEAR <= j["t"] <= hi + JOIN_NEAR]
    findings = []
    for j in js:
        what = f"switch {j['from_take']} -> {j['to_take']}" if j["switch"] else f"join inside {j['from_take']}"
        d = j.get("shift_diff_ms", 0)
        if not j["switch"] and d > SHIFT_MS:
            what += f" replays {d} ms of '{j.get('lyric', '')}'s start"
        elif not j["switch"] and d < -SHIFT_MS:
            what += f" skips {-d} ms before '{j.get('lyric', '')}'"
        if j.get("stretch") is not None:
            what += f" stretches '{j.get('after_lyric', '')}' x{j['stretch']}"
        if j["air_ms"] > AIR_MS:
            what += f" with {j['air_ms']:.0f} ms of air"
        findings.append(f"{what} at {j['t']:.2f} s ({j['ms_before_press']} ms before the press)")
    for r in rows:
        if r["timing_pass"] is False:
            findings.append(f"'{r['lyric']}' ({r['id']}) timing {r['err_ms']} ms, aligner {r['aligner_err_ms']} ms ({r['cross_check']})")
        for p in r["pitch"]:
            if p["status"] not in ("PASS", "WARN"):
                findings.append(f"'{r['lyric']}' ({p['id']}) pitch {p['status']} {p['cents']} c")
    listen = None
    if not findings and near:
        # nothing the plan or the gates can see: the sound is in the render itself
        by_take: dict[str, list[dict]] = {}
        for s in near:
            by_take.setdefault(s["take"], []).append(s)
        listen = [{"take": k, "from": round(min(s["src_start"] for s in v), 2), "to": round(max(s["src_end"] for s in v), 2)}
                  for k, v in by_take.items()]
    return {"t": t, "categories": mark.get("cats", []), "note": mark.get("note", ""), "window": [round(lo, 2), round(hi, 2)],
            "syllables": rows, "joins": js, "findings": findings, "listen_raw": listen,
            "suspect": "join" if js else ("gate" if findings else ("render" if near else "silence"))}


def marks_by_entry(marks: dict) -> dict:
    """Accepts the page's export ({schema, entries: {key: {marks}}}) or its raw localStorage value ({key: [marks]})."""
    if "entries" in marks:
        return {k: v.get("marks", []) for k, v in marks["entries"].items()}
    return {k: v for k, v in marks.items() if isinstance(v, list)}


def level_of(mark: dict) -> dict:
    """The mark's reviewer level; a mark without one is treated as a listener's."""
    lv = (mark.get("by") or {}).get("level", "listener")
    return LEVELS.get(lv, LEVELS["listener"])


def cluster(marks: list[dict], gap: float = CLUSTER_S) -> list[list[dict]]:
    """Marks in time order, grouped while each is within `gap` of the previous one."""
    out: list[list[dict]] = []
    for m in sorted(marks, key=lambda m: float(m["t"])):
        if out and float(m["t"]) - float(out[-1][-1]["t"]) <= gap:
            out[-1].append(m)
        else:
            out.append([m])
    return out


def weigh(group: list[dict]) -> dict:
    """How sure the group makes us that something is audible here (noisy-or of each
    reviewer's detection weight, one vote per reviewer), and what it is (categories
    voted with diagnosis weights)."""
    best: dict[str, dict] = {}
    for m in group:
        who = (m.get("by") or {}).get("name") or "?"
        if who not in best or level_of(m)["detect"] > level_of(best[who])["detect"]:
            best[who] = m
    miss = 1.0
    for m in best.values():
        miss *= 1.0 - level_of(m)["detect"]
    votes: dict[str, float] = {}
    for m in group:
        for c in m.get("cats", []):
            votes[c] = round(votes.get(c, 0.0) + level_of(m)["diagnose"], 3)
    by = sorted({f"{(m.get('by') or {}).get('name') or '?'} ({(m.get('by') or {}).get('level', 'listener')})" for m in group})
    return {"heard": round(1.0 - miss, 3), "reviewers": by, "categories": dict(sorted(votes.items(), key=lambda kv: -kv[1]))}


def cmd_report(a) -> int:
    data = load(os.path.join(a.review, "review.json"))
    by_key = {e["key"]: e for e in data["entries"]}
    marks: dict[str, list] = {}
    for path in a.marks:
        for k, ms in marks_by_entry(load(path)).items():
            marks.setdefault(k, []).extend(ms)
    out = {"schema": SCHEMA + "#report", "entries": {}}
    lines = []
    for key, ms in marks.items():
        if not ms:
            continue
        if key not in by_key:
            print(f"skipping marks for {key}: not on this page", file=sys.stderr)
            continue
        e = by_key[key]
        timing, pitch = gate_rows(e["dir"])
        rep = []
        for group in cluster(ms):
            t = sum(float(m["t"]) for m in group) / len(group)
            r = explain({"t": round(t, 3), "cats": sorted({c for m in group for c in m.get("cats", [])}),
                         "note": " | ".join(m["note"] for m in group if m.get("note"))}, e, timing, pitch)
            r.update(weigh(group), marks=len(group))
            rep.append(r)
        out["entries"][key] = rep
        counts = {}
        for r in rep:
            counts[r["suspect"]] = counts.get(r["suspect"], 0) + 1
        lines.append(f"## {key}: {len(rep)} findings from {len(ms)} marks ({', '.join(f'{v} {k}' for k, v in sorted(counts.items()))})")
        for r in rep:
            words = " ".join(f"{s['lyric']}[{s['take'].replace('take-', 't')}]" for s in r["syllables"])
            tag = ", ".join(f"{k} {v}" for k, v in r["categories"].items()) or "-"
            lines.append(f"- {r['t']:7.2f} s  heard {r['heard']} by {'; '.join(r['reviewers'])}  [{tag}]  \"{r['note']}\"  | {words}")
            for f in r["findings"]:
                lines.append(f"    - {f}")
            for l in r["listen_raw"] or []:
                lines.append(f"    - nothing the gates saw: listen to {l['take']} {l['from']}-{l['to']} s")
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=1)
    print("\n".join(lines) if lines else "no marks")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("page", help="build the review page")
    s.add_argument("--run", action="append", default=[], help="a song's run folder (repeatable)")
    s.add_argument("--variant", action="append", default=[], help="a pick folder inside each run, e.g. phrase16 (repeatable)")
    s.add_argument("--out", required=True)
    s.set_defaults(fn=cmd_page)
    s = sub.add_parser("report", help="join exported marks to the plan and the gates")
    s.add_argument("--review", required=True, help="the folder page wrote (holds review.json)")
    s.add_argument("--marks", required=True, action="append", help="the page's export, or its raw localStorage value (repeatable: one per reviewer)")
    s.add_argument("--out", help="write the full report as JSON too")
    s.set_defaults(fn=cmd_report)
    a = ap.parse_args(argv)
    if a.cmd == "page" and not a.variant:
        a.variant = ["phrase16"]
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
