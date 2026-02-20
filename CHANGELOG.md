# Changelog

## 1.1.0 (2026-02-20)

Synchronized singing + piano playback, live teaching feedback, and the `pianai` → `pianoai` rename.

### Features

- **Synchronized singing + piano** — new `syncMode` option: `concurrent` (voice + piano simultaneously, duet feel) or `before` (voice first, then piano)
- **Live teaching feedback hook** — `createLiveFeedbackHook(voiceSink, asideSink, song)` delivers real-time encouragement every N measures, dynamics tips on intensity changes, difficulty warnings on challenging passages, and completion celebrations
- **9 teaching hooks** — adds `createLiveFeedbackHook` to the existing 8 (console, silent, recording, callback, voice, aside, sing-along, compose)
- **CLI `--with-piano` flag** — `pianoai sing <id> --with-piano` plays piano accompaniment while singing
- **CLI `--sync` flag** — choose `concurrent` (default) or `before` sync mode for sing commands
- **MCP `sing_along` extension** — `withPiano` and `syncMode` parameters for synchronized singing + accompaniment info

### Breaking Changes

- **CLI binary renamed** — `pianai` → `pianoai`, `pianai-mcp` → `pianoai-mcp`
- **MCP server name** — `pianai` → `pianoai` (update your Claude Desktop config)

### Docs

- All 8 READMEs updated with v1.1.0 features, new CLI examples, Sing Options table, and updated architecture diagram
- CLI command name corrected to `pianoai` across all documentation

### Testing

- 181 Vitest unit tests (+18 new: SyncMode, LiveFeedbackHook, integration)
- 29 smoke tests (+4 new: concurrent/before sync, live feedback, composed feedback)
- Full TypeScript strict mode — zero errors

## 1.0.0 (2026-02-20)

Initial public release of **PianoAI** — an MCP server + CLI for AI-powered piano teaching.

### Features

- **Session engine** — play/pause/stop with 4 playback modes (full, measure, hands, loop)
- **Speed control** — 0.5×–2× multiplier that stacks with per-song tempo override (10–400 BPM)
- **Progress tracking** — configurable callbacks at percentage milestones or per-measure
- **7 teaching hooks** — console, silent, recording, callback, voice, aside, compose
- **Voice feedback** — `VoiceDirective` output for mcp-voice-soundboard integration
- **Aside interjections** — `AsideDirective` output for mcp-aside inbox
- **Safe parsing** — bad notes skip gracefully with collected `ParseWarning`s
- **7 MCP tools** — list_songs, song_info, registry_stats, teaching_note, suggest_song, list_measures, practice_setup
- **Note parser** — scientific pitch notation ↔ MIDI (strict + safe variants)
- **VMPK connector** — real (JZZ) + mock for full test coverage without hardware
- **CLI** — `pianai list`, `info`, `play`, `stats`, `ports` with progress bar and teaching output
- **Docker** — multi-stage Dockerfile for lightweight production image
- **CI/CD** — GitHub Actions for lint/test/build + npm publish + Docker push on release

### Docs

- Multilingual README in 8 languages (EN, JA, ZH, ES, FR, HI, IT, PT-BR)
- PianoAI logo (logo.svg) centered in all READMEs

### Testing

- 121 Vitest unit tests (parser, session, teaching, voice, aside)
- 20 smoke tests (integration, no MIDI hardware needed)
- Full TypeScript strict mode
