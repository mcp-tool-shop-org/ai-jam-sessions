#!/usr/bin/env node
// ─── pianoai: CLI Entry Point ─────────────────────────────────────
//
// Usage:
//   pianoai                     # Show help
//   pianoai list                # List all songs
//   pianoai list --genre jazz   # List songs by genre
//   pianoai play <song-id>      # Play a song (built-in piano engine)
//   pianoai play <song-id> --midi  # Play via MIDI output
//   pianoai sing <song-id>      # Sing along — narrate notes during playback
//   pianoai info <song-id>      # Show song details
//   pianoai stats               # Registry stats
//   pianoai ports               # List available MIDI ports
// ─────────────────────────────────────────────────────────────────────────────

import {
  getAllSongs,
  getSong,
  getSongsByGenre,
  getStats,
  GENRES,
} from "@mcptoolshop/ai-music-sheets";
import type { SongEntry, Genre } from "@mcptoolshop/ai-music-sheets";
import type { PlaybackProgress, PlaybackMode, SyncMode, VoiceDirective, AsideDirective, VmpkConnector } from "./types.js";
import type { SingAlongMode } from "./note-parser.js";
import { createAudioEngine } from "./audio-engine.js";
import { createVmpkConnector } from "./vmpk.js";
import { createSession } from "./session.js";
import { parseMidiFile } from "./midi/parser.js";
import { MidiPlaybackEngine } from "./playback/midi-engine.js";
import { PlaybackController } from "./playback/controls.js";
import { existsSync } from "node:fs";
import {
  createConsoleTeachingHook,
  createSingAlongHook,
  createLiveFeedbackHook,
  composeTeachingHooks,
} from "./teaching.js";
import { createSingOnMidiHook } from "./teaching/sing-on-midi.js";
import { createLiveMidiFeedbackHook } from "./teaching/live-midi-feedback.js";
import { PositionTracker } from "./playback/position.js";
import type { TeachingHook } from "./types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function printSongTable(songs: SongEntry[]): void {
  console.log(
    "\n" +
      padRight("ID", 28) +
      padRight("Title", 40) +
      padRight("Genre", 12) +
      padRight("Diff", 14) +
      "Measures"
  );
  console.log("─".repeat(100));
  for (const s of songs) {
    console.log(
      padRight(s.id, 28) +
        padRight(truncate(s.title, 38), 40) +
        padRight(s.genre, 12) +
        padRight(s.difficulty, 14) +
        String(s.measures.length)
    );
  }
  console.log(`\n${songs.length} song(s) found.\n`);
}

function printSongInfo(song: SongEntry): void {
  const ml = song.musicalLanguage;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${song.title}`);
  console.log(`  ${song.composer ?? "Traditional"} | ${song.genre} | ${song.difficulty}`);
  console.log(`  Key: ${song.key} | Tempo: ${song.tempo} BPM | Time: ${song.timeSignature}`);
  console.log(`  Duration: ~${song.durationSeconds}s | Measures: ${song.measures.length}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`\n${ml.description}\n`);
  console.log(`Structure: ${ml.structure}\n`);
  console.log("Key Moments:");
  for (const km of ml.keyMoments) {
    console.log(`  • ${km}`);
  }
  console.log("\nTeaching Goals:");
  for (const tg of ml.teachingGoals) {
    console.log(`  • ${tg}`);
  }
  console.log("\nStyle Tips:");
  for (const st of ml.styleTips) {
    console.log(`  • ${st}`);
  }
  console.log(`\nTags: ${song.tags.join(", ")}\n`);
}

/** Print a progress bar. */
function printProgress(progress: PlaybackProgress): void {
  const barWidth = 30;
  const filled = Math.round(progress.ratio * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
  const elapsed = (progress.elapsedMs / 1000).toFixed(1);
  process.stdout.write(
    `\r  [${bar}] ${progress.percent} — measure ${progress.currentMeasure}/${progress.totalMeasures} (${elapsed}s)`
  );
  if (progress.ratio >= 1) {
    process.stdout.write("\n");
  }
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s.substring(0, len) : s + " ".repeat(len - s.length);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.substring(0, max - 1) + "…";
}

const VALID_MODES: PlaybackMode[] = ["full", "measure", "hands", "loop"];
const VALID_SING_MODES: SingAlongMode[] = ["note-names", "solfege", "contour", "syllables"];
const VALID_HANDS = ["right", "left", "both"] as const;
const VALID_SYNC_MODES: SyncMode[] = ["concurrent", "before"];

/** Check for boolean flag (no value). */
function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

// ─── Commands ───────────────────────────────────────────────────────────────

function cmdList(args: string[]): void {
  const genreArg = getFlag(args, "--genre");

  if (genreArg) {
    if (!GENRES.includes(genreArg as Genre)) {
      console.error(`Unknown genre: "${genreArg}". Available: ${GENRES.join(", ")}`);
      process.exit(1);
    }
    printSongTable(getSongsByGenre(genreArg as Genre));
  } else {
    printSongTable(getAllSongs());
  }
}

function cmdInfo(args: string[]): void {
  const songId = args[0];
  if (!songId) {
    console.error("Usage: pianoai info <song-id>");
    process.exit(1);
  }
  const song = getSong(songId);
  if (!song) {
    console.error(`Song not found: "${songId}"`);
    process.exit(1);
  }
  printSongInfo(song);
}

async function cmdPlay(args: string[]): Promise<void> {
  const target = args[0];
  if (!target) {
    console.error("Usage: pianoai play <song-id | file.mid> [--speed N] [--tempo N] [--mode MODE] [--midi] [--with-singing] [--with-teaching] [--sing-mode MODE] [--seek N]");
    process.exit(1);
  }

  // Parse flags
  const useMidi = hasFlag(args, "--midi");
  const withSinging = hasFlag(args, "--with-singing");
  const withTeaching = hasFlag(args, "--with-teaching");
  const portName = getFlag(args, "--port") ?? undefined;
  const speedStr = getFlag(args, "--speed");
  const modeStr = getFlag(args, "--mode") ?? "full";
  const singModeStr = getFlag(args, "--sing-mode") ?? "note-names";
  const seekStr = getFlag(args, "--seek");
  const voiceFilterStr = getFlag(args, "--voice-filter") ?? "all";

  // Validate speed
  const speed = speedStr ? parseFloat(speedStr) : undefined;
  if (speed !== undefined && (isNaN(speed) || speed <= 0 || speed > 4)) {
    console.error(`Invalid speed: "${speedStr}". Must be between 0 (exclusive) and 4.`);
    process.exit(1);
  }

  // Validate sing mode
  const singMode = singModeStr as SingAlongMode;

  // Determine source: .mid file or library song
  const isMidiFile = target.endsWith(".mid") || target.endsWith(".midi") || existsSync(target);

  // Create connector
  const connector: VmpkConnector = useMidi
    ? createVmpkConnector(portName ? { portName } : undefined)
    : createAudioEngine();

  console.log(useMidi ? `\nConnecting to MIDI...` : `\nStarting piano...`);

  try {
    await connector.connect();
    console.log(`Connected!`);

    if (isMidiFile) {
      // ── MIDI file playback ──
      if (!existsSync(target)) {
        console.error(`File not found: "${target}"`);
        process.exit(1);
      }

      const parsed = await parseMidiFile(target);
      const tracker = new PositionTracker(parsed);
      const trackInfo = parsed.trackNames.length > 0 ? parsed.trackNames.join(", ") : "Unknown";
      const durationAtSpeed = parsed.durationSeconds / (speed ?? 1.0);
      const features: string[] = [];
      if (withSinging) features.push(`singing (${singMode}, ${voiceFilterStr})`);
      if (withTeaching) features.push("teaching");

      // Validate seek
      const seekSec = seekStr ? parseFloat(seekStr) : undefined;
      if (seekSec !== undefined && (isNaN(seekSec) || seekSec < 0)) {
        console.error(`Invalid seek: "${seekStr}". Must be a positive number (seconds).`);
        process.exit(1);
      }

      console.log(`\nPlaying: ${target}`);
      console.log(`  Tracks: ${trackInfo} (${parsed.trackCount})`);
      console.log(`  Notes: ${parsed.noteCount} | Tempo: ${parsed.bpm} BPM | Duration: ~${Math.round(durationAtSpeed)}s`);
      console.log(`  Measures: ~${tracker.totalMeasures} (estimated)`);
      if (seekSec) {
        const seekSnap = tracker.snapshotAt(seekSec);
        console.log(`  Seeking to: ${seekSec}s (measure ${seekSnap.measure}, beat ${seekSnap.beatInMeasure.toFixed(1)})`);
      }
      if (features.length > 0) console.log(`  Features: ${features.join(", ")}`);
      console.log();

      // Build teaching hooks
      const hooks: TeachingHook[] = [];

      if (withSinging) {
        const voiceSink = async (d: VoiceDirective) => {
          console.log(`  ♪ ${d.text}`);
        };
        hooks.push(createSingOnMidiHook(voiceSink, parsed, {
          mode: singMode,
          voiceFilter: voiceFilterStr as import("./teaching/sing-on-midi.js").SingVoiceFilter,
          speechSpeed: speed ?? 1.0,
        }));
      }

      if (withTeaching) {
        const voiceSink = async (d: VoiceDirective) => {
          console.log(`  🎓 ${d.text}`);
        };
        const asideSink = async (d: AsideDirective) => {
          const prefix = d.priority === "med" ? "💡" : d.priority === "high" ? "❗" : "ℹ️";
          console.log(`  ${prefix} ${d.text}`);
        };
        // Use position-aware feedback (measure-level context)
        hooks.push(createLiveMidiFeedbackHook(voiceSink, asideSink, parsed));
      }

      hooks.push(createConsoleTeachingHook());
      const teachingHook = composeTeachingHooks(...hooks);

      if (withSinging || withTeaching) {
        // Use PlaybackController for hook integration
        const controller = new PlaybackController(connector, parsed);
        await controller.play({
          speed: speed ?? 1.0,
          teachingHook,
          onProgress: printProgress,
        });
        console.log(`\nFinished! ${controller.eventsPlayed} notes played.`);
      } else {
        // Raw engine for plain playback
        const engine = new MidiPlaybackEngine(connector, parsed);
        await engine.play({
          speed: speed ?? 1.0,
          onProgress: printProgress,
        });
        console.log(`\nFinished! ${engine.eventsPlayed} notes played.`);
      }
    } else {
      // ── Library song playback ──
      const song = getSong(target);
      if (!song) {
        console.error(`Song not found: "${target}". Run 'pianoai list' to see available songs, or provide a .mid file path.`);
        process.exit(1);
      }

      const tempoStr = getFlag(args, "--tempo");
      const tempo = tempoStr ? parseInt(tempoStr, 10) : undefined;
      if (tempo !== undefined && (isNaN(tempo) || tempo < 10 || tempo > 400)) {
        console.error(`Invalid tempo: "${tempoStr}". Must be between 10 and 400 BPM.`);
        process.exit(1);
      }

      if (!VALID_MODES.includes(modeStr as PlaybackMode)) {
        console.error(`Invalid mode: "${modeStr}". Available: ${VALID_MODES.join(", ")}`);
        process.exit(1);
      }
      const mode = modeStr as PlaybackMode;

      // Build teaching hooks
      const libHooks: TeachingHook[] = [];

      if (withSinging) {
        const voiceSink = async (d: VoiceDirective) => {
          console.log(`  ♪ ${d.text}`);
        };
        libHooks.push(createSingAlongHook(voiceSink, song, {
          mode: singMode,
          speechSpeed: speed ?? 1.0,
        }));
      }

      if (withTeaching) {
        const voiceSink = async (d: VoiceDirective) => {
          console.log(`  🎓 ${d.text}`);
        };
        const asideSink = async (d: AsideDirective) => {
          const prefix = d.priority === "med" ? "💡" : d.priority === "high" ? "❗" : "ℹ️";
          console.log(`  ${prefix} ${d.text}`);
        };
        libHooks.push(createLiveFeedbackHook(voiceSink, asideSink, song));
      }

      libHooks.push(createConsoleTeachingHook());
      const teachingHook = composeTeachingHooks(...libHooks);

      const syncMode: SyncMode = (withSinging && !withTeaching) ? "before" : "concurrent";
      const session = createSession(song, connector, {
        mode,
        syncMode,
        tempo,
        speed,
        teachingHook,
        onProgress: printProgress,
        progressInterval: 0,
      });

      if (session.parseWarnings.length > 0) {
        console.log(`\n⚠ ${session.parseWarnings.length} note parsing warning(s):`);
        for (const w of session.parseWarnings.slice(0, 5)) {
          console.log(`  • ${w.location}: "${w.token}" — ${w.message}`);
        }
        if (session.parseWarnings.length > 5) {
          console.log(`  … and ${session.parseWarnings.length - 5} more`);
        }
      }

      printSongInfo(song);
      const speedLabel = speed && speed !== 1.0 ? ` × ${speed}x speed` : "";
      const tempoLabel = tempo ? ` (${tempo} BPM${speedLabel})` : speedLabel ? ` (${song.tempo} BPM${speedLabel})` : "";
      console.log(`Playing: ${song.title}${tempoLabel} [${mode} mode]\n`);

      await session.play();

      console.log(`\nFinished! ${session.session.measuresPlayed} measures played.`);
      console.log(session.summary());
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nError: ${msg}`);
    process.exit(1);
  } finally {
    await connector.disconnect();
  }
}

async function cmdSing(args: string[]): Promise<void> {
  const songId = args[0];
  if (!songId) {
    console.error("Usage: pianoai sing <song-id> [--mode note-names|solfege|contour|syllables] [--hand right|left|both] [--speed N] [--tempo N] [--with-piano] [--sync concurrent|before] [--midi]");
    process.exit(1);
  }
  const song = getSong(songId);
  if (!song) {
    console.error(`Song not found: "${songId}". Run 'pianoai list' to see available songs.`);
    process.exit(1);
  }

  // Parse flags
  const useMidi = hasFlag(args, "--midi");
  const portName = getFlag(args, "--port") ?? undefined;
  const tempoStr = getFlag(args, "--tempo");
  const speedStr = getFlag(args, "--speed");
  const modeStr = getFlag(args, "--mode") ?? "note-names";
  const handStr = getFlag(args, "--hand") ?? "right";
  const withPiano = hasFlag(args, "--with-piano");
  const syncStr = getFlag(args, "--sync") ?? "concurrent";

  // Validate sing-along mode
  if (!VALID_SING_MODES.includes(modeStr as SingAlongMode)) {
    console.error(`Invalid mode: "${modeStr}". Available: ${VALID_SING_MODES.join(", ")}`);
    process.exit(1);
  }
  const singMode = modeStr as SingAlongMode;

  // Validate hand
  if (!VALID_HANDS.includes(handStr as typeof VALID_HANDS[number])) {
    console.error(`Invalid hand: "${handStr}". Available: ${VALID_HANDS.join(", ")}`);
    process.exit(1);
  }
  const hand = handStr as "right" | "left" | "both";

  // Validate sync mode
  if (!VALID_SYNC_MODES.includes(syncStr as SyncMode)) {
    console.error(`Invalid sync mode: "${syncStr}". Available: ${VALID_SYNC_MODES.join(", ")}`);
    process.exit(1);
  }
  const syncMode = syncStr as SyncMode;

  // Validate speed
  const speed = speedStr ? parseFloat(speedStr) : undefined;
  if (speed !== undefined && (isNaN(speed) || speed <= 0 || speed > 4)) {
    console.error(`Invalid speed: "${speedStr}". Must be between 0 (exclusive) and 4.`);
    process.exit(1);
  }

  // Validate tempo
  const tempo = tempoStr ? parseInt(tempoStr, 10) : undefined;
  if (tempo !== undefined && (isNaN(tempo) || tempo < 10 || tempo > 400)) {
    console.error(`Invalid tempo: "${tempoStr}". Must be between 10 and 400 BPM.`);
    process.exit(1);
  }

  // Create connector: built-in piano engine or MIDI output
  const connector: VmpkConnector = useMidi
    ? createVmpkConnector(portName ? { portName } : undefined)
    : createAudioEngine();

  console.log(useMidi ? `\nConnecting to MIDI...` : `\nStarting piano...`);

  try {
    await connector.connect();
    console.log(`Connected!`);

    // Console voice sink — prints sing-along text
    const voiceSink = async (directive: VoiceDirective) => {
      console.log(`  ♪ ${directive.text}`);
    };

    // Console aside sink — prints feedback tips
    const asideSink = async (directive: AsideDirective) => {
      const prefix =
        directive.priority === "med" ? "💡" :
        directive.priority === "high" ? "❗" : "ℹ️";
      console.log(`  ${prefix} ${directive.text}`);
    };

    // Build hooks: sing-along + optional live feedback + console
    const hooks = [];
    const singHook = createSingAlongHook(voiceSink, song, {
      mode: singMode,
      hand,
      speechSpeed: speed ?? 1.0,
    });
    hooks.push(singHook);

    if (withPiano) {
      const feedbackHook = createLiveFeedbackHook(voiceSink, asideSink, song, {
        voiceInterval: 4,
      });
      hooks.push(feedbackHook);
    }

    hooks.push(createConsoleTeachingHook());
    const teachingHook = composeTeachingHooks(...hooks);

    const session = createSession(song, connector, {
      mode: "full",
      syncMode: withPiano ? syncMode : "before",
      tempo,
      speed,
      teachingHook,
      onProgress: printProgress,
      progressInterval: 0,
    });

    // Report parse warnings
    if (session.parseWarnings.length > 0) {
      console.log(`\n⚠ ${session.parseWarnings.length} note parsing warning(s):`);
      for (const w of session.parseWarnings.slice(0, 5)) {
        console.log(`  • ${w.location}: "${w.token}" — ${w.message}`);
      }
      if (session.parseWarnings.length > 5) {
        console.log(`  … and ${session.parseWarnings.length - 5} more`);
      }
    }

    // Display session info
    printSongInfo(song);
    const speedLabel = speed && speed !== 1.0 ? ` × ${speed}x speed` : "";
    const tempoLabel = tempo ? ` (${tempo} BPM${speedLabel})` : speedLabel ? ` (${song.tempo} BPM${speedLabel})` : "";
    const pianoLabel = withPiano ? ` + piano (${syncMode})` : "";
    console.log(`Singing along: ${song.title}${tempoLabel} [${singMode} / ${hand} hand${pianoLabel}]\n`);

    await session.play();

    console.log(`\nFinished! ${session.session.measuresPlayed} measures played.`);
    console.log(session.summary());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nError: ${msg}`);
    process.exit(1);
  } finally {
    await connector.disconnect();
  }
}

function cmdStats(): void {
  const stats = getStats();
  console.log("\nRegistry Stats:");
  console.log(`  Total songs: ${stats.totalSongs}`);
  console.log(`  Total measures: ${stats.totalMeasures}`);
  console.log("\n  By genre:");
  for (const [genre, count] of Object.entries(stats.byGenre)) {
    if (count > 0) console.log(`    ${padRight(genre, 12)} ${count}`);
  }
  console.log("\n  By difficulty:");
  for (const [diff, count] of Object.entries(stats.byDifficulty)) {
    if (count > 0) console.log(`    ${padRight(diff, 14)} ${count}`);
  }
  console.log();
}

function cmdPorts(): void {
  console.log("\nChecking available MIDI output ports...");
  const connector = createVmpkConnector();
  // JZZ needs an engine to list ports — try connecting briefly
  console.log("(Note: Full port listing requires JZZ engine initialization.)");
  console.log("Tip: Run loopMIDI and create a port, then set VMPK input to that port.\n");
}

function cmdHelp(): void {
  console.log(`
pianoai — Play piano through your speakers

Commands:
  play <song | file.mid>     Play a song or MIDI file
  list [--genre <genre>]     List built-in songs
  info <song-id>             Show song details
  sing <song-id> [options]   Sing along — narrate notes during playback
  stats                      Registry statistics
  ports                      List MIDI output ports
  help                       Show this help

Play options:
  --speed <mult>             Speed multiplier (0.5 = half, 1.0 = normal, 2.0 = double)
  --tempo <bpm>              Override tempo (10-400 BPM, library songs only)
  --mode <mode>              Playback mode: full, measure, hands, loop (library songs only)
  --midi                     Output via MIDI instead of built-in piano
  --port <name>              MIDI port name (with --midi)

Sing options:
  --tempo <bpm>              Override tempo (10-400 BPM)
  --speed <mult>             Speed multiplier
  --mode <mode>              Sing-along mode: note-names, solfege, contour, syllables
  --hand <hand>              Which hand: right, left, both
  --with-piano               Play piano accompaniment while singing
  --sync <mode>              Voice+piano sync: concurrent (default), before
  --midi                     Output via MIDI instead of built-in piano

Examples:
  pianoai play song.mid                             # play a MIDI file
  pianoai play /path/to/moonlight.mid --speed 0.75  # MIDI file at 3/4 speed
  pianoai play let-it-be                            # play from built-in library
  pianoai play let-it-be --midi                     # play via MIDI output
  pianoai sing let-it-be --with-piano               # sing + piano together
  pianoai list --genre jazz                         # browse jazz songs
`);
}

// ─── CLI Router ─────────────────────────────────────────────────────────────

function getFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";

  switch (command) {
    case "list":
      cmdList(args.slice(1));
      break;
    case "info":
      cmdInfo(args.slice(1));
      break;
    case "play":
      await cmdPlay(args.slice(1));
      break;
    case "sing":
      await cmdSing(args.slice(1));
      break;
    case "stats":
      cmdStats();
      break;
    case "ports":
      cmdPorts();
      break;
    case "help":
    case "--help":
    case "-h":
      cmdHelp();
      break;
    default:
      // Maybe it's a song ID — try info
      const song = getSong(command);
      if (song) {
        printSongInfo(song);
      } else {
        console.error(`Unknown command: "${command}". Run 'pianoai help' for usage.`);
        process.exit(1);
      }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
