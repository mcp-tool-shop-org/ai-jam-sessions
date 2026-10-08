#!/usr/bin/env python3
"""Vocal timing as a scientific instrument — place a sung take on the score clock.

One JSON clock (scores/<song>.score-clock.v1.json), one receipt, fail closed.

A generator's timestamps are not a clock: Seed Audio fills a window at its
own speech rate and does not pin a vowel to the G4 at 3.200 s. fx-dub paid
for this class of bug (`place_exact` docstring, session 5). So the take is
treated as a BAG OF TAKES: transcribe it, measure each lyric's vowel onset
from energy (Sundberg 2007: the sung tone starts at the vowel, not the
consonant), cut a span per lyric, and `place_exact` every span at the
clock's `t_sec` on a timeline of exactly `total_samples`. Then measure the
cloud ARTIFACT, never the plan, and gate:

  onset_abs_ms   any event |vowel onset - t_sec| > 40 ms      -> FAIL
  order          transcript word order != clock lyric order   -> FAIL
  one_voice      diarization finds > 1 speaker                -> FAIL
  fits_timeline  last speech beyond total_seconds             -> FAIL
  length_match   |vocal_len - bed_len| > 1 sample @ 48 kHz    -> FAIL

Subcommands (run in this order; each writes what the next reads):

  bed-check   measure the rendered bed's piano onsets against the clock
  transcribe  fx-dub `transcribe` graph on a cloud key -> word JSON
  seed-take   a Seed Audio take from the Kokoro lock (speech_rate -50 = held slow)
  plan        words + take -> per-event cut spans and leads (local, free)
  merge       several plans -> one: per event the take that fills its slot best
  repin       a take already near the clock: cut at verify's measured vowels, place on t_sec;
              --candidate take=receipt (repeat) = word-level bag of takes, cuts only between words
  place       one Comfy job: TrimAudioDuration + place_exact shapes + AudioMix
  verify      gate the downloaded placed stem (energy + transcript + lengths)
  pitch       score MIDI vs measured F0 at each vowel nucleus (fail >50 c, warn >25 c)
  mix         upload the bed, fx-dub `mix_dialogue_anchored`, download

Graph builders come from E:/AI/fx-dub/tools/vo_graphs.py (FXDUB_TOOLS env
overrides). Cloud transport: scripts/comfy_rest.py.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, asdict

import numpy as np

SR = 48000
GATE_MS = 40.0
# The vowel band: F1–F2 energy. Nasal murmur (anti-formant zeros above
# ~400 Hz), stop closures and fricatives (energy above 3 kHz) all sit 10–20 dB
# below the vowel here, so a vowel onset is an energy RISE in this band even
# when the wide-band envelope is flat through "ma", "me", "saved a".
VOWEL_BAND_HZ = (400.0, 3000.0)
RISE_FRACTION = 0.5          # vowel onset = envelope crosses 50 % (-6 dB) of the syllable peak
ENV_WIN_S = 0.008
ENV_HOP_S = 0.0005
PEAK_BEFORE_S = 0.10         # the syllable peak is searched from this far before the STT word start
SEARCH_BEFORE_S = 0.30       # ...and the rise up to it from this far back (Scribe dated "a" 170 ms late)
SEARCH_AFTER_S = 0.35        # how far after the STT word start the peak may sit
SILENT_BELOW_MAX_DB = 45.0   # a window whose peak sits this far under the take's loudest vowel is silent
SLOPE_MIN_DB = 3.0           # legato fallback: the steepest rise must climb at least this over ±15 ms
CUT_LEAD_IN_S = 0.04         # keep this much before the vowel (the consonant) so the artifact shows the rise
CUT_TAIL_S = 0.06
CLIP_GAP_S = 0.010           # placed clips never overlap; this much air between them
STT_WARN_MS = 60.0           # transcript word start vs clock: cross-check, not the gate
# The singing forced aligner (onset_aligner.py) is the timing gate's second instrument.
# Its onset definition sits a steady ~12-16 ms before the detector's (the phoneme
# boundary vs half-way up the energy rise), so that offset is measured on every run
# from the syllables the detector passes, and removed before the aligner is read.
ALIGNER_MIN_AGREEING = 10
HEADROOM_PEAK = 0.9          # the mix bus sums; bed peak + vocal peak must fit under this (-0.9 dBFS)

FXDUB_TOOLS = os.environ.get("FXDUB_TOOLS", r"E:/AI/fx-dub/tools")


def _vo_graphs():
    if FXDUB_TOOLS not in sys.path:
        sys.path.insert(0, FXDUB_TOOLS)
    import vo_graphs  # noqa: E402
    return vo_graphs


# ─── audio ────────────────────────────────────────────────────────────────────

def read_audio(path: str) -> tuple[np.ndarray, int, int]:
    """(mono float64, sample_rate, frames). Stereo is averaged."""
    import soundfile as sf
    data, sr = sf.read(path, always_2d=True, dtype="float64")
    return data.mean(axis=1), int(sr), int(data.shape[0])


def band_envelope(mono: np.ndarray, sr: int, band=VOWEL_BAND_HZ, win_s=ENV_WIN_S, hop_s=ENV_HOP_S):
    """Zero-phase band-passed RMS envelope. Returns (times, env) with times at
    window centres, so a rise is dated where it happens, not half a window late."""
    from scipy.signal import butter, sosfiltfilt
    if band is not None:
        sos = butter(4, [band[0], band[1]], btype="bandpass", fs=sr, output="sos")
        x = sosfiltfilt(sos, mono)
    else:
        x = mono
    win = max(1, int(round(win_s * sr)))
    hop = max(1, int(round(hop_s * sr)))
    sq = np.concatenate([[0.0], np.cumsum(x * x)])
    starts = np.arange(0, max(1, len(x) - win + 1), hop)
    env = np.sqrt((sq[starts + win] - sq[starts]) / win)
    times = (starts + win / 2) / sr
    return times, env


def rise_onset(times: np.ndarray, env: np.ndarray, lo: float, hi: float, frac=RISE_FRACTION, search_lo: float | None = None) -> dict:
    """Vowel onset = the last upward crossing of frac*peak before the envelope
    peak in [lo, hi], searching back as far as `search_lo` (default lo). A
    previous syllable's decay must DROP below the threshold before a rise
    counts. Linear interpolation between hops.

    Legato fallback (`method: "slope"`): when nothing before the peak sits
    below the threshold (a 5 dB l→aɪ in "like"), the onset is the steepest
    rise of the dB envelope in the 150 ms before the peak, accepted only if
    the envelope climbs SLOPE_MIN_DB across ±15 ms of it. Otherwise `t` is
    None and the caller must say so.

    Silence is relative to the take: `env` is the whole take's envelope, and a
    window whose peak sits SILENT_BELOW_MAX_DB or more under the take's loudest
    point is silent. It used to be silent only at a peak of exactly zero, so
    band-filter ringing or a noise floor was dated as a vowel and a dropped
    syllable could be placed as a clip of nothing. Measured 2026-10-06 on three
    SoulX takes: every real syllable peaked within 6 dB of the take's loudest,
    the phantom at -217 dB, so 45 dB clears both sides by a wide margin."""
    if search_lo is None:
        search_lo = lo
    sel = np.where((times >= lo) & (times <= hi))[0]
    if len(sel) == 0:
        return {"t": None, "peak": 0.0, "reason": "empty-window", "method": None}
    seg = env[sel]
    ip = int(np.argmax(seg))
    peak = float(seg[ip])
    floor = float(env.max()) * 10 ** (-SILENT_BELOW_MAX_DB / 20)
    if peak <= floor:
        return {"t": None, "peak": peak, "reason": "silent", "method": None}
    t_peak = float(times[sel[ip]])
    thr = frac * peak
    back = np.where((times >= search_lo) & (times <= t_peak))[0]
    segb = env[back]
    below = np.where(segb[:-1] < thr)[0]
    if len(below) > 0:
        k = int(below[-1])
        t0, t1 = times[back[k]], times[back[k + 1]]
        e0, e1 = segb[k], segb[k + 1]
        t = t0 + (thr - e0) / (e1 - e0) * (t1 - t0) if e1 > e0 else t1
        # how deep the dip before this rise is (dB below the peak over the 100 ms
        # before the crossing): a clear consonant/rest reads 15–40 dB, a soft
        # nasal-to-vowel transition a few dB — the picker prefers clear ones
        pre = np.where((times >= t - 0.10) & (times <= t))[0]
        dip_db = float(20 * np.log10(peak / (env[pre].min() + 1e-9))) if len(pre) else 0.0
        return {"t": float(t), "peak": peak, "t_peak": t_peak, "reason": "ok", "method": "rise", "dip_db": round(dip_db, 1)}
    # slope fallback
    win = np.where((times >= max(search_lo, t_peak - 0.15)) & (times <= t_peak))[0]
    if len(win) < 3:
        return {"t": None, "peak": peak, "t_peak": t_peak, "reason": "no-rise-in-window", "method": None}
    db = 20 * np.log10(env + 1e-9)
    hop = float(times[1] - times[0]) if len(times) > 1 else ENV_HOP_S
    step = max(1, int(round(0.015 / hop)))
    best, best_i = -1e9, None
    for i in win:
        a, b = max(0, i - step), min(len(db) - 1, i + step)
        climb = db[b] - db[a]
        if climb > best:
            best, best_i = climb, i
    if best_i is None or best < SLOPE_MIN_DB:
        return {"t": None, "peak": peak, "t_peak": t_peak, "reason": "no-rise-in-window", "method": None}
    return {"t": float(times[best_i]), "peak": peak, "t_peak": t_peak, "reason": "ok", "method": "slope", "climb_db": round(float(best), 1)}


def syllable_nuclei(times, env, lo, hi, n, min_gap_s=0.06) -> list[float]:
    """The n most prominent envelope peaks in [lo, hi], in time order."""
    from scipy.signal import find_peaks
    sel = np.where((times >= lo) & (times <= hi))[0]
    if len(sel) == 0:
        return []
    seg = env[sel]
    hop = float(times[1] - times[0]) if len(times) > 1 else ENV_HOP_S
    peaks, props = find_peaks(seg, distance=max(1, int(min_gap_s / hop)), prominence=0.05 * float(seg.max() or 1))
    if len(peaks) < n:
        return [float(times[sel[p]]) for p in peaks]
    order = np.argsort(props["prominences"])[::-1][:n]
    return sorted(float(times[sel[peaks[i]]]) for i in order)


def valley_between(times, env, a, b) -> float:
    sel = np.where((times >= a) & (times <= b))[0]
    if len(sel) == 0:
        return (a + b) / 2
    return float(times[sel[int(np.argmin(env[sel]))]])


def rms_db(x: np.ndarray) -> float:
    return float(10 * np.log10(np.mean(x * x) + 1e-20))


# ─── transcript ───────────────────────────────────────────────────────────────

def norm_word(text: str) -> str:
    return re.sub(r"[^a-z']", "", text.lower())


def load_words(path: str) -> list[dict]:
    raw = json.load(open(path, encoding="utf-8"))
    if isinstance(raw, str):
        raw = json.loads(raw)
    words = raw if isinstance(raw, list) else raw.get("words", [])
    out = []
    for w in words:
        if not isinstance(w, dict) or w.get("type") not in (None, "word"):
            continue
        text = norm_word(str(w.get("text", "")))
        if not text:
            continue
        out.append({"text": text, "raw": w.get("text"), "start": float(w["start"]), "end": float(w["end"]),
                    "speaker": w.get("speaker_id") or w.get("speaker")})
    return out


def clock_words(clock: dict) -> list[dict]:
    """Distinct transcribable words of the clock, in order, with their events."""
    groups: list[dict] = []
    for ev in clock["events"]:
        if ev["syllable"] == 0:
            groups.append({"word": norm_word(ev["word"]), "events": [ev]})
        else:
            groups[-1]["events"].append(ev)
    return groups


def align_words(groups: list[dict], words: list[dict]) -> dict:
    """Order-preserving alignment of clock words onto transcript words.
    Every clock word must land on exactly one transcript word, in order."""
    a = [g["word"] for g in groups]
    b = [w["text"] for w in words]
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    mapping: dict[int, int] = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                mapping[i1 + k] = j1 + k
    missing = [a[i] for i in range(len(a)) if i not in mapping]
    matched_b = set(mapping.values())
    extra = [b[j] for j in range(len(b)) if j not in matched_b]
    in_order = all(mapping[i] < mapping[i + 1] for i in range(len(a) - 1) if i in mapping and i + 1 in mapping)
    return {"map": mapping, "missing": missing, "extra": extra, "in_order": in_order and not missing}


# ─── plan ─────────────────────────────────────────────────────────────────────

@dataclass
class Cut:
    id: str
    lyric: str
    word: str
    t_sec: float
    source_key: str
    src_word_start: float
    src_word_end: float
    src_vowel_onset: float
    method: str
    cut_start: float
    cut_end: float
    lead: float
    clip_seconds: float
    placed_start: float
    placed_end: float
    note: str


def snap(sec: float, sr: int = SR) -> float:
    return round(sec * sr) / sr


def detector_info() -> dict:
    return {"band_hz": list(VOWEL_BAND_HZ), "rise_fraction": RISE_FRACTION, "env_win_s": ENV_WIN_S, "env_hop_s": ENV_HOP_S,
            "slope_min_db": SLOPE_MIN_DB,
            "principle": "vowel onset = sung tone start (Sundberg 2007); the same detector and per-event method date the source take and the placed artifact"}


class NoOnset(SystemExit):
    pass


def build_plan(clock: dict, words: list[dict], mono: np.ndarray, sr: int, source_key: str = "", strict: bool = True) -> dict:
    """Per event: where its vowel is in the take, what to cut, where it lands.

    The transcript places the WORD (to ~100 ms; Scribe dated "a" 170 ms late
    on the Seed take); the vowel band envelope dates the ONSET. The peak of a
    word is looked for from PEAK_BEFORE_S before its transcript start; the
    rise up to that peak is searched back to the previous word's start, so a
    late transcript boundary cannot hide the true onset."""
    groups = clock_words(clock)
    al = align_words(groups, words)
    if not al["in_order"]:
        raise SystemExit(f"cannot plan: clock words not found in order. missing={al['missing']} extra={al['extra']}")
    times, env = band_envelope(mono, sr)
    take_end = len(mono) / sr
    total = float(clock["total_seconds"])
    cuts: list[Cut] = []
    skipped: list[dict] = []
    for gi, g in enumerate(groups):
        wi = al["map"][gi]
        w = words[wi]
        prev_start = words[wi - 1]["start"] if wi > 0 else 0.0
        next_start = words[wi + 1]["start"] if wi + 1 < len(words) else take_end
        n = len(g["events"])
        peak_lo = max(0.0, w["start"] - PEAK_BEFORE_S, prev_start + 0.05)
        peak_hi = min(w["start"] + SEARCH_AFTER_S, w["end"] + 0.05, next_start - 0.005, take_end)
        search_lo = max(0.0, w["start"] - SEARCH_BEFORE_S, prev_start + 0.05)
        cut_hi = min(w["end"] + CUT_TAIL_S, next_start - 0.005, take_end)
        if n == 1:
            onset = rise_onset(times, env, peak_lo, peak_hi, search_lo=search_lo)
            if onset["t"] is None:
                msg = f"no vowel onset for '{g['word']}' in [{peak_lo:.3f},{peak_hi:.3f}] ({onset['reason']})"
                if strict:
                    raise NoOnset(msg)
                skipped.append({"id": g["events"][0]["id"], "reason": msg})
                continue
            starts = [max(0.0, min(w["start"] - 0.02, onset["t"] - CUT_LEAD_IN_S))]
            ends = [max(cut_hi, onset["t"] + 0.08)]
            onsets = [onset["t"]]
            methods = [onset["method"]]
            climb = f"; climb {onset['climb_db']} dB" if "climb_db" in onset else ""
            notes = [f"{onset['method']}; vowel {((onset['t'] - w['start']) * 1000):+.0f} ms vs STT start{climb}"]
        else:
            nuclei = syllable_nuclei(times, env, max(0.0, w["start"] - 0.05, prev_start + 0.05), min(w["end"] + 0.05, next_start - 0.005), n)
            if len(nuclei) != n:
                msg = f"'{g['word']}' needs {n} syllable nuclei, found {len(nuclei)} at {nuclei}"
                if strict:
                    raise NoOnset(msg)
                skipped.extend({"id": ev["id"], "reason": msg} for ev in g["events"])
                continue
            bounds = [None]
            for i in range(1, n):
                bounds.append(valley_between(times, env, nuclei[i - 1], nuclei[i]))
            bounds.append(cut_hi)
            starts, ends, onsets, methods, notes = [], [], [], [], []
            for i in range(n):
                if i == 0:
                    onset = rise_onset(times, env, peak_lo, nuclei[0] + 0.001, search_lo=search_lo)
                else:
                    onset = rise_onset(times, env, bounds[i], nuclei[i] + 0.001, search_lo=bounds[i])
                if onset["t"] is None:
                    msg = f"no vowel onset for syllable {i + 1} of '{g['word']}' ({onset['reason']})"
                    if strict:
                        raise NoOnset(msg)
                    skipped.extend({"id": ev["id"], "reason": msg} for ev in g["events"])
                    break
                if i == 0:
                    starts.append(max(0.0, min(w["start"] - 0.02, onset["t"] - CUT_LEAD_IN_S)))
                else:
                    starts.append(bounds[i])
                ends.append(bounds[i + 1])
                onsets.append(max(onset["t"], starts[-1]))
                methods.append(onset["method"])
                notes.append(f"syllable {i + 1}/{n} nucleus {nuclei[i]:.3f} {onset['method']}")
            if len(onsets) != n:
                continue
        for i, ev in enumerate(g["events"]):
            cuts.append(Cut(
                id=ev["id"], lyric=ev["lyric"], word=g["word"], t_sec=float(ev["t_sec"]), source_key=source_key,
                src_word_start=w["start"], src_word_end=w["end"], src_vowel_onset=onsets[i], method=methods[i],
                cut_start=starts[i], cut_end=ends[i], lead=0.0, clip_seconds=0.0,
                placed_start=0.0, placed_end=0.0, note=notes[i]))
    # place: vowel onset lands on t_sec; clips never overlap; sample-snapped
    for c in cuts:
        vowel_off = c.src_vowel_onset - c.cut_start
        if vowel_off < 0:
            raise SystemExit(f"{c.id}: vowel onset before cut start")
        c.lead = snap(c.t_sec - vowel_off)
        if c.lead < 0:
            c.cut_start = snap(c.cut_start - c.lead)  # trim the lead-in instead of going negative
            c.lead = 0.0
        c.cut_start = snap(c.cut_start)
        c.cut_end = snap(c.cut_end)
        c.placed_start = c.lead
    for k, c in enumerate(cuts):
        limit = cuts[k + 1].placed_start - CLIP_GAP_S if k + 1 < len(cuts) else total
        max_clip = snap(limit - c.lead)
        clip = snap(c.cut_end - c.cut_start)
        if clip > max_clip:
            clip = max_clip
            c.cut_end = snap(c.cut_start + clip)
            c.note += f"; capped to {clip:.3f}s by next event"
        if clip <= snap(c.src_vowel_onset - c.cut_start) + 0.03:
            raise SystemExit(f"{c.id} '{c.lyric}': clip {clip:.3f}s too short to carry its vowel")
        c.clip_seconds = clip
        c.placed_end = snap(c.lead + clip)
        if c.placed_end > total:
            raise SystemExit(f"{c.id}: placed clip ends at {c.placed_end} > total {total}")
    return {
        "clock": clock.get("_path"),
        "total_seconds": total,
        "total_samples": int(clock["total_samples"]),
        "sample_rate": int(clock["sample_rate"]),
        "alignment": {"missing": al["missing"], "extra": al["extra"]},
        "detector": detector_info(),
        "skipped": skipped,
        "cuts": [asdict(c) for c in cuts],
    }


# ─── repin: a take already near the clock -> cut at measured vowel onsets ─────

REPIN_LEAD_IN_S = 0.12       # keep this much before the measured vowel (the consonant / nasal)


def repin_plan(clock: dict, verify_rows: list[dict], take_seconds: float, source_key: str) -> dict:
    """Plan from `verify`'s measured vowel onsets (t_vowel per event) instead of
    a transcript search. Each syllable is cut REPIN_LEAD_IN_S before its vowel
    (bounded by the previous vowel + 50 ms), runs to the next cut, and lands
    with its vowel on t_sec. Overlaps are trimmed, gaps stay (both ≤ the
    take's own drift)."""
    evs = clock["events"]
    total = float(clock["total_seconds"])
    rows = {r["id"]: r for r in verify_rows}
    onsets = []
    for ev in evs:
        r = rows.get(ev["id"])
        if r is None or r.get("t_vowel") is None:
            raise SystemExit(f"{ev['id']} '{ev['lyric']}': no measured vowel onset to re-pin")
        onsets.append(float(r["t_vowel"]))
    cuts: list[Cut] = []
    for k, ev in enumerate(evs):
        on = onsets[k]
        lo = onsets[k - 1] + 0.05 if k > 0 else 0.0
        cut_start = snap(max(lo, on - REPIN_LEAD_IN_S))
        if k + 1 < len(evs):
            cut_end = snap(max(cut_start + 0.05, min(onsets[k + 1] - REPIN_LEAD_IN_S, take_seconds)))
        else:
            cut_end = snap(min(take_seconds, on + float(ev["dur_sec"])))
        vowel_off = on - cut_start
        lead = snap(float(ev["t_sec"]) - vowel_off)
        if lead < 0:
            cut_start = snap(cut_start - lead); lead = 0.0; vowel_off = on - cut_start
        cuts.append(Cut(id=ev["id"], lyric=ev["lyric"], word=norm_word(ev["word"]), t_sec=float(ev["t_sec"]),
                        source_key=source_key, src_word_start=cut_start, src_word_end=cut_end, src_vowel_onset=on, method=rows[ev["id"]].get("method") or "rise",
                        cut_start=cut_start, cut_end=cut_end, lead=lead, clip_seconds=0.0, placed_start=lead, placed_end=0.0,
                        note=f"repin: take vowel {on:.4f} -> {ev['t_sec']:.4f} ({(ev['t_sec'] - on) * 1000:+.0f} ms)"))
    for k, c in enumerate(cuts):
        limit = cuts[k + 1].placed_start - CLIP_GAP_S if k + 1 < len(cuts) else total
        clip = snap(min(c.cut_end - c.cut_start, limit - c.lead))
        if clip <= snap(c.src_vowel_onset - c.cut_start) + 0.03:
            raise SystemExit(f"{c.id} '{c.lyric}': clip {clip:.3f}s too short to carry its vowel")
        c.clip_seconds = clip
        c.cut_end = snap(c.cut_start + clip)
        c.placed_end = snap(c.lead + clip)
    return {"clock": clock.get("_path"), "total_seconds": total, "total_samples": int(clock["total_samples"]), "sample_rate": int(clock["sample_rate"]),
            "alignment": {"missing": [], "extra": []}, "detector": detector_info(), "skipped": [], "mode": "repin",
            "cuts": [asdict(c) for c in cuts]}


DIP_CLEAR_DB = 12.0          # an onset preceded by at least this much dip is "clear"; the picker prefers clear onsets
WORD_INTERNAL_MAX_MS = 35.0  # a word is usable from a take only if its syllables sit this close to the clock relative to each other


def take_name(key: str) -> str:
    """A take's name as phrase scores record it: its folder (take-07), not its path."""
    return os.path.basename(os.path.dirname(key.replace("\\", "/"))) or key


def rank_phrases(clock: dict, candidates: list[dict], scores: dict | None = None, gap: float = 0.3) -> list[dict]:
    """For each phrase (the clock split at its rests, as onset_aligner.phrase_spans),
    the takes in the order a phrase-by-phrase pick prefers them:

      1. intelligibility: the share of the phrase's words a local transcriber
         heard in order (phrase_scores.py), so a phrase the listener can follow
         beats one with a better onset;
      2. the fewest notes the pitch gate would fail, then the smallest mean
         |cents|: a wrong note stays audible, while timing is moved onto the
         clock afterwards (ranking timing before pitch took the first Amazing
         Grace run from 8 pitch fails to 14);
      3. syllables already within the gate in the raw take, so the phrase needs
         the fewest moves.

    Without scores, timing alone."""
    import onset_aligner
    spans = onset_aligner.phrase_spans(clock, gap)
    takes = (scores or {}).get("takes", {})
    out = []
    for i, (lo, hi, groups) in enumerate(spans):
        ids = [e["id"] for g in groups for e in g]
        ranked = []
        for ci, c in enumerate(candidates):
            tab = {r["id"]: r for r in c["rows"]}
            within = sum(1 for k in ids if tab.get(k, {}).get("t_vowel") is not None
                         and abs(float(tab[k]["t_vowel"]) - float(tab[k]["t_score"])) * 1000.0 <= GATE_MS)
            ph = (takes.get(take_name(c["key"]), {}).get("phrases") or {}).get(str(i)) or {}
            intel = ph.get("intelligibility")
            cents = ph.get("mean_abs_cents")
            fails = ph.get("pitch_fails")
            info = {"take": take_name(c["key"]), "intelligibility": intel, "pitch_fails": fails, "mean_abs_cents": cents,
                    "within_gate": within, "of": len(ids)}
            ranked.append(((-(intel if intel is not None else 0.0), fails if fails is not None else 0,
                            cents if cents is not None else 0.0, -within, ci), ci, info))
        ranked.sort(key=lambda r: r[0])
        out.append({"index": i, "start": round(lo, 3), "end": round(hi, 3), "ids": ids,
                    "ranked": [{"candidate": ci, **info} for _, ci, info in ranked]})
    return out


def repin_words(clock: dict, candidates: list[dict], total_seconds_of: dict[str, float], split_words: bool = False,
                phrases: list[dict] | None = None) -> dict:
    """Word-level bag of takes. A sung word is legato inside (portamento between
    its syllables — measured on SoulX take-01: "A"→"ma" glides Bb3→Eb4 over
    180 ms with no dip), so cutting inside a word breaks the line. Instead,
    for every word pick the take whose syllables are internally on the clock
    (max |e_i − e_0| ≤ WORD_INTERNAL_MAX_MS after re-pinning the first vowel),
    cut the whole word from that take, and join only at word boundaries.

    `candidates`: [{"key": take path, "rows": verify table}]. Returns a plan
    whose `cuts` has one entry per EVENT (so the gate can address every
    syllable) but interior syllables share their word's clip (`word_clip_id`);
    placement places each word clip once.

    `phrases` (rank_phrases): pick by phrase instead. Each phrase takes the first
    take in its ranking that sings every word of the phrase inside the word limit,
    so a phrase is never stitched from several renders: a join between takes, with
    their different tone and level, is what made the word-level pick sound jittery.
    A phrase no single take can sing falls back to the word-level choice, and the
    plan says so."""
    evs = clock["events"]
    total = float(clock["total_seconds"])
    groups: list[list[int]] = []
    for k, ev in enumerate(evs):
        if ev["syllable"] == 0 or split_words:
            groups.append([k])
        else:
            groups[-1].append(k)
    tables = [{r["id"]: r for r in c["rows"]} for c in candidates]

    def word_in(ci: int, g: list[int]):
        """(candidate, internal_ms, e0, score) for word g sung by take ci, or None if undated."""
        tab = tables[ci]
        vow = [tab.get(evs[k]["id"], {}).get("t_vowel") for k in g]
        if any(v is None for v in vow):
            return None
        errs = [float(v) - float(evs[k]["t_sec"]) for v, k in zip(vow, g)]
        internal = max(abs(e - errs[0]) for e in errs) * 1000.0
        # tightest inside the word first; among equals, the take that needs the
        # smallest shift (least splicing), then the earlier take
        dips = [tab[evs[k]["id"]].get("dip_db") for k in g]
        clarity = min((d if d is not None else 0.0) for d in dips)      # weakest onset in the word
        return (ci, internal, errs[0], (round(internal, 1), -min(clarity, DIP_CLEAR_DB), round(abs(errs[0]) * 1000, 1)))

    forced: dict[int, tuple] = {}      # group index -> word_in() of the phrase's take
    phrase_log = []
    if phrases is not None:
        group_of = {evs[g[0]]["id"]: gi for gi, g in enumerate(groups)}
        for ph in phrases:
            gis = [group_of[i] for i in ph["ids"] if i in group_of]
            pick = None
            for rank, r in enumerate(ph["ranked"]):
                words = [word_in(r["candidate"], groups[gi]) for gi in gis]
                if all(w is not None and w[1] <= WORD_INTERNAL_MAX_MS for w in words):
                    pick = (rank, r, words)
                    break
            if pick is None:
                phrase_log.append({"index": ph["index"], "start": ph["start"], "end": ph["end"], "take": None, "fallback": "word-level"})
                continue
            rank, r, words = pick
            forced.update(dict(zip(gis, words)))
            phrase_log.append({"index": ph["index"], "start": ph["start"], "end": ph["end"], "take": r["take"], "rank": rank,
                               "intelligibility": r["intelligibility"], "pitch_fails": r.get("pitch_fails"),
                               "mean_abs_cents": r["mean_abs_cents"], "within_gate": r["within_gate"], "of": r["of"]})
    chosen = []   # per group: (candidate index, internal_ms, e0)
    for gi, g in enumerate(groups):
        if gi in forced:
            chosen.append(forced[gi])
            continue
        best = None
        for ci in range(len(tables)):
            w = word_in(ci, g)
            if w is not None and (best is None or w[3] < best[3]):
                best = w
        if best is None:
            raise SystemExit(f"no take offers the word '{evs[g[0]]['word']}' with every syllable dated")
        if best[1] > WORD_INTERNAL_MAX_MS:
            raise SystemExit(f"word '{evs[g[0]]['word']}': best take still {best[1]:.0f} ms out inside the word (> {WORD_INTERNAL_MAX_MS}); render more takes")
        chosen.append(best)
    cuts: list[Cut] = []
    for gi, g in enumerate(groups):
        ci, internal, e0, _score = chosen[gi]
        cand = candidates[ci]
        tab = tables[ci]
        key = cand["key"]
        first_id, last_id = evs[g[0]]["id"], evs[g[-1]]["id"]
        v_first = float(tab[first_id]["t_vowel"])
        v_last = float(tab[last_id]["t_vowel"])
        # previous / next vowel IN THIS TAKE bound the cut
        prev_v = float(tab[evs[g[0] - 1]["id"]]["t_vowel"]) if g[0] > 0 and tab.get(evs[g[0] - 1]["id"], {}).get("t_vowel") is not None else 0.0
        next_v = float(tab[evs[g[-1] + 1]["id"]]["t_vowel"]) if g[-1] + 1 < len(evs) and tab.get(evs[g[-1] + 1]["id"], {}).get("t_vowel") is not None else None
        cut_start = snap(max(prev_v + 0.05 if g[0] > 0 else 0.0, v_first - REPIN_LEAD_IN_S))
        if next_v is not None:
            cut_end = snap(max(v_last + 0.1, min(next_v - REPIN_LEAD_IN_S, total_seconds_of[key])))
        else:
            cut_end = snap(min(total_seconds_of[key], v_last + float(evs[g[-1]]["dur_sec"])))
        vowel_off = v_first - cut_start
        lead = snap(float(evs[g[0]]["t_sec"]) - vowel_off)
        if lead < 0:
            cut_start = snap(cut_start - lead); lead = 0.0; vowel_off = v_first - cut_start
        for j, k in enumerate(g):
            ev = evs[k]
            cuts.append(Cut(id=ev["id"], lyric=ev["lyric"], word=norm_word(ev["word"]), t_sec=float(ev["t_sec"]), source_key=key,
                            src_word_start=cut_start, src_word_end=cut_end, src_vowel_onset=float(tab[ev["id"]]["t_vowel"]),
                            method=tab[ev["id"]].get("method") or "rise", cut_start=cut_start, cut_end=cut_end, lead=lead,
                            clip_seconds=0.0, placed_start=lead, placed_end=0.0,
                            note=f"word '{ev['word']}' from take {ci} ({os.path.basename(os.path.dirname(key))}), internal {internal:.0f} ms, shift {-e0 * 1000:+.0f} ms, dip {tab[ev['id']].get('dip_db')} dB" + ("" if j == 0 else "; shares the word clip")))
    # cap word clips so they never overlap the next word clip; interior syllables mirror their word
    word_first = [c for c in cuts if c.id in {evs[g[0]]["id"] for g in groups}]
    for i, c in enumerate(word_first):
        limit = word_first[i + 1].placed_start - CLIP_GAP_S if i + 1 < len(word_first) else total
        clip = snap(min(c.cut_end - c.cut_start, limit - c.lead))
        if clip <= snap(c.src_vowel_onset - c.cut_start) + 0.03:
            raise SystemExit(f"{c.id} '{c.lyric}': word clip {clip:.3f}s too short to carry its vowel")
        c.clip_seconds = clip
        c.cut_end = snap(c.cut_start + clip)
        c.placed_end = snap(c.lead + clip)
    by_id = {c.id: c for c in cuts}
    out_cuts = []
    for g in groups:
        head = by_id[evs[g[0]]["id"]]
        for k in g:
            c = by_id[evs[k]["id"]]
            d = asdict(c)
            d.update({"cut_end": head.cut_end, "clip_seconds": head.clip_seconds, "placed_end": head.placed_end, "word_clip_id": head.id})
            out_cuts.append(d)
    return {"clock": clock.get("_path"), "total_seconds": total, "total_samples": int(clock["total_samples"]), "sample_rate": int(clock["sample_rate"]),
            "alignment": {"missing": [], "extra": []}, "detector": detector_info(), "skipped": [],
            "mode": "repin-phrases" if phrases is not None else "repin-words",
            "word_internal_max_ms": WORD_INTERNAL_MAX_MS,
            "candidates": [{"key": c["key"], "receipt": c.get("receipt")} for c in candidates],
            **({"phrases": phrase_log} if phrases is not None else {}),
            "cuts": out_cuts}


def cmd_repin(a):
    clock = load_clock(a.clock)
    if a.candidate:
        cands = []
        totals = {}
        for spec in a.candidate:
            take, receipt = spec.split("=", 1)
            rec = json.load(open(receipt, encoding="utf-8"))
            mono, sr, frames = read_audio(take)
            key = take.replace("\\", "/")
            totals[key] = frames / sr
            cands.append({"key": key, "rows": rec["table"], "receipt": receipt.replace("\\", "/"), "sha256": sha256(take)})
        phrases = None
        if a.by_phrase:
            scores = json.load(open(a.phrase_scores, encoding="utf-8")) if a.phrase_scores else None
            phrases = rank_phrases(clock, cands, scores, a.phrase_gap)
        plan = repin_words(clock, cands, totals, split_words=a.split_words, phrases=phrases)
        json.dump(plan, open(a.out, "w", encoding="utf-8"), indent=2)
        for ph in plan.get("phrases", []):
            got = "word-level fallback" if ph["take"] is None else (
                f"{ph['take']} (rank {ph['rank']}, heard {ph['intelligibility']}, {ph.get('pitch_fails')} pitch fails, {ph['mean_abs_cents']} c, {ph['within_gate']}/{ph['of']} in gate)")
            print(f"phrase {ph['index']:2} [{ph['start']:7.2f},{ph['end']:7.2f}] {got}")
        for c in plan["cuts"]:
            if c["word_clip_id"] != c["id"]:
                continue
            print(f"{c['id']:4} {c['word']:8} cut [{c['cut_start']:7.3f},{c['cut_end']:7.3f}] clip {c['clip_seconds']:6.3f} lead {c['lead']:8.4f}  {c['note']}")
        print(f"wrote {a.out}")
        return 0
    rec = json.load(open(a.verify_receipt, encoding="utf-8"))
    mono, sr, frames = read_audio(a.take)
    plan = repin_plan(clock, rec["table"], frames / sr, a.source_key)
    plan["take"] = {"path": a.take.replace("\\", "/"), "frames": frames, "seconds": frames / sr, "sha256": sha256(a.take)}
    plan["verify_receipt"] = a.verify_receipt.replace("\\", "/")
    json.dump(plan, open(a.out, "w", encoding="utf-8"), indent=2)
    for c in plan["cuts"]:
        print(f"{c['id']:4} {c['lyric']:7} cut [{c['cut_start']:7.3f},{c['cut_end']:7.3f}] clip {c['clip_seconds']:6.3f} lead {c['lead']:8.4f}  {c['note']}")
    print(f"wrote {a.out}")
    return 0


# ─── graphs (fx-dub shapes) ───────────────────────────────────────────────────

def placed_vocal_graph(source_key: str, plan: dict, prefix: str, sample_rate: int = SR, channels: int = 2) -> dict:
    """One job: for each cut, TrimAudioDuration (fx-dub `splice` primitive)
    then the exact `place_exact` shape (lead EmptyAudio + AudioConcat + tail
    EmptyAudio + AudioConcat, so every track is EXACTLY total_seconds long),
    then AudioMix them together at unity. Nothing passes through a model."""
    vo = _vo_graphs()
    total = float(plan["total_seconds"])
    graph = {}
    # one LoadAudio per distinct take (a merged bag of takes has several)
    keys = []
    for c in plan["cuts"]:
        k = c.get("source_key") or source_key
        if k not in keys:
            keys.append(k)
    loaders = {}
    for i, k in enumerate(keys):
        nid_load = str(1 + i)
        graph.update(vo.load_audio(nid_load, k))
        loaders[k] = [nid_load, 0]
    placed = []
    nid = 10
    for c in plan["cuts"]:
        if c.get("word_clip_id", c["id"]) != c["id"]:
            continue  # interior syllable: its word clip is placed once
        trim = str(nid)
        graph[trim] = {"class_type": "TrimAudioDuration",
                       "inputs": {"audio": loaders[c.get("source_key") or source_key], "start_index": float(c["cut_start"]), "duration": float(c["clip_seconds"])}}
        # place_exact shape, node-for-node (vo_graphs.place_exact)
        lead = float(c["lead"])
        tail = total - lead - float(c["clip_seconds"])
        if tail < 0:
            raise ValueError(f"{c['id']}: clip does not fit: {c['clip_seconds']}s at {lead}s exceeds {total}s")
        graph[str(nid + 1)] = {"class_type": "EmptyAudio", "inputs": {"duration": lead, "sample_rate": sample_rate, "channels": channels}}
        graph[str(nid + 2)] = {"class_type": "AudioConcat", "inputs": {"audio1": [str(nid + 1), 0], "audio2": [trim, 0], "direction": "after"}}
        graph[str(nid + 3)] = {"class_type": "EmptyAudio", "inputs": {"duration": round(tail, 6), "sample_rate": sample_rate, "channels": channels}}
        graph[str(nid + 4)] = {"class_type": "AudioConcat", "inputs": {"audio1": [str(nid + 2), 0], "audio2": [str(nid + 3), 0], "direction": "after"}}
        placed.append([str(nid + 4), 0])
        nid += 5
    acc = placed[0]
    for nxt in placed[1:]:
        graph[str(nid)] = {"class_type": "AudioMix", "inputs": {"audio_1": acc, "audio_2": nxt, "gain_1_db": 0.0, "gain_2_db": 0.0}}
        acc = [str(nid), 0]
        nid += 1
    graph.update(vo._save(str(nid), acc, prefix))
    return graph


# ─── merge several takes: a bag of takes, one cut per event ──────────────────

def merge_plans(plans: list[dict]) -> dict:
    """Per event, take the cut whose clip covers the most of its slot (before
    capping), i.e. the longest sung syllable; ties go to the earlier plan.
    Leads are recomputed and clips re-capped so nothing overlaps."""
    if not plans:
        raise SystemExit("merge needs at least one plan")
    base = plans[0]
    total = float(base["total_seconds"])
    clock = json.load(open(base["clock"], encoding="utf-8"))
    ids = [ev["id"] for ev in clock["events"]]
    by_id = [{c["id"]: c for c in p["cuts"]} for p in plans]
    chosen = []
    for cid in ids:
        cands = [(m[cid], pi) for pi, m in enumerate(by_id) if cid in m]
        if not cands:
            raise SystemExit(f"no take offers event {cid}: " + "; ".join(sk["reason"] for p in plans for sk in p.get("skipped", []) if sk["id"] == cid))
        best = max(cands, key=lambda cp: (cp[0]["cut_end"] - cp[0]["cut_start"], -cp[1]))
        c = dict(best[0])
        c["note"] += f"; from take {best[1]} ({len(cands)} candidates)"
        chosen.append(c)
    for k, c in enumerate(chosen):
        limit = chosen[k + 1]["placed_start"] - CLIP_GAP_S if k + 1 < len(chosen) else total
        clip = snap(min(c["cut_end"] - c["cut_start"], limit - c["lead"]))
        c["clip_seconds"] = clip
        c["cut_end"] = snap(c["cut_start"] + clip)
        c["placed_end"] = snap(c["lead"] + clip)
    out = dict(base)
    out["cuts"] = chosen
    out["merged_from"] = [p.get("take", {}).get("path") for p in plans]
    out.pop("take", None)
    out.pop("words", None)
    return out


# ─── local placement / mix (numpy; the singer is local, so can the splice be) ─

FADE_S = 0.015               # raised-cosine at a clip's outer edges (no clicks)
XFADE_S = 0.05               # crossfade at every join: the earlier clip keeps singing under the next one
JOIN_EXTEND_MAX_S = REPIN_LEAD_IN_S + XFADE_S   # never reach past the next syllable's lead-in into its vowel


def _xfade(c: dict, sr: int) -> int:
    """Samples of crossfade at the join INTO clip `c`: XFADE_S, unless the cut carries
    its own `xfade_s` (the planter's click plants; production plans never set it)."""
    x = c.get("xfade_s")
    return int(XFADE_S * sr) if x is None else int(round(x * sr))


def _fade(n: int) -> np.ndarray:
    return 0.5 - 0.5 * np.cos(np.pi * np.arange(n) / max(1, n))


def place_local(plan: dict, sources: dict[str, np.ndarray], sr: int) -> tuple[np.ndarray, list[dict]]:
    """Sample-exact placement of the plan's cuts on a `total_samples` timeline.

    Same arithmetic as the cloud `place_exact` chain (lead = placed_start,
    clip = cut span) but spliced like an editor would: at every join the
    earlier clip keeps running from its own source until XFADE_S after the
    next clip starts and the two crossfade (equal-power); a clip never
    reaches past the next syllable's lead-in into its vowel, so a gap wider
    than that stays as faded air. Outer edges get FADE_S raised cosines."""
    total = int(plan["total_samples"])
    out = np.zeros((total, 2))
    cuts = plan["cuts"]
    joins = []
    nf = int(FADE_S * sr)
    cuts = [c for c in cuts if c.get("word_clip_id", c["id"]) == c["id"]]   # one clip per word
    for k, c in enumerate(cuts):
        nx_in = _xfade(c, sr)                                  # the join into this clip
        nx = _xfade(cuts[k + 1], sr) if k + 1 < len(cuts) else nx_in   # the join out of it
        src = sources[c["source_key"]]
        if src.ndim == 1:
            src = np.repeat(src[:, None], 2, axis=1)
        a0 = int(round(c["cut_start"] * sr))
        start = int(round(c["placed_start"] * sr))
        nat_end = a0 + int(round(c["clip_seconds"] * sr))
        if k + 1 < len(cuts):
            next_start = int(round(cuts[k + 1]["placed_start"] * sr))
            want_end = a0 + (next_start + nx - start)          # run until XFADE after the next clip starts
            ext_cap = nat_end + int(JOIN_EXTEND_MAX_S * sr)
            b0 = min(want_end, ext_cap, len(src))
            b0 = max(b0, a0 + 1)
            seg = src[a0:b0].copy()
            n = len(seg)
            head = min(nx_in if k > 0 else nf, n // 2)
            tail = min(nx, n // 2)
            seg[:head] *= _fade(head)[:, None]
            seg[n - tail:] *= _fade(tail)[::-1][:, None]
            gap_ms = max(0.0, (next_start - (start + n)) / sr * 1000)
        else:
            seg = src[a0:nat_end].copy()
            n = len(seg)
            head = min(nx_in, n // 2)
            tail = min(nf, n // 2)
            seg[:head] *= _fade(head)[:, None]
            seg[n - tail:] *= _fade(tail)[::-1][:, None]
            gap_ms = 0.0
        end = min(total, start + n)
        out[start:end] += seg[: end - start]
        joins.append({"id": c["id"], "placed_start": start / sr, "placed_end": end / sr,
                      "extended_ms": round((n - (nat_end - a0)) / sr * 1000, 1), "gap_ms": round(gap_ms, 1)})
    peak = float(np.abs(out).max())
    if peak > 1.0:
        out /= peak
    return out, joins


# ─── warp placement: stretch a take, never cut it inside a run ───────────────
#
# place_local cuts every syllable out and moves it alone. Neighbours from one
# take move by different amounts, and since each clip runs on in its own source
# until the next starts, a syllable moved later than its neighbour has its start
# played twice ("Gr-grace") and one moved earlier skips audio. The Director's
# review marks found exactly that (2026-10-07). Warp placement keeps every run of
# syllables from one take as one continuous stretch of that take and time-warps
# it (WSOLA) so each vowel onset still lands where the plan puts it.

WARP_FRAME_S = 0.04          # WSOLA frame (a few periods of the lowest sung note)
WARP_TOL_S = 0.01            # how far a frame may slide to stay in phase with the last
WARP_RUN_GAP_S = 1.5         # a source gap this long between same-take syllables starts a new run
WARP_REST_S = 0.25           # a rest this long in the score ends a run, even inside one take
WARP_RELEASE_S = 0.15        # a run sounds this long past its last note's end, then fades
WARP_RELEASE_FADE_S = 0.06
# Why runs end at the score: a whole song is rendered in phrase segments, split at
# rests, and the singer makes noise in the rest where two segments meet (the
# Director heard every remaining honk there, 2026-10-07: a raw take, the placed
# vocal and the mix all honked at the segment boundary). A clip that ran on to the
# next syllable's lead-in carried that noise in; a rest belongs to the bed.


def warp_runs(cuts: list[dict], ends: dict[str, float] | None = None) -> list[list[dict]]:
    """Consecutive clips (in placed order) from one take, in source order and close
    in the source: each run is played as one continuous, warped stretch. With
    `ends` (event id -> score time its note ends), a rest of WARP_REST_S in the
    score also ends a run. A cut with `break_before` always starts a new run (the
    planter's seams; production plans never set it)."""
    ends = ends or {}
    runs: list[list[dict]] = []
    for c in sorted(cuts, key=lambda c: c["placed_start"]):
        if runs:
            p = runs[-1][-1]
            rest = c["t_sec"] - ends[p["id"]] if p["id"] in ends and "t_sec" in c else 0.0
            if (not c.get("break_before") and c["source_key"] == p["source_key"] and c["cut_start"] >= p["cut_start"]
                    and c["cut_start"] - p["cut_end"] < WARP_RUN_GAP_S and rest < WARP_REST_S):
                runs[-1].append(c)
                continue
        runs.append([c])
    return runs


def warp_map(run: list[dict]) -> tuple[list[float], list[float]]:
    """Source times -> timeline times for a run: each vowel onset goes where the
    plan puts it (src_vowel_onset + the clip's shift), the run's edges keep the
    first and last clip's own shift, and time between anchors is stretched
    linearly. An anchor that would run backwards is dropped."""
    def shift(c):
        return c["placed_start"] - c["cut_start"]
    pts = [(run[0]["cut_start"], run[0]["cut_start"] + shift(run[0]))]
    for c in run:
        v = c.get("src_vowel_onset")
        if v is not None:
            pts.append((v, v + shift(c)))
    last = run[-1]
    pts.append((last["cut_end"], last["cut_end"] + shift(last)))
    src, dst = [pts[0][0]], [pts[0][1]]
    for s, d in pts[1:]:
        if s > src[-1] + 1e-4 and d > dst[-1] + 1e-4:
            src.append(s)
            dst.append(d)
    return src, dst


def wsola(x: np.ndarray, sr: int, src: list[float], dst: list[float]) -> np.ndarray:
    """Time-warp x (frames x channels) so source time src[i] lands at dst[i]
    (seconds; the output starts at dst[0]). Waveform-similarity overlap-add
    (Verhelst & Roelands 1993): each output frame is read near where the map says,
    slid up to WARP_TOL_S to continue the previous frame's waveform, and added
    under a Hann window at 50 % overlap, so pitch and timbre are kept."""
    from scipy.signal import correlate
    n = int(round(WARP_FRAME_S * sr)) // 2 * 2
    hs = n // 2
    tol = int(round(WARP_TOL_S * sr))
    length = int(round((dst[-1] - dst[0]) * sr))
    win = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(n) / n)          # periodic Hann: sums to 1 at hop n/2
    ch = x.shape[1]
    off = n + 2 * tol
    xp = np.concatenate([np.zeros((off, ch)), x, np.zeros((off, ch))])   # index i of x is i + off in xp
    mono = xp.mean(axis=1)
    out = np.zeros((length + 2 * n, ch))
    out_t = np.arange(0, length + hs, hs)
    want = np.interp(dst[0] + out_t / sr, dst, src) * sr              # source sample each output frame should read
    prev = None
    for k, t in enumerate(out_t):
        p = int(round(want[k])) + off
        if prev is not None:
            nat = mono[prev + hs:prev + hs + n]                      # how the last frame's waveform goes on
            region = mono[p - tol:p + tol + n]
            if len(nat) == n and len(region) == n + 2 * tol and np.any(nat):
                p = p - tol + int(np.argmax(correlate(region, nat, mode="valid", method="fft")))
        seg = xp[p:p + n]
        if len(seg) < n:
            break
        out[t:t + n] += seg * win[:, None]
        prev = p
    return out[:length]


def place_warp(plan: dict, sources: dict[str, np.ndarray], sr: int, clock: dict | None = None) -> tuple[np.ndarray, list[dict]]:
    """Warp placement (see above). Runs meet the way phrases do: the earlier run
    ends at its own last syllable and fades; if the next run starts before that,
    they crossfade for at most XFADE_S, so two takes never sing over each other
    for longer than a crossfade. With the clock, a run ends at its last note plus
    WARP_RELEASE_S, so the rest after a phrase is silence, not the take."""
    ends = {e["id"]: e["t_sec"] + e["dur_sec"] for e in (clock or {}).get("events", [])}
    total = int(plan["total_samples"])
    out = np.zeros((total, 2))
    cuts = [c for c in plan["cuts"] if c.get("word_clip_id", c["id"]) == c["id"]]
    runs = warp_runs(cuts, ends)
    nf = int(FADE_S * sr)
    nr = int(WARP_RELEASE_FADE_S * sr)
    xf = [_xfade(run[0], sr) for run in runs]                 # the join into each run
    forced = ["xfade_s" in run[0] for run in runs]            # an explicit crossfade holds even without overlap
    spans = []
    for run in runs:
        src_t, dst_t = warp_map(run)
        x = sources[run[0]["source_key"]]
        if x.ndim == 1:
            x = np.repeat(x[:, None], 2, axis=1)
        a0 = int(round(src_t[0] * sr))
        seg = wsola(x[a0:int(round(src_t[-1] * sr)) + 1], sr, [s - a0 / sr for s in src_t], dst_t)
        start = int(round(dst_t[0] * sr))
        last = run[-1]["id"]
        if last in ends:
            stop = int(round((ends[last] + WARP_RELEASE_S) * sr)) - start
            if 0 < stop < len(seg):
                seg = seg[:stop].copy()
                k = min(nr, len(seg) // 2)
                seg[len(seg) - k:] *= _fade(k)[::-1][:, None]
        spans.append((start, seg, src_t, dst_t))
    joins = []
    for k, (start, seg, src_t, dst_t) in enumerate(spans):
        nxt = spans[k + 1][0] if k + 1 < len(spans) else None
        nx_in = xf[k]
        nx = xf[k + 1] if k + 1 < len(spans) else nx_in
        n = len(seg)
        if nxt is not None and start + n > nxt + nx:
            n = max(1, nxt + nx - start)                              # never under the next run past a crossfade
        seg = seg[:n].copy()
        prev_end = spans[k - 1][0] + len(spans[k - 1][1]) if k > 0 else None
        head = min(nx_in if prev_end is not None and (prev_end > start or forced[k]) else nf, n // 2)
        tail = min(nx if nxt is not None and (start + n > nxt or forced[k + 1]) else nf, n // 2)
        seg[:head] *= _fade(head)[:, None]
        seg[n - tail:] *= _fade(tail)[::-1][:, None]
        lo, hi = max(0, start), min(total, start + n)
        if hi > lo:
            out[lo:hi] += seg[lo - start:hi - start]
        run = runs[k]
        gap_after = max(0.0, (nxt - (start + n)) / sr * 1000) if nxt is not None else 0.0
        for i, c in enumerate(run):
            ratio = None
            if i + 1 < len(run) and c.get("src_vowel_onset") is not None and run[i + 1].get("src_vowel_onset") is not None:
                s0, s1 = c["src_vowel_onset"], run[i + 1]["src_vowel_onset"]
                d0, d1 = np.interp([s0, s1], src_t, dst_t)
                ratio = round(float((d1 - d0) / (s1 - s0)), 3) if s1 > s0 else None
            joins.append({"id": c["id"], "run": k, "placed_start": float(np.interp(c["cut_start"], src_t, dst_t)),
                          "placed_end": float(np.interp(c["cut_end"], src_t, dst_t)), "stretch": ratio,
                          "gap_ms": round(gap_after, 1) if i == len(run) - 1 else 0.0, "extended_ms": 0.0})
    peak = float(np.abs(out).max())
    if peak > 1.0:
        out /= peak
    return out, joins


def mix_local(bed: np.ndarray, vocal: np.ndarray, vo_gain_db: float, bed_gain_db: float) -> np.ndarray:
    return bed * 10 ** (bed_gain_db / 20) + vocal * 10 ** (vo_gain_db / 20)


# ─── measure the artifact ────────────────────────────────────────────────────

def measure_events(clock: dict, mono: np.ndarray, sr: int, plan: dict | None = None) -> list[dict]:
    """Date each event's vowel on the ARTIFACT with the method the plan chose
    for it (rise, or slope for legato syllables). The window opens 12 ms after
    the clip's own cut edge so the cut is never what gets dated."""
    times, env = band_envelope(mono, sr)
    cuts = {c["id"]: c for c in (plan or {}).get("cuts", [])}
    rows = []
    evs = clock["events"]
    for k, ev in enumerate(evs):
        t = float(ev["t_sec"])
        c = cuts.get(ev["id"])
        lo = max(0.0, t - PEAK_BEFORE_S)
        search_lo = max(0.0, t - SEARCH_BEFORE_S)
        if c is not None:
            # open after the clip's own edge — and after a crossfaded join's overlap
            # (the previous syllable keeps sounding for XFADE_S), but never past the
            # consonant lead-in that precedes this vowel
            vowel_off = float(c["src_vowel_onset"]) - float(c["cut_start"])
            margin = min(max(0.012, vowel_off - 0.02), XFADE_S + 0.01)
            lo = max(lo, c["placed_start"] + margin)
            search_lo = max(search_lo, c["placed_start"] + margin)
        hi = t + SEARCH_AFTER_S
        if k + 1 < len(evs):
            nxt = cuts.get(evs[k + 1]["id"])
            hi = min(hi, (nxt["placed_start"] if nxt else float(evs[k + 1]["t_sec"])) - CLIP_GAP_S)
        if c is not None:
            hi = min(hi, c["placed_end"])
        onset = rise_onset(times, env, lo, hi, search_lo=search_lo)
        want = c["method"] if c is not None else None
        if onset["t"] is not None and want is not None and onset["method"] != want:
            onset = dict(onset, reason=f"method-mismatch:{onset['method']}!={want}")
        rows.append({"id": ev["id"], "lyric": ev["lyric"], "t_score": t, "method": onset.get("method"),
                     "t_vowel": onset["t"], "peak": onset["peak"], "reason": onset["reason"], "dip_db": onset.get("dip_db")})
    return rows


def cross_check(table: list[dict], aligner: dict[str, float | None], gate_ms: float = GATE_MS) -> dict:
    """Read the aligner against the detector's table, in place.

    The detector stays the gate's instrument. A syllable it fails is RESCUED when the
    aligner, an instrument of a different kind, puts the same vowel within the gate
    after the measured offset: on the first whole-song renders every large detector
    miss (up to +286 ms, at phrase ends in the stitched stem) was a detector error the
    aligner placed within 32 ms. A syllable fails only when both instruments say it
    is off, or the detector fails it and the aligner has no answer. The aligner alone
    never fails a syllable: on long phrases it has gross errors of its own (up to
    1.4 s), so where it disagrees with a detector pass the row is only marked."""
    agree = [(aligner[t["id"]] - t["t_score"]) * 1000.0 for t in table
             if t["pass"] and aligner.get(t["id"]) is not None]
    if len(agree) < ALIGNER_MIN_AGREEING:
        return {"info": True, "used": False, "reason": f"only {len(agree)} syllables to measure the instruments' offset from"}
    offset = float(np.median(agree))
    counts = {"rescued": 0, "both_off": 0, "unconfirmed": 0, "disputed": 0}
    for t in table:
        al = aligner.get(t["id"])
        t["aligner_err_ms"] = None if al is None else round((al - t["t_score"]) * 1000.0 - offset, 1)
        if t["pass"]:
            if t["aligner_err_ms"] is not None and abs(t["aligner_err_ms"]) > gate_ms:
                t["cross_check"] = "disputed"
                counts["disputed"] += 1
            continue
        if t["aligner_err_ms"] is None:
            t["cross_check"] = "unconfirmed"
            counts["unconfirmed"] += 1
        elif abs(t["aligner_err_ms"]) <= gate_ms:
            t["cross_check"] = "rescued"
            t["pass"] = True
            counts["rescued"] += 1
        else:
            t["cross_check"] = "both_off"
            counts["both_off"] += 1
    return {"info": True, "used": True, "offset_ms": round(offset, 1), "measured_from": len(agree), **counts,
            "rescued_ids": [t["id"] for t in table if t.get("cross_check") == "rescued"],
            "failing_ids": [t["id"] for t in table if t.get("cross_check") in ("both_off", "unconfirmed")],
            "disputed_ids": [t["id"] for t in table if t.get("cross_check") == "disputed"]}


def gate(clock: dict, rows: list[dict], words: list[dict] | None, vocal_frames: int, bed_frames: int | None, plan: dict | None,
         aligner: dict[str, float | None] | None = None) -> dict:
    checks = {}
    table = []
    worst = 0.0
    for r in rows:
        if r["t_vowel"] is None:
            err = None
            ok = False
        else:
            err = (r["t_vowel"] - r["t_score"]) * 1000.0
            ok = abs(err) <= GATE_MS and r["reason"] == "ok"
            worst = max(worst, abs(err))
        table.append({**r, "err_ms": None if err is None else round(err, 2), "pass": ok})
    if aligner is not None:
        checks["aligner_cross_check"] = cross_check(table, aligner)
    checks["onset_abs_ms"] = {"pass": all(t["pass"] for t in table), "gate_ms": GATE_MS, "worst_ms": round(worst, 2)}
    total = float(clock["total_seconds"])
    if words is not None:
        al = align_words(clock_words(clock), words)
        speakers = sorted({w["speaker"] for w in words if w["speaker"] is not None})
        checks["order"] = {"pass": al["in_order"], "missing": al["missing"], "extra": al["extra"]}
        checks["one_voice"] = {"pass": len(speakers) <= 1, "speakers": speakers}
        last_speech = max((w["end"] for w in words), default=0.0)
        checks["fits_timeline"] = {"pass": last_speech <= total + 1e-6, "last_speech_end": last_speech, "total_seconds": total}
        # cross-check: transcript word starts vs the clock (word-initial events only)
        groups = clock_words(clock)
        stt = {}
        for gi, g in enumerate(groups):
            if gi in al["map"]:
                w = words[al["map"][gi]]
                ev = g["events"][0]
                stt[ev["id"]] = round((w["start"] - float(ev["t_sec"])) * 1000.0, 1)
        for t in table:
            t["stt_err_ms"] = stt.get(t["id"])
        checks["stt_cross_check"] = {"info": True, "warn_ms": STT_WARN_MS,
                                     "over": [i for i, e in stt.items() if abs(e) > STT_WARN_MS]}
    else:
        checks["order"] = {"pass": False, "reason": "no transcript of the placed stem"}
        checks["one_voice"] = {"pass": False, "reason": "no transcript of the placed stem"}
        checks["fits_timeline"] = {"pass": False, "reason": "no transcript of the placed stem"}
    if plan is not None:
        last_clip = max(c["placed_end"] for c in plan["cuts"])
        checks["fits_timeline"]["last_clip_end"] = last_clip
        checks["fits_timeline"]["pass"] = checks["fits_timeline"].get("pass", False) and last_clip <= total + 1e-6
    if bed_frames is None:
        checks["length_match"] = {"pass": False, "reason": "no bed to compare"}
    else:
        checks["length_match"] = {"pass": abs(vocal_frames - bed_frames) <= 1, "vocal_frames": vocal_frames,
                                  "bed_frames": bed_frames, "clock_frames": int(clock["total_samples"])}
        checks["length_match"]["pass"] = checks["length_match"]["pass"] and abs(vocal_frames - int(clock["total_samples"])) <= 1
    verdict = all(v.get("pass", True) for v in checks.values() if not v.get("info"))
    return {"verdict": "PASS" if verdict else "FAIL", "checks": checks, "table": table}


def print_table(result: dict) -> None:
    print(f"{'id':4} {'lyric':7} {'t_score':>8} {'t_vowel':>8} {'err_ms':>8} {'stt_ms':>7} {'method':6}  result")
    for t in result["table"]:
        tv = "       -" if t["t_vowel"] is None else f"{t['t_vowel']:8.4f}"
        em = "       -" if t["err_ms"] is None else f"{t['err_ms']:8.1f}"
        st = "      -" if t.get("stt_err_ms") is None else f"{t['stt_err_ms']:7.1f}"
        xc = f" [{t['cross_check']}: aligner {t.get('aligner_err_ms')} ms]" if t.get("cross_check") else ""
        print(f"{t['id']:4} {t['lyric']:7} {t['t_score']:8.4f} {tv} {em} {st} {str(t.get('method') or '-'):6}  {'PASS' if t['pass'] else 'FAIL'} {'' if t['reason']=='ok' else t['reason']}{xc}")
    for name, c in result["checks"].items():
        if c.get("info"):
            print(f"  {name:15} info  {json.dumps({k: v for k, v in c.items() if k != 'info'})}")
        else:
            print(f"  {name:15} {'PASS' if c['pass'] else 'FAIL'}  {json.dumps({k: v for k, v in c.items() if k != 'pass'})}")
    print(f"VERDICT {result['verdict']}")


# ─── bed check ───────────────────────────────────────────────────────────────

SILENCE_DBFS = -40.0


def bed_onsets(clock: dict, mono: np.ndarray, sr: int, render_receipt: dict | None, tol_ms=3.0) -> dict:
    """Receipt on the render, not a musical gate.

    Timing: the renderer records the context time it told the engine to start
    each note (`scheduled` in the render receipt, quantised to the 128-sample
    render quantum). Each event's piano note must have been started within
    `tol_ms` of `t_sec`. Onsets struck over a still-ringing chord are not
    separable acoustically (same pitches, release overlapping attack), so the
    engine's own record is the measurement.

    Acoustic latency: where the 30 ms before an event is digital silence, the
    first sample above SILENCE_DBFS dates the sound itself; the engine's
    attack ramp starts at zero gain, so the sound is a few ms behind the
    note-on. Reported so the Director knows where the piano is heard.
    """
    sched = (render_receipt or {}).get("scheduled") or []
    thr = 10 ** (SILENCE_DBFS / 20)
    rows = []
    for ev in clock["events"]:
        t = float(ev["t_sec"])
        row = {"id": ev["id"], "t_score": t, "t_noteon": None, "late_ms": None, "acoustic_ms": None, "pass": True, "note": ev["anchor"]}
        if ev.get("engine_note"):
            hits = [s for s in sched if s["midi"] == ev["midi"] and abs(s["t_nominal"] - t) < 1e-4]
            if not hits:
                row.update({"pass": False, "note": row["note"] + " (no scheduled note-on in the render receipt)"})
            else:
                s = hits[0]
                row["t_noteon"] = s["t_actual"]
                row["late_ms"] = round((s["t_actual"] - t) * 1000.0, 3)
                row["pass"] = abs(row["late_ms"]) <= tol_ms
            i0 = int(round(t * sr))
            pre = np.abs(mono[max(0, i0 - int(0.03 * sr)):i0])
            if len(pre) and pre.max() < thr:
                seg = np.abs(mono[i0:i0 + int(0.05 * sr)])
                j = int(np.argmax(seg > thr)) if np.any(seg > thr) else None
                row["acoustic_ms"] = None if j is None else round(j / sr * 1000.0, 2)
        rows.append(row)
    acoustic = [r["acoustic_ms"] for r in rows if r["acoustic_ms"] is not None]
    return {"pass": all(r["pass"] for r in rows) and bool(sched), "tol_ms": tol_ms, "rows": rows,
            "acoustic_latency_ms": {"n": len(acoustic), "min": min(acoustic) if acoustic else None, "max": max(acoustic) if acoustic else None},
            "engine": (render_receipt or {}).get("engine")}


# ─── pitch gate (score MIDI vs measured F0 at the vowel nucleus) ─────────────
#
# Grounding (docs/vocal-singing-study-2026-09.md, F8): listeners forgive the
# voice ~50 cents (Hutchins, Roquet & Peretz 2012); ±50 c tracks lay judgments
# (Larrouy-Maestri 2018); mistuning (global offset) and imprecision (scatter)
# are separate failures (Pfordresher & Brown 2007); the perceived pitch of a
# vibrato tone is its mean f0 (Sundberg); MIR's note convention is 50 ms +
# 50 c (mir_eval). Trackers: SwiftF0 / RMVPE / CREPE / pYIN (Nieradzik 2025).

PITCH_FAIL_CENTS = 50.0
PITCH_WARN_CENTS = 25.0
PITCH_GLOBAL_FAIL_CENTS = 20.0     # median offset over all notes = transposition / tuning drift
PITCH_SCATTER_WARN_CENTS = 30.0    # SD of per-note means
PITCH_OCTAVE_TRIP_CENTS = 40.0     # |mean - median| beyond this = untrackable, not out of tune
NUCLEUS_HEAD_S = 0.08
NUCLEUS_HEAD_FRAC = 0.15
NUCLEUS_TAIL_S = 0.05
NUCLEUS_NEXT_GUARD_S = 0.15      # a nasal/glide before the next vowel is already at the next pitch
VOICING_MIN = 0.5


def midi_hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def track_f0(mono: np.ndarray, sr: int, tracker: str = "auto") -> dict:
    """(times, f0_hz, confidence). Primary = librosa.pyin: on a synthetic ±40 c
    vibrato it reads +2.8 c mean with the full swing; SwiftF0 read +20.6 c mean
    and clipped the excursion (measured 2026-09-05), a bias a 25/50 c gate
    cannot afford. SwiftF0 stays available as a cross-check (`tracker="swift"`).

    `tracker="fcpe"` (torchfcpe, MIT, CUDA): on the same kind of vibrato it read
    +0.3 c with the full swing, and on 721 notes of real hymn takes its per-note
    median sat 2.7 c (median) from pYIN's, at 0.2 s a take against pYIN's ~3 min
    (measured 2026-10-07). It ranks takes in phrase_scores.py; the gate's default
    stays pYIN until a change of instrument is made on purpose.
    Returns which tracker answered so the receipt can say so."""
    if tracker == "swift":
        try:
            from swift_f0 import SwiftF0
        except ImportError:
            raise SystemExit("swift-f0 is not installed in this interpreter")
        x = mono.astype(np.float32)
        r = SwiftF0(confidence_threshold=0.0).detect_from_array(x, sr)
        return {"tracker": "swift-f0", "times": np.asarray(r.timestamps, dtype=float),
                "f0": np.asarray(r.pitch_hz, dtype=float), "conf": np.asarray(r.confidence, dtype=float)}
    if tracker == "fcpe":
        return _track_fcpe(mono, sr)
    import librosa
    f0, voiced, prob = librosa.pyin(mono.astype(np.float32), fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7"),
                                   sr=sr, frame_length=2048, hop_length=240)
    times = librosa.times_like(f0, sr=sr, hop_length=240)
    f0 = np.where(np.isnan(f0), 0.0, f0)
    return {"tracker": "pyin", "times": times, "f0": f0, "conf": np.where(voiced, prob, 0.0)}


_FCPE = None
FCPE_HOP = 240   # samples at 48 kHz, the same 5 ms frames pYIN reads


def _track_fcpe(mono: np.ndarray, sr: int) -> dict:
    """torchfcpe's bundled model on the GPU (CPU when there is none). The input is
    scaled under a 1.0 peak: the mel extractor complains above it."""
    global _FCPE
    try:
        import torch
        from torchfcpe import spawn_bundled_infer_model
    except ImportError:
        raise SystemExit("torchfcpe is not installed in this interpreter")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if _FCPE is None:
        _FCPE = spawn_bundled_infer_model(device=device)
    x = mono.astype(np.float32)
    peak = float(np.abs(x).max()) if len(x) else 0.0
    if peak > 0.99:
        x = x * (0.99 / peak)
    n = len(x) // FCPE_HOP
    with torch.no_grad():
        f0 = _FCPE.infer(torch.from_numpy(x)[None, :, None].to(device), sr=sr, decoder_mode="local_argmax", threshold=0.006,
                         f0_min=65, f0_max=1100, interp_uv=False, output_interp_target_length=n)
    f0 = f0.squeeze().float().cpu().numpy().reshape(-1)
    times = (np.arange(len(f0)) * FCPE_HOP + FCPE_HOP / 2) / sr
    return {"tracker": "fcpe", "times": times, "f0": f0, "conf": (f0 > 0).astype(float)}


def nucleus_window(onset: float, offset: float) -> tuple[float, float]:
    dur = max(0.0, offset - onset)
    a = onset + max(NUCLEUS_HEAD_S, NUCLEUS_HEAD_FRAC * dur)
    b = offset - NUCLEUS_TAIL_S
    if b - a < 0.1:
        a, b = onset + min(0.05, dur / 3), offset - min(0.02, dur / 3)
    return a, b


def sung_notes(clock: dict, onsets: dict | None = None) -> list[dict]:
    """Every note the pitch gate judges, with the span it is judged over: one per
    syllable, plus one per note a held syllable continues onto (the clock's
    `melisma`, ids `v03.1`, `v03.2`, ...). A syllable's first note ends where its
    held note begins, so each note is judged against its own pitch."""
    evs = clock["events"]
    out = []
    for k, ev in enumerate(evs):
        t_end = float(ev["t_sec"]) + float(ev["dur_sec"])
        if k + 1 < len(evs):
            # the next syllable's voiced consonant (a nasal, a glide) carries the
            # NEXT pitch and begins up to a lead-in before its vowel: stop there
            t_end = min(t_end, float((onsets or {}).get(evs[k + 1]["id"], evs[k + 1]["t_sec"])) - NUCLEUS_NEXT_GUARD_S)
        held = ev.get("melisma") or []
        spans = [(ev["id"], int(ev["midi"]), float((onsets or {}).get(ev["id"], ev["t_sec"])))]
        spans += [(f"{ev['id']}.{j}", int(h["midi"]), float(h["t_sec"])) for j, h in enumerate(held, 1)]
        for i, (nid, midi, t_on) in enumerate(spans):
            t_off = spans[i + 1][2] if i + 1 < len(spans) else t_end
            out.append({"id": nid, "lyric": ev["lyric"], "midi": midi, "t_on": t_on, "t_off": t_off})
    return out


def pitch_rows(clock: dict, trk: dict, onsets: dict | None = None) -> list[dict]:
    rows = []
    for ev in sung_notes(clock, onsets):
        t_on, t_off = ev["t_on"], ev["t_off"]
        a, b = nucleus_window(t_on, t_off)
        sel = np.where((trk["times"] >= a) & (trk["times"] <= b))[0]
        f0 = trk["f0"][sel]
        conf = trk["conf"][sel]
        ok = (f0 > 0) & (conf >= VOICING_MIN)
        ref = midi_hz(ev["midi"])
        row = {"id": ev["id"], "lyric": ev["lyric"], "midi": ev["midi"], "ref_hz": round(ref, 2),
               "window": [round(a, 3), round(b, 3)], "frames": int(len(sel)), "voiced_fraction": float(ok.mean()) if len(sel) else 0.0,
               "cents_mean": None, "cents_median": None, "cents_sd": None, "status": "unvoiced", "reason": ""}
        if ok.sum() >= 3:
            cents = 1200 * np.log2(f0[ok] / ref)
            w = conf[ok]
            mean = float(np.sum(cents * w) / np.sum(w))
            med = float(np.median(cents))
            row.update({"cents_mean": round(mean, 1), "cents_median": round(med, 1), "cents_sd": round(float(np.std(cents)), 1)})
            if abs(mean - med) > PITCH_OCTAVE_TRIP_CENTS:
                row["status"], row["reason"] = "untrackable", f"mean/median split {abs(mean - med):.0f} c"
            elif abs(mean) > PITCH_FAIL_CENTS:
                row["status"] = "FAIL"
            elif abs(mean) > PITCH_WARN_CENTS:
                row["status"] = "WARN"
            else:
                row["status"] = "PASS"
        elif row["voiced_fraction"] < VOICING_MIN:
            row["status"], row["reason"] = "unvoiced", f"voiced {row['voiced_fraction']:.0%} of the nucleus"
        rows.append(row)
    return rows


# Pitch is read by two instruments, as timing is (cross_check above): FCPE reads
# every note, and pYIN re-reads only the notes FCPE does not pass, over that note's
# own window plus some context. A note fails only when both trackers say it is off,
# so one tracker's octave slip or voicing miss cannot fail a note on its own.
# Measured 2026-10-07: on 721 notes of real hymn takes FCPE's per-note median sat
# a median 2.7 c from pYIN's and over 25 c on 1% of notes; FCPE takes 0.2 s a take,
# pYIN over a whole take about 3 minutes.
PITCH_RANK = {"PASS": 0, "WARN": 1, "FAIL": 2, "untrackable": 3, "unvoiced": 3}
PITCH_RECHECK_PAD_S = 0.25
PITCH_OFF = ("FAIL", "untrackable", "unvoiced")   # the statuses that decide the verdict; WARN does not


def recheck_pitch(rows: list[dict], alt: dict[str, dict]) -> dict:
    """Merge the second tracker's reading into the rows it re-read. `alt` maps a
    note id to pYIN's row for it. The better status stands; a note the second
    tracker reads within the gate (PASS or WARN) is "rescued"; one still FAIL,
    untrackable or unvoiced after both readings is "both_off"; otherwise "confirmed".
    Returns the summary for the receipt."""
    rescued, both = [], []
    for r in rows:
        x = alt.get(r["id"])
        if x is None:
            continue
        r["pyin_cents_mean"] = x["cents_mean"]
        r["pyin_status"] = x["status"]
        if PITCH_RANK[x["status"]] < PITCH_RANK[r["status"]]:
            r.update({"cents_mean": x["cents_mean"], "cents_median": x["cents_median"], "cents_sd": x["cents_sd"],
                      "status": x["status"], "reason": x.get("reason", ""), "tracker": "pyin"})
        if r["status"] in PITCH_OFF:
            r["cross_check"] = "both_off"           # neither tracker passes it
            both.append(r["id"])
        elif r.get("tracker") == "pyin":
            r["cross_check"] = "rescued"            # pYIN passes what FCPE did not
            rescued.append(r["id"])
        else:
            r["cross_check"] = "confirmed"
    return {"tracker": "pyin", "rechecked": len(alt), "rescued": len(rescued), "both_off": len(both),
            "rescued_ids": rescued, "both_off_ids": both}


def pyin_recheck(clock: dict, mono: np.ndarray, sr: int, rows: list[dict], onsets: dict | None) -> dict[str, dict]:
    """pYIN's rows for the notes FCPE puts off (FAIL, untrackable, unvoiced), each
    read from its own window. A WARN does not decide the verdict, so it is not re-read."""
    alt = {}
    for r in rows:
        if r["status"] not in PITCH_OFF:
            continue
        a, b = r["window"]
        lo = max(0, int((a - PITCH_RECHECK_PAD_S) * sr))
        hi = min(len(mono), int((b + PITCH_RECHECK_PAD_S) * sr))
        seg = track_f0(mono[lo:hi], sr, "pyin")
        seg = {**seg, "times": seg["times"] + lo / sr}
        got = [x for x in pitch_rows(clock, seg, onsets) if x["id"] == r["id"]]
        if got:
            alt[r["id"]] = got[0]
    return alt


def pitch_gate(rows: list[dict]) -> dict:
    means = [r["cents_mean"] for r in rows if r["cents_mean"] is not None and r["status"] in ("PASS", "WARN", "FAIL")]
    global_offset = float(np.median(means)) if means else None
    scatter = float(np.std(means)) if len(means) > 1 else None
    per_note_pass = all(r["status"] in ("PASS", "WARN") for r in rows)
    global_pass = global_offset is not None and abs(global_offset) <= PITCH_GLOBAL_FAIL_CENTS
    return {"verdict": "PASS" if per_note_pass and global_pass else "FAIL",
            "per_note": {"pass": per_note_pass, "fail_cents": PITCH_FAIL_CENTS, "warn_cents": PITCH_WARN_CENTS,
                         "warn": [r["id"] for r in rows if r["status"] == "WARN"],
                         "fail": [r["id"] for r in rows if r["status"] not in ("PASS", "WARN")]},
            "global_offset_cents": None if global_offset is None else round(global_offset, 1),
            "global_pass": global_pass, "global_fail_cents": PITCH_GLOBAL_FAIL_CENTS,
            "scatter_sd_cents": None if scatter is None else round(scatter, 1),
            "scatter_warn": scatter is not None and scatter > PITCH_SCATTER_WARN_CENTS,
            "rows": rows}


def cmd_pitch(a):
    clock = load_clock(a.clock)
    mono, sr, frames = read_audio(a.vocal)
    onsets = None
    if a.verify_receipt:
        rec = json.load(open(a.verify_receipt, encoding="utf-8"))
        onsets = {t["id"]: t["t_vowel"] for t in rec["table"] if t.get("t_vowel") is not None}
    trk = track_f0(mono, sr, a.tracker)
    rows = pitch_rows(clock, trk, onsets)
    recheck = None
    if trk["tracker"] == "fcpe" and not a.no_recheck:
        recheck = recheck_pitch(rows, pyin_recheck(clock, mono, sr, rows, onsets))
    res = pitch_gate(rows)
    res["tracker"] = trk["tracker"]
    if recheck is not None:
        res["recheck"] = recheck
    if a.cross_check and trk["tracker"] != "swift-f0":
        try:
            alt = pitch_rows(clock, track_f0(mono, sr, "swift"), onsets)
            for r, x in zip(rows, alt):
                r["cents_swift"] = x["cents_mean"]
                r["tracker_disagree"] = (r["cents_mean"] is not None and x["cents_mean"] is not None and abs(r["cents_mean"] - x["cents_mean"]) > 20)
            res["cross_check"] = {"tracker": "swift-f0", "disagree_ids": [r["id"] for r in rows if r.get("tracker_disagree")]}
        except SystemExit as e:
            res["cross_check"] = {"tracker": "swift-f0", "error": str(e)}
    res["vocal"] = a.vocal.replace("\\", "/")
    res["vocal_sha256"] = sha256(a.vocal)
    res["onsets_from"] = a.verify_receipt.replace("\\", "/") if a.verify_receipt else "clock t_sec"
    print(f"{'id':4} {'lyric':7} {'midi':>4} {'ref_hz':>7} {'mean_c':>7} {'med_c':>7} {'sd_c':>6} {'voiced':>6}  status")
    for r in rows:
        f = lambda v, w: ("-" * 1).rjust(w) if v is None else f"{v:{w}.1f}"
        sw = "" if r.get("cents_swift") is None else f" swift {r['cents_swift']:+.0f}c{' DISAGREE' if r.get('tracker_disagree') else ''}"
        print(f"{r['id']:4} {r['lyric']:7} {r['midi']:4d} {r['ref_hz']:7.1f} {f(r['cents_mean'], 7)} {f(r['cents_median'], 7)} {f(r['cents_sd'], 6)} {r['voiced_fraction']:6.0%}  {r['status']} {r['reason']}{sw}")
    if recheck is not None:
        print(f"  recheck pyin: {recheck['rechecked']} notes re-read, {recheck['rescued']} rescued, {recheck['both_off']} off on both")
    print(f"  tracker {trk['tracker']}; global offset {res['global_offset_cents']} c ({'PASS' if res['global_pass'] else 'FAIL'} @ {PITCH_GLOBAL_FAIL_CENTS}); "
          f"scatter SD {res['scatter_sd_cents']} c{' WARN' if res['scatter_warn'] else ''}")
    print(f"PITCH {res['verdict']}")
    if a.receipt:
        json.dump(res, open(a.receipt, "w", encoding="utf-8"), indent=2)
        print(f"receipt -> {a.receipt}")
    return 0 if res["verdict"] == "PASS" else 1


# ─── CLI ─────────────────────────────────────────────────────────────────────

def load_clock(path: str) -> dict:
    clock = json.load(open(path, encoding="utf-8"))
    if clock.get("schema") != "ai-jam-sessions/score-clock/v1":
        raise SystemExit(f"{path}: not a score-clock v1")
    clock["_path"] = path.replace("\\", "/")
    return clock


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def cmd_bed_check(a):
    clock = load_clock(a.clock)
    mono, sr, frames = read_audio(a.bed)
    receipt_path = a.render_receipt or re.sub(r"\.wav$", ".receipt.json", a.bed)
    render_receipt = json.load(open(receipt_path, encoding="utf-8")) if os.path.exists(receipt_path) else None
    if render_receipt and render_receipt.get("sha256") != sha256(a.bed):
        raise SystemExit(f"{receipt_path} is not the receipt of {a.bed} (sha256 differs)")
    res = bed_onsets(clock, mono, sr, render_receipt)
    res["bed"] = a.bed.replace("\\", "/")
    res["render_receipt"] = receipt_path.replace("\\", "/") if render_receipt else None
    res["bed_frames"] = frames
    res["length_pass"] = frames == int(clock["total_samples"])
    print(f"{'id':4} {'t_score':>8} {'t_noteon':>9} {'late_ms':>8} {'sound_ms':>8}  result")
    for r in res["rows"]:
        tn = "      -" if r["t_noteon"] is None else f"{r['t_noteon']:9.4f}"
        lm = "     -" if r["late_ms"] is None else f"{r['late_ms']:8.3f}"
        am = "     -" if r["acoustic_ms"] is None else f"{r['acoustic_ms']:8.2f}"
        print(f"{r['id']:4} {r['t_score']:8.4f} {tn} {lm} {am}  {'PASS' if r['pass'] else 'FAIL'}  {r['note']}")
    print(f"engine {res['engine']}; acoustic latency at from-silence onsets: {res['acoustic_latency_ms']}")
    print(f"bed frames {frames} clock frames {clock['total_samples']} {'PASS' if res['length_pass'] else 'FAIL'}")
    ok = res["pass"] and res["length_pass"]
    print(f"BED {'PASS' if ok else 'FAIL'}")
    if a.out:
        json.dump(res, open(a.out, "w", encoding="utf-8"), indent=2)
    return 0 if ok else 1


def cmd_transcribe(a):
    import comfy_rest
    vo = _vo_graphs()
    key = comfy_rest.api_key()
    graph = vo.transcribe(a.key, a.prefix)
    recs = comfy_rest.run_graph(graph, key, os.path.dirname(a.out) or ".", want_ext=(".json", ".txt"))
    raw = open(recs[0]["path"], "rb").read()
    text = raw.decode("utf-8")
    try:
        parsed = json.loads(text)
        if isinstance(parsed, str):
            parsed = json.loads(parsed)
    except json.JSONDecodeError:
        raise SystemExit(f"transcript is not JSON: {text[:300]!r}")
    json.dump(parsed, open(a.out, "w", encoding="utf-8"), indent=1)
    words = load_words(a.out)
    print(f"{len(words)} words, speakers {sorted({w['speaker'] for w in words})}: " + " ".join(f"{w['raw']}@{w['start']:.2f}" for w in words))
    return 0


def cmd_plan(a):
    clock = load_clock(a.clock)
    words = load_words(a.words)
    mono, sr, frames = read_audio(a.take)
    if sr != int(clock["sample_rate"]):
        raise SystemExit(f"take is {sr} Hz, clock is {clock['sample_rate']} Hz")
    plan = build_plan(clock, words, mono, sr, source_key=a.source_key or "", strict=not a.lenient)
    for sk in plan["skipped"]:
        print(f"SKIP {sk['id']}: {sk['reason']}")
    plan["take"] = {"path": a.take.replace("\\", "/"), "frames": frames, "seconds": frames / sr, "sha256": sha256(a.take)}
    plan["words"] = a.words.replace("\\", "/")
    json.dump(plan, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"{'id':4} {'lyric':7} {'t_sec':>8} {'vowel@src':>9} {'cut':>15} {'clip':>6} {'lead':>8}  note")
    for c in plan["cuts"]:
        print(f"{c['id']:4} {c['lyric']:7} {c['t_sec']:8.4f} {c['src_vowel_onset']:9.4f} [{c['cut_start']:6.3f},{c['cut_end']:6.3f}] {c['clip_seconds']:6.3f} {c['lead']:8.4f}  {c['note']}")
    print(f"wrote {a.out}")
    return 0


def cmd_seed_take(a):
    """A Seed Audio take from the Kokoro lock, held slow: the bag of takes."""
    import comfy_rest
    vo = _vo_graphs()
    key = comfy_rest.api_key()
    ref = a.reference_key or comfy_rest.upload_file(a.reference, key, "audio/wav")
    graph = vo.bytedance_audio_reference(ref, a.prompt, a.prefix, seed=a.seed)
    graph["2"]["inputs"]["speech_rate"] = int(a.speech_rate)
    recs = comfy_rest.run_graph(graph, key, a.out_dir, want_ext=(".flac", ".wav"))
    rec = recs[0]
    mono, sr, frames = read_audio(rec["path"])
    info = {"job": rec["job"], "key": rec["filename"], "path": rec["path"].replace("\\", "/"), "frames": frames, "sample_rate": sr,
            "seconds": frames / sr, "sha256": sha256(rec["path"]), "reference_key": ref, "prompt": a.prompt,
            "speech_rate": int(a.speech_rate), "seed": a.seed}
    json.dump(info, open(a.out_info, "w", encoding="utf-8"), indent=2)
    print(f"take key {rec['filename']} {frames / sr:.2f}s -> {a.out_info}")
    return 0


def cmd_merge(a):
    plans = [json.load(open(p, encoding="utf-8")) for p in a.plans]
    out = merge_plans(plans)
    json.dump(out, open(a.out, "w", encoding="utf-8"), indent=2)
    for c in out["cuts"]:
        print(f"{c['id']:4} {c['lyric']:7} clip {c['clip_seconds']:6.3f} placed [{c['placed_start']:7.3f},{c['placed_end']:7.3f}] {c['source_key'][:12]}  {c['note'].split('; ')[-1]}")
    print(f"wrote {a.out}")
    return 0


def cmd_upload(a):
    """Push a local wav to the cloud as an input; print the key LoadAudio accepts."""
    import comfy_rest
    key = comfy_rest.api_key()
    name = comfy_rest.upload_file(a.path, key, "audio/wav")
    print(f"KEY {name}")
    return 0


def cmd_place(a):
    plan = json.load(open(a.plan, encoding="utf-8"))
    if a.local:
        import soundfile as sf
        take_paths = dict(kv.split("=", 1) for kv in a.take) if a.take else {}
        keys = sorted({c.get("source_key") or a.key or "" for c in plan["cuts"]})
        sources = {}
        for k in keys:
            path = take_paths.get(k) or (k if os.path.exists(k) else None) or (plan.get("take", {}) or {}).get("path")
            if not path or not os.path.exists(path):
                raise SystemExit(f"--local needs the take for key {k}: pass --take {k}=<wav>")
            data, sr = sf.read(path, always_2d=True, dtype="float64")
            if sr != plan["sample_rate"]:
                raise SystemExit(f"{path} is {sr} Hz, plan is {plan['sample_rate']} Hz")
            sources[k] = data
        if a.warp:
            clock = load_clock(plan["clock"]) if isinstance(plan.get("clock"), str) and os.path.exists(plan["clock"]) else None
            if clock is None:
                print("warp: the plan's clock was not found, so runs are not ended at the score's rests")
            out, joins = place_warp(plan, sources, int(plan["sample_rate"]), clock)
        else:
            out, joins = place_local(plan, sources, int(plan["sample_rate"]))
        os.makedirs(a.out_dir, exist_ok=True)
        path = os.path.join(a.out_dir, "placed-local.wav")
        sf.write(path, out, int(plan["sample_rate"]), subtype="PCM_16")
        info = {"mode": "local-warp" if a.warp else "local", "key": None, "path": path.replace("\\", "/"), "frames": int(out.shape[0]), "sample_rate": int(plan["sample_rate"]),
                "seconds": out.shape[0] / plan["sample_rate"], "sha256": sha256(path), "plan": a.plan.replace("\\", "/"),
                "fade_s": FADE_S, "xfade_s": XFADE_S, "join_extend_max_s": JOIN_EXTEND_MAX_S, "joins": joins}
        json.dump(info, open(a.out_info, "w", encoding="utf-8"), indent=2)
        gaps = [j for j in joins if j["gap_ms"] > 0]
        if a.warp:
            ratios = [j["stretch"] for j in joins if j.get("stretch")]
            print(f"warp: {len({j['run'] for j in joins})} runs; stretch {min(ratios, default=1):.2f}-{max(ratios, default=1):.2f}")
        print(f"placed (local{'-warp' if a.warp else ''}) {path} frames {out.shape[0]} ({out.shape[0] / plan['sample_rate']:.4f}s); crossfade {XFADE_S * 1000:.0f} ms; "
              f"{len(gaps)} joins left air: " + (", ".join(f"{j['id']} {j['gap_ms']}ms" for j in gaps) or "none"))
        return 0
    import comfy_rest
    graph = placed_vocal_graph(a.key, plan, a.prefix)
    if a.dry_run:
        json.dump(graph, open(a.out_graph, "w", encoding="utf-8"), indent=1)
        print(f"graph: {len(graph)} nodes -> {a.out_graph} (dry run, nothing submitted)")
        return 0
    key = comfy_rest.api_key()
    json.dump(graph, open(a.out_graph, "w", encoding="utf-8"), indent=1)
    recs = comfy_rest.run_graph(graph, key, a.out_dir, want_ext=(".flac", ".wav"))
    rec = recs[0]
    mono, sr, frames = read_audio(rec["path"])
    info = {"job": rec["job"], "key": rec["filename"], "subfolder": rec["subfolder"], "path": rec["path"].replace("\\", "/"),
            "frames": frames, "sample_rate": sr, "seconds": frames / sr, "sha256": sha256(rec["path"]),
            "plan": a.plan.replace("\\", "/"), "graph_nodes": len(graph)}
    json.dump(info, open(a.out_info, "w", encoding="utf-8"), indent=2)
    print(f"placed stem key {rec['filename']} frames {frames} ({frames / sr:.4f}s) -> {a.out_info}")
    return 0


def cmd_verify(a):
    clock = load_clock(a.clock)
    mono, sr, frames = read_audio(a.vocal)
    if sr != int(clock["sample_rate"]):
        raise SystemExit(f"vocal is {sr} Hz, clock is {clock['sample_rate']} Hz")
    bed_frames = read_audio(a.bed)[2] if a.bed else None
    words = load_words(a.words) if a.words else None
    plan = json.load(open(a.plan, encoding="utf-8")) if a.plan else None
    rows = measure_events(clock, mono, sr, plan)
    aligner = None
    if a.aligner:
        import onset_aligner
        work = a.aligner_work or os.path.join(os.path.dirname(os.path.abspath(a.receipt or a.vocal)), "aligner")
        aligner = onset_aligner.align_phrases(a.vocal, clock, work)
    result = gate(clock, rows, words, frames, bed_frames, plan, aligner)
    result["artifacts"] = {"clock": clock["_path"], "vocal": a.vocal.replace("\\", "/"), "vocal_sha256": sha256(a.vocal),
                           "bed": a.bed.replace("\\", "/") if a.bed else None, "bed_sha256": sha256(a.bed) if a.bed else None,
                           "words": a.words.replace("\\", "/") if a.words else None, "plan": a.plan.replace("\\", "/") if a.plan else None}
    result["detector"] = detector_info()
    print_table(result)
    if a.receipt:
        json.dump(result, open(a.receipt, "w", encoding="utf-8"), indent=2)
        print(f"receipt -> {a.receipt}")
    return 0 if result["verdict"] == "PASS" else 1


def cmd_mix(a):
    if not a.local:
        import comfy_rest
        vo = _vo_graphs()
        key = comfy_rest.api_key()
    bed_mono, sr, bed_frames = read_audio(a.bed)
    vo_mono, vsr, vo_frames = read_audio(a.vocal)
    if abs(bed_frames - vo_frames) > 1:
        raise SystemExit(f"refusing to mix: bed {bed_frames} frames, vocal {vo_frames} frames")
    plan = json.load(open(a.plan, encoding="utf-8"))
    # gain-stage from a meter: vocal measured over its placed clips, bed over its whole length
    idx = np.zeros(vo_frames, dtype=bool)
    for c in plan["cuts"]:
        idx[int(c["placed_start"] * vsr):int(c["placed_end"] * vsr)] = True   # interior syllables mirror their word clip
    vo_db = rms_db(vo_mono[idx])
    bed_db = rms_db(bed_mono)
    bed_lin = 10 ** (a.bed_gain_db / 20)
    want = bed_db + a.bed_gain_db + a.vocal_over_bed_db - vo_db
    # headroom: AudioMix sums, so the two peaks must fit under HEADROOM_PEAK
    # together (the first mix of this run clipped at +15 dB — measured, not vibes)
    bed_peak = float(np.abs(bed_mono).max()) * bed_lin
    vo_peak = float(np.abs(vo_mono).max())
    room = max(1e-6, HEADROOM_PEAK - bed_peak)
    cap = 20 * np.log10(room / max(vo_peak, 1e-6))
    vo_gain = int(np.floor(min(want, cap)))
    vo_gain = max(-24, min(24, vo_gain))
    print(f"bed {bed_db:.1f} dB RMS peak {bed_peak / bed_lin:.2f} (@{a.bed_gain_db:+.1f} dB -> {bed_peak:.2f}); "
          f"vocal (in clips) {vo_db:.1f} dB RMS peak {vo_peak:.2f}; wanted {want:+.1f} dB, headroom cap {cap:+.1f} dB "
          f"-> AudioAdjustVolume {vo_gain:+d} dB (vocal {vo_db + vo_gain - bed_db - a.bed_gain_db:+.1f} dB over bed)")
    if a.local:
        import soundfile as sf
        bed_st, _ = sf.read(a.bed, always_2d=True, dtype="float64")
        vo_st, _ = sf.read(a.vocal, always_2d=True, dtype="float64")
        n = min(len(bed_st), len(vo_st))
        out = mix_local(bed_st[:n], vo_st[:n], vo_gain, a.bed_gain_db)
        os.makedirs(a.out_dir, exist_ok=True)
        path = os.path.join(a.out_dir, "mix-local.wav")
        sf.write(path, out, sr, subtype="PCM_16")
        info = {"mode": "local", "path": path.replace("\\", "/"), "frames": int(n), "sample_rate": sr, "vo_gain_db": vo_gain, "bed_gain_db": a.bed_gain_db,
                "bed_rms_db": round(bed_db, 2), "vocal_clip_rms_db": round(vo_db, 2), "mix_peak": float(np.abs(out).max()), "mix_rms_db": round(rms_db(out.mean(axis=1)), 2),
                "sha256": sha256(path), "length_match": abs(len(bed_st) - len(vo_st)) <= 1}
        json.dump(info, open(a.out_info, "w", encoding="utf-8"), indent=2)
        print(f"mix (local) {path} frames {n} peak {info['mix_peak']:.3f} length_match={info['length_match']} -> {a.out_info}")
        return 0 if info["length_match"] else 1
    bed_key = comfy_rest.upload_file(a.bed, key, "audio/wav")
    graph = vo.mix_dialogue_anchored(bed_key, a.vocal_key, a.prefix, vo_gain_db=vo_gain, bed_gain_db=a.bed_gain_db)
    recs = comfy_rest.run_graph(graph, key, a.out_dir, want_ext=(".flac", ".wav"))
    rec = recs[0]
    mono, msr, frames = read_audio(rec["path"])
    info = {"job": rec["job"], "key": rec["filename"], "path": rec["path"].replace("\\", "/"), "frames": frames, "sample_rate": msr,
            "bed_key": bed_key, "vocal_key": a.vocal_key, "vo_gain_db": vo_gain, "bed_gain_db": a.bed_gain_db,
            "bed_rms_db": round(bed_db, 2), "vocal_clip_rms_db": round(vo_db, 2), "sha256": sha256(rec["path"]),
            "mix_peak": float(np.abs(mono).max()), "mix_rms_db": round(rms_db(mono), 2),
            "length_match": abs(frames - bed_frames) <= 1}
    json.dump(info, open(a.out_info, "w", encoding="utf-8"), indent=2)
    print(f"mix {rec['filename']} frames {frames} ({frames / msr:.4f}s) length_match={info['length_match']} -> {a.out_info}")
    return 0 if info["length_match"] else 1


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("bed-check"); s.add_argument("--clock", required=True); s.add_argument("--bed", required=True); s.add_argument("--render-receipt"); s.add_argument("--out"); s.set_defaults(fn=cmd_bed_check)
    s = sub.add_parser("transcribe"); s.add_argument("--key", required=True); s.add_argument("--out", required=True); s.add_argument("--prefix", default="jam/vocal-clock/words"); s.set_defaults(fn=cmd_transcribe)
    s = sub.add_parser("plan"); s.add_argument("--clock", required=True); s.add_argument("--words", required=True); s.add_argument("--take", required=True); s.add_argument("--source-key", default=""); s.add_argument("--lenient", action="store_true", help="skip events this take cannot date (bag of takes)"); s.add_argument("--out", required=True); s.set_defaults(fn=cmd_plan)
    s = sub.add_parser("seed-take"); s.add_argument("--reference", default="tmp/kokoro-lock/lock.wav"); s.add_argument("--reference-key"); s.add_argument("--prompt", required=True)
    s.add_argument("--speech-rate", type=int, default=-50); s.add_argument("--seed", type=int, default=42); s.add_argument("--out-dir", required=True); s.add_argument("--out-info", required=True); s.add_argument("--prefix", default="jam/vocal-clock/take"); s.set_defaults(fn=cmd_seed_take)
    s = sub.add_parser("merge"); s.add_argument("--plans", nargs="+", required=True); s.add_argument("--out", required=True); s.set_defaults(fn=cmd_merge)
    s = sub.add_parser("upload"); s.add_argument("--path", required=True); s.set_defaults(fn=cmd_upload)
    s = sub.add_parser("repin"); s.add_argument("--clock", required=True); s.add_argument("--verify-receipt"); s.add_argument("--take"); s.add_argument("--source-key", default="")
    s.add_argument("--candidate", action="append", help="word-level bag of takes: <take.wav>=<verify receipt.json> (repeat)")
    s.add_argument("--split-words", action="store_true", help="treat every syllable as its own word (use with a --syllable-words target)"); s.add_argument("--out", required=True)
    s.add_argument("--by-phrase", action="store_true", help="one take per phrase (rank_phrases), never a join between takes inside a phrase")
    s.add_argument("--phrase-scores", help="phrase_scores.py output: per take and phrase, intelligibility and pitch")
    s.add_argument("--phrase-gap", type=float, default=0.3, help="a rest this long ends a phrase (default 0.3 s)"); s.set_defaults(fn=cmd_repin)
    s = sub.add_parser("place"); s.add_argument("--plan", required=True); s.add_argument("--key", default=""); s.add_argument("--out-dir", required=True)
    s.add_argument("--out-info", required=True); s.add_argument("--out-graph", required=True); s.add_argument("--prefix", default="jam/vocal-clock/placed"); s.add_argument("--dry-run", action="store_true")
    s.add_argument("--local", action="store_true", help="place with numpy (fades + crossfaded joins) instead of the cloud"); s.add_argument("--take", action="append", help="--local: <source_key>=<wav path>")
    s.add_argument("--warp", action="store_true", help="--local: time-warp each run of one take onto the clock instead of cutting every syllable (no replayed or skipped audio at joins)"); s.set_defaults(fn=cmd_place)
    s = sub.add_parser("verify"); s.add_argument("--clock", required=True); s.add_argument("--vocal", required=True); s.add_argument("--bed"); s.add_argument("--words"); s.add_argument("--plan"); s.add_argument("--receipt")
    s.add_argument("--aligner", action="store_true", help="cross-check onsets with the singing forced aligner (onset_aligner.py): a detector miss the aligner places on time is rescued")
    s.add_argument("--aligner-work", help="work directory for the aligner (default: an aligner/ folder next to the receipt)"); s.set_defaults(fn=cmd_verify)
    s = sub.add_parser("pitch"); s.add_argument("--clock", required=True); s.add_argument("--vocal", required=True); s.add_argument("--verify-receipt"); s.add_argument("--tracker", default="fcpe", choices=["fcpe", "auto", "swift", "pyin"], help="default fcpe, with pYIN re-reading the notes it does not pass ('auto' and 'pyin' are pYIN alone)"); s.add_argument("--no-recheck", action="store_true", help="fcpe alone, without pYIN's second reading"); s.add_argument("--cross-check", action="store_true"); s.add_argument("--receipt"); s.set_defaults(fn=cmd_pitch)
    s = sub.add_parser("mix"); s.add_argument("--bed", required=True); s.add_argument("--vocal", required=True); s.add_argument("--vocal-key", default=""); s.add_argument("--plan", required=True); s.add_argument("--local", action="store_true", help="mix with numpy instead of the cloud")
    s.add_argument("--out-dir", required=True); s.add_argument("--out-info", required=True); s.add_argument("--prefix", default="jam/vocal-clock/mix")
    s.add_argument("--vocal-over-bed-db", type=float, default=4.0); s.add_argument("--bed-gain-db", type=float, default=-9.0); s.set_defaults(fn=cmd_mix)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
