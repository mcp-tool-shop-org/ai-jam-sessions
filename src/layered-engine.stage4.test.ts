import { describe, expect, it, vi } from "vitest";
import { createLayeredEngine } from "./layered-engine.js";
import type { MidiNote, MidiStatus, VmpkConnector } from "./types.js";

function fakeEngine(overrides: Partial<VmpkConnector> = {}): VmpkConnector & {
  calls: string[];
} {
  const calls: string[] = [];
  const engine: VmpkConnector & { calls: string[] } = {
    calls,
    async connect() {
      calls.push("connect");
    },
    async disconnect() {
      calls.push("disconnect");
    },
    status(): MidiStatus {
      return "connected";
    },
    listPorts() {
      return ["port-a"];
    },
    noteOn(note, velocity, channel) {
      calls.push(`noteOn:${note}:${velocity}:${channel ?? ""}`);
    },
    noteOff(note, channel) {
      calls.push(`noteOff:${note}:${channel ?? ""}`);
    },
    allNotesOff(channel) {
      calls.push(`allNotesOff:${channel ?? ""}`);
    },
    async playNote(note: MidiNote) {
      calls.push(`playNote:${note.note}`);
    },
    ...overrides,
  };
  return engine;
}

const NOTE: MidiNote = { note: 60, velocity: 90, durationMs: 10, channel: 1 };

describe("createLayeredEngine", () => {
  it("rejects an empty engine list", () => {
    expect(() => createLayeredEngine([])).toThrow(
      "createLayeredEngine requires at least one engine",
    );
  });

  it("rejects child metadata whose length does not match the engines", () => {
    expect(() =>
      createLayeredEngine([fakeEngine()], {
        children: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      }),
    ).toThrow(
      "createLayeredEngine children metadata length (2) must match engines (1)",
    );
  });

  it("connects every child, and disconnects the ones already up when a later connect throws", async () => {
    const first = fakeEngine();
    const second = fakeEngine({
      async connect() {
        throw new Error("second port refused");
      },
    });
    const layered = createLayeredEngine([first, second]);
    await expect(layered.connect()).rejects.toThrow("second port refused");
    expect(first.calls).toEqual(["connect", "disconnect"]);
    expect(second.calls).toEqual([]);
  });

  it("swallows a disconnect failure while cleaning up a failed connect", async () => {
    const first = fakeEngine({
      async disconnect() {
        throw new Error("already closed");
      },
    });
    const second = fakeEngine({
      async connect() {
        throw new Error("second port refused");
      },
    });
    const layered = createLayeredEngine([first, second]);
    await expect(layered.connect()).rejects.toThrow("second port refused");
    expect(first.calls).toEqual(["connect"]);
  });

  it("disconnects every child", async () => {
    const a = fakeEngine();
    const b = fakeEngine();
    const layered = createLayeredEngine([a, b]);
    await layered.disconnect();
    expect(a.calls).toEqual(["disconnect"]);
    expect(b.calls).toEqual(["disconnect"]);
  });

  it("reports the worst child status", () => {
    const statuses: MidiStatus[] = ["connected", "disconnected", "connecting", "error"];
    const engines = statuses.map((status) => fakeEngine({ status: () => status }));
    expect(createLayeredEngine(engines).status()).toBe("error");
    expect(createLayeredEngine(engines.slice(0, 3)).status()).toBe("connecting");
    expect(createLayeredEngine(engines.slice(0, 2)).status()).toBe("disconnected");
    expect(createLayeredEngine([engines[0]!]).status()).toBe("connected");
  });

  it("prefixes each child port with the label", () => {
    const layered = createLayeredEngine(
      [fakeEngine({ listPorts: () => ["grand"] }), fakeEngine({ listPorts: () => ["choir"] })],
      { label: "Duet" },
    );
    expect(layered.listPorts()).toEqual(["Duet:grand", "Duet:choir"]);
  });

  it("sends noteOn, noteOff, and allNotesOff to every child, and logs a child that throws", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = fakeEngine();
    const bad = fakeEngine({
      noteOn() {
        throw new Error("noteOn broke");
      },
      noteOff() {
        throw new Error("noteOff broke");
      },
      allNotesOff() {
        throw new Error("allNotesOff broke");
      },
    });
    const layered = createLayeredEngine([good, bad]);
    layered.noteOn(60, 90, 1);
    layered.noteOff(60, 1);
    layered.allNotesOff(1);
    expect(good.calls).toEqual(["noteOn:60:90:1", "noteOff:60:1", "allNotesOff:1"]);
    expect(err.mock.calls.map((c) => String(c[0]))).toEqual([
      "Layered engine noteOn error:",
      "Layered engine noteOff error:",
      "Layered engine allNotesOff error:",
    ]);
    expect(err.mock.calls[0][1]).toEqual(new Error("noteOn broke"));
    err.mockRestore();
  });

  it("logs a child playNote rejection and still finishes the others", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = fakeEngine();
    const bad = fakeEngine({
      async playNote() {
        throw new Error("child missed the beat");
      },
    });
    const layered = createLayeredEngine([bad, good]);
    await layered.playNote(NOTE);
    expect(good.calls).toEqual(["playNote:60"]);
    expect(err).toHaveBeenCalledWith(
      "Layered engine child 0 playNote error: child missed the beat",
    );
    err.mockRestore();
  });

  it("logs a non-Error playNote rejection as text", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = fakeEngine({
      async playNote() {
        throw "string-failure";
      },
    });
    await createLayeredEngine([bad]).playNote(NOTE);
    expect(err).toHaveBeenCalledWith("Layered engine child 0 playNote error: string-failure");
    err.mockRestore();
  });

  it("names children from metadata, and binds createTapOutput only when the child has one", () => {
    const tapped = fakeEngine();
    tapped.createTapOutput = () => "tap-buffer";
    const plain = fakeEngine({ listPorts: () => [] });
    const layered = createLayeredEngine([tapped, plain], {
      children: [
        { id: "piano", label: "Piano" },
        { id: "voice", label: "Voice" },
      ],
    });
    const children = layered.children?.() ?? [];
    expect(children.map((c) => ({ id: c.id, label: c.label }))).toEqual([
      { id: "piano", label: "Piano" },
      { id: "voice", label: "Voice" },
    ]);
    expect(children[0]?.createTapOutput?.()).toBe("tap-buffer");
    expect(children[1]?.createTapOutput).toBeUndefined();
  });

  it("defaults unnamed children to child-N and the first port", () => {
    const layered = createLayeredEngine([
      fakeEngine({ listPorts: () => ["grand"] }),
      fakeEngine({ listPorts: () => [] }),
    ]);
    expect(layered.children?.().map((c) => ({ id: c.id, label: c.label }))).toEqual([
      { id: "child-0", label: "grand" },
      { id: "child-1", label: "child 1" },
    ]);
  });
});
