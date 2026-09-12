**One question, and a result that cuts against the thing we've been trying to do.**

## What happened since 006

I read a transcript instead of an aggregate and found that the environment was refusing a
tool call the policy's own signature declares legal.

`trainer/env.py` — the tool the policy actually reads — declares both bounds optional:

```python
startMeasure: int | None = None
endMeasure:   int | None = None
```

The environment required both and refused without them. Measured across every cell:
**97% of control episodes, 100% of treatment and treatment-hint burned one of five tool
turns on that refusal.** `MAX_TURNS` is 5, so ~20% of the budget went before any search
began. It is why a task needing three windows at distance 11 hit `turn_cap_rate` 0.50.

Fixed: an omitted bound is filled in rather than refused. The cap still binds, and a
windowless call still returns one page rather than the song.

## The paired re-measure — same 32 cases, only the fix moved

| | control | control-fixed |
|---|---|---|
| refusals | **97%** | **0%** |
| `list_measures` calls/episode | 2.48 | **1.06** |
| `turn_cap_rate` | 0.50 | **0.00** |
| tool turns | 2.0–4.0 | **1.0–3.5** |
| accuracy | 0.719 | 0.781 |
| **non-degenerate groups** | **0.125** | **0.062** |

**The mechanism is decisive. The accuracy gain is not** — paired, better on 6, worse on 3,
unchanged 23, **sign test p = 0.51**. I am not claiming +0.062.

## The question

**Fixing the environment made the policy better and the training signal worse.**

Non-degenerate groups — the only ones that carry gradient under GRPO, since TRL 1.13.0 keeps
degenerate groups and they contribute nothing — **halved, from 0.125 to 0.062.** A policy
that stops wasting turns agrees with itself more often. Every environment defect I remove
makes the task easier and the gradient rarer.

That is not a bug in the fix. It looks like a structural tension, and it is the same one the
whole arc keeps hitting from different directions: the 4-bit gate made the task look hard
because the model was worse; the truncation confound made accuracy look lower because
answers were cut off; the turn tax made the policy look weaker because we were taxing it.
**Every correction has moved difficulty down and degeneracy up.**

So:

1. **Is this tension named and studied?** Environment/harness quality trading against
   gradient availability in RLVR — where improving the environment reduces the very
   disagreement the algorithm needs. If it has a literature, cite it; if you don't know,
   say so plainly, as you did last time.
2. **If it's real, what is the actual target?** It cannot be "maximise policy success" and
   it cannot be "maximise disagreement" — the first kills the gradient and the second is
   satisfied by a broken environment. What does the RL literature use as the objective when
   task difficulty is a *design variable* rather than a given?
3. **Does it change what a difficulty knob should do?** Our knobs make the corpus harder.
   If the binding constraint is that a *correct* environment yields too little disagreement,
   harder data may just move us from "degenerate at the top" to "degenerate at the bottom,"
   which is exactly what distance 5–11 did (accuracy 0.000, zero non-degenerate groups).

Constraints unchanged: no lowering temperature (already 1.0, unrestricted), no raising it
above 1.0 (manufactures disagreement), no outcome-selected case sampling.

*Still outstanding: confirm or withdraw arXiv:2607.20543 and arXiv:2608.26126v1.*
