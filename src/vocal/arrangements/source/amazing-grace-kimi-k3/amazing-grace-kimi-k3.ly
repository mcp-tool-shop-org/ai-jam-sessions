\version "2.24.0"
\language "english"

\header {
  title = "Amazing Grace"
  subtitle = "for solo piano"
  poet = "Words: John Newton (1779)"
  composer = "Tune: New Britain (American, 1829)"
  arranger = "Arrangement: ai-jam-sessions"
  copyright = "CC0 1.0"
  tagline = ##f
}

verseMel = {
  g'2 b'8( g'8) |
  b'2 a'4 |
  g'2 e'4 |
  d'2 d'4 |
  g'2 b'8( g'8) |
  b'2 a'4 |
  d''2 b'4 |
  d''4.( b'8) d''8( b'8) |
  g'2 d'4 |
  e'4.( g'8) g'8( e'8) |
  d'2 d'4 |
  g'2 b'8( g'8) |
  b'2 a'4 |
  g'2. |
}

innerOne = {
  <b d'>2 <d'>4 |
  <d' g'>2 <d' fs'>4 |
  <c' e'>2 <c'>4 |
  <g b>2 <g b>4 |
  <b d'>2 <d'>4 |
  <d' g'>2 <d' fs'>4 |
  <fs' a'>2 <d' g'>4 |
  <g' b'>4. <d' g'>8 <g' b'>8 <d' g'>8 |
  <b d'>2 <g b>4 |
  <c'>4. <c' e'>8 <c' e'>8 <c'>8 |
  <g b>2 <g b>4 |
  <b d'>2 <d'>4 |
  <d' g'>2 <c' d' fs'>4 |
  <b d'>2. |
}

verseOct = {
  <g g'>2 <b b'>8( <g g'>8) |
  <b b'>2 <a a'>4 |
  <g g'>2 <e e'>4 |
  <d d'>2 <d d'>4 |
  <g g'>2 <b b'>8( <g g'>8) |
  <b b'>2 <a a'>4 |
  <d' d''>2 <b b'>4 |
  <d' d''>4.( <b b'>8) <d' d''>8( <b b'>8) |
  <g g'>2 <d d'>4 |
  <e e'>4.( <g g'>8) <g g'>8( <e e'>8) |
  <d d'>2 <d d'>4 |
  <g g'>2 <b b'>8( <g g'>8) |
  <b b'>2 <a a'>4 |
  <g g'>2. |
}

gBroken = { g,,4 d,8 g,8 b,8 g,8 }
cBroken = { c,,4 g,,8 c,8 e,8 c,8 }

upper = {
  \key g \major
  \time 3/4
  \tempo 4 = 72
  \partial 4
  <g b d'>4 |
  <b d' g'>2 <d' g' b'>8( <b d' g'>8) |
  <d' g' b'>2 <d' fs' a'>4 |
  <g b d' g'>2. |
  <d' g' b'>2 <g b d'>4 |

  << { \verseMel } \\ { \innerOne } >>
  <d' g' b'>2 <g b d'>4 |

  << { \verseMel } \\ { \innerOne } >>
  <d' g' b'>2 <g b d'>4 |

  \verseOct
  <d' g' b'>2 <g b d'>4 |

  <b d' g'>2 <d' g' b'>8( <b d' g'>8) |
  <d' g' b'>2 <d' fs' a'>4 |
  <c' e' g'>2 <g c' e'>4 |
  <g b d'>2 <g b d'>4 |
  <b d' g'>2 <d' g' b'>8( <b d' g'>8) |
  <d' g' b'>2 <d' fs' a'>4 |
  <fs' a' d''>2 <d' g' b'>4 |
  <g' b' d''>4.( <d' g' b'>8) <g' b' d''>8( <d' g' b'>8) |
  <b d' g'>2 <g b d'>4 |
  <g c' e'>4.( <c' e' g'>8) <c' e' g'>8( <g c' e'>8) |
  <g b d'>2 <g b d'>4 |
  <b d' g'>2 <d' g' b'>8( <b d' g'>8) |
  <d' g' b'>2 <c' d' fs' a'>4 |
  <g b d' g'>2. |

  \tempo 4 = 66
  <c' e' g'>2. |
  \tempo 4 = 60
  <d' g' b'>2. |
  \tempo 4 = 54
  <g b d' g'>2. |
  \bar "|."
}

lower = {
  \key g \major
  <g,, g,>4 |
  <g,, g,>2 <g, d>4 |
  <g,, g,>2 <d,, d,>4 |
  <g,, d, g,>2. |
  <g,, g,>2 <d, g,>4 |

  <g,, g,>2 <g, d>4 |
  <g,, g,>2 <d,, d,>4 |
  <c,, c,>2 <c, g,>4 |
  <g,, g,>2 <g, d>4 |
  <g,, g,>2 <g, d>4 |
  <g,, g,>2 <d,, d,>4 |
  <d,, d,>2 <g,, g,>4 |
  <g,, g,>2. |
  <g,, g,>2 <g, d>4 |
  <c,, c,>2. |
  <g,, g,>2 <g, d>4 |
  <g,, g,>2 <g, d>4 |
  <d,, d,>2 <d,, d,>4 |
  <g,, g,>2. |
  <g,, g,>2 <d, g,>4 |

  \gBroken |
  g,,4 d,8 g,8 d,,8 d,8 |
  \cBroken |
  \gBroken |
  \gBroken |
  g,,4 d,8 g,8 d,,8 d,8 |
  d,,4 a,,8 d,8 g,,8 g,8 |
  <g,, g,>2. |
  \gBroken |
  \cBroken |
  \gBroken |
  \gBroken |
  d,,2 <d,, a,, d,>4 |
  <g,, g,>2. |
  <g,, g,>2 <d, g,>4 |

  <g,, g,>4 b,,4 d,4 |
  <g,, g,>4 b,,4 <d,, d,>4 |
  <c,, c,>4 e,4 g,4 |
  <g,, g,>4 b,,4 d,4 |
  <g,, g,>4 b,,4 d,4 |
  <g,, g,>4 b,,4 <d,, d,>4 |
  <d,, d,>4 fs,,4 <g,, g,>4 |
  <g,, g,>4 b,,4 d,4 |
  <g,, g,>4 b,,4 d,4 |
  <c,, c,>4 e,4 g,4 |
  <g,, g,>4 b,,4 d,4 |
  <g,, g,>4 b,,4 d,4 |
  <d,, d,>4 b,,4 <d,, d,>4 |
  <g,, g,>2. |
  <g,, g,>2 <d, g, b,>4 |

  <g,, g,>2 <g, b, d>4 |
  <g,, g,>2 <d,, d,>4 |
  <c,, c,>2 <c, e, g,>4 |
  <g,, g,>2 <g, b, d>4 |
  <g,, g,>2 <g, b, d>4 |
  <g,, g,>2 <d,, d,>4 |
  <d,, d,>2 <g,, g,>4 |
  <g,, g,>2. |
  <g,, g,>2 <g, b, d>4 |
  <c,, c,>2 <c, e, g,>4 |
  <g,, g,>2 <g, b, d>4 |
  <g,, g,>2 <g, b, d>4 |
  <d,, d,>2 <d, fs, a, c>4 |
  <g,, d, g,>2. |

  <c,, g,, c,>2. |
  <d,, a,, d,>2. |
  <g,, d, g,>2. |
}

dynamics = {
  s4\mp
  s2.*4
  s2.\p s2.*14
  s2.\mp s2.*14
  s2.\mf s2.*14
  s2.\f s2.*7 s2.\< s2. s2.\ff s2. s2.\mp s2.
  s2.\p s2.*2
}

\score {
  \new PianoStaff <<
    \new Staff = "upper" { \upper }
    \new Dynamics { \dynamics }
    \new Staff = "lower" { \clef bass \lower }
  >>
  \layout { }
  \midi { }
}
