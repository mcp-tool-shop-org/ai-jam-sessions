<p align="center">
  <img src="logo.png" alt="AI Jam Session logo" width="180" />
</p>

<h1 align="center">AI Jam Session</h1>

<p align="center">
  Teach your AI to play piano.
</p>

<p align="center">
  An MCP server with a built-in audio engine, a growing song library, and a piano roll visualizer.<br/>
  Your LLM reads music sheets, composes new ones, sees what it wrote, and plays through your speakers.
</p>

[![Songs](https://img.shields.io/badge/songs-3_hand--composed-blue)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-16-purple)](https://github.com/mcp-tool-shop-org/ai_jam_session)

---

## What is this?

A piano that AI learns to play. Not a synthesizer, not a MIDI library -- a teaching instrument.

AI Jam Session gives an LLM three things:

1. **Music sheets** -- JSON files the LLM can read, compose, and reason about. Each measure has notes for both hands, teaching notes that explain the music, and style guidance.
2. **A piano roll** -- SVG visualization that lets the LLM "see" what it composed. Blue rectangles for right hand, coral for left. The LLM reads the SVG back to verify pitch accuracy, rhythm, and hand balance before playing.
3. **A piano engine** -- sample-based audio that plays through your speakers. No external software required.

The LLM doesn't just *play* music. It learns to *read* music, *compose* music, *verify* what it wrote visually, and *hear* the result. That's the loop.

## The Song Library

The library is hand-composed and growing. Every song is written note by note, verified with the piano roll, and played to confirm it sounds right. No bulk generation, no filler.

| Song | Composer | Key | Time | Measures | Difficulty |
|------|----------|-----|------|----------|------------|
| Fur Elise | Beethoven | A minor | 3/8 | 40 | intermediate |
| Gymnopedie No. 1 | Satie | D major | 3/4 | 20 | beginner |
| Clair de Lune | Debussy | Db major | 9/8 | 16 | intermediate |

More coming. The goal is a multi-genre library -- classical, jazz, blues, pop, folk, film -- where every piece has the same depth: detailed teaching notes, musical language descriptions, and style tips baked into every measure.

## Install

```bash
npm install -g @mcptoolshop/ai-jam-session
```

Requires **Node.js 18+**. That's it -- no MIDI drivers, no virtual ports, no external software.

## Quick Start

```bash
# Play a song
ai-jam-session play fur-elise

# Half-speed practice
ai-jam-session play gymnopedie-no1 --speed 0.5

# View the piano roll
ai-jam-session view clair-de-lune --out clair-de-lune.svg

# List all songs
ai-jam-session list

# Song details + teaching notes
ai-jam-session info fur-elise
```

## The Music Sheet Format

Every song is a JSON file the LLM can read and write. Here's the anatomy:

```json
{
  "id": "gymnopedie-no1",
  "title": "Gymnopedie No. 1",
  "composer": "Erik Satie",
  "genre": "classical",
  "difficulty": "beginner",
  "key": "D major",
  "tempo": 72,
  "timeSignature": "3/4",
  "musicalLanguage": {
    "description": "The first of Satie's three Gymnopedies (1888)...",
    "structure": "Simple binary: A section with variation and gentle return.",
    "keyMoments": ["Measure 3: the melody enters on F#5, floating above the chords..."],
    "teachingGoals": ["Evenness of the LH quarter-note pattern..."],
    "styleTips": ["No rubato. Satie despised rubato. Keep tempo absolutely steady."]
  },
  "measures": [
    {
      "number": 1,
      "rightHand": "R:q R:q R:q",
      "leftHand": "G2:q B3:q D4:q",
      "teachingNote": "The piece begins with the left hand alone. G major seventh chord...",
      "dynamics": "pp"
    }
  ]
}
```

### Note Format

Notes use scientific pitch notation with duration suffixes:

| Token | Meaning |
|-------|---------|
| `C4:q` | Middle C, quarter note |
| `F#5:e` | F-sharp 5, eighth note |
| `Bb3:h` | B-flat 3, half note |
| `R:e` | Eighth rest |
| `E5:w` | E5, whole note |
| `A4:s` | A4, sixteenth note |

Duration values: `w` = whole (4 beats), `h` = half (2), `q` = quarter (1), `e` = eighth (0.5), `s` = sixteenth (0.25).

Each measure's notes must add up to the time signature. In 3/4, that's 3 quarter beats. In 9/8, that's 4.5 quarter beats (nine eighth notes).

## The Piano Roll

The piano roll is the LLM's eyes. It renders any song as an SVG image:

- **X-axis**: Time (left to right), divided into beats and measures
- **Y-axis**: Pitch (bottom = low, top = high), one row per semitone
- **Blue rectangles**: Right hand notes
- **Coral rectangles**: Left hand notes
- **Grid lines**: Thin for beats, thick for measure boundaries
- **Dynamics**: pp, p, f markings shown below the grid

The LLM generates a song as JSON, renders the piano roll, reads the SVG back to check if the notes look right, then plays it. If something is wrong -- a note in the wrong octave, a rhythm that doesn't add up, hands overlapping awkwardly -- the piano roll reveals it before the first sound.

```bash
# Generate a piano roll
ai-jam-session view fur-elise --out fur-elise.svg

# View specific measures
ai-jam-session view clair-de-lune --measures 1-8 --out opening.svg
```

## LLM Tutorial: How to Use These Tools

If you're an LLM reading this, here's how the tools work together.

### Browse and learn

```
list_songs                          # See what's available
song_info { id: "fur-elise" }       # Read the musical language, teaching notes, style tips
list_measures { id: "fur-elise" }   # See every measure's notes and teaching notes
teaching_note { id: "fur-elise", measure: 5 }  # Deep dive into one measure
```

### Compose a new song

Write a JSON file following the SongEntry format. Key rules:
- Every measure's notes must fill the time signature exactly
- Use `R` for rests (they count toward the beat total)
- Include `teachingNote` on important measures -- explain what's happening musically
- Set `dynamics` where the volume changes (pp, p, mp, mf, f, ff)
- Write `musicalLanguage` that explains the piece to a student

Then add it to the library:

```
add_song { song: "<JSON string>" }
```

### Verify with the piano roll

```
view_piano_roll { songId: "my-new-song" }
```

Read the SVG. Check:
- Does the melody contour look right? (Should it rise here? Fall there?)
- Are both hands present where expected?
- Do the note durations look proportional? (Half notes should be twice as wide as quarters)
- Are there gaps or overlaps that shouldn't be there?

### Play and listen

```
play_song { id: "my-new-song" }
play_song { id: "my-new-song", speed: 0.5 }   # Slow practice
play_song { id: "my-new-song", mode: "hands" } # Hands separate
```

### The full loop

1. Study existing songs to learn the format and musical patterns
2. Compose a new piece as JSON
3. Add it to the library
4. Render the piano roll and verify visually
5. Play it and listen
6. Revise if needed

## MCP Server

The MCP server exposes 16 tools:

| Tool | What it does |
|------|--------------|
| `list_songs` | Browse/search by genre, difficulty, or keyword |
| `song_info` | Full musical language, teaching goals, key moments |
| `registry_stats` | Song counts by genre and difficulty |
| `teaching_note` | Per-measure teaching note, fingering, dynamics |
| `suggest_song` | Recommendation based on criteria |
| `list_measures` | All measures with notes and teaching notes |
| `practice_setup` | Suggested speed, mode, and practice plan |
| `sing_along` | Note names, solfege, or contour text per measure |
| `play_song` | Play through speakers (supports speed, mode, measure range) |
| `pause_playback` | Pause or resume |
| `set_speed` | Change speed during playback |
| `stop_playback` | Stop the current song |
| `ai_jam_session` | Get a jam brief for improvisation |
| `add_song` | Add a new SongEntry JSON to the library |
| `import_midi` | Convert a .mid file to SongEntry format |
| `view_piano_roll` | Render a song as SVG piano roll |

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "ai_jam_session": {
      "command": "npx",
      "args": ["-y", "-p", "@mcptoolshop/ai-jam-session", "ai-jam-session-mcp"]
    }
  }
}
```

### CLI Commands

```
ai-jam-session list [--genre <genre>] [--difficulty <level>]
ai-jam-session play <song-id> [--speed <mult>] [--tempo <bpm>] [--mode <mode>]
ai-jam-session view <song-id> [--measures <start-end>] [--out <file.svg>]
ai-jam-session info <song-id>
ai-jam-session stats
ai-jam-session sing <song-id> [--mode <note-names|solfege|contour>]
```

## Architecture

```
Songs (JSON)              MIDI files (.mid)
    |                           |
    v                           v
Note Parser               MIDI Parser
    |                           |
    v                           v
Piano Roll (SVG)    SessionController / MidiPlaybackEngine
    |                           |
    v                           v
LLM reads SVG         PlaybackController
to verify                      |
                    ┌──────────┼──────────┐
                    v          v          v
               AudioEngine  Teaching   Progress
               (speakers)   Hooks      (callbacks)
                    |
                    v
              node-web-audio-api
```

## Status

This is v0.1.0. The library is small (3 songs) and growing. The tools work. The piano roll works. The audio engine works. What's missing is breadth -- more songs, more genres, more difficulty levels.

Contributions welcome. Especially: hand-composed songs with teaching notes.

## License

MIT
