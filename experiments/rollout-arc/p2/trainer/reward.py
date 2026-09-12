"""P2 Stage B — the reward, forwarded to the one implementation.

The reward is NOT reimplemented here. `scoreReward` in
`src/dataset/experiment/env.ts` is the L4 lock — binary outcome behind a format
gate, plus the over-budget turn penalty — and it is already written and tested.
This module POSTs a transcript to the Node bridge and returns the float.

Why a reward function and not the environment's `get_reward()`: TRL calls
`get_reward()` with no arguments, so it can only see environment state, and our
verdict lives in the model's final message. Reward functions get `completions`
(verified: `_calculate_rewards`, trl 1.13.0 grpo_trainer.py line 1636) along
with every dataset column as a keyword argument, which is where `gold` arrives.

Lock §3 is enforced here, because this is the only place that sees both the
format gate and the outcome for every rollout:

    format_rate     fraction of rollouts producing a parseable in-range verdict
    acc_conditional accuracy GIVEN format_ok — the skill signal
    acc_joint       accuracy over all rollouts — what a naive report shows

A run that moves `acc_joint` while `acc_conditional` is flat has taught
formatting. The acoustic arc was burned by exactly that once: 0.639 of apparent
adapter gain was output formatting. All three are logged every step so the
distinction is in the receipts rather than in an argument afterwards.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx

DEFAULT_BASE_URL = os.environ.get("P2_ENV_URL", "http://127.0.0.1:8765")


class ScoreBridgeError(RuntimeError):
    """Scoring failed. Never coerced to 0.0: a silent zero is indistinguishable
    from a wrong answer and would poison the advantage for the whole group."""


def _messages_for(prompt: Any, completion: Any) -> list[dict[str, Any]]:
    """prompt is the conversational prompt (system + user); completion is the
    list of assistant turns TRL assembled, tool-calling turns included."""
    msgs: list[dict[str, Any]] = []
    msgs.extend(prompt if isinstance(prompt, list) else [{"role": "user", "content": str(prompt)}])
    if isinstance(completion, list):
        msgs.extend(completion)
    else:
        msgs.append({"role": "assistant", "content": str(completion)})
    return msgs


def make_score_reward(base_url: str = DEFAULT_BASE_URL, timeout: float = 60.0):
    """Build the async reward function TRL will call once per step."""

    client: dict[str, httpx.AsyncClient | None] = {"c": None}

    def _http() -> httpx.AsyncClient:
        if client["c"] is None:
            client["c"] = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=timeout)
        return client["c"]

    async def _score_one(prompt: Any, completion: Any, gold: str) -> dict[str, Any]:
        payload = {"gold": str(gold), "messages": _messages_for(prompt, completion)}
        try:
            res = await _http().post("/score", json=payload)
        except httpx.HTTPError as err:  # pragma: no cover - network shape
            raise ScoreBridgeError(f"scoring bridge unreachable at {base_url}: {err}") from err
        if res.status_code != 200:
            raise ScoreBridgeError(f"scoring bridge returned {res.status_code}: {res.text[:200]}")
        return res.json()

    async def jam_verdict_reward(
        prompts: list[Any],
        completions: list[Any],
        gold: list[str] | None = None,
        log_metric: Any = None,
        log_extra: Any = None,
        **kwargs: Any,
    ) -> list[float]:
        if gold is None:
            raise ScoreBridgeError(
                "no `gold` column reached the reward function; the dataset must carry one per example"
            )
        breakdowns = await asyncio.gather(
            *(_score_one(p, c, g) for p, c, g in zip(prompts, completions, gold, strict=True))
        )

        n = len(breakdowns)
        formatted = [b for b in breakdowns if b.get("format_ok")]
        correct = sum(1 for b in breakdowns if b.get("correct"))
        if log_metric is not None and n:
            # Lock §3: three series, never one.
            log_metric("format_rate", len(formatted) / n)
            log_metric("acc_joint", correct / n)
            if formatted:
                log_metric("acc_conditional", sum(1 for b in formatted if b.get("correct")) / len(formatted))
            # Lock §4: a drop toward 1 means the policy stopped searching.
            log_metric("mean_tool_turns", sum(b.get("tool_turns", 0) for b in breakdowns) / n)
            log_metric("turn_cap_rate", sum(1 for b in breakdowns if b.get("tool_turns", 0) >= 5) / n)
        if log_extra is not None:
            log_extra("format_ok", [bool(b.get("format_ok")) for b in breakdowns])
            log_extra("verdict", [str(b.get("verdict", "")) for b in breakdowns])

        return [float(b.get("reward", 0.0)) for b in breakdowns]

    return jam_verdict_reward


def make_random_reward(seed: int = 0):
    """Lock §6: the spurious-reward control. Random rewards nearly match real
    ones on Qwen (+21.4pp vs +29.1pp, arXiv:2506.10947), so a run without this
    arm is unfalsifiable. Binary, matching the real reward's support.
    """
    import random

    rng = random.Random(seed)

    def jam_random_reward(prompts: list[Any], completions: list[Any], **kwargs: Any) -> list[float]:
        return [float(rng.randint(0, 1)) for _ in completions]

    return jam_random_reward
