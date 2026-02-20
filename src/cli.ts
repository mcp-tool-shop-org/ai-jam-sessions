#!/usr/bin/env node
// ─── pianoai: CLI Entry Point ─────────────────────────────────────
//
// Usage:
//   pianoai                     # Interactive mode — list songs, pick one, play
//   pianoai list                # List all songs
//   pianoai list --genre jazz   # List songs by genre
//   pianoai play <song-id>      # Play a specific song
//   pianoai sing <song-id>      # Sing along — narrate notes during playback
//   pianoai info <song-id>      # Show song details (musical language)
//   pianoai stats               # Registry stats
//   pianoai ports               # List available MIDI ports
//
// Requires: loopMIDI running + VMPK listening on the loopMIDI port.
// ─────────────────────────────────────────────────────────────────────────────

import {
  getAllSongs,
  getSong,
  getSongsByGenre,
  getStats,
  GENRES,
} from "@mcptoolshop/ai-music-sheets";
import type { SongEntry, Genre } from "@mcptoolshop/ai-music-sheets";
import type { PlaybackProgress, PlaybackMode, SyncMode, VoiceDirective, AsideDirective } from "./types.js";
import type { SingAlongMode } from "./note-parser.js";
import { createVmpkConnector } from "./vmpk.js";
import { createSession } from "./session.js";
import {
  createConsoleTeachingHook,
  createSingAlongHook,
  createLiveFeedbackHook,
  composeTeachingHooks,
} from "./teaching.js";

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
  const songId = args[0];
  if (!songId) {
    console.error("Usage: pianoai play <song-id> [--tempo N] [--speed N] [--mode MODE]");
    process.exit(1);
  }
  const song = getSong(songId);
  if (!song) {
    console.error(`Song not found: "${songId}". Run 'pianoai list' to see available songs.`);
    process.exit(1);
  }

  // Parse flags
  const portName = getFlag(args, "--port") ?? undefined;
  const tempoStr = getFlag(args, "--tempo");
  const speedStr = getFlag(args, "--speed");
  const modeStr = getFlag(args, "--mode") ?? "full";

  // Validate mode
  if (!VALID_MODES.includes(modeStr as PlaybackMode)) {
    console.error(`Invalid mode: "${modeStr}". Available: ${VALID_MODES.join(", ")}`);
    process.exit(1);
  }
  const mode = modeStr as PlaybackMode;

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

  console.log(`\nConnecting to MIDI...`);
  const connector = createVmpkConnector(
    portName ? { portName } : undefined
  );

  try {
    await connector.connect();
    console.log(`Connected!`);

    // Create session with teaching hooks + progress
    const teachingHook = createConsoleTeachingHook();
    const session = createSession(song, connector, {
      mode,
      tempo,
      speed,
      teachingHook,
      onProgress: printProgress,
      progressInterval: 0, // report every measure
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
    console.log(`Playing: ${song.title}${tempoLabel} [${mode} mode]\n`);

    await session.play();

    console.log(`\nFinished! ${session.session.measuresPlayed} measures played.`);
    console.log(session.summary());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Detect MIDI connection failure — provide helpful guidance
    if (msg.includes("Failed to connect to MIDI") || msg.includes("MIDI port not connected")) {
      console.error(`\n❌ MIDI Connection Failed`);
      console.error(`\nTo play through VMPK, you need:`);
      console.error(`  1. loopMIDI running with a virtual port (e.g. "loopMIDI Port")`);
      console.error(`     → Download: https://www.tobias-erichsen.de/software/loopmidi.html`);
      console.error(`  2. VMPK listening on that port`);
      console.error(`     → Download: https://vmpk.sourceforge.io/`);
      console.error(`     → VMPK → Edit → MIDI Connections → Input: "loopMIDI Port"`);
      console.error(`\nDetailed error: ${msg}`);
    } else {
      console.error(`\nError: ${msg}`);
    }
    process.exit(1);
  } finally {
    await connector.disconnect();
  }
}

async function cmdSing(args: string[]): Promise<void> {
  const songId = args[0];
  if (!songId) {
    console.error("Usage: pianoai sing <song-id> [--mode note-names|solfege|contour|syllables] [--hand right|left|both] [--speed N] [--tempo N] [--with-piano] [--sync concurrent|before]");
    process.exit(1);
  }
  const song = getSong(songId);
  if (!song) {
    console.error(`Song not found: "${songId}". Run 'pianoai list' to see available songs.`);
    process.exit(1);
  }

  // Parse flags
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

  console.log(`\nConnecting to MIDI...`);
  const connector = createVmpkConnector(
    portName ? { portName } : undefined
  );

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

    if (msg.includes("Failed to connect to MIDI") || msg.includes("MIDI port not connected")) {
      console.error(`\n❌ MIDI Connection Failed`);
      console.error(`\nTo play through VMPK, you need:`);
      console.error(`  1. loopMIDI running with a virtual port (e.g. "loopMIDI Port")`);
      console.error(`     → Download: https://www.tobias-erichsen.de/software/loopmidi.html`);
      console.error(`  2. VMPK listening on that port`);
      console.error(`     → Download: https://vmpk.sourceforge.io/`);
      console.error(`     → VMPK → Edit → MIDI Connections → Input: "loopMIDI Port"`);
      console.error(`\nDetailed error: ${msg}`);
    } else {
      console.error(`\nError: ${msg}`);
    }
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
pianoai — AI-powered piano teaching via MIDI

Commands:
  list [--genre <genre>]     List available songs
  info <song-id>             Show song details and teaching notes
  play <song-id> [options]   Play a song through VMPK
  sing <song-id> [options]   Sing along — narrate notes during playback
  stats                      Registry statistics
  ports                      List MIDI output ports
  help                       Show this help

Play options:
  --port <name>              MIDI port name (default: auto-detect loopMIDI)
  --tempo <bpm>              Override tempo (10-400 BPM)
  --speed <mult>             Speed multiplier (0.5 = half, 1.0 = normal, 2.0 = double)
  --mode <mode>              Playback mode: full, measure, hands, loop

Sing options:
  --port <name>              MIDI port name (default: auto-detect loopMIDI)
  --tempo <bpm>              Override tempo (10-400 BPM)
  --speed <mult>             Speed multiplier (0.5 = half, 1.0 = normal, 2.0 = double)
  --mode <mode>              Sing-along mode: note-names, solfege, contour, syllables
  --hand <hand>              Which hand: right, left, both
  --with-piano               Play piano accompaniment while singing
  --sync <mode>              Voice+piano sync: concurrent (default), before

Examples:
  pianoai list --genre jazz
  pianoai info autumn-leaves
  pianoai play moonlight-sonata-mvt1 --tempo 48
  pianoai play basic-12-bar-blues --mode measure
  pianoai play let-it-be --speed 0.5               # half speed practice
  pianoai play dream-on --speed 0.75 --mode hands   # slow hands-separate
  pianoai sing let-it-be --mode note-names           # narrate note names
  pianoai sing fur-elise --mode solfege --hand both  # solfege, both hands
  pianoai sing let-it-be --with-piano               # sing + piano together
  pianoai sing fur-elise --with-piano --sync before # voice first, then piano
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
