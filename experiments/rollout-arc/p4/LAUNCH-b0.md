# B0 cell — the launch runbook

**The executable of `B0-PREREG.md`.** Nothing here re-states a threshold or a reading; if this
file and the prereg disagree, the prereg wins. `pod_train_p4.sh` is **not** used — it is still
the four-arm prefix cell (eval G=16, the 32-item *trained* pool, `--prefix-mode` arms A–D) and
staging it would spend this ceiling on a different experiment.

**EXECUTED 2026-09-14** on pod `7bsth3b01ilw9l`, commit `1b28a1a`. Results and the
independent verification: `B0-RESULTS.md`. Two corrections earned by that run are marked ⚠
below — read them before reusing this runbook. Nothing is billing now.

## Pieces

| | |
|---|---|
| pod CMD | `experiments/rollout-arc/p4/scripts/pod_train_b0.sh` |
| rig-side watchdog | `experiments/rollout-arc/p4/scripts/babysit-b0.sh` |
| dead-man | `experiments/rollout-arc/p2/scripts/deadman-p2.ps1` (unchanged, drilled) |
| guards | `p4/scripts/arm_guards.py` (population) + `p4/scripts/beta_guards.py` (objective) |
| SKU | RTX 5090 **community**, $0.69/hr. Secure $0.99 is the fallback. |
| cap | **57600 s (16 h)**, from `pod-ledger.py --ceiling 12`; worst case $11.46 |
| expected | ~10.2 GPU-h, **$7.25** community |
| **actual** | **5.13 GPU-h, $3.86** (+$0.17 on the aborted first create). The estimate priced both arms at this rig's wall; the rented 5090 ran trains at 10.71 s/step against local 14.76 and G=64 evals at 833 s against local 2373 s. **Local wall over-prices a pod run by ~1.9×.** |
| volume | **none.** Container disk only. |

## The ordering problem, stated rather than papered over

The rule from P2 is *arm the dead-man before staging, because the pod bills from creation.*
**It cannot be armed before `create`** — `deadman-p2.ps1` terminates a pod id, and the pod id
does not exist until create returns. The closest safe thing, and what this runbook does:

1. create the pod **with no `dockerStartCmd` at all** — the image already comes up idle with
   sshd running and stages nothing on its own,
2. capture the pod id, **arm the dead-man**,
3. only then launch `pod_train_b0.sh` over ssh.

Exposure between create and armed is the time to run one command — about **$0.02** at
$0.69/hr. That is the floor, and it is named so nobody reads "armed before create" as done.

> ⚠ **Corrected 2026-09-14, after it cost $0.17.** Step 1 originally read *"create the pod
> with a CMD that does not stage anything (`sleep infinity`)"*. On `runpod/pytorch`,
> `dockerStartCmd` **replaces** the image's start command — **including sshd** — so pod
> `jvdjl9ybmbeok6` came up RUNNING and unreachable and had to be killed. The idle CMD solved
> a problem that did not exist: the image's own default start is already "sshd up, nothing
> staged". Do not pass `dockerStartCmd`.

## Sequence

**Step 0 — preflight, $0.** Confirm nothing is already billing and the commit is on `main`:

```bash
curl -s -X POST https://api.runpod.io/graphql -H "Authorization: Bearer $RUNPOD_API_KEY" -H "Content-Type: application/json" -d '{"query":"query { myself { clientBalance currentSpendPerHr pods { id } networkVolumes { id } } }"}'
```

Expect `pods: []`, `networkVolumes: []`, `currentSpendPerHr: 0`. **If a network volume exists,
stop** — a community volume bills after the pod dies.

**Step 1 — create, image default start, no volume.** Community 5090, container disk only.
Capture `podId`, `ip`, `sshPort`. Do not attach a network volume and **do not pass
`dockerStartCmd`** (see the correction above).

**Step 2 — arm the dead-man, before anything is staged.** `-ArtDir` **must** equal the
babysitter's `B0_CANCEL_DIR`, or a clean finish will not disarm it:

```bash
powershell -File E:/AI/ai-jam-sessions/experiments/rollout-arc/p2/scripts/deadman-p2.ps1 -PodId <POD_ID> -CapSeconds 57600 -Label b0cell-<POD_ID> -ArtDir E:/AI/ai-jam-sessions/experiments/rollout-arc/p4/artifacts
```

> ⚠ **Label the dead-man per POD, not per cell**, and pass the same label to the babysitter.
> The 2026-09-14 run armed two dead-men under the bare label `b0cell`, so the second inherited
> the first pod's `DEADMAN_CANCEL_b0cell`. It survived only because the stale file had been
> deleted by hand between the two arms; nothing in the design forced that. A stale cancel file
> disarms the next dead-man at its **first tick**, and the run that follows is uncovered.

⚠ `deadman-p2.ps1`'s header comment derives its cap from the retired **$10 / L40S** ceiling.
That derivation is stale; **the cap is passed explicitly here** and comes from
`pod-ledger.py --ceiling 12` on the 5090 community rate. The script itself is correct and
bakes in **no GPU id** — only `-PodId` — so it is used unmodified.

**Step 3 — launch the cell.** `B0_COMMIT` is the commit carrying this runbook, the pod script
and both guards; stage 0 halts if any of them, the prereg, or the 75-item pool is missing at
that commit.

```bash
ssh -i ~/.ssh/runpod_rustline -p <SSH_PORT> root@<IP> "export B0_REPO_URL=https://github.com/mcp-tool-shop-org/ai-jam-sessions.git B0_COMMIT=<SHA> && mkdir -p /workspace/arc && nohup bash -c 'curl -fsSL https://raw.githubusercontent.com/mcp-tool-shop-org/ai-jam-sessions/<SHA>/experiments/rollout-arc/p4/scripts/pod_train_b0.sh | bash' > /workspace/arc/run.log 2>&1 &"
```

**Step 4 — start the babysitter, detached.**

```bash
nohup bash E:/AI/ai-jam-sessions/experiments/rollout-arc/p4/scripts/babysit-b0.sh b0cell-<POD_ID> <POD_ID> <IP> <SSH_PORT> E:/AI/ai-jam-sessions/experiments/rollout-arc/p4/artifacts > /dev/null 2>&1 &
```

It fetches each artifact on its own `DONE` marker, verifies `artifacts.sha256` locally on
`ALL.DONE`, then terminates the pod and drops `DEADMAN_CANCEL_b0cell-<POD_ID>`. **Only a verified fetch
terminates**; a checksum mismatch leaves the pod running with the dead-man armed.

## What the pod does, in order

1. **Stage 0** — cuda, node, clone at `B0_COMMIT`, python deps, `trl == 1.13.0` asserted, pnpm
   build, bridge on the frozen fixture with `--require-pool 32`, and the reward gate (an
   unparseable completion must score 0, or the policy learns to emit nothing). `/workspace`
   fstype is recorded and a network filesystem warns.
2. **Base eval first** — G=64, `prompts-heldout-v1.jsonl`, 75 items, seed 7, no adapter.
3. **Six trains** — C7/C8/C9 at `--beta 1e-4`, then B07/B08/B09 at `--beta 0.0`, all
   `--prefix-mode none`, 200 steps, G=8, `--limit 32`. `--beta` is passed explicitly on **both**
   arms, including the control whose value equals the current default, so the control cannot
   move the day the default does. After each: `arm_guards.py … none 32`, then
   `beta_guards.py arm <run.json> C|B0`. **Either void halts the run.**
4. **Six evals** — G=64, same 75 prompts, same seed 7, each naming its own adapter.
5. **`beta_guards.py cell`** — six adapters with six distinct SHA-256 digests, every eval
   75 × 64, and no eval that is structurally perfect and entirely empty. Then `ALL.DONE`.

Trains run before any adapter eval so a void arm is caught before 40 minutes of generation is
spent on it. The cost of that ordering is that a cap hit during the eval phase leaves adapters
without evals — which is why the babysitter fetches each adapter on its own `ARM-*` marker and
why every stage banks a marker: **a relaunch resumes and never re-spends a finished arm.**

## Abort

- **Anything still billing after `ALL.DONE`** → `podTerminate` by hand; the babysitter's own
  terminate is logged in `p4/artifacts/babysit.log`.
- **Babysitter exits 2 (stall) or 3 (unreachable)** → the dead-man is still armed and will fire
  at 16 h. Investigate over ssh; do not disarm to "have a look".
- **Babysitter exits 4 (checksum)** → pod left running deliberately. Re-fetch by hand, verify,
  then terminate and `touch p4/artifacts/DEADMAN_CANCEL_b0cell-<POD_ID>`.
- **A guard voids an arm** → the run halts with the reason on stdout and in the run log. The
  adapter is still written (`train.py` saves weights before the receipt), so the arm is
  diagnosable without a second pod.

## After

Nothing is scored on the pod. The readout runs on this rig from the fetched
`mc64-heldout-*.jsonl`, through **one** script, per the rule earned when one contrast got two
published intervals: RNG seeded **per computation**, not once per module.
