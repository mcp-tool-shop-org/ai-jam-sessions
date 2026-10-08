#!/usr/bin/env python3
"""Score every take, phrase by phrase, for the phrase-by-phrase pick.

    python scripts/phrase_scores.py --clock scores/<song>.score-clock.v1.json \
        --run tmp/vocal-clock/sing/<song> --out <run>/phrase-scores.json --start-server

For each take (`<run>/take-NN/take-48k.wav`, with the `verify-energy.json` that
sing_clock.py writes) and each phrase (the clock split at its rests):

  - intelligibility: the share of the phrase's words a local listener heard, in
    order. The listener is Qwen3-Omni (GGUF, llama.cpp's llama-server) given the
    phrase's audio and no lyrics. It is a listener, not a judge: on clear singing
    it writes what is sung (a half phrase comes back as that half; swapped halves
    come back swapped), but on unclear singing it may fill in a famous line from
    memory. So it only RANKS takes; it never passes or fails one.
  - the phrase's notes the pitch gate would fail (off by more than its limit,
    untrackable or unvoiced) and the mean |cents| over its notes
    (vocal_clock.pitch_rows on the raw take).

`--start-server` starts llama-server for the run and stops it after (about 24 GB
of VRAM while it runs); otherwise it talks to one already at --server. The model
and server paths come from QWEN_OMNI_DIR and LLAMA_SERVER.
"""
from __future__ import annotations

import argparse
import base64
import difflib
import glob
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import onset_aligner  # noqa: E402
import vocal_clock as vc  # noqa: E402

OMNI_DIR = os.environ.get("QWEN_OMNI_DIR", "E:/AI-Models/Qwen3-Omni-30B-A3B-Instruct-GGUF")
LLAMA_SERVER = os.environ.get("LLAMA_SERVER", "E:/AI/llama.cpp/llama-server.exe")
MODEL = "Qwen3-Omni-30B-A3B-Instruct-Q4_K_M.gguf"
MMPROJ = "mmproj-Qwen3-Omni-30B-A3B-Instruct-Q8_0.gguf"
PROMPT = ("This is an isolated sung vocal from a hymn. Transcribe exactly the words that are sung, "
          "in order, as plain lowercase words with no punctuation. Write only the words. "
          "If a word is unclear, write your best guess of what was sung; do not add words that were not sung.")


def squash(word: str) -> str:
    """A word as the comparison sees it: letters only (ev'ry = evry)."""
    return re.sub(r"[^a-z]", "", word.lower())


def heard_matches(expected: list[str], heard_text: str) -> int:
    """How many expected words the listener heard, in order. Heard words that a
    transcriber splits ("self control") are joined when the join is an expected
    word, and a word within one letter of the expected one counts ("every" for
    "ev'ry")."""
    exp = [squash(w) for w in expected]
    raw = [squash(w) for w in heard_text.split() if squash(w)]
    want = set(exp)
    heard: list[str] = []
    i = 0
    while i < len(raw):
        if i + 1 < len(raw) and raw[i] + raw[i + 1] in want and raw[i] not in want:
            heard.append(raw[i] + raw[i + 1])
            i += 2
            continue
        heard.append(raw[i])
        i += 1
    near = {h: e for h in heard for e in exp
            if h != e and len(e) >= 4 and difflib.SequenceMatcher(a=h, b=e).ratio() >= 0.85}
    heard = [near.get(h, h) for h in heard]
    sm = difflib.SequenceMatcher(a=exp, b=heard, autojunk=False)
    return sum(b.size for b in sm.get_matching_blocks())


def wav_bytes(mono, sr) -> bytes:
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, mono, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


LISTEN_TRIES = 3


def listen(server: str, wav: bytes, seed: int = 1, tries: int = LISTEN_TRIES, wait: float = 5.0) -> str:
    """The listener's transcript of one phrase. A refused or timed-out connection
    is retried: one such hiccup on 2026-10-07 threw away a 45-minute pitch pass."""
    for attempt in range(1, tries + 1):
        try:
            return _listen_once(server, wav, seed)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if attempt == tries:
                raise
            print(f"listener: {e}; retrying ({attempt}/{tries - 1})", flush=True)
            time.sleep(wait * attempt)
    raise AssertionError("unreachable")


def _listen_once(server: str, wav: bytes, seed: int = 1) -> str:
    body = {"messages": [{"role": "user", "content": [
        {"type": "input_audio", "input_audio": {"data": base64.b64encode(wav).decode(), "format": "wav"}},
        {"type": "text", "text": PROMPT}]}], "temperature": 0, "seed": seed, "max_tokens": 200}
    req = urllib.request.Request(f"{server}/v1/chat/completions", json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())["choices"][0]["message"]["content"].strip()


def start_server(port: int, log_path: str) -> subprocess.Popen:
    log = open(log_path, "w", encoding="utf-8")
    # --load-mode none: the default mmap load held about 30 GB of host RAM while the
    # weights went to the card, and pushed system RAM to the VRAM watchdog's 90% line
    # (2026-10-07). One slot and a fixed context keep the card's share fixed too.
    proc = subprocess.Popen([LLAMA_SERVER, "-m", os.path.join(OMNI_DIR, MODEL), "--mmproj", os.path.join(OMNI_DIR, MMPROJ),
                             "-ngl", "99", "-c", "16384", "-np", "1", "--load-mode", "none",
                             "--host", "127.0.0.1", "--port", str(port), "--no-webui"],
                            stdout=log, stderr=subprocess.STDOUT)
    for _ in range(300):
        if proc.poll() is not None:
            raise SystemExit(f"llama-server exited ({proc.returncode}); see {log_path}")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as r:
                if b'"ok"' in r.read():
                    return proc
        except OSError:
            pass
        time.sleep(1)
    proc.kill()
    raise SystemExit("llama-server did not become ready in 300 s")


def file_sha(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def take_pitch(take: str, clock: dict, spans: list, gap: float, mono, sr, tracker: str = "fcpe") -> dict:
    """Pitch over each phrase of one take, cached next to the take
    (phrase-pitch-<tracker>.json) and keyed by everything it depends on: the take, the
    onsets it reads, the clock and the phrase gap. The pass is the slow part
    (about 3 minutes a take with pYIN), so a run that stops later resumes without it.

    The tracker defaults to FCPE: it only ranks takes here, it agrees with pYIN to
    a median 2.7 c on real hymn takes, and it takes 0.2 s instead of ~3 minutes."""
    ver = os.path.join(os.path.dirname(take), "verify-energy.json")
    key = {"tracker": tracker, "take": file_sha(take), "onsets": file_sha(ver) if os.path.isfile(ver) else None,
           "clock": file_sha(clock["_path"]) if clock.get("_path") and os.path.isfile(clock["_path"]) else None, "gap": gap}
    cache = os.path.join(os.path.dirname(take), f"phrase-pitch-{tracker}.json")   # one per tracker, so neither evicts the other
    if os.path.isfile(cache):
        try:
            got = json.load(open(cache, encoding="utf-8"))
            if got.get("key") == key:
                return got["phrases"]
        except (OSError, ValueError, KeyError):
            pass
    onsets = {}
    if os.path.isfile(ver):
        onsets = {r["id"]: r["t_vowel"] for r in json.load(open(ver, encoding="utf-8"))["table"] if r.get("t_vowel") is not None}
    cents, bad = {}, {}
    for r in vc.pitch_rows(clock, vc.track_f0(mono, sr, tracker=tracker), onsets):
        k = r["id"].split(".")[0]
        if r["cents_mean"] is not None:
            cents.setdefault(k, []).append(abs(r["cents_mean"]))
        if r["status"] not in ("PASS", "WARN"):
            bad[k] = bad.get(k, 0) + 1
    phrases = {}
    for i, (_lo, _hi, groups) in enumerate(spans):
        ids = [e["id"] for g in groups for e in g]
        c = [x for k in ids for x in cents.get(k, [])]
        phrases[str(i)] = {"words": len(groups), "mean_abs_cents": round(sum(c) / len(c), 1) if c else None, "notes": len(c),
                           "pitch_fails": sum(bad.get(k, 0) for k in ids)}
    json.dump({"key": key, "phrases": phrases}, open(cache, "w", encoding="utf-8"), indent=1)
    return phrases


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--clock", required=True)
    ap.add_argument("--run", required=True, help="folder holding take-NN/take-48k.wav and take-NN/verify-energy.json")
    ap.add_argument("--out", required=True)
    ap.add_argument("--gap", type=float, default=0.3, help="a rest this long ends a phrase (match repin --phrase-gap)")
    ap.add_argument("--server", default="http://127.0.0.1:8091")
    ap.add_argument("--start-server", action="store_true", help="start llama-server for this run and stop it after")
    ap.add_argument("--no-listen", action="store_true", help="pitch only (no intelligibility)")
    ap.add_argument("--tracker", default="fcpe", choices=["fcpe", "pyin", "swift"], help="pitch tracker for ranking (default fcpe; the gate keeps pYIN)")
    a = ap.parse_args()

    clock = vc.load_clock(a.clock)
    spans = onset_aligner.phrase_spans(clock, a.gap)
    takes = sorted(glob.glob(os.path.join(a.run, "take-*", "take-48k.wav")))
    if not takes:
        raise SystemExit(f"no takes under {a.run}")
    out = {"version": 1, "clock": clock.get("_path"), "gap": a.gap,
           "listener": None if a.no_listen else {"model": MODEL, "mmproj": MMPROJ, "prompt": PROMPT, "temperature": 0, "seed": 1},
           "takes": {}}
    # Pitch first, on the CPU, so the listener holds the GPU only while it listens.
    audio = {}
    for take in takes:
        name = os.path.basename(os.path.dirname(take))
        mono, sr, _frames = vc.read_audio(take)
        audio[name] = (mono, sr)
        phrases = take_pitch(take, clock, spans, a.gap, mono, sr, a.tracker)
        out["takes"][name] = {"path": take.replace("\\", "/"), "phrases": phrases}
        print(f"{name}: pitch over {len(phrases)} phrases", flush=True)
    if not a.no_listen:
        proc = None
        if a.start_server:
            port = int(a.server.rsplit(":", 1)[1])
            proc = start_server(port, os.path.join(os.path.dirname(os.path.abspath(a.out)), "phrase-scores-server.log"))
        try:
            for name, (mono, sr) in audio.items():
                phrases = out["takes"][name]["phrases"]
                for i, (lo, hi, groups) in enumerate(spans):
                    heard = listen(a.server, wav_bytes(mono[int(lo * sr):int(hi * sr)], sr))
                    m = heard_matches([g[0]["word"] for g in groups], heard)
                    phrases[str(i)].update({"heard": heard, "matched": m, "intelligibility": round(m / len(groups), 3)})
                got = [p["intelligibility"] for p in phrases.values()]
                print(f"{name}: heard {sum(got) / len(got):.0%} of words on average", flush=True)
        finally:
            if proc is not None:
                proc.terminate()
                try:
                    proc.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    proc.kill()
    json.dump(out, open(a.out, "w", encoding="utf-8"), indent=1)
    print(f"wrote {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
