#!/usr/bin/env bash
# ─── B0 vs C — the executable of B0-PREREG.md ────────────────────────────────
#
# A NEW FILE. `pod_train_p4.sh` is NOT edited and NOT used: it is still the four-arm
# prefix cell — `--prefix-mode` arms A–D, eval G=16, and eval prompts
# `spec-prompts-4bar-random.jsonl`, which is the 32-item TRAINED pool. Staging that
# would spend this cell's ceiling on a different experiment whose numbers cannot be
# compared to anything in `1619f71`. It stays on disk as the receipt of what was run
# before.
#
# THE CELL (B0-PREREG.md, do not restate thresholds here so the two cannot drift):
#   one lever, `--beta`. C = 1e-4 (the arc's pin). B0 = 0.0 (TRL's own default).
#   Everything else identical: --prefix-mode none, 200 steps, G=8 train, n=32 frozen
#   fixture, eps 0.2/0.28, loss_type dapo, scale_rewards group, entropy off.
#   Six trains, seeds 7/8/9 per arm. Seven unconditioned evals at G=64 on the SAME 75
#   held-out items, generation seed fixed at 7 for every one of them.
#
# ORDER IS DELIBERATE: base eval, then ALL SIX TRAINS WITH THEIR GUARDS, then the six
# adapter evals. A void arm is therefore caught before 40 minutes of eval is spent on
# it. The cost is that a cap hit during the eval phase leaves adapters without evals —
# which is why the babysitter fetches each adapter on its own ARM marker and why every
# stage banks a DONE marker: a relaunch resumes and never re-spends a finished arm.
#
# --beta IS PASSED EXPLICITLY ON BOTH ARMS, including the control, whose value equals
# the current default. A control that relied on the default would silently move the
# day someone changes it.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ARC=/workspace/arc
REPO=$ARC/ai-jam-sessions
TRAINER=$REPO/experiments/rollout-arc/p2/trainer
P4DIR=$REPO/experiments/rollout-arc/p4
# beta_guards.py `cell` reads adapters AND evals out of one directory, and the tracked
# 75-item prompt file already lives here. Keep all three together.
RUNS=$P4DIR/runs
ART=$ARC/artifacts
PORT=${B0_PORT:-8766}

VOICES=${VOICES:-2}
STYLE=${STYLE:-common-practice}
VL_SEED=${VL_SEED:-20260913}
TRAIN_STEPS=${TRAIN_STEPS:-200}
TRAIN_GENS=${TRAIN_GENS:-8}
EVAL_GENS=${EVAL_GENS:-64}          # PREREGISTERED. Not to be dropped to fit the wall.
CELL_LIMIT=${CELL_LIMIT:-32}
MAX_COMPLETION=${MAX_COMPLETION:-384}
EVAL_SEED=${EVAL_SEED:-7}           # generation seed, FIXED across arms and the base
PROMPTS=${PROMPTS:-prompts-heldout-v1.jsonl}
# 16 h = the dead-man cap derived from the $12 ceiling at 5090 community
# (pod-ledger.py --ceiling 12). This is the cheap stop that keeps a new stage from
# starting; the dead-man is the real compensator and is armed before this runs.
MAX_SECONDS=${MAX_SECONDS:-57600}

# arm  beta    seed
ARMS=(
  "C7   1e-4   7"
  "C8   1e-4   8"
  "C9   1e-4   9"
  "B07  0.0    7"
  "B08  0.0    8"
  "B09  0.0    9"
)
arm_kind() { case "$1" in C*) echo C ;; B0*) echo B0 ;; esac; }

mkdir -p "$ART" "$RUNS"
RUN_T0=$(date +%s)
say() { printf '=== [b0] %s ===\n' "$*"; }
elapsed() { echo $(( $(date +%s) - RUN_T0 )); }
mark() {
  local name iso; name="$1"; iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  printf '%s  +%ds since start\n' "$iso" "$(elapsed)" > "$ART/$name.DONE"
}
# The babysitter fetches this on EVERY marker, so the per-stage breakdown that sizes
# the next attempt is already local even if the pod dies mid-run.
timing() {
  printf '{"stage":"%s","seconds":%s,"elapsed":%s,"at":"%s"}\n' \
    "$1" "$2" "$(elapsed)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$ART/stage-timings.jsonl"
}
budget_left() {  # $1 = stage name. 0 = go, 1 = skip.
  if [ "$(elapsed)" -gt "$MAX_SECONDS" ]; then
    say "$1: SKIPPED, wall budget ${MAX_SECONDS}s exhausted at $(elapsed)s"
    return 1
  fi
  return 0
}

finish() {
  local iso; iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  ( cd "$ART" && sha256sum ./*.tar.gz ./*.json ./*.jsonl ./*.txt 2>/dev/null > artifacts.sha256 ) || true
  printf '%s  total %ds\n' "$iso" "$(elapsed)" > "$ART/ALL.DONE"
  say "ALL.DONE in $(elapsed)s ($(wc -l < "$ART/artifacts.sha256" 2>/dev/null || echo 0) manifest entries)"
}

# ─── stage 0: the environment, un-silenced ──────────────────────────────────
# Lifted from pod_train_p4.sh. Every comment in it marks a defect already paid for
# once. Progress IS the liveness signal: do not add -q or >/dev/null, because a silent
# stage with an idle GPU is indistinguishable from a stall, and a stall bills to the cap.
say "stage0 cuda check BEFORE anything is staged"
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader | tee "$ART/gpu.txt"
python3 -c "import torch;print('torch',torch.__version__,'cuda',torch.cuda.is_available())" 2>/dev/null || true

# NO NETWORK VOLUME. A community volume keeps billing after the pod dies (LoRA
# playbook), and none exists on the account. If /workspace is a mount, the pod was
# created wrong and the cheapest moment to find out is now, before the image is staged.
WS_FS=$(findmnt -no FSTYPE --target /workspace 2>/dev/null || echo unknown)
echo "/workspace fstype: $WS_FS" | tee "$ART/workspace-fs.txt"
case "$WS_FS" in
  nfs|nfs4|ceph|glusterfs|cifs)
    say "WARNING: /workspace is a NETWORK filesystem ($WS_FS) -- that is a billing volume, and"
    say "         a community volume keeps billing after the pod dies. Expected container disk." ;;
esac

# The image ships python and CUDA but NOT node. A failure in the MIDDLE of an && list
# is exempt from set -e, which is how "build done" once printed over a build that never
# ran. Each command is the last of its own list.
say "stage0b node"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node --version | tee "$ART/node-version.txt"
corepack enable || npm i -g pnpm
pnpm --version | tee "$ART/pnpm-version.txt"

say "stage0b clone ${B0_REPO_URL:?set B0_REPO_URL} at ${B0_COMMIT:?set B0_COMMIT}"
mkdir -p "$ARC"
cd "$ARC"
# Idempotent: a relaunch after a staging failure must not die on "destination path
# already exists".
if [ ! -d "$REPO/.git" ]; then
  rm -rf "$REPO"
  git clone --filter=blob:none "$B0_REPO_URL" ai-jam-sessions
fi
cd "$REPO"
git fetch --depth 1 origin "$B0_COMMIT" 2>/dev/null || true
git checkout --detach "$B0_COMMIT"
git rev-parse HEAD | tee "$ART/repo-commit.txt"
say "stage0b clone done ($(git rev-parse --short HEAD))"

# The prereg and BOTH guards must exist in the checkout. A pod that reached training
# and then found no guard would produce six unverifiable arms at full price.
for f in "$P4DIR/B0-PREREG.md" "$P4DIR/scripts/beta_guards.py" "$P4DIR/scripts/arm_guards.py" \
         "$RUNS/$PROMPTS" "$P4DIR/fixtures/progressions-v1.json"; do
  test -f "$f" || { echo "FAIL: $f missing at $B0_COMMIT — this commit cannot execute the cell"; exit 1; }
done
test "$(wc -l < "$RUNS/$PROMPTS")" -eq 75 || { echo "FAIL: $PROMPTS is not the 75-item held-out pool"; exit 1; }
say "stage0b prereg + guards + 75-item pool present"

say "stage0c python deps (the ~3 GB torch download; progress is the liveness signal)"
# --extra-index-url is REQUIRED: torch==2.11.0+cu128 is a local version that does not
# exist on PyPI, and pip reports it as "no matching distribution" rather than as a
# missing index.
pip install --break-system-packages \
  --extra-index-url https://download.pytorch.org/whl/cu128 \
  -r "$TRAINER/requirements.lock.txt"
# The image's torchvision/torchaudio are compiled against torch 2.8.0+cu129. pip reports
# the mismatch only as a resolver warning; the symptom arrives minutes and one model load
# later as "operator torchvision::nms does not exist". Neither is needed for a text model.
pip uninstall -y --break-system-packages torchvision torchaudio 2>/dev/null || true
python3 -c 'import torch, transformers, peft, trl; print("imports ok:", torch.__version__, transformers.__version__, peft.__version__, trl.__version__)'
pip freeze > "$ART/pip-pins.txt"
# beta_guards.py asserts trl == 1.13.0 on every receipt; fail here instead of six arms later.
python3 -c 'import trl,sys; sys.exit(0 if trl.__version__=="1.13.0" else 1)' \
  || { echo "FAIL: trl is not 1.13.0 — every line number this cell's guards cite has moved"; exit 1; }
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
# --fixture is NOT optional. songs/library ships 14 redistributable songs; the other 94
# are fetched from source and never enter git, so a fresh clone builds a 14-song pool
# where a dev rig builds 107. The first paid smoke run served 14 rows to a trainer
# asking for 32 and was VOID. --require-pool makes that a startup failure.
say "stage0e bridge: ${VOICES}v ${STYLE}, pool seed ${VL_SEED}"
cd "$REPO"
pnpm exec tsx "$REPO/experiments/rollout-arc/scripts/p4-vl-server.mjs" \
  --port "$PORT" --voices "$VOICES" --style "$STYLE" --seed "$VL_SEED" \
  --fixture "$P4DIR/fixtures/progressions-v1.json" \
  --require-pool "$CELL_LIMIT" \
  > "$ART/vl-server.log" 2>&1 &
BRIDGE_PID=$!
# No pkill anywhere: a pattern broad enough to match the run also matches the ssh command
# carrying it.
trap 'kill "$BRIDGE_PID" 2>/dev/null || true' EXIT
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" > "$ART/bridge-health.json" 2>/dev/null; then break; fi
  sleep 2
done
test -s "$ART/bridge-health.json" || { echo "FAIL: bridge never answered /health"; exit 1; }
cat "$ART/bridge-health.json"

# One real scoring call through the real verifier, before any weights are touched. The
# reward gate that matters: unparseable output must score 0, not 1. verifyVoiceLeading
# ADMITS a realization with no sounding frames, so without the structure gate an empty
# completion earns full reward and the policy learns to emit nothing.
GOLD=$(python3 -c "import json,urllib.request;print(json.load(urllib.request.urlopen('http://127.0.0.1:${PORT}/cases?limit=1'))['cases'][0]['gold'])")
curl -fsS -X POST "http://127.0.0.1:${PORT}/score" -H 'Content-Type: application/json' \
  -d "{\"gold\":\"${GOLD}\",\"messages\":[{\"role\":\"assistant\",\"content\":\"not json\"}]}" \
  -o "$ART/score-smoke.json"
cat "$ART/score-smoke.json"; printf '\n'
python3 - "$ART/score-smoke.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d["reward"] == 0 and d["correct"] is False, f"REWARD HACK OPEN: unparseable scored {d}"
print("[b0] reward gate ok: unparseable -> reward 0")
PY
mark STAGE0
timing stage0 "$(elapsed)"

export PYTHONUNBUFFERED=1
export PYTHONIOENCODING=utf-8

# ─── eval helper ────────────────────────────────────────────────────────────
# Unconditioned: scaffolding off, nobody hands the model an opening. Same 75 prompts,
# same generation seed, G=64, for the base and for every arm.
run_eval() {  # $1 = label ("base" or an arm name)   $2 = adapter dir or ""
  local label="$1" adapter="${2:-}" t0
  if [ -f "$ART/EVAL-${label}.DONE" ]; then say "eval ${label}: already done, skipping"; return 0; fi
  budget_left "eval ${label}" || return 0
  say "eval ${label}: G=${EVAL_GENS} n=75 seed=${EVAL_SEED} adapter='${adapter}'"
  t0=$(date +%s)
  cd "$REPO"
  local args=(--prompts "$RUNS/$PROMPTS" --out "$RUNS/mc64-heldout-${label}.jsonl"
              --generations "$EVAL_GENS" --max-new-tokens "$MAX_COMPLETION" --seed "$EVAL_SEED")
  [ -n "$adapter" ] && args+=(--adapter "$adapter")
  # NOT `|| true`. A generation failure here is the primary failing to be measured.
  # `if !` and not `cmd; rc=$?`: under `set -e` the bare form aborts BEFORE the message,
  # so the log would show a dead run and no reason. An if-condition is exempt from set -e.
  if ! python3 "$REPO/experiments/rollout-arc/p3/scripts/probe_generate.py" "${args[@]}"; then
    say "HALT: eval ${label} generation failed"; exit 1
  fi
  test "$(wc -l < "$RUNS/mc64-heldout-${label}.jsonl")" -eq 75 \
    || { say "HALT: eval ${label} did not write 75 rows"; exit 1; }
  cp "$RUNS/mc64-heldout-${label}.jsonl" "$ART/"
  mark "EVAL-${label}"
  timing "eval-${label}" "$(( $(date +%s) - t0 ))"
  say "eval ${label}: done at $(elapsed)s"
}

# ─── 1. the base eval, first ────────────────────────────────────────────────
# It anchors each arm's vs-base number AND is the first clean cross-platform comparison
# of CONCENTRATION at matched G — platform-concentration.mts could only do that at G=16
# by subsampling. Base first so the cheapest-to-lose artifact is banked earliest.
run_eval base ""

# ─── 2. six trains, each guarded before its rewards are read ────────────────
for row in "${ARMS[@]}"; do
  read -r NAME BETA SEED <<< "$row"
  KIND=$(arm_kind "$NAME")
  OUT=$RUNS/arm-${NAME}
  ADP=$RUNS/adapter-${NAME}
  if [ -f "$OUT/run.json" ]; then say "arm ${NAME}: run.json present, skipping"; continue; fi
  budget_left "arm ${NAME}" || continue

  say "arm ${NAME}: kind=${KIND} beta=${BETA} seed=${SEED} steps=${TRAIN_STEPS} G=${TRAIN_GENS}"
  T0=$(date +%s)
  cd "$TRAINER"
  # --limit is passed EXPLICITLY. train.py halts on an unchosen prompt repeat and warns
  # on a chosen one; at 200 steps over 32 rows the repeat is chosen.
  # `if !` for the same reason as in run_eval: under `set -e` a bare failing command
  # aborts before the halt message, and a dead run with no reason is the expensive kind.
  if ! python3 train.py --no-tools \
    --base-url "http://127.0.0.1:${PORT}" \
    --steps "$TRAIN_STEPS" \
    --num-generations "$TRAIN_GENS" \
    --per-device-batch "$TRAIN_GENS" \
    --limit "$CELL_LIMIT" \
    --max-completion-length "$MAX_COMPLETION" \
    --seed "$SEED" \
    --beta "$BETA" \
    --prefix-mode none \
    --save-final-adapter "$ADP" \
    --out "$OUT"; then
    say "HALT: arm ${NAME} training failed"; exit 1
  fi
  cp "$OUT/run.json" "$ART/arm-${NAME}.json"

  # ANDON. Population and forcing first, then the objective pins this cell turns on.
  # Both halt the whole run: a void arm is not a smaller version of the experiment.
  python3 "$P4DIR/scripts/arm_guards.py" "$OUT/run.json" none "$CELL_LIMIT" \
    || { say "HALT: arm_guards VOID on ${NAME}"; exit 9; }
  python3 "$P4DIR/scripts/beta_guards.py" arm "$OUT/run.json" "$KIND" \
    || { say "HALT: beta_guards VOID on ${NAME} (arm kind ${KIND})"; exit 9; }

  tar -czf "$ART/adapter-${NAME}.tar.gz" -C "$RUNS" "adapter-${NAME}"
  mark "ARM-${NAME}"
  timing "arm-${NAME}" "$(( $(date +%s) - T0 ))"
  say "arm ${NAME}: done at $(elapsed)s"
done

# ─── 3. six unconditioned evals, each naming its own adapter ────────────────
for row in "${ARMS[@]}"; do
  read -r NAME _BETA _SEED <<< "$row"
  if [ ! -d "$RUNS/adapter-${NAME}" ]; then
    say "eval ${NAME}: no adapter (arm skipped or void) — not evaluating"
    continue
  fi
  run_eval "$NAME" "$RUNS/adapter-${NAME}"
done

# ─── 4. the cell-level ANDON, before ALL.DONE ───────────────────────────────
# Six adapters with six DISTINCT SHA-256 digests (a reused run is caught by bytes, not
# by filename), every eval 75 x G=64, and no eval that is structurally perfect and
# entirely empty. Runs against what is on disk, so a partial cell reports as partial.
say "cell guards"
python3 "$P4DIR/scripts/beta_guards.py" cell "$RUNS" | tee "$ART/cell-guards.txt" \
  || { say "HALT: cell guards VOID — see cell-guards.txt"; cp "$ART/cell-guards.txt" "$ART/CELL-VOID.txt"; exit 9; }

finish
