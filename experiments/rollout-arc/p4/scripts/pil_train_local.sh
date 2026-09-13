#!/usr/bin/env bash
# The replication gate's training, per GATE-PREREG.md. Three runs of arm C, identical but
# for --seed. Local RTX 5090, $0, no pod.
#
# Each seed banks its own run.json and is SKIPPED if already present: a finished run is an
# hour of GPU already spent and must not be spent twice on a relaunch.
#
# Each command is the last of its own list -- `set -e` does not fire mid-&&, which is how
# "build done" once printed over a build that never ran (handoff trap 8).
set -uo pipefail

REPO=/e/AI/ai-jam-sessions
TRAINER=$REPO/experiments/rollout-arc/p2/trainer
P4=$REPO/experiments/rollout-arc/p4
GATE=$P4/runs/gate
PY=$TRAINER/.venv/Scripts/python.exe

# Windows + TRL's rich completions table raises UnicodeEncodeError on the first non-cp1252
# character -- AFTER step 1 has run, so the traceback points at trainer.train() and reads
# like a training bug (handoff trap 0c).
export PYTHONIOENCODING=utf-8
export PYTHONUNBUFFERED=1

mkdir -p "$GATE"
cd "$TRAINER"

# The bridge must already be serving the FROZEN 32-item fixture. A 14-song library pool is
# what voided the first paid smoke run; --require-pool makes that a startup failure, and
# this is the cheap second check that it is the pool we think it is.
POOL=$(curl -fsS http://127.0.0.1:8766/health | python -c "import json,sys; h=json.load(sys.stdin); print(h['pool_size'], h['pool_source'], h['style'], h['voices'])" 2>/dev/null)
echo "[gate] bridge pool: $POOL"
case "$POOL" in
  "32 fixture common-practice 2") echo "[gate] bridge OK" ;;
  *) echo "[gate] HALT: bridge is not the preregistered cell ($POOL)"; exit 1 ;;
esac

for S in 7 8 9; do
  OUT=$GATE/arm-PIL${S}L
  ADP=$GATE/adapter-PIL${S}L
  LOG=$GATE/train-PIL${S}L.log
  if [ -f "$OUT/run.json" ]; then
    echo "[gate] seed $S already complete, skipping"
    continue
  fi
  echo "[gate] === seed $S START $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  "$PY" "$TRAINER/train.py" --no-tools \
    --base-url http://127.0.0.1:8766 \
    --steps 200 \
    --num-generations 8 \
    --per-device-batch 8 \
    --limit 32 \
    --max-completion-length 384 \
    --seed "$S" \
    --prefix-mode heterogeneous --prefix-in-loss \
    --save-final-adapter "$ADP" \
    --out "$OUT" > "$LOG" 2>&1
  RC=$?
  echo "[gate] === seed $S EXIT $RC $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  if [ $RC -ne 0 ]; then
    echo "[gate] HALT: seed $S failed, see $LOG"
    tail -25 "$LOG"
    exit 1
  fi
  # ANDON: an arm whose population or forcing is not what was asked for is void BEFORE its
  # rewards are read.
  "$PY" "$P4/scripts/arm_guards.py" "$OUT/run.json" heterogeneous 32 || { echo "[gate] HALT: guards failed for seed $S"; exit 1; }
  # THE ARM'S OWN ANDON. A silently-masked run is byte-indistinguishable from arm B in its
  # metrics, so prefix_in_loss / prefix_tokens_total / masked_prefix_tokens are ASSERTED.
  "$PY" - "$OUT/run.json" <<'PYEOF2'
import json, sys
p = json.load(open(sys.argv[1]))["prefix"]
assert p.get("prefix_in_loss") is True, f"VOID: prefix_in_loss={p.get('prefix_in_loss')}"
assert (p.get("prefix_tokens_total") or 0) > 0, "VOID: no prefix tokens -- forcing did not happen"
assert p.get("masked_prefix_tokens") == 0, f"VOID: mask still on ({p.get('masked_prefix_tokens')})"
print(f"[gate]   ANDON ok: in_loss={p['prefix_in_loss']} forced={p['prefix_tokens_total']} masked={p['masked_prefix_tokens']} openings/group={p.get('openings_per_group_min')}..{p.get('openings_per_group_max')}")
PYEOF2
  python - "$OUT/run.json" <<'PYEOF'
import json, sys
r = json.load(open(sys.argv[1]))
v = r["versions"]
print(f"[gate]   receipt: python {v['python']} torch {v['torch']} trl {v['trl']} device {v['device']}")
print(f"[gate]   rows {r['dataset_rows']} repeats {r['prompt_repeats']} mode {r['prefix']['mode']} wall {r['wall_seconds']:.0f}s")
PYEOF
done
echo "[pil] ALL PIL TRAINING DONE $(date -u +%Y-%m-%dT%H:%M:%SZ)"
