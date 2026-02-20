// ─── piano-sessions-ai: Session Engine ──────────────────────────────────────
//
// Manages the playback session: load a song, parse measures, play through
// VMPK via the connector, track progress, handle pause/resume/stop.
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry } from "ai-music-sheets";
import type {
  Session,
  SessionOptions,
  SessionState,
  PlayableMeasure,
  Beat,
  VmpkConnector,
} from "./types.js";
import { parseMeasure } from "./note-parser.js";

let sessionCounter = 0;

/**
 * Create a new practice session for a song.
 */
export function createSession(
  song: SongEntry,
  connector: VmpkConnector,
  options: SessionOptions = {}
): SessionController {
  const session: Session = {
    id: `session-${++sessionCounter}`,
    song,
    state: "loaded",
    mode: options.mode ?? "full",
    currentMeasure: 0,
    tempoOverride: options.tempo ?? null,
    loopRange: options.loopRange ?? null,
    startedAt: new Date(),
    measuresPlayed: 0,
    voiceEnabled: options.voice ?? true,
  };

  return new SessionController(session, connector);
}

/**
 * Session controller — the main runtime interface for a practice session.
 *
 * Holds the session state + connector, provides play/pause/stop/skip methods.
 */
export class SessionController {
  private abortController: AbortController | null = null;
  private playableMeasures: PlayableMeasure[] = [];

  constructor(
    public readonly session: Session,
    private readonly connector: VmpkConnector
  ) {
    // Pre-parse all measures at session creation
    const bpm = this.effectiveTempo();
    this.playableMeasures = session.song.measures.map((m) =>
      parseMeasure(m, bpm)
    );
  }

  /** Effective tempo (override or song default). */
  effectiveTempo(): number {
    return this.session.tempoOverride ?? this.session.song.tempo;
  }

  /** Get current state. */
  get state(): SessionState {
    return this.session.state;
  }

  /** Get the current measure (1-based for display). */
  get currentMeasureDisplay(): number {
    return this.session.currentMeasure + 1;
  }

  /** Total measures in the song. */
  get totalMeasures(): number {
    return this.session.song.measures.length;
  }

  /**
   * Play the session from the current position.
   *
   * In "full" mode: plays all remaining measures.
   * In "measure" mode: plays one measure and pauses.
   * In "loop" mode: loops the specified range.
   * In "hands" mode: plays RH, then LH, then both for each measure.
   */
  async play(): Promise<void> {
    if (this.session.state === "playing") return;
    if (this.session.state === "finished") {
      // Restart from beginning
      this.session.currentMeasure = 0;
    }

    this.session.state = "playing";
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      switch (this.session.mode) {
        case "full":
          await this.playRange(
            this.session.currentMeasure,
            this.totalMeasures - 1,
            signal
          );
          break;

        case "measure":
          await this.playRange(
            this.session.currentMeasure,
            this.session.currentMeasure,
            signal
          );
          this.session.state = "paused";
          return;

        case "loop": {
          const [start, end] = this.session.loopRange ?? [1, this.totalMeasures];
          const startIdx = start - 1; // convert to 0-based
          const endIdx = end - 1;
          // Loop forever until stopped
          while (!signal.aborted) {
            await this.playRange(startIdx, endIdx, signal);
            this.session.currentMeasure = startIdx;
          }
          break;
        }

        case "hands":
          await this.playHandsSeparate(
            this.session.currentMeasure,
            signal
          );
          this.session.state = "paused";
          return;
      }

      if (!signal.aborted) {
        this.session.state = "finished";
      }
    } catch (err) {
      if (signal.aborted) {
        // Expected — user stopped playback
        return;
      }
      throw err;
    }
  }

  /** Pause playback. */
  pause(): void {
    if (this.session.state !== "playing") return;
    this.abortController?.abort();
    this.session.state = "paused";
    this.connector.allNotesOff();
  }

  /** Stop playback and reset to beginning. */
  stop(): void {
    this.abortController?.abort();
    this.session.state = "idle";
    this.session.currentMeasure = 0;
    this.connector.allNotesOff();
  }

  /** Skip to next measure (in measure/hands mode). */
  next(): void {
    if (this.session.currentMeasure < this.totalMeasures - 1) {
      this.session.currentMeasure++;
    }
  }

  /** Go back to previous measure. */
  prev(): void {
    if (this.session.currentMeasure > 0) {
      this.session.currentMeasure--;
    }
  }

  /** Jump to a specific measure (1-based). */
  goTo(measureNumber: number): void {
    const idx = measureNumber - 1;
    if (idx >= 0 && idx < this.totalMeasures) {
      this.session.currentMeasure = idx;
    }
  }

  /** Set tempo override. */
  setTempo(bpm: number): void {
    this.session.tempoOverride = bpm;
    // Re-parse measures with new tempo
    this.playableMeasures = this.session.song.measures.map((m) =>
      parseMeasure(m, bpm)
    );
  }

  /** Get a summary of the current session state. */
  summary(): string {
    const s = this.session;
    const lines = [
      `Session: ${s.id}`,
      `Song: ${s.song.title} (${s.song.composer ?? "Traditional"})`,
      `Genre: ${s.song.genre} | Key: ${s.song.key} | Tempo: ${this.effectiveTempo()} BPM`,
      `Mode: ${s.mode} | State: ${s.state}`,
      `Progress: measure ${this.currentMeasureDisplay} / ${this.totalMeasures}`,
      `Measures played: ${s.measuresPlayed}`,
    ];
    return lines.join("\n");
  }

  // ─── Internal playback ──────────────────────────────────────────────────

  /**
   * Play a range of measures (inclusive, 0-based indices).
   */
  private async playRange(
    startIdx: number,
    endIdx: number,
    signal: AbortSignal
  ): Promise<void> {
    for (let i = startIdx; i <= endIdx; i++) {
      if (signal.aborted) return;

      this.session.currentMeasure = i;
      const pm = this.playableMeasures[i];

      // Play right and left hand simultaneously
      await this.playMeasure(pm, signal);
      this.session.measuresPlayed++;
    }
  }

  /**
   * Play a single measure — both hands in parallel.
   */
  private async playMeasure(
    pm: PlayableMeasure,
    signal: AbortSignal
  ): Promise<void> {
    // Play both hands simultaneously
    await Promise.all([
      this.playBeats(pm.rightBeats, signal),
      this.playBeats(pm.leftBeats, signal),
    ]);
  }

  /**
   * Play a sequence of beats serially.
   */
  private async playBeats(
    beats: Beat[],
    signal: AbortSignal
  ): Promise<void> {
    for (const beat of beats) {
      if (signal.aborted) return;

      // Play all notes in this beat simultaneously
      const notePromises = beat.notes.map((n) => this.connector.playNote(n));
      await Promise.all(notePromises);
    }
  }

  /**
   * Play hands separately then together (for "hands" mode).
   */
  private async playHandsSeparate(
    measureIdx: number,
    signal: AbortSignal
  ): Promise<void> {
    const pm = this.playableMeasures[measureIdx];

    // Right hand alone
    await this.playBeats(pm.rightBeats, signal);
    if (signal.aborted) return;

    // Left hand alone
    await this.playBeats(pm.leftBeats, signal);
    if (signal.aborted) return;

    // Both together
    await this.playMeasure(pm, signal);
    this.session.measuresPlayed++;
  }
}
