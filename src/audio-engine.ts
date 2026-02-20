// ─── pianoai: Built-in Piano Engine ──────────────────────────────────────────
//
// Quality multi-harmonic piano synthesis using node-web-audio-api.
// No external software required — npm install gives you everything.
//
// Piano model features:
//   - 12 sine partials per voice with inharmonic frequency stretching
//   - Per-partial amplitude envelopes (higher harmonics decay faster)
//   - Velocity-dependent timbre (harder = brighter, more harmonics)
//   - Hammer noise transient (bandpass-filtered noise burst on attack)
//   - Duplex stringing simulation (subtle random detuning per partial)
//   - Stereo imaging (low notes left, high notes right)
//   - DynamicsCompressor for polyphony safety
//   - 48-voice polyphony with LRU voice stealing
//
// Usage:
//   const piano = createAudioEngine();
//   await piano.connect();
//   piano.noteOn(60, 100);   // middle C, forte
//   piano.noteOff(60);
//   await piano.disconnect();
// ─────────────────────────────────────────────────────────────────────────────

import type { VmpkConnector, MidiStatus, MidiNote } from "./types.js";

// ─── Lazy Import ────────────────────────────────────────────────────────────
// Don't load the native binary until the engine is actually used.

let _AudioContext: any = null;

async function loadAudioContext(): Promise<any> {
  if (!_AudioContext) {
    const mod = await import("node-web-audio-api");
    _AudioContext = mod.AudioContext;
  }
  return _AudioContext;
}

// ─── Piano Physics ──────────────────────────────────────────────────────────

/** Max partials per voice (bass notes get all, treble gets fewer). */
const MAX_PARTIALS = 12;

/** Maximum simultaneous voices before stealing. */
const MAX_POLYPHONY = 48;

/** MIDI note → frequency (A4 = 440 Hz). */
function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** MIDI note → octave (0–8). */
function midiToOctave(note: number): number {
  return Math.max(0, Math.min(8, Math.floor(note / 12) - 1));
}

/**
 * Stereo pan: low notes left, high notes right.
 * Mimics sitting at a piano — bass on the left, treble on the right.
 */
function noteToPan(note: number): number {
  return Math.max(-0.7, Math.min(0.7, ((note - 21) / 87) * 1.4 - 0.7));
}

/**
 * Inharmonicity coefficient by octave.
 *
 * Piano strings are stiff, not ideal — partials are stretched above
 * pure harmonics. This gives pianos their characteristic shimmer.
 *
 * f_n = n × f₀ × √(1 + B × n²)
 */
const B_COEFF: number[] = [
  0.00012, // octave 0 (A0 area) — highest inharmonicity
  0.00008, // octave 1
  0.00004, // octave 2
  0.00002, // octave 3
  0.00001, // octave 4 (middle C)
  0.000006, // octave 5
  0.000004, // octave 6
  0.000003, // octave 7
  0.000002, // octave 8
];

/** Compute stretched partial frequency with inharmonicity. */
function partialFreq(fundamental: number, n: number, B: number): number {
  return n * fundamental * Math.sqrt(1 + B * n * n);
}

/**
 * How many partials to use for this note.
 * Bass notes have richer harmonic content; treble is simpler.
 */
function partialsForNote(midiNote: number): number {
  if (midiNote > 90) return 5; // High treble
  if (midiNote > 72) return 8; // Upper register
  if (midiNote > 54) return 10; // Middle register
  return MAX_PARTIALS; // Bass — full harmonic series
}

/**
 * Amplitude for the nth partial (1-based).
 *
 * Base amplitude follows ~1/n^0.7 with exponential rolloff.
 * Velocity controls brightness: soft = warm, hard = bright.
 */
function partialAmplitude(n: number, velocity01: number): number {
  const base = Math.pow(n, -0.7) * Math.exp(-0.08 * n);

  // Velocity-dependent brightness: high partials only appear at higher velocity
  if (n <= 3) return base;
  const brightnessGate = Math.pow(
    velocity01,
    0.3 + (n - 3) * 0.12
  );
  return base * brightnessGate;
}

/**
 * Decay time constant (seconds) for the nth partial at a given MIDI note.
 *
 * Higher partials decay much faster than the fundamental.
 * Lower notes ring longer than higher notes.
 */
function partialDecayTime(n: number, midiNote: number): number {
  // Base decay for fundamental: 3s (treble) to 15s (bass)
  const registerFactor = 1.0 - (midiNote - 21) / 87;
  const baseFundamental = 3 + registerFactor * 12;
  // Higher partials: decay ∝ 1/n^0.8
  return baseFundamental * Math.pow(n, -0.8);
}

/**
 * Attack time based on velocity.
 * Harder strikes = shorter hammer pulse = sharper attack.
 */
function attackTime(velocity01: number): number {
  return 0.002 + (1 - velocity01) * 0.008; // 2ms (ff) to 10ms (pp)
}

// ─── Voice ──────────────────────────────────────────────────────────────────

interface Voice {
  note: number;
  oscillators: any[];
  partialGains: any[];
  masterGain: any;
  panner: any;
  noiseSource: any | null;
  startTime: number;
  released: boolean;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Create the built-in piano engine.
 *
 * Implements VmpkConnector so it's a drop-in replacement anywhere
 * the codebase uses a connector (sessions, CLI, MCP server).
 */
export function createAudioEngine(): VmpkConnector {
  let ctx: any = null;
  let currentStatus: MidiStatus = "disconnected";
  let compressor: any = null;
  let master: any = null;
  const activeVoices = new Map<number, Voice>();
  const voiceOrder: number[] = []; // LRU tracking for voice stealing

  // ── Noise buffer (shared across all voices) ──
  let hammerNoiseBuffer: any = null;

  function ensureConnected(): void {
    if (!ctx || currentStatus !== "connected") {
      throw new Error("Piano engine not connected");
    }
  }

  /** Create a reusable noise buffer for hammer transients. */
  function createHammerNoiseBuffer(): void {
    const durationMs = 40;
    const length = Math.ceil((durationMs / 1000) * ctx.sampleRate);
    hammerNoiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    hammerNoiseBuffer.copyToChannel(data, 0);
  }

  /** Synthesize a single piano voice. */
  function createVoice(note: number, velocity: number): Voice {
    const velocity01 = Math.max(0.01, Math.min(1.0, velocity / 127));
    const freq = midiToFreq(note);
    const octave = midiToOctave(note);
    const B = B_COEFF[octave] ?? 0.000003;
    const now = ctx.currentTime;
    const attack = attackTime(velocity01);
    const numPartials = partialsForNote(note);

    // ── Master gain: constant volume (per-partial gains shape the envelope) ──
    const voiceMaster = ctx.createGain();
    voiceMaster.gain.value = velocity01 * 0.25;

    // ── Stereo panner ──
    const panner = ctx.createStereoPanner();
    panner.pan.value = noteToPan(note);
    voiceMaster.connect(panner);
    panner.connect(compressor);

    // ── Sine partials with per-partial envelopes ──
    const oscillators: any[] = [];
    const partialGains: any[] = [];

    for (let n = 1; n <= numPartials; n++) {
      const pFreq = partialFreq(freq, n, B);
      if (pFreq > 18000) break; // Near hearing limit

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = pFreq;

      // Duplex stringing: subtle random detuning for warmth
      osc.detune.value = (Math.random() - 0.5) * 3; // ±1.5 cents

      const gain = ctx.createGain();
      const amp = partialAmplitude(n, velocity01);
      const decay = partialDecayTime(n, note);

      // Envelope: silence → attack → exponential decay
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amp, now + attack);
      // Exponential decay toward near-zero
      gain.gain.setTargetAtTime(0.0001, now + attack, decay);

      osc.connect(gain);
      gain.connect(voiceMaster);
      osc.start(now);

      oscillators.push(osc);
      partialGains.push(gain);
    }

    // ── Hammer noise transient ──
    let noiseSource: any = null;
    if (hammerNoiseBuffer) {
      noiseSource = ctx.createBufferSource();
      noiseSource.buffer = hammerNoiseBuffer;

      // Bandpass near note frequency — gives the attack a tonal character
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = Math.min(freq * 2.5, 10000);
      noiseFilter.Q.value = 0.5 + velocity01 * 2.5;

      // Quick envelope: burst then silence
      const noiseGain = ctx.createGain();
      const noiseAmp = velocity01 * 0.2;
      noiseGain.gain.setValueAtTime(noiseAmp, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(voiceMaster);
      noiseSource.start(now);
    }

    return {
      note,
      oscillators,
      partialGains,
      masterGain: voiceMaster,
      panner,
      noiseSource,
      startTime: now,
      released: false,
      cleanupTimer: null,
    };
  }

  /** Release a voice (damper engages — fast fade out). */
  function releaseVoice(voice: Voice): void {
    if (voice.released) return;
    voice.released = true;

    const now = ctx.currentTime;
    const releaseTime = 0.12; // 120ms damper release

    // Cancel ongoing scheduled values and fade to silence
    for (const g of voice.partialGains) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + releaseTime);
    }

    // Schedule full cleanup after release completes
    voice.cleanupTimer = setTimeout(() => killVoice(voice), (releaseTime + 0.05) * 1000);
  }

  /** Immediately destroy a voice and free resources. */
  function killVoice(voice: Voice): void {
    if (voice.cleanupTimer) {
      clearTimeout(voice.cleanupTimer);
      voice.cleanupTimer = null;
    }
    for (const osc of voice.oscillators) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        /* already stopped */
      }
    }
    for (const g of voice.partialGains) {
      try {
        g.disconnect();
      } catch {
        /* ok */
      }
    }
    if (voice.noiseSource) {
      try {
        voice.noiseSource.stop();
        voice.noiseSource.disconnect();
      } catch {
        /* ok */
      }
    }
    try {
      voice.masterGain.disconnect();
    } catch {
      /* ok */
    }
    try {
      voice.panner.disconnect();
    } catch {
      /* ok */
    }
  }

  /** Steal the oldest voice when at max polyphony. */
  function stealOldest(): void {
    if (voiceOrder.length === 0) return;
    const oldestNote = voiceOrder.shift()!;
    const voice = activeVoices.get(oldestNote);
    if (voice) {
      killVoice(voice);
      activeVoices.delete(oldestNote);
    }
  }

  /** Remove a note from the LRU order. */
  function removeFromOrder(note: number): void {
    const idx = voiceOrder.indexOf(note);
    if (idx >= 0) voiceOrder.splice(idx, 1);
  }

  // ── VmpkConnector Implementation ──

  return {
    async connect(): Promise<void> {
      if (currentStatus === "connected") return;
      currentStatus = "connecting";

      try {
        const AC = await loadAudioContext();
        ctx = new AC({ latencyHint: "playback" });

        // Master chain: compressor → gain → speakers
        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -15;
        compressor.knee.value = 12;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.2;

        master = ctx.createGain();
        master.gain.value = 0.85;

        compressor.connect(master);
        master.connect(ctx.destination);

        // Pre-generate shared noise buffer
        createHammerNoiseBuffer();

        currentStatus = "connected";
        console.error("Piano engine connected (built-in audio)");
      } catch (err) {
        currentStatus = "error";
        throw new Error(
          `Failed to start piano engine: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },

    async disconnect(): Promise<void> {
      // Kill all active voices
      for (const [, voice] of activeVoices) {
        try {
          killVoice(voice);
        } catch {
          /* ok */
        }
      }
      activeVoices.clear();
      voiceOrder.length = 0;

      if (ctx) {
        try {
          await ctx.close();
        } catch {
          /* ok */
        }
        ctx = null;
        compressor = null;
        master = null;
        hammerNoiseBuffer = null;
      }
      currentStatus = "disconnected";
    },

    status(): MidiStatus {
      return currentStatus;
    },

    listPorts(): string[] {
      return ["Built-in Piano"];
    },

    noteOn(note: number, velocity: number, channel?: number): void {
      ensureConnected();

      // Kill existing voice on same note (retrigger)
      const existing = activeVoices.get(note);
      if (existing) {
        killVoice(existing);
        activeVoices.delete(note);
        removeFromOrder(note);
      }

      // Voice stealing if at capacity
      while (activeVoices.size >= MAX_POLYPHONY) {
        stealOldest();
      }

      const voice = createVoice(note, velocity);
      activeVoices.set(note, voice);
      voiceOrder.push(note);
    },

    noteOff(note: number, channel?: number): void {
      if (!ctx || currentStatus !== "connected") return;

      const voice = activeVoices.get(note);
      if (voice) {
        releaseVoice(voice);
        activeVoices.delete(note);
        removeFromOrder(note);
      }
    },

    allNotesOff(channel?: number): void {
      if (!ctx) return;
      for (const [, voice] of activeVoices) {
        killVoice(voice);
      }
      activeVoices.clear();
      voiceOrder.length = 0;
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
