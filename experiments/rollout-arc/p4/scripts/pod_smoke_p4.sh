#!/usr/bin/env bash
# ─── P4 infrastructure smoke run ─────────────────────────────────────────────
#
# ONE QUESTION: does the population P4 measured survive a live GRPOTrainer batch?
# Not "does it train". Every P3 and P4 figure is single-turn model.generate; the
# live trainer adds a different sampling path and TRL's batch serialisation, and
# no measured branching statistic has ever been shown to survive into a training
# batch — P2's training run aborted before producing one.
#
# Thresholds are preregistered in ../SMOKE-PREREG.md and are NOT restated here,
# so this script cannot quietly disagree with them.
#
# GPU: RTX PRO 6000 Blackwell. NOT the L40S — those hosts carry driver 550, too
# old for the image's cu129 torch, and nvidia-smi looks perfectly healthy while
# torch.cuda.is_available() is False. And cost per RUN is not cost per HOUR: the
# Blackwell at $1.69/hr finished a cell in 16 min where the A100 at $1.19/hr took
# 49 and cost more. Check CUDA over ssh BEFORE staging; retrying blind returns
# the same bad host.
#
# The local 2-step dry pass (STAGE C PASS, exit 0) proved this path end to end at
# G=2 on a 5090 before this script existed. It found six defects, two of them
# silent. This run is measurement, not debugging.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ARC=/workspace/arc
REPO=$ARC/ai-jam-sessions
TRAINER=$REPO/experiments/rollout-arc/p2/trainer
ART=$ARC/artifacts
RUNS=$ARC/runs
PORT=${P4_PORT:-8766}

# The cell, matched to the randomized 11-genre pool P4 measured.
VOICES=${VOICES:-2}
STYLE=${STYLE:-film-ambient}
VL_SEED=${VL_SEED:-20260913}        # the pool shuffle P4 used — NOT a contiguous slice
CELL_STEPS=${CELL_STEPS:-32}
GENS=${GENS:-8}
CELL_LIMIT=${CELL_LIMIT:-32}
TRAIN_SEED=${TRAIN_SEED:-7}

mkdir -p "$ART" "$RUNS"
RUN_T0=$(date +%s)
say() { printf '=== [p4] %s ===\n' "$*"; }
mark() {
  local name="$1" now iso
  now=$(date +%s); iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  printf '%s  +%ds since start\n' "$iso" "$(( now - RUN_T0 ))" > "$ART/$name.DONE"
}

# Every exit path that reaches ALL.DONE leaves a manifest first: the babysitter
# verifies artifacts.sha256 before it terminates anything.
finish() {
  local now iso
  now=$(date +%s); iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  ( cd "$ART" && sha256sum ./*.tar.gz ./*.json ./*.jsonl ./*.txt 2>/dev/null > artifacts.sha256 ) || true
  printf '%s  total %ds\n' "$iso" "$(( now - RUN_T0 ))" > "$ART/ALL.DONE"
  say "ALL.DONE in $(( now - RUN_T0 ))s ($(wc -l < "$ART/artifacts.sha256" 2>/dev/null || echo 0) manifest entries)"
}

# ─── stage 0: the environment, un-silenced ──────────────────────────────────
# Progress IS the liveness signal. Do not add -q or >/dev/null here: a silent
# stage with an idle GPU is indistinguishable from a stall, and a stall bills to
# the cap. Do NOT add a heartbeat either — that disables the stall detector.
say "stage0 cuda check BEFORE anything is staged"
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
python3 -c "import torch;print('torch',torch.__version__,'cuda',torch.cuda.is_available())" 2>/dev/null || true

say "stage0b clone ${P4_REPO_URL:?set P4_REPO_URL} at ${P4_COMMIT:?set P4_COMMIT}"
mkdir -p "$ARC" && cd "$ARC"
git clone --filter=blob:none "$P4_REPO_URL" ai-jam-sessions
cd "$REPO" && git checkout --detach "$P4_COMMIT"
say "stage0b clone done ($(git rev-parse --short HEAD))"

# The clone must exist before this line. An earlier revision installed from
# "$TRAINER/requirements.lock.txt" BEFORE the clone that creates $TRAINER, which
# would have failed every launch.
say "stage0c python deps (the ~3 GB torch download; progress is the liveness signal)"
pip install --break-system-packages -r "$TRAINER/requirements.lock.txt"
say "stage0c python deps done"

say "stage0d node deps + build"
cd "$REPO" && corepack enable && pnpm install --frozen-lockfile && pnpm build
say "stage0d build done"

# ─── the voice-leading bridge ───────────────────────────────────────────────
# pnpm exec tsx, NOT bare node: the bridge imports TypeScript directly and Node's
# built-in TS support is strip-only, which throws on the parameter properties in
# the compose module.
say "stage0e bridge: ${VOICES} voices, ${STYLE}, pool seed ${VL_SEED}"
cd "$REPO"
pnpm exec tsx "$REPO/experiments/rollout-arc/scripts/p4-vl-server.mjs" \
  --port "$PORT" --voices "$VOICES" --style "$STYLE" --seed "$VL_SEED" \
  > "$ART/vl-server.log" 2>&1 &
BRIDGE_PID=$!
trap 'kill "$BRIDGE_PID" 2>/dev/null || true' EXIT
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" > "$ART/bridge-health.json" 2>/dev/null; then break; fi
  sleep 2
done
test -s "$ART/bridge-health.json" || { echo "FAIL: bridge never answered /health"; exit 1; }
cat "$ART/bridge-health.json"

# One real scoring call through the real verifier, before any weights are touched.
# Capture to a file, then truncate for display: `curl | head -c N` makes curl exit
# 23 when head closes the pipe, and under pipefail that kills the run even though
# the call succeeded.
GOLD=$(python3 -c "import json,urllib.request;print(json.load(urllib.request.urlopen('http://127.0.0.1:${PORT}/cases?limit=1'))['cases'][0]['gold'])")
curl -fsS -X POST "http://127.0.0.1:${PORT}/score" -H 'Content-Type: application/json' \
  -d "{\"gold\":\"${GOLD}\",\"messages\":[{\"role\":\"assistant\",\"content\":\"not json\"}]}" \
  -o "$ART/score-smoke.json"
cat "$ART/score-smoke.json"; printf '\n'
# The reward gate that matters: unparseable output must score 0, not 1.
# verifyVoiceLeading ADMITS a realization with no sounding frames, so without the
# structure gate an empty completion earns full reward and the policy learns to
# emit nothing. Caught locally; asserted here so a regression cannot reach a run.
python3 - "$ART/score-smoke.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d["reward"] == 0 and d["correct"] is False, f"REWARD HACK OPEN: unparseable scored {d}"
print("[p4] reward gate ok: unparseable -> reward 0")
PY
mark STAGE0

# ─── the cell ───────────────────────────────────────────────────────────────
# --limit IS PASSED, and train.py now halts on an unchosen prompt repeat rather
# than recording one. --no-tools is the flag (not --single-turn): it passes
# NEITHER tools nor environment_factory, which is what a single-turn JSON task
# needs. The Stage C gates invert on this path — tool_calls and env instances
# must be ZERO.
say "cell p4-smoke: ${VOICES}v ${STYLE}, G=${GENS}, ${CELL_STEPS} steps, limit ${CELL_LIMIT}"
cd "$TRAINER"
python3 train.py --dry --no-tools \
  --base-url "http://127.0.0.1:${PORT}" \
  --steps "$CELL_STEPS" \
  --num-generations "$GENS" \
  --per-device-batch "$GENS" \
  --limit "$CELL_LIMIT" \
  --max-completion-length 512 \
  --seed "$TRAIN_SEED" \
  --out "$RUNS/p4-smoke"
cp "$RUNS/p4-smoke/dry-run.json" "$ART/p4-smoke.json"
tar -czf "$ART/p4-smoke.tar.gz" -C "$RUNS" p4-smoke
mark CELL

# ─── harness guards, as RESULTS not hopes ───────────────────────────────────
# A cell whose population is not what was asked for is void before anyone reads
# its rewards. These mirror SMOKE-PREREG.md's hard guards.
python3 - "$RUNS/p4-smoke/dry-run.json" "$CELL_LIMIT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
want = int(sys.argv[2])
rows = d.get("dataset_rows")
rep = d.get("prompt_repeats")
mode = d.get("rollout_mode")
print(f"[p4] dataset_rows={rows} (want {want})  prompt_repeats={rep} (want 1.0)  rollout_mode={mode}")
bad = []
if rows != want: bad.append(f"dataset_rows {rows} != {want}")
if rep not in (1, 1.0): bad.append(f"prompt_repeats {rep} != 1.0")
if mode != "no-tools": bad.append(f"rollout_mode {mode} != no-tools")
print("[p4] VOID: " + "; ".join(bad) if bad else "[p4] guards ok")
PY

finish
