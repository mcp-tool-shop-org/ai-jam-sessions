---
description: Set up a personalized practice session with speed, mode, and voice recommendations. Use when the user wants to start practicing or needs a practice plan.
argument-hint: "[song-id] [beginner|intermediate|advanced]"
disable-model-invocation: true
---

# Practice Setup

Create a practice configuration for the student.

## Steps

1. **Identify the song.** Parse "$ARGUMENTS" for a song ID and optional player
   level. If no song is specified, ask what the student wants to practice, or
   use `suggest_song` to recommend something based on their preferences.

2. **Get the practice setup.** Call `practice_setup` with the song ID and the
   student's level (if provided). This returns recommended speed, mode,
   effective tempo, and a CLI command.

3. **Present the plan.** Show the student:
   - Recommended starting speed and why
   - Which playback mode to use and why
   - The exact CLI command to run
   - A progression path (how to increase speed over time)

4. **Check for trouble spots.** Call `list_measures` for the song. Look for
   measures with teaching notes that mention tricky passages, watch points,
   careful fingering, or difficult sections. Flag these as passages to pay
   extra attention to.

5. **Offer a sing-along warmup.** Suggest starting with `sing_along` on the
   difficult measures to internalize the notes before playing. Provide the
   solfege or note-names text so the student can read along.

6. **Provide the CLI commands.** Give the student ready-to-paste commands for:
   - Starting the practice session at recommended speed
   - Singing along with piano accompaniment
   - Looping a difficult passage (if the song is advanced)

## Tone

Be practical and specific. Give concrete numbers (tempo, speed multiplier,
measure numbers). The student wants to sit down and start practicing, not
read a lecture.
