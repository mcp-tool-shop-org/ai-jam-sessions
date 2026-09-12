# The turn tax — 97–100% of episodes burn a turn on a contract we broke

Found by reading a `treatment-hint` transcript instead of its aggregates, after asking why
paging unlocked without correctness.

## The transcript

> **user:** In "Synth D0 Study abd", what is the first measure at or after measure 9 whose
> left hand is C#?
>
> **assistant:** `list_songs {"query": "Synth D0 Study abd"}`
> **tool:** `Found 1 song(s): synth-d0-study-abd — Synth D0 Study abd (classical, beginner, 53 measures)`
>
> **assistant:** `list_measures {"id": "synth-d0-study-abd", "startMeasure": 9}`
> **tool:** `list_measures requires startMeasure and endMeasure; this environment pages at most 4 measures per call`
>
> **assistant:** `list_measures {"id": "...", "startMeasure": 9, "endMeasure": 12}`
> **tool:** *measures 9–12, all `C3+E3+G3`*
>
> **assistant:** `13`

The policy searched correctly, found no match in the window, and answered **window_end + 1**.

## The defect

The tool signature the policy reads, in `trainer/env.py:144`, declares both bounds
**optional**:

```python
startMeasure: int | None = None,
endMeasure: int | None = None,
```

The environment, in `search-v0/window.ts:18`, **requires both** and refuses without them.

**So the policy calls the tool exactly as its own signature permits, and is refused.**

## How often

| cell | episodes with a missing-`endMeasure` refusal | mean refusals/episode | oversized-window refusals |
|---|---|---|---|
| control | **62 / 64 (97%)** | 0.97 | 27 |
| treatment | **64 / 64 (100%)** | 1.00 | 25 |
| treatment-hint | **64 / 64 (100%)** | 1.00 | 19 |

**Essentially every episode in this arc has burned a tool turn on it**, and many burn a
second on the oversized-window refusal. `MAX_TURNS` is **5**, so this is **~20% of the entire
turn budget**, spent before any search begins.

The typical episode spends turn 1 on `list_songs`, turn 2 on a refusal, turn 3 on the first
real window — leaving **two turns** for a task that needs three windows at distance 11. It
matches `turn_cap_rate` 0.50 on `treatment-hint`.

## What this corrects, including about my own claim

I said the environment misinforms the policy, pointed at `list_measures`' *description*, and
was wrong — that string is in `src/mcp-server.ts`, which the policy never reads.
**The environment does misinform the policy, on the surface it does read, through the
parameter contract rather than the prose.** Declared optional; enforced required.

**Tenth instance of this arc's failure class.** Distinct from the ninth: that one was my
misattribution, this one is a real defect I found while correcting it.

## Consequence for every number in this arc

The 27.1%, the 32.0%, the abort's 0.9125, control's 0.719, every grid cell — **all measured
with ~20% of the turn budget burned on a contract mismatch.** It does not invalidate them;
it means they are all measurements of a *handicapped* policy, and the handicap is ours.

## The fix, proposed not applied

Align enforcement with the declared signature rather than the reverse: when `endMeasure` is
omitted, default it to `startMeasure + MAX_LIST_WINDOW - 1` instead of refusing. The cap
still binds; the policy stops being punished for calling the tool the way its signature says
it may.

**Not applied yet** — it changes the environment for every future measurement, so it needs a
before/after on the same cases, which is free and local. The right comparison is `control`
and `treatment` re-run with the defaulting fix and **no** system hint, paired against the
cells already recorded.
