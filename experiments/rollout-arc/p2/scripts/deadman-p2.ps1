# ─── deadman-p2.ps1 — P2 absolute dead-man switch (lock §7, §8) ─────────────
#
# Runs DETACHED (Start-Process) so it outlives the session that armed it. Sleeps
# in ticks up to an absolute cap, then force-terminates the pod via the RunPod
# API — unless the cancel file appears first, which the babysitter drops only
# after a checksum-verified fetch and a clean auto-terminate.
#
# This is the backstop, not the budget. The babysitter terminates on ALL.DONE
# in minutes; this fires only if the babysitter itself dies.
#
# THE CAP IS DERIVED FROM THE CEILING, NOT GUESSED:
#
#   director ceiling                       $10.00
#   L40S community rate (handoff R3.14)    $0.79 / hr
#   -> pure-GPU runway                     10.00 / 0.79 = 12.66 hr
#   -> cap chosen                          12 hr = 43200 s
#   -> worst-case GPU spend                12 * 0.79 = $9.48
#   -> storage headroom left               $0.52, which covers a 100 GB volume
#                                          (~$0.10/GB/month ~= $0.014/hr ~= $0.17
#                                          over 12 hr) with room to spare
#   -> worst case total                    ~= $9.65 < $10.00  ✓
#
#   If the card is the RTX PRO 6000 Blackwell instead ($1.69/hr):
#   10.00 / 1.69 = 5.92 hr -> cap 5 hr = 18000 s -> $8.45 worst case.
#   Pass -CapSeconds 18000 in that case. The L40S is recommended: it doubles
#   the runway on the same $10, 48 GB is ample for 4B + LoRA, and it sidesteps
#   the vLLM sm_120 arch-flag problem (vllm#35432) entirely.
#
#   powershell -File deadman-p2.ps1 -PodId <id> -CapSeconds 43200 -Label p2smoke
param(
  [Parameter(Mandatory = $true)][string]$PodId,
  [Parameter(Mandatory = $true)][int]$CapSeconds,
  [Parameter(Mandatory = $true)][string]$Label,
  [string]$ArtDir = "E:\AI\ai-jam-sessions\experiments\rollout-arc\p2\artifacts",
  [string]$ApiUrl = "https://api.runpod.io/graphql",
  [int]$TickSeconds = 60
)
$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force -Path $ArtDir | Out-Null
$cancelFile = Join-Path $ArtDir "DEADMAN_CANCEL_$Label"
$logFile = Join-Path $ArtDir "deadman-$Label.log"

function Log($msg) {
  $line = "$(Get-Date -Format o) $msg"
  $line | Add-Content -Path $logFile
  Write-Output $line
}

Log "armed: pod=$PodId cap=${CapSeconds}s tick=${TickSeconds}s cancel=$cancelFile api=$ApiUrl"
$deadline = (Get-Date).AddSeconds($CapSeconds)
while ((Get-Date) -lt $deadline) {
  if (Test-Path $cancelFile) { Log "cancel file present - disarmed cleanly"; exit 0 }
  Start-Sleep -Seconds $TickSeconds
}
# One last look: the babysitter may have finished inside the final tick.
if (Test-Path $cancelFile) { Log "cancel file present at deadline - disarmed cleanly"; exit 0 }

Log "CAP REACHED - force-terminating pod $PodId"
$body = @{ query = "mutation { podTerminate(input: {podId: `"$PodId`"}) }" } | ConvertTo-Json
$headers = @{ Authorization = "Bearer $env:RUNPOD_API_KEY"; "Content-Type" = "application/json" }
try {
  $r = Invoke-RestMethod -Uri $ApiUrl -Method Post -Headers $headers -Body $body
  Log "terminate response: $($r | ConvertTo-Json -Compress -Depth 3)"
  exit 0
} catch {
  Log "terminate FAILED: $($_.Exception.Message) - retrying once in 120s"
  Start-Sleep -Seconds 120
  try {
    $r = Invoke-RestMethod -Uri $ApiUrl -Method Post -Headers $headers -Body $body
    Log "terminate retry response: $($r | ConvertTo-Json -Compress -Depth 3)"
    exit 0
  } catch {
    Log "terminate retry FAILED: $($_.Exception.Message) - MANUAL ACTION REQUIRED: node experiments/acoustic-sft/runpod.mjs down $PodId"
    exit 1
  }
}
