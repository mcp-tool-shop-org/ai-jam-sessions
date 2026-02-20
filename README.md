<p align="center">
  <img src="logo.png" alt="PianoAI logo" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  AI piano player with built-in audio engine and 100-song library. MCP server for Claude, CLI for humans.
</p>

[![MCP Tools](https://img.shields.io/badge/MCP_tools-15-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-100_built--in-blue)](https://github.com/mcp-tool-shop-org/pianoai)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)

## What is this?

A piano that Claude can play. PianoAI is an MCP server with a built-in audio engine — it plays through your speakers, no external software required. Claude browses a 100-song library spanning 10 genres, picks songs, teaches them, and jams on them. Also works as a standalone CLI.

## Features

- **Built-in piano engine** — sample-based audio via `node-web-audio-api`, plays through speakers
- **100-song library** — classical, jazz, pop, blues, rock, R&B, latin, film, ragtime, new-age
- **AI Jam Session** — Claude analyzes a song's chords and melody, then creates its own interpretation
- **MIDI file support** — play any `.mid` file: `pianoai play song.mid`
- **Teaching system** — per-measure teaching notes, musical language descriptions, practice recommendations
- **4 playback modes** — full, measure-by-measure, hands separate, loop
- **Speed control** — 0.5x slow practice to 4x fast
- **Real-time controls** — pause, resume, speed change during playback
- **15 MCP tools** — play, browse, teach, jam, import — all through the MCP protocol
- **Add your own songs** — `add_song` tool accepts SongEntry JSON, `import_midi` converts MIDI files
- **Optional MIDI output** — route to external software via `--midi` flag (requires loopMIDI + VMPK)

## Install

```bash
npm install -g @mcptoolshop/pianoai
```

Requires **Node.js 18+**. That's it — no MIDI drivers, no virtual ports, no external software.

## Quick Start

```bash
# Play a built-in song
pianoai play let-it-be

# Play a MIDI file
pianoai play path/to/song.mid

# Half-speed practice
pianoai play moonlight-sonata-mvt1 --speed 0.5

# List all built-in songs
pianoai list

# Show song details + teaching notes
pianoai info autumn-leaves
```

### Play Options

| Flag | Description |
|------|-------------|
| `--speed <mult>` | Speed multiplier: 0.5 = half, 1.0 = normal, 2.0 = double |
| `--tempo <bpm>` | Override the song's default tempo (10-400 BPM) |
| `--mode <mode>` | Playback mode: `full`, `measure`, `hands`, `loop` |
| `--midi` | Route to external MIDI software instead of built-in engine |

## MCP Server

The MCP server exposes 15 tools for LLM integration:

| Tool | Description |
|------|-------------|
| `list_songs` | Browse/search songs by genre, difficulty, or query |
| `song_info` | Full musical language, teaching goals, practice suggestions |
| `registry_stats` | Song counts by genre and difficulty |
| `teaching_note` | Per-measure teaching note, fingering, dynamics |
| `suggest_song` | Recommendation based on criteria |
| `list_measures` | Overview of measures with teaching notes |
| `practice_setup` | Suggest speed, mode, and settings for a song |
| `sing_along` | Singable text (note names, solfege, contour) per measure |
| `play_song` | Play a song or MIDI file through speakers |
| `pause_playback` | Pause or resume the currently playing song |
| `set_speed` | Change playback speed during playback |
| `stop_playback` | Stop the currently playing song |
| `ai_jam_session` | Get a jam brief — chords, melody, style guidance — for improvisation |
| `add_song` | Add a new song (SongEntry JSON) to the library |
| `import_midi` | Convert a MIDI file into a SongEntry and register it |

### AI Jam Session

The `ai_jam_session` tool extracts a structured "jam brief" from any song: chord progression, melody contour, and genre-specific style guidance. Claude uses the brief to create its own interpretation.

Two modes:
- **Specific song:** `ai_jam_session({ songId: "autumn-leaves", style: "blues" })` — jam on Autumn Leaves, blues style
- **Random genre pick:** `ai_jam_session({ genre: "jazz" })` — pick a random jazz song and jam on it

Optional parameters: `mood` (upbeat, melancholic, dreamy, etc.), `difficulty`, `measures` (range like "1-8").

### Claude Desktop / Claude Code configuration

```json
{
  "mcpServers": {
    "pianoai": {
      "command": "npx",
      "args": ["-y", "-p", "@mcptoolshop/pianoai", "pianoai-mcp"]
    }
  }
}
```

### Claude Code Plugin

PianoAI ships with a Claude Code plugin that adds slash commands and agent personalities:

| Command | Description |
|---------|-------------|
| `/pianoai:teach <song>` | Start a structured teaching session |
| `/pianoai:practice <song>` | Get a practice plan with speed/mode recommendations |
| `/pianoai:explore [query]` | Browse the song library by genre, difficulty, or keyword |
| `/pianoai:jam <song or genre>` | Start a jam session — Claude creates its own interpretation |

Two agent personalities:
- **Piano Teacher** — patient, pedagogical, meets students where they are
- **Jam Musician** — laid-back jam band vibes, groove-first, encourages experimentation

## Song Library

100 built-in songs across 10 genres, 3 difficulty levels:

| Genre | Songs | Examples |
|-------|-------|---------|
| Classical | 10 | Fur Elise, Clair de Lune, Moonlight Sonata, Bach Prelude in C |
| Jazz | 10 | Autumn Leaves, Take Five, So What, Misty |
| Pop | 10 | Imagine, Hallelujah, Piano Man, Bohemian Rhapsody |
| Blues | 10 | Basic 12-Bar, St. Louis Blues, Stormy Monday, Thrill Is Gone |
| Rock | 10 | Stairway Intro, Hotel California, Rocket Man, Layla Coda |
| R&B | 10 | Superstition, Georgia On My Mind, Lean On Me, My Girl |
| Latin | 10 | Girl from Ipanema, Besame Mucho, Oye Como Va, Wave |
| Film | 11 | Cinema Paradiso, Moon River, Hedwig's Theme, Spirited Away |
| Ragtime | 9 | The Entertainer, Maple Leaf Rag, Elite Syncopations |
| New-Age | 10 | River Flows in You, Snowfall, Crystal Stream, Evening Calm |

## Programmatic API

```typescript
import { createAudioEngine, parseMidiFile, PlaybackController } from "@mcptoolshop/pianoai";

const connector = createAudioEngine();
await connector.connect();

const midi = await parseMidiFile("song.mid");
const controller = new PlaybackController(connector, midi);

controller.on("noteOn", (e) => console.log(`Note: ${e.noteName}`));
await controller.play({ speed: 0.75 });

controller.pause();
controller.setSpeed(1.5);
await controller.resume();

await connector.disconnect();
```

### Play a built-in song

```typescript
import { getSong, createSession, createAudioEngine } from "@mcptoolshop/pianoai";

const connector = createAudioEngine();
await connector.connect();

const song = getSong("autumn-leaves")!;
const session = createSession(song, connector, {
  mode: "full",
  speed: 0.75,
});

await session.play();
await connector.disconnect();
```

## Architecture

```
MIDI files (.mid)          Built-in song library (JSON)
       |                              |
       v                              v
  MIDI Parser ──────────────── Note Parser
       |                              |
       v                              v
 MidiPlaybackEngine            SessionController
       |                              |
       └──────── PlaybackController ──┘
                 (real-time events, hooks)
                        |
          ┌─────────────┼─────────────┐
          v             v             v
     AudioEngine   Teaching Hooks  Progress
     (speakers)    (per-measure)   (callbacks)
          |
          v
    node-web-audio-api (Rust DSP)
```

## License

MIT
