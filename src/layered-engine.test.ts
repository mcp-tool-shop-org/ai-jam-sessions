import { describe, expect, it, vi } from "vitest";
import { createLayeredEngine } from "./layered-engine.js";
import type { MidiNote, MidiStatus, VmpkConnector } from "./types.js";

function child(overrides: Partial<VmpkConnector> = {}): VmpkConnector {
  return {
    async connect() {},
    async disconnect() {},
    status: () => "connected",
    listPorts: () => ["Port"],
    noteOn() {},
    noteOff() {},
    allNotesOff() {},
    async playNote() {},
    ...overrides,
  };
}

function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error("expected throw");
}

describe("createLayeredEngine", () => {
  it("rejects an empty engine list", () => {
    expect(thrownMessage(() => createLayeredEngine([]))).toBe(
      "createLayeredEngine requires at least one engine",
    );
  });

  it("disconnects engines that already connected when a later connect throws, and keeps the original error", async () => {
    const events: string[] = [];
    const first = child({
      async connect() {
        events.push("connect-1");
      },
      async disconnect() {
        events.push("disconnect-1");
        throw new Error("cleanup failed");
      },
    });
    const second = child({
      async connect() {
        events.push("connect-2");
        throw new Error("port busy");
      },
      async disconnect() {
        events.push("disconnect-2");
      },
    });

    let message = "";
    try {
      await createLayeredEngine([first, second]).connect();
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toBe("port busy");
    expect(events).toEqual(["connect-1", "connect-2", "disconnect-1"]);
  });

  it("reports the worst child status: error, then connecting, then disconnected, else connected", () => {
    const statusOf = (left: MidiStatus, right: MidiStatus): MidiStatus =>
      createLayeredEngine([
        child({ status: () => left }),
        child({ status: () => right }),
      ]).status();

    expect(statusOf("error", "connecting")).toBe("error");
    expect(statusOf("connecting", "disconnected")).toBe("connecting");
    expect(statusOf("disconnected", "connected")).toBe("disconnected");
    expect(statusOf("connected", "connected")).toBe("connected");
  });

  it("prefixes every child port with the layer label", () => {
    const engines = [
      child({ listPorts: () => ["Piano", "Honky"] }),
      child({ listPorts: () => ["Synth"] }),
    ];
    expect(createLayeredEngine(engines).listPorts()).toEqual([
      "Layered:Piano",
      "Layered:Honky",
      "Layered:Synth",
    ]);
    expect(createLayeredEngine([engines[0]!], { label: "Duet" }).listPorts()).toEqual([
      "Duet:Piano",
      "Duet:Honky",
    ]);
  });

  it("logs a noteOn error and still delivers the note to the next child", () => {
    const err = new Error("child deaf");
    const heard: Array<[number, number, number | undefined]> = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const layered = createLayeredEngine([
        child({
          noteOn() {
            throw err;
          },
        }),
        child({
          noteOn(note, velocity, channel) {
            heard.push([note, velocity, channel]);
          },
        }),
      ]);
      layered.noteOn(60, 100, 2);
      expect(heard).toEqual([[60, 100, 2]]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith("Layered engine noteOn error:", err);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("logs a noteOff error and still delivers the note to the next child", () => {
    const err = new Error("child stuck");
    const heard: Array<[number, number | undefined]> = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const layered = createLayeredEngine([
        child({
          noteOff() {
            throw err;
          },
        }),
        child({
          noteOff(note, channel) {
            heard.push([note, channel]);
          },
        }),
      ]);
      layered.noteOff(60, 3);
      expect(heard).toEqual([[60, 3]]);
      expect(errorSpy).toHaveBeenCalledWith("Layered engine noteOff error:", err);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("logs an allNotesOff error and still delivers it to the next child", () => {
    const err = new Error("child panic");
    const heard: Array<number | undefined> = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const layered = createLayeredEngine([
        child({
          allNotesOff() {
            throw err;
          },
        }),
        child({
          allNotesOff(channel) {
            heard.push(channel);
          },
        }),
      ]);
      layered.allNotesOff(4);
      expect(heard).toEqual([4]);
      expect(errorSpy).toHaveBeenCalledWith("Layered engine allNotesOff error:", err);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("logs each rejected playNote with the child index and still finishes the others", async () => {
    const played: MidiNote[] = [];
    const note: MidiNote = { note: 64, velocity: 70, durationMs: 10, channel: 0 };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const layered = createLayeredEngine([
        child({
          async playNote() {
            throw new Error("no breath");
          },
        }),
        child({
          async playNote() {
            throw "dry";
          },
        }),
        child({
          async playNote(incoming) {
            played.push(incoming);
          },
        }),
      ]);
      await layered.playNote(note);
      expect(played).toEqual([note]);
      expect(errorSpy).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith("Layered engine child 0 playNote error: no breath");
      expect(errorSpy).toHaveBeenCalledWith("Layered engine child 1 playNote error: dry");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
