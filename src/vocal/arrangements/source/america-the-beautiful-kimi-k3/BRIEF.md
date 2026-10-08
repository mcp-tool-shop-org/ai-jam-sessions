# Arrange "America the Beautiful" (tune: Materna) for solo grand piano

Write a complete arrangement for solo grand piano, the whole hymn through, as one LilyPond 2.24 file. It will be
this project's exemplar: rendered on a sampled Yamaha C5 grand and published, with a singer performing the hymn
over it. It must sound rich, warm and expressive, and it must compile without errors or warnings.

## The source you must follow

The tune is Materna by Samuel A. Ward; the words are by Katharine Lee Bates. Both are public domain. Below are the
melody and harmony you must follow, in C major, 4/4, as LilyPond absolute pitches with English
note names (`c'` is middle C). Notes joined with `(` `)` are one syllable sung over several notes; `~` is a tie.
Do not use any later version of the hymn: no "familiar" 20th-century harmonisations, reharmonisations,
countermelodies or modulations.

The music of one verse, bar by bar:

```
bar  0:  r2. g'4                             C
bar  1:  g'4. e'8 e'4 g'4                    C
bar  2:  g'4. d'8 d'4 e'4                    G (beats 1-3), Em (beat 4)
bar  3:  f'4 g'4 a'4 b'4                     G7
bar  4:  g'2. g'4                            C (beats 1-3), G (beat 4)
bar  5:  g'4. e'8 e'4 g'4                    C (beats 1-3), Am (beat 4)
bar  6:  g'4. d'8 d'4 d''4                   G
bar  7:  cs''4 d''4 e''4 a'4                 A7 (beats 1-2), D7 (beats 3-4)
bar  8:  d''2. g'4                           G
bar  9:  e''4. e''8 d''4 c''4                C
bar 10:  c''4. b'8 b'4 c''4                  G (beats 1-3), C (beat 4)
bar 11:  d''4 b'4 a'4 g'4                    G (beats 1-2), F (beat 3), G7 (beat 4)
bar 12:  c''2. c''4                          C (beats 1-3), C7 (beat 4)
bar 13:  c''4. a'8 a'4 c''4                  F
bar 14:  c''4. g'8 g'4 g'4                   C
bar 15:  a'4 c''4 g'4 d''4                   F (beats 1-2), C/G (beat 3), G7 (beat 4)
bar 16:  c''2. r4                            C
```

Bar 0 is the bar before the verse's first full bar: its rests are where the singer is silent and the piano plays
on, and its notes are the verse's upbeat. Each verse begins with its own bar 0: write it as a complete bar, the
last bar before that verse (the end of the introduction, or a bar after the previous verse's last note).

The 4 stanzas (one pass each):

1. O beautiful for spacious skies for amber waves of grain for purple mountain majesties above the fruited plain America America God shed his grace on thee and crown thy good with brotherhood from sea to shining sea
2. O beautiful for pilgrim feet whose stern impassioned stress a thoroughfare for freedom beat across the wilderness America America God mend thine ev'ry flaw confirm thy soul in selfcontrol thy liberty in law
3. O beautiful for heroes proved in liberating strife who more than self their country loved and mercy more than life America America may God thy gold refine till all success be nobleness and ev'ry gain divine
4. O beautiful for patriot dream that sees beyond the years thine alabaster cities gleam undimmed by human tears America America God shed his grace on thee and crown thy good with brotherhood from sea to shining sea

## The shape

1. **Introduction**: these bars, voiced for full piano, then verse 1's bar 0:

   ```
   bar  1:  r2. c''4                            C (beats 1-3), C7 (beat 4)
   bar  2:  c''4. a'8 a'4 c''4                  F
   bar  3:  c''4. g'8 g'4 g'4                   C
   bar  4:  a'4 c''4 g'4 d''4                   F (beats 1-2), C/G (beat 3), G7 (beat 4)
   bar  5:  c''2. r4                            C
   ```
2. **4 passes of the verse**, one for each stanza, each with its own accompaniment, building
   from quiet to full:
   - verse 1, *p*, simple and chordal, close to a hymnal setting;
   - verse 2, *mp*, flowing broken chords in the left hand;
   - verse 3, *mf*, fuller: the melody in octaves in the right hand over a moving bass;
   - verse 4, *f* to *ff*, the melody in octaves over full chords and a moving bass;
3. **Coda**: two to four bars after the last verse, a final cadence, broadened, ending on a full tonic chord,
   let ring.

**The melody must sound in every pass, every note, at exactly the written rhythm and position, as the top voice
of the right hand** (in octaves where you double it). A singer performs over this and must find each of their
notes in the piano at the same moment. You may vary everything around it: texture, voicing, inner voices, bass
lines, the register of the accompaniment. Never change the melody's notes or rhythm, or the harmony's roots.
Give every verse its own accompaniment: no two passes alike.

## LilyPond rules (the file is compiled and played by machine)

- `\version "2.24.0"` and `\language "english"`; the key as `\key c \major` (with the backslash before the mode).
- One `\score` with a `\new PianoStaff << \new Staff = "upper" { … } \new Staff = "lower" { … } >>`, and both a
  `\layout { }` and a `\midi { }` block.
- `\tempo 4 = 92` at the start and steady through every pass; the coda may broaden with explicit `\tempo`
  changes (the MIDI has no rit.).
- Dynamics and hairpins on the upper staff only, with a `\new Dynamics` context if you like; they drive the MIDI
  velocities.
- **No sustain pedal marks.** Write sustained sound out as note lengths and ties, so the notes themselves carry
  the resonance.
- `\time 4/4` once. **No `\partial` anywhere**: the piece starts on a downbeat and every bar is
  complete (an upbeat is the end of a full bar, as above).
- No repeats (write each pass out), no grace notes, no tuplets, no `\ottava`, and no text that could fail to
  parse.
- Range A0 to C8. At most ten notes sounding at once, and hands a pianist could play.
- `\header` with `title = "America the Beautiful"`, `subtitle = "for solo piano"`, `poet = "Words: Katharine Lee Bates"`,
  `composer = "Tune: Materna (Samuel A. Ward)"`, `arranger = "Arrangement: ai-jam-sessions"`,
  `copyright = "CC0 1.0"`, and `tagline = ##f`.

Output only the LilyPond file.
