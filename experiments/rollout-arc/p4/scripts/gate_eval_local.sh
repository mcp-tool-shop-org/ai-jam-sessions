#!/usr/bin/env bash
# Post-training GPU queue, per GATE-PREREG.md. Waits for training, then:
#   1. the Verbalized Sampling control (fast, ~35 min) -- training-free prior baseline
#   2. the G=64 held-out evals the prereg commits to (~6h)
#
# VS runs FIRST because it is short and answers a live question; the long evals then run
# without anyone waiting on them.
#
# Every step is skipped if its output already exists. Generation is hours of GPU and must
# not be spent twice on a relaunch.
#
# G=64 IS PREREGISTERED. Do not quietly drop it to G=32 to save wall clock -- deviating
# from a preregistration after seeing how long it takes is the failure this gate exists
# to avoid.
set -uo pipefail

REPO=/e/AI/ai-jam-sessions
P4=$REPO/experiments/rollout-arc/p4
RUNS=$P4/runs
GATE=$RUNS/gate
PY=$REPO/experiments/rollout-arc/p2/trainer/.venv/Scripts/python.exe
PROBE=$REPO/experiments/rollout-arc/p3/scripts/probe_generate.py
export PYTHONIOENCODING=utf-8
export PYTHONUNBUFFERED=1

echo "[eval] waiting for training to finish"
while ! grep -q "ALL GATE TRAINING DONE" "$GATE/gate-train.log" 2>/dev/null; do
  if grep -q "HALT" "$GATE/gate-train.log" 2>/dev/null; then
    echo "[eval] training HALTED -- not starting evals"; exit 1
  fi
  sleep 30
done
echo "[eval] training done $(date -u +%H:%M:%SZ)"

# Ollama can hold 19 GB resident and generation needs the card. Unload before starting.
/c/Users/mikey/AppData/Local/Programs/Ollama/ollama ps 2>/dev/null | tail -n +2 | awk '{print $1}' | while read -r m; do
  [ -n "$m" ] && /c/Users/mikey/AppData/Local/Programs/Ollama/ollama stop "$m" >/dev/null 2>&1
done
nvidia-smi --query-gpu=memory.free --format=csv,noheader

gen() {  # label  prompts  out  generations  maxtok  [adapter]
  local label="$1" prompts="$2" out="$3" g="$4" mt="$5" adapter="${6:-}"
  if [ -s "$RUNS/$out" ]; then echo "[eval] $label already present, skipping"; return 0; fi
  echo "[eval] === $label START $(date -u +%H:%M:%SZ) G=$g maxtok=$mt ==="
  local args=(--prompts "$RUNS/$prompts" --out "$RUNS/$out" --generations "$g" --max-new-tokens "$mt" --seed 7)
  [ -n "$adapter" ] && args+=(--adapter "$adapter")
  "$PY" "$PROBE" "${args[@]}" > "$GATE/gen-$label.log" 2>&1
  local rc=$?
  if [ $rc -ne 0 ]; then
    echo "[eval] HALT: $label failed rc=$rc"; tail -20 "$GATE/gen-$label.log"; return 1
  fi
  echo "[eval] === $label DONE $(date -u +%H:%M:%SZ) $(wc -l < "$RUNS/$out") rows ==="
}

# 1. Verbalized Sampling control -- BASE model, no adapter. 8 completions x K=5 candidates
#    = 40 realizations per item, against standard sampling's 16.
gen vs-base prompts-vs-heldout.jsonl vs-heldout-base.jsonl 8 2048 || exit 1

# 2. The preregistered G=64 held-out evals. Base first: one base eval is shared by every
#    comparison and its noise never averages away, so it is the highest-leverage file here.
gen mc64-base prompts-heldout-v1.jsonl mc64-heldout-base.jsonl 64 384 || exit 1
gen mc64-C7L  prompts-heldout-v1.jsonl mc64-heldout-C7L.jsonl  64 384 "$GATE/adapter-C7L" || exit 1
gen mc64-C8L  prompts-heldout-v1.jsonl mc64-heldout-C8L.jsonl  64 384 "$GATE/adapter-C8L" || exit 1
gen mc64-C9L  prompts-heldout-v1.jsonl mc64-heldout-C9L.jsonl  64 384 "$GATE/adapter-C9L" || exit 1

echo "[eval] ALL GATE EVALS DONE $(date -u +%Y-%m-%dT%H:%M:%SZ)"
