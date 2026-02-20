# PianoAI Plugin for Claude Code

Claude Code plugin that wraps the [PianoAI](https://github.com/mcp-tool-shop-org/pianoai)
MCP server, adding slash commands, a piano teacher agent, and structured
teaching workflows.

## What You Get

| Component | Name | Description |
|-----------|------|-------------|
| Skill | `/pianoai:teach` | Start a teaching session for a song |
| Skill | `/pianoai:practice` | Get a personalized practice plan |
| Skill | `/pianoai:explore` | Browse and discover songs |
| Agent | `piano-teacher` | Patient AI piano teacher persona |
| MCP Server | `pianoai` | 8 tools for song browsing, teaching, and practice |

## MCP Tools (8)

| Tool | Description |
|------|-------------|
| `list_songs` | Browse/search songs by genre, difficulty, or query |
| `song_info` | Musical language, teaching goals, key moments |
| `registry_stats` | Song counts by genre and difficulty |
| `teaching_note` | Per-measure teaching note, fingering, dynamics |
| `suggest_song` | Recommendation based on criteria |
| `list_measures` | Measure overview with teaching notes |
| `practice_setup` | Speed, mode, and voice recommendations |
| `sing_along` | Singable text (note names, solfege, contour, syllables) |

## Install

### Local testing (from the pianoai repo)

```bash
claude --plugin-dir ./plugin
```

### From npm

The MCP server is available as `@mcptoolshop/pianoai` on npm. The plugin
uses `npx -y -p @mcptoolshop/pianoai pianoai-mcp` to auto-fetch and run it.

## Prerequisites

For MIDI playback (optional — the MCP tools work without MIDI):

1. **[loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)** — create a virtual MIDI port
2. **[VMPK](https://vmpk.sourceforge.io/)** — set MIDI input to the loopMIDI port
3. **Node.js 18+**

## Usage Examples

```
/pianoai:explore jazz
/pianoai:teach moonlight-sonata-mvt1
/pianoai:practice let-it-be beginner
```

Or just talk naturally:

```
I want to learn a beginner jazz song on piano.
Help me practice Fur Elise at half speed.
What songs are available in the library?
```

The piano-teacher agent activates automatically for piano learning
conversations.

## License

MIT
