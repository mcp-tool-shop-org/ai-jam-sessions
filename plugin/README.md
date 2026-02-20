# PianoAI Plugin for Claude Code

Claude Code plugin that wraps the [PianoAI](https://github.com/mcp-tool-shop-org/ai_jam_session)
MCP server, adding slash commands, agent personalities, and structured
teaching and jam session workflows.

## What You Get

| Component | Name | Description |
|-----------|------|-------------|
| Skill | `/pianoai:teach` | Start a teaching session for a song |
| Skill | `/pianoai:practice` | Get a personalized practice plan |
| Skill | `/pianoai:explore` | Browse and discover songs |
| Skill | `/pianoai:jam` | Start a jam session — improvise on a song or genre |
| Agent | `piano-teacher` | Patient AI piano teacher persona |
| Agent | `jam-musician` | Laid-back jam band musician persona |
| MCP Server | `pianoai` | 15 tools for playback, teaching, jamming, and song management |

## Install

### Local testing (from the repo)

```bash
claude --plugin-dir ./plugin
```

### From npm

The MCP server is available as `@mcptoolshop/pianoai` on npm. The plugin
uses `npx -y -p @mcptoolshop/pianoai pianoai-mcp` to auto-fetch and run it.

## Usage Examples

```
/pianoai:explore jazz
/pianoai:teach moonlight-sonata-mvt1
/pianoai:practice let-it-be beginner
/pianoai:jam autumn-leaves as blues
/pianoai:jam jazz
```

Or just talk naturally:

```
I want to learn a beginner jazz song on piano.
Help me practice Fur Elise at half speed.
Let's jam on some blues.
```

The piano-teacher agent activates for learning conversations.
The jam-musician agent activates for improvisation and jam sessions.

## License

MIT
