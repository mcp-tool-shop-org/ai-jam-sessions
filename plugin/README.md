# AI Jam Session — Claude Code Plugin

Claude Code plugin that wraps the [AI Jam Session](https://github.com/mcp-tool-shop-org/ai_jam_session)
MCP server, adding slash commands, agent personalities, and structured
teaching and jam session workflows.

## What You Get

| Component | Name | Description |
|-----------|------|-------------|
| Skill | `/ai-jam-session:teach` | Start a teaching session for a song |
| Skill | `/ai-jam-session:practice` | Get a personalized practice plan |
| Skill | `/ai-jam-session:explore` | Browse and discover songs |
| Skill | `/ai-jam-session:jam` | Start a jam session — improvise on a song or genre |
| Agent | `piano-teacher` | Patient AI piano teacher persona |
| Agent | `jam-musician` | Laid-back jam band musician persona |
| MCP Server | `ai_jam_session` | 15 tools for playback, teaching, jamming, and song management |

## Install

### Local testing (from the repo)

```bash
claude --plugin-dir ./plugin
```

### From npm

The MCP server is available as `@mcptoolshop/ai-jam-session` on npm. The plugin
uses `npx -y -p @mcptoolshop/ai-jam-session ai-jam-session-mcp` to auto-fetch and run it.

## Usage Examples

```
/ai-jam-session:explore jazz
/ai-jam-session:teach moonlight-sonata-mvt1
/ai-jam-session:practice let-it-be beginner
/ai-jam-session:jam autumn-leaves as blues
/ai-jam-session:jam jazz
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
