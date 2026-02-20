# piano-sessions-ai

MCP server + CLI for AI-powered piano teaching — plays through VMPK via MIDI with voice feedback.

[![Tests](https://img.shields.io/badge/tests-65_passing-brightgreen)](https://github.com/mcp-tool-shop-org/piano-ai)
[![Smoke](https://img.shields.io/badge/smoke-14_passing-brightgreen)](https://github.com/mcp-tool-shop-org/piano-ai)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-6-purple)](https://github.com/mcp-tool-shop-org/piano-ai)
[![Songs](https://img.shields.io/badge/songs-10_(via_ai--music--sheets)-blue)](https://github.com/mcp-tool-shop-org/ai-music-sheets)

## What is this?

A TypeScript CLI and MCP server that loads piano songs from [ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets), parses them into MIDI, and plays them through [VMPK](https://vmpk.sourceforge.io/) via a virtual MIDI port. The teaching engine fires interjections at measure boundaries and key moments, enabling an LLM to act as a live piano teacher.

## Features

- **4 playback modes** — full, measure-by-measure, hands separate, loop
- **Teaching hooks** — fire at measure boundaries and key moments during playback
- **6 MCP tools** — expose registry, teaching notes, and song recommendations to LLMs
- **Note parser** — scientific pitch notation to MIDI and back
- **Mock connector** — full test coverage without MIDI hardware

## Prerequisites

1. **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** — create a virtual MIDI port (e.g., "loopMIDI Port")
2. **[VMPK](https://vmpk.sourceforge.io/)** — set MIDI input to your loopMIDI port
3. **Node.js 18+**

## Quick Start

```bash
pnpm install
pnpm build

# List all songs
node dist/cli.js list

# Show song details + teaching notes
node dist/cli.js info moonlight-sonata-mvt1

# Play a song through VMPK
node dist/cli.js play let-it-be

# Play with tempo override
node dist/cli.js play basic-12-bar-blues --tempo 80

# Step through measure by measure
node dist/cli.js play autumn-leaves --mode measure
```

## MCP Server

The MCP server exposes 6 tools for LLM integration:

| Tool | Description |
|------|-------------|
| `list_songs` | Browse/search songs by genre, difficulty, or query |
| `song_info` | Get full musical language, teaching goals, key moments |
| `registry_stats` | Song counts by genre and difficulty |
| `teaching_note` | Per-measure teaching note, fingering, dynamics |
| `suggest_song` | Get a recommendation based on criteria |
| `list_measures` | Overview of measures with teaching notes |

```bash
# Start the MCP server (stdio transport)
pnpm mcp
```

### Claude Desktop configuration

```json
{
  "mcpServers": {
    "piano-sessions-ai": {
      "command": "node",
      "args": ["F:/AI/piano-ai/dist/mcp-server.js"]
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
| `--tempo <bpm>` | Override the song's default tempo |
| `--mode <mode>` | Playback mode: `full`, `measure`, `hands`, `loop` |

## Teaching Engine

The teaching engine fires hooks during playback:

```typescript
import { createSession, createRecordingTeachingHook } from "piano-sessions-ai";
import { getSong } from "ai-music-sheets";

const hook = createRecordingTeachingHook();
const session = createSession(getSong("moonlight-sonata-mvt1")!, connector, {
  teachingHook: hook,
});

await session.play();
// hook.events → measure-start, key-moment, song-complete events
```

### Hook implementations

| Hook | Use case |
|------|----------|
| `createConsoleTeachingHook()` | CLI — logs to console |
| `createSilentTeachingHook()` | Testing — no-op |
| `createRecordingTeachingHook()` | Testing — records events |
| `createCallbackTeachingHook(cb)` | Custom — route to voice/aside |

## Programmatic API

```typescript
import { getSong } from "ai-music-sheets";
import { createSession, createVmpkConnector } from "piano-sessions-ai";

const connector = createVmpkConnector({ portName: /loop/i });
await connector.connect();

const song = getSong("autumn-leaves")!;
const session = createSession(song, connector, {
  mode: "measure",
  tempo: 100,
});

await session.play();          // plays one measure, pauses
session.next();                // advance to next measure
await session.play();          // play next measure
session.stop();                // stop and reset

await connector.disconnect();
```

## Architecture

```
ai-music-sheets (library)        piano-sessions-ai (runtime)
┌──────────────────────┐         ┌───────────────────────────┐
│ SongEntry (hybrid)   │────────→│ Note Parser               │
│ Registry (search)    │         │ Session Engine             │
│ 10 songs, 10 genres  │         │ Teaching Engine (hooks)    │
└──────────────────────┘         │ VMPK Connector (JZZ)      │
                                 │ MCP Server (6 tools)       │
                                 │ CLI                        │
                                 └─────────┬─────────────────┘
                                           │ MIDI
                                           ▼
                                 ┌─────────────────┐
                                 │ loopMIDI → VMPK │
                                 └─────────────────┘
```

## Testing

```bash
pnpm test       # 65 Vitest tests (parser + session + teaching)
pnpm smoke      # 14 smoke tests (integration, no MIDI needed)
pnpm typecheck  # tsc --noEmit
```

The mock VMPK connector (`createMockVmpkConnector`) records all MIDI events without hardware, enabling full test coverage.

## Related

- **[ai-music-sheets](https://github.com/mcp-tool-shop-org/ai-music-sheets)** — The song library: 10 genres, hybrid format (metadata + musical language + code-ready measures)

## License

MIT
