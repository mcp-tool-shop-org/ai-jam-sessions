cd /e/AI/ajs-fullsong
P=E:/AI/envs/pyannote/Scripts/python.exe
run() { # name vocal clock
  CUDA_VISIBLE_DEVICES="" $P scripts/voice_gate.py --clock "$3" --vocal "$2" --receipt tmp/voice-gate/$1.json --frames tmp/voice-gate/$1.npz 2>&1 | grep -v "triton\|Warning\|warn(" | head -3
}
for v in phrase16w phrase16w2 pad16; do
  run ag-$v tmp/vocal-clock/sing/amazing-grace-new-britain/$v/placed-local.wav tmp/voice-gate/ag-old.clock.json
  run am-$v tmp/vocal-clock/sing/america-the-beautiful-materna/$v/placed-local.wav tmp/voice-gate/am-old.clock.json
done
run bh-kimi tmp/vocal-clock/sing-pad/battle-hymn-kimi/placed-local.wav scores/battle-hymn-of-the-republic.score-clock.v1.json
run ag-kimi tmp/vocal-clock/sing-pad/amazing-grace-kimi/placed-local.wav scores/amazing-grace-new-britain.score-clock.v1.json
run am-kimi tmp/vocal-clock/sing-pad/america-kimi/placed-local.wav scores/america-the-beautiful-materna.score-clock.v1.json
echo EVAL-DONE
