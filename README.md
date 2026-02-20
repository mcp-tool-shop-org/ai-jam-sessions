<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.svg" alt="PianoAI logo" width="180" />
</p>

<h1 align="center">PianoAI</h1>

<p align="center">
  MCP server + CLI for AI-powered piano teaching — plays through VMPK via MIDI with voice feedback.
</p>

[![Tests](https://img.shields.io/badge/tests-121_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![Smoke](https://img.shields.io/badge/smoke-20_passing-brightgreen)](https://github.com/mcp-tool-shop-org/pianoai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-7-purple)](https://github.com/mcp-tool-shop-org/pianoai)
[![Songs](https://img.shields.io/badge/songs-10_(via_ai--music--sheets)-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## What is this?

A TypeScript CLI and MCP server that loads piano songs from [ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets), parses them into MIDI, and plays them through [VMPK](https://vmpk.sourceforge.io/) via a virtual MIDI port. The teaching engine fires interjections at measure boundaries and key moments, enabling an LLM to act as a live piano teacher with voice and aside feedback.

## Features

- **4 playback modes** — full, measure-by-measure, hands separate, loop
- **Speed control** — 0.5x slow practice to 2x fast playback, stacks with tempo override
- **Progress tracking** — configurable callbacks at percentage milestones or per-measure
- **7 teaching hooks** — console, silent, recording, callback, voice, aside, compose
- **Voice feedback** — `VoiceDirective` output for mcp-voice-soundboard integration
- **Aside interjections** — `AsideDirective` output for mcp-aside inbox
- **Safe parsing** — bad notes skip gracefully with collected `ParseWarning`s
- **7 MCP tools** — expose registry, teaching notes, and song recommendations to LLMs
- **Note parser** — scientific pitch notation to MIDI and back
- **Mock connector** — full test coverage without MIDI hardware

## Prerequisites

1. **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** — create a virtual MIDI port (e.g., "loopMIDI Port")
2. **[VMPK](https://vmpk.sourceforge.io/)** — set MIDI input to your loopMIDI port
3. **Node.js 18+**

## Install

```bash
npm install -g pianai
```

## Quick Start

```bash
# List all songs
pianai list

# Show song details + teaching notes
pianai info moonlight-sonata-mvt1

# Play a song through VMPK
pianai play let-it-be

# Play with tempo override
pianai play basic-12-bar-blues --tempo 80

# Step through measure by measure
pianai play autumn-leaves --mode measure

# Half-speed practice
pianai play moonlight-sonata-mvt1 --speed 0.5

# Slow hands-separate practice
pianai play dream-on --speed 0.75 --mode hands
```

## MCP Server

The MCP server exposes 7 tools for LLM integration:

| Tool | Description |
|------|-------------|
| `list_songs` | Browse/search songs by genre, difficulty, or query |
| `song_info` | Get full musical language, teaching goals, practice suggestions |
| `registry_stats` | Song counts by genre and difficulty |
| `teaching_note` | Per-measure teaching note, fingering, dynamics |
| `suggest_song` | Get a recommendation based on criteria |
| `list_measures` | Overview of measures with teaching notes + parse warnings |
| `practice_setup` | Suggest speed, mode, and voice settings for a song |

```bash
# Start the MCP server (stdio transport)
pnpm mcp
```

### Claude Desktop configuration

```json
{
  "mcpServers": {
    "pianai": {
      "command": "pianai-mcp"
    }
  }
}
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `list [--genre <genre>]` | List available songs, optionally filtered by genre |
| `info <song-id>` | Show song details: musical language, teaching notes, structure |
| `play <song-id> [opts]` | Play a song through VMPK via MIDI |
| `stats` | Registry statistics (songs, genres, measures) |
| `ports` | List available MIDI output ports |
| `help` | Show usage information |

### Play Options

| Flag | Description |
|------|-------------|
| `--port <name>` | MIDI port name (default: auto-detect loopMIDI) |
| `--tempo <bpm>` | Override the song's default tempo (10-400 BPM) |
| `--speed <mult>` | Speed multiplier: 0.5 = half, 1.0 = normal, 2.0 = double |
| `--mode <mode>` | Playback mode: `full`, `measure`, `hands`, `loop` |

## Teaching Engine

The teaching engine fires hooks during playback. 7 hook implementations cover every use case:

| Hook | Use case |
|------|----------|
| `createConsoleTeachingHook()` | CLI — logs measures, moments, completion to console |
| `createSilentTeachingHook()` | Testing — no-op |
| `createRecordingTeachingHook()` | Testing — records events for assertions |
| `createCallbackTeachingHook(cb)` | Custom — route to any async callback |
| `createVoiceTeachingHook(sink)` | Voice — produces `VoiceDirective` for mcp-voice-soundboard |
| `createAsideTeachingHook(sink)` | Aside — produces `AsideDirective` for mcp-aside inbox |
| `composeTeachingHooks(...hooks)` | Multi — dispatch to multiple hooks in series |

### Voice feedback

```typescript
import { createSession, createVoiceTeachingHook } from "pianai";
import { getSong } from "ai-music-sheets";

const voiceHook = createVoiceTeachingHook(
  async (directive) => {
    // Route to mcp-voice-soundboard's voice_speak
    console.log(`[Voice] ${directive.text}`);
  },
  { voice: "narrator", speechSpeed: 0.9 }
);

const session = createSession(getSong("moonlight-sonata-mvt1")!, connector, {
  teachingHook: voiceHook,
  speed: 0.5, // half-speed practice
});

await session.play();
// voiceHook.directives → all voice instructions that were fired
```

### Composing hooks

```typescript
import {
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createRecordingTeachingHook,
  composeTeachingHooks,
} from "pianai";

// All three fire on every event
const composed = composeTeachingHooks(
  createVoiceTeachingHook(voiceSink),
  createAsideTeachingHook(asideSink),
  createRecordingTeachingHook()
);
```

## Programmatic API

```typescript
import { getSong } from "ai-music-sheets";
import { createSession, createVmpkConnector } from "pianai";

const connector = createVmpkConnector({ portName: /loop/i });
await connector.connect();

const song = getSong("autumn-leaves")!;
const session = createSession(song, connector, {
  mode: "measure",
  tempo: 100,
  speed: 0.75,           // 75% speed for practice
  onProgress: (p) => console.log(p.percent), // "25%", "50%", etc.
});

await session.play();          // plays one measure, pauses
session.next();                // advance to next measure
await session.play();          // play next measure
session.setSpeed(1.0);         // back to normal speed
await session.play();          // play next measure at full speed
session.stop();                // stop and reset

// Check for any parse warnings (bad notes in the song data)
if (session.parseWarnings.length > 0) {
  console.warn("Some notes could not be parsed:", session.parseWarnings);
}

await connector.disconnect();
```

## Architecture

```
ai-music-sheets (library)        pianai (runtime)
┌──────────────────────┐         ┌────────────────────────────────┐
│ SongEntry (hybrid)   │────────→│ Note Parser (safe + strict)    │
│ Registry (search)    │         │ Session Engine (speed+progress)│
│ 10 songs, 10 genres  │         │ Teaching Engine (7 hooks)      │
└──────────────────────┘         │ VMPK Connector (JZZ)          │
                                 │ MCP Server (7 tools)           │
                                 │ CLI (progress bar + voice)     │
                                 └─────────┬──────────────────────┘
                                           │ MIDI
                                           ▼
                                 ┌─────────────────┐
                                 │ loopMIDI → VMPK │
                                 └─────────────────┘

Teaching hook routing:
  Session → TeachingHook → VoiceDirective → mcp-voice-soundboard
                         → AsideDirective → mcp-aside inbox
                         → Console log    → CLI terminal
                         → Recording      → test assertions
```

## Testing

```bash
pnpm test       # 121 Vitest tests (parser + session + teaching + voice + aside)
pnpm smoke      # 20 smoke tests (integration, no MIDI needed)
pnpm typecheck  # tsc --noEmit
```

The mock VMPK connector (`createMockVmpkConnector`) records all MIDI events without hardware, enabling full test coverage. Safe parsing functions (`safeParseMeasure`) collect `ParseWarning` objects instead of throwing, so playback continues gracefully if a song has malformed notes.

## Related

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — The song library: 10 genres, hybrid format (metadata + musical language + code-ready measures)

## License

MIT
