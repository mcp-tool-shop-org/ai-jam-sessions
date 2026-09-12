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

# Clone rather than scp: 130 MB of tracked tree is a slow push and a mutable
# one, where a commit sha is reproducible and is what PIN_PER_STEP asks for.
if [ ! -d "$REPO/.git" ]; then
  say "cloning $P2_REPO_URL"
  git clone -q "$P2_REPO_URL" "$REPO"
fi
cd "$REPO"
git fetch -q origin "$P2_COMMIT" 2>/dev/null || git fetch -q origin
git checkout -q --detach "$P2_COMMIT"
git rev-parse HEAD | tee "$ART/repo-commit.txt"
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
