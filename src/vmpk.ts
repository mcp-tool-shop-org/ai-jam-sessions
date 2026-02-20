// ─── pianoai: VMPK MIDI Connector ───────────────────────────────────────────
//
// Connects to VMPK (Virtual MIDI Piano Keyboard) via a virtual MIDI port
// using the JZZ library. On Windows, requires loopMIDI to create the port.
//
// Usage:
//   const vmpk = createVmpkConnector({ portName: /loop/i });
//   await vmpk.connect();
//   vmpk.noteOn(60, 100);   // middle C
//   vmpk.noteOff(60);
//   await vmpk.disconnect();
// ─────────────────────────────────────────────────────────────────────────────

import JZZ from "jzz";
import type { VmpkConnector, VmpkConfig, MidiStatus, MidiNote } from "./types.js";

/** Default configuration. */
const DEFAULT_CONFIG: VmpkConfig = {
  portName: /loop/i, // matches "loopMIDI Port" on Windows
  channel: 0,
  velocity: 80,
};

/**
 * Create a VMPK MIDI connector.
 *
 * This is the real implementation that talks to hardware via JZZ.
 * For testing, inject a mock VmpkConnector via the Session constructor.
 */
export function createVmpkConnector(
  config: Partial<VmpkConfig> = {}
): VmpkConnector {
  const cfg: VmpkConfig = { ...DEFAULT_CONFIG, ...config };

  let engine: any = null;
  let port: any = null;
  let currentStatus: MidiStatus = "disconnected";

  return {
    async connect(): Promise<void> {
      if (currentStatus === "connected") return;

      currentStatus = "connecting";
      try {
        engine = await JZZ();

        // Try to find a matching port
        const portName = cfg.portName;
        port = engine.openMidiOut(portName);
        currentStatus = "connected";
      } catch (err) {
        currentStatus = "error";
        const portDesc =
          cfg.portName instanceof RegExp
            ? cfg.portName.toString()
            : `"${cfg.portName}"`;
        throw new Error(
          `Failed to connect to MIDI port ${portDesc}. ` +
          `On Windows, make sure loopMIDI is running and VMPK is listening. ` +
          `Available ports: ${listPortsInternal(engine).join(", ") || "(none)"}. ` +
          `Error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },

    async disconnect(): Promise<void> {
      if (port) {
        // Send all-notes-off on all channels before disconnecting
        for (let ch = 0; ch < 16; ch++) {
          try {
            port.send([0xB0 + ch, 123, 0]); // CC 123 = All Notes Off
          } catch {
            // ignore — port might already be closed
          }
        }
        try {
          port.close();
        } catch {
          // ignore
        }
        port = null;
      }
      if (engine) {
        try {
          engine.close();
        } catch {
          // ignore
        }
        engine = null;
      }
      currentStatus = "disconnected";
    },

    status(): MidiStatus {
      return currentStatus;
    },

    listPorts(): string[] {
      return listPortsInternal(engine);
    },

    noteOn(note: number, velocity: number, channel?: number): void {
      if (!port || currentStatus !== "connected") {
        throw new Error("MIDI port not connected");
      }
      const ch = channel ?? cfg.channel;
      port.send([0x90 + ch, note & 0x7F, velocity & 0x7F]);
    },

    noteOff(note: number, channel?: number): void {
      if (!port || currentStatus !== "connected") {
        throw new Error("MIDI port not connected");
      }
      const ch = channel ?? cfg.channel;
      port.send([0x80 + ch, note & 0x7F, 0]);
    },

    allNotesOff(channel?: number): void {
      if (!port || currentStatus !== "connected") return;
      const ch = channel ?? cfg.channel;
      port.send([0xB0 + ch, 123, 0]); // CC 123 = All Notes Off
    },

    async playNote(midiNote: MidiNote): Promise<void> {
      if (midiNote.note < 0) {
        // Rest — just wait
        await sleep(midiNote.durationMs);
        return;
      }

      this.noteOn(midiNote.note, midiNote.velocity, midiNote.channel);
      await sleep(midiNote.durationMs);
      this.noteOff(midiNote.note, midiNote.channel);
    },
  };
}

/**
 * Create a mock VMPK connector for testing.
 * Records all note events without sending any MIDI.
 */
export function createMockVmpkConnector(): VmpkConnector & {
  events: Array<{ type: string; note?: number; velocity?: number; channel?: number }>;
} {
  let status: MidiStatus = "disconnected";
  const events: Array<{ type: string; note?: number; velocity?: number; channel?: number }> = [];

  const connector: VmpkConnector & { events: typeof events } = {
    events,

    async connect() {
      status = "connected";
      events.push({ type: "connect" });
    },

    async disconnect() {
      status = "disconnected";
      events.push({ type: "disconnect" });
    },

    status() {
      return status;
    },

    listPorts() {
      return ["Mock Port 1"];
    },

    noteOn(note: number, velocity: number, channel = 0) {
      events.push({ type: "noteOn", note, velocity, channel });
    },

    noteOff(note: number, channel = 0) {
      events.push({ type: "noteOff", note, channel });
    },

    allNotesOff(channel = 0) {
      events.push({ type: "allNotesOff", channel });
    },

    async playNote(midiNote: MidiNote) {
      if (midiNote.note < 0) {
        events.push({ type: "rest", note: -1 });
        return; // don't actually sleep in mocks
      }
      events.push({
        type: "playNote",
        note: midiNote.note,
        velocity: midiNote.velocity,
        channel: midiNote.channel,
      });
    },
  };

  return connector;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function listPortsInternal(engine: any): string[] {
  if (!engine) return [];
  try {
    const info = engine.info();
    const outputs = info.outputs || [];
    return outputs.map((o: any) => o.name || o.id || "(unnamed)");
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
