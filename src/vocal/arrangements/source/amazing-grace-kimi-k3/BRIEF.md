# Arrange "Amazing Grace" (tune: New Britain) for solo grand piano

Write a complete arrangement for solo grand piano, the whole hymn through, as one LilyPond 2.24 file. It will be
this project's exemplar: rendered on a sampled Yamaha C5 grand and published, with a singer performing the hymn
over it. It must sound rich, warm and expressive, and it must compile without errors or warnings.

## The source you must follow

The tune is New Britain, the American folk tune first printed in 1829 (Virginia Harmony) and set to John
Newton's words in 1835 (Southern Harmony): public domain. Below is the melody and harmony you must follow, in
G major, 3/4, as LilyPond absolute pitches with English note names (`g'` is G4, `d''` is D5). A pair joined with
`(` `)` is one syllable sung over two notes. Do not use any later version of the hymn: no "familiar"
20th-century harmonisations, reharmonisations, countermelodies or modulations.

The exact melody of one verse, bar by bar (3/4; durations in LilyPond notation), with its harmony:

```
upbeat:  d'4                      (beat 3 of the bar before)
bar 1:   g'2 b'8( g'8)            G
bar 2:   b'2 a'4                  G (beats 1-2), D (beat 3)
bar 3:   g'2 e'4                  C
bar 4:   d'2 d'4                  G
bar 5:   g'2 b'8( g'8)            G
bar 6:   b'2 a'4                  G (beats 1-2), D (beat 3)
bar 7:   d''2 b'4                 D (beats 1-2), G (beat 3)
bar 8:   d''4.( b'8) d''8( b'8)   G
bar 9:   g'2 d'4                  G
bar 10:  e'4.( g'8) g'8( e'8)     C
bar 11:  d'2 d'4                  G
bar 12:  g'2 b'8( g'8)            G
bar 13:  b'2 a'4                  G/D (beats 1-2), D7 (beat 3)
bar 14:  g'2.                     G
```

The last d'4 of bar 4 and of bar 11 are upbeats inside the verse. Bar 14 holds the last syllable ("see" in
verse 1) for the whole bar, so each following verse begins with a bar of its own: two beats where the singer
breathes and the piano carries on, and that verse's upbeat d'4 on beat 3.

The four stanzas (one pass each):

1. Amazing grace! how sweet the sound / That saved a wretch like me! / I once was lost, but now am found, / Was blind, but now I see.
2. 'Twas grace that taught my heart to fear, / And grace my fears relieved; / How precious did that grace appear / The hour I first believed!
3. Through many dangers, toils and snares, / I have already come; / 'Tis grace hath brought me safe thus far, / And grace will lead me home.
4. When we've been there ten thousand years, / Bright shining as the sun, / We've no less days to sing God's praise / Than when we first begun.

## The shape

1. **Introduction**: the last phrase (upbeat d'4, then bars 12-14: g'2 b'8( g'8) | b'2 a'4 | g'2.), voiced for
   full piano, then one bar whose third beat is verse 1's upbeat d'4.
2. **Four passes of the verse**, one for each stanza, each with its own accompaniment, building from quiet to
   full and back:
   - verse 1, *p*, simple and chordal, close to a hymnal setting;
   - verse 2, *mp*, flowing broken chords in the left hand (a gentle 3/4 lilt);
   - verse 3, *mf*, fuller, the melody in octaves in the right hand, a walking bass;
   - verse 4, *f* rising to *ff* at "sing God's praise", then easing to *mp* for the last line.
3. **Coda**: two to four bars after the last "begun", a final plagal (C to G) cadence, broadened, ending on a
   full G major chord, *p*, let ring.

**The melody must sound in every pass, every note, at exactly the written rhythm and position, as the top voice
of the right hand** (in octaves where you double it). A singer performs over this and must find each of their
notes in the piano at the same moment. You may vary everything around it: texture, voicing, inner voices, bass
lines, the register of the accompaniment. Never change the melody's notes or rhythm, or the harmony's roots.

## LilyPond rules (the file is compiled and played by machine)

- `\version "2.24.0"` and `\language "english"`.
- One `\score` with a `\new PianoStaff << \new Staff = "upper" { … } \new Staff = "lower" { … } >>`, and both a
  `\layout { }` and a `\midi { }` block.
- `\tempo 4 = 72` at the start and steady through the four passes; the coda may broaden with explicit `\tempo`
  changes (the MIDI has no rit.).
- Dynamics and hairpins on the upper staff only, with a `\new Dynamics` context if you like; they drive the MIDI
  velocities.
- **No sustain pedal marks.** Write sustained sound out as note lengths and ties, so the notes themselves carry
  the resonance.
- `\time 3/4` once. `\partial 4` once, at the very start of the piece (the introduction's upbeat). Every later
  bar is complete: each verse's upbeat d'4 is beat 3 of the bar before that verse's bar 1, as described above.
- No repeats (write each pass out), no grace notes, no tuplets, no `\ottava`, and no text that could fail to
  parse.
- Range A0 to C8. At most ten notes sounding at once, and hands a pianist could play.
- `\header` with `title = "Amazing Grace"`, `subtitle = "for solo piano"`,
  `poet = "Words: John Newton (1779)"`, `composer = "Tune: New Britain (American, 1829)"`,
  `arranger = "Arrangement: ai-jam-sessions"`, `copyright = "CC0 1.0"`, and `tagline = ##f`.

Output only the LilyPond file.
