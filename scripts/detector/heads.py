#!/usr/bin/env python3
"""Train a frame-level defect head on cached frozen features (Step B).

    python scripts/detector/heads.py --root tmp/stepb --encoder mert --holdout-song <song> [--epochs 30]

The head is small and the encoder frozen:
  - a softmax-weighted sum over the cached layers,
  - a linear projection to 256,
  - a 2-layer bidirectional GRU (128 per direction),
  - per frame: one logit per defect kind plus one "seam" logit.
Compound kinds train their base kind's output. The seam output fires on any
real seam, defective or not (plants and shams), so the defect outputs are pushed
to separate "a defective seam" from "a seam": the splice-shortcut control, built in.

Splits are by song (the headline; 2-fold with two songs) or by mix. Never by
clip, because alternate picks of one song share takes.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

OUTPUTS = ("replay", "skip", "click", "stretch", "pitch")
SEAM_KINDS = ("replay", "skip", "click", "sham")          # kinds whose span is a real seam


def base_kind(kind: str) -> str:
    return kind.partition("+")[0]


def frame_targets(row: dict, n_frames: int, fps: float) -> np.ndarray:
    """(n_frames, len(OUTPUTS) + 1) 0/1 targets: the row's kind over its event span,
    and the seam column over any seam's span (plants and shams alike)."""
    y = np.zeros((n_frames, len(OUTPUTS) + 1), dtype=np.float32)
    a, b = row.get("event_in_clip") or (row["t_in_clip"], row["t_in_clip"])
    lo, hi = max(0, int(np.floor(a * fps))), min(n_frames, int(np.ceil(b * fps)) + 1)
    k = base_kind(row["kind"])
    if row.get("defect") and k in OUTPUTS:
        y[lo:hi, OUTPUTS.index(k)] = 1.0
    if k in SEAM_KINDS:
        y[lo:hi, -1] = 1.0
    return y


def build_head(n_layers: int, dim: int):
    import torch
    from torch import nn

    class Head(nn.Module):
        def __init__(self):
            super().__init__()
            self.layer_w = nn.Parameter(torch.zeros(n_layers))
            self.proj = nn.Linear(dim, 256)
            self.gru = nn.GRU(256, 128, num_layers=2, batch_first=True, bidirectional=True, dropout=0.1)
            self.out = nn.Linear(256, len(OUTPUTS) + 1)

        def forward(self, x):                     # x: (batch, layers, frames, dim)
            w = torch.softmax(self.layer_w, 0)
            h = torch.einsum("l,bltd->btd", w, x)
            h, _ = self.gru(torch.relu(self.proj(h)))
            return self.out(h)                    # (batch, frames, outputs) logits

    return Head()


def load_rows(root: Path, encoder: str) -> list[dict]:
    """Every labelled clip with its song, mix and feature path, from the manifest."""
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    rows = []
    for entry in manifest["folders"]:
        rel = Path(entry["path"])
        for line in (root / rel / "labels.jsonl").read_text(encoding="utf-8").splitlines():
            r = json.loads(line)
            r.update({"song": entry["song"], "mix": f"{entry['song']}/{entry.get('alt') or entry['pick']}",
                      "features": str(root / "features" / encoder / rel / (Path(r["clip"]).stem + ".npy"))})
            rows.append(r)
    return rows


def split(rows: list[dict], holdout_song: str | None = None, holdout_mix: str | None = None):
    if bool(holdout_song) == bool(holdout_mix):
        raise ValueError("hold out exactly one song or one mix")
    test = (lambda r: r["song"] == holdout_song) if holdout_song else (lambda r: r["mix"] == holdout_mix)
    return [r for r in rows if not test(r)], [r for r in rows if test(r)]


def inner_split(train_rows: list[dict], frac: float = 0.15, seed: int = 0):
    """Hold out whole mixes from the training songs as a validation set, for the
    operating point: never threshold on the test clips."""
    mixes = sorted({r["mix"] for r in train_rows})
    rng = np.random.default_rng(seed)
    n = max(1, int(round(frac * len(mixes)))) if len(mixes) > 1 else 0
    val_mixes = set(rng.choice(mixes, size=n, replace=False)) if n else set()
    return [r for r in train_rows if r["mix"] not in val_mixes], [r for r in train_rows if r["mix"] in val_mixes]


def batches(rows: list[dict], fps: float, size: int, rng: np.random.Generator, load=np.load):
    order = rng.permutation(len(rows))
    for i in range(0, len(order), size):
        chunk = [rows[j] for j in order[i:i + size]]
        feats = [load(r["features"]).astype(np.float32) for r in chunk]
        t = min(f.shape[1] for f in feats)
        x = np.stack([f[:, :t] for f in feats])
        y = np.stack([frame_targets(r, t, fps) for r in chunk])
        yield x, y


def train(rows: list[dict], fps: float, epochs: int = 30, lr: float = 1e-3, batch: int = 16, seed: int = 0,
          device: str = "cpu", load=np.load, pos_weight: float = 20.0):
    """Fit a head; returns it. Defect frames are rare, so positives get pos_weight."""
    import torch
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    sample = load(rows[0]["features"])
    head = build_head(sample.shape[0], sample.shape[2]).to(device)
    opt = torch.optim.AdamW(head.parameters(), lr=lr, weight_decay=1e-2)
    loss_fn = torch.nn.BCEWithLogitsLoss(pos_weight=torch.full((len(OUTPUTS) + 1,), pos_weight, device=device))
    for _ in range(epochs):
        head.train()
        for x, y in batches(rows, fps, batch, rng, load):
            opt.zero_grad()
            loss = loss_fn(head(torch.from_numpy(x).to(device)), torch.from_numpy(y).to(device))
            loss.backward()
            opt.step()
    return head.eval()


def predict(head, rows: list[dict], device: str = "cpu", load=np.load) -> list[np.ndarray]:
    """Per clip, (frames, outputs) probabilities."""
    import torch
    out = []
    with torch.no_grad():
        for r in rows:
            x = torch.from_numpy(load(r["features"]).astype(np.float32))[None].to(device)
            out.append(torch.sigmoid(head(x))[0].cpu().numpy())
    return out


def main() -> int:  # pragma: no cover - needs cached features
    import torch
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default="tmp/stepb")
    ap.add_argument("--encoder", required=True)
    ap.add_argument("--holdout-song")
    ap.add_argument("--holdout-mix")
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--device", default="cuda")
    a = ap.parse_args()
    root = Path(a.root)
    meta = json.loads((root / "features" / a.encoder / "meta.json").read_text(encoding="utf-8"))
    rows = load_rows(root, a.encoder)
    tr, te = split(rows, a.holdout_song, a.holdout_mix)
    tr, va = inner_split(tr, seed=a.seed)
    head = train(tr, meta["fps"], a.epochs, seed=a.seed, device=a.device)
    tag = a.holdout_song or a.holdout_mix.replace("/", "_")
    out = root / "heads" / a.encoder / f"{tag}-seed{a.seed}"
    out.mkdir(parents=True, exist_ok=True)
    torch.save(head.state_dict(), out / "head.pt")
    for name, part in (("test", te), ("val", va)):
        probs = predict(head, part, a.device)
        np.savez_compressed(out / f"{name}_probs.npz", **{str(i): p for i, p in enumerate(probs)})
        (out / f"{name}_rows.json").write_text(json.dumps(part), encoding="utf-8")
    print(f"{out}: trained on {len(tr)} clips, validation {len(va)}, predicted {len(te)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
