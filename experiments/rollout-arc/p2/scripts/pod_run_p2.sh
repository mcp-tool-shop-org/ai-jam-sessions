#!/usr/bin/env bash
# ─── P2 pod ladder — dry -> smoke -> train (lock §5) ─────────────────────────
#
# NOT LAUNCHED BY THE BUILD THAT WROTE IT. The spend gate is the director's
# (lock §7): this script stops after `smoke` unless TRAIN=1 is passed
# explicitly, and `smoke` exists to MEASURE cost, never to claim a result.
#
# The v1 anti-loss pattern, kept verbatim in shape:
#   * stage0 retires ALL environment risk before any gradient step — and for P2
#     that includes the Node side, because our tool surface is a real process.
#     A pod that cannot answer /health has not cost a gradient yet.
#   * per-stage DONE markers + artifact tars, so the local babysitter streams
#     each artifact off the pod the minute it lands and termination at any
#     point forfeits at most the in-flight stage.
#   * printf-delimited progress lines (the stall detector requires them).
#   * one linear script, no queued waiters, no self-matching pkill patterns.
#
# Local side — runpod.mjs is inherited unchanged; the two compensators are P2
# adaptations of the v1 pair and are DRILLED against a fake pod id:
#   node experiments/acoustic-sft/runpod.mjs verify|up|sync|fetch|list|down
#   experiments/rollout-arc/p2/scripts/babysit-p2.sh      <- fetcher + watchdog
#   experiments/rollout-arc/p2/scripts/deadman-p2.ps1     <- absolute cap (12 h = $9.48)
#   experiments/rollout-arc/p2/scripts/compensator-drill.mjs  <- proves both fire
#
# LAUNCH DISCIPLINE (paid for by v1, do not shortcut):
#   * scp the bundle, then launch THE SCP'D LAUNCHER — never an inline
#     env-prefixed nohup over ssh (the v1 hung-channel lesson):
#       ssh … root@<ip> "cd /workspace/arc && nohup bash scripts/pod_run_p2.sh > /workspace/arc/run.log 2>&1 &"
#   * be patient with the direct SSH port: it can take 2-5 minutes to route
#     after the pod shows Running. Poll it. Do not churn into terminate.
#   * verify the SSH key is registered BEFORE deploying — RunPod injects account
#     keys at pod START, so a key added afterwards needs a restart.
#   * there is no pkill in this script or in the babysitter, deliberately: a
#     pattern broad enough to match the run also matches the ssh command
#     carrying it.
#
#   SMOKE_STEPS=8 bash pod_run_p2.sh
#   TRAIN=1 TRAIN_STEPS=200 bash pod_run_p2.sh   # director-gated only
set -euo pipefail

ARC=/workspace/arc

# Config arrives as a file, never as an inline env prefix on the ssh command.
# `ssh host "FOO=bar nohup bash script &"` is the v1 hung-channel lesson; the
# approved launch line carries no assignments at all, so anything the run needs
# is scp'd beside the launcher and sourced here.
# shellcheck source=/dev/null
[ -f "$ARC/p2-env.sh" ] && . "$ARC/p2-env.sh"

REPO=$ARC/ai-jam-sessions
TRAINER=$REPO/experiments/rollout-arc/p2/trainer
ART=$ARC/artifacts
RUNS=$ARC/runs
PORT=${P2_PORT:-8765}
SMOKE_STEPS=${SMOKE_STEPS:-8}
TRAIN_STEPS=${TRAIN_STEPS:-200}
# PIN_PER_STEP: the bundle is the repo at an exact commit, not whatever main
# happens to be. Unset fails in the first second rather than after stage 0.
P2_COMMIT=${P2_COMMIT:?P2_COMMIT must name the exact commit sha to run}
P2_REPO_URL=${P2_REPO_URL:-https://github.com/mcp-tool-shop-org/ai-jam-sessions.git}
export HF_HOME=${HF_HOME:-/workspace/hf}
export P2_ENV_URL="http://127.0.0.1:${PORT}"
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

mkdir -p "$ART" "$RUNS"
say() { printf '=== [p2] %s ===\n' "$*"; }

RUN_T0=$(date +%s)
STAGE_PREV=$RUN_T0

# Markers carry their time. A bare `touch` tells the babysitter a stage ended
# but not how long it took, and mtime does not survive scp — so attempt 1 would
# have bought a measurement it could not report. Each marker now holds its own
# timestamp, and stage-timings.jsonl accumulates the per-stage breakdown that
# sizes the NEXT attempt's dead-man cap.
#
# JSONL, not JSON: this file may be interrupted, and a half-written array is
# unparseable where a half-written JSONL loses only its last line.
mark() {
  local name=$1 now iso since_start since_prev
  now=$(date +%s); iso=$(date -Is)
  since_start=$(( now - RUN_T0 )); since_prev=$(( now - STAGE_PREV ))
  STAGE_PREV=$now
  printf '%s  +%ds since previous stage, %ds since start\n' "$iso" "$since_prev" "$since_start" > "$ART/$name.DONE"
  printf '{"stage":"%s","at":"%s","epoch":%d,"since_start_s":%d,"since_prev_s":%d}\n' \
    "$name" "$iso" "$now" "$since_start" "$since_prev" >> "$ART/stage-timings.jsonl"
  say "$name  +${since_prev}s  (${since_start}s total)"
}

# Every exit path that reaches ALL.DONE must leave a manifest behind first:
# babysit-p2.sh verifies artifacts.sha256 before it terminates anything, and a
# missing manifest is an exit-4 "mismatch" that leaves the pod billing.
# Order matters — the ALL timing is appended BEFORE the manifest is computed,
# or stage-timings.jsonl would hash differently than it is shipped.
finish() {
  local now iso
  now=$(date +%s); iso=$(date -Is)
  printf '{"stage":"ALL","at":"%s","epoch":%d,"since_start_s":%d,"since_prev_s":%d}\n' \
    "$iso" "$now" "$(( now - RUN_T0 ))" "$(( now - STAGE_PREV ))" >> "$ART/stage-timings.jsonl"
  ( cd "$ART" && sha256sum ./*.tar.gz ./*.json ./*.jsonl ./*.txt 2>/dev/null > artifacts.sha256 ) || true
  printf '%s  total %ds\n' "$iso" "$(( now - RUN_T0 ))" > "$ART/ALL.DONE"
  say "ALL.DONE in $(( now - RUN_T0 ))s (manifest: $(wc -l < "$ART/artifacts.sha256" 2>/dev/null || echo 0) entries)"
}

# ─── stage0: retire every environment risk, before any gradient ──────────────
say "stage0 environment"
nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv,noheader | tee "$ART/gpu.txt"

# A first CUDA check against the IMAGE's torch, before the long downloads: a
# dead or wrong card is cheaper to find in the first ten seconds than after a
# 3 GB wheel and a 7.6 GB checkpoint. The pinned torch is re-checked after
# install below — this one is a smoke test, not the pin.
python - <<'PY'
import torch
assert torch.cuda.is_available(), "no CUDA"
cap = torch.cuda.get_device_capability(0)
print(f"ENV-OK torch {torch.__version__} cuda {torch.version.cuda} {torch.cuda.get_device_name(0)} sm_{cap[0]}{cap[1]}")
assert (torch.ones(4, device="cuda") * 2).sum().item() == 8.0
PY

# ORDER MATTERS: requirements.lock.txt lives inside the repo, so the clone comes
# BEFORE pip. (It did not, briefly, and stage 0 would have failed on every launch
# with a missing requirements file.)
#
# NOTHING BELOW IS SILENCED, and that is deliberate. The babysitter's three
# liveness signals are log growth, a new marker, and a busy GPU — and during
# setup the GPU is IDLE and there are no markers, so the log is the only one
# left. A `-q` here is a false stall on a healthy run: the watchdog gives up,
# stops fetching, and the pod then bills to the dead-man cap. Per-substep `say`
# lines keep progress honest rather than heartbeating: if a substep really hangs,
# the log stops growing and the stall detector still fires.
say "stage0b node"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node --version | tee "$ART/node-version.txt"

say "stage0c clone $P2_REPO_URL at $P2_COMMIT"
if [ ! -d "$REPO/.git" ]; then
  git clone --progress "$P2_REPO_URL" "$REPO"
fi
cd "$REPO"
git fetch origin "$P2_COMMIT" 2>/dev/null || git fetch origin
git checkout --detach "$P2_COMMIT"
git rev-parse HEAD | tee "$ART/repo-commit.txt"
say "stage0c clone done"

say "stage0d python deps (this is the ~3 GB torch download; progress is the liveness signal)"
# --break-system-packages: the RunPod image ships a Debian-managed python3 that
# refuses system-wide installs under PEP 668. A venv is the usual answer, but the
# image's torch lives in THAT interpreter and re-resolving a CUDA build inside a
# venv on a billing host is the wrong trade. The pod is disposable; installing
# beside its torch is the point. This lesson was paid for by the acoustic arc
# (experiments/acoustic-sft/scripts/pod-bootstrap.sh:45) and not inherited here —
# the first P2 launch died on it at stage 0d.
# --extra-index-url: the lock pins torch==2.11.0+cu128, and a `+cuXXX` local
# version only exists on PyTorch's own index, never on PyPI. Without this the
# resolver reports "No matching distribution found for torch==2.11.0+cu128" while
# happily listing every plain PyPI torch, which reads like a bad pin rather than
# a missing index. Installing the PINNED torch rather than falling back to the
# image's is deliberate: the Stage C receipt was produced against 2.11.0+cu128,
# and PIN_PER_STEP is worth a 3 GB download.
pip install --break-system-packages \
  --extra-index-url https://download.pytorch.org/whl/cu128 \
  -r "$TRAINER/requirements.lock.txt"

# The image ships torchvision/torchaudio compiled against ITS torch (2.8.0). We
# just installed 2.11.0+cu128 over the top, and those extensions are ABI-bound to
# the torch they were built for, so torchvision's op registration dies with
# "RuntimeError: operator torchvision::nms does not exist". transformers imports
# torchvision whenever it is importable — image_utils does it unconditionally
# once is_torchvision_available() passes — so a broken torchvision takes down
# `import peft` and the entire trainer. This is a TEXT-only workload: neither
# package is used, and removing them makes the availability check answer no.
pip uninstall --break-system-packages -y torchvision torchaudio 2>/dev/null || true
pip list --format=freeze | grep -Ei "^(torch|transformers|trl|peft|accelerate|datasets|httpx)=" > "$ART/pip-pins.txt"
cat "$ART/pip-pins.txt"
say "stage0d python deps done"

# Re-check CUDA against the torch we just INSTALLED, not the image's.
python - <<'PY'
import torch
assert torch.cuda.is_available(), "no CUDA after install"
cap = torch.cuda.get_device_capability(0)
print(f"ENV-OK torch {torch.__version__} cuda {torch.version.cuda} {torch.cuda.get_device_name(0)} sm_{cap[0]}{cap[1]}", flush=True)
assert (torch.ones(4, device="cuda") * 2).sum().item() == 8.0
PY

say "stage0e node deps + build"
corepack enable >/dev/null 2>&1 || npm i -g pnpm
pnpm install --frozen-lockfile
pnpm build
test -f "$REPO/dist/mcp-server.js" || { echo "FAIL: dist/mcp-server.js missing after build"; exit 1; }
say "stage0e build done"

say "stage0c bridge health"
# pnpm exec tsx, NOT bare node. The bridge imports the TypeScript env and
# executor directly, and SynthEnv/SearchEnv use a parameter property
# (`constructor(private readonly executor: ...)`). Node's built-in TypeScript is
# STRIP-ONLY: it erases types but cannot emit the constructor assignment a
# parameter property implies, so it throws
# ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX and the bridge never binds its port. On the
# rig every path into this code runs through tsx or vitest, which transpile
# fully, so the divergence only appears on the pod. Found on the first launch.
pnpm exec tsx "$REPO/experiments/rollout-arc/scripts/p2-env-server.mjs" --port "$PORT" \
  --train-per-level "${TRAIN_PER_LEVEL:-256}" --test-per-level "${TEST_PER_LEVEL:-64}" \
  > "$ART/env-server.log" 2>&1 &
BRIDGE_PID=$!
# Compensator: the bridge owns an MCP child with an isolated AI_JAM_HOME. Kill
# it on every exit path, including failure, or the child outlives the script.
trap 'kill "$BRIDGE_PID" 2>/dev/null || true' EXIT
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" > "$ART/bridge-health.json" 2>/dev/null; then break; fi
  sleep 2
done
test -s "$ART/bridge-health.json" || { echo "FAIL: bridge never answered /health"; exit 1; }
cat "$ART/bridge-health.json"

# One real tool call through the real server, before any weights are touched.
# NOT `curl ... | head -c 200`. head closes the pipe at 200 bytes, curl cannot
# write the rest and exits 23 ("Failure writing output to destination"), and
# under `set -o pipefail` that non-zero kills the whole run. The tool call had
# already SUCCEEDED — the response was arriving when head hung up. Capture to a
# file, then truncate for display; the artifact is worth keeping anyway.
curl -fsS -X POST "http://127.0.0.1:${PORT}/tool" -H 'Content-Type: application/json' \
  -d '{"name":"list_songs","arguments":{"genre":"classical"}}' \
  -o "$ART/tool-smoke.json"
head -c 200 "$ART/tool-smoke.json" || true
printf '\n'
mark STAGE0

# ─── stage1: dry — the loop closes, and the mask is real ─────────────────────
say "stage1 dry"
cd "$TRAINER"
python train.py --dry --out "$RUNS/dry" --save-init-adapter "$RUNS/init-adapter"
cp "$RUNS/dry/dry-run.json" "$ART/dry-run.json"
mark STAGE1

# ─── stage2: smoke — MEASURE throughput and cost. No result is claimed. ──────
say "stage2 smoke ($SMOKE_STEPS steps)"
python train.py --dry \
  --steps "$SMOKE_STEPS" \
  --num-generations 8 \
  --per-device-batch 8 \
  --max-completion-length 1024 \
  --init-adapter "$RUNS/init-adapter" \
  --out "$RUNS/smoke"
cp "$RUNS/smoke/dry-run.json" "$ART/smoke-run.json"
tar -czf "$ART/smoke.tar.gz" -C "$RUNS" smoke
mark STAGE2

say "smoke measured — cost per step is in $ART/smoke-run.json"
if [ "${TRAIN:-0}" != "1" ]; then
  say "STOPPING before train: lock §7 makes the full run a director gate"
  finish
  exit 0
fi

# ─── stage3: train — only under §7, and always with the control arm ──────────
say "stage3 train ($TRAIN_STEPS steps)"
python train.py --steps "$TRAIN_STEPS" --init-adapter "$RUNS/init-adapter" --out "$RUNS/train"
cp "$RUNS/train/run.json" "$ART/train-run.json"
tar -czf "$ART/train.tar.gz" -C "$RUNS" train
mark STAGE3

# Lock §6: random rewards nearly match real ones on Qwen (arXiv:2506.10947), so
# a run without this arm is unfalsifiable. It is part of the run, not an extra.
say "stage3b spurious-reward control arm"
python train.py --steps "$TRAIN_STEPS" --random-reward --init-adapter "$RUNS/init-adapter" --out "$RUNS/control"
cp "$RUNS/control/run.json" "$ART/control-run.json"
tar -czf "$ART/control.tar.gz" -C "$RUNS" control
mark STAGE3B

finish
