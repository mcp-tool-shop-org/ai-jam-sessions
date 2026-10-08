\version "2.24.0"
\language "english"

\header {
  title = "America the Beautiful"
  subtitle = "for solo piano"
  poet = "Words: Katharine Lee Bates"
  composer = "Tune: Materna (Samuel A. Ward)"
  arranger = "Arrangement: ai-jam-sessions"
  copyright = "CC0 1.0"
  tagline = ##f
}

upper = {
  \clef treble
  \key c \major
  \time 4/4
  \tempo 4 = 92

  % ---- Introduction ----
  r2. <e' g' c''>4\mf |
  <f' a' c''>4. <f' a'>8 <f' a'>4 <f' a' c''>4 |
  <e' g' c''>4. <e' g'>8 <e' g'>4 <e' g'>4 |
  <c' f' a'>4 <f' a' c''>4 <c' e' g'>4 <f' b' d''>4 |
  <e' g' c''>2. r4 |

  % ---- Verse 1 (p, simple and chordal) ----
  r2. g'4\p |
  <e' g'>4. <c' e'>8 <c' e'>4 <e' g'>4 |
  <d' g'>4. <b d'>8 <b d'>4 <b e'>4 |
  <d' f'>4 <d' g'>4 <f' a'>4 <f' b'>4 |
  <e' g'>2. <d' g'>4 |
  <e' g'>4. <c' e'>8 <c' e'>4 <e' g'>4 |
  <d' g'>4. <b d'>8 <b d'>4 <g' b' d''>4 |
  <a' cs''>4 <a' d''>4 <fs' c'' e''>4 <fs' a'>4 |
  <g' b' d''>2. <d' g'>4 |
  <g' c'' e''>4.\< <g' c'' e''>8 <g' d''>4 <e' g' c''>4 |
  <d' g' c''>4. <d' g' b'>8 <d' g' b'>4 <e' g' c''>4 |
  <g' b' d''>4 <d' g' b'>4 <c' f' a'>4 <d' f' g'>4 |
  <e' g' c''>2.\! <e' g' bf' c''>4 |
  <f' a' c''>4.\p <f' a'>8 <f' a'>4 <f' a' c''>4 |
  <e' g' c''>4. <e' g'>8 <e' g'>4 <e' g'>4 |
  <c' f' a'>4 <f' a' c''>4 <c' e' g'>4 <f' b' d''>4 |
  <e' g' c''>2. r4 |

  % ---- Verse 2 (mp, fuller chords over flowing left hand) ----
  r2. <e' g'>4\mp |
  <c' e' g'>4. <g c' e'>8 <g c' e'>4 <c' e' g'>4 |
  <b d' g'>4. <g b d'>8 <g b d'>4 <g b e'>4 |
  <b d' f'>4 <b d' g'>4 <d' f' a'>4 <d' f' b'>4 |
  <c' e' g'>2. <b d' g'>4 |
  <c' e' g'>4. <g c' e'>8 <g c' e'>4 <c' e' g'>4 |
  <b d' g'>4. <g b d'>8 <g b d'>4 <g' b' d''>4 |
  <e' a' cs''>4 <e' a' d''>4 <fs' c'' e''>4 <d' fs' a'>4 |
  <g' b' d''>2. <b d' g'>4 |
  <g' c'' e''>4.\< <g' c'' e''>8 <g' d''>4 <e' g' c''>4 |
  <d' g' c''>4. <d' g' b'>8 <d' g' b'>4 <e' g' c''>4 |
  <g' b' d''>4 <d' g' b'>4 <c' f' a'>4 <d' f' g'>4 |
  <e' g' c''>2.\! <e' g' bf' c''>4 |
  <f' a' c''>4.\mp <c' f' a'>8 <c' f' a'>4 <f' a' c''>4 |
  <e' g' c''>4. <c' e' g'>8 <c' e' g'>4 <c' e' g'>4 |
  <c' f' a'>4 <f' a' c''>4 <c' e' g'>4 <f' b' d''>4 |
  <e' g' c''>2. r4 |

  % ---- Verse 3 (mf, melody in octaves over a moving bass) ----
  r2. <g' g''>4\mf |
  <g' c'' g''>4. <e' g' e''>8 <e' g' e''>4 <g' c'' g''>4 |
  <g' d'' g''>4. <d' g' d''>8 <d' g' d''>4 <e' g' e''>4 |
  <f' d'' f''>4 <g' d'' g''>4 <a' f'' a''>4 <b' f'' b''>4 |
  <g' c'' g''>2. <g' d'' g''>4 |
  <g' c'' g''>4. <e' g' e''>8 <e' g' e''>4 <g' c'' g''>4 |
  <g' d'' g''>4. <d' g' d''>8 <d' g' d''>4 <d'' g'' d'''>4 |
  <cs'' e'' cs'''>4 <d'' a'' d'''>4 <e'' a'' e'''>4 <a' d'' a''>4 |
  <d'' g'' d'''>2. <g' d'' g''>4 |
  <e'' g'' e'''>4.\< <e'' g'' e'''>8 <d'' g'' d'''>4 <c'' g'' c'''>4 |
  <c'' g'' c'''>4. <b' g'' b''>8 <b' g'' b''>4 <c'' g'' c'''>4 |
  <d'' g'' d'''>4 <b' g'' b''>4 <a' c'' a''>4 <g' d'' g''>4 |
  <c'' g'' c'''>2.\! <c'' e'' bf'' c'''>4 |
  <c'' a'' c'''>4.\mf <a' c'' a''>8 <a' c'' a''>4 <c'' a'' c'''>4 |
  <c'' g'' c'''>4. <g' c'' g''>8 <g' c'' g''>4 <g' c'' g''>4 |
  <a' c'' a''>4 <c'' a'' c'''>4 <g' c'' g''>4 <d'' f'' d'''>4 |
  <c'' g'' c'''>2. r4 |

  % ---- Verse 4 (f to ff, octaves over full chords) ----
  r2. <g' c'' e'' g''>4\f |
  <g' c'' e'' g''>4. <e' g' c'' e''>8 <e' g' c'' e''>4 <g' c'' e'' g''>4 |
  <g' b' d'' g''>4. <d' g' b' d''>8 <d' g' b' d''>4 <e' g' b' e''>4 |
  <f' b' d'' f''>4 <g' b' d'' g''>4 <a' d'' f'' a''>4 <b' d'' f'' b''>4 |
  <g' c'' e'' g''>2. <g' b' d'' g''>4 |
  <g' c'' e'' g''>4. <e' g' c'' e''>8 <e' g' c'' e''>4 <g' c'' e'' g''>4 |
  <g' b' d'' g''>4. <d' g' b' d''>8 <d' g' b' d''>4 <d'' g'' b'' d'''>4 |
  <cs'' e'' g'' cs'''>4 <d'' e'' a'' d'''>4 <e'' a'' c''' e'''>4 <a' d'' fs'' a''>4 |
  <d'' g'' b'' d'''>2. <g' b' d'' g''>4 |
  <e'' g'' c''' e'''>4.\< <e'' g'' c''' e'''>8 <d'' g'' c''' d'''>4 <c'' e'' g'' c'''>4 |
  <c'' d'' g'' c'''>4. <b' d'' g'' b''>8 <b' d'' g'' b''>4 <c'' e'' g'' c'''>4 |
  <d'' g'' b'' d'''>4 <b' d'' g'' b''>4 <a' c'' f'' a''>4 <g' b' d'' g''>4 |
  <c'' e'' g'' c'''>2.\ff <c'' e'' g'' bf'' c'''>4 |
  <c'' f'' a'' c'''>4. <a' c'' f'' a''>8 <a' c'' f'' a''>4 <c'' f'' a'' c'''>4 |
  <c'' e'' g'' c'''>4. <g' c'' e'' g''>8 <g' c'' e'' g''>4 <g' c'' e'' g''>4 |
  <a' c'' f'' a''>4 <c'' f'' a'' c'''>4 <g' c'' e'' g''>4 <d'' f'' b'' d'''>4 |
  <c'' e'' g'' c'''>2. r4 |

  % ---- Coda (broadened) ----
  \tempo 4 = 82
  <f' a' c'' f''>2\ff <e' g' c'' e''>2 |
  \tempo 4 = 76
  <f' b' d'' f''>2 <e' g' c'' e''>2 |
  \tempo 4 = 68
  <g' c'' e'' g''>1 ~ |
  <g' c'' e'' g''>1 \bar "|."
}

lower = {
  \clef bass
  \key c \major

  % ---- Introduction ----
  <c, g, c>2. <bf, e g>4 |
  <f,, f,>2 <f, c f a>2 |
  <c, c>2 <g, c e g>2 |
  <f,, f,>2 <g,, g,>4 <g,, g,>4 |
  <c, g, c e>1 |

  % ---- Verse 1 ----
  <c, c>2. <c e g>4 |
  <c, c>2 <g, c e>2 |
  <g,, g,>2. <e, b, e>4 |
  <g,, g,>2 <g, b, f>2 |
  <c, g, c>2. <g,, g,>4 |
  <c, c>2. <a,, a,>4 |
  <g,, g,>2 <g, b, d>2 |
  <a,, a,>2 <d, d>2 |
  <g,, g,>2. <g, b, d>4 |
  <c, c>2 <g, c e>2 |
  <g,, g,>2. <c, c>4 |
  <g,, g,>2 <f,, f,>4 <g,, g,>4 |
  <c, c>2. <bf,, bf,>4 |
  <f,, f,>2 <f, a, c>2 |
  <c, c>2 <g, c e>2 |
  <f,, f,>2 <g,, g,>4 <g,, g,>4 |
  <c, g, c e>2. <g, c e>4 |

  % ---- Verse 2 (flowing broken chords) ----
  c8 g, e g, c g, <g, c e>4 |
  c8 g, e g, c g, e g, |
  g,8 d b, d g, d e b, |
  g,8 d b, d g, d f d |
  c8 g, e g, c g, g, d |
  c8 g, e g, c g, a, e |
  g,8 d b, d g, d b, d |
  a,8 e cs e d a, fs c |
  g,8 d b, d g, d b, d |
  c8 g, e g, c g, e g, |
  g,8 d b, d g, d c e |
  g,8 d b, d f a g, b, |
  c8 g, e g, c g, bf, g |
  f,8 c a, c f, c a, c |
  c8 g, e g, c g, e g, |
  f,8 c a, c g, e g, f |
  c8 g, e g, c g, e g, |

  % ---- Verse 3 (moving bass with chord stabs) ----
  c,4 e, g, <c e g>4 |
  c,4 <g, c e>4 c4 <g, c e>4 |
  g,,4 <g, b, d>4 g,4 <e, b, e>4 |
  g,,4 <g, b, f>4 b,,4 <g, b, f>4 |
  c,4 <g, c e>4 c4 <g, b, d>4 |
  c,4 <g, c e>4 c4 <a, c e>4 |
  g,,4 <g, b, d>4 g,4 <g, b, d>4 |
  a,,4 <a, cs g>4 d,4 <d fs c'>4 |
  g,,4 <g, b, d>4 g,4 <g, b, d>4 |
  c,4 <g, c e>4 e,4 <g, c e>4 |
  g,,4 <g, b, d>4 g,,4 <c e g>4 |
  g,,4 <g, b, d>4 f,,4 <g, b, f>4 |
  c,4 <g, c e>4 c4 <bf, e g>4 |
  f,,4 <f, a, c>4 f,4 <f, a, c>4 |
  c,4 <g, c e>4 c4 <g, c e>4 |
  f,,4 <f, a, c>4 g,,4 <g, b, f>4 |
  c,4 <g, c e>4 <c, g, c>2 |

  % ---- Verse 4 (octave bass, full chords, moving bass) ----
  <c, c>2. <c e g c'>4 |
  <c, c>4 <g, c e g>4 <e, e>4 <g, c e g>4 |
  <g,, g,>4 <g, b, d g>4 <g,, g,>4 <e, b, e g>4 |
  <g,, g,>4 <g, b, f g>4 <b,, b,>4 <g, b, f g>4 |
  <c, c>4 <g, c e g>4 <c, c>4 <g, b, d g>4 |
  <c, c>4 <g, c e g>4 <c, c>4 <a, c e a>4 |
  <g,, g,>4 <g, b, d g>4 <d, d>4 <g, b, d g>4 |
  <a,, a,>4 <a, cs e g>4 <d, d>4 <d fs a c'>4 |
  <g,, g,>4 <g, b, d g>4 <b,, b,>4 <g, b, d g>4 |
  <c, c>4 <g, c e g>4 <e, e>4 <g, c e g>4 |
  <g,, g,>4 <g, b, d g>4 <g,, g,>4 <c e g c'>4 |
  <g,, g,>4 <g, b, d g>4 <f,, f,>4 <g, b, f g>4 |
  <c, c>4 <g, c e g>4 <c, c>4 <bf,, bf,>4 |
  <f,, f,>4 <f, a, c f>4 <c, c>4 <f, a, c f>4 |
  <c, c>4 <g, c e g>4 <e, e>4 <g, c e g>4 |
  <f,, f,>4 <f, a, c f>4 <g,, g,>4 <g, b, f g>4 |
  <c, c>4 <g, c e g>4 <c, g, c e>2 |

  % ---- Coda ----
  <f,, f,>2 <c, c>2 |
  <g,, g,>2 <c, c>2 |
  <c, g, c e>1 ~ |
  <c, g, c e>1 \bar "|."
}

\score {
  \new PianoStaff <<
    \new Staff = "upper" { \upper }
    \new Staff = "lower" { \lower }
  >>
  \layout { }
  \midi { }
}
