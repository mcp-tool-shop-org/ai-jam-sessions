---
description: Start a piano teaching session for a specific song. Use when the user wants to learn, practice, or get teaching guidance for a piano piece.
argument-hint: "[song-id or song name]"
disable-model-invocation: true
---

# Piano Teaching Session

Start a structured teaching session for the song "$ARGUMENTS".

## Steps

1. **Find the song.** Use `list_songs` to search for the song if the user gave a
   partial name or description instead of an exact ID. If no match, suggest
   alternatives with `suggest_song`.

2. **Get full song info.** Call `song_info` with the song ID. Present the key
   details to the student: title, composer, key, tempo, difficulty, duration,
   and the musical description.

3. **Present the teaching goals.** Read the teaching goals and style tips from the
   song info. Frame them as what the student will focus on today.

4. **Walk through key moments.** Highlight the key moments from the song info.
   Explain each one in plain language so the student knows what to listen for
   and what makes each passage special.

5. **Build a practice plan.** Call `practice_setup` with the song ID to get
   recommended speed, mode, and CLI commands. Present the practice progression
   (start slow, increase speed, switch modes).

6. **Offer measure-by-measure teaching.** Ask if the student wants to walk through
   specific measures. If yes, use `teaching_note` to get the teaching note,
   fingering, and dynamics for each measure they ask about. Use `list_measures`
   to show an overview of a range.

7. **Offer sing-along.** Ask if the student wants to hear the notes before playing.
   If yes, call `sing_along` with their preferred mode (note-names, solfege,
   contour, or syllables). Explain each mode briefly so they can choose.

## Tone

Be encouraging and patient. Celebrate what the student already knows. Frame
challenges as opportunities rather than obstacles. Adjust your language to the
song's difficulty level — simpler explanations for beginner songs, more
technical depth for advanced pieces.
