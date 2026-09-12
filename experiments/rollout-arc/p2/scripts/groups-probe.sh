#!/usr/bin/env bash
# ─── P2 groups-per-step probe ────────────────────────────────────────────────
#
# ONE question: how many prompt groups per optimizer step will this card hold,
# and what does each cost in wall time?
#
# Why it matters. TRL 1.13.0's GRPOTrainer has NO dynamic sampling — verified
# against the installed grpo_trainer.py: no resample loop, no std>0 filter,
# frac_reward_zero_std is logged and nothing is discarded. So a step whose groups
# all agree contributes zero gradient and is a no-op. At the measured 27.1%
# non-degenerate rate on the train split:
#
#     P(every group degenerate) = 0.729 ^ g
#       g=1  73%   <- the smoke run's shape; ~3 steps in 4 were no-ops
#       g=2  53%
#       g=4  28%
#       g=8   8%
#
# More groups is a config change at fixed num_generations, not new code. The only
# unknown is whether the memory fits, because g groups is g times the activation
# footprint, and the rig's 5090 already found this configuration's ceiling the
# hard way at 32 GB.
#
# --per-device-batch counts COMPLETIONS, not prompts, so groups = batch / gens.
#
# An OOM here is a RESULT, not a failure: it is the ceiling we came to find. The
# sweep records it and keeps going rather than dying, so one bad rung does not
# cost the rungs after it.
#
#   bash groups-probe.sh            # default sweep
#   STEPS=3 GENS=8 bash groups-probe.sh
set -uo pipefail          # NOT -e: an OOM rung must not abort the sweep

TRAINER="${TRAINER:-/workspace/arc/ai-jam-sessions/experiments/rollout-arc/p2/trainer}"
ART="${ART:-/workspace/arc/artifacts}"
RUNS="${RUNS:-/workspace/arc/runs}"
STEPS="${STEPS:-3}"
GENS="${GENS:-8}"
GROUPS="${GROUPS:-1 2 4 8}"

mkdir -p "$ART" "$RUNS"
OUT="$ART/groups-probe.jsonl"
: > "$OUT"

say() { printf '\n=== [probe] %s ===\n' "$*"; }

nvidia-smi --query-gpu=name,memory.total --format=csv,noheader > "$ART/probe-gpu.txt"
say "card: $(cat "$ART/probe-gpu.txt")"

for g in $GROUPS; do
  batch=$(( g * GENS ))
  say "g=$g  (per-device-batch $batch = $g group(s) x $GENS generations)  steps=$STEPS"
  rundir="$RUNS/probe-g$g"
  rm -rf "$rundir"

  t0=$(date +%s)
  python "$TRAINER/train.py" --dry \
    --steps "$STEPS" \
    --num-generations "$GENS" \
    --per-device-batch "$batch" \
    --max-completion-length 1024 \
    --max-tool-iterations 5 \
    --out "$rundir" > "$ART/probe-g$g.log" 2>&1
  rc=$?
  t1=$(date +%s)

  if [ $rc -eq 0 ] && [ -f "$rundir/dry-run.json" ]; then
    python - "$g" "$batch" "$(( t1 - t0 ))" "$rundir/dry-run.json" "$OUT" <<'PY'
import json, sys
g, batch, wall, src, out = sys.argv[1:6]
r = json.load(open(src))
m = r.get("memory") or {}
rec = {
    "groups": int(g), "per_device_batch": int(batch), "ok": True,
    "steps_timed": r.get("steps_timed"),
    "mean_step_seconds": r.get("mean_step_seconds"),
    "step_seconds": r.get("step_seconds"),
    "wall_seconds": int(wall),
    "peak_reserved_mib": m.get("peak_reserved_mib"),
    "total_mib": m.get("total_mib"),
    "headroom_mib": m.get("headroom_mib"),
    "mask_zero_fraction": (r.get("mask") or {}).get("zero_fraction"),
}
open(out, "a").write(json.dumps(rec) + "\n")
print(f"[probe] g={g} ok mean_step={rec['mean_step_seconds']}s "
      f"peak={rec['peak_reserved_mib']} MiB headroom={rec['headroom_mib']} MiB")
PY
  else
    # An OOM is the answer, not an error. Record it and carry on.
    reason="rc=$rc"
    if grep -qiE 'out of memory|CUDA out of memory|OutOfMemoryError' "$ART/probe-g$g.log"; then
      reason="OOM"
    fi
    printf '{"groups":%d,"per_device_batch":%d,"ok":false,"reason":"%s","wall_seconds":%d}\n' \
      "$g" "$batch" "$reason" "$(( t1 - t0 ))" >> "$OUT"
    echo "[probe] g=$g FAILED ($reason) — ceiling found, continuing"
  fi
done

say "probe complete"
cat "$OUT"
printf 'PROBE.DONE %s\n' "$(date -Is)" > "$ART/PROBE.DONE"
