import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createSoulxScoreSinger, renderSoulxLead } from "./soulx-singer.js";
import { SCORE_CLOCK_SCHEMA } from "./score-clock.js";

describe("soulx-singer bridge", () => {
  const minimalClock = {
    schema: SCORE_CLOCK_SCHEMA,
    song_id: "test-song",
    bpm: 75,
    time_signature: "3/4",
    sample_rate: 48000,
    total_seconds: 2.0,
    total_samples: 96000,
    last_event_end_sec: 2.0,
    clock: {
      source: "session-nominal" as const,
      bed_measures: [1, 1] as [number, number],
      measure_starts_sec: { "1": 0 },
      measure_durations_sec: { "1": 2.0 },
    },
    midi: {
      file: "test.mid",
      ppq: 384,
      ticks_per_measure: 1152,
      melody_track: "TUBULARBEL",
      sec_per_tick: 0.002083333,
    },
    events: [
      {
        id: "v00",
        lyric: "A",
        word: "A",
        syllable: 0,
        syllables: 1,
        midi: 70,
        t_sec: 0.5,
        t_samples: 24000,
        dur_sec: 1.0,
        anchor: "test",
        midi_tick: 240,
        t_midi_sec: 0.5,
        engine_note: null,
      },
    ],
  };

  it("createSoulxScoreSinger returns a ScoreSinger interface", () => {
    const singer = createSoulxScoreSinger(minimalClock, {});
    expect(typeof singer.connect).toBe("function");
    expect(typeof singer.start).toBe("function");
    expect(typeof singer.stop).toBe("function");
    expect(singer.durationSec).toBeCloseTo(2.15, 2);
    expect(singer.warnings).toEqual([]);
  });

  it("defaults to a bag of 6 takes (no single-take warning before connect)", () => {
    const singer = createSoulxScoreSinger(minimalClock, {});
    expect(singer.warnings).toEqual([]);
  });

  it("accepts an explicit takes count without breaking the interface", () => {
    const singer = createSoulxScoreSinger(minimalClock, { takes: 1 });
    expect(typeof singer.connect).toBe("function");
    expect(singer.durationSec).toBeCloseTo(2.15, 2);
  });

  it("renderSoulxLead refuses when prompt WAV is missing", async () => {
    await expect(
      renderSoulxLead(minimalClock, {
        soulxRoot: "/nonexistent/soulx",
        promptWav: "/nonexistent/prompt.wav",
        promptMeta: "/nonexistent/prompt.json",
      }),
    ).rejects.toThrow(/prompt WAV not found/);
  });

  it("renderSoulxLead refuses when prompt META is missing", async () => {
    // Create a dummy wav file so the WAV check passes but META fails
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const tmp = mkdtempSync(join(tmpdir(), "soulx-test-"));
    const wav = join(tmp, "prompt.wav");
    // Minimal 16-bit mono WAV header + 1 sample
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(46, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // mono
    header.writeUInt16LE(1, 22); // channels
    header.writeUInt32LE(48000, 24); // sr
    header.writeUInt32LE(96000, 28); // byte rate
    header.writeUInt16LE(2, 32); // block align
    header.writeUInt16LE(16, 34); // bits
    header.write("data", 36);
    header.writeUInt32LE(2, 40);
    const data = Buffer.alloc(2);
    writeFileSync(wav, Buffer.concat([header, data]));

    await expect(
      renderSoulxLead(minimalClock, {
        promptWav: wav,
        promptMeta: "/nonexistent/prompt.json",
      }),
    ).rejects.toThrow(/prompt metadata JSON not found/);
  });

  it("auto-discovers the default SoulX example prompt when nothing is configured", async () => {
    const root = process.env.SOULX_ROOT ?? "E:/AI/SoulX-Singer";
    const exampleWav = join(root, "example", "audio", "en_prompt.mp3");
    const exampleMeta = join(root, "example", "audio", "en_prompt.json");

    const hasExample = existsSync(exampleWav) && existsSync(exampleMeta);
    if (!hasExample) {
      // Skip when SoulX is not installed on this machine
      return;
    }

    // Discovery is the claim. A missing interpreter fails at spawn, which
    // proves the example prompt resolved, and does not start the model.
    await expect(
      renderSoulxLead(
        { ...minimalClock, song_id: "soulx-discover-test" },
        {
          soulxRoot: root,
          pythonExecutable: join(root, "python-not-installed-for-this-test"),
          takes: 1,
        },
      ),
    ).rejects.not.toThrow(/prompt WAV not found/);
  });

  it("rejects invalid prompt metadata even when the file exists", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const tmp = mkdtempSync(join(tmpdir(), "soulx-test-"));
    const wav = join(tmp, "prompt.wav");
    const meta = join(tmp, "bad_prompt.json");

    // Dummy WAV
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(46, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(48000, 24);
    header.writeUInt32LE(96000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(2, 40);
    writeFileSync(wav, Buffer.concat([header, Buffer.alloc(2)]));

    // Invalid metadata (not a SoulX segment)
    writeFileSync(meta, JSON.stringify({ notA: "segment" }));

    await expect(
      renderSoulxLead(minimalClock, { promptWav: wav, promptMeta: meta }),
    ).rejects.toThrow(/prompt metadata invalid/);
  });
});
