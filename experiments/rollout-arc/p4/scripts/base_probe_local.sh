#!/usr/bin/env bash
# BASE-vs-INSTRUCT PROBE. Generation only -- no training, no adapters, no prereg, because
# nothing is being claimed, only measured. Decision rule is fixed in BASE-MODEL-STUDY.md section 7.
#
# THE EOS OVERRIDE IS NOT OPTIONAL on arm A. Qwen3-4B-Base ships generation_config
# eos_token_id 151643 ALONE while the ChatML template it also ships closes turns with
# <|im_end|> (151645). Without --eos-token-ids the base arm never stops at the turn boundary,
# runs to the 384 cap on every rollout, and reads as "the base cannot emit the format" when
# the truth is nobody told it to stop. The instruct checkpoint ships [151645, 151643], so
# passing that pair is what makes the two arms comparable -- same stopping rule, weights differ.
set -uo pipefail
REPO=/e/AI/ai-jam-sessions
P4=$REPO/experiments/rollout-arc/p4
RUNS=$P4/runs
PY=$REPO/experiments/rollout-arc/p2/trainer/.venv/Scripts/python.exe
PROBE=$REPO/experiments/rollout-arc/p3/scripts/probe_generate.py
BASE=Qwen/Qwen3-4B-Base
export PYTHONIOENCODING=utf-8 PYTHONUNBUFFERED=1 HF_HOME="E:\AI-Models\hf-cache"

say() { echo "[probe] $(date -u +%H:%M:%SZ) $*"; }

say "pipe check first -- a slow download is indistinguishable from a hang"
curl -s -o /dev/null -w "[probe] cloudflare 10MB: %{speed_download} B/s http=%{http_code}\n" https://speed.cloudflare.com/__down?bytes=10000000

# Ollama can hold ~19 GB resident and generation needs the card.
/c/Users/mikey/AppData/Local/Programs/Ollama/ollama ps 2>/dev/null | tail -n +2 | awk '{print $1}' | while read -r m; do
  [ -n "$m" ] && /c/Users/mikey/AppData/Local/Programs/Ollama/ollama stop "$m" >/dev/null 2>&1
done
say "free VRAM: $(nvidia-smi --query-gpu=memory.free --format=csv,noheader)"

say "fetching $BASE into $HF_HOME"
"$PY" - <<'PYEOF'
from huggingface_hub import snapshot_download
p = snapshot_download("Qwen/Qwen3-4B-Base", allow_patterns=["*.json","*.safetensors","*.txt","*.model"])
print("[probe] snapshot at", p, flush=True)
PYEOF
[ $? -eq 0 ] || { say "HALT: download failed"; exit 1; }

gen() {  # label  out  extra-args...
  local label="$1" out="$2"; shift 2
  if [ -s "$RUNS/$out" ]; then say "$label already present, skipping"; return 0; fi
  say "=== $label START ==="
  "$PY" "$PROBE" --model "$BASE" \
    --prompts "$RUNS/prompts-heldout-v1.jsonl" --out "$RUNS/$out" \
    --generations 64 --max-new-tokens 384 --seed 7 "$@"
  local rc=$?
  [ $rc -eq 0 ] || { say "HALT: $label failed rc=$rc"; return 1; }
  say "=== $label DONE, $(wc -l < "$RUNS/$out") rows ==="
}

# Arm A: our actual envelope, with the stopping rule made comparable to the instruct arm.
gen "ARM A  base + ChatML" mc64-heldout-q3base-chatml.jsonl --eos-token-ids 151645,151643 || exit 1
# Arm B: un-enveloped, where Dr. GRPO says Qwen bases actually live. No turn to end, so the
# checkpoint's own eos is the honest stop.
gen "ARM B  base + no template" mc64-heldout-q3base-raw.jsonl --no-chat-template || exit 1

say "ALL PROBE ARMS DONE"
