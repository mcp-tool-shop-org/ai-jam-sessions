# ABC validator — specification for P3 hard restriction 1

**Status: specification only. Not implemented. No training run may launch until it is.**

## Why this exists, and why the current test cannot stand

The P3 probe used a regex blocklist to decide whether a completion was a real ABC lead sheet.
It shipped in `fc30025` with a literal `0x08` byte where a word boundary belonged, so **half the
pattern was inert and nobody could tell from the output** — the gate simply reported a higher
number. It was caught by cross-checking against an independent count, not by the test itself.

That is the generic failure of blocklists: **they fail silently and they fail open.** A blocklist
only rejects what its author anticipated, so novel garbage passes and the rate drifts upward with
no signal. This gate decides which completions earn reward. A reward gate that fails open is a
reward gate that teaches the policy to produce whatever the blocklist forgot.

## The design rule: allowlist by total tokenization

**The validator MUST be a total tokenizer over the tune body. A body is well-formed if and only
if every character is consumed by a known token. The first unconsumed character is the error.**

This inverts the failure direction. An unanticipated construct is *rejected* with a position and
a character, not silently accepted. The validator cannot be half-inert without failing loudly,
because a dead branch means unconsumed input, which means a rejection with a position that a
test can assert on.

## What the census says the validator must actually discriminate

Measured across all 352 committed completions (`runs/er-g8.jsonl`):

| property | count | consequence for the spec |
|---|---|---|
| complete `X:`/`T:`/`M:`/`L:`/`K:` headers | 352 / 352 | **header checks measure nothing.** Do not spend the gate here. |
| body present after `K:`, containing bar lines | 352 / 352 | bar-line presence measures nothing either |
| code fences, or prose inside the body | 0 / 352 | no fence-stripping or prose-detection needed |
| exactly 8 quoted chords, one per measure | 337 / 352 | chord *count* is nearly always right |
| **melody-table tokens pasted into the body** | **165 / 352** | **this is the entire discriminating axis** |

**The body is the only thing worth validating.** A validator that checks headers and bar lines
would pass 100% of this corpus and measure nothing at all.

## Grammar to accept (ABC subset sufficient for a lead sheet)

Tune body, after the `K:` header line. Whitespace and line breaks are separators.

- **Chord annotation** — a double-quoted string at a bar's start. Content is validated by the
  existing chord vocabulary, NOT by this validator. Out of scope here.
- **Bar lines** — `|`  `||`  `|]`  `[|`  `|:`  `:|`  `::`
- **Note** — optional accidental, then pitch, then optional octave marks, then optional duration:
  - accidental: `^`  `^^`  `_`  `__`  `=`
  - pitch: `A`–`G` (lower octave), `a`–`g` (upper octave)
  - octave: any run of `,` or `'`
  - duration: digits, or `/`, or digits `/` digits (e.g. `2`, `/2`, `3/2`, `/`)
- **Rest** — `z`, `x`, or `Z`, each with optional duration
- **Simultaneity (chord)** — `[` one or more notes `]`, with optional duration
- **Tie / slur** — `-`, `(`, `)`
- **Tuplet** — `(` digit
- **Broken rhythm** — `<`, `>`
- **Grace notes** — `{` notes `}`
- **Decoration** — `!` word `!`, or `.` `~` `H` `L` `M` `O` `P` `S` `T` `u` `v`
- **Inline field** — `[` letter `:` text `]` (e.g. `[K:G]`)

Anything else is an error.

## What this rejects, and why it is the right call

- `C4+E4:h` — the `+` is not an ABC operator (simultaneity is `[CEG]`), and `:h` is not a
  duration. **Note carefully that `C4` alone IS valid ABC** — pitch C, duration 4 — so a naive
  "digit after pitch" rule would be wrong. The melody-table tokens fail on `+` and on `:`,
  never on the digit.
- `C#4` — ABC spells sharps `^C`, not `C#`. `#` is not a legal body character.
- `:w` `:h` `:q` `:e` `:s` `:qt` `:ht` `:et` — none are ABC durations.

## Acceptance criteria

1. **Deterministic and pure.** No I/O, no clock, no randomness. Unit-testable in isolation.
2. **Every rejection carries a position and the offending character.** A rejection with no
   position is a bug, because it is indistinguishable from a dead branch.
3. **Dead-branch guard.** Every token type in the grammar above has at least one test that
   *accepts* via that branch and one that *rejects* just past it. This is the specific test that
   the `0x08` defect would have failed.
4. **Run against the 352 committed completions**, and publish the accept/reject split alongside
   a per-rejection reason histogram.
5. **ANTI-GOODHART, AND THIS ONE IS BINDING: correctness is NOT judged by whether the validator
   reproduces 0.528, or by whether the resulting *p* lands in [0.15, 0.85].** It is judged by
   manual audit of a stratified sample — at minimum 20 accepted and 20 rejected bodies, read by
   a human or a different model family, confirming each verdict is musically right. Tuning the
   validator until *p* lands in the window is the exact move this arc has spent eleven documented
   instances learning not to make. **If the honest validator puts *p* outside the window, that is
   a finding about the substrate, and it gets reported as one.**

## Out of scope

Chord-symbol vocabulary (owned by `parseAbcChords` and the voicer), musical quality of the
reharmonization (owned by `verifyHarmony`), and whether the melody in the body matches the
prompt's melody. This validator answers one question: **is this body ABC at all.**

## Where it goes

`src/maker/abc-syntax.ts`, exported as `validateAbcBody(body: string): { ok: true } | { ok: false; index: number; char: string; reason: string }`,
with `score-er-probe.mts` calling it in place of `wellFormedAbc`. Additive — nothing in the
shipped reharmonization path changes, because the frozen E-R gate is unaffected by it.
