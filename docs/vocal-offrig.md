# Rendering vocal takes on a rented GPU (offrig)

The vocal route has one step that needs a GPU: SoulX-Singer rendering takes.
Everything around it (the clock, the bed, the target, the timing and pitch gates,
the word picker, placement and the mix) runs on the CPU. This page moves only
that step to a RunPod pod through [offrig](https://github.com/mcp-tool-shop-org/offrig),
so a long render never ties up the local card. The takes come back as the same
files a local render writes, and `sing_clock.py` carries on from them.

## The pieces

| File | Runs | Does |
|---|---|---|
| `scripts/soulx_batch.py` | pod or local GPU | Loads the model once and renders `take-01` .. `take-NN`. Skips takes already on disk, so a stopped batch resumes. |
| `scripts/soulx_take.py` | local GPU | One take per process, as before. Both scripts end in `finish_take`, so a take's files and receipt are the same wherever it was rendered. |
| `scripts/pod/soulx-setup.sh` | pod | Installs SoulX-Singer, pinned throughout (below). Safe to run again. |
| `scripts/pod/soulx-requirements.txt` | pod | The 72 packages the local environment renders with, frozen 2026-10-07. |
| `scripts/pod/soulx-audio-utils.patch` | pod | The one local change to SoulX-Singer: read audio through soundfile when torchaudio cannot. |
| offrig profile `jam` | RunPod | One cheap 24-48 GB card (A40 first), a CUDA 12.8 host or newer, sshd only. |

What the setup pins: the SoulX-Singer commit (`81aeb3a`), Python 3.10.20 through
uv 0.11.17, torch 2.11.0+cu128, and the weights by Hugging Face revision
(`40493ad`) and sha256 (`447eaf41...`, the same file as the local one). It ends by
checking that torch sees the GPU, and prints `soulx-setup ready`.

## The session

The offrig side-car tools drive the pod. Price first; nothing is rented until
`offrig_launch`.

1. **Locally, the target.** Build the clock and the bed as in
   [vocal-clock](vocal-clock.md), then export the target with the SoulX Python:
   `export_soulx_target.py --clock <clock> --out <run>/target.json --syllable-words`.
   `<run>` is the folder `sing_clock.py --out-dir` will use.
2. **Plan and launch.** `offrig_plan profile=jam max_hours=1`, then
   `offrig_launch plan_id=<id>`, then `offrig_job` until the pod is ready (sshd
   answers).
3. **Send the files.** Into one local folder, copy `scripts/pod/`,
   `scripts/soulx_batch.py`, `scripts/soulx_take.py`, `<run>/target.json` and the
   prompt (`en_prompt.mp3`, `en_prompt.json`). Then `offrig_put local=<folder> pod=ajs`.
4. **Set up.** `offrig_exec action=start name=setup command="bash ajs/pod/soulx-setup.sh"`,
   then `offrig_exec action=status name=setup` until it exits 0.
5. **Render.** `offrig_exec action=start name=render command="SOULX_ROOT=/workspace/soulx /workspace/soulx/.venv/bin/python ajs/soulx_batch.py --target ajs/target.json --prompt-wav ajs/en_prompt.mp3 --prompt-meta ajs/en_prompt.json --takes 8 --out-dir out"`,
   then poll its status.
6. **Bring the takes back.** `offrig_get pod=out local=<run>/pod-out`, then move
   `take-NN` up into `<run>`.
7. **Shut down.** `offrig_shutdown plan_id=<id>`, and confirm with `offrig_status`
   that no offrig pod is left. The pod bills until it is gone.
8. **Locally, the rest.** `sing_clock.py` with the same `--out-dir <run>` and
   `--takes 8`. It renders nothing, because every take is on disk, and runs the
   gates, the picker, placement and the mix.

`sing_clock.py` re-exports the target at the start of a run. The export is
deterministic, and a take is reused only when its receipt names the same target
by sha256. A take sung from another target, or one with no receipt, stops the run
(`STALE TAKE`) instead of being judged against a clock it was not sung to.

## Measured

On the local RTX 5090 (2026-10-07), the batch renderer loaded the model in 5.3 s
and rendered the 35 s Amazing Grace phrase in 8.2 s for the first take and 2.8 s
for the second. The pod's numbers belong here after its first run.

## Standards compliance

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 2 | Code commit, patch, Python, uv, every package, and the weights by revision and hash are pinned (`scripts/test_soulx_offrig.py` checks the pins). Each take's receipt records the model hash, target hash, settings, GPU and torch version. SoulX's sampling is not seeded, by design: takes are meant to differ. |
| ANDON_AUTHORITY | 2 | The setup halts on any failed step (`set -euo pipefail`), on a weight hash mismatch and on a GPU torch cannot see. `sing_clock.py` halts on a stale take. |
| NAMED_COMPENSATORS | 2 | The paid step is offrig's: the table below. |
| DECOMPOSE_BY_SECRETS | 2 | offrig knows pods and nothing about singing; ai-jam-sessions knows SoulX and nothing about RunPod. The take files are the only contract between them. |
| UNCERTAINTY_GATED_HUMANS | 2 | The budget is the Director's (`offrig budget`); a plan is priced at its worst case before anything is rented. |
| EXTERNAL_VERIFIER | n/a | No specialized claims. The gates judge the takes as they judge local ones. |

| Irreversible action | Undo | State after undo | Owner |
|---|---|---|---|
| `offrig_launch` (rents the pod) | `offrig_shutdown plan_id=<id>`; offrig's watchdog terminates it at the plan's deadline regardless | Pod deleted, spend recorded | The session running the render |
| Takes left on the pod | None once it is terminated: `offrig_get` them before `offrig_shutdown` | The takes are in `<run>` locally | The session running the render |
