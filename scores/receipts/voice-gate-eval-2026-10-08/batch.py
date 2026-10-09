"""Run the voice gate over every raw take, loading the model once. Writes tmp/voice-gate/takes/<run>-take-NN.json and a summary."""
import glob, json, os, sys, time
import numpy as np, soundfile as sf, torch
sys.path.insert(0, "scripts"); import voice_gate as vg
from pyannote.audio import Inference, Model
import torchaudio.functional as AF
device = sys.argv[1] if len(sys.argv) > 1 else "cpu"
RUNS = {
    "battle-hymn-kimi": "scores/battle-hymn-of-the-republic.score-clock.v1.json",
    "amazing-grace-kimi": "scores/amazing-grace-new-britain.score-clock.v1.json",
    "america-kimi": "scores/america-the-beautiful-materna.score-clock.v1.json",
    "battle-hymn-of-the-republic": "tmp/voice-gate/bh-draft1.clock.json",
    "amazing-grace-new-britain": "tmp/voice-gate/ag-old.clock.json",
    "america-the-beautiful-materna": "tmp/voice-gate/am-old.clock.json",
}
model = Model.from_pretrained(vg.MODEL, token=os.environ.get("HF_TOKEN"))
inf = Inference(model, step=vg.STEP_S, device=torch.device(device))
os.makedirs("tmp/voice-gate/takes", exist_ok=True)
summary, t0 = [], time.time()
for run, clock_path in RUNS.items():
    clock = json.load(open(clock_path, encoding="utf-8"))
    for take in sorted(glob.glob(f"tmp/vocal-clock/sing-pad/{run}/take-*/take-48k.wav")):
        x, sr = sf.read(take, dtype="float32")
        if abs(len(x) / sr - clock["total_seconds"]) > 0.05:
            summary.append({"run": run, "take": take, "skipped": f"{len(x)/sr:.2f}s vs clock {clock['total_seconds']:.2f}s"}); continue
        mono = x.mean(axis=1) if x.ndim > 1 else x
        y = AF.resample(torch.from_numpy(mono), sr, vg.SR)
        act = inf({"waveform": y[None], "sample_rate": vg.SR})
        a = np.sort(act.data, axis=2); nch, nfr, _ = a.shape; win = act.sliding_window; fstep = win.duration / nfr
        n = int(np.ceil(len(y) / vg.SR / fstep)); acc = np.zeros((n, 2)); cnt = np.zeros(n)
        for k in range(nch):
            i0 = int(round(win[k].start / fstep)); i1 = min(n, i0 + nfr)
            if i1 > i0: acc[i0:i1, 0] += a[k, :i1-i0, -1]; acc[i0:i1, 1] += a[k, :i1-i0, -2]; cnt[i0:i1] += 1
        cnt[cnt == 0] = 1; t = (np.arange(n) + 0.5) * fstep
        r = vg.judge(t, acc[:, 0] / cnt, acc[:, 1] / cnt, clock)
        name = f"{run}-{os.path.basename(os.path.dirname(take))}"
        json.dump(r, open(f"tmp/voice-gate/takes/{name}.json", "w", encoding="utf-8"), indent=1)
        summary.append({"run": run, "take": name, "rest": len(r["voice_in_rest"]), "long_release": len(r["overlong_release"]),
                        "two": len(r["two_voices"]), "silent": [s["lyric"] + "@" + str(s["t"]) for s in r["silent_notes"]]})
        print(f"{time.time()-t0:6.0f}s {name}: rest {summary[-1]['rest']} two {summary[-1]['two']} silent {len(summary[-1]['silent'])}", flush=True)
json.dump(summary, open("tmp/voice-gate/takes-summary.json", "w", encoding="utf-8"), indent=1)
print("BATCH-DONE", round(time.time() - t0), "s")
