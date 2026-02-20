# Changelog

## 1.3.0 (2026-02-20)

Real-time teaching intelligence: position tracking, live MIDI feedback, voice filters, seek, and live playback controls.

### Features

- **Position tracker** — `PositionTracker` maps time to beat/measure/tempo with binary search for seek operations; estimates measure boundaries from raw MIDI (assumes 4/4 time)
- **Live MIDI feedback** — `createLiveMidiFeedbackHook` provides position-aware, measure-level teaching: range warnings, velocity shift detection, density alerts, section boundaries, milestone announcements (25/50/75%), periodic encouragement
- **Voice filters** — `SingVoiceFilter` type with `melody-only` (highest note per cluster), `harmony` (lowest), or `all`; applied via `filterClusterForVoice()` before singing
- **Seek support** — CLI `--seek N` jumps to second N before playback; `PositionTracker.timeForMeasure()` and `seekEventIndex()` for programmatic seek
- **Pause/resume MCP tool** — `pause_playback` tool pauses or resumes the active playback session
- **Speed change MCP tool** — `set_speed` tool changes playback speed during live playback
- **12 MCP tools** — up from 10: adds `pause_playback` and `set_speed` for live control
- **CLI `--voice-filter`** — filter singing output: `all`, `melody-only`, `harmony`

### Testing

- 243 Vitest unit tests (+22 new: PositionTracker, voice filters, live feedback, composed hooks)
- 45 smoke tests (+14 new: MIDI parsing, position tracking, PlaybackController, sing-on-MIDI, voice filters, live feedback)
- Full TypeScript strict mode — zero errors

## 1.2.0 (2026-02-20)

Standard MIDI file support, real-time playback controls, and singing on MIDI files. The product now plays any `.mid` file through the built-in audio engine.

### Features

- **MIDI file parser** — `parseMidiFile()` and `parseMidiBuffer()` parse standard MIDI files (format 0 and 1) into `ParsedMidi` with note events, tempo changes, and duration
- **MIDI playback engine** — `MidiPlaybackEngine` plays parsed MIDI through the audio engine with interruptible sleep and AbortSignal support
- **PlaybackController** — event-driven wrapper with `noteOn`, `noteOff`, `stateChange`, `speedChange`, `progress`, `error` events; `on(type, listener)` returns unsubscribe function
- **Sing-on-MIDI** — `createSingOnMidiHook()` generates singable text from raw MIDI note events (note-names, solfege, contour, syllables) with cluster-based chord detection
- **MIDI feedback** — `createMidiFeedbackHook()` provides per-note velocity/leap/chord analysis during MIDI playback
- **Playback timing** — `calculateSchedule()`, `clusterEvents()`, `sliceEventsByTime()` for event scheduling
- **CLI MIDI support** — `pianoai play song.mid` plays any `.mid` file; `--with-singing` and `--with-teaching` flags work on MIDI files
- **MCP MIDI support** — `play_song` tool accepts file paths and plays MIDI files with optional singing/teaching
- **Built-in audio engine** — `node-web-audio-api` v1.0.8 (Rust DSP backend) — plays through speakers, no external software required
- **Unified play command** — both library songs and MIDI files through the same CLI and MCP interface

### Breaking Changes

- **Self-contained audio** — loopMIDI and VMPK are no longer required; the built-in audio engine handles everything
- **MIDI output is optional** — use `--midi` flag to route to external MIDI software (was the default before)

### Docs

- README rewritten: "piano player" identity (not "teaching app"), MIDI file examples, architecture diagram updated
- 10 MCP tools documented (adds `play_song`, `stop_playback`)

### Testing

- 221 Vitest unit tests (+100 new: MIDI parser, engine, PlaybackController, sing-on-MIDI, MIDI feedback, integration)
- 31 smoke tests (+2 new: PlaybackController, MIDI events)
- Full TypeScript strict mode — zero errors

## 1.1.0 (2026-02-20)

Synchronized singing + piano playback, live teaching feedback, and the `pianai` to `pianoai` rename.

### Features

- **Synchronized singing + piano** — new `syncMode` option: `concurrent` (voice + piano simultaneously, duet feel) or `before` (voice first, then piano)
- **Live teaching feedback hook** — `createLiveFeedbackHook(voiceSink, asideSink, song)` delivers real-time encouragement every N measures, dynamics tips on intensity changes, difficulty warnings on challenging passages, and completion celebrations
- **9 teaching hooks** — adds `createLiveFeedbackHook` to the existing 8 (console, silent, recording, callback, voice, aside, sing-along, compose)
- **CLI `--with-piano` flag** — `pianoai sing <id> --with-piano` plays piano accompaniment while singing
- **CLI `--sync` flag** — choose `concurrent` (default) or `before` sync mode for sing commands
- **MCP `sing_along` extension** — `withPiano` and `syncMode` parameters for synchronized singing + accompaniment info

### Breaking Changes

- **CLI binary renamed** — `pianai` to `pianoai`, `pianai-mcp` to `pianoai-mcp`
- **MCP server name** — `pianai` to `pianoai` (update your Claude Desktop config)

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
- **Speed control** — 0.5x-2x multiplier that stacks with per-song tempo override (10-400 BPM)
- **Progress tracking** — configurable callbacks at percentage milestones or per-measure
- **7 teaching hooks** — console, silent, recording, callback, voice, aside, compose
- **Voice feedback** — `VoiceDirective` output for mcp-voice-soundboard integration
- **Aside interjections** — `AsideDirective` output for mcp-aside inbox
- **Safe parsing** — bad notes skip gracefully with collected `ParseWarning`s
- **7 MCP tools** — list_songs, song_info, registry_stats, teaching_note, suggest_song, list_measures, practice_setup
- **Note parser** — scientific pitch notation to MIDI (strict + safe variants)
- **VMPK connector** — real (JZZ) + mock for full test coverage without hardware
- **CLI** — `pianoai list`, `info`, `play`, `stats`, `ports` with progress bar and teaching output
- **Docker** — multi-stage Dockerfile for lightweight production image
- **CI/CD** — GitHub Actions for lint/test/build + npm publish + Docker push on release

### Docs

- Multilingual README in 8 languages (EN, JA, ZH, ES, FR, HI, IT, PT-BR)
- PianoAI logo (logo.svg) centered in all READMEs

### Testing

- 121 Vitest unit tests (parser, session, teaching, voice, aside)
- 20 smoke tests (integration, no MIDI hardware needed)
- Full TypeScript strict mode
