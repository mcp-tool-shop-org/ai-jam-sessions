# Rollout Layer — design dispatch (the environment the experiment contract is missing)

**Date:** 2026-09-11 · **Author:** advisor (Opus 5) · **Status:** ⭐ **ARC REOPEN 2026-09-11 (director).** The closure rested on a "task supply" argument that did not survive; both it and the cluster-count backup blocker dissolve under a synthetic generator. Live phase: [`rollout-arc-p1d-kickoff.md`](rollout-arc-p1d-kickoff.md). Prior record (P0-P1c, three NO-GOs) — three frozen-bar NO-GOs (P0, P1b, P1c), P2 never started, no paid run, **$0 total**. Closing report: [`rollout-arc-closing-report.md`](rollout-arc-closing-report.md). This document remains the design lock of record and the reopening conditions live in the report §5.
**Predecessor:** [finetune-arc-dispatch.md](finetune-arc-dispatch.md) (the SFT arc's design lock).
**Contract this extends:** [`experiments/_template/README.md`](../experiments/_template/README.md) and `src/dataset/experiment/`.
**Research grounding:** 5-agent study-swarm, 2026-09-11, ~50 retrieved sources. Citation gate receipt: `docs/rollout-layer-dispatch.citation-receipt.json`.

This document is the single source of truth for building the rollout layer. It does not authorise
any GPU spend. The only spend gate is **P4**, and P4 is unreachable until **P0 returns a GO**.

---

## 0. Standards compliance (the six, scored 0–3)

Required of every new workflow file by `.claude/rules/workflow-standards.md`.

| Standard | Score | Evidence |
|---|---|---|
| **PIN_PER_STEP** | 2 | Every phase pins model id, adapter sha, corpus sha, tool-catalog sha and `dist/mcp-server.js` sha into a run receipt, inheriting the shape `experiments/finetune-arc-v1/artifacts/*/run-config-seed*.json` already uses. Not 3 until a replay test proves a receipt reproduces a rollout byte-for-byte. **Remediation:** replay test in P2, owner = P2 session. |
| **ANDON_AUTHORITY** | 3 | Three independent halts, each already precedented in-repo: P0 returns NO-GO and the arc stops at $0 (precedent: the B-2 abstention probe, killed at $0, commit `d3c6ccd`); the Echo-Trap monitor (finding 21) halts a training run on reward-std / entropy / grad-norm trips; `runpod.mjs verify` refuses to deploy on a bad image tag or an already-billing pod. |
| **NAMED_COMPENSATORS** | 3 | §7 table. No skip is permitted and none is taken. |
| **DECOMPOSE_BY_SECRETS** | 3 | The cut is along what changes: the *task* (what is asked, what gold is) changes per family; the *tool surface* changes when the MCP server changes; the *trainer* changes with the RL stack. These are three modules with three owners, and the whole point of §5 L2 is that the tool surface is imported, never re-implemented. |
| **UNCERTAINTY_GATED_HUMANS** | 3 | Three director gates, each fired by uncertainty rather than by step count: the P0 GO/NO-GO, the P4 spend authorisation, and the P5 publish gate. Each is framed contrastively in §8 ("you probably expect X; the measurement says Y"). |
| **EXTERNAL_VERIFIER** | 3 | Three layers, none of which is the generator grading itself. The reward's verifier is the **real MCP server**, a different process from the policy (§5 L2). This dispatch's citations are gated by `roleos verify-citations` (different model family, reasoning stripped). The P5 eval is scored by a program, never by a model. |

**Total 17 / 18.** The single 2 has a named remediation and an owner.

---

## 1. What this builds, in one paragraph

`ExperimentTask<TCase>` already carries a task generator (`cases()`), a closed verdict set, a leak-safe
split key, and thresholds. `scripts/verify-public-package-execution.ts` already executes frozen tool
calls against the real MCP server over stdio and asserts `isError: false`. Between them, the repo
already owns **the task generator and the verifier** — two of the four parts of an RL environment.
The missing two are **the rollout** (a policy acts, tools respond, repeat) and **the scalar reward**.
This dispatch specifies those two, and the go/no-go measurement that decides whether they are worth
building.

---

## 2. Ground truth measured this session (2026-09-11)

Everything below was read off the repo or the rig today. It is the factual floor the design binds to.

| Fact | Value | Source |
|---|---|---|
| Held-out split, jam-actions-v1 1.1.0 four-draw | **59 records** (train 154) | `experiments/coverage-v1-sft/data-4draw/gold-test.jsonl` |
| Held-out family mix | acoustic 36, harmony 6, chord 3, ensemble 3, measures 3, teaching_goals 3, transpose 3, key_moments 2 | same |
| Tools actually exercised by held-out traces | **9**: `score_audio_take` 36, `transcribe_audio` 36, `song_info` 14, `list_measures` 6, `verify_harmony` 6, `detect_chord` 3, `ensemble_now` 3, `list_songs` 3, `transpose_song` 3 | derived from `sft-test.jsonl` |
| Episode shape, every record | `system, user, assistant(+tool_calls), tool, tool, assistant(answer)` — **one** policy tool-turn, then the answer | `sft-test.jsonl` |
| Both graders are greedy-only | `temperature: 0` in `ollama-grade.mjs`; `do_sample=False` in `predict_v1.py` | those files |
| Base vs adapter, four-draw acoustic (36) | base **12/36**, Qwen3-4B-Instruct-2507 adapter **36/36** at two seeds | `experiments/coverage-v1-sft/RESULTS-r52.md` |
| Last paid run | 2 pods ≈ **$4.00** total, RTX PRO 6000 Blackwell 96 GB @ $1.69/h | same |
| Tool executor that already exists | MCP stdio client, `dist/mcp-server.js` | `scripts/verify-public-package-execution.ts`, `scripts/extract-mcp-tool-schemas.ts` |
| Audio-device coupling | `play_song` connects the engine and fails headless; of the 9 rollout tools only `ensemble_now` touches `getSharedAudioContext()` | `src/mcp-server.ts:3193`, memory `ai-jam-sessions-ci-divergences` |
| Training stack on the rig | none installed system-wide; every SFT arc installed on the pod | checked today |

### 2a. The finding that shapes everything

**Today's corpus has no policy.** Every record's tool sequence is part of the *target*, not a choice
the model makes. `coverageReport` counts tool *shapes* and floors their diversity precisely because
the shape is authored. A model trained on this learns to emit a known sequence; it never decides
what to call next based on what came back.

An RL environment needs the opposite: several tool paths available, most of them wasteful or wrong,
and only execution reveals which one answers the question. Reward is informative exactly to the
degree the policy had a decision to make. **So the first environment is a new task family, not a
re-wrapping of an existing one** (§5 L1, §6 P1).

The r52 numbers sharpen this. On four-draw acoustic the base scores 12/36 and the SFT adapter 36/36
at two seeds. That is a solved task. Spending RL on it would be spending to re-reach a ceiling SFT
already reached for four dollars.

---

## 3. Research grounding (the dispatch's empirical floor)

Format: `N. **finding.** Authors year (identifier). Design implication.` Every source was retrieved,
not recalled. Findings that contradict the plan are kept and marked.

### 3a. Does RL add anything at this size? (the sceptical block — read first)

1. **RLVR raises pass@1 but does not expand what the base model can do at large k.** Yue, Chen, Lu, Zhao, Wang, Song, Huang 2025 (arXiv:2504.13837, NeurIPS 2025 Oral). MATH500 pass@256 is 97.2% for both base and RLVR model; on AIME24 the Qwen-7B RLVR model's solved set is a *subset* of the base's; the base beats RLVR by ~9% at k=128 on Minerva-32B. *Implication: only pick a task where base pass@1 is low, pass@k is nonzero, and pass@1 is what we actually care about. This is the P0 gate's entire justification.*
2. **Under standardised evaluation most RL gains on small reasoning models vanish, and SFT generalised better.** Hochlehnert, Bhatnagar, Udandarao, Albanie, Prabhu, Bethge 2025 (arXiv:2504.07086). Pass@1 standard deviations span 5–15 percentage points over 20 runs; temperature alone swings results up to 15 points, hardware up to 8%; most RL variants of DeepSeek-R1-Distill-1.5B show no statistically significant improvement. *Implication: this is the strongest argument against the whole arc. It is answered by P0 (pick a task with headroom) and by §9 (a preregistered eval that can actually resolve the claim), not by ignoring it.*
3. **On Qwen backbones, random rewards nearly match real ones.** Shao et al. 2025 (arXiv:2506.10947). GRPO with *random* rewards gave Qwen2.5-Math-7B +21.4pp on MATH-500 against +29.1pp for ground truth, by amplifying pretrained code-reasoning (65% → >90%); the effect fails entirely on Llama3 and OLMo2. *Implication: we train Qwen. A spurious-reward control run is **mandatory**, not optional (§5 L10). Without it no capability claim is defensible.*
4. **SFT memorises, RL generalises — but SFT is still needed for format.** Chu, Zhai, Yang, Tong, Xie, Schuurmans, Le, Levine, Ma 2025 (arXiv:2501.17161). Outcome-reward RL generalised to unseen rule and visual variants where SFT memorised; the authors state SFT "remains essential" to stabilise output format first. *Implication: any warm start is format-only and minimal.*
5. **Where the environment supplies feedback the base cannot simulate, RL wins clearly.** Li, Zou, Liu 2025 (arXiv:2503.23383, ToRL): ToRL-7B reaches 43.3% AIME24, +14 points over text-only RL. Feng et al. 2025 (arXiv:2504.11536, ReTool): 67% AIME in 400 steps against 40% in 1080 for text-only RL. Jin, Zeng, Yue, Yoon, Arik, Wang, Zamani, Han 2025 (arXiv:2503.09516, Search-R1): +41% relative at 7B, +20% at 3B over RAG. *Implication: the reconciliation of findings 1–2 with 5 is that the gains come from real execution feedback. Our tools are real execution. The task must require it (§2a).*
6. **On tool use specifically, RL-from-instruct beat SFT-then-RL at our exact model sizes.** Qian, Acikgoz, He, Wang, Chen, Hakkani-Tür, Tur, Ji 2025 (arXiv:2504.13958, ToolRL). Qwen2.5-3B: GRPO cold-start 52.98 on BFCL-V3 against 46.42 for SFT-then-GRPO (SFT alone 41.97, raw 33.04); on API-Bank SFT actually *hurt* (50.92 against a 51.59 raw baseline). Corroborated independently by Zhang, Dong, Zhang, Kautz, Catanzaro, Tao, Wu, Yu, Liu 2025 (arXiv:2505.00024, Nemotron-Research-Tool-N1): "the SFT-then-RL paradigm does not necessarily outperform pure RL." *Implication: start RL from the instruct checkpoint. Our constructed gold is worth more as a verifier than as SFT targets.*
7. **On-policy RL forgets less than SFT at matched new-task performance.** Shenfeld, Pari, Agrawal 2025 (arXiv:2509.04259, RL's Razor). Forgetting tracks KL(fine-tuned ‖ base) on the new task, and on-policy RL is implicitly biased toward KL-minimal solutions. *Implication: log KL-to-base as the forgetting proxy. This directly addresses the v1 arc's prose-surface regression, which was a forgetting signature.*

### 3b. The reward function

8. **Rule-based verifiable rewards, never a learned reward model.** DeepSeek-AI 2025 (arXiv:2501.12948). Their reward-modelling section rejects neural RMs because they "may suffer from reward hacking in the large-scale reinforcement learning process"; accuracy plus format rules only. *Implication: our gold is constructed and tool-verified, which is the precondition R1 required. Ship no learned RM.*
9. **Overoptimisation against any proxy is lawful, not accidental.** Gao, Schulman, Hilton 2022/2023 (arXiv:2210.10760): with d = √KL, RL's form R_RL(d) = d(α − β·log d) has no maximum barrier and degrades insidiously. Pan, Bhatia, Steinhardt 2022 (arXiv:2201.03544): more capable agents exploit misspecification harder, via *phase transitions* where true reward drops discontinuously. Skalse, Howe, Krasheninnikov, Krueger 2022 (arXiv:2209.13085): two reward functions are provably unhackable over all stochastic policies only if one is constant. *Implication: every shaped term is a hackable surface. Track KL and a held-out true-verdict metric, and expect a cliff rather than a slope.*
10. **Binary reward beat partial credit on tool use; the format term is the shaping that earned its keep.** Zhang et al. 2025 (arXiv:2505.00024): binary 84.82% BFCL average against 83.74% for fine-grained partial credit, and 81.94% without the reasoning-format requirement — so format is worth ~2.9 points and partial credit *invited* hacking on Live data. Counter-evidence kept honestly: ToolRL (arXiv:2504.13958) found its three-part decomposition beat coarser variants by +17% over base. *Implication: default to binary verdict plus a format gate; carry ToolRL's decomposition as a preregistered ablation arm, never as the default.*
11. **A weakly-weighted process term is worse than no process term.** Palandye, Glick, Kaul 2026 (arXiv:2607.02869). Qwen2.5-0.5B on GSM8K with GRPO: process-only 63.73%, outcome-only 53.75%, but the blends are non-monotonic — 0.9/0.1 gives 61.10%, 0.5/0.5 gives 57.40%, and 0.1-process/0.9-outcome gives **49.30%, below pure outcome**. Context: Lightman, Kosaraju, Burda, Edwards, Baker, Lee, Leike, Schulman, Sutskever, Cobbe 2023 (arXiv:2305.20050) established process supervision's strength, but as a *reranker* at 175B trained on 800K human step labels. *Implication: do not blend a small tool-correctness term into the verdict reward. Either tool-correctness dominates or it is absent. The tempting middle is the measured worst case.*
12. **Length rewards fail on small models, and verbosity is the default exploit.** ToolRL (arXiv:2504.13958) found length rewards "does not consistently improve task performance, and in smaller-scale models, it can even cause substantial degradation" — on Qwen2.5-1.5B, 46.20% dropping to 33.23% when the length reward was introduced. Liu, Chen, Li, Qi, Pang, Du, Lee, Lin 2025 (arXiv:2503.20783, Dr. GRPO): GRPO's length normalisation biases toward longer responses *especially when wrong*. Yu et al. 2025 (arXiv:2503.14476, DAPO): a soft overlong penalty ramping linearly to −1 across the last 4096 of 16384 tokens contributed to an AIME24 ladder of 30 → 36 → 38 → 41 → 42 → 50. *Implication: no length or turn-count bonus, ever. A soft turn-count **penalty** only, so that a wrong verdict after 30 tool calls cannot out-earn a wrong verdict after 3.*
13. **Outcome-only reward is sufficient for multi-turn tool loops.** Jin et al. 2025 (arXiv:2503.09516). "A simple outcome-based reward function" over interleaved multi-turn search calls produced the +41%/+20% gains. *Implication: the closed-set verdict is a valid standalone signal. Tool shaping is optional polish, not a prerequisite.*

### 3c. The rollout harness

14. **Masking tool-result tokens from the loss is the single highest-leverage harness detail.** Jin et al. 2025 (arXiv:2503.09516). Ablation on Qwen2.5-7B-base with PPO: 0.431 average EM with retrieved-token masking against **0.343 without**. Corroborated by ToRL (arXiv:2503.23383): "we mask out the OBSERVATION outputs from the sandbox environment"; and by Jiang et al. 2025 (arXiv:2509.01055, VerlTool), which makes observation-token masking part of its formalisation. *Implication: mask every tool turn. Our 54-tool JSON results are long, so this matters more here than in papers with short observations.*
15. **Tool errors belong in the transcript as observations, and penalising them backfires.** Li, Zou, Liu 2025 (arXiv:2503.23383). Error messages truncated to the final line; a −0.5 penalty for non-executable code **did not help** and encouraged trivially simple code. Tool-call cap C=1 by default; C=2 gained ~2% accuracy but raised step time from 237s to 288s. *Implication: a tool error returns as a truncated observation, never as an episode termination and never as a reward penalty. Cap parallel calls per turn and price the cap.*
16. **Episode-level advantage plus a step term where states repeat.** Feng, Xue, Liu, An 2025 (arXiv:2505.10978, GiGPO, NeurIPS 2025). Step-level groups by anchor-state matching, `A(a_t) = A_E(τ) + ω·A_S(a_t)` with ω=1 untuned; >12% on ALFWorld and >9% on WebShop over GRPO at identical memory and time; 1.5B on 2×H100, 7B on 4×H100. *Implication: start with plain episode-level GRPO advantage. Add the step term only after states are shown to repeat across rollouts, which for a search-shaped task they will.*
17. **A gold-conditioned turn critic is the principled alternative to a value head.** Zhou et al. 2025 (arXiv:2503.15478, SWEET-RL). A critic with access to training-time information the actor lacks, learning the advantage directly rather than a value function; +6% absolute on ColBench, Llama-3.1-8B matching GPT-4o. *Implication: we hold constructible gold, which is exactly that privileged information — but this is a later arc, not the first one. Recorded so it is not re-derived.*
18. **Asynchronous rollouts are fine up to bounded staleness.** Fu et al. 2025 (arXiv:2505.24298, AReaL). AIME24 by maximum staleness η: 0 → 42.0, 4 → 42.2, 8 → 41.0, 16 → 38.7, unbounded → 36.9; 2.77×/2.27× speedup at 1.5B/7B. *Implication: if async is used, cap η at 4–8. Unbounded staleness costs about five points.*
19. **The rollout infrastructure tax is real and large.** Graviet et al. 2026 (arXiv:2607.01415). A 110× spread in sandbox cold-start latency and a 1.8× spread in worker-hours for a million 150-step trajectories. *Implication: the MCP server's start-up cost per episode is a first-class budget line. Keep one long-lived server process per rollout worker rather than spawning per episode.*
20. **KL off for multi-turn.** Yu et al. 2025 (arXiv:2503.14476). DAPO removes the KL term because "the model distribution can diverge significantly from the initial model, thus this restriction is not necessary"; G=16, prompt batch 512, clip 0.2/0.28. *Implication: KL off in the objective, but still **logged** as the forgetting proxy from finding 7.*
21. **Multi-turn RL collapses in a characterised way, with three early indicators.** Wang et al. 2025 (arXiv:2504.20073, RAGEN/StarPO). The "Echo Trap": reward-std drop, entropy decline, and gradient-norm spikes, the last appearing at step 170/110/90 on Bandit/Sokoban/FrozenLake, after which "recovery becomes unlikely." StarPO-S fixes: keep the top 25% of prompts by reward variance, remove KL, clip-higher. Rollout findings: 4 rollouts per prompt generalised best at fixed batch; max 5 turns / 10 actions; fresh rollouts every iteration beat reusing them for 5–10. *Implication: these three metrics are the training-time andon trip (§0). Do not reuse rollouts.*

### 3d. Task selection, difficulty, and the eval

22. **Prompt groups where every rollout agrees contribute zero gradient, and their share grows during training.** Yu et al. 2025 (arXiv:2503.14476). Dynamic sampling — oversample, discard degenerate groups, refill to a constant count — was the single largest contributor in their ablation, taking AIME24 from 42 to **50** and matching DeepSeek-R1-Zero-Qwen-32B in half the steps. *Implication: "fraction of prompt groups with all-identical reward" is a first-class logged metric, and the batch refills until it holds a fixed number of non-degenerate groups.*
23. **Prioritise by success *variance*, not by authored difficulty.** Foster, Sims, Forkel, Fellows, Foerster 2025 (arXiv:2502.12272, "Learning to Reason at the Frontier of Learnability"). Score candidates by learnability p(1−p) from a few cheap attempts: VinePPO on GSM8K goes 40.5 → 55.9 against 40.5 → 53.2 for the baseline, with up to 3× fewer steps to the same accuracy. *Implication: the generator's difficulty knob is calibrated to measured pass-rate variance on the current policy, not to an authored tier.*
24. **A concrete, citable difficulty band.** Prime Intellect Team 2025 (arXiv:2505.07291, INTELLECT-2). From 285k tasks they filtered offline by reference-model pass@8, **dropping everything above 50% and below 12.5%**, scoring with a fixed DeepSeek-R1-Distill-Qwen-7B; unfiltered data gave "stagnant rewards." Kimi Team 2025 (arXiv:2501.12599, k1.5) measures difficulty by answering each prompt 10× at high temperature, drops prompts solvable within N=8 attempts without reasoning as "easy-to-hack," and samples during RL proportional to 1−s. *Implication: P0's band is pass@8 in [12.5%, 50%], scored offline with a pinned reference model. Kimi's N=8 guess-test is also the cheap detector for the repo's own recurring defect — a perturbation a trivial baseline recovers is a leak.*
25. **Difficulty *ordering* does not work at our model sizes — the honest counterweight.** Mordig, Opedal, Liu, Schölkopf 2026 (arXiv:2603.27226). Across Llama3.2-1B/3B, Qwen3-0.6B/1.7B/4B and Gemma2-9B-Instruct, under both SFT and GRPO, five curriculum strategies at matched budget yield "no consistent accuracy gains over standard sampling." *Implication: build the learnability **filter**; do not build an easy-to-hard schedule. If an ordering knob ships at all, it ships preregistered as an ablation expected to be null.*
26. **A self-tuning difficulty knob has a published formula.** Zhao, Wu, Yue, Wu, Xu, Lin, Wang, Wu, Zheng, Huang 2025 (arXiv:2505.03335, Absolute Zero). The proposer's learnability reward is r_propose = 0 if mean solve rate ∈ {0,1}, else 1 − mean solve rate; gains of +7.0 (Qwen2.5-7B-Base) to +13.2 (14B-Coder). The authors flag an "uh-oh moment" with Llama3.1-8B as a safety caveat of self-proposed curricula. *Implication: if `cases()` ever becomes adaptive, this is the reward shape — with the caveat recorded.*
27. **IQM with stratified bootstrap CIs, not the mean, at few runs.** Agarwal, Schwarzer, Castro, Courville, Bellemare 2021 (arXiv:2108.13264, NeurIPS Outstanding Paper). With 5 runs the median's CI is 2–3× wider than the interquartile mean's; detecting a 25% improvement needs ~25 runs by median against ~10 by IQM; stratified bootstrap with ≥10k resamples holds 95% coverage at ~10 runs. *Implication: report IQM over (seed × case) with stratified-bootstrap CIs resampled **within the leak unit** (`splitKey`), and publish per-run scores as an artifact.*
28. **Our held-out set cannot resolve a small effect, and clustering makes it worse.** Miller 2024 (arXiv:2411.00640). Clustered standard errors are up to 3× the naive error when questions share a parent; paired differences remove ~33% of variance at ρ=0.5; detecting a 3-point absolute gap at 80% power needs ≈969 questions. *Implication: with n=59 clustered by song phrase, the defensible primary is a **paired** comparison against the base model with clustered bootstrap CIs and a preregistered minimum detectable effect. A point-estimate win is not available at this n and must not be claimed.*
29. **Two to five seeds is below the measured floor.** Hochlehnert et al. 2025 (arXiv:2504.07086) conclude ≥30 seeds are needed for stable AIME means and use 10 as a compromise. Kotawala 2026 (arXiv:2605.30315) finds 11 of 40 Open LLM Leaderboard pairs unresolved at α=0.05/power 0.8, rising to 6 of 9 MMLU-Pro adjacent pairs once subject-level clustering is modelled, and shows the common unpaired Cohen-h shortcut misses the required n by about 2×. Dodge, Gururangan, Card, Schwartz, Smith 2019 (arXiv:1909.03004) require reporting expected performance as a function of budget rather than the best run. *Implication: preregister the resolution ratio q = n/n* alongside the claim, report the held-out curve against run count rather than the best run, and pin decoding parameters, hardware and inference framework — all three are effect-sized confounders.*
30. **Small-model RL is real but fragile.** Zeng et al. 2025 (arXiv:2503.18892, SimpleRL-Zoo): zero-RL on Qwen2.5 base lifted 1.5B from 18.5 to 36.1 and 7B from 40.3 to 55.2 average, and the pass@1-to-pass@8 gap *widened* during training on Mistral-Small-24B, so it is not mere reranking; weak instruction-followers at ≤1.5B needed simpler prompts for stability. DeepScaleR-1.5B-Preview (Agentica, HF model card) took DeepSeek-R1-Distill-Qwen-1.5B from 28.8 to 43.1 AIME24 pass@1 via an 8K→16K→24K context curriculum. *Implication: use Dr. GRPO-style loss rather than stock GRPO, and stage context length if sequences grow.*

### 3e. Which stack

31. **`verifiers` launches an external MCP server as a subprocess — a Node process qualifies verbatim.** Brown / Prime Intellect 2025–26, retrieved `v0.3.1/verifiers/legacy/envs/experimental/mcp_env.py`: `class MCPEnv(vf.ToolEnv)` takes `mcp_servers: List[MCPServerConfig | dict]` with per-server `command`, `args`, `env`, and `max_turns: int = 10`. The v1 rewrite (`v0.3.1/verifiers/v1/mcp/toolset.py`) makes remote HTTP MCP first-class via `ToolsetConfig(url=...)`. *Implication: our TypeScript server needs zero Python reimplementation. Pin the version — this API churned between v0.2.1, v0.3.1 and v1.*
32. **The rollout contract is three hooks.** Retrieved `v0.2.1/verifiers/envs/multiturn_env.py`: `setup_state(state)`, `async env_response(messages, state) -> Messages`, and a stop predicate. *Implication: model our interface on exactly these three. Every other stack is a re-spelling of them, so this is the portable boundary.*
33. **TRL's external-server route does not fit one GPU.** Retrieved TRL docs: `GRPOTrainer` has `tools=[...]` (Python callables only), `max_tool_calling_iterations`, `environment_factory`, `peft_config`, and `vllm_mode="colocate"`. But `rollout_func` — the only route to an external server — "is currently only supported when using vLLM in server mode," and the published examples require two GPUs. *Implication: TRL is rejected for the first arc on single-GPU grounds. Its OpenEnv `rollout_func(prompts, args, processing_class) -> {prompt_ids, completion_ids, logprobs}` signature is still the right shape to copy.*
34. **OpenPipe ART ships an MCP rollout and resumes from a PEFT adapter directory.** Retrieved `examples/mcp-rl/mcp_rl/rollout.py`: `from mcp import ClientSession, StdioServerParameters`, `async def rollout(model, scenario, debug=False) -> art.Trajectory`, `max_turns: int = 10`; the FAQ states a "standard Hugging Face–style LoRA adapter directory (e.g., produced by Unsloth/PEFT)" can be passed as `base_model`. *Implication: closest fit to what we have — our published adapters become RL initialisations directly.*
35. **Unsloth is the memory backend, not the rollout layer.** Retrieved Unsloth GRPO docs: 5 GB VRAM for Qwen2.5-1.5B GRPO, ~90% VRAM reduction against TRL+FA2, shared CUDA memory space with vLLM saving 16 GB. Their own documentation redirects agentic multi-turn work to ART. *Implication: use for memory, never for the loop.*
36. **prime-rl runs `verifiers` environments and supports single GPU and LoRA.** Retrieved `docs/overview.md`: three processes (vLLM inference, CPU orchestrator, FSDP2 trainer), "at least one NVIDIA GPU," "single-GPU runs are supported for debugging," LoRA supported with weight broadcast falling back to the filesystem. Context: Dirhoussi, Gallouédec, Rasul 2026 (HF, "Keep the Tokens Flowing") survey 16 libraries, 13 of 16 supporting LoRA, and flag ART as the most single-GPU-accessible. *Implication: prime-rl is the alternate if ART's adapter path disappoints.*

### 3f. Citation gate result (Step 4 of the study-swarm protocol)

Run 2026-09-11, `roleos verify-citations` → `prism verify --type citations --provider ollama`
(different model family, advisor's reasoning stripped). Receipt:
`docs/rollout-layer-dispatch.citation-receipt.json`.

| Quantity | Value |
|---|---|
| Citations checked | **31** |
| Fabricated | **0** |
| Misattributed | **0** |
| Supported from title + abstract | 13 |
| `not_addressed` — claim lives in the paper body, oracle saw only title + abstract | 18 |
| Verdict | `escalate` (advisory) |

**The gate halted twice before it passed, and both halts were correct.** The first run returned
`verifier_unreachable` because prism had no receipt signing key; the protocol forbids reading a
verifier's absence as "citations fine," so the run was fixed rather than waived. The second run
adjudicated all 31.

**The 18 `not_addressed` items are an oracle-coverage limit, not a defect.** These findings cite
ablation-table numbers from paper bodies, which by construction never appear in an abstract. Three
of the most load-bearing were therefore verified by hand against full text on the same day:

| Claim | Status | Evidence |
|---|---|---|
| Search-R1 masking ablation, 0.431 with mask vs 0.343 without (finding 14, which makes L5 non-negotiable) | **CONFIRMED** | arXiv:2503.09516 HTML Table 4, Qwen2.5-7b-base with PPO |
| ToolRL Qwen2.5-3B, GRPO cold-start 52.98 vs SFT400+GRPO 46.42 on BFCL-V3; 67.00 vs 62.48 on API-Bank; raw 33.04/51.59; SFT4k 41.97/50.92 (finding 6, which sets the SFT→RL ordering) | **CONFIRMED** | arXiv:2504.13958 HTML Tables 1–2 |
| Miller's ≈969 questions to detect δ=0.03 at 80% power / α=0.05; DROP clustered/naive SE ratio 3.05× (1.34 vs 0.44); paired differences cut variance by 1/3 at ρ=0.5 (findings 28–29, which bind the whole eval spec) | **CONFIRMED** | arXiv:2411.00640v1 HTML |

**Residual, stated plainly.** The gate verified only the *first* identifier in each of 11 findings
that cite multiple sources, so the secondary identifiers in those findings carry retrieval-level
verification from the research agents but not gate-level verification. The remaining 15 body-only
claims are unspot-checked. **P3 must re-run the gate against the frozen lock and close these**; until
then, treat any single un-spot-checked number as advisory rather than load-bearing.

**Not claimed, reported honestly.** Agents could not retrieve LoRA or single-GPU statements for
SkyRL-Agent (arXiv:2511.16108), found no primary source for rLLM or AgentGym meeting all three
constraints, could not confirm the widely-quoted sandbox-failure split in arXiv:2607.01415, and could
not retrieve LILO's base-model size or seed count. Titles corrected against the source:
arXiv:2502.12272 is "Frontier of Learnability," not "Edge."

---

## 4. What the research changed about the original sketch

Recorded so the reasoning is auditable rather than invisible.

| Sketch before the swarm | After | Because |
|---|---|---|
| Wrap an existing family (acoustic) as the first environment | **New task family with an unconstrained tool sequence** | §2a plus findings 1, 5 — acoustic is solved by SFT at 36/36, so it has no headroom |
| SFT warm start, then RL | **RL from the instruct checkpoint** | Findings 6 (ToolRL 52.98 vs 46.42) and 6's independent corroboration |
| Shaped reward: format + tool-correctness + verdict | **Binary verdict + format gate; tool-correctness is an ablation arm only** | Findings 10 and especially 11 — the low-weight blend is the measured worst case |
| Difficulty ladder in the generator | **Learnability filter, no ordering** | Finding 25, a direct negative result at our model sizes |
| 2–5 seeds, report the win | **Paired vs base, clustered bootstrap, preregistered MDE and q** | Findings 27–29; n=59 cannot resolve a small effect |
| — | **Spurious-reward control run added** | Finding 3; we train Qwen |

---

## 5. Architectural lock

**L1 — The first environment is a new task family: bounded search over a song.** The generator plants
a property at an unknown location (a measure where a named chord occurs, a phrase whose key differs
from the song's, a take whose failure mode is one of the closed set) and asks the policy to find it.
Gold is the plant, so it is constructible in the contract's sense; the tool sequence is *not*
authored, because the policy must decide what to inspect next given what came back. This is what
gives reward something to be informative about (§2a, findings 1 and 5).

**L2 — The tool executor is the existing MCP stdio client; the real server is the verifier.** Reuse the
path in `scripts/verify-public-package-execution.ts` and `scripts/extract-mcp-tool-schemas.ts`. Do
not reimplement any tool in Python. One long-lived server process per rollout worker, never one per
episode (finding 19). The rollout tool subset is the nine tools the held-out traces already exercise
(§2); `play_song` is excluded outright, and `ensemble_now`'s audio-context coupling is a P1
verification item, not an assumption.

**L3 — The environment interface is three hooks.** Mirror `MultiTurnEnv` (finding 32) so the boundary
stays portable across stacks:

```ts
export interface ExperimentEnv<TCase, TState> {
  task: ExperimentTask<TCase>;
  maxTurns: number;                                        // L7
  setupState(c: TCase): Promise<TState>;
  envResponse(state: TState, calls: ToolCall[]): Promise<{ turns: SftMessage[]; state: TState }>;
  isDone(state: TState, messages: SftMessage[]): boolean;
  reward(c: TCase, transcript: SftMessage[]): RewardBreakdown;  // L4
}
```

**L4 — Reward is binary verdict plus a format gate, and nothing else.** `reward = format_ok ? (verdict === gold ? 1 : 0) : 0`, with a soft turn-count **penalty** ramping to a small negative past the budget. No tool-correctness term, no length bonus, no partial credit (findings 10–13). The ToolRL
decomposition ships as a preregistered ablation arm, never as the default. `RewardBreakdown` records
every component separately so an ablation can re-score a frozen transcript without re-running it.

**L5 — Every tool turn is masked from the loss.** Non-negotiable; finding 14 prices it at 0.431
against 0.343 EM.

**L6 — Tool errors are observations.** Truncated to the final line, returned as a tool turn, never an
episode termination and never a reward penalty (finding 15).

**L7 — Turn budget 5, parallel calls per turn capped at 2.** RAGEN's max-5-turns and ToRL's C-cap
(findings 21, 15). The cap is priced in the receipt, since ToRL measured C=2 at 237s → 288s per step.

**L8 — Dr. GRPO-style loss, KL removed from the objective but logged.** Findings 12, 20, 7.
Clip-higher at 0.2/0.28, dynamic sampling with degenerate groups discarded and the batch refilled
(findings 21, 22). Plain episode-level advantage first; GiGPO's step term is a later arc (finding 16).

**L9 — Prompt pool filtered by measured learnability before training.** Keep cases whose reference
pass@8 falls in [12.5%, 50%], scored offline with a pinned reference model; re-prioritise during
training by success variance (findings 23, 24). No difficulty ordering (finding 25).

**L10 — The spurious-reward control run is part of the arc, not an optional extra.** One matched run
with shuffled rewards. If it moves the metric comparably to the real reward, the arc reports that and
claims nothing (finding 3).

**L11 — Stack: OpenPipe ART first, prime-rl as the named alternate, TRL rejected for this arc.**
ART because it ships an MCP rollout and resumes from a PEFT adapter directory (finding 34); prime-rl
because it runs `verifiers` environments on a single GPU with LoRA (finding 36); TRL because
`rollout_func` requires vLLM server mode and therefore two GPUs (finding 33). Pin the exact version
of whichever is chosen; `verifiers`' API churned across three releases.

**L12 — A new corpus gets a new `schemaVersion`, registered in `src/dataset/experiment/registry.ts`.**
The existing published-set test will go red until it is registered. That is the contract working.

---

## 6. Phases

Every phase before P4 is **$0**. P4 is the only spend, and it is unreachable until P0 returns GO and
the director authorises.

### P0 — The go/no-go measurement ($0, no GPU rental)

The instrument the repo does not have yet: **sampled** evaluation. Both graders are greedy-only
(§2), so pass@k is currently unmeasurable.

1. Add `--n <k>` and sampling options to `ollama-grade.mjs` (it already accepts `--options temperature=…`; it has no repeat flag).
2. Measure base pass@1 and pass@8 per family on the 59 held-out cases, plus the trivial baselines, using a pinned reference model.
3. Report the learnability histogram: how many cases fall in [12.5%, 50%] pass@8 (finding 24).
4. Run Kimi's guess-test: how many cases a no-tool baseline answers within 8 attempts (finding 24). `src/dataset/acoustic-v1/toolless-baseline.mjs` already exists and is the seed of this (the coverage-v1-sft/scripts/ path in an earlier draft of this line did not exist).

**GO requires a population of cases with pass@8 in the band and pass@1 well below ceiling.** The
expectation from §2 is that the *existing* families largely fail this — acoustic is solved, five
families historically had constant gold. That is not a failure of P0; it is P0 doing its job, and it
is what justifies L1's new family. **NO-GO on the existing corpus with a GO on a new family is the
most likely outcome and is a complete, shippable result.**

### P1 — Environment interface and local rollout harness ($0)

`src/dataset/experiment/env.ts` implementing L3; the MCP stdio executor of L2; the L1 task family's
`cases()` with constructible plants; the straddle and gold-varies gates extended to it. The harness
runs end to end against a **local Ollama model** first — no rented GPU is needed to prove a rollout
loop works. Verification item: whether `ensemble_now` needs an audio device on Linux.

### P2 — Reward function, tests, and the replay receipt ($0)

L4 implemented with a test per clause; the PIN_PER_STEP remediation (a receipt that replays a
rollout byte-for-byte); the Echo-Trap monitor of finding 21 wired as an andon trip; the
spurious-reward harness of L10 built now, not later.

### P3 — Preregistration and citation gate ($0)

`experiments/rollout-arc/P0-LOCK.md` frozen before any model call, carrying: the primary metric and
its bar, the minimum detectable effect and resolution ratio q at the actual n (finding 28), the seed
count with its justification against finding 29, the clustered-bootstrap procedure (finding 27), the
ablation arms, and the pre-written null and Pareto branches. Citation receipt regenerated.

### P4 — The paid run (director-gated)

Priced from P0–P3 receipts, not from guesses — the v1 lesson (estimated 1.3h per seed against a
measured 2h12 that the prior receipts already contained). `runpod.mjs verify` before anything is
created. Precedent cost: $4.00 for the last two-pod run. **Stop and ask at >20% projection drift.**

### P5 — Eval, report, publish gate

Scored by program, never by a model. Paired against base and against the SFT adapter on the same
split. Publish only on an explicit director yes.

---

## 7. Compensators (no skip permitted)

| Irreversible action | Compensator | Post-rollback state | Owner |
|---|---|---|---|
| RunPod pod deploy (P4) | `node experiments/acoustic-sft/runpod.mjs down --all`, which re-lists and states plainly what is still billing | No pod billing; at most the in-flight seed forfeited | P4 session |
| Pod volume | `volumeInGb` only — pod-local, dies with the pod. **Never a network volume** | Nothing billing after teardown | P4 session |
| HF adapter publish (P5) | Delete the HF revision; the GitHub mirror release is the recoverable copy | Adapter unpublished, receipts retained | Director gate only |
| New `schemaVersion` registration | Remove the `registerPublishedSchema` line; `published-set.test.ts` re-derives from disk | Registry consistent with `datasets/` | P1 session |
| Corpus cut published to Zenodo | Zenodo versions are immutable — an erratum is the only remedy, per erratum-001 precedent | Erratum published against the version DOI | Director gate only |
| MCP server process spawned per rollout worker | Explicit kill on worker exit plus a process-leak assertion in the harness teardown | No orphaned Node processes | P1 session |

---

## 8. The three director gates, framed contrastively

1. **After P0.** "You probably expect the existing corpus to be the RL training set. The measurement will likely say it is not — acoustic is already solved at 36/36 by a four-dollar SFT run, and a solved task has no gradient. The recommendation is then a new task family, not a bigger sweep."
2. **Before P4.** "You probably expect this to cost what the SFT arcs cost. RL rollouts execute the tool server once per turn per rollout, so the cost driver is episodes × turns, not epochs. The price comes from P0–P3 receipts before the ask."
3. **After P5.** "You probably expect a win or a loss. At n=59 clustered by song phrase, the honest third outcome is *unresolved* — the effect is smaller than this eval can see. That outcome is pre-written as shippable."

---

## 9. Preregistration constraints (these bind P3)

- **Primary is paired, not absolute.** Per-case paired difference against the base model on the same split, clustered by `splitKey` (findings 27, 28).
- **State the MDE and q before looking.** With n=59 and clustering, publish the minimum detectable effect and the resolution ratio q = n/n* alongside the claim (findings 28, 29).
- **Seeds.** The retrieved floor is ≥30, with 10 as a documented compromise (finding 29). The prior arcs used 5. Either raise the seed count or preregister that the report states a CI and not a win; do not quietly keep 5 and claim significance.
- **Report pass@k, not only pass@1** (finding 1). An RLVR result that improves pass@1 while shrinking pass@k is a known outcome and must be visible.
- **Pin decoding parameters, hardware, and inference framework in the lock.** All three are effect-sized confounders, not implementation details (finding 29).
- **The spurious-reward control is a preregistered arm** (finding 3, L10).
- **Null and Pareto branches pre-written as shippable**, per the v1/B-2 precedent.

---

## 10. Do not

- Do not start a separate repo. The contract, the scaffolding, the RunPod harness and the verifier all live here; extraction into a package earns its existence at the second consumer, which this is not yet.
- Do not spend a dollar before P0 returns GO and the director authorises.
- Do not reimplement any of the 54 tools in Python.
- Do not add a length or turn-count *bonus* (finding 12), a small-weight tool-correctness blend (finding 11), or a learned reward model (finding 8).
- Do not build an easy-to-hard curriculum schedule (finding 25).
- Do not let a model score the eval.
- Do not claim a win without the spurious-reward control and the paired clustered statistics.
- Do not tune the environment to the eval; the bars are frozen in P3 before any model call.

---

## 11. Links

- Contract: [`experiments/_template/README.md`](../experiments/_template/README.md) · scaffolding `src/dataset/experiment/`
- Verifier precedent: [`scripts/verify-public-package-execution.ts`](../scripts/verify-public-package-execution.ts)
- Pod harness: [`experiments/acoustic-sft/runpod.mjs`](../experiments/acoustic-sft/runpod.mjs) · [`RUNPOD.md`](../experiments/acoustic-sft/RUNPOD.md)
- Prior arcs: [finetune-arc-dispatch.md](finetune-arc-dispatch.md) · [RESULTS-r52.md](../experiments/coverage-v1-sft/RESULTS-r52.md) · [finetune-arc-v2-b1-eval-report.md](finetune-arc-v2-b1-eval-report.md) · [finetune-arc-b2-eval-report.md](finetune-arc-b2-eval-report.md)
- Headless constraint: memory `ai-jam-sessions-ci-divergences`
