<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.svg" alt="PianoAI logo" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  Piano player with built-in audio engine — plays through speakers, no external software required. MCP server + CLI.
</p>

[![Tests](https://img.shields.io/badge/tests-221_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-10-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_built--in-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## What is this?

A TypeScript piano player that plays standard MIDI files and built-in songs through your speakers. No external software required — the built-in audio engine handles everything. Includes an MCP server for LLM integration and a CLI for direct use.

Supports real-time sing-along narration and live teaching feedback during playback.

## Features

- **Built-in piano engine** — plays through speakers via `node-web-audio-api`, no MIDI hardware needed
- **Standard MIDI file support** — play any `.mid` file: `pianoai play song.mid`
- **Real-time singing** — narrate note-names, solfege, contour, or syllables during MIDI playback
- **Live teaching feedback** — dynamics tips, leap warnings, chord alerts, periodic encouragement
- **4 playback modes** — full, measure-by-measure, hands separate, loop
- **Speed control** — 0.5x slow practice to 4x fast, stacks with tempo override
- **Real-time controls** — pause, resume, speed change during playback with event listeners
- **10 MCP tools** — play, stop, browse, sing, teach — all through the MCP protocol
- **11 teaching hooks** — console, silent, recording, callback, voice, aside, sing-along, live feedback, MIDI singing, MIDI feedback, compose
- **Optional MIDI output** — route to external software via `--midi` flag (requires loopMIDI + VMPK)
- **Safe parsing** — bad notes skip gracefully with collected `ParseWarning`s
- **Mock connector** — full test coverage without hardware

## Install

```bash
npm install -g @mcptoolshop/pianoai
```

Requires **Node.js 18+**. That's it — no MIDI drivers, no virtual ports, no external software.

## Quick Start

```bash
# Play a MIDI file
pianoai play path/to/song.mid

# Play with singing (narrate note names as they play)
pianoai play song.mid --with-singing

# Play with teaching feedback (dynamics, encouragement)
pianoai play song.mid --with-teaching

# Play with both singing and teaching
pianoai play song.mid --with-singing --with-teaching --sing-mode solfege

# Half-speed practice with singing
pianoai play song.mid --speed 0.5 --with-singing

# Play a built-in library song
pianoai play let-it-be

# List all built-in songs
pianoai list

# Show song details + teaching notes
pianoai info moonlight-sonata-mvt1

# Sing along with a library song (voice narration)
pianoai sing let-it-be --mode solfege --with-piano
```

### Play Options

| Flag | Description |
|------|-------------|
| `--speed <mult>` | Speed multiplier: 0.5 = half, 1.0 = normal, 2.0 = double |
| `--tempo <bpm>` | Override the song's default tempo (10-400 BPM) |
| `--mode <mode>` | Playback mode: `full`, `measure`, `hands`, `loop` |
| `--with-singing` | Enable real-time sing-along narration |
| `--with-teaching` | Enable live teaching feedback |
| `--sing-mode <mode>` | Sing mode: `note-names`, `solfege`, `contour`, `syllables` |
| `--midi` | Route to external MIDI software instead of built-in engine |

## MCP Server

The MCP server exposes 10 tools for LLM integration:

| Tool | Description |
|------|-------------|
| `list_songs` | Browse/search songs by genre, difficulty, or query |
| `song_info` | Get full musical language, teaching goals, practice suggestions |
| `registry_stats` | Song counts by genre and difficulty |
| `teaching_note` | Per-measure teaching note, fingering, dynamics |
| `suggest_song` | Get a recommendation based on criteria |
| `list_measures` | Overview of measures with teaching notes + parse warnings |
| `sing_along` | Get singable text (note names, solfege, contour, syllables) per measure |
| `practice_setup` | Suggest speed, mode, and voice settings for a song |
| `play_song` | Play a song or MIDI file with optional singing and teaching |
| `stop_playback` | Stop the currently playing song |

### Claude Desktop configuration

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

### play_song with singing and teaching

The `play_song` MCP tool accepts `withSinging` and `withTeaching` flags:

```
play_song({ id: "path/to/song.mid", withSinging: true, withTeaching: true, singMode: "solfege" })
```

## Programmatic API

### Play a MIDI file with real-time controls

```typescript
import { createAudioEngine, parseMidiFile, PlaybackController } from "@mcptoolshop/pianoai";

const connector = createAudioEngine();
await connector.connect();

const midi = await parseMidiFile("song.mid");
const controller = new PlaybackController(connector, midi);

// Listen to events
controller.on("noteOn", (e) => console.log(`Note: ${e.noteName}`));
controller.on("stateChange", (e) => console.log(`State: ${e.state}`));

await controller.play({ speed: 0.75 });

controller.pause();       // pause
controller.setSpeed(1.5); // change speed
await controller.resume();// resume at new speed

await connector.disconnect();
```

### Play with singing and teaching hooks

```typescript
import {
  createAudioEngine,
  parseMidiFile,
  PlaybackController,
  createSingOnMidiHook,
  createMidiFeedbackHook,
  composeTeachingHooks,
} from "@mcptoolshop/pianoai";

const connector = createAudioEngine();
await connector.connect();
const midi = await parseMidiFile("song.mid");

const singHook = createSingOnMidiHook(
  async (d) => console.log(`♪ ${d.text}`),
  midi,
  { mode: "solfege" }
);

const feedbackHook = createMidiFeedbackHook(
  async (d) => console.log(`🎓 ${d.text}`),
  async (d) => console.log(`💡 ${d.text}`),
  midi,
  { voiceInterval: 16 }
);

const composed = composeTeachingHooks(singHook, feedbackHook);
const controller = new PlaybackController(connector, midi);
await controller.play({ teachingHook: composed });
```

### Play a built-in library song

```typescript
import { getSong } from "@mcptoolshop/ai-music-sheets";
import { createSession, createAudioEngine } from "@mcptoolshop/pianoai";

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
Standard MIDI files (.mid)   Built-in songs (ai-music-sheets)
        │                              │
        ▼                              ▼
   MIDI Parser ──────────────── Note Parser
        │                              │
        ▼                              ▼
  MidiPlaybackEngine            SessionController
        │                              │
        └──────── PlaybackController ──┘
                  (real-time events, hooks)
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      AudioEngine   Teaching Hooks  Progress
      (speakers)    (sing, feedback) (callbacks)
           │
           ▼
     node-web-audio-api (Rust DSP)

Teaching hook routing:
  PlaybackController → TeachingHook → VoiceDirective → mcp-voice-soundboard
                                    → AsideDirective → mcp-aside inbox
                                    → Console log    → CLI terminal
                                    → Recording      → test assertions
```

## Testing

```bash
pnpm test       # 221 Vitest tests
pnpm typecheck  # tsc --noEmit
```

## Related

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — The built-in song library

## License

MIT
