**Agreed on the mechanism. Two corrections, one of which is a design flaw in the probe as
you specified it. Probe is built and staged.**

## Correction 1 — the environment doesn't say the fetch is the whole song

You wrote that it *"explicitly tells it that its first 4-measure fetch is the entire song."*
Precisely: the **tool description** says `list_measures` gives "an overview of all measures
in a song," and `endMeasure` documents a default of "last." The **environment's refusal
message does state the cap** — *"this environment caps a call at 4"* — so the policy is told,
once it trips the bound.

The actual gap is narrower and more interesting: **nothing tells it the answer may lie past
the window it just fetched.** It learns the cap, complies, gets 4 measures, and its tool
description says that *is* the song. So it stops. That's a missing fact about the task, not a
lie about the cap.

## Correction 2 — your probe design has a confound; mine adds a second arm

You proposed running the hint on the treatment cell and leaving control untouched. **That
compares prompt-A-control against prompt-B-treatment** — two things moved, so a difference
can't be attributed. The no-hint baselines exist already (grid-v2 control and treatment, same
seed and shape), so the probe runs **both distances with the hint**:

| | no hint (done) | hint (staged) |
|---|---|---|
| distance 1–3 | control — acc 0.719 | `control-hint` |
| distance 5–11 | treatment — acc **0.000** | `treatment-hint` |

Control-hint matters for its own sake: if the hint *lowers* control's accuracy, it is a
distraction rather than information, and that would change how to read any treatment gain.

## Correction 3 — "completely rehabilitates distance" is too strong

If accuracy moves off 0.000 it shows the **ceiling was informational**. It would not show
that distance 5–11 is *learnable* — the band needs accuracy strictly between 0 and 1, and a
hint could just as easily move it to near-1, which is degenerate at the other end. Partial
rehabilitation at best, and the honest outcome set is three-way: informational ceiling,
capability ceiling, or overshoot into a different degeneracy.

## The hint, verbatim — note what it does not contain

> `list_measures` returns at most 4 measures per call in this environment, regardless of the
> range you request. The measure you are looking for may lie beyond the first window you
> fetch; page forward until you find it.

**No distance, no measure number, no page index, no song length.** It states a constraint the
environment already enforces and a property of the task that holds for every case. Your
suggested version included *"Songs are up to 120 measures long"* — I dropped it. It is true,
but it is corpus-specific and edges toward telling the policy how far to search.

## One process note

The patch is **staged and refuses to apply while the grid is running** — it checks for the
completion marker and exits if absent. Cells 1–2 already ran against the current bridge; if
cells 3–4 loaded patched code, the only property the 2×2 has would be gone. Same reason the
peer is holding a `train.py` fix.

Grid: `decoy-near` running, `decoy-far` queued. Probe fires after.
