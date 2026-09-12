# P2 build handoff — the GRPO trainer bundle

**Paste target:** a fresh **Opus** session. **Date:** 2026-09-11.
**Build scope: $0. No GPU. Nothing in this document authorises a pod.**
**Design lock:** [rollout-arc-p2-lock.md](rollout-arc-p2-lock.md) — read it first; §3 (format/skill separation) is the reason P2 exists.
**Unlocked by:** [P1f](../experiments/rollout-arc/p1f/RESULTS.md). **Dry stage:** [p2/dry-report.json](../experiments/rollout-arc/p2/dry-report.json), 6/6 gates.
**Research grounding:** 5-agent study-swarm, 2026-09-11, ~40 retrieved sources. §R below.
⚠ **The citation gate ESCALATED — it did not pass. See §R0 before relying on §R.**

---

## 0. The one finding that shapes this build

**Our exact configuration is reported broken, in an open issue, with four named mechanisms.**

[huggingface/trl#6688](https://github.com/huggingface/trl/issues/6688) (open, 2026-08-08):
**Qwen3-4B-Instruct-2507, LoRA r=32, RTX 6000 Ada 48GB, `environment_factory`, vLLM colocate.**
Reward **collapsed 0.66 → 0.40** against the plain-`generate` arm. A contributor confirmed on main:

| # | Mechanism | Source |
|---|---|---|
| a | `merge_adapter`/`unmerge_adapter` accumulate **bf16 drift** — 1.489e-02 after 1000 cycles. `safe_merge=True` bounds it; **TRL never passes it** | `trl/generation/vllm_generation.py:467/488` |
| b | `GRPOConfig.seed` is applied ~500 lines **after** `get_peft_model`, so **LoRA init is not seed-controlled** | same issue |
| c | Sequence-level importance sampling sums **unnormalized** token log-ratios against a fixed clip of 3.0 → **long rollouts silently zeroed** | same issue |
| d | The vLLM + PEFT + importance-sampling tests are all `@pytest.mark.skip` | TRL test suite |

**This is not a reason to abandon TRL.** It is the reason the smoke run exists, and it dictates
the build order below: **start on HF `generate`, prove correctness, and treat vLLM as an
optimisation to be earned rather than a default.** §7 of the lock's ladder already said cheapest
check first; this is what that means here.

**Correction to the lock.** §6a of [rollout-arc-p2-lock.md](rollout-arc-p2-lock.md) states that
`environment_factory` is *"fully compatible with `peft_config`"* and attributes it to the docs.
**That sentence could not be retrieved on re-check.** `peft_config` is a generic trainer argument
and #6688 shows the combination is untested. **Amend the lock as part of this build.**

---

## R0. The citation gate escalated — read this before §R

Step 4 of the study-swarm protocol requires a different-model-family verifier with a
**retrieval oracle** to confirm every citation exists and supports its claim, and it says
plainly: *"HALT-and-escalate if the verifier or retrieval oracle is unavailable — never read
absence as 'citations fine'."*

**Run 2026-09-11:** `prism verify --type citations --provider ollama --caller-family anthropic`
over the 13 load-bearing citations below. **Verdict: `escalate`.** Every entry came back
`existence: "unresolvable"` with `action: "RETRIEVE MANUALLY"` — prism's retrieval oracle could
not reach arXiv from this rig. Receipt is replayable, `kid ed25519-611e3cc65671873e`,
schema 5. **This is an oracle failure, not a clean bill of health, and §R is NOT gate-passed.**

**What verification did happen, stated at its real strength:**

| Layer | Status |
|---|---|
| Each research agent retrieved its own sources and returned a verification list | done — but agents are protocol *inputs*, not verifiers; this is the weakest layer |
| The advisor independently re-fetched the load-bearing ones | done for arXiv:2605.21125, INTELLECT-2 §3.3.1 (arXiv:2505.07291), the TRL GRPO docs, TRL issue #4543, and the OpenEnv MCP tutorial |
| The build session re-checked §R against **installed TRL 1.13.0** rather than carrying it forward | done — and it found three of my §R claims wrong (see §0) |
| Different-family oracle check | **FAILED TO RUN** |

**So: treat §R as retrieved-but-not-gated.** The build session's re-check against installed
source is the strongest verification any of it received, and it is the reason three errors in
this document were caught. **Before §R grounds anything beyond this build, re-run the gate from
a host whose oracle can reach arXiv.**

---

## R. Research grounding

Format: `finding — source — implication`. Every source retrieved, not recalled. Findings that
contradict the plan are kept and marked.

### R1. Masking is free on one path and hand-rolled on the other

1. **Tool tokens ARE masked automatically under `environment_factory`.** The docs are silent; the source is explicit — `trl/trainer/grpo_trainer.py` builds `tool_mask = [[1] * len(ids) for ids in completion_ids]`, sets `[0] * tool_length` across tool spans, and applies `loss_mask = completion_mask if tool_mask is None else completion_mask * tool_mask` in `_get_per_token_logps`, `compute_loss` and the entropy path. *→ Use `environment_factory`. Do not hand-roll a mask.*
2. **With `rollout_func` the mask is ours, via an undocumented key.** Source: `tool_mask = extra_fields.pop("env_mask", None)`. `env_mask` appears nowhere in the docs. *→ If we ever fall back to `rollout_func`, emit `env_mask` (1 = model token, 0 = external) or we train on our own MCP server's output.*
3. **Three independent papers agree the mask is necessary.** Search-R1 (arXiv:2503.09516) §3.1 masks retrieved tokens, ablation avg EM **0.431 with vs 0.343 without** (Qwen2.5-7B); ReTool (arXiv:2504.11536) §2.3.2 masks `<interpreter>` output "ensuring training stability"; ToRL (arXiv:2503.23383) masks sandbox observations, "preventing the model from attempting to memorize specific execution outputs." *→ The lock's citation is correct.*
4. **Mask the observation only, never the model's own tool call.** Search-R1 masks `<information>` while `<search>` query tokens stay trainable. *→ Masking our own call would delete the signal that teaches querying.*
5. **The stock Qwen3 template cannot give us a mask.** `apply_chat_template(..., return_assistant_tokens_mask=True)` works "only ... via the `{% generation %}` keyword"; **Qwen3 templates lack it**, so `assistant_masks` returns all zeros, and community PRs were not merged. *→ Never derive the mask from the template. TRL's built-in path sidesteps this entirely.*

### R2. Hyperparameters, with the disagreements kept

6. **LoRA learning rate is 10× the full-fine-tune rate, not tighter.** Schulman & Thinking Machines Lab, *LoRA Without Regret*, 2025 (DOI 10.64434/tml.20250929): optimal LoRA LR = **10× FullFT**; **α = 32**; **all linear layers** — "attention-only LoRA significantly underperforms MLP-only LoRA"; for RL **rank 1–32 suffices**; **effective batch < 32** because LoRA is less batch-tolerant. TRL's own reproduction config uses **LR 1e-5 (LoRA) vs 1e-6 (full)**. *→ LR 1e-5, r=16–32, α=32, all-linear, effective batch under 32.*
7. **KL: the field splits, and tool-use papers mostly remove it.** β=0 in DAPO (arXiv:2503.14476), Dr. GRPO (arXiv:2503.20783), ReTool, ToolRL, ToRL. β=1e-3 in Search-R1 and Tool-N1 (arXiv:2505.00024). SimpleRL-Zoo (arXiv:2503.18892) scales **1e-4 for 0.5B–14B**. *→ Every β=0 paper had a verifier as the safety net, and so do we — but see R4.9: at β=0, TRL does not log KL at all.*
8. **Binary reward behind a format gate is the better-supported choice for tool use, and the gate is worth points.** Tool-N1 (arXiv:2505.00024): binary **80.38%** vs fine-grained **76.61%**; removing the reasoning-format constraint drops it to **76.24%**. ToolRL (arXiv:2504.13958) reaches the opposite conclusion on granularity — *kept as the sharpest disagreement in the literature for our exact task.* *→ Our L4 lock (binary behind a format gate) matches the newer result; do not add a length reward — ToolRL found length rewards hurt small models.*
9. **Clip-higher is the cheap anti-collapse lever.** DAPO: **ε_low = 0.2, ε_high = 0.28**, reaching 50 AIME24 at **half** the training steps of the symmetric baseline. *→ Adopt asymmetric clipping; our episodes are far under any overlong threshold, so skip the overlong penalty.*
10. **200–500 optimizer steps is the consistent window.** TRL's LoRA GRPO reference config: **200 steps**. ReTool: 400. Search-R1: 500. *→ A few-hundred-step run is a real run at this scale, not a toy.*

### R3. Sizing — we are time-bound, not memory-bound

11. **Qwen3-4B + LoRA + colocated vLLM fits in 16GB.** Unsloth's own T4 table: 14.5 GiB at `vllm util 0.95` with standby, 40 steps. *→ A 48GB card is ample; 96GB is ~6× headroom we do not need.*
12. **vLLM server mode needs a second GPU and is mathematically wrong for multi-turn anyway.** TRL defaults: `vllm_mode="colocate"`, `vllm_gpu_memory_utilization=0.3`, `num_generations=8`, `max_completion_length=512`, `gradient_checkpointing=True`; TRL supports **vLLM 0.19.1–0.28.0 only**. Server mode duplicates one prompt across generations (`all_prompt_ids = [ids for ids in all_prompt_ids for _ in range(self.num_generations)]`), destroying per-rollout step prefixes — [#4543](https://github.com/huggingface/trl/issues/4543), verified independently. *→ Single GPU, colocate, TP=1. Never server mode. #4543 does not block us because we cannot use server mode regardless.*
13. **Blackwell sm_120 is a live build risk.** vLLM [#35432](https://github.com/vllm-project/vllm/issues/35432): prebuilt wheels and official images shipped **without SM120/121 arch flags** → "no kernel image is available." Blackwell needs CUDA ≥12.8. *→ Prefer a card that is not Blackwell for the smoke run, and see §5's 10-minute gate.*
14. **Verified RunPod rates:** RTX PRO 6000 Blackwell **$1.69/hr** community, L40S **$0.79**, RTX 6000 Ada **$0.74**. *→ At $10, an L40S buys ~12 h against the Blackwell's ~6 h, needs no sm_120 workaround, and R11 says 48GB is plenty. **Recommend L40S or RTX 6000 Ada.***
15. **The failure to expect is OOM in the backward pass, not generation.** Unsloth [#3864](https://github.com/unslothai/unsloth/issues/3864): step 1 fine at ~10GB, **step 2 OOM in backward**. *→ A smoke run that completes one step proves nothing. It must complete **at least two**.*

### R4. What to log, and when to kill

16. **Entropy collapse is the strongest preregisterable signal, and it justifies a short run.** Cui et al. 2025 (arXiv:2505.22617): fitted **R = −a·exp(H) + b**, so the performance ceiling is predictable from policy entropy alone; **"73% of the entropy consumption and 76% of the performance gain occurred in just the first 200 gradient steps."** *→ A few-hundred-step smoke run traverses the window where most of the effect lives. Log mean token entropy every step.*
17. **TRL already logs our non-degeneracy metric.** `frac_reward_zero_std` — "fraction of samples in the generation batch with a reward std of zero." *→ This is the lock's §2 criterion, free. Log from step 1. The realistic 4B failure is `frac_reward_zero_std ≈ 1.0`, which is "no signal," not "method fails."*
18. **At TRL's default β=0, KL is not logged at all.** *→ We would be blind to drift. Log `clip_ratio/region_mean`, or set β>0 purely for observability.*
19. **Reward std collapses ~50 steps before reward mean does.** RAGEN (arXiv:2504.20073) "Echo Trap": FrozenLake reward std bottoms at **step 40**, mean only collapses at **step 90**; **gradient-norm spikes are irreversible**. *→ Reward std is the early-warning channel; a gradient-norm spike is a kill, not a dip.*
20. **pass@k is the formatting-versus-skill separator.** Yue et al. (arXiv:2504.13837): RLVR wins at pass@1 while base models overtake at large k. *→ If our gain vanishes at large k, it was sampling and formatting. This is a better test than the lock's §3 conditional accuracy alone — **run both**.*
21. **Seed variance at this scale is 5–15 points.** Hochlehnert et al. (arXiv:2504.07086): 5–15pp std over 20 seeds; ≥10 seeds recommended; up to 8% difference for the same model across clusters. *→ Our prior arcs used 5 seeds. A null needs ≥10.*

---

## 1. Build order — correctness before speed

**Stage A — the Node side ($0, local, no GPU).**
1. `scripts/p2-env-server.mjs`: an HTTP server exposing (i) `POST /tool` → forwards to the real `dist/mcp-server.js` via the existing `McpStdioExecutor`, and (ii) `POST /score` → runs the existing `scoreReward` over a transcript. **Both forward. Neither reimplements.** A Python copy of the reward is the drift the experiment contract was written about.
2. Tests: the server returns byte-identical tool output to a direct executor call, and byte-identical rewards to `scoreReward`, over the P1f receipts as fixtures.

**Stage B — the Python side ($0, local, CPU only).**
3. `experiments/rollout-arc/p2/trainer/env.py`: the `environment_factory` class. **Nine `async def` methods**, one per rollout tool, each forwarding to `/tool` (R4.4 — sync tools run in a plain `for` loop and would serialise on stdio latency). `reset()` must fully clear server state; environments are **pooled and reused**. `get_reward()` forwards to `/score`.
4. **Assert the chat template round-trips** a `user → assistant(tool_calls) → tool` conversation before anything else. TRL silently **replaces** a tokenizer's template when it is not prefix-preserving (`get_training_chat_template`), and `environment_factory` raises unless `supports_tool_calling(processing_class)` holds. **Pin transformers ≥5.13** (below 5.13 the `tools` path also needs `jmespath`; below 5.2.0 it raises `ImportError`).
5. `train.py` from the worked example `examples/grpo_sql_agent/grpo_sql_agent.py`. Note it uses `signal.SIGALRM` (Unix-only — fine on the pod, not on this rig). **Reward functions receive the full message list including `role: "tool"` turns**, which is exactly the transcript our verifier needs.

**Stage C — the dry run ($0, local, CPU or the 5090).**
6. End-to-end on **2 prompts, 2 generations, `use_vllm=False`, `max_steps=2`**. Not a result — a proof that the loop closes and that **two** optimizer steps complete (R3.15).
7. Assert the mask is real: with `environment_factory`, confirm `tool_mask` is non-trivial by checking that at least one completion has zeros spanning its tool span. **If the mask is all ones, stop — we are training on our own tool output.**

**Stage D — the bundle.** `pod_run_p2.sh` mirroring the acoustic ladder (`dry` → `smoke` → `train`), the existing `runpod.mjs` for up/sync/fetch/down, babysitter + dead-man cap from the v1 pattern. **Do not launch it.**

---

## 2. Config — start here

```
base                    Qwen3-4B-Instruct-2507      (the P1c–P1f pin, Apache-2.0)
peft                    r=16, alpha=32, dropout 0.0, target_modules=all-linear   [R2.6]
learning_rate           1e-5, cosine                                            [R2.6]
num_generations         8                                                       [R2.6, R3.12]
effective batch         < 32                                                    [R2.6]
beta (KL)               1e-4  — NOT 0, purely so KL is logged                   [R2.7, R4.18]
epsilon / epsilon_high  0.2 / 0.28   (clip-higher)                              [R2.9]
max_completion_length   1024
max_tool_calling_iterations  5   — the default is sys.maxsize; a runaway arm in #6688 hit 46
use_vllm                False for Stage C and the first smoke arm               [§0]
vllm_mode               colocate, TP=1, if and when vLLM is earned              [R3.12]
vllm_importance_sampling_mode   token_truncate  (not the sequence_mask default) [§0c]
```

**Mitigations for #6688, all mandatory:** save a **step-0 adapter** and load it into both arms so
LoRA init is identical (§0b); pass **`safe_merge=True`** where reachable (§0a); log
**fraction-of-steps-zeroed by importance-sampling clip** as a first-class metric (§0c).

---

## 3. Do not

- Do not launch a pod. This handoff is $0 and the spend gate is the director's (lock §7).
- Do not reimplement the reward, the format gate, or any of the 54 tools in Python.
- Do not use vLLM **server** mode (R3.12), or hand-roll a loss mask on the `environment_factory` path (R1.1).
- Do not select the training population by difficulty level — ρ = −0.60 across runs (lock §2).
- Do not report `acc_joint` alone, ever (lock §3).
- Do not add a length reward (R2.8) or an overlong penalty (R2.9).
- Do not claim a result from any stage in this document.

---

## 4. Report back

`experiments/rollout-arc/p2/BUILD.md`: what was built, the Stage C transcript showing two
completed optimizer steps and a non-trivial `tool_mask`, the pinned versions of TRL /
transformers / torch / vLLM, and a **measured** local step time. That number is what prices the
smoke run, and it replaces every estimate in this document.
