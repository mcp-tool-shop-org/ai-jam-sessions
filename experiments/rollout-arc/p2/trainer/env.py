"""P2 Stage B — the environment_factory class.

Nine public methods, one per tool in `ROLLOUT_TOOLS`. Every one of them forwards
to the Node bridge (`p2-env-server.mjs`), which applies the same page bound the
P1c–P1f rollouts used and then calls the REAL `dist/mcp-server.js`. Nothing
about the tool surface is reimplemented here; this file is an adapter and a
schema, and it must stay that way.

Contract, verified against the installed TRL rather than the docs
(trl 1.13.0, `trl/trainer/grpo_trainer.py`):

* `environment_factory` is a **GRPOTrainer kwarg**, not a `GRPOConfig` field: a
  callable returning an instance (line 320).
* Instances are **pooled and reused** across batches (`_environment_pool`,
  line 2380), so `reset` must fully clear per-episode state.
* `reset(**row)` receives **every dataset column as a keyword argument**
  (line 2411). Returning `None` leaves the prompt untouched.
* Public methods that are not `reset`/`get_reward` and do not start with `_`
  auto-register as tools (line 2396), so **every helper here is underscored** —
  a stray public method silently becomes a tool the model can call.
* `async def` methods are dispatched on an async loop (line 2404 region), so the
  nine tools below are async and do not serialise on stdio latency.
* Tool-result tokens are masked out of the loss by the trainer itself
  (`tool_mask`, line 1990; `loss_mask = completion_mask * tool_mask`, line 2519).
  **Do not hand-roll a mask on this path.**

The reward is NOT `get_reward()`. That method takes no arguments and can only
see environment state, while our verdict lives in the model's final message —
so scoring is a reward function over the completion (see `reward.py`).
"""

from __future__ import annotations

import os
from typing import Any

import httpx

DEFAULT_BASE_URL = os.environ.get("P2_ENV_URL", "http://127.0.0.1:8765")

# Matches MAX_PARALLEL in src/dataset/experiment/env.ts. The bridge cannot see
# assistant-turn boundaries, so the cap is asserted here against the trainer's
# observed behaviour rather than silently assumed (see BUILD.md).
MAX_PARALLEL = 2

# TRL pools environment instances and resets them between rollouts. That is a
# claim read off the source; these counters make it a measured one, and the dry
# run asserts on them. Cheaper than a bridge round-trip on the critical path.
COUNTERS: dict[str, int] = {"instances": 0, "resets": 0}


class ToolBridgeError(RuntimeError):
    """The bridge was unreachable or answered with a non-200. Never swallowed:
    a silent failure here would train the policy against an empty library."""


class JamSearchEnv:
    """The synth-v0 search environment, exposed to TRL as nine tools.

    One instance per concurrent rollout; TRL pools and resets them.
    """

    def __init__(self, base_url: str = DEFAULT_BASE_URL, timeout: float = 60.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None
        self._case_id: str | None = None
        self._gold: str | None = None
        self._calls: list[str] = []
        self._errors = 0
        COUNTERS["instances"] += 1

    # ── internals (underscored so TRL does not register them as tools) ───────

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout)
        return self._client

    async def _tool(self, name: str, **arguments: Any) -> str:
        """Forward one tool call. Drops keys the caller left as None so the MCP
        server sees the same argument object a direct call would send."""
        args = {k: v for k, v in arguments.items() if v is not None}
        try:
            res = await self._http().post("/tool", json={"name": name, "arguments": args})
        except httpx.HTTPError as err:  # pragma: no cover - network shape
            raise ToolBridgeError(f"{name}: bridge unreachable at {self._base_url}: {err}") from err
        if res.status_code != 200:
            raise ToolBridgeError(f"{name}: bridge returned {res.status_code}: {res.text[:200]}")
        obs = res.json()
        self._calls.append(name)
        if obs.get("isError"):
            self._errors += 1
        # A tool error is an observation, not an exception: that is how the
        # P1c–P1f rollouts saw it, and the policy is supposed to recover.
        return str(obs.get("text", ""))

    @property
    def _stats(self) -> dict[str, Any]:
        return {"case_id": self._case_id, "calls": list(self._calls), "tool_errors": self._errors}

    # ── TRL contract ─────────────────────────────────────────────────────────

    def reset(self, **row: Any) -> None:
        """Clear per-episode state. Instances are pooled, so anything not
        cleared here leaks into the next rollout."""
        self._case_id = row.get("id")
        self._gold = row.get("gold")
        self._calls = []
        self._errors = 0
        COUNTERS["resets"] += 1
        return None

    # ── the nine tools (ROLLOUT_TOOLS, in the catalog's own words) ───────────

    async def list_songs(
        self,
        genre: str | None = None,
        difficulty: str | None = None,
        query: str | None = None,
        composer: str | None = None,
    ) -> str:
        """Browse and search the piano song library. Filter by genre, difficulty, composer, or search query.

        Args:
            genre: Filter by genre (classical, jazz, pop, blues, rock, rnb, soul, latin, film, ragtime, new-age, folk).
            difficulty: Filter by difficulty (beginner, intermediate, advanced).
            query: Search query (matches title, composer, tags, description).
            composer: Filter by composer (case-insensitive substring match).
        """
        return await self._tool("list_songs", genre=genre, difficulty=difficulty, query=query, composer=composer)

    async def song_info(self, id: str) -> str:  # noqa: A002 - the tool's own parameter name
        """Get detailed information about a specific song - musical language, teaching goals, key moments, structure.

        Args:
            id: Song ID (kebab-case, e.g. 'moonlight-sonata-mvt1').
        """
        return await self._tool("song_info", id=id)

    async def list_measures(
        self,
        id: str,  # noqa: A002 - the tool's own parameter name
        startMeasure: int | None = None,  # noqa: N803 - matches the tool schema
        endMeasure: int | None = None,  # noqa: N803 - matches the tool schema
    ) -> str:
        """Get an overview of measures in a song, showing right hand, left hand, and any teaching notes.

        This environment pages at most 4 measures per call.

        Args:
            id: Song ID.
            startMeasure: Start measure (1-based).
            endMeasure: End measure (1-based).
        """
        return await self._tool("list_measures", id=id, startMeasure=startMeasure, endMeasure=endMeasure)

    async def detect_chord(self, notes: list[int]) -> str:
        """Detect the chord name from a set of currently-sounding MIDI note numbers (0-127).

        Args:
            notes: MIDI note numbers currently sounding, e.g. [60, 64, 67] for a C major triad.
        """
        return await self._tool("detect_chord", notes=notes)

    async def verify_harmony(
        self,
        reharmonization: str,
        songId: str | None = None,  # noqa: N803 - matches the tool schema
        measures: str | None = None,
        melody: str | None = None,
        key: str | None = None,
        maxChromaticRatio: float | None = None,  # noqa: N803 - matches the tool schema
    ) -> str:
        """Verify a proposed reharmonization with the platform's deterministic music tools.

        Args:
            reharmonization: Proposed harmony as a JSON array: [{"measure": 1, "intendedChord": "C major"}].
            songId: Verify against this library song's right-hand melody.
            measures: Measure range within the song, e.g. '1-8'. Only used with songId.
            melody: Inline melody instead of songId: JSON array [{"number": 1, "rightHand": "C4:q"}].
            key: Key for the membership check (e.g. 'A minor').
            maxChromaticRatio: Max fraction of melody notes allowed to be chromatic before consonance is reported.
        """
        return await self._tool(
            "verify_harmony",
            reharmonization=reharmonization,
            songId=songId,
            measures=measures,
            melody=melody,
            key=key,
            maxChromaticRatio=maxChromaticRatio,
        )

    async def transpose_song(self, id: str, semitones: int) -> str:  # noqa: A002
        """Transpose a song to a different key, shifting all notes by the given number of semitones.

        Args:
            id: Song ID to transpose.
            semitones: Semitones to shift: positive = up, negative = down (e.g. 2 = up a whole step).
        """
        return await self._tool("transpose_song", id=id, semitones=semitones)

    async def ensemble_now(self) -> str:
        """Ask what every instrument is playing right now, mid-performance."""
        return await self._tool("ensemble_now")

    async def transcribe_audio(self, path: str, min_confidence: float | None = None) -> str:
        """Turn a monophonic WAV recording into notes: pitch, start time, duration, and cents from concert pitch.

        Args:
            path: Absolute path to an uncompressed WAV file.
            min_confidence: Frames below this pitch confidence do not vote on a note. 0 to 1.
        """
        return await self._tool("transcribe_audio", path=path, min_confidence=min_confidence)

    async def score_audio_take(self, path: str, song_id: str, bpm: float | None = None) -> str:
        """Grade a recorded performance against a song in the library, by ear rather than from MIDI capture.

        Args:
            path: Absolute path to an uncompressed WAV file of the performance.
            song_id: Which song in the library to grade against.
            bpm: Tempo the take was played at, if it differs from the song's own.
        """
        return await self._tool("score_audio_take", path=path, song_id=song_id, bpm=bpm)


def make_environment_factory(base_url: str = DEFAULT_BASE_URL):
    """TRL calls this with no arguments, once per pooled instance."""

    def factory() -> JamSearchEnv:
        return JamSearchEnv(base_url=base_url)

    return factory


ROLLOUT_TOOL_NAMES = (
    "score_audio_take",
    "transcribe_audio",
    "song_info",
    "list_measures",
    "verify_harmony",
    "detect_chord",
    "ensemble_now",
    "list_songs",
    "transpose_song",
)
