// ─── SFZ Parser ─────────────────────────────────────────────────────────────
//
// Minimal SFZ parser that extracts region mappings from the
// Accurate-Salamander SFZ files. Not a general-purpose SFZ parser —
// only handles the opcodes we need for sample playback.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

/** A single SFZ region — one sample mapped to a key/velocity range. */
export interface SfzRegion {
  /** Path to the WAV file (relative to SFZ file location). */
  sample: string;
  /** Lowest MIDI key this region responds to. */
  lokey: number;
  /** Highest MIDI key this region responds to. */
  hikey: number;
  /** Lowest velocity this region responds to. */
  lovel: number;
  /** Highest velocity this region responds to (127 if not specified). */
  hivel: number;
  /** The MIDI note at which the sample was recorded (for pitch shifting). */
  pitchKeycenter: number;
  /** Volume adjustment in dB. */
  volume: number;
  /** Tuning adjustment in cents. */
  tune: number;
}

/** Parsed SFZ data. */
export interface SfzData {
  regions: SfzRegion[];
  /** Global amp_veltrack value (0-100). */
  ampVeltrack: number;
  /** Global release time in seconds. */
  ampegRelease: number;
}

/**
 * Parse an SFZ file and extract all region mappings.
 */
export function parseSfzFile(filePath: string): SfzData {
  const content = readFileSync(filePath, "utf8");
  return parseSfz(content);
}

/**
 * Parse SFZ content string.
 */
export function parseSfz(content: string): SfzData {
  const regions: SfzRegion[] = [];
  let ampVeltrack = 100;
  let ampegRelease = 0.5;

  // Track inherited values from <group> headers
  let groupTune = 0;

  // Strip comments
  const lines = content
    .split("\n")
    .map(line => {
      const commentIdx = line.indexOf("//");
      return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    })
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Rejoin into a single string for header-based parsing
  const joined = lines.join(" ");

  // Extract global opcodes
  const globalMatch = joined.match(/<global>\s*([\s\S]*?)(?=<(?:master|group|region|control)>|$)/);
  if (globalMatch) {
    const globalBlock = globalMatch[1];
    const veltrackMatch = globalBlock.match(/amp_veltrack=([0-9.]+)/);
    if (veltrackMatch) ampVeltrack = parseFloat(veltrackMatch[1]);
    const releaseMatch = globalBlock.match(/ampeg_release=([0-9.]+)/);
    if (releaseMatch) ampegRelease = parseFloat(releaseMatch[1]);
  }

  // Split by headers, tracking group-level tune
  const tokens = joined.split(/(<\w+>)/);

  let currentHeader = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].trim();
    if (!token) continue;

    if (token.startsWith("<") && token.endsWith(">")) {
      currentHeader = token;
      continue;
    }

    if (currentHeader === "<group>") {
      // Extract group-level tune
      const tuneMatch = token.match(/tune=([+-]?\d+)/);
      if (tuneMatch) groupTune = parseInt(tuneMatch[1], 10);
      else groupTune = 0;
    }

    if (currentHeader === "<region>") {
      const region = parseRegion(token, groupTune);
      if (region) regions.push(region);
    }
  }

  return { regions, ampVeltrack, ampegRelease };
}

function parseRegion(opcodeStr: string, groupTune: number): SfzRegion | null {
  const opcodes = new Map<string, string>();

  // Parse key=value pairs, handling paths with backslashes
  const regex = /(\w+)=(\S+)/g;
  let match;
  while ((match = regex.exec(opcodeStr)) !== null) {
    opcodes.set(match[1], match[2]);
  }

  const sample = opcodes.get("sample");
  if (!sample) return null;

  return {
    sample: sample.replace(/\\/g, "/"), // normalize path separators
    lokey: parseInt(opcodes.get("lokey") ?? "0", 10),
    hikey: parseInt(opcodes.get("hikey") ?? "127", 10),
    lovel: parseInt(opcodes.get("lovel") ?? "1", 10),
    hivel: parseInt(opcodes.get("hivel") ?? "127", 10),
    pitchKeycenter: parseInt(opcodes.get("pitch_keycenter") ?? "60", 10),
    volume: parseFloat(opcodes.get("volume") ?? "0"),
    tune: groupTune + parseInt(opcodes.get("tune") ?? "0", 10),
  };
}
