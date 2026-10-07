import { afterEach, describe, expect, it, vi } from "vitest";

const jzz = vi.hoisted(() => {
  const api = vi.fn();
  return { api };
});

vi.mock("jzz", () => ({ default: jzz.api }));

import { createVmpkConnector } from "./vmpk.js";

interface Port {
  send: (bytes: number[]) => void;
  close: () => void;
}

function harness() {
  const sent: number[][] = [];
  const opened: unknown[] = [];
  let outputs: Array<{ name?: string; id?: string }> = [];
  let infoThrows = false;
  let closeThrows = false;
  let engineClosed = false;
  let portClosed = false;
  const sendThrowsFor = new Set<number>();
  const openThrowsFor = new Set<string>();
  const engine = {
    info() {
      if (infoThrows) throw new Error("info failed");
      return { outputs };
    },
    openMidiOut(name: unknown) {
      opened.push(name);
      const label = name instanceof RegExp ? name.toString() : String(name);
      if (openThrowsFor.has(label)) throw new Error(`cannot open ${label}`);
      const port: Port = {
        send(bytes) {
          if (sendThrowsFor.has(bytes[0] ?? -1)) throw new Error("send failed");
          sent.push([...bytes]);
        },
        close() {
          if (closeThrows) throw new Error("close failed");
          portClosed = true;
        },
      };
      return port;
    },
    close() {
      if (closeThrows) throw new Error("engine close failed");
      engineClosed = true;
    },
  };
  jzz.api.mockImplementation(async () => engine);
  return {
    sent,
    opened,
    set outputs(value: Array<{ name?: string; id?: string }>) {
      outputs = value;
    },
    set infoThrows(value: boolean) {
      infoThrows = value;
    },
    set closeThrows(value: boolean) {
      closeThrows = value;
    },
    get engineClosed() {
      return engineClosed;
    },
    get portClosed() {
      return portClosed;
    },
    sendThrowsFor,
    openThrowsFor,
  };
}

describe("createVmpkConnector", () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    err.mockClear();
    jzz.api.mockReset();
    vi.useRealTimers();
  });

  it("prefers a loop port over wavetable", async () => {
    const h = harness();
    h.outputs = [{ name: "Microsoft GS Wavetable Synth" }, { name: "loopMIDI Port" }];
    const midi = createVmpkConnector();
    await midi.connect();
    expect(h.opened).toEqual(["loopMIDI Port"]);
    expect(err).toHaveBeenCalledWith("MIDI connected: loopMIDI Port");
    expect(midi.status()).toBe("connected");
  });

  it("skips a preferred port that fails to open and uses the next one", async () => {
    const h = harness();
    h.outputs = [{ name: "loopMIDI Port" }, { name: "Microsoft GS Wavetable Synth" }];
    h.openThrowsFor.add("loopMIDI Port");
    const midi = createVmpkConnector();
    await midi.connect();
    expect(h.opened).toEqual(["loopMIDI Port", "Microsoft GS Wavetable Synth"]);
    expect(err).toHaveBeenCalledWith("MIDI connected: Microsoft GS Wavetable Synth");
  });

  it("opens the first port when none of the preferred names match", async () => {
    const h = harness();
    h.outputs = [{ id: "port-id" }];
    const midi = createVmpkConnector();
    await midi.connect();
    expect(h.opened).toEqual(["port-id"]);
    expect(midi.listPorts()).toEqual(["port-id"]);
  });

  it("names an output with neither name nor id as (unnamed)", async () => {
    const h = harness();
    h.outputs = [{}];
    const midi = createVmpkConnector();
    await midi.connect();
    expect(h.opened).toEqual(["(unnamed)"]);
    expect(err).toHaveBeenCalledWith("MIDI connected: (unnamed)");
  });

  it("opens a requested string port", async () => {
    const h = harness();
    h.outputs = [{ name: "loopMIDI Port" }];
    const midi = createVmpkConnector({ portName: "My Port" });
    await midi.connect();
    expect(h.opened).toEqual(["My Port"]);
    expect(err).toHaveBeenCalledWith("MIDI connected: My Port");
  });

  it("opens a requested regular expression and records the matching port name", async () => {
    const h = harness();
    h.outputs = [{ name: "loopMIDI Port" }, { name: "other" }];
    const pattern = /loop/i;
    const midi = createVmpkConnector({ portName: pattern });
    await midi.connect();
    expect(h.opened).toEqual([pattern]);
    expect(err).toHaveBeenCalledWith("MIDI connected: loopMIDI Port");
  });

  it("uses the regular expression text when no listed port matches it", async () => {
    const h = harness();
    h.outputs = [{ name: "other" }];
    const pattern = /missing/i;
    const midi = createVmpkConnector({ portName: pattern });
    await midi.connect();
    expect(err).toHaveBeenCalledWith("MIDI connected: /missing/i");
  });

  it("rejects auto-detect when no MIDI output exists", async () => {
    const h = harness();
    h.outputs = [];
    const midi = createVmpkConnector();
    await expect(midi.connect()).rejects.toThrow(
      "Failed to connect to MIDI output (auto-detect). Available ports: (none). Error: No MIDI output ports available",
    );
    expect(midi.status()).toBe("error");
  });

  it("rejects a named port whose open throws, and lists the ports it could see", async () => {
    const h = harness();
    h.outputs = [{ name: "only" }];
    h.openThrowsFor.add("missing-port");
    const midi = createVmpkConnector({ portName: "missing-port" });
    await expect(midi.connect()).rejects.toThrow(
      'Failed to connect to MIDI output "missing-port". Available ports: only. Error: cannot open missing-port',
    );
    expect(midi.status()).toBe("error");
  });

  it("does not open a second port when already connected", async () => {
    const h = harness();
    h.outputs = [{ name: "loopMIDI Port" }];
    const midi = createVmpkConnector();
    await midi.connect();
    await midi.connect();
    expect(h.opened).toEqual(["loopMIDI Port"]);
    expect(jzz.api).toHaveBeenCalledTimes(1);
  });

  it("refuses noteOn and noteOff before connect", async () => {
    harness();
    const midi = createVmpkConnector();
    expect(() => midi.noteOn(60, 80)).toThrow("MIDI port not connected");
    expect(() => midi.noteOff(60)).toThrow("MIDI port not connected");
    expect(midi.status()).toBe("disconnected");
  });

  it("rejects noteOn and noteOff values outside 0-127", async () => {
    const h = harness();
    h.outputs = [{ name: "loopMIDI Port" }];
    const midi = createVmpkConnector();
    await midi.connect();
    expect(() => midi.noteOn(128, 80)).toThrow(
      "noteOn: note and velocity must be finite values 0-127: got note=128, velocity=80",
    );
    expect(() => midi.noteOff(Number.NaN)).toThrow(
      "noteOff: note must be a finite value 0-127: got note=NaN",
    );
    expect(h.sent).toEqual([]);
  });

  it("sends noteOn and noteOff on the requested channel", async () => {
    const h = harness();
    h.outputs = [{ name: "loopMIDI Port" }];
    const midi = createVmpkConnector({ channel: 0 });
    await midi.connect();
    midi.noteOn(60, 80, 2);
    midi.noteOff(60, 2);
    expect(h.sent).toEqual([
      [0x92, 60, 80],
      [0x82, 60, 0],
    ]);
  });

  it("allNotesOff does nothing while disconnected", () => {
    const h = harness();
    const midi = createVmpkConnector();
    expect(() => midi.allNotesOff()).not.toThrow();
    expect(h.sent).toEqual([]);
    expect(midi.status()).toBe("disconnected");
  });

  it("sends all-notes-off on every channel, then closes, ignoring a send or close that throws", async () => {
    const h = harness();
    h.outputs = [{ name: "loopMIDI Port" }];
    h.sendThrowsFor.add(0xb3);
    h.closeThrows = true;
    const midi = createVmpkConnector();
    await midi.connect();
    await midi.disconnect();
    const offs = h.sent.filter((b) => b[1] === 123);
    expect(offs).toHaveLength(15);
    expect(offs.some((b) => b[0] === 0xb3)).toBe(false);
    expect(midi.status()).toBe("disconnected");
    expect(midi.listPorts()).toEqual([]);
  });

  it("lists no ports when the engine info call throws", async () => {
    const h = harness();
    h.outputs = [{ name: "loopMIDI Port" }];
    const midi = createVmpkConnector();
    await midi.connect();
    h.infoThrows = true;
    expect(midi.listPorts()).toEqual([]);
  });

  it("waits out a rest without sending, then plays a note across the duration", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.outputs = [{ name: "loopMIDI Port" }];
    const midi = createVmpkConnector();
    await midi.connect();
    const rest = midi.playNote({ note: -1, velocity: 0, durationMs: 40, channel: 0 });
    await vi.advanceTimersByTimeAsync(40);
    await rest;
    expect(h.sent).toEqual([]);
    const played = midi.playNote({ note: 60, velocity: 100, durationMs: 25, channel: 0 });
    expect(h.sent).toEqual([[0x90, 60, 100]]);
    await vi.advanceTimersByTimeAsync(25);
    await played;
    expect(h.sent).toEqual([
      [0x90, 60, 100],
      [0x80, 60, 0],
    ]);
  });
});
