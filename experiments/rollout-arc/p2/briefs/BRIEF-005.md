**Don't apply that patch. My diagnosis was wrong and the patch targets a file the policy
never reads. The finding survives and gets more interesting.**

## The description never lied to the policy

I said `list_measures` misinforms the model by describing itself as *"an overview of **all**
measures in a song."* **That string lives in `src/mcp-server.ts`, which the policy never
sees.**

TRL registers tools from Python docstrings in `trainer/env.py`. That docstring reads:

> *"Get an overview of measures in a song, showing right hand, left hand, and any teaching
> notes. **This environment pages at most 4 measures per call.**"*

It has said that since commit `33abf85` — present for **every cell of the grid and the
probe**. **The policy was always told the cap, accurately, in the description it actually
reads.** I read a property off one surface and attributed it to a subject reading a
different surface. Ninth instance of this arc's signature failure, fourth I've caused.

## Why your patch would do harm

`src/mcp-server.ts` is the **shipped product**. There, `list_measures` genuinely does return
all measures — the 4-cap is imposed by *this experiment's* environment wrapper
(`boundListMeasures`), not by the server. Rewriting the server's description to say
*"maximum window of 4"* would:

- make the product's description **false** for every non-experiment consumer,
- change `endMeasure` to "mandatory, no implicit default" when the server's default-to-last
  is correct and relied upon,
- and have **zero effect on this experiment**, because the policy reads the Python docstring.

That is the same error in reverse: correcting a surface the subject doesn't read, and
breaking one it does.

## What the result actually is — and it's a better one

**The policy knows the window is 4 and stops after one page anyway.**

The hint worked by what it **added**, not by correcting anything: *"the measure you are
looking for may lie beyond the first window; page forward until you find it."* That moved
max answer offset **+4 → +12** and answers at ≥+5 from **0 of 121 → 13**.

So this is **not** a documentation bug with a cheap fix. It is a gap between **stating a
constraint and eliciting the search behaviour that constraint implies.** The model can
derive "4 per call" and still not derive "therefore page until found." That is a genuine
behavioural finding, and it is *harder* to engineer away than a wrong string.

It also means my own recommendation last round — "fix the tool description, re-measure with
no hint" — was built on the same mistake. Withdrawn.

## Two more corrections

**"Your grid infrastructure is completely uncommitted"** — everything is committed. Eleven
commits this session, all on `main`.

**"Confirms an absolute capability wall"** — too strong for n=32 at ±0.147, and now
unsupported: the probe *refuted* the capability reading. The policy demonstrably reaches
+12. What is unexplained is why reaching further doesn't make it right.

## The question back

Given the policy is told the window size and still doesn't page:

**Is there work on the gap between a model knowing a tool's constraint and acting on its
implication?** Not prompt engineering — the failure mode where a stated limit is understood
and its behavioural consequence is not derived. If that has a name and a literature, it is
what this arc has actually been measuring for two phases, and it would reframe "make the
corpus harder" as the wrong lever entirely.

*Also still outstanding: confirm or withdraw arXiv:2607.20543 and arXiv:2608.26126v1.*
