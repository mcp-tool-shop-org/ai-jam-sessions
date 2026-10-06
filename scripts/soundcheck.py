#!/usr/bin/env python3
"""Vocal sound check: a timing footprint for one voice, taken before the song.

The same voice, backend and prompt sing a short calibration phrase several times
at the SONG's tempo, before the song is rendered. Every syllable's vowel onset is
dated with the gate's own instrument (vocal_clock.measure_events), so the sound
check measures exactly what the 40 ms gate will later judge. It reports:

  * bias and scatter per consonant group (none / stop / fricative / sonorant);
  * whether a group's lead is consistent enough to correct (most will not be:
    SoulX placement is random between renders, docs/vocal-clock.md);
  * short-note vs held-note risk at the song's tempo;
  * how many takes the song needs so EVERY syllable has at least one the word
    picker can use;
  * the onset detector's real error, against vowel onsets marked by hand.

What "usable" means comes from the picker itself (vocal_clock.repin_words). It
MOVES each word clip so its vowel lands on the clock, so a take's raw offset is
not what fails the gate; a syllable is usable when its vowel can be dated, and
preferred when the onset is clear (a dip of DIP_CLEAR_DB or more before it). The
raw offsets are still reported: they are the consonant lead and the size of the
shift placement has to make.

The detector measurement exists because the word picker selects takes with the same
detector the gate then grades with. Without an independent reference the gate
partly checks the detector against itself; the hand-marked calibration phrase
is that reference (docs/vocal-soundcheck.md, finding 5).

    python scripts/soundcheck.py clock  --song scores/america-the-beautiful.score-clock.v1.json --out tmp/soundcheck/america/clock.json
    python scripts/soundcheck.py render --clock tmp/soundcheck/america/clock.json --takes 3 --out-dir tmp/soundcheck/america \\
        --prompt-wav E:/AI/SoulX-Singer/example/audio/en_prompt.mp3 --prompt-meta E:/AI/SoulX-Singer/example/audio/en_prompt.json
    python scripts/soundcheck.py analyze --clock tmp/soundcheck/america/clock.json --takes tmp/soundcheck/america/take-*/take-48k.wav \\
        --song scores/america-the-beautiful.score-clock.v1.json --receipt tmp/soundcheck/america/soundcheck.json
    python scripts/soundcheck.py label-page --clock tmp/soundcheck/america/clock.json --takes tmp/soundcheck/america/take-*/take-48k.wav \\
        --out tmp/soundcheck/america/label.html
    python scripts/soundcheck.py detector-error --clock tmp/soundcheck/america/clock.json --takes tmp/soundcheck/america/take-*/take-48k.wav \\
        --labels soundcheck-labels.json --receipt tmp/soundcheck/america/detector-error.json

`render` runs the SoulX venv's python (SOULX_PYTHON, else E:/AI/SoulX-Singer/.venv)
on the local GPU. Everything else is numpy and the standard library.
"""
from __future__ import annotations

import argparse
import base64
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

def take_errors(clock: dict, path: str) -> list[dict]:
    """Each syllable's vowel-onset error in ms (detected minus score), dated by the gate's own instrument."""
    mono, sr, _ = vc.read_audio(path)
    if sr != int(clock["sample_rate"]):
        raise SystemExit(f"{path} is {sr} Hz, the clock is {clock['sample_rate']} Hz")
    rows = vc.measure_events(clock, mono, sr)
    by_id = {e["id"]: e for e in clock["events"]}
    out = []
    for r in rows:
        ev = by_id[r["id"]]
        err = None if r["t_vowel"] is None else (float(r["t_vowel"]) - float(r["t_score"])) * 1000.0
        dip = r.get("dip_db")
        out.append({"id": r["id"], "word": ev["word"], "group": ev["group"], "length": ev["length"],
                    "t_score": r["t_score"], "t_vowel": r["t_vowel"], "error_ms": err, "reason": r["reason"],
                    "dip_db": dip, "dated": r["t_vowel"] is not None,
                    "clear": r["t_vowel"] is not None and dip is not None and float(dip) >= vc.DIP_CLEAR_DB})
    return out


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
    """Bias and scatter per consonant group, pooled over takes, plus per-take means
    so 'consistent across renders' is checked, not assumed."""
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
    # the picker can place it: the vowel was dated (vocal_clock.repin_words)
    "dated": lambda r: r["dated"],
    # ...and the picker prefers it: a clear onset
    "clear": lambda r: r["clear"],
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
    """Takes so that every one of `syllables` has at least one take within the gate,
    with probability >= confidence. Union bound: each syllable may fail with at most
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


def analyze(clock: dict, take_paths: list[str], song: dict | None, confidence: float = 0.95) -> dict:
    takes = [take_errors(clock, p) for p in take_paths]
    prof = (clock.get("soundcheck") or {}).get("profile") or (song_profile(song) if song else None)
    held, short = hit_rate(takes, "held"), hit_rate(takes, "short")
    plan = plans = None
    if prof:
        plans = {b: plan_takes(takes, prof, b, confidence) for b in BASES}
        # The picker's own rule decides: a dated vowel is placeable.
        plan = plans["dated"]
    shifts = [abs(r["error_ms"]) for t in takes for r in t if r["error_ms"] is not None]
    return {
        "schema": SCHEMA,
        "clock": clock.get("_path"),
        "takes": [{"path": p.replace("\\", "/"), "sha256": vc.sha256(p)} for p in take_paths],
        "gate_ms": GATE_MS,
        "groups": group_footprint(takes),
        "length_risk": {"held": held, "short": short},
        "plan": plan,
        "plans": plans,
        # how far placement has to move a clip to put its vowel on the clock
        "shift_ms": _stats(shifts),
        "rows": takes,
        "detector": vc.detector_info(),
    }


# ─── Detector error against hand marks ─────────────────────────────────────

def detector_error(clock: dict, take_paths: list[str], labels: dict) -> dict:
    """The onset detector against vowel onsets marked by ear. labels:
    {"takes": {"<take path basename or index>": {"<event id>": seconds | null}}}.
    A null mark means 'could not tell' and is left out."""
    rows, skipped = [], 0
    marks_by_take = labels.get("takes", {})
    for i, path in enumerate(take_paths):
        key_candidates = [str(i), os.path.basename(os.path.dirname(path)), os.path.basename(path), path.replace("\\", "/")]
        marks = next((marks_by_take[k] for k in key_candidates if k in marks_by_take), None)
        if marks is None:
            continue
        for r in take_errors(clock, path):
            hand = marks.get(r["id"])
            if hand is None or r["t_vowel"] is None:
                skipped += 1
                continue
            rows.append({"take": i, "id": r["id"], "word": r["word"], "group": r["group"],
                         "detector_minus_hand_ms": round((float(r["t_vowel"]) - float(hand)) * 1000.0, 2),
                         "hand_minus_score_ms": round((float(hand) - float(r["t_score"])) * 1000.0, 2)})
    if not rows:
        raise SystemExit("no take had both a hand mark and a detected onset: check the labels file's take keys")
    diffs = [r["detector_minus_hand_ms"] for r in rows]
    s = _stats(diffs)
    margin = abs(s["mean_ms"]) + 2 * s["sd_ms"]
    return {
        "schema": SCHEMA + "#detector-error",
        "compared": len(rows), "skipped": skipped,
        "detector_minus_hand": s,
        "within_10_ms": sum(1 for d in diffs if abs(d) <= 10),
        "within_20_ms": sum(1 for d in diffs if abs(d) <= 20),
        "per_group": {g: _stats([r["detector_minus_hand_ms"] for r in rows if r["group"] == g]) for g in GROUPS},
        # What the 40 ms gate can promise about the TRUE onset, given how far the
        # detector strays from the ear (bias plus two spreads).
        "effective_gate_ms": round(GATE_MS - margin, 1),
        "rows": rows,
        "detector": vc.detector_info(),
    }


# ─── Hand-labelling page ───────────────────────────────────────────────────

LABEL_PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sound check labels</title>
<style>
:root{--bg:#fbfaf7;--fg:#1f2328;--muted:#646b73;--line:#d9d6cf;--accent:#2f6fde;--mark:#d4472f;--panel:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#141619;--fg:#e8e6e3;--muted:#9aa1a9;--line:#2c3036;--accent:#6d9cf0;--mark:#f0745f;--panel:#1c1f23}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:16px}h1{font-size:20px;margin:0 0 4px}p{margin:6px 0;color:var(--muted)}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}
button,select{font:inherit;padding:6px 12px;border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:6px;cursor:pointer}
button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
canvas{width:100%;height:auto;display:block;background:var(--panel);border:1px solid var(--line);border-radius:6px;cursor:crosshair}
.word{font-size:28px;font-weight:600}.status{font-variant-numeric:tabular-nums}
kbd{border:1px solid var(--line);border-radius:4px;padding:0 5px;font-size:13px}
</style></head><body><main>
<h1>Sound check: mark each vowel onset</h1>
<p>Click where the <b>vowel</b> starts: not the consonant, the moment the vowel sounds. The detector's answer and the score time are hidden on purpose, so they cannot pull your ear.
Marks save in this browser as you go; <b>Download labels</b> writes the file the analysis reads.</p>
<div class="bar"><select id="take"></select><span class="word" id="word"></span><span class="status" id="status"></span></div>
<canvas id="spec" width="940" height="260"></canvas>
<canvas id="wave" width="940" height="90" style="margin-top:6px"></canvas>
<div class="bar">
<button id="play">Play window</button><button id="playmark">Play from mark</button>
<button id="prev">◀ Previous</button><button id="next" class="primary">Next ▶</button>
<button id="cant">Can't tell</button><button id="dl">Download labels</button>
</div>
<p><kbd>Space</kbd> play window · <kbd>M</kbd> play from mark · <kbd>←</kbd>/<kbd>→</kbd> nudge 2 ms (<kbd>Shift</kbd> 10 ms) · <kbd>Enter</kbd> next</p>
</main><script>
const DATA = __DATA__;
const PRE = 0.25, POST = 0.35;
let ctx = null, buffers = {}, take = 0, idx = 0, playing = null;
const KEY = "soundcheck-labels:" + DATA.clock_id;
let labels = {}; try { labels = JSON.parse(localStorage.getItem(KEY) || "{}") } catch (e) { labels = {} }
function save(){ try { localStorage.setItem(KEY, JSON.stringify(labels)) } catch (e) {} }
const sel = document.getElementById("take");
DATA.takes.forEach((t,i) => { const o = document.createElement("option"); o.value = i; o.textContent = "Take " + (i+1); sel.appendChild(o) });
async function decode(i){
  if (buffers[i]) return buffers[i];
  ctx = ctx || new AudioContext();
  const bytes = Uint8Array.from(atob(DATA.takes[i].wav_b64), c => c.charCodeAt(0));
  buffers[i] = await ctx.decodeAudioData(bytes.buffer);
  return buffers[i];
}
function windowOf(){ const ev = DATA.events[idx]; return [Math.max(0, ev.t_sec - PRE), ev.t_sec + POST] }
function mark(){ return ((labels[take] || {})[DATA.events[idx].id]) }
function setMark(v){ (labels[take] = labels[take] || {})[DATA.events[idx].id] = v; save(); draw() }
function fft(re, im){ const n = re.length; for (let i=1,j=0;i<n;i++){ let b=n>>1; for(;j&b;b>>=1) j^=b; j^=b; if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]} }
  for (let len=2;len<=n;len<<=1){ const a=-2*Math.PI/len; for(let i=0;i<n;i+=len){ for(let k=0;k<len/2;k++){ const c=Math.cos(a*k), s=Math.sin(a*k);
    const ur=re[i+k], ui=im[i+k], vr=re[i+k+len/2]*c-im[i+k+len/2]*s, vi=re[i+k+len/2]*s+im[i+k+len/2]*c;
    re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi } } } }
async function draw(){
  const buf = await decode(take), sr = buf.sampleRate, data = buf.getChannelData(0);
  const [a, b] = windowOf(), s0 = Math.floor(a*sr), s1 = Math.min(data.length, Math.floor(b*sr));
  const spec = document.getElementById("spec"), g = spec.getContext("2d"), W = spec.width, H = spec.height;
  const N = 1024, hop = Math.max(1, Math.floor((s1 - s0 - N) / W)), img = g.createImageData(W, H);
  const dark = matchMedia("(prefers-color-scheme: dark)").matches, maxHz = 6000, bins = Math.floor(maxHz / (sr / N));
  for (let x=0;x<W;x++){ const st = s0 + x*hop, re = new Float64Array(N), im = new Float64Array(N);
    for (let i=0;i<N;i++){ const v = data[st+i] || 0; re[i] = v * (0.5 - 0.5*Math.cos(2*Math.PI*i/(N-1))) } fft(re, im);
    for (let y=0;y<H;y++){ const k = Math.floor((1 - y/H) * bins), m = Math.hypot(re[k], im[k]);
      const v = Math.max(0, Math.min(1, (20*Math.log10(m + 1e-9) + 40) / 60)), c = dark ? v*255 : 255 - v*255, p = (y*W + x)*4;
      img.data[p] = c; img.data[p+1] = c; img.data[p+2] = dark ? Math.min(255, c+20) : c; img.data[p+3] = 255 } }
  g.putImageData(img, 0, 0);
  const wave = document.getElementById("wave"), w = wave.getContext("2d"); w.clearRect(0,0,wave.width,wave.height);
  w.strokeStyle = getComputedStyle(document.body).color; w.beginPath();
  for (let x=0;x<wave.width;x++){ let mx = 0; const st = s0 + Math.floor(x*(s1-s0)/wave.width), en = s0 + Math.floor((x+1)*(s1-s0)/wave.width);
    for (let i=st;i<en;i++) mx = Math.max(mx, Math.abs(data[i]||0)); w.moveTo(x, wave.height/2 - mx*wave.height/2); w.lineTo(x, wave.height/2 + mx*wave.height/2) } w.stroke();
  const m = mark();
  if (typeof m === "number") for (const [cv, c2] of [[spec, g], [wave, w]]){ const x = (m - a) / (b - a) * cv.width;
    c2.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--mark"); c2.lineWidth = 2; c2.beginPath(); c2.moveTo(x,0); c2.lineTo(x,cv.height); c2.stroke(); c2.lineWidth = 1 }
  document.getElementById("word").textContent = "“" + DATA.events[idx].word + "”";
  const done = DATA.events.filter(e => (labels[take]||{})[e.id] !== undefined).length;
  document.getElementById("status").textContent = `syllable ${idx+1}/${DATA.events.length} · marked ${done}/${DATA.events.length}` + (m === null ? " · can't tell" : "");
}
async function play(from){ const buf = await decode(take); if (playing) try { playing.stop() } catch(e){}
  const [a, b] = windowOf(), src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(0, from ?? a, b - (from ?? a)); playing = src }
function onClick(ev){ const cv = ev.currentTarget, r = cv.getBoundingClientRect(), [a, b] = windowOf();
  setMark(+(a + (ev.clientX - r.left) / r.width * (b - a)).toFixed(4)) }
document.getElementById("spec").onclick = onClick; document.getElementById("wave").onclick = onClick;
sel.onchange = () => { take = +sel.value; idx = 0; draw() };
document.getElementById("play").onclick = () => play();
document.getElementById("playmark").onclick = () => { const m = mark(); if (typeof m === "number") play(Math.max(0, m - 0.03)) };
document.getElementById("next").onclick = () => { idx = Math.min(DATA.events.length-1, idx+1); draw() };
document.getElementById("prev").onclick = () => { idx = Math.max(0, idx-1); draw() };
document.getElementById("cant").onclick = () => setMark(null);
document.getElementById("dl").onclick = () => { const out = {schema: "ai-jam-sessions/soundcheck/v1#labels", clock_id: DATA.clock_id, takes: {}};
  DATA.takes.forEach((t,i) => out.takes[t.key] = labels[i] || {});
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], {type: "application/json"}));
  a.download = "soundcheck-labels.json"; a.click() };
addEventListener("keydown", e => { if (e.target.tagName === "SELECT") return;
  if (e.key === " ") { e.preventDefault(); play() } else if (e.key === "m" || e.key === "M") document.getElementById("playmark").click();
  else if (e.key === "Enter") document.getElementById("next").click();
  else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { const m = mark(); if (typeof m === "number") { e.preventDefault();
    setMark(+(m + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 0.010 : 0.002)).toFixed(4)) } } });
draw();
</script></body></html>
"""


def label_page(clock: dict, take_paths: list[str]) -> str:
    """One self-contained HTML file: the takes are embedded, so it opens straight
    from disk. Nothing the detector found is in it."""
    takes = []
    for p in take_paths:
        with open(p, "rb") as fh:
            takes.append({"key": os.path.basename(os.path.dirname(p)) or os.path.basename(p),
                          "wav_b64": base64.b64encode(fh.read()).decode("ascii")})
    data = {"clock_id": clock.get("song_id"),
            "events": [{"id": e["id"], "word": e["word"], "t_sec": e["t_sec"]} for e in clock["events"]],
            "takes": takes}
    return LABEL_PAGE.replace("__DATA__", json.dumps(data))


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
    print(f"Sound check over {len(r['takes'])} take(s), gate ±{r['gate_ms']:.0f} ms")
    print(f"{'group':<10} {'dated':>6} {'clear':>6} {'mean':>8} {'sd':>7} {'raw in gate':>12}  correction")
    for g, s in r["groups"].items():
        mean = "-" if s["mean_ms"] is None else f"{s['mean_ms']:+.1f}"
        sd = "-" if s["sd_ms"] is None else f"{s['sd_ms']:.1f}"
        corr = f"{s['correction_ms']:+.1f} ms" if s["correction_ms"] is not None else s["why"]
        print(f"{g:<10} {s['dated']:>3}/{s['syllables']:<2} {s['clear']:>3}/{s['syllables']:<2} {mean:>8} {sd:>7} "
              f"{s['within_gate']:>8}/{s['syllables']:<3}  {corr}")
    for k, v in r["length_risk"].items():
        print(f"{k:<6} notes: {v['hits']}/{v['n']} dated (smoothed p = {v['p']:.3f})")
    sh = r["shift_ms"]
    if sh["n"]:
        print(f"Placement shift: mean {sh['mean_ms']:.0f} ms, max {sh['max_abs_ms']:.0f} ms")
    if r["plans"]:
        p = r["plans"]
        print(f"Takes needed for {p['dated']['song_syllables']} syllables at {p['dated']['confidence']:.0%} confidence: "
              f"{p['dated']['takes_needed']} (picker can place: vowel dated); {p['clear']['takes_needed']} for clear onsets; "
              f"{p['raw_in_gate']['takes_needed']} without placement")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("clock"); s.add_argument("--song", required=True); s.add_argument("--out", required=True)
    s = sub.add_parser("render"); s.add_argument("--clock", required=True); s.add_argument("--takes", type=int, default=3)
    s.add_argument("--out-dir", required=True); s.add_argument("--prompt-wav", required=True); s.add_argument("--prompt-meta", required=True)
    s = sub.add_parser("analyze"); s.add_argument("--clock", required=True); s.add_argument("--takes", nargs="+", required=True)
    s.add_argument("--song"); s.add_argument("--confidence", type=float, default=0.95); s.add_argument("--receipt")
    s = sub.add_parser("label-page"); s.add_argument("--clock", required=True); s.add_argument("--takes", nargs="+", required=True); s.add_argument("--out", required=True)
    s = sub.add_parser("detector-error"); s.add_argument("--clock", required=True); s.add_argument("--takes", nargs="+", required=True)
    s.add_argument("--labels", required=True); s.add_argument("--receipt")
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
    if a.cmd == "analyze":
        r = analyze(clock, takes, vc.load_clock(a.song) if a.song else None, a.confidence)
        print_report(r)
        if a.receipt:
            json.dump(r, open(a.receipt, "w", encoding="utf-8"), indent=2)
            print(f"receipt -> {a.receipt}")
        return 0
    if a.cmd == "label-page":
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        open(a.out, "w", encoding="utf-8").write(label_page(clock, takes))
        print(f"label page -> {a.out}")
        return 0
    r = detector_error(clock, takes, json.load(open(a.labels, encoding="utf-8")))
    s = r["detector_minus_hand"]
    print(f"Detector vs hand over {r['compared']} onsets ({r['skipped']} skipped): mean {s['mean_ms']:+.1f} ms, "
          f"sd {s['sd_ms']:.1f} ms, max {s['max_abs_ms']:.1f} ms; within 10 ms {r['within_10_ms']}, within 20 ms {r['within_20_ms']}")
    print(f"The 40 ms gate promises about ±{r['effective_gate_ms']} ms on the true onset.")
    if a.receipt:
        json.dump(r, open(a.receipt, "w", encoding="utf-8"), indent=2)
        print(f"receipt -> {a.receipt}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
