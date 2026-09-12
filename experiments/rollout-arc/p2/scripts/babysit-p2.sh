#!/usr/bin/env bash
# ─── babysit-p2.sh — P2 local-side fetcher + watchdog (lock §7, §8) ──────────
#
# The v1/b2 anti-loss pattern, P2 paths and markers swapped. Not a rewrite:
# every rule below was paid for by a previous arc.
#
#   * stream each artifact off the pod the minute its DONE marker appears, so
#     termination at any point forfeits at most the in-flight stage;
#   * on ALL.DONE verify artifacts.sha256 LOCALLY, then API-terminate the pod
#     and disarm the dead-man;
#   * liveness = run.log GROWS **or** a new marker appears **or** the GPU is
#     busy (>10%). The GPU clause is not optional: Python block-buffers stdout
#     under nohup, and a log-only window false-stalled podA at 11:03 on
#     2026-07-11 while the sweep ran at 97% utilization;
#   * no pkill anywhere. A pattern that matches the ssh command carrying it
#     kills the wrong process — do not reintroduce one;
#   * a checksum mismatch leaves the pod RUNNING and the dead-man ARMED, so a
#     manual fetch is still possible. Only a verified fetch terminates.
#
# Exit: 0 clean (verified + terminated) · 2 stall · 3 unreachable · 4 checksum
# mismatch. Anything non-zero leaves the dead-man armed on purpose.
#
#   babysit-p2.sh <label> <podId> <ip> <port> <artifactDir>
#
# Test seams — all default to production, and exist because a compensator that
# has never run is not a compensator (see compensator-drill.mjs):
#   P2_SSH_CMD, P2_SCP_CMD, RUNPOD_API_URL, P2_POLL_SECONDS, P2_STALL_SECONDS,
#   P2_MAX_SSH_FAILS, P2_REMOTE_ART, P2_REMOTE_LOG, P2_CANCEL_DIR
set -u
LABEL=$1; POD_ID=$2; IP=$3; PORT=$4; ART=$5
KEY=${P2_SSH_KEY:-~/.ssh/runpod_rustline}
REMOTE_ART=${P2_REMOTE_ART:-/workspace/arc/artifacts}
REMOTE_LOG=${P2_REMOTE_LOG:-/workspace/arc/run.log}
API_URL=${RUNPOD_API_URL:-https://api.runpod.io/graphql}
POLL=${P2_POLL_SECONDS:-60}
STALL=${P2_STALL_SECONDS:-1800}
MAX_SSH_FAILS=${P2_MAX_SSH_FAILS:-10}
CANCEL_DIR=${P2_CANCEL_DIR:-E:/AI/ai-jam-sessions/experiments/rollout-arc/p2/artifacts}

SSH=${P2_SSH_CMD:-"ssh -i $KEY -p $PORT -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o BatchMode=yes root@$IP"}
if [ -n "${P2_SCP_CMD:-}" ]; then
  read -r -a SCP_BASE <<< "$P2_SCP_CMD"
else
  SCP_BASE=(scp -i "$KEY" -P "$PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o BatchMode=yes)
fi

mkdir -p "$ART" "$CANCEL_DIR"
LOG="$ART/babysit.log"
log() { echo "$(date -Is) $*" | tee -a "$LOG"; }
# Fetch through a temp file and rename on success. scp writes straight into the
# destination, so an scp interrupted by the pod vanishing mid-transfer TRUNCATES
# whatever good copy was already there — and this fetcher re-fetches the same
# names on every marker. A half-written artifact must never replace a whole one.
fetch() {
  local name tmp
  name=$(basename "$1")
  tmp="$ART/.fetch.$$.$name"
  if "${SCP_BASE[@]}" "root@$IP:$REMOTE_ART/$1" "$tmp" >>"$LOG" 2>&1; then
    mv -f "$tmp" "$ART/$name"
  else
    rm -f "$tmp"
    return 1
  fi
}

terminate_pod() {
  curl -s -X POST "$API_URL" \
    -H "Authorization: Bearer ${RUNPOD_API_KEY:-}" -H "Content-Type: application/json" \
    -d "{\"query\":\"mutation { podTerminate(input: {podId: \\\"$POD_ID\\\"}) }\"}" >>"$LOG" 2>&1
}

declare -A FETCHED
last_size=0
last_progress=$(date +%s)
ssh_fails=0

log "babysitter armed: $LABEL pod=$POD_ID $IP:$PORT -> $ART (poll ${POLL}s, stall ${STALL}s)"

while true; do
  state=$($SSH "ls $REMOTE_ART/*.DONE 2>/dev/null | xargs -n1 basename 2>/dev/null; echo '===SIZE==='; stat -c %s $REMOTE_LOG 2>/dev/null || echo 0; echo '===GPU==='; nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null || echo 0" 2>>"$LOG")
  if [ -z "$state" ]; then
    ssh_fails=$((ssh_fails + 1))
    log "ssh failure $ssh_fails/$MAX_SSH_FAILS"
    if [ "$ssh_fails" -ge "$MAX_SSH_FAILS" ]; then log "UNREACHABLE — exiting 3 (dead-man still armed)"; exit 3; fi
    sleep "$POLL"; continue
  fi
  ssh_fails=0
  markers=$(echo "$state" | sed -n '1,/===SIZE===/p' | grep -v '===SIZE===' || true)
  size=$(echo "$state" | sed -n '/===SIZE===/,/===GPU===/p' | grep -v '===' | tail -1)
  gpu=$(echo "$state" | sed -n '/===GPU===/,$p' | grep -v '===' | tail -1)

  if [ "$size" != "$last_size" ]; then last_size=$size; last_progress=$(date +%s); fi
  if [ "${gpu:-0}" -gt 10 ] 2>/dev/null; then last_progress=$(date +%s); fi

  for m in $markers; do
    if [ -z "${FETCHED[$m]:-}" ]; then
      last_progress=$(date +%s)
      # Timing first, on EVERY marker: if the pod dies mid-run the per-stage
      # breakdown that sizes the next attempt's cap is already local.
      fetch "stage-timings.jsonl"
      case "$m" in
        STAGE0.DONE)
          log "stage0 complete — environment retired, fetching pins"
          fetch "gpu.txt"; fetch "pip-pins.txt"; fetch "node-version.txt"; fetch "bridge-health.json"; fetch "repo-commit.txt"
          ;;
        STAGE1.DONE)
          log "stage1 dry complete — fetching the Stage C receipt"
          fetch "dry-run.json"
          ;;
        STAGE2.DONE)
          log "stage2 smoke complete — fetching the measured cost receipt"
          fetch "smoke-run.json"; fetch "smoke.tar.gz"
          ;;
        STAGE3.DONE)
          log "stage3 train complete — fetching"
          fetch "train-run.json"; fetch "train.tar.gz"
          ;;
        STAGE3B.DONE)
          log "stage3b control arm complete — fetching"
          fetch "control-run.json"; fetch "control.tar.gz"
          ;;
        ALL.DONE)
          log "ALL.DONE — final fetch + verify"
          fetch "artifacts.sha256"
          if [ ! -s "$ART/artifacts.sha256" ]; then
            log "NO artifacts.sha256 — pod left running (dead-man still armed); exit 4"
            exit 4
          fi
          ( cd "$ART" && awk '{print $2}' artifacts.sha256 ) | while read -r f; do
            [ -f "$ART/$f" ] || { log "missing $f — fetching"; fetch "$(basename "$f")"; }
          done
          if ( cd "$ART" && sha256sum -c artifacts.sha256 >>"$LOG" 2>&1 ); then
            log "checksums VERIFIED — terminating pod $POD_ID"
            terminate_pod
            touch "$CANCEL_DIR/DEADMAN_CANCEL_$LABEL"
            log "dead-man disarmed; clean exit 0"
            exit 0
          else
            log "CHECKSUM MISMATCH — pod left running for manual fetch (dead-man still armed); exit 4"
            exit 4
          fi
          ;;
      esac
      FETCHED[$m]=1
    fi
  done

  if [ $(( $(date +%s) - last_progress )) -gt "$STALL" ]; then
    tail=$($SSH "tail -c 600 $REMOTE_LOG 2>/dev/null" 2>>"$LOG" || true)
    log "STALL: no progress ${STALL}s. log tail: $tail"
    exit 2
  fi
  sleep "$POLL"
done
