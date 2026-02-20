// ─── Timing & Scheduling Utilities ──────────────────────────────────────────
//
// Helpers for MIDI playback timing calculations.
// ─────────────────────────────────────────────────────────────────────────────

import type { MidiNoteEvent } from "../midi/types.js";

/** A scheduled event with wall-clock time in milliseconds. */
export interface ScheduledEvent extends MidiNoteEvent {
  /** When to fire noteOn, in ms from playback start. */
  scheduledOnMs: number;
  /** When to fire noteOff, in ms from playback start. */
  scheduledOffMs: number;
}

/**
 * Calculate scheduled wall-clock times for all events.
 *
 * @param events Sorted note events with absolute time in seconds.
 * @param speed Speed multiplier (1.0 = normal).
 * @returns Events with scheduledOnMs and scheduledOffMs.
 */
export function calculateSchedule(
  events: readonly MidiNoteEvent[],
  speed: number = 1.0
): ScheduledEvent[] {
  return events.map((e) => ({
    ...e,
    scheduledOnMs: (e.time / speed) * 1000,
    scheduledOffMs: ((e.time + e.duration) / speed) * 1000,
  }));
}

/**
 * Get the total playback duration in milliseconds at a given speed.
 */
export function totalDurationMs(
  events: readonly MidiNoteEvent[],
  speed: number = 1.0
): number {
  if (events.length === 0) return 0;
  const last = events[events.length - 1];
  return ((last.time + last.duration) / speed) * 1000;
}

/**
 * Group events into time clusters (events within `thresholdMs` of each other).
 * Useful for chord detection or batch scheduling.
 */
export function clusterEvents(
  events: readonly MidiNoteEvent[],
  thresholdMs: number = 5
): MidiNoteEvent[][] {
  if (events.length === 0) return [];

  const thresholdSec = thresholdMs / 1000;
  const clusters: MidiNoteEvent[][] = [];
  let current: MidiNoteEvent[] = [events[0]];

  for (let i = 1; i < events.length; i++) {
    if (events[i].time - events[i - 1].time <= thresholdSec) {
      current.push(events[i]);
    } else {
      clusters.push(current);
      current = [events[i]];
    }
  }
  clusters.push(current);

  return clusters;
}

/**
 * Slice events to a time range (in seconds, at speed 1.0).
 * Returns events where time >= startSec and time < endSec.
 */
export function sliceEventsByTime(
  events: readonly MidiNoteEvent[],
  startSec: number,
  endSec: number
): MidiNoteEvent[] {
  return events.filter((e) => e.time >= startSec && e.time < endSec);
}
