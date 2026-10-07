#!/usr/bin/env python3
"""Render N SoulX-Singer takes of one score-clock target with the model loaded once.

    python scripts/soulx_batch.py --target target.json \
        --prompt-wav en_prompt.mp3 --prompt-meta en_prompt.json \
        --takes 8 --out-dir tmp/vocal-clock/sing/amazing-grace

Writes take-01 .. take-NN under --out-dir, each with generated.wav (24 kHz),
take-48k.wav and take.receipt.json: the same files soulx_take.py writes, so
sing_clock.py picks them up as already rendered. A take whose take-48k.wav
exists is skipped, so an interrupted batch resumes where it stopped.

soulx_take.py starts a fresh process per take and loads the 2.8 GB checkpoint
each time. This script loads it once, which is what makes a rented GPU
(docs/vocal-offrig.md) pay for itself: the takes are seconds each, the load is
not. Run it with SoulX-Singer's own Python (SOULX_ROOT env, default
E:/AI/SoulX-Singer; on an offrig pod /workspace/soulx).
"""
from __future__ import annotations

import argparse
import os
import platform
import sys
import time
from types import SimpleNamespace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from soulx_take import SOULX_ROOT, finish_take, sha256  # noqa: E402


def take_dirs(out_dir: str, first: int, takes: int) -> list[str]:
    """take-NN directories for takes first .. first+takes-1, numbered as sing_clock.py
    reads them."""
    if first < 1 or takes < 1:
        raise SystemExit("--first and --takes must be at least 1")
    return [os.path.join(out_dir, f"take-{i:02d}") for i in range(first, first + takes)]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--target", required=True)
    ap.add_argument("--prompt-wav", required=True)
    ap.add_argument("--prompt-meta", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--takes", type=int, required=True)
    ap.add_argument("--first", type=int, default=1, help="number of the first take (default 1)")
    ap.add_argument("--model", default=os.path.join(SOULX_ROOT, "pretrained_models", "SoulX-Singer", "model.pt"))
    ap.add_argument("--config", default=os.path.join(SOULX_ROOT, "soulxsinger", "config", "soulxsinger.yaml"))
    ap.add_argument("--control", default="score", choices=["score", "melody"])
    ap.add_argument("--pitch-shift", type=int, default=0)
    ap.add_argument("--no-fp16", action="store_true")
    ap.add_argument("--sample-rate", type=int, default=48000)
    a = ap.parse_args()

    out_dir = os.path.abspath(a.out_dir)
    todo = [d for d in take_dirs(out_dir, a.first, a.takes) if not os.path.exists(os.path.join(d, "take-48k.wav"))]
    if not todo:
        print(f"all {a.takes} takes already rendered in {out_dir}")
        return 0

    sys.path.insert(0, SOULX_ROOT)
    os.chdir(SOULX_ROOT)
    import torch
    from cli.inference import build_model, process
    from soulxsinger.utils.file_utils import load_config

    fp16 = not a.no_fp16
    config = load_config(os.path.abspath(a.config))
    t0 = time.time()
    model = build_model(os.path.abspath(a.model), config, device="cuda", use_fp16=fp16)
    load_s = time.time() - t0
    host = {"machine": platform.node(), "gpu": torch.cuda.get_device_name(0), "torch": torch.__version__,
            "model_load_s": round(load_s, 1)}
    print(f"model loaded in {load_s:.1f}s on {host['gpu']}", flush=True)

    fields = {"target": os.path.abspath(a.target).replace("\\", "/"), "target_sha256": sha256(a.target),
              "prompt_wav": os.path.abspath(a.prompt_wav).replace("\\", "/"), "prompt_meta": os.path.abspath(a.prompt_meta).replace("\\", "/"),
              "model": os.path.abspath(a.model).replace("\\", "/"), "model_sha256": sha256(a.model),
              "control": a.control, "pitch_shift": a.pitch_shift, "auto_shift": False, "fp16": fp16,
              "cmd": [sys.executable, *sys.argv], "batch": host}
    for tdir in todo:
        os.makedirs(tdir, exist_ok=True)
        args = SimpleNamespace(
            device="cuda", control=a.control, auto_shift=False, pitch_shift=a.pitch_shift, use_fp16=fp16,
            prompt_wav_path=os.path.abspath(a.prompt_wav), prompt_metadata_path=os.path.abspath(a.prompt_meta),
            target_metadata_path=os.path.abspath(a.target),
            phoneset_path=os.path.join(SOULX_ROOT, "soulxsinger", "utils", "phoneme", "phone_set.json"),
            save_dir=tdir)
        t = time.time()
        process(args, config, model)
        receipt = finish_take(os.path.join(tdir, "generated.wav"), tdir, a.sample_rate, time.time() - t, fields)
        print(f"take {receipt['take']} ({receipt['seconds']:.3f}s) peak {receipt['peak']:.3f} in {receipt['elapsed_s']}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
