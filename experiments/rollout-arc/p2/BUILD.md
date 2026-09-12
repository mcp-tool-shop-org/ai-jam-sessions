# P2 BUILD — the GRPO trainer bundle

**Date:** 2026-09-11 · **Spend: $0. No GPU rented. No pod launched.**
**Lock:** [`docs/rollout-arc-p2-lock.md`](../../../docs/rollout-arc-p2-lock.md) ·
**Handoff:** [`docs/rollout-arc-p2-build-handoff.md`](../../../docs/rollout-arc-p2-build-handoff.md)
**Predecessor:** [P1f](../p1f/RESULTS.md) · **Dry stage:** [`dry-report.json`](dry-report.json), 6/6 gates.

Stages A–D are built. Stage C ran locally on the rig's RTX 5090 and **passed both of its
gates**. Nothing here claims a training result, and nothing here authorises a dollar.

---

## What was built

| Path | What it is |
|---|---|
| [`experiments/rollout-arc/scripts/p2-env-server.mjs`](../scripts/p2-env-server.mjs) | Stage A. The two forwarders: `POST /tool` (page bound → real `dist/mcp-server.js`) and `POST /score` (the one `scoreReward`). Plus `/health`, `/cases`, `/reset`, `/shutdown`. |
| [`experiments/rollout-arc/scripts/p2-env-server.test.ts`](../scripts/p2-env-server.test.ts) | 16 tests. Byte-identical forwarding against a live MCP server, and reward reproduction over **all 2048 P1f rollouts**. |
| [`trainer/env.py`](trainer/env.py) | Stage B. The `environment_factory` class: nine async public methods, one per `ROLLOUT_TOOLS` entry, each forwarding to the bridge. |
| [`trainer/reward.py`](trainer/reward.py) | The reward function (forwards to `/score`) and the lock §6 random-reward control arm. Logs lock §3's three series. |
| [`trainer/train.py`](trainer/train.py) | The GRPO trainer, the §0 mitigations, the mask probe and the step timer. `--dry` is Stage C. |
| [`trainer/requirements.lock.txt`](trainer/requirements.lock.txt) | The exact 59-package pin the Stage C receipt was produced with. |
| [`scripts/pod_run_p2.sh`](scripts/pod_run_p2.sh) | Stage D. `dry → smoke → train`, stage-0 fail-fast, DONE markers, **stops before `train` unless `TRAIN=1`**. Never launched. |
| [`scripts/babysit-p2.sh`](scripts/babysit-p2.sh) | The fetcher + watchdog. Streams on DONE markers, verifies `artifacts.sha256`, API-terminates on ALL.DONE, disarms the dead-man. |
| [`scripts/deadman-p2.ps1`](scripts/deadman-p2.ps1) | The absolute cap. Detached, 12 h, force-terminates unless the cancel file appears. |
| [`scripts/compensator-drill.mjs`](scripts/compensator-drill.mjs) | Exercises both against a **fake pod id and a mock API**. 7 scenarios, 17 checks. |
| [`compensator-drill.json`](compensator-drill.json) | The drill receipt. |
| [`stage-c-receipt.json`](stage-c-receipt.json) | The Stage C receipt, copied out of the gitignored `runs/` tree. |

Deviations from the handoff's letter, both deliberate:

- The bridge lives at `experiments/rollout-arc/scripts/p2-env-server.mjs`, not repo-root
  `scripts/`, so it sits beside `p2-dry.mjs` where an arc reader will look for it.
- The handoff's §0 asked for the lock's §6a `peft_config` cell to be amended. **It already was**,
  in commit `269193f`, before this build started. Verified, not redone.

---

## Stage C — the two gates, measured

```
python train.py --dry --out ../runs/dry --save-init-adapter ../runs/init-adapter
```

| Gate | Required | Measured |
|---|---|---|
| **Two optimizer steps complete** (R3.15: OOM shows up in the *backward* pass, so one step proves nothing) | ≥ 2 | **2** |
| **The tool mask is real** (an all-ones mask means training on our own MCP output) | ≥ 1 completion with a zero span | **4 of 4**, 601 masked tokens vs 412 trained — **59.3%** of completion tokens are tool output |
| Bridge actually served the rollouts | tool calls > 0 | **15 in run 3** (33 cumulative), through the real `dist/mcp-server.js` |
| Reward actually came from `scoreReward` | scored > 0 | **6 in run 3** (14 cumulative) |
| Pooled environments are reset | resets > 0 | **2 instances, 4 resets** |

The mask number is the one that matters. R1.1 said TRL masks tool tokens automatically on the
`environment_factory` path; this is that claim measured rather than read — **59.3% of the
completion tokens in a rollout are our own tool output**, and every one of them is multiplied
out of the loss by `loss_mask = completion_mask * tool_mask`. Hand-rolling a mask here would
have been wasted work; *not* having one would have trained the policy on its own library.

### Measured local step time

**This replaces every estimate in the handoff — and the honest form of it is a range, not a
point.**

| Run | prompts × generations | max completion | per-step seconds | mean |
|---|---|---|---|---|
| Stage C dry, run 1 | 1 × 2 | 256 | 83.2, 76.9 | 80.0 s |
| Stage C dry, run 2 | 1 × 2 | 256 | 35.8, 113.7 | 74.7 s |
| **Stage C dry, run 3** (GPU otherwise idle) | 1 × 2 | 256 | 32.0, 40.9 | **36.5 s** |

Measured on an RTX 5090 (sm_120, 32 GB), `use_vllm=False`, HF generate, LoRA r=16 all-linear,
gradient checkpointing on, bf16. Run 3 is the committed receipt
([`stage-c-receipt.json`](stage-c-receipt.json)); runs 1 and 2 shared the card with other work.

**Do not price a pod off two steps.** Step time is dominated by generation, and generation
length is set by how many tool iterations the rollouts take — 35.8 s and 113.7 s were
consecutive steps of the *same* run. This number's job is to say the loop runs in **minutes,
not hours**, and it does. Bounding the variance is what §5 means by "cost is derived from the
smoke run, never estimated."

The mask counts (601 / 412) were **byte-identical across all three runs**, so the dry harness is
deterministic at a fixed seed even where step time is not.

### The production shape does not fit this card

A fourth run was attempted at the §2 shape — 8 generations, `max_completion_length=1024` — to
get a step time closer to the real thing. It was **stopped after 14 minutes without completing a
single tool call**, sitting at **31.9 GB of 32.6 GB (97%)** with the GPU pinned at 100%. The
dry shape completes two entire steps in 73 s on the same card.

That is not a throughput measurement, and it is not reported as one. It is an argument about
hardware: **32 GB is not enough headroom for this configuration**, which corroborates R3.11
(48 GB is ample) and R3.15 (the failure appears once the backward pass has to coexist with
generation). The production step time must be measured on the pod's 48 GB card during the
smoke run — which is exactly where §5 puts it.

---

## Versions, pinned

| Package | Version |
|---|---|
| python | 3.12.13 |
| torch | 2.11.0+cu128 |
| transformers | 5.17.0 |
| trl | 1.13.0 |
| peft | 0.20.0 |
| accelerate | 1.15.0 |
| datasets | 5.0.1 |
| CUDA | 12.8 |
| device | NVIDIA GeForce RTX 5090, capability (12, 0) |

| **vLLM** | **not installed, deliberately** |

`torch` is the `cu128` build; its arch list includes `sm_120`, which is what Blackwell needs
(R3.13). The full 59-package pin is in `trainer/requirements.lock.txt` and stage 0 of the pod
script installs from it.

**vLLM has no pinned version because it is not a dependency yet.** §0 of the handoff makes it an
optimisation to be earned rather than a default: three of the four #6688 mechanisms (adapter
merge drift, sequence-level importance sampling, the skipped test matrix) only bite on the vLLM
path, and prebuilt wheels have shipped without SM120 arch flags (vllm#35432). The ladder runs on
HF generate until a smoke run says throughput requires otherwise.

---

## What the handoff claimed, and what the installed source says

Every §R claim that touches code was re-checked against the installed package rather than
taken forward. **Line numbers drift between versions; substance held in every case.**

| Claim | Verdict | Evidence in `trl 1.13.0` |
|---|---|---|
| R1.1 — tool tokens are masked automatically under `environment_factory` | **CONFIRMED** | `tool_mask = [[1] * len(ids) for ids in completion_ids]` at `grpo_trainer.py:1990`; `loss_mask = completion_mask if tool_mask is None else completion_mask * tool_mask` at `:2519`. Measured non-trivial in Stage C. |
| R1.2 — with `rollout_func` the mask is ours via an undocumented `env_mask` key | **CONFIRMED** | `tool_mask = extra_fields.pop("env_mask", None)` at `:2295`. |
| §0a — `merge_adapter`/`unmerge_adapter` are called without `safe_merge` | **CONFIRMED, lines differ** | `model.merge_adapter()` at `generation/vllm_generation.py:448`, `unmerge_adapter()` at `:469` (handoff said 467/488). Both bare. Only on the vLLM path. |
| §0c — sequence-level IS against a fixed clip of 3.0 silently zeroes long rollouts | **CONFIRMED, and worse than stated** | Default `vllm_importance_sampling_mode="sequence_mask"`, `vllm_importance_sampling_clip_max=3.0`. `*_mask` modes don't clip the ratio, they **zero the whole sequence**. We set `token_truncate`. |
| R2/§2 — `environment_factory` is configured on `GRPOConfig` | **CORRECTED** | It is a **`GRPOTrainer` constructor kwarg**, as is `rollout_func`. `max_tool_calling_iterations` *is* a `GRPOConfig` field (default `None`). |
| Stage B — reward functions receive the full message list including `role: "tool"` turns | **CORRECTED, harmlessly** | `completions` holds the **assistant** turns only; tool results are not appended. `scoreReward` reads the last assistant turn and counts assistant turns carrying `tool_calls`, so the reward is computable either way, and the bridge accepts both shapes. |
| Handoff §1 — `examples/grpo_sql_agent/grpo_sql_agent.py` as the worked example | **NOT AVAILABLE** | Not shipped in the wheel (examples live in the GitHub tree only). `train.py` was written against the verified source instead. Its `signal.SIGALRM` warning is moot for the same reason. |
| R4.9/R4.18 — at `beta=0` TRL does not log KL | **CONSISTENT** | `beta` defaults to `0.0`. We set `1e-4` purely for observability, as the handoff prescribes. |

Additional facts found while verifying, which the handoff did not carry and which change how
`env.py` must be written:

1. **Every public method becomes a tool.** `inspect.getmembers(..., predicate=inspect.ismethod)`
   minus `reset`/`get_reward` minus `_`-prefixed (`:2396`). A stray public helper silently
   becomes a callable tool. Every internal in `env.py` is underscored for this reason.
2. **`reset(**row)` receives every dataset column as a keyword argument** (`:2411`), so the
   dataset schema *is* `reset`'s signature. Measured: 4 resets across 2 pooled instances.
3. **`get_reward()` cannot see the verdict.** It takes no arguments and reads environment state
   only; our verdict is in the model's final message. That is why scoring is a reward function
   and not the environment's own method.
4. **`log_metric` and `log_extra` are passed to reward functions**, which is where lock §3's
   three series are emitted from — the only place that sees the format gate and the outcome for
   every rollout at once.
5. **`max_prompt_length` does not exist** in this GRPOConfig.

---

## Parity with P1c–P1f, and the one place it breaks

The environment the policy trains in must be the environment P1f measured, or the GO does not
transfer. Held:

- The **same page bound** — `boundListMeasures`, 4 measures per call, applied in the bridge
  before the MCP call, refusals returned unexecuted. Tested against `list_measures` directly.
- The **same nine tools** with the **same parameter names**. (`list_measures` takes `id`; a call
  with `songId` is a `-32602` validation error. An early version of the bridge test compared two
  identical error strings and proved nothing — it now asserts `isError === false` on every
  happy path, with a regression test for the wrong-key case.)
- The **same reward** — one `scoreReward`, forwarded, reproducing all 2048 P1f rollout rewards.
- The **same isolated `AI_JAM_HOME`**, removed on close. The real library is never written.

**Broken, and it must be:** the tool *schema rendering*. P1c–P1f presented the catalog through
Ollama's `/api/chat` tool format; P2 presents it through the Qwen3 chat template, rendered by
transformers. Same tools, same names, same arguments — different prompt bytes. So **the base
model for lock §3's comparison must be re-measured through this path**, not carried over from
P1f's numbers. P1f's 35.0% format-failure rate is a prior, not a baseline.

**Not yet resolved:** `MAX_PARALLEL = 2` is a per-assistant-turn cap in `SynthEnv`, and a single
`POST /tool` cannot see turn boundaries. The bridge publishes the limit in `/health` and
`env.py` carries the constant, but nothing enforces it yet. Whether it needs enforcing depends
on whether TRL's loop can emit more than two tool calls in one assistant turn — answerable from
a smoke transcript, and recorded here so it is not discovered later.

---

## Running it

```bash
# 1. the bridge ($0, local)
pnpm exec tsx experiments/rollout-arc/scripts/p2-env-server.mjs --port 8765

# 2. Stage C ($0, local, needs the 4B weights)
cd experiments/rollout-arc/p2/trainer
HF_HOME=E:/AI-Models/hf-cache ./.venv/Scripts/python.exe train.py --dry --out ../runs/dry
```

The venv is local-only and gitignored; `requirements.lock.txt` is the reproducible artifact.
`runs/` is gitignored too — adapters are weights, and lock §8 keeps them local and unpublished.

---

## Compensators (lock §8, no skip)

| Action | Compensator | State |
|---|---|---|
| MCP child + isolated `AI_JAM_HOME` | `executor.close()` kills the child and `rmSync`s the home; the pod script traps EXIT | ✅ held on every clean exit — **but see the leak below** |
| Bridge process | `POST /shutdown`, SIGINT/SIGTERM handlers, `trap` on the pod | ✅ |
| Adapter artifacts | gitignored; nothing published | ✅ 127 MB step-0 adapter stayed local |
| RunPod pod, clean path | [`babysit-p2.sh`](scripts/babysit-p2.sh) verifies checksums, API-terminates on ALL.DONE, drops the dead-man cancel file | ✅ **armed + drilled** (scenario C) |
| RunPod pod, babysitter dies | [`deadman-p2.ps1`](scripts/deadman-p2.ps1), detached, absolute cap — **3 h for smoke ($2.37)**, 12 h for train ($9.48) | ✅ **armed + drilled** (scenarios A, B, H) |
| RunPod pod, run hangs | the babysitter stalls at exit 2 **without** terminating, so the dead-man cap is what bounds this — which is why it is sized per stage | ✅ **drilled** (scenarios F, H) |
| RunPod pod, bad fetch | mismatch leaves the pod RUNNING and the dead-man ARMED for a manual fetch; `runpod.mjs down <id>` is the manual lever | ✅ **drilled** (scenario D) |
| Isolated home after a `SIGKILL` | `close()` cannot run, so `$TMPDIR/jam-rollout-*` survives; remedy is to list and remove it after any aborted run | ⚠ **known gap**, see below — found and cleaned once during this build |
| Spend | none authorised | ✅ **$0** |

---

## Compensators, armed and drilled (lock §7 item 4)

§7 requires four things before a pod. Three were already done — dry passes at $0, a measured
local step time, and a director ceiling of **$10**. This is the fourth.

### The dead-man cap, derived from the ceiling rather than guessed

```
director ceiling                    $10.00
L40S community rate (R3.14)         $0.79 / hr
-> pure-GPU runway                  10.00 / 0.79        = 12.66 hr
-> cap chosen                       12 hr               = 43,200 s
-> worst-case GPU spend             12 x 0.79           = $9.48
-> storage headroom remaining       10.00 - 9.48        = $0.52
   (a 100 GB volume at ~$0.10/GB/month is ~$0.014/hr ~= $0.17 over 12 hr)
-> worst case, everything included                      ~= $9.65  < $10.00  ✓
```

On the RTX PRO 6000 Blackwell at $1.69/hr the same ceiling buys 5.92 hr, so the cap would be
**5 hr (18,000 s) = $8.45**. **The L40S is the recommendation**: it doubles the runway on the
same $10, 48 GB is ample for 4B + LoRA (R3.11), and it sidesteps the vLLM sm_120 arch-flag
problem (vllm#35432) entirely. The corroborating evidence is in this document — the production
shape sat at **31.9 GB of 32.6 GB** on the 5090 and made no progress.

### Size the cap to the stage, not to the wallet

**The 12-hour figure above is the `train` cap. Do not use it for `smoke`.** `-CapSeconds` is a
mandatory parameter of `deadman-p2.ps1`; nothing is baked in, so this is a launch-time argument
and not a code change.

| Stage | Cap | Worst case on an L40S | Attempts left inside $10 |
|---|---|---|---|
| `smoke` | **3 hr** (10,800 s) | **$2.37** | 3 more |
| `train` | 12 hr (43,200 s) | $9.48 | — (derive from what is left) |

The usual argument for this is retry budget, and it holds: a smoke run's whole job is to
discover what we got wrong, so a first attempt failing is the *expected* outcome, and a 12-hour
cap on a hung smoke run spends the entire ceiling on nothing.

**There is a stronger reason, and it comes out of this bundle's own code.** The babysitter's
stall path logs and exits 2 — it deliberately does **not** terminate, so a human can inspect a
possibly-recoverable run. Scenario F proves it. That means a hung run bills until the *dead-man*
fires: the cap is not merely a disaster backstop, it **is** the budget for the most likely
failure mode. A stall at minute 30 under a 12-hour cap costs about $9 and ends the experiment.
Sizing to the stage makes the likely failure cost $2.37 instead.

For `train`, derive the cap from what is **left**, not from the original ceiling:

```
cap_seconds = floor((remaining_budget - storage_allowance) / hourly_rate * 3600)
e.g. after one $2.37 smoke: (10.00 - 2.37 - 0.20) / 0.79 * 3600 = 33,835 s  (~9.4 hr)
```

One caveat worth stating rather than discovering: 3 hours is roughly 2× a plausible worst case,
not 10×. Stage 0 on a cold pod downloads 7.6 GB of weights, runs `pnpm install` and builds
TypeScript before a single gradient, and the production step time is still unmeasured — that is
what the smoke run exists to find out. If stage 0 is slower than expected the cap could bite a
working run. It would be visible rather than silent: `STAGE0.DONE` streams within minutes of
setup finishing, so a run that has not reached it is diagnosable while it is still cheap.

**The cap is a backstop for a dead babysitter, and the budget for a hung run.** On the clean
path the babysitter terminates on ALL.DONE within minutes and the dead-man never fires at all.

### The drill — both compensators fired against a fake pod

```
node experiments/rollout-arc/p2/scripts/compensator-drill.mjs
```

No pod, no real API, no dollar: a mock RunPod endpoint on localhost records every
`podTerminate`, a fake `ssh`/`scp` pair stands in for the pod, and the pod id is
`fake-pod-000000000000`.

| # | Scenario | Expected | Result |
|---|---|---|---|
| A | dead-man reaches the cap | terminate posted, exit 0 | ✅ |
| B | cancel file appears first | **no** terminate, exit 0 | ✅ |
| C | markers → fetch → verify → ALL.DONE | artifacts streamed, terminate posted, cancel dropped, exit 0 | ✅ |
| D | checksum mismatch | **no** terminate, dead-man stays armed, exit 4 | ✅ |
| E | silent log but GPU at 97% | **no** false stall | ✅ |
| F | idle GPU + static log | exit 2, **no** terminate | ✅ |
| G | ssh unreachable | exit 3, **no** terminate | ✅ |
| H | **dead-man fires mid-run, under a live babysitter** | exactly one terminate, babysitter exits 3 rather than claiming success, no cancel file, half-fetched artifact not reported as good | ✅ |

**23 / 23 checks passed**, and the mock recorded **exactly 3** `podTerminate` calls — scenarios A,
C and H. The five scenarios that must not terminate did not. Receipt:
[`compensator-drill.json`](compensator-drill.json).

**The drill needs `bash`** — five of the eight scenarios run `babysit-p2.sh`. Run from PowerShell
it scored 9/17 with exit 127 on every babysitter scenario, which reads exactly like broken
compensators and invites "fixing" something that is not wrong. It now **preflights bash and
refuses to run**, naming the cause, rather than reporting a partial pass.

Scenario H exists because A–G each test one compensator alone, and the question a shorter cap
raises is what the two do *to each other*. Answer: cleanly. The dead-man terminates, the
babysitter sees the pod vanish and exits 3 — it does not mistake a dead pod for a finished run —
no cancel file is dropped, and a half-written artifact is left on disk without ever being
reported as verified.

Scenario E is the one that matters most and is easiest to get wrong: liveness counts a **busy
GPU**, not just a growing log, because Python block-buffers stdout under `nohup` and a log-only
window false-stalled podA at 11:03 on 2026-07-11 while the sweep ran at 97% utilization.

### What the drill caught

Running it was not a formality. **`pod_run_p2.sh` touched `ALL.DONE` on the smoke-only path
without ever writing `artifacts.sha256`** — and `babysit-p2.sh` treats a missing manifest as a
failed verification. A perfectly good smoke run would have been reported as exit 4 and left the
pod billing until the dead-man fired twelve hours later. Both exit paths now go through a
`finish()` that writes the manifest first.

### Launch discipline carried forward (v1, paid for)

- **scp the bundle, then launch the scp'd launcher.** Never an inline env-prefixed `nohup` over
  ssh — that is the v1 hung-channel lesson.
- **Be patient with the direct SSH port**: 2–5 minutes to route after the pod shows Running.
  Poll it; do not churn into terminate.
- **Verify the SSH key before deploying.** RunPod injects account keys at pod *start*.
- **No `pkill` anywhere**, deliberately: a pattern broad enough to match the run also matches
  the ssh command carrying it.

### The one compensator gap, found by checking rather than by assuming

`close()` removes the isolated home, so every clean exit is clean. **A `SIGKILL` is not a clean
exit**, and an aborted bridge left a `jam-rollout-*` home behind in the system temp directory
with its 24 seeded songs. Found by listing the directory after the run, removed by hand.

It is contained — the songs are synthetic, the real library is never written, and the directory
is under the OS temp sweep — but the compensator as written is only true for exits it controls.
On the pod, `pod_run_p2.sh` traps `EXIT` (which covers `set -e` failures and Ctrl-C, not
`SIGKILL`), and the babysitter terminates the whole pod, which takes the filesystem with it. The
residual exposure is local development, and the remedy is one line: list
`$TMPDIR/jam-rollout-*` after an aborted run.

---

## The launch sequence, exactly

**Not run. This is the string, not a description of one.** L40S, 4-hour cap, smoke-only.

```bash
# 0. preconditions, all $0 and read-only.
#    RUNPOD_API_KEY in env. runpod_rustline.pub registered at
#    console.runpod.io/user/settings BEFORE deploying — RunPod injects account
#    keys at pod START, so a key added afterwards needs a restart.
node experiments/acoustic-sft/runpod.mjs verify

# 1. deploy one L40S on the community tier ($0.79/hr).
RUNPOD_GPU="NVIDIA L40S" node experiments/acoustic-sft/runpod.mjs up
#    prints podId / publicIp / sshPort; also written to ~/.ssh/runpod_acoustic_pod.json

# 2. ARM THE DEAD-MAN BEFORE THE RUN STARTS (lock §7 item 4).
#    4 h = 14400 s = $3.16 worst case. Detached, so it outlives this session.
powershell -NoProfile -Command "Start-Process powershell -ArgumentList '-NoProfile','-File','E:\AI\ai-jam-sessions\experiments\rollout-arc\p2\scripts\deadman-p2.ps1','-PodId','<podId>','-CapSeconds','14400','-Label','p2smoke' -WindowStyle Hidden"

# 3. wait for the direct SSH port to route. 2-5 minutes is normal. Poll it.
#    Do not churn into terminate — that is how the 2026-07-13 attempt died.

# 4. push the launcher and its config. No repo scp: stage 0 clones the pinned
#    commit itself, which is 130 MB of tracked tree we do not have to push.
ssh -i ~/.ssh/runpod_rustline -p <port> root@<ip> "mkdir -p /workspace/arc/scripts"
printf 'export P2_COMMIT=da0c57df3199b136e217c1332351de2746d9cb33\nexport SMOKE_STEPS=8\n' > /tmp/p2-env.sh
scp -i ~/.ssh/runpod_rustline -P <port> /tmp/p2-env.sh root@<ip>:/workspace/arc/p2-env.sh
scp -i ~/.ssh/runpod_rustline -P <port> experiments/rollout-arc/p2/scripts/pod_run_p2.sh root@<ip>:/workspace/arc/scripts/pod_run_p2.sh

# 5. launch the scp'd launcher. NOTE: no env assignments on this line, by design
#    — `ssh host "FOO=bar nohup bash script &"` is the v1 hung-channel lesson,
#    which is why the config went over as a file in step 4.
ssh -i ~/.ssh/runpod_rustline -p <port> root@<ip> "cd /workspace/arc && nohup bash scripts/pod_run_p2.sh > /workspace/arc/run.log 2>&1 &"

# 6. arm the babysitter (foreground; it exits 0 on a verified fetch).
bash experiments/rollout-arc/p2/scripts/babysit-p2.sh p2smoke <podId> <ip> <port> experiments/rollout-arc/p2/artifacts
```

**`runpod.mjs sync` and `runpod.mjs fetch` are NOT usable here, and the earlier claim in this
document that the whole CLI was inherited was too broad.** They are acoustic-bound: `WORK` is
`/workspace/acoustic-sft`, the payload is a hardcoded acoustic file list, and `fetch` pulls that
tree's `runs/`. Running them for P2 would push the wrong files to the wrong path. What *is*
generic and used above: `verify`, `up`, `list`, `down`. `sync` is replaced by the stage-0 clone,
and `fetch` by the babysitter. Note also that `up` writes its state to
`~/.ssh/runpod_acoustic_pod.json`, which it shares with the acoustic arc — harmless unless an
acoustic pod is live, in which case deploy from the console instead.

### Per-stage timing comes back for free

Markers used to be a bare `touch` — an empty file, with an mtime that `scp` does not preserve.
Attempt 1 would have bought a measurement it could not report. Each marker now carries its own
timestamp, and `stage-timings.jsonl` accumulates `{stage, at, epoch, since_start_s, since_prev_s}`
per stage. **The babysitter fetches it on every marker, not just at the end**, so a run that dies
at stage 2 still hands back how long stages 0 and 1 took — which is exactly what sizes attempt
2's cap. JSONL rather than JSON because this file can be interrupted, and a half-written array
is unparseable where a half-written JSONL loses only its last line.

`repo-commit.txt` ships beside it: stage 0 fails in its first second if `P2_COMMIT` is unset, and
records the resolved sha it actually checked out.

## What this does not do

- **It does not launch a pod.** `pod_run_p2.sh` stops after `smoke` unless `TRAIN=1`, and §7 of
  the lock makes that the director's call.
- **It does not claim a result.** Stage C proves the loop closes and the mask is real. That is
  all it proves.
- **It does not measure cost.** The smoke run does that, on the pod, under §7.
