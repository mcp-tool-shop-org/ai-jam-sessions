#!/usr/bin/env python3
"""Cache frozen encoder features for Step B's planted clips.

    python scripts/detector/features.py --root tmp/stepb --encoder mert|dasheng [--device cuda]

Reads tmp/stepb/manifest.json and each folder's labels.jsonl, runs every clip
through a frozen encoder, and writes tmp/stepb/features/<encoder>/<song>/<pick>/<clip>.npy
(float16, layers x frames x dim) plus a meta.json per encoder. Clips already cached
are skipped.

Encoders (both reported on equal terms; licences matter for shipping):
  mert     m-a-p/MERT-v1-330M, music-trained, 24 kHz, 75 Hz frames.
           Licence CC-BY-NC-4.0: research only, cannot ship in the product.
  dasheng  mispeech/dasheng-0.6B, general audio, 16 kHz. Licence Apache-2.0:
           the one the product can carry. Needs the `dasheng` package.

Storage: all of MERT's layers at 75 Hz are about 38 MB a clip. We keep 6 layers
(4, 8, ..., 24) and average frame pairs (37.5 Hz, ~27 ms), about 5 MB a clip. The
heads learn a weighted sum of the cached layers.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Callable

import numpy as np

ENCODERS = {
    "mert": {"repo": "m-a-p/MERT-v1-330M", "sr": 24000, "fps": 75.0, "layers": (4, 8, 12, 16, 20, 24), "pool": 2,
             "licence": "CC-BY-NC-4.0 (research only)"},
    "dasheng": {"repo": "mispeech/dasheng-0.6B", "sr": 16000, "fps": 25.0, "layers": None, "pool": 1,
                "licence": "Apache-2.0"},
}

Encoder = Callable[[np.ndarray], np.ndarray]     # mono float32 at the encoder's rate -> (layers, frames, dim)


def pool_frames(x: np.ndarray, k: int) -> np.ndarray:
    """Average every k consecutive frames (axis 1); a ragged tail is dropped."""
    if k <= 1:
        return x
    t = (x.shape[1] // k) * k
    return x[:, :t].reshape(x.shape[0], t // k, k, x.shape[2]).mean(axis=2)


def load_encoder(name: str, device: str = "cuda") -> Encoder:  # pragma: no cover - downloads weights
    """The frozen encoder as a function. Weights download on first use."""
    import torch
    cfg = ENCODERS[name]
    if name == "mert":
        from transformers import AutoModel
        model = AutoModel.from_pretrained(cfg["repo"], trust_remote_code=True).to(device).eval()

        def run(wave: np.ndarray) -> np.ndarray:
            x = torch.from_numpy(wave).float()[None].to(device)
            x = (x - x.mean()) / (x.std() + 1e-7)                  # MERT's feature extractor normalises per clip
            with torch.no_grad():
                hs = model(x, output_hidden_states=True).hidden_states
            return torch.stack([hs[i][0] for i in cfg["layers"]]).float().cpu().numpy()
        return run
    if name == "dasheng":
        try:
            from dasheng import dasheng_06B
        except ImportError as exc:
            raise SystemExit("dasheng needs the `dasheng` package (Apache-2.0): pip install dasheng") from exc
        model = dasheng_06B().to(device).eval()

        def run(wave: np.ndarray) -> np.ndarray:
            x = torch.from_numpy(wave).float()[None].to(device)
            with torch.no_grad():
                y = model(x)                                        # (1, frames, dim), the last layer
            return y.float().cpu().numpy()
        return run
    raise SystemExit(f"unknown encoder {name!r}; choose from {', '.join(ENCODERS)}")


def read_mono(path: Path, sr: int) -> np.ndarray:
    import soundfile as sf
    data, file_sr = sf.read(str(path), always_2d=True, dtype="float32")
    mono = data.mean(axis=1)
    if file_sr != sr:
        import librosa
        mono = librosa.resample(mono, orig_sr=file_sr, target_sr=sr)
    return mono.astype(np.float32)


def clips(root: Path):
    """(folder relative to root, labels row) for every clip in the manifest's folders."""
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    for entry in manifest["folders"]:
        rel = Path(entry["path"])
        for line in (root / rel / "labels.jsonl").read_text(encoding="utf-8").splitlines():
            yield rel, json.loads(line)


def cache(root: Path, name: str, encoder: Encoder) -> dict:
    cfg = ENCODERS[name]
    out_root = root / "features" / name
    done = new = 0
    for rel, row in clips(root):
        out = out_root / rel / (Path(row["clip"]).stem + ".npy")
        if out.exists():
            done += 1
            continue
        feats = pool_frames(encoder(read_mono(root / rel / row["clip"], cfg["sr"])), cfg["pool"])
        out.parent.mkdir(parents=True, exist_ok=True)
        np.save(out, feats.astype(np.float16))
        new += 1
    meta = {"encoder": name, "repo": cfg["repo"], "licence": cfg["licence"], "sr": cfg["sr"],
            "fps": cfg["fps"] / cfg["pool"], "layers": list(cfg["layers"]) if cfg["layers"] else ["last"]}
    out_root.mkdir(parents=True, exist_ok=True)
    (out_root / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    return {"cached": new, "already": done, **meta}


def main() -> int:  # pragma: no cover - needs weights and clips
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default="tmp/stepb")
    ap.add_argument("--encoder", choices=sorted(ENCODERS), required=True)
    ap.add_argument("--device", default="cuda")
    a = ap.parse_args()
    s = cache(Path(a.root), a.encoder, load_encoder(a.encoder, a.device))
    print(json.dumps(s, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
