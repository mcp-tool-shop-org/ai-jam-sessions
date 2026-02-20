// ─── pianai: Teaching Engine ─────────────────────────────────────────────────
//
// Provides TeachingHook implementations that deliver teaching interjections
// during playback. The session engine calls these hooks at key moments.
//
// Implementations:
//   - ConsoleTeachingHook: logs to console (development/CLI)
//   - SilentTeachingHook: no-op (testing/benchmarks)
//   - CallbackTeachingHook: routes to custom callbacks (MCP/voice/aside)
// ─────────────────────────────────────────────────────────────────────────────

import type {
  TeachingHook,
  TeachingInterjection,
  TeachingPriority,
  VoiceDirective,
  VoiceSink,
  AsideDirective,
  AsideSink,
} from "./types.js";
import type { SongEntry } from "ai-music-sheets";

// ─── Console Hook (CLI / development) ───────────────────────────────────────

/**
 * Logs teaching interjections to the console.
 * Good for CLI mode and development.
 */
export function createConsoleTeachingHook(): TeachingHook {
  return {
    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      const parts: string[] = [`  [Measure ${measureNumber}]`];
      if (dynamics) parts.push(`(${dynamics})`);
      if (teachingNote) parts.push(`— ${teachingNote}`);
      console.log(parts.join(" "));
    },

    async onKeyMoment(moment) {
      console.log(`  ★ ${moment}`);
    },

    async onSongComplete(measuresPlayed, songTitle) {
      console.log(`\n  ✓ Finished "${songTitle}" — ${measuresPlayed} measures played.`);
    },

    async push(interjection) {
      const prefix =
        interjection.priority === "high" ? "❗" :
        interjection.priority === "med" ? "💡" : "ℹ️";
      console.log(`  ${prefix} ${interjection.text}`);
    },
  };
}

// ─── Silent Hook (testing) ──────────────────────────────────────────────────

/**
 * No-op hook — swallows all interjections.
 * Use in tests where you don't want console noise.
 */
export function createSilentTeachingHook(): TeachingHook {
  return {
    async onMeasureStart() {},
    async onKeyMoment() {},
    async onSongComplete() {},
    async push() {},
  };
}

// ─── Recording Hook (testing) ───────────────────────────────────────────────

/** A recorded teaching event for assertions. */
export interface TeachingEvent {
  type: "measure-start" | "key-moment" | "song-complete" | "push";
  measureNumber?: number;
  teachingNote?: string;
  dynamics?: string;
  moment?: string;
  measuresPlayed?: number;
  songTitle?: string;
  interjection?: TeachingInterjection;
}

/**
 * Records all teaching events for test assertions.
 * Use: `const hook = createRecordingTeachingHook(); ... hook.events`
 */
export function createRecordingTeachingHook(): TeachingHook & { events: TeachingEvent[] } {
  const events: TeachingEvent[] = [];

  return {
    events,

    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      events.push({ type: "measure-start", measureNumber, teachingNote, dynamics });
    },

    async onKeyMoment(moment) {
      events.push({ type: "key-moment", moment });
    },

    async onSongComplete(measuresPlayed, songTitle) {
      events.push({ type: "song-complete", measuresPlayed, songTitle });
    },

    async push(interjection) {
      events.push({ type: "push", interjection });
    },
  };
}

// ─── Callback Hook (flexible routing) ───────────────────────────────────────

/** Callbacks for a custom teaching hook. All optional — unset = no-op. */
export interface TeachingCallbacks {
  onMeasureStart?: (measureNumber: number, teachingNote?: string, dynamics?: string) => Promise<void>;
  onKeyMoment?: (moment: string) => Promise<void>;
  onSongComplete?: (measuresPlayed: number, songTitle: string) => Promise<void>;
  onPush?: (interjection: TeachingInterjection) => Promise<void>;
}

/**
 * Routes teaching events to custom callbacks.
 * Use this to wire to mcp-voice-soundboard, mcp-aside, or any other sink.
 */
export function createCallbackTeachingHook(callbacks: TeachingCallbacks): TeachingHook {
  return {
    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      await callbacks.onMeasureStart?.(measureNumber, teachingNote, dynamics);
    },
    async onKeyMoment(moment) {
      await callbacks.onKeyMoment?.(moment);
    },
    async onSongComplete(measuresPlayed, songTitle) {
      await callbacks.onSongComplete?.(measuresPlayed, songTitle);
    },
    async push(interjection) {
      await callbacks.onPush?.(interjection);
    },
  };
}

// ─── Voice Hook (mcp-voice-soundboard) ──────────────────────────────────────

/** Options for the voice teaching hook. */
export interface VoiceHookOptions {
  /** Voice preset name for teaching (default: undefined = server default). */
  voice?: string;

  /** Speech speed (default: 1.0). */
  speechSpeed?: number;

  /** Speak teaching notes at measure start (default: true). */
  speakTeachingNotes?: boolean;

  /** Speak key moments (default: true). */
  speakKeyMoments?: boolean;

  /** Speak completion message (default: true). */
  speakCompletion?: boolean;

  /** Block playback while speaking (default: false for notes, true for key moments). */
  blockOnKeyMoments?: boolean;
}

/**
 * Voice teaching hook — produces VoiceDirective objects routed to a VoiceSink.
 *
 * The sink can be:
 * - A real mcp-voice-soundboard call (via LLM tool routing)
 * - A console.log wrapper (for CLI testing)
 * - A recording array (for unit tests)
 *
 * Also records all directives for inspection.
 */
export function createVoiceTeachingHook(
  sink: VoiceSink,
  options: VoiceHookOptions = {}
): TeachingHook & { directives: VoiceDirective[] } {
  const {
    voice,
    speechSpeed = 1.0,
    speakTeachingNotes = true,
    speakKeyMoments = true,
    speakCompletion = true,
    blockOnKeyMoments = true,
  } = options;

  const directives: VoiceDirective[] = [];

  async function emit(directive: VoiceDirective): Promise<void> {
    directives.push(directive);
    await sink(directive);
  }

  return {
    directives,

    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      if (!speakTeachingNotes || !teachingNote) return;

      const dynamicsPart = dynamics ? ` Play ${dynamics}.` : "";
      await emit({
        text: `Measure ${measureNumber}.${dynamicsPart} ${teachingNote}`,
        voice,
        speed: speechSpeed,
        blocking: false, // don't block on routine notes
      });
    },

    async onKeyMoment(moment) {
      if (!speakKeyMoments) return;

      await emit({
        text: moment,
        voice,
        speed: speechSpeed,
        blocking: blockOnKeyMoments,
      });
    },

    async onSongComplete(measuresPlayed, songTitle) {
      if (!speakCompletion) return;

      await emit({
        text: `Great work! You finished ${songTitle}. ${measuresPlayed} measures played.`,
        voice,
        speed: speechSpeed,
        blocking: false,
      });
    },

    async push(interjection) {
      const urgency = interjection.priority === "high" ? "Important: " : "";
      await emit({
        text: `${urgency}${interjection.text}`,
        voice,
        speed: speechSpeed,
        blocking: interjection.priority === "high",
      });
    },
  };
}

// ─── Aside Hook (mcp-aside interjections) ───────────────────────────────────

/** Options for the aside teaching hook. */
export interface AsideHookOptions {
  /** Push teaching notes to aside (default: true). */
  pushTeachingNotes?: boolean;

  /** Push key moments to aside (default: true). */
  pushKeyMoments?: boolean;

  /** Push completion to aside (default: true). */
  pushCompletion?: boolean;

  /** Base tags added to all directives. */
  baseTags?: string[];
}

/**
 * Aside teaching hook — produces AsideDirective objects routed to an AsideSink.
 *
 * The sink can be:
 * - A real mcp-aside push (via aside_push tool)
 * - A recording array (for tests)
 *
 * Records all directives for inspection.
 */
export function createAsideTeachingHook(
  sink: AsideSink,
  options: AsideHookOptions = {}
): TeachingHook & { directives: AsideDirective[] } {
  const {
    pushTeachingNotes = true,
    pushKeyMoments = true,
    pushCompletion = true,
    baseTags = ["piano-teacher"],
  } = options;

  const directives: AsideDirective[] = [];

  async function emit(directive: AsideDirective): Promise<void> {
    directives.push(directive);
    await sink(directive);
  }

  return {
    directives,

    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      if (!pushTeachingNotes || !teachingNote) return;

      const dynamicsPart = dynamics ? ` (${dynamics})` : "";
      await emit({
        text: `Measure ${measureNumber}${dynamicsPart}: ${teachingNote}`,
        priority: "low",
        reason: "measure-start",
        source: `measure-${measureNumber}`,
        tags: [...baseTags, "teaching-note"],
      });
    },

    async onKeyMoment(moment) {
      if (!pushKeyMoments) return;

      await emit({
        text: moment,
        priority: "med",
        reason: "key-moment",
        tags: [...baseTags, "key-moment"],
      });
    },

    async onSongComplete(measuresPlayed, songTitle) {
      if (!pushCompletion) return;

      await emit({
        text: `Finished "${songTitle}" — ${measuresPlayed} measures played.`,
        priority: "low",
        reason: "song-complete",
        tags: [...baseTags, "completion"],
      });
    },

    async push(interjection) {
      await emit({
        text: interjection.text,
        priority: interjection.priority,
        reason: interjection.reason,
        source: interjection.source,
        tags: [...baseTags, interjection.reason],
      });
    },
  };
}

/**
 * Compose multiple teaching hooks into one.
 * Events are dispatched to all hooks in order (serially, not parallel).
 *
 * Example: combine a voice hook + aside hook + recording hook for full coverage.
 */
export function composeTeachingHooks(...hooks: TeachingHook[]): TeachingHook {
  return {
    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      for (const h of hooks) await h.onMeasureStart(measureNumber, teachingNote, dynamics);
    },
    async onKeyMoment(moment) {
      for (const h of hooks) await h.onKeyMoment(moment);
    },
    async onSongComplete(measuresPlayed, songTitle) {
      for (const h of hooks) await h.onSongComplete(measuresPlayed, songTitle);
    },
    async push(interjection) {
      for (const h of hooks) await h.push(interjection);
    },
  };
}

// ─── Key Moment Detector ────────────────────────────────────────────────────

/**
 * Check if the current measure matches any key moments in the song.
 * Key moments in ai-music-sheets reference bars like "Bar 1:", "Bars 3-4:", etc.
 */
export function detectKeyMoments(
  song: SongEntry,
  measureNumber: number
): string[] {
  const matches: string[] = [];
  for (const km of song.musicalLanguage.keyMoments) {
    // Match patterns like "Bar 1:", "Bars 1-2:", "Bar 9:"
    const singleMatch = km.match(/^Bars?\s+(\d+)\s*:/i);
    const rangeMatch = km.match(/^Bars?\s+(\d+)\s*-\s*(\d+)\s*:/i);

    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (measureNumber >= start && measureNumber <= end) {
        matches.push(km);
      }
    } else if (singleMatch) {
      const bar = parseInt(singleMatch[1], 10);
      if (bar === measureNumber) {
        matches.push(km);
      }
    }
  }
  return matches;
}
