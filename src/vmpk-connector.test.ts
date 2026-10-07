// createVmpkConnector only. jzz is mocked so no MIDI device opens.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MidiNote } from "./types.js";

const midi = vi.hoisted(() => {
  const port = {
    send: vi.fn(),
    close: vi.fn(),
  };
  const engine = {
    openMidiOut: vi.fn(() => port),
    info: vi.fn((): { outputs?: Array<{ name?: string; id?: string }> } => ({ outputs: [] })),
    close: vi.fn(),
  };
  const JZZ = vi.fn(async () => engine);
  return { port, engine, JZZ };
});

vi.mock("jzz", () => ({
  default: midi.JZZ,
}));

import { createVmpkConnector } from "./vmpk.js";

async function rejectionOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error("expected rejection");
}

function thrownBy(run: () => void): string {
  try {
    run();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error("expected throw");
}

function outputs(names: string[]): { outputs: Array<{ name: string }> } {
  return { outputs: names.map((name) => ({ name })) };
}

const LOOP = "loopMIDI Port";
const WAVETABLE = "Microsoft GS Wavetable Synth";

describe("createVmpkConnector", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    midi.port.send.mockReset();
    midi.port.close.mockReset();
    midi.engine.close.mockReset();
    midi.engine.openMidiOut.mockReset();
    midi.engine.openMidiOut.mockImplementation(() => midi.port);
    midi.engine.info.mockReset();
    midi.engine.info.mockReturnValue({ outputs: [] });
    midi.JZZ.mockReset();
    midi.JZZ.mockImplementation(async () => midi.engine);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.useRealTimers();
  });

  it("auto-detect chooses the loop port over wavetable", async () => {
    midi.engine.info.mockReturnValue(outputs([WAVETABLE, LOOP]));
    const connector = createVmpkConnector();

    let release: (engine: unknown) => void = () => {};
    midi.JZZ.mockImplementation(() => new Promise((resolve) => {
      release = resolve;
    }));
    const pending = connector.connect();
    expect(connector.status()).toBe("connecting");
    release(midi.engine);
    await pending;

    expect(connector.status()).toBe("connected");
    expect(midi.engine.openMidiOut).toHaveBeenCalledTimes(1);
    expect(midi.engine.openMidiOut).toHaveBeenCalledWith(LOOP);
    expect(errorSpy).toHaveBeenCalledWith(`MIDI connected: ${LOOP}`);
  });

  it("opens a specific portName string and does not auto-select loop", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP, "Exact Port"]));
    const connector = createVmpkConnector({ portName: "Exact Port" });
    await connector.connect();

    expect(midi.engine.openMidiOut).toHaveBeenCalledTimes(1);
    expect(midi.engine.openMidiOut).toHaveBeenCalledWith("Exact Port");
    expect(errorSpy).toHaveBeenCalledWith("MIDI connected: Exact Port");
    expect(connector.status()).toBe("connected");
  });

  it("passes a RegExp portName through to openMidiOut and logs the matching port", async () => {
    const pattern = /loop/i;
    midi.engine.info.mockReturnValue(outputs([WAVETABLE, LOOP]));
    const connector = createVmpkConnector({ portName: pattern });
    await connector.connect();

    expect(midi.engine.openMidiOut).toHaveBeenCalledTimes(1);
    expect(midi.engine.openMidiOut.mock.calls[0]?.[0]).toBe(pattern);
    expect(errorSpy).toHaveBeenCalledWith(`MIDI connected: ${LOOP}`);
  });

  it("logs the RegExp text when no listed port matches", async () => {
    const pattern = /loop/i;
    midi.engine.info.mockReturnValue(outputs([WAVETABLE]));
    const connector = createVmpkConnector({ portName: pattern });
    await connector.connect();

    expect(midi.engine.openMidiOut.mock.calls[0]?.[0]).toBe(pattern);
    expect(errorSpy).toHaveBeenCalledWith("MIDI connected: /loop/i");
  });

  it("rejects auto-detect when no MIDI output ports exist", async () => {
    midi.engine.info.mockReturnValue({ outputs: [] });
    const connector = createVmpkConnector();

    expect(await rejectionOf(connector.connect())).toBe(
      "Failed to connect to MIDI output (auto-detect). Available ports: (none). Error: No MIDI output ports available",
    );
    expect(connector.status()).toBe("error");
    expect(midi.engine.openMidiOut).not.toHaveBeenCalled();
  });

  it("wraps a string-port open failure with the quoted port name", async () => {
    midi.engine.info.mockReturnValue(outputs(["Exact Port", LOOP]));
    midi.engine.openMidiOut.mockImplementation(() => {
      throw new Error("device missing");
    });
    const connector = createVmpkConnector({ portName: "Exact Port" });

    expect(await rejectionOf(connector.connect())).toBe(
      'Failed to connect to MIDI output "Exact Port". Available ports: Exact Port, loopMIDI Port. Error: device missing',
    );
    expect(connector.status()).toBe("error");
  });

  it("wraps a RegExp-port open failure with the pattern text", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP]));
    midi.engine.openMidiOut.mockImplementation(() => {
      throw new Error("device missing");
    });
    const connector = createVmpkConnector({ portName: /loop/i });

    expect(await rejectionOf(connector.connect())).toBe(
      "Failed to connect to MIDI output /loop/i. Available ports: loopMIDI Port. Error: device missing",
    );
    expect(connector.status()).toBe("error");
  });

  it("reports no ports when JZZ itself rejects", async () => {
    midi.JZZ.mockImplementation(async () => {
      throw new Error("jzz unavailable");
    });
    const connector = createVmpkConnector();

    expect(await rejectionOf(connector.connect())).toBe(
      "Failed to connect to MIDI output (auto-detect). Available ports: (none). Error: jzz unavailable",
    );
    expect(connector.status()).toBe("error");
    expect(connector.listPorts()).toEqual([]);
  });

  it("skips a preferred port whose open throws and uses the next preference", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP, WAVETABLE]));
    midi.engine.openMidiOut.mockImplementation((name: string) => {
      if (name === LOOP) throw new Error("busy");
      return midi.port;
    });
    const connector = createVmpkConnector();
    await connector.connect();

    expect(midi.engine.openMidiOut.mock.calls.map((call) => call[0])).toEqual([LOOP, WAVETABLE]);
    expect(errorSpy).toHaveBeenCalledWith(`MIDI connected: ${WAVETABLE}`);
    expect(connector.status()).toBe("connected");
  });

  it("opens the first port when none of the preferred names match", async () => {
    midi.engine.info.mockReturnValue(outputs(["Weird Device"]));
    const connector = createVmpkConnector();
    await connector.connect();

    expect(midi.engine.openMidiOut).toHaveBeenCalledTimes(1);
    expect(midi.engine.openMidiOut).toHaveBeenCalledWith("Weird Device");
    expect(errorSpy).toHaveBeenCalledWith("MIDI connected: Weird Device");
  });

  it("does not open a second port when connect is called while already connected", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP]));
    const connector = createVmpkConnector();
    await connector.connect();
    midi.engine.openMidiOut.mockClear();
    midi.JZZ.mockClear();
    errorSpy.mockClear();

    await connector.connect();

    expect(midi.engine.openMidiOut).not.toHaveBeenCalled();
    expect(midi.JZZ).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(connector.status()).toBe("connected");
  });

  it("throws MIDI port not connected from noteOn and noteOff before connect", () => {
    const connector = createVmpkConnector();
    expect(thrownBy(() => connector.noteOn(60, 80))).toBe("MIDI port not connected");
    expect(thrownBy(() => connector.noteOff(60))).toBe("MIDI port not connected");
    expect(midi.port.send).not.toHaveBeenCalled();
  });

  it("rejects noteOn 128 and noteOff NaN with the source templates", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP]));
    const connector = createVmpkConnector();
    await connector.connect();

    expect(thrownBy(() => connector.noteOn(128, 40))).toBe(
      "noteOn: note and velocity must be finite values 0-127: got note=128, velocity=40",
    );
    expect(thrownBy(() => connector.noteOff(Number.NaN))).toBe(
      "noteOff: note must be a finite value 0-127: got note=NaN",
    );
    expect(midi.port.send).not.toHaveBeenCalled();
  });

  it("sends noteOn, noteOff, and allNotesOff on the configured channel once connected", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP]));
    const connector = createVmpkConnector();
    await connector.connect();

    connector.noteOn(60, 100);
    connector.noteOn(62, 70, 2);
    connector.noteOff(60);
    connector.noteOff(62, 3);
    connector.allNotesOff();
    connector.allNotesOff(4);

    expect(midi.port.send.mock.calls.map((call) => call[0])).toEqual([
      [0x90, 60, 100],
      [0x90 + 2, 62, 70],
      [0x80, 60, 0],
      [0x80 + 3, 62, 0],
      [0xB0, 123, 0],
      [0xB0 + 4, 123, 0],
    ]);
  });

  it("allNotesOff while disconnected does not throw and does not send", () => {
    const connector = createVmpkConnector();
    expect(connector.status()).toBe("disconnected");
    connector.allNotesOff();
    connector.allNotesOff(3);
    expect(midi.port.send).not.toHaveBeenCalled();
  });

  it("disconnect sends CC 123 on all 16 channels, then closes the port and the engine", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP]));
    const connector = createVmpkConnector();
    await connector.connect();
    midi.port.send.mockClear();

    await connector.disconnect();

    expect(midi.port.send.mock.calls.map((call) => call[0])).toEqual(
      Array.from({ length: 16 }, (_, ch) => [0xB0 + ch, 123, 0]),
    );
    expect(midi.port.close).toHaveBeenCalledTimes(1);
    expect(midi.engine.close).toHaveBeenCalledTimes(1);
    expect(connector.status()).toBe("disconnected");
  });

  it("ignores a send or close that throws while disconnecting", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP]));
    const connector = createVmpkConnector();
    await connector.connect();
    midi.port.send.mockImplementation(() => {
      throw new Error("send failed");
    });
    midi.port.close.mockImplementation(() => {
      throw new Error("close failed");
    });
    midi.engine.close.mockImplementation(() => {
      throw new Error("engine close failed");
    });

    await connector.disconnect();

    expect(midi.port.send).toHaveBeenCalledTimes(16);
    expect(midi.port.close).toHaveBeenCalledTimes(1);
    expect(midi.engine.close).toHaveBeenCalledTimes(1);
    expect(connector.status()).toBe("disconnected");
    expect(thrownBy(() => connector.noteOn(60, 80))).toBe("MIDI port not connected");
  });

  it("playNote of a rest waits durationMs and does not send", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP]));
    const connector = createVmpkConnector();
    await connector.connect();
    midi.port.send.mockClear();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const note: MidiNote = { note: -1, velocity: 0, durationMs: 250, channel: 0 };
    let settled = false;
    const pending = connector.playNote(note).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(settled).toBe(false);
    expect(midi.port.send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
    expect(midi.port.send).not.toHaveBeenCalled();
  });

  it("playNote sends noteOn, then noteOff after durationMs", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP]));
    const connector = createVmpkConnector();
    await connector.connect();
    midi.port.send.mockClear();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const pending = connector.playNote({ note: 60, velocity: 90, durationMs: 400, channel: 1 });
    expect(midi.port.send.mock.calls.map((call) => call[0])).toEqual([[0x90 + 1, 60, 90]]);

    await vi.advanceTimersByTimeAsync(399);
    expect(midi.port.send.mock.calls.map((call) => call[0])).toEqual([[0x90 + 1, 60, 90]]);

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(midi.port.send.mock.calls.map((call) => call[0])).toEqual([
      [0x90 + 1, 60, 90],
      [0x80 + 1, 60, 0],
    ]);
  });

  it("listPorts is empty before connect", () => {
    expect(createVmpkConnector().listPorts()).toEqual([]);
  });

  it("listPorts uses id when name is missing, and (unnamed) when both are missing", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP]));
    const connector = createVmpkConnector();
    await connector.connect();
    midi.engine.info.mockReturnValue({
      outputs: [{ id: "out-7" }, {}, { name: "Named Port", id: "other" }],
    });

    expect(connector.listPorts()).toEqual(["out-7", "(unnamed)", "Named Port"]);
  });

  it("listPorts returns [] when outputs is missing", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP]));
    const connector = createVmpkConnector();
    await connector.connect();
    midi.engine.info.mockReturnValue({});

    expect(connector.listPorts()).toEqual([]);
  });

  it("listPorts returns [] when engine.info throws", async () => {
    midi.engine.info.mockReturnValue(outputs([LOOP]));
    const connector = createVmpkConnector();
    await connector.connect();
    midi.engine.info.mockImplementation(() => {
      throw new Error("info failed");
    });

    expect(connector.listPorts()).toEqual([]);
  });
});
