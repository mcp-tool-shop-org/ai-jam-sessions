#!/usr/bin/env bash
# Install SoulX-Singer on an offrig job pod (the `jam` profile), pinned to what renders
# the exemplars locally. Safe to run again: each step checks before it works.
#
#   bash soulx-setup.sh        # from the folder offrig_put copied scripts/pod into
#
# Pinned: the SoulX-Singer commit, our one local patch, Python 3.10.20 through uv
# 0.11.17, the package set in soulx-requirements.txt (torch 2.11.0+cu128), and the
# weights by Hugging Face revision AND sha256. It ends by rendering nothing: it checks
# that torch sees the GPU and prints `soulx-setup ready`. See docs/vocal-offrig.md.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${SOULX_ROOT:-/workspace/soulx}"
SOULX_REPO=https://github.com/Soul-AILab/SoulX-Singer.git
SOULX_COMMIT=81aeb3ae772c70093c3de74dc23c92d983801ae4
HF_REPO=Soul-AILab/SoulX-Singer
HF_REVISION=40493ad90286056c7a9095035164434a79daa8c9
MODEL_SHA256=447eaf41f91a6b6659d55e9ec3c9b809221724fb8592aebaec35a23751a5b500
UV_VERSION=0.11.17
PYTHON_VERSION=3.10.20
TORCH_INDEX=https://download.pytorch.org/whl/cu128

log() { echo "[soulx-setup $(date -u +%H:%M:%S)] $*"; }
export DEBIAN_FRONTEND=noninteractive
export UV_PYTHON_INSTALL_DIR=/workspace/uv-python UV_CACHE_DIR=/workspace/uv-cache
export HF_HOME="${HF_HOME:-/workspace/hf}"

if ! command -v git >/dev/null 2>&1; then
  log "installing git"
  apt-get update -qq && apt-get install -y -qq --no-install-recommends git >/dev/null
fi

log "SoulX-Singer at ${SOULX_COMMIT:0:7}"
if [ ! -d "$ROOT/.git" ]; then
  git clone --quiet "$SOULX_REPO" "$ROOT"
fi
git -C "$ROOT" cat-file -e "$SOULX_COMMIT^{commit}" 2>/dev/null || git -C "$ROOT" fetch --quiet origin
git -C "$ROOT" checkout --quiet --force "$SOULX_COMMIT"
git -C "$ROOT" apply "$HERE/soulx-audio-utils.patch"

log "Python $PYTHON_VERSION and packages"
python3 -m pip install --quiet --disable-pip-version-check "uv==$UV_VERSION"
if [ ! -x "$ROOT/.venv/bin/python" ]; then
  python3 -m uv venv --quiet --python "$PYTHON_VERSION" --python-preference only-managed "$ROOT/.venv"
fi
python3 -m uv pip install --quiet --python "$ROOT/.venv/bin/python" -r "$HERE/soulx-requirements.txt" \
  --extra-index-url "$TORCH_INDEX" --index-strategy unsafe-best-match

log "weights at revision ${HF_REVISION:0:7}"
W="$ROOT/pretrained_models/SoulX-Singer"
if ! echo "$MODEL_SHA256  $W/model.pt" | sha256sum --check --status 2>/dev/null; then
  "$ROOT/.venv/bin/python" - "$HF_REPO" "$HF_REVISION" "$W" <<'PY'
import sys
from huggingface_hub import hf_hub_download
repo, rev, out = sys.argv[1:]
for name in ("model.pt", "config.yaml"):
    hf_hub_download(repo, name, revision=rev, local_dir=out)
PY
fi
echo "$MODEL_SHA256  $W/model.pt" | sha256sum --check --quiet

"$ROOT/.venv/bin/python" - <<'PY'
import torch
assert torch.cuda.is_available(), "torch sees no GPU: the host driver is older than the CUDA 12.8 build"
print(f"torch {torch.__version__} CUDA {torch.version.cuda} on {torch.cuda.get_device_name(0)}")
PY
log "soulx-setup ready"
