#!/usr/bin/env node
// ─── pianoai: MCP Server ─────────────────────────────────────────────────────
//
// Exposes the ai-music-sheets registry and session engine as MCP tools.
// An LLM can browse songs, get teaching info, suggest practice setups,
// and push teaching interjections — all through the standard MCP protocol.
//
// Usage:
//   node dist/mcp-server.js          # stdio transport
//
// Tools:
//   list_songs      — browse/search the song library
//   song_info       — get detailed info for a specific song (+ practice tips)
//   registry_stats  — get registry statistics
//   teaching_note   — get the teaching note for a specific measure
//   suggest_song    — get a song recommendation based on criteria
//   list_measures   — overview of measures with teaching notes
//   practice_setup  — suggest speed, mode, and voice settings for a song
//   sing_along      — get singable text (note names/solfege/contour/syllables) for measures
//   play_song       — play a song through VMPK via MIDI
//   stop_playback   — stop the currently playing song
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getAllSongs,
  getSong,
  getSongsByGenre,
  getSongsByDifficulty,
  searchSongs,
  getStats,
  GENRES,
  DIFFICULTIES,
} from "@mcptoolshop/ai-music-sheets";
import type { SongEntry, Difficulty } from "@mcptoolshop/ai-music-sheets";
import { safeParseMeasure, measureToSingableText, type SingAlongMode } from "./note-parser.js";
import type { ParseWarning, PlaybackMode, SyncMode, VmpkConnector } from "./types.js";
import { createAudioEngine } from "./audio-engine.js";
import { createVmpkConnector } from "./vmpk.js";
import { createSession, SessionController } from "./session.js";
import { createConsoleTeachingHook, composeTeachingHooks } from "./teaching.js";
import { parseMidiFile, parseMidiBuffer } from "./midi/parser.js";
import { MidiPlaybackEngine } from "./playback/midi-engine.js";
import { PlaybackController } from "./playback/controls.js";
import { createSingOnMidiHook } from "./teaching/sing-on-midi.js";
import { createMidiFeedbackHook } from "./teaching/midi-feedback.js";
import { createLiveMidiFeedbackHook } from "./teaching/live-midi-feedback.js";
import type { VoiceDirective, AsideDirective } from "./types.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Suggest practice speed based on song difficulty. */
function suggestSpeed(difficulty: Difficulty): { speed: number; label: string } {
  switch (difficulty) {
    case "beginner":       return { speed: 0.5, label: "0.5× (half speed)" };
    case "intermediate":   return { speed: 0.75, label: "0.75× (three-quarter speed)" };
    case "advanced":       return { speed: 0.7, label: "0.7× (recommended for first pass)" };
    default:               return { speed: 1.0, label: "1.0× (full speed)" };
  }
}

/** Suggest playback mode based on difficulty. */
function suggestMode(difficulty: Difficulty): { mode: string; reason: string } {
  switch (difficulty) {
    case "beginner":
      return { mode: "measure", reason: "Step through one measure at a time for careful learning" };
    case "intermediate":
      return { mode: "hands", reason: "Practice hands separately before combining" };
    case "advanced":
      return { mode: "hands", reason: "Master each hand individually for complex passages" };
    default:
      return { mode: "full", reason: "Play straight through at tempo" };
  }
}

// ─── Server ─────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "pianoai",
  version: "0.1.0",
});

// ─── Tool: list_songs ───────────────────────────────────────────────────────

server.tool(
  "list_songs",
  "Browse and search the piano song library. Filter by genre, difficulty, or search query.",
  {
    genre: z.enum(GENRES as unknown as [string, ...string[]]).optional().describe("Filter by genre"),
    difficulty: z.enum(DIFFICULTIES as unknown as [string, ...string[]]).optional().describe("Filter by difficulty"),
    query: z.string().optional().describe("Search query (matches title, composer, tags, description)"),
  },
  async (params) => {
    const results = searchSongs({
      genre: params.genre as any,
      difficulty: params.difficulty as any,
      query: params.query,
    });

    const text = results.length === 0
      ? "No songs found matching your criteria."
      : results
          .map((s) => `${s.id} — ${s.title} (${s.genre}, ${s.difficulty}, ${s.measures.length} measures)`)
          .join("\n");

    return {
      content: [{ type: "text", text: `Found ${results.length} song(s):\n\n${text}` }],
    };
  }
);

// ─── Tool: song_info ────────────────────────────────────────────────────────

server.tool(
  "song_info",
  "Get detailed information about a specific song — musical language, teaching goals, key moments, structure.",
  {
    id: z.string().describe("Song ID (kebab-case, e.g. 'moonlight-sonata-mvt1')"),
  },
  async ({ id }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `Song not found: "${id}". Use list_songs to see available songs.` }],
        isError: true,
      };
    }

    const ml = song.musicalLanguage;
    const { speed, label: speedLabel } = suggestSpeed(song.difficulty as Difficulty);
    const { mode, reason: modeReason } = suggestMode(song.difficulty as Difficulty);

    const text = [
      `# ${song.title}`,
      `**Composer:** ${song.composer ?? "Traditional"}`,
      `**Genre:** ${song.genre} | **Difficulty:** ${song.difficulty}`,
      `**Key:** ${song.key} | **Tempo:** ${song.tempo} BPM | **Time:** ${song.timeSignature}`,
      `**Duration:** ~${song.durationSeconds}s | **Measures:** ${song.measures.length}`,
      ``,
      `## Description`,
      ml.description,
      ``,
      `## Structure`,
      ml.structure,
      ``,
      `## Key Moments`,
      ...ml.keyMoments.map((km) => `- ${km}`),
      ``,
      `## Teaching Goals`,
      ...ml.teachingGoals.map((tg) => `- ${tg}`),
      ``,
      `## Style Tips`,
      ...ml.styleTips.map((st) => `- ${st}`),
      ``,
      `## Practice Suggestions`,
      `- **Suggested speed:** ${speedLabel} → effective tempo: ${Math.round(song.tempo * speed)} BPM`,
      `- **Suggested mode:** ${mode} — ${modeReason}`,
      `- **Voice coaching:** Enable voice feedback for teaching notes at measure boundaries`,
      `- Use \`practice_setup "${song.id}"\` for a full practice configuration`,
      ``,
      `**Tags:** ${song.tags.join(", ")}`,
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

// ─── Tool: registry_stats ───────────────────────────────────────────────────

server.tool(
  "registry_stats",
  "Get statistics about the song registry: total songs, genres, difficulties, measures.",
  {},
  async () => {
    const stats = getStats();
    const genreLines = Object.entries(stats.byGenre)
      .filter(([, count]) => count > 0)
      .map(([genre, count]) => `  ${genre}: ${count}`)
      .join("\n");
    const diffLines = Object.entries(stats.byDifficulty)
      .filter(([, count]) => count > 0)
      .map(([diff, count]) => `  ${diff}: ${count}`)
      .join("\n");

    const text = [
      `# Registry Stats`,
      `Total songs: ${stats.totalSongs}`,
      `Total measures: ${stats.totalMeasures}`,
      ``,
      `## By Genre`,
      genreLines,
      ``,
      `## By Difficulty`,
      diffLines,
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

// ─── Tool: teaching_note ────────────────────────────────────────────────────

server.tool(
  "teaching_note",
  "Get the teaching note, fingering, and dynamics for a specific measure in a song.",
  {
    id: z.string().describe("Song ID"),
    measure: z.number().int().min(1).describe("Measure number (1-based)"),
  },
  async ({ id, measure }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `Song not found: "${id}"` }],
        isError: true,
      };
    }

    const m = song.measures[measure - 1];
    if (!m) {
      return {
        content: [{ type: "text", text: `Measure ${measure} not found (song has ${song.measures.length} measures)` }],
        isError: true,
      };
    }

    const lines = [
      `# ${song.title} — Measure ${measure}`,
      ``,
      `**Right Hand:** ${m.rightHand}`,
      `**Left Hand:** ${m.leftHand}`,
    ];
    if (m.fingering) lines.push(`**Fingering:** ${m.fingering}`);
    if (m.dynamics) lines.push(`**Dynamics:** ${m.dynamics}`);
    if (m.teachingNote) {
      lines.push(``, `## Teaching Note`, m.teachingNote);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: suggest_song ─────────────────────────────────────────────────────

server.tool(
  "suggest_song",
  "Get a song recommendation based on genre preference and/or difficulty level.",
  {
    genre: z.enum(GENRES as unknown as [string, ...string[]]).optional().describe("Preferred genre"),
    difficulty: z.enum(DIFFICULTIES as unknown as [string, ...string[]]).optional().describe("Desired difficulty"),
    maxDuration: z.number().optional().describe("Maximum duration in seconds"),
  },
  async (params) => {
    const results = searchSongs({
      genre: params.genre as any,
      difficulty: params.difficulty as any,
      maxDuration: params.maxDuration,
    });

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: "No songs match your criteria. Try broadening your search." }],
      };
    }

    // Pick a random suggestion from matches
    const song = results[Math.floor(Math.random() * results.length)];
    const ml = song.musicalLanguage;

    const text = [
      `I'd suggest: **${song.title}** by ${song.composer ?? "Traditional"}`,
      ``,
      `${ml.description}`,
      ``,
      `**Why this song?**`,
      ...ml.teachingGoals.map((tg) => `- ${tg}`),
      ``,
      `Use \`song_info\` with id "${song.id}" for full details.`,
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

// ─── Tool: list_measures ────────────────────────────────────────────────────

server.tool(
  "list_measures",
  "Get an overview of all measures in a song, showing right hand, left hand, and any teaching notes.",
  {
    id: z.string().describe("Song ID"),
    startMeasure: z.number().int().min(1).optional().describe("Start measure (1-based, default: 1)"),
    endMeasure: z.number().int().min(1).optional().describe("End measure (1-based, default: last)"),
  },
  async ({ id, startMeasure, endMeasure }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `Song not found: "${id}"` }],
        isError: true,
      };
    }

    const start = (startMeasure ?? 1) - 1;
    const end = Math.min((endMeasure ?? song.measures.length) - 1, song.measures.length - 1);
    const measures = song.measures.slice(start, end + 1);

    // Check for parse warnings
    const warnings: ParseWarning[] = [];
    for (const m of measures) {
      safeParseMeasure(m, song.tempo, warnings);
    }

    const lines = [`# ${song.title} — Measures ${start + 1} to ${end + 1}`, ``];
    for (const m of measures) {
      lines.push(`## Measure ${m.number}`);
      lines.push(`RH: ${m.rightHand}`);
      lines.push(`LH: ${m.leftHand}`);
      if (m.fingering) lines.push(`Fingering: ${m.fingering}`);
      if (m.dynamics) lines.push(`Dynamics: ${m.dynamics}`);
      if (m.teachingNote) lines.push(`Note: ${m.teachingNote}`);
      lines.push(``);
    }

    if (warnings.length > 0) {
      lines.push(`## ⚠ Parse Warnings`);
      lines.push(`${warnings.length} note(s) could not be parsed and will be skipped during playback:`);
      for (const w of warnings.slice(0, 10)) {
        lines.push(`- ${w.location}: "${w.token}" — ${w.message}`);
      }
      if (warnings.length > 10) {
        lines.push(`- … and ${warnings.length - 10} more`);
      }
      lines.push(``);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: practice_setup ──────────────────────────────────────────────────

server.tool(
  "practice_setup",
  "Get a recommended practice configuration for a song — speed, mode, voice settings, and CLI command. Tailored to the song's difficulty and teaching goals.",
  {
    id: z.string().describe("Song ID"),
    playerLevel: z.enum(["beginner", "intermediate", "advanced"]).optional()
      .describe("Player's skill level (overrides song-based suggestion)"),
  },
  async ({ id, playerLevel }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `Song not found: "${id}". Use list_songs to see available songs.` }],
        isError: true,
      };
    }

    // Determine practice parameters
    const effectiveDifficulty = (playerLevel ?? song.difficulty) as Difficulty;
    const { speed, label: speedLabel } = suggestSpeed(effectiveDifficulty);
    const { mode, reason: modeReason } = suggestMode(effectiveDifficulty);
    const effectiveTempo = Math.round(song.tempo * speed);

    // Check for parse warnings
    const warnings: ParseWarning[] = [];
    for (const m of song.measures) {
      safeParseMeasure(m, effectiveTempo, warnings);
    }

    const ml = song.musicalLanguage;
    const lines = [
      `# Practice Setup: ${song.title}`,
      ``,
      `## Song Profile`,
      `- **Difficulty:** ${song.difficulty}`,
      `- **Base tempo:** ${song.tempo} BPM`,
      `- **Measures:** ${song.measures.length}`,
      `- **Key:** ${song.key} | **Time:** ${song.timeSignature}`,
      ``,
      `## Recommended Settings`,
      `- **Speed:** ${speedLabel}`,
      `- **Effective tempo:** ${effectiveTempo} BPM`,
      `- **Mode:** ${mode} — ${modeReason}`,
      `- **Voice coaching:** Enabled — speak teaching notes + key moments`,
      ``,
      `## CLI Command`,
      `\`\`\``,
      `pianoai play ${song.id} --speed ${speed} --mode ${mode}`,
      `\`\`\``,
      ``,
      `## Practice Progression`,
      `1. Start at ${speedLabel} in **${mode}** mode`,
      `2. Focus on key moments:`,
      ...ml.keyMoments.slice(0, 3).map((km) => `   - ${km}`),
      `3. Gradually increase speed: ${speed} → ${Math.min(speed + 0.25, 1.0)} → 1.0`,
      `4. Switch to **full** mode once comfortable at speed`,
    ];

    if (song.difficulty === "advanced") {
      lines.push(
        `5. Try **loop** mode on difficult passages`,
        `   Example: \`pianoai play ${song.id} --mode loop\``
      );
    }

    if (warnings.length > 0) {
      lines.push(
        ``,
        `## ⚠ Note`,
        `${warnings.length} note(s) have parse warnings and will be skipped during playback.`,
        `Use \`list_measures "${song.id}"\` to see details.`
      );
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: sing_along ─────────────────────────────────────────────────────

server.tool(
  "sing_along",
  "Get singable text (note names, solfege, contour, or syllables) for a range of measures. Optionally enable piano accompaniment for synchronized singing + playback.",
  {
    id: z.string().describe("Song ID"),
    startMeasure: z.number().int().min(1).optional().describe("Start measure (1-based, default: 1)"),
    endMeasure: z.number().int().min(1).optional().describe("End measure (1-based, default: last)"),
    mode: z.enum(["note-names", "solfege", "contour", "syllables"]).optional()
      .describe("Sing-along mode (default: 'note-names')"),
    hand: z.enum(["right", "left", "both"]).optional()
      .describe("Which hand to narrate (default: 'right')"),
    withPiano: z.boolean().optional()
      .describe("Include piano accompaniment info and CLI command for live playback (default: false)"),
    syncMode: z.enum(["concurrent", "before"]).optional()
      .describe("Voice+piano sync mode: 'concurrent' = duet feel, 'before' = voice first (default: 'concurrent')"),
  },
  async ({ id, startMeasure, endMeasure, mode, hand, withPiano, syncMode }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `Song not found: "${id}". Use list_songs to see available songs.` }],
        isError: true,
      };
    }

    const effectiveMode: SingAlongMode = (mode as SingAlongMode) ?? "note-names";
    const effectiveHand = hand ?? "right";
    const effectiveSyncMode = syncMode ?? "concurrent";
    const start = (startMeasure ?? 1) - 1;
    const end = Math.min((endMeasure ?? song.measures.length) - 1, song.measures.length - 1);
    const measures = song.measures.slice(start, end + 1);

    const lines = [
      `# Sing Along: ${song.title}`,
      `**Mode:** ${effectiveMode} | **Hand:** ${effectiveHand}`,
      `**Measures:** ${start + 1} to ${end + 1}`,
    ];

    if (withPiano) {
      lines.push(`**Piano accompaniment:** enabled (${effectiveSyncMode} sync)`);
    }
    lines.push(``);

    for (const m of measures) {
      const singable = measureToSingableText(
        { rightHand: m.rightHand, leftHand: m.leftHand },
        { mode: effectiveMode, hand: effectiveHand }
      );
      lines.push(`**Measure ${m.number}:** ${singable}`);
    }

    if (withPiano) {
      const { speed, label: speedLabel } = suggestSpeed(song.difficulty as Difficulty);
      const effectiveTempo = Math.round(song.tempo * speed);

      lines.push(
        ``,
        `---`,
        `## Piano Accompaniment`,
        `Voice and piano play **${effectiveSyncMode === "concurrent" ? "simultaneously (duet feel)" : "sequentially (voice first, then piano)"}**.`,
        ``,
        `**Suggested speed:** ${speedLabel} → ${effectiveTempo} BPM`,
        `**Live feedback:** encouragement every 4 measures + dynamics tips`,
        ``,
        `### CLI Command`,
        `\`\`\``,
        `pianoai sing ${song.id} --with-piano --mode ${effectiveMode} --hand ${effectiveHand} --sync ${effectiveSyncMode}`,
        `\`\`\``,
      );
    } else {
      lines.push(
        ``,
        `---`,
        `*Tip: Add \`withPiano: true\` for synchronized singing + piano playback, or run:*`,
        `*\`pianoai sing ${song.id} --with-piano\`*`,
      );
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Active Playback State ────────────────────────────────────────────────

let activeSession: SessionController | null = null;
let activeMidiEngine: MidiPlaybackEngine | null = null;
let activeController: PlaybackController | null = null;
let activeConnector: VmpkConnector | null = null;

/** Stop whatever is currently playing. */
function stopActive(): void {
  if (activeSession && activeSession.state === "playing") {
    activeSession.stop();
  }
  activeSession = null;

  if (activeMidiEngine && activeMidiEngine.state === "playing") {
    activeMidiEngine.stop();
  }
  activeMidiEngine = null;

  if (activeController && activeController.state === "playing") {
    activeController.stop();
  }
  activeController = null;

  if (activeConnector) {
    activeConnector.disconnect().catch(() => {});
    activeConnector = null;
  }
}

// ─── Tool: play_song ──────────────────────────────────────────────────────

server.tool(
  "play_song",
  "Play a song through the built-in piano engine. Accepts a library song ID or a path to a .mid file. Returns immediately with session info while playback runs in the background.",
  {
    id: z.string().describe("Song ID (e.g. 'autumn-leaves', 'let-it-be') OR path to a .mid file"),
    speed: z.number().min(0.1).max(4).optional().describe("Speed multiplier (0.5 = half speed, 1.0 = normal, 2.0 = double). Default: 1.0"),
    tempo: z.number().int().min(10).max(400).optional().describe("Override tempo in BPM (10-400). Default: song's tempo"),
    mode: z.enum(["full", "measure", "hands", "loop"]).optional().describe("Playback mode: full (default), measure (one at a time), hands (separate then together), loop"),
    startMeasure: z.number().int().min(1).optional().describe("Start measure for loop mode (1-based)"),
    endMeasure: z.number().int().min(1).optional().describe("End measure for loop mode (1-based)"),
    withSinging: z.boolean().optional().describe("Enable sing-along narration during playback (note-names by default). Default: false"),
    withTeaching: z.boolean().optional().describe("Enable live teaching feedback (encouragement, dynamics tips, difficulty warnings). Default: false"),
    singMode: z.enum(["note-names", "solfege", "contour", "syllables"]).optional().describe("Sing-along mode when withSinging is true. Default: note-names"),
  },
  async ({ id, speed, tempo, mode, startMeasure, endMeasure, withSinging, withTeaching, singMode }) => {
    // Stop whatever is currently playing
    stopActive();

    // Determine if this is a .mid file path or a library song ID
    const isMidiFile = id.endsWith(".mid") || id.endsWith(".midi") || existsSync(id);
    const librarySong = isMidiFile ? null : getSong(id);

    if (!isMidiFile && !librarySong) {
      return {
        content: [{ type: "text", text: `Song not found: "${id}". Use list_songs to see available songs, or provide a path to a .mid file.` }],
        isError: true,
      };
    }

    // Connect piano engine
    const connector = createAudioEngine();
    try {
      await connector.connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Piano engine failed to start: ${msg}` }],
        isError: true,
      };
    }
    activeConnector = connector;

    // ── MIDI file playback ──
    if (isMidiFile) {
      let parsed;
      try {
        parsed = await parseMidiFile(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        connector.disconnect().catch(() => {});
        activeConnector = null;
        return {
          content: [{ type: "text", text: `Failed to parse MIDI file: ${msg}` }],
          isError: true,
        };
      }

      // Build teaching hooks if requested
      const hooks: import("./types.js").TeachingHook[] = [];
      const singingLog: string[] = [];
      const feedbackLog: string[] = [];

      if (withSinging) {
        const voiceSink = async (d: VoiceDirective) => {
          singingLog.push(d.text);
          console.error(`♪ ${d.text}`);
        };
        hooks.push(createSingOnMidiHook(voiceSink, parsed, {
          mode: (singMode ?? "note-names") as import("./note-parser.js").SingAlongMode,
        }));
      }

      if (withTeaching) {
        const voiceSink = async (d: VoiceDirective) => {
          feedbackLog.push(d.text);
          console.error(`🎓 ${d.text}`);
        };
        const asideSink = async (d: AsideDirective) => {
          feedbackLog.push(d.text);
          console.error(`💡 ${d.text}`);
        };
        // Use position-aware feedback (measure-level context) over basic per-note
        hooks.push(createLiveMidiFeedbackHook(voiceSink, asideSink, parsed));
      }

      hooks.push(createConsoleTeachingHook());
      const teachingHook = composeTeachingHooks(...hooks);

      // Use PlaybackController when hooks are active, raw engine otherwise
      if (withSinging || withTeaching) {
        const controller = new PlaybackController(connector, parsed);
        activeController = controller;

        const playPromise = controller.play({ speed: speed ?? 1.0, teachingHook });
        playPromise
          .then(() => {
            console.error(`Finished playing MIDI file: ${id} (${parsed.noteCount} notes, ${parsed.durationSeconds.toFixed(1)}s)`);
          })
          .catch((err) => {
            console.error(`Playback error: ${err instanceof Error ? err.message : String(err)}`);
          })
          .finally(() => {
            connector.disconnect().catch(() => {});
            if (activeController === controller) activeController = null;
            if (activeConnector === connector) activeConnector = null;
          });
      } else {
        const engine = new MidiPlaybackEngine(connector, parsed);
        activeMidiEngine = engine;

        const playPromise = engine.play({ speed: speed ?? 1.0 });
        playPromise
          .then(() => {
            console.error(`Finished playing MIDI file: ${id} (${parsed.noteCount} notes, ${parsed.durationSeconds.toFixed(1)}s)`);
          })
          .catch((err) => {
            console.error(`Playback error: ${err instanceof Error ? err.message : String(err)}`);
          })
          .finally(() => {
            connector.disconnect().catch(() => {});
            if (activeMidiEngine === engine) activeMidiEngine = null;
            if (activeConnector === connector) activeConnector = null;
          });
      }

      const effectiveSpeed = speed ?? 1.0;
      const durationAtSpeed = parsed.durationSeconds / effectiveSpeed;
      const speedLabel = effectiveSpeed !== 1.0 ? ` × ${effectiveSpeed}x` : "";
      const trackInfo = parsed.trackNames.length > 0 ? parsed.trackNames.join(", ") : "Unknown";
      const features: string[] = [];
      if (withSinging) features.push(`singing (${singMode ?? "note-names"})`);
      if (withTeaching) features.push("teaching feedback");

      const lines = [
        `Now playing: **${id}** (MIDI file)`,
        ``,
        `- **Tracks:** ${trackInfo} (${parsed.trackCount} track${parsed.trackCount !== 1 ? "s" : ""})`,
        `- **Notes:** ${parsed.noteCount}`,
        `- **Tempo:** ${parsed.bpm} BPM${speedLabel}`,
        `- **Duration:** ~${Math.round(durationAtSpeed)}s`,
        `- **Format:** MIDI type ${parsed.format}`,
      ];
      if (features.length > 0) {
        lines.push(`- **Features:** ${features.join(", ")}`);
      }
      lines.push(``, `Use \`stop_playback\` to stop. Playback runs in the background.`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    // ── Library song playback ──
    const song = librarySong!;
    const loopRange: [number, number] | undefined =
      startMeasure && endMeasure ? [startMeasure, endMeasure] : undefined;

    const playbackMode = (mode ?? "full") as PlaybackMode;

    // Build teaching hooks
    const libHooks: import("./types.js").TeachingHook[] = [];

    if (withSinging) {
      const { createSingAlongHook } = await import("./teaching.js");
      const voiceSink = async (d: VoiceDirective) => {
        console.error(`♪ ${d.text}`);
      };
      libHooks.push(createSingAlongHook(voiceSink, song, {
        mode: (singMode ?? "note-names") as import("./note-parser.js").SingAlongMode,
      }));
    }

    if (withTeaching) {
      const { createLiveFeedbackHook } = await import("./teaching.js");
      const voiceSink = async (d: VoiceDirective) => {
        console.error(`🎓 ${d.text}`);
      };
      const asideSink = async (d: AsideDirective) => {
        console.error(`💡 ${d.text}`);
      };
      libHooks.push(createLiveFeedbackHook(voiceSink, asideSink, song));
    }

    libHooks.push(createConsoleTeachingHook());
    const teachingHook = composeTeachingHooks(...libHooks);

    const syncMode = (withSinging && !withTeaching) ? "before" as SyncMode : "concurrent" as SyncMode;
    const session = createSession(song, connector, {
      mode: playbackMode,
      syncMode,
      speed,
      tempo,
      loopRange,
      teachingHook,
    });
    activeSession = session;

    // Play in background
    const playPromise = session.play();
    playPromise
      .then(() => {
        console.error(`Finished playing: ${song.title} (${session.session.measuresPlayed} measures)`);
      })
      .catch((err) => {
        console.error(`Playback error: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
        connector.disconnect().catch(() => {});
        if (activeSession === session) activeSession = null;
        if (activeConnector === connector) activeConnector = null;
      });

    const effectiveSpeed = speed ?? 1.0;
    const baseTempo = tempo ?? song.tempo;
    const effectiveTempo = Math.round(baseTempo * effectiveSpeed);
    const speedLabel = effectiveSpeed !== 1.0 ? ` × ${effectiveSpeed}x` : "";

    const warnings = session.parseWarnings;
    const lines = [
      `Now playing: **${song.title}** by ${song.composer ?? "Traditional"}`,
      ``,
      `- **Mode:** ${playbackMode}`,
      `- **Tempo:** ${baseTempo} BPM${speedLabel} → ${effectiveTempo} BPM effective`,
      `- **Key:** ${song.key} | **Time:** ${song.timeSignature}`,
      `- **Measures:** ${song.measures.length}`,
    ];

    if (loopRange) {
      lines.push(`- **Loop range:** measures ${loopRange[0]}–${loopRange[1]}`);
    }
    if (warnings.length > 0) {
      lines.push(``, `⚠ ${warnings.length} note(s) had parse warnings and will be skipped.`);
    }
    lines.push(``, `Use \`stop_playback\` to stop. Playback runs in the background.`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: stop_playback ──────────────────────────────────────────────────

server.tool(
  "stop_playback",
  "Stop the currently playing song and disconnect MIDI.",
  {},
  async () => {
    const wasPlaying = activeSession || activeMidiEngine || activeController;
    if (!wasPlaying) {
      return {
        content: [{ type: "text", text: "No song is currently playing." }],
      };
    }

    const info = activeSession
      ? `${activeSession.session.song.title} (${activeSession.session.measuresPlayed} measures played)`
      : activeMidiEngine
        ? `MIDI file (${activeMidiEngine.eventsPlayed}/${activeMidiEngine.totalEvents} events played)`
        : activeController
          ? `MIDI file (${activeController.eventsPlayed}/${activeController.totalEvents} events played)`
          : "Unknown";

    stopActive();

    return {
      content: [{ type: "text", text: `Stopped: ${info}` }],
    };
  }
);

// ─── Tool: pause_playback ─────────────────────────────────────────────────

server.tool(
  "pause_playback",
  "Pause or resume the currently playing song.",
  {
    resume: z.boolean().optional().describe("If true, resume playback. If false or omitted, pause."),
  },
  async ({ resume }) => {
    if (resume) {
      // Resume
      if (activeController && activeController.state === "paused") {
        activeController.resume().catch(() => {});
        return { content: [{ type: "text", text: "Resumed playback." }] };
      }
      if (activeSession && activeSession.state === "paused") {
        activeSession.play().catch(() => {});
        return { content: [{ type: "text", text: "Resumed playback." }] };
      }
      return { content: [{ type: "text", text: "Nothing is paused." }] };
    }

    // Pause
    if (activeController && activeController.state === "playing") {
      activeController.pause();
      const pos = activeController.positionSeconds;
      return {
        content: [{
          type: "text",
          text: `Paused at ${pos.toFixed(1)}s (${activeController.eventsPlayed}/${activeController.totalEvents} events).`,
        }],
      };
    }
    if (activeMidiEngine && activeMidiEngine.state === "playing") {
      activeMidiEngine.pause();
      return {
        content: [{
          type: "text",
          text: `Paused at ${activeMidiEngine.positionSeconds.toFixed(1)}s.`,
        }],
      };
    }
    if (activeSession && activeSession.state === "playing") {
      activeSession.pause();
      return {
        content: [{
          type: "text",
          text: `Paused (${activeSession.session.measuresPlayed} measures played).`,
        }],
      };
    }

    return { content: [{ type: "text", text: "No song is currently playing." }] };
  }
);

// ─── Tool: set_speed ──────────────────────────────────────────────────────

server.tool(
  "set_speed",
  "Change the playback speed of the currently playing song. Takes effect on the next note.",
  {
    speed: z.number().min(0.1).max(4).describe("New speed multiplier (0.1–4.0)"),
  },
  async ({ speed }) => {
    if (activeController) {
      const prev = activeController.speed;
      activeController.setSpeed(speed);
      return {
        content: [{
          type: "text",
          text: `Speed changed: ${prev}x → ${speed}x. Takes effect on next note.`,
        }],
      };
    }
    if (activeMidiEngine) {
      const prev = activeMidiEngine.speed;
      activeMidiEngine.setSpeed(speed);
      return {
        content: [{
          type: "text",
          text: `Speed changed: ${prev}x → ${speed}x.`,
        }],
      };
    }
    if (activeSession) {
      activeSession.setSpeed(speed);
      return {
        content: [{
          type: "text",
          text: `Speed changed to ${speed}x.`,
        }],
      };
    }

    return { content: [{ type: "text", text: "No song is currently playing." }] };
  }
);

// ─── Start ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("pianoai MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
