"""The one-voice gate: where a placed vocal has voice it should not, and none where it should.

    E:/AI/envs/pyannote/Scripts/python.exe scripts/voice_gate.py --clock scores/<song>.score-clock.v1.json \
        --vocal <run>/placed-local.wav --receipt <run>/voice-gate.json [--device cpu|cuda]

A speech-segmentation model (pyannote/segmentation-3.0, MIT; gated on Hugging Face, so
HF_TOKEN must be set) labels every 17 ms frame of the vocal with how many voices sound
in it. It was trained on speech, but on a placed vocal it separates sung frames from
rests cleanly (the Battle Hymn, 2026-10-08: mean voice 0.98 in sung frames, 0.08 in
rests). Against the score clock it reports three things:

  - voice in a rest: a separate patch of voice where the score has none. The Director
    heard the honks there: the singer's noise where two rendered segments meet, carried
    into the mix. Voice that runs on from the note before is that note held and released
    (placement holds phrase endings into the rest), and is flagged only past MAX_HELD_S.
  - two voices: overlap longer than a crossfade, inside a sung note (two takes, or a
    take's echo, singing over each other).
  - a silent note: a sung note the model hears no voice in.

It needs its own environment (E:/AI/envs/pyannote: torch 2.11 + torchaudio 2.11 cu130,
pyannote.audio 4.0.7), so it never disturbs the SoulX-Singer one. Audio reaches the
model as a waveform, never through pyannote's file decoder. Exit 0 when nothing is
flagged, 1 when something is (with the list), 2 on bad input.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

MODEL = "pyannote/segmentation-3.0"
SR = 16000
STEP_S = 2.5                 # chunk hop for the 10 s model window: each frame is seen four times
VOICE_ON = 0.5
OVERLAP_ON = 0.5
LEAD_S = 0.15                # a syllable's consonant may start this long before its clock onset
RELEASE_S = 0.45             # a phrase's last note rings this long past its end (hold release + fade)
MIN_REST_VOICE_S = 0.12      # shorter blips in a rest are breath and reverb, not a voice
MIN_OVERLAP_S = 0.10         # two crossfaded takes overlap for 50 ms by design
SILENT_NOTE_VOICE = 0.2      # a note whose median voice is below this was not heard (0.25 = one of the
                             # four chunks that see a frame: a soft held ending, not silence)
MAX_HELD_S = 1.6             # a held release longer than this into a rest is flagged too


def frames(x: np.ndarray, sr: int, device: str = "cpu") -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(t, voice, overlap) per model frame: voice is the most active voice's probability,
    overlap the second's, averaged over every chunk that saw the frame. Which voice is
    which can change between chunks; the strongest and the second strongest cannot."""
    import torch
    import torchaudio.functional as AF
    from pyannote.audio import Inference, Model

    model = Model.from_pretrained(MODEL, token=os.environ.get("HF_TOKEN"))
    mono = x.mean(axis=1) if x.ndim > 1 else x
    y = AF.resample(torch.from_numpy(mono.astype(np.float32)), sr, SR)
    inf = Inference(model, step=STEP_S, device=torch.device(device))
    act = inf({"waveform": y[None], "sample_rate": SR})
    a = np.sort(act.data, axis=2)
    nch, nfr, _ = a.shape
    win = act.sliding_window
    fstep = win.duration / nfr
    n = int(np.ceil(len(y) / SR / fstep))
    acc = np.zeros((n, 2))
    cnt = np.zeros(n)
    for k in range(nch):
        i0 = int(round(win[k].start / fstep))
        i1 = min(n, i0 + nfr)
        if i1 <= i0:
            continue
        acc[i0:i1, 0] += a[k, : i1 - i0, -1]
        acc[i0:i1, 1] += a[k, : i1 - i0, -2]
        cnt[i0:i1] += 1
    cnt[cnt == 0] = 1
    t = (np.arange(n) + 0.5) * fstep
    return t, acc[:, 0] / cnt, acc[:, 1] / cnt


def note_spans(clock: dict) -> list[tuple[str, str, float, float]]:
    """(id, lyric, start, end) of every sung syllable, melismas included."""
    out = []
    for e in clock["events"]:
        m = e.get("melisma") or []
        end = m[-1]["t_sec"] + m[-1]["dur_sec"] if m else e["t_sec"] + e["dur_sec"]
        out.append((e["id"], e["lyric"], float(e["t_sec"]), float(end)))
    return out


def runs(mask: np.ndarray, t: np.ndarray) -> list[tuple[int, int]]:
    """Index ranges [i, j) where mask is true."""
    out, i = [], None
    for k, v in enumerate(mask):
        if v and i is None:
            i = k
        elif not v and i is not None:
            out.append((i, k))
            i = None
    if i is not None:
        out.append((i, len(mask)))
    return out


def judge(t: np.ndarray, voice: np.ndarray, overlap: np.ndarray, clock: dict) -> dict:
    spans = note_spans(clock)
    step = float(t[1] - t[0]) if len(t) > 1 else 0.017
    sung = np.zeros(len(t), dtype=bool)
    allowed = np.zeros(len(t), dtype=bool)
    for _, _, s, e in spans:
        sung |= (t >= s) & (t < e)
        allowed |= (t >= s - LEAD_S) & (t < e + RELEASE_S)
    rest_voice, held = [], []
    on = voice > VOICE_ON
    for i, j in runs(on, t):
        outside = ~allowed[i:j]
        if not outside.any():
            continue
        if allowed[i:j].any():
            # voice that runs on from a sung note into the rest is the note held and released
            # (placement holds a phrase's last note into the rest); only an over-long one is flagged
            dur = float(outside.sum()) * step
            if dur > MAX_HELD_S:
                held.append({"t": round(float(t[i:j][outside][0]), 3), "dur_s": round(dur, 3)})
            continue
        dur = (j - i) * step
        if dur >= MIN_REST_VOICE_S:
            rest_voice.append({"t": round(float(t[i]), 3), "dur_s": round(dur, 3), "peak": round(float(voice[i:j].max()), 3)})
    two_voices = []
    for i, j in runs((overlap > OVERLAP_ON) & sung, t):
        dur = (j - i) * step
        if dur >= MIN_OVERLAP_S:
            two_voices.append({"t": round(float(t[i]), 3), "dur_s": round(dur, 3), "peak": round(float(overlap[i:j].max()), 3)})
    silent = []
    for eid, lyric, s, e in spans:
        m = (t >= s) & (t < e)
        if m.any() and float(np.median(voice[m])) < SILENT_NOTE_VOICE:
            silent.append({"id": eid, "lyric": lyric, "t": round(s, 3), "median_voice": round(float(np.median(voice[m])), 3)})
    flagged = len(rest_voice) + len(held) + len(two_voices) + len(silent)
    return {
        "verdict": "PASS" if flagged == 0 else "FLAGGED",
        "voice_in_rest": rest_voice,
        "overlong_release": held,
        "two_voices": two_voices,
        "silent_notes": silent,
        "stats": {
            "frames": int(len(t)), "frame_s": round(step, 5),
            "voice_mean_sung": round(float(voice[sung].mean()), 3) if sung.any() else None,
            "voice_mean_rest": round(float(voice[~allowed].mean()), 3) if (~allowed).any() else None,
            "overlap_frames_sung_pct": round(float((overlap[sung] > OVERLAP_ON).mean() * 100), 2) if sung.any() else None,
        },
        "params": {"model": MODEL, "voice_on": VOICE_ON, "overlap_on": OVERLAP_ON, "lead_s": LEAD_S, "release_s": RELEASE_S,
                   "min_rest_voice_s": MIN_REST_VOICE_S, "max_held_s": MAX_HELD_S, "min_overlap_s": MIN_OVERLAP_S, "silent_note_voice": SILENT_NOTE_VOICE},
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--clock", required=True)
    ap.add_argument("--vocal", required=True, help="the placed vocal stem (not the mix: the piano would read as voice)")
    ap.add_argument("--receipt", required=True)
    ap.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    ap.add_argument("--frames", help="also save the per-frame voice and overlap here (.npz)")
    a = ap.parse_args()
    import soundfile as sf

    try:
        clock = json.load(open(a.clock, encoding="utf-8"))
        x, sr = sf.read(a.vocal, dtype="float32")
    except (OSError, ValueError, RuntimeError) as e:
        print(f"voice gate: cannot read input: {e}", file=sys.stderr)
        return 2
    t, voice, overlap = frames(x, sr, a.device)
    if a.frames:
        np.savez(a.frames, t=t, voice=voice, overlap=overlap)
    r = judge(t, voice, overlap, clock)
    r.update({"vocal": a.vocal.replace("\\", "/"), "clock": a.clock.replace("\\", "/"), "schema": "ai-jam-sessions/voice-gate/v1"})
    with open(a.receipt, "w", encoding="utf-8") as f:
        json.dump(r, f, indent=2)
    s = r["stats"]
    print(f"voice gate {r['verdict']}: {len(r['voice_in_rest'])} voice-in-rest, {len(r['overlong_release'])} over-long release, {len(r['two_voices'])} two-voice, "
          f"{len(r['silent_notes'])} silent notes (voice sung {s['voice_mean_sung']}, rest {s['voice_mean_rest']})")
    for k in ("voice_in_rest", "overlong_release", "two_voices", "silent_notes"):
        for item in r[k][:12]:
            print(f"  {k}: {json.dumps(item)}")
    return 0 if r["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
