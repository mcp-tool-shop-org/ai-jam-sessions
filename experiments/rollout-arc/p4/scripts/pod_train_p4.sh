#!/usr/bin/env bash
# ─── P4 prefix-forced training — four arms, one shape ────────────────────────
#
# Thresholds, readings and hard guards are preregistered in
# ../PREFIX-PREREG-AMENDMENT.md and are NOT restated here, so this script cannot
# quietly disagree with them.
#
# THE ARMS. One knob each, everything else held identical:
#   A  stratified     real reward    the literature's construction (arXiv 2605.08817 s3.3)
#   B  heterogeneous  real reward    what PREFIX-PREREG.md authorised
#   C  none           real reward    TRAINING ITSELF. Without C a flattened peak
#                                    cannot be attributed to forcing.
#   D  heterogeneous  RANDOM reward  THE VERIFIER. If random rewards flatten the
#                                    peak too, A/B prove nothing (arXiv 2506.10947).
#
# Plus a BASE eval with no adapter, because the published baseline (0.874) was
# measured on a 5090 through a different torch build, and the arc has already lost
# six phases of receipts to assuming an artifact measured elsewhere is the artifact
# being trained.
#
# TRAIN AT G=8, EVAL AT G=16. Deliberate and not a typo: G=8 is the shape whose
# memory and step time were actually measured locally (21.3 GB, 13.25 s/step), and
# G=16/n=32 is the shape every published probe in this arc used, so the eval stays
# comparable to 0.874. The coprime-stride fix means pool-level opening coverage no
# longer depends on G.
#
# Stage 0 is lifted verbatim from pod_smoke_p4.sh, which reached training on a
# Blackwell. Every comment in it marks a defect that has already been paid for once.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ARC=/workspace/arc
REPO=$ARC/ai-jam-sessions
TRAINER=$REPO/experiments/rollout-arc/p2/trainer
P4DIR=$REPO/experiments/rollout-arc/p4
ART=$ARC/artifacts
RUNS=$ARC/runs
PORT=${P4_PORT:-8766}

VOICES=${VOICES:-2}
STYLE=${STYLE:-common-practice}      # the HONEST style; film-ambient failed gate 3
VL_SEED=${VL_SEED:-20260913}
TRAIN_STEPS=${TRAIN_STEPS:-200}      # R2.10: 200-500 is the consistent window
TRAIN_GENS=${TRAIN_GENS:-8}
EVAL_GENS=${EVAL_GENS:-16}
CELL_LIMIT=${CELL_LIMIT:-32}
TRAIN_SEED=${TRAIN_SEED:-7}
# 384, not 512: the longest completion in the published G=16 unforced run is 127
# TOKENS (max 282 chars over 512 completions). The cap is not binding, and matching
# the probes' 384 keeps the eval comparable to the 0.874 baseline it is measured
# against. A bigger number would only pad the forward pass.
MAX_COMPLETION=${MAX_COMPLETION:-384}
# Wall-clock cap. The dead-man is the real compensator; this is the cheap one that
# stops a new arm from starting when the budget is already spent.
MAX_SECONDS=${MAX_SECONDS:-21600}

mkdir -p "$ART" "$RUNS"
RUN_T0=$(date +%s)
say() { printf '=== [p4-train] %s ===\n' "$*"; }
elapsed() { echo $(( $(date +%s) - RUN_T0 )); }
mark() {
  local name="$1" iso
  iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  printf '%s  +%ds since start\n' "$iso" "$(elapsed)" > "$ART/$name.DONE"
}

finish() {
  local iso
  iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  ( cd "$ART" && sha256sum ./*.tar.gz ./*.json ./*.jsonl ./*.txt 2>/dev/null > artifacts.sha256 ) || true
  printf '%s  total %ds\n' "$iso" "$(elapsed)" > "$ART/ALL.DONE"
  say "ALL.DONE in $(elapsed)s ($(wc -l < "$ART/artifacts.sha256" 2>/dev/null || echo 0) manifest entries)"
}

# ─── stage 0: the environment, un-silenced ──────────────────────────────────
# Progress IS the liveness signal. Do not add -q or >/dev/null: a silent stage with
# an idle GPU is indistinguishable from a stall, and a stall bills to the cap.
say "stage0 cuda check BEFORE anything is staged"
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
python3 -c "import torch;print('torch',torch.__version__,'cuda',torch.cuda.is_available())" 2>/dev/null || true

# The image ships python and CUDA but NOT node. A failure in the MIDDLE of an && list
# is exempt from set -e, which is how "build done" once printed over a build that
# never ran. Each command is the last of its own list.
say "stage0b node"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node --version | tee "$ART/node-version.txt"
corepack enable || npm i -g pnpm
pnpm --version | tee "$ART/pnpm-version.txt"

say "stage0b clone ${P4_REPO_URL:?set P4_REPO_URL} at ${P4_COMMIT:?set P4_COMMIT}"
mkdir -p "$ARC"
cd "$ARC"
# Idempotent: a relaunch after a staging failure must not die on "destination path
# already exists".
if [ ! -d "$REPO/.git" ]; then
  rm -rf "$REPO"
  git clone --filter=blob:none "$P4_REPO_URL" ai-jam-sessions
fi
cd "$REPO"
git fetch --depth 1 origin "$P4_COMMIT" 2>/dev/null || true
git checkout --detach "$P4_COMMIT"
say "stage0b clone done ($(git rev-parse --short HEAD))"

say "stage0c python deps (the ~3 GB torch download; progress is the liveness signal)"
# --extra-index-url is REQUIRED: torch==2.11.0+cu128 is a local version that does not
# exist on PyPI, and pip reports it as "no matching distribution" rather than as a
# missing index.
pip install --break-system-packages \
  --extra-index-url https://download.pytorch.org/whl/cu128 \
  -r "$TRAINER/requirements.lock.txt"
# The image's torchvision/torchaudio are compiled against torch 2.8.0+cu129. pip
# reports the mismatch only as a resolver warning; the symptom arrives minutes and one
# model load later as "operator torchvision::nms does not exist". Neither is needed
# for a text model.
pip uninstall -y --break-system-packages torchvision torchaudio 2>/dev/null || true
python3 -c 'import torch, transformers, peft, trl; print("imports ok:", torch.__version__, transformers.__version__, peft.__version__, trl.__version__)'
say "stage0c python deps done"

say "stage0d node deps + build"
cd "$REPO"
pnpm install --frozen-lockfile
pnpm build
say "stage0d build done"

# ─── the bridge ─────────────────────────────────────────────────────────────
# pnpm exec tsx, NOT bare node: the bridge imports TypeScript directly and Node's
# built-in TS support is strip-only.
#
# --fixture is NOT optional. songs/library ships 14 redistributable songs; the other
# 94 are fetched from source and never enter git, so a fresh clone builds a 14-song
# pool where a dev rig builds 107. The first smoke run served 14 rows to a trainer
# asking for 32 and was VOID. --require-pool makes that a startup failure.
say "stage0e bridge: ${VOICES}v ${STYLE}, pool seed ${VL_SEED}"
cd "$REPO"
pnpm exec tsx "$REPO/experiments/rollout-arc/scripts/p4-vl-server.mjs" \
  --port "$PORT" --voices "$VOICES" --style "$STYLE" --seed "$VL_SEED" \
  --fixture "$P4DIR/fixtures/progressions-v1.json" \
  --require-pool "$CELL_LIMIT" \
  > "$ART/vl-server.log" 2>&1 &
BRIDGE_PID=$!
# No pkill anywhere: a pattern broad enough to match the run also matches the ssh
# command carrying it.
trap 'kill "$BRIDGE_PID" 2>/dev/null || true' EXIT
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" > "$ART/bridge-health.json" 2>/dev/null; then break; fi
  sleep 2
done
test -s "$ART/bridge-health.json" || { echo "FAIL: bridge never answered /health"; exit 1; }
cat "$ART/bridge-health.json"

# One real scoring call through the real verifier, before any weights are touched.
GOLD=$(python3 -c "import json,urllib.request;print(json.load(urllib.request.urlopen('http://127.0.0.1:${PORT}/cases?limit=1'))['cases'][0]['gold'])")
curl -fsS -X POST "http://127.0.0.1:${PORT}/score" -H 'Content-Type: application/json' \
  -d "{\"gold\":\"${GOLD}\",\"messages\":[{\"role\":\"assistant\",\"content\":\"not json\"}]}" \
  -o "$ART/score-smoke.json"
cat "$ART/score-smoke.json"; printf '\n'
# The reward gate that matters: unparseable output must score 0, not 1.
# verifyVoiceLeading ADMITS a realization with no sounding frames, so without the
# structure gate an empty completion earns full reward and the policy learns to emit
# nothing.
python3 - "$ART/score-smoke.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d["reward"] == 0 and d["correct"] is False, f"REWARD HACK OPEN: unparseable scored {d}"
print("[p4] reward gate ok: unparseable -> reward 0")
PY
mark STAGE0

export PYTHONUNBUFFERED=1

# ─── the BASE eval, before any training ─────────────────────────────────────
# The falsifier compares against 0.874, measured on a 5090 through a different torch
# build. Re-measure it HERE on the exact artifact and hardware that will be trained.
# Six phases of this arc's receipts were voided by a quantization mismatch that every
# phase inherited from the last; this is the cheap version of not doing that again.
if [ ! -f "$ART/EVAL-base.DONE" ]; then
  say "eval base (no adapter), G=${EVAL_GENS}, n=${CELL_LIMIT}"
  cd "$REPO"
  python3 "$REPO/experiments/rollout-arc/p3/scripts/probe_generate.py" \
    --prompts "$P4DIR/runs/spec-prompts-4bar-random.jsonl" \
    --out "$P4DIR/runs/eval-base.jsonl" \
    --generations "$EVAL_GENS" --max-new-tokens "$MAX_COMPLETION" --seed "$TRAIN_SEED"
  cp "$P4DIR/runs/eval-base.jsonl" "$ART/eval-base.jsonl"
  # score-curriculum.mts resolves BOTH its input and its output against the repo's
  # own p4/runs, so the eval must be written there, not into the pod's $RUNS.
  STYLE="$STYLE" VOICES="$VOICES" pnpm exec tsx "$P4DIR/scripts/score-curriculum.mts" \
    eval-base.jsonl spec-prompts-4bar-random.jsonl | tee "$ART/eval-base-summary.txt"
  cp "$P4DIR/runs/summary-eval-base.json" "$ART/summary-eval-base.json" 2>/dev/null || true
  mark EVAL-base
fi

# ─── one arm ────────────────────────────────────────────────────────────────
# train -> guards -> trained adapter -> UNCONDITIONED eval -> score.
# Each arm banks its own DONE marker, so a relaunch resumes rather than repeats: an
# arm that finished is money already spent and must not be spent twice.
run_arm() {
  local name="$1" mode="$2" extra="$3"
  if [ -f "$ART/ARM-${name}.DONE" ]; then
    say "arm ${name}: already done, skipping"
    return 0
  fi
  if [ "$(elapsed)" -gt "$MAX_SECONDS" ]; then
    say "arm ${name}: SKIPPED, wall-clock budget ${MAX_SECONDS}s exhausted at $(elapsed)s"
    return 0
  fi

  local out="$RUNS/arm-${name}"
  local adapter="$RUNS/adapter-${name}"
  say "arm ${name}: mode=${mode} extra='${extra}' steps=${TRAIN_STEPS} G=${TRAIN_GENS}"
  cd "$TRAINER"
  # --limit is passed EXPLICITLY. train.py halts on an unchosen prompt repeat and
  # warns on a chosen one; at 200 steps over 32 rows the repeat is chosen.
  # shellcheck disable=SC2086
  python3 train.py --no-tools \
    --base-url "http://127.0.0.1:${PORT}" \
    --steps "$TRAIN_STEPS" \
    --num-generations "$TRAIN_GENS" \
    --per-device-batch "$TRAIN_GENS" \
    --limit "$CELL_LIMIT" \
    --max-completion-length "$MAX_COMPLETION" \
    --seed "$TRAIN_SEED" \
    --prefix-mode "$mode" \
    $extra \
    --save-final-adapter "$adapter" \
    --out "$out"
  cp "$out/run.json" "$ART/arm-${name}.json"

  # Hard guards, as RESULTS not hopes. An arm whose population or forcing is not what
  # was asked for is void BEFORE its rewards are read.
  python3 "$P4DIR/scripts/arm_guards.py" "$out/run.json" "$mode" "$CELL_LIMIT"

  # THE FALSIFIER. Unconditioned: scaffolding off, nobody hands the model an opening.
  # Pass rate is NOT the primary metric and will look fine either way.
  say "arm ${name}: unconditioned eval, G=${EVAL_GENS}"
  cd "$REPO"
  python3 "$REPO/experiments/rollout-arc/p3/scripts/probe_generate.py" \
    --prompts "$P4DIR/runs/spec-prompts-4bar-random.jsonl" \
    --out "$P4DIR/runs/eval-${name}.jsonl" \
    --generations "$EVAL_GENS" --max-new-tokens "$MAX_COMPLETION" --seed "$TRAIN_SEED" \
    --adapter "$adapter"
  cp "$P4DIR/runs/eval-${name}.jsonl" "$ART/eval-${name}.jsonl"
  # NOT `|| true`. A scoring failure here is the falsifier failing to be measured,
  # which is the whole point of the arm; swallowing it would bank a DONE marker over
  # an arm with no primary outcome.
  STYLE="$STYLE" VOICES="$VOICES" pnpm exec tsx "$P4DIR/scripts/score-curriculum.mts" \
    "eval-${name}.jsonl" spec-prompts-4bar-random.jsonl | tee "$ART/eval-${name}-summary.txt"
  cp "$P4DIR/runs/summary-eval-${name}.json" "$ART/summary-eval-${name}.json" 2>/dev/null || true
  tar -czf "$ART/adapter-${name}.tar.gz" -C "$RUNS" "adapter-${name}"
  mark "ARM-${name}"
  say "arm ${name}: done at $(elapsed)s"
}

run_arm A stratified ""
run_arm B heterogeneous ""
run_arm C none ""
run_arm D heterogeneous "--random-reward"

finish
