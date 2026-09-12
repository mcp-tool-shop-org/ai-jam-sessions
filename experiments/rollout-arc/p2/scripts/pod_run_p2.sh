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
# Local side (unchanged, already written and paid for):
#   node experiments/acoustic-sft/runpod.mjs verify|up|sync|fetch|list|down
#   experiments/finetune-arc-v1/scripts/babysit-pod.sh   <- fetcher + watchdog
#   experiments/finetune-arc-v1/scripts/deadman.ps1      <- absolute cap
#
#   SMOKE_STEPS=8 bash pod_run_p2.sh
#   TRAIN=1 TRAIN_STEPS=200 bash pod_run_p2.sh   # director-gated only
set -euo pipefail

ARC=/workspace/arc
REPO=$ARC/ai-jam-sessions
TRAINER=$REPO/experiments/rollout-arc/p2/trainer
ART=$ARC/artifacts
RUNS=$ARC/runs
PORT=${P2_PORT:-8765}
SMOKE_STEPS=${SMOKE_STEPS:-8}
TRAIN_STEPS=${TRAIN_STEPS:-200}
export HF_HOME=${HF_HOME:-/workspace/hf}
export P2_ENV_URL="http://127.0.0.1:${PORT}"
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

mkdir -p "$ART" "$RUNS"
say() { printf '=== [p2] %s ===\n' "$*"; }

# ─── stage0: retire every environment risk, before any gradient ──────────────
say "stage0 environment"
nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv,noheader | tee "$ART/gpu.txt"

# Blackwell (sm_120) needs CUDA >= 12.8, and prebuilt vLLM wheels have shipped
# without SM120 arch flags (vllm#35432). We do not use vLLM on this ladder, but
# the arch check is free and a wrong card is cheaper to find here than at step 2.
python - <<'PY'
import torch
assert torch.cuda.is_available(), "no CUDA"
cap = torch.cuda.get_device_capability(0)
print(f"ENV-OK torch {torch.__version__} cuda {torch.version.cuda} {torch.cuda.get_device_name(0)} sm_{cap[0]}{cap[1]}")
assert (torch.ones(4, device="cuda") * 2).sum().item() == 8.0
PY

pip install -q -r "$TRAINER/requirements.lock.txt"
pip list --format=freeze | grep -Ei "^(torch|transformers|trl|peft|accelerate|datasets|httpx)=" > "$ART/pip-pins.txt"
cat "$ART/pip-pins.txt"

# The tool surface is Node, and it is the REAL one — not a Python reimplementation.
say "stage0b node + the real MCP server"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node --version | tee "$ART/node-version.txt"
cd "$REPO"
corepack enable >/dev/null 2>&1 || npm i -g pnpm >/dev/null
pnpm install --frozen-lockfile >/dev/null
pnpm build >/dev/null
test -f "$REPO/dist/mcp-server.js" || { echo "FAIL: dist/mcp-server.js missing after build"; exit 1; }

say "stage0c bridge health"
node "$REPO/experiments/rollout-arc/scripts/p2-env-server.mjs" --port "$PORT" \
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
curl -fsS -X POST "http://127.0.0.1:${PORT}/tool" -H 'Content-Type: application/json' \
  -d '{"name":"list_songs","arguments":{"genre":"classical"}}' | head -c 200
printf '\n'
touch "$ART/STAGE0.DONE"

# ─── stage1: dry — the loop closes, and the mask is real ─────────────────────
say "stage1 dry"
cd "$TRAINER"
python train.py --dry --out "$RUNS/dry" --save-init-adapter "$RUNS/init-adapter"
cp "$RUNS/dry/dry-run.json" "$ART/dry-run.json"
touch "$ART/STAGE1.DONE"

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
touch "$ART/STAGE2.DONE"

say "smoke measured — cost per step is in $ART/smoke-run.json"
if [ "${TRAIN:-0}" != "1" ]; then
  say "STOPPING before train: lock §7 makes the full run a director gate"
  touch "$ART/ALL.DONE"
  exit 0
fi

# ─── stage3: train — only under §7, and always with the control arm ──────────
say "stage3 train ($TRAIN_STEPS steps)"
python train.py --steps "$TRAIN_STEPS" --init-adapter "$RUNS/init-adapter" --out "$RUNS/train"
cp "$RUNS/train/run.json" "$ART/train-run.json"
tar -czf "$ART/train.tar.gz" -C "$RUNS" train
touch "$ART/STAGE3.DONE"

# Lock §6: random rewards nearly match real ones on Qwen (arXiv:2506.10947), so
# a run without this arm is unfalsifiable. It is part of the run, not an extra.
say "stage3b spurious-reward control arm"
python train.py --steps "$TRAIN_STEPS" --random-reward --init-adapter "$RUNS/init-adapter" --out "$RUNS/control"
cp "$RUNS/control/run.json" "$ART/control-run.json"
tar -czf "$ART/control.tar.gz" -C "$RUNS" control
touch "$ART/STAGE3B.DONE"

cd "$ART" && sha256sum ./*.tar.gz ./*.json > artifacts.sha256
touch "$ART/ALL.DONE"
say "ALL.DONE"
