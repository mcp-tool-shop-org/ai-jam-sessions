// ─── Input duration & safety caps for the six audio inspection tools ───────────
//
// Prevents unbounded synchronous readFileSync + decodeWav Float64Array
// allocations while never refusing legitimate multi-channel or high-rate takes.
//
// Duration (`AUDIO_MAX_DURATION_SEC = 600` s) is the primary gate. Exact byte
// sizes scale cleanly with format for stereo audio:
//   - 48 kHz 16-bit PCM stereo (192 KB/s):     57.6 MB @ 300 s, 115.2 MB @ 600 s
//   - 48 kHz 24-bit PCM stereo (288 KB/s):     86.4 MB @ 300 s, 172.8 MB @ 600 s
//   - 48 kHz 32-bit float stereo (384 KB/s):  115.2 MB @ 300 s, 230.4 MB @ 600 s
//   - 96 kHz 24-bit PCM stereo (576 KB/s):    172.8 MB @ 300 s, 345.6 MB @ 600 s
//   - 96 kHz 32-bit float stereo (768 KB/s):  230.4 MB @ 300 s, 460.8 MB @ 600 s
//
// Shipped fixtures and songs comfortably clear 600 s:
//   - Shipped WAV fixtures (samples/vocal/carrier-*.wav): 192,044 B (2 s, 48 kHz mono).
//   - Sung hymn exemplars (src/vocal/arrangements/*.json): up to ~274 s.
//   - Longest shipped library MIDI (songs/library/ragtime/the-easy-winners.mid): 304 s
//     (600 s gives ~2x headroom for 0.5x beginner practice recordings).
//
// Byte size is derived from the WAV header
// (`channels * sampleRate * bytesPerSample * maxDurationSec + 1 MiB` header slack,
// capped at `buffer.constants.MAX_LENGTH`), with a 1 GiB fixed fallback ceiling
// (`AUDIO_MAX_FILE_BYTES = 1_073_741_824`) when the header cannot be read.
// ─────────────────────────────────────────────────────────────────────────────

import { constants as bufferConstants } from "node:buffer";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { mcpStructuredError } from "./mcp-error.js";

/** Fixed fallback byte ceiling (1 GiB) when a WAV header cannot be read. */
export const AUDIO_MAX_FILE_BYTES = 1024 * 1024 * 1024;

/** Env override for an explicit max audio file size cap in bytes. */
export const AUDIO_MAX_FILE_BYTES_ENV = "AJS_AUDIO_MAX_FILE_BYTES";

/** Metadata/chunk slack (1 MiB) added to the header-derived byte backstop. */
export const AUDIO_HEADER_SLACK_BYTES = 1024 * 1024;

/** Default max decoded audio duration in seconds (10 minutes). */
export const AUDIO_MAX_DURATION_SEC = 600;

/** Env override for the audio inspection duration cap in seconds. */
export const AUDIO_MAX_DURATION_SEC_ENV = "AJS_AUDIO_MAX_DURATION_SEC";

const FORMAT_PCM = 0x0001;
const FORMAT_IEEE_FLOAT = 0x0003;
const FORMAT_EXTENSIBLE = 0xfffe;
const MAX_CHUNKS_WALKED = 256;

function readPositiveEnvOverride(envName: string, defaultValue: number): number | null {
  const raw = process.env[envName];
  if (raw !== undefined && raw.trim().length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      console.error(
        `[audio-limits] Using ${envName}=${parsed} override (default ${defaultValue})`,
      );
      return parsed;
    }
    console.error(
      `[audio-limits] Ignoring invalid ${envName}="${raw}"; using default ${defaultValue}`,
    );
  }
  return null;
}

function resolvePositiveEnvNumber(
  envName: string,
  defaultValue: number,
  explicit?: number,
): number {
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  return readPositiveEnvOverride(envName, defaultValue) ?? defaultValue;
}

/** Resolve the max fallback WAV file size in bytes (explicit -> env -> 1 GiB). */
export function resolveAudioMaxFileBytes(explicit?: number): number {
  return resolvePositiveEnvNumber(AUDIO_MAX_FILE_BYTES_ENV, AUDIO_MAX_FILE_BYTES, explicit);
}

/** Resolve the max decoded audio duration in seconds (explicit -> env -> 600 s). */
export function resolveAudioMaxDurationSec(explicit?: number): number {
  return resolvePositiveEnvNumber(AUDIO_MAX_DURATION_SEC_ENV, AUDIO_MAX_DURATION_SEC, explicit);
}

export interface WavHeaderInfo {
  channels: number;
  sampleRate: number;
  bitDepth: number;
  bytesPerSample: number;
  dataLength: number;
  durationSec: number;
}

/**
 * Cheaply inspect only the RIFF/WAVE chunk headers of `path` (never reading the
 * audio sample payload) and return parsed format + duration metadata, or `null`
 * if the header is not uncompressed PCM/IEEE-float WAV.
 */
export function peekWavHeader(
  path: string,
  fileSize: number,
  openFn: typeof openSync = openSync,
): WavHeaderInfo | null {
  if (fileSize < 12) return null;
  let fd: number;
  try {
    fd = openFn(path, "r");
  } catch {
    return null;
  }

  try {
    const header = Buffer.alloc(12);
    if (readSync(fd, header, 0, 12, 0) < 12) return null;
    if (
      header.toString("ascii", 0, 4) !== "RIFF" ||
      header.toString("ascii", 8, 12) !== "WAVE"
    ) {
      return null;
    }

    let formatCode = -1;
    let channels = 0;
    let sampleRate = 0;
    let bitDepth = 0;
    let dataLength = -1;

    let cursor = 12;
    let chunks = 0;
    const chunkHdr = Buffer.alloc(8);
    const fmtBuf = Buffer.alloc(40);

    while (cursor + 8 <= fileSize && chunks < MAX_CHUNKS_WALKED) {
      chunks++;
      if (readSync(fd, chunkHdr, 0, 8, cursor) < 8) break;
      const id = chunkHdr.toString("ascii", 0, 4);
      const size = chunkHdr.readUInt32LE(4);
      const body = cursor + 8;

      if (id === "fmt ") {
        if (body + 16 > fileSize) return null;
        const toRead = Math.min(40, size, fileSize - body);
        if (readSync(fd, fmtBuf, 0, toRead, body) < 16) return null;
        formatCode = fmtBuf.readUInt16LE(0);
        channels = fmtBuf.readUInt16LE(2);
        sampleRate = fmtBuf.readUInt32LE(4);
        bitDepth = fmtBuf.readUInt16LE(14);
        if (formatCode === FORMAT_EXTENSIBLE && size >= 40 && toRead >= 26) {
          formatCode = fmtBuf.readUInt16LE(24);
        }
      } else if (id === "data") {
        dataLength =
          size === 0 || size === 0xffffffff || body + size > fileSize
            ? fileSize - body
            : size;
      }

      if (formatCode >= 0 && dataLength >= 0) break;
      cursor = body + size + (size % 2);
    }

    const validDepth =
      (formatCode === FORMAT_PCM &&
        (bitDepth === 8 || bitDepth === 16 || bitDepth === 24 || bitDepth === 32)) ||
      (formatCode === FORMAT_IEEE_FLOAT && (bitDepth === 32 || bitDepth === 64));

    if (!validDepth || !(channels > 0) || !(sampleRate > 0) || dataLength < 0) {
      return null;
    }

    const bytesPerSample = bitDepth / 8;
    const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
    return {
      channels,
      sampleRate,
      bitDepth,
      bytesPerSample,
      dataLength,
      durationSec: frameCount / sampleRate,
    };
  } finally {
    try {
      closeSync(fd);
    } catch {
      /* ok */
    }
  }
}

/** Convenience wrapper returning only decoded WAV duration in seconds, or `null`. */
export function peekWavDurationSec(
  path: string,
  fileSize: number,
  openFn: typeof openSync = openSync,
): number | null {
  return peekWavHeader(path, fileSize, openFn)?.durationSec ?? null;
}

export type AudioInputCapCheck =
  | { ok: true }
  | { ok: false; missing: true }
  | { ok: false; missing: false; result: ReturnType<typeof mcpStructuredError> };

/**
 * Enforce decoded-duration and byte-backstop limits before reading a WAV file
 * into memory. Accepts files exactly at the limit (`<=`); rejects strictly over (`>`).
 */
export function checkAudioInputCaps(
  path: string,
  opts: {
    maxBytes?: number;
    maxDurationSec?: number;
    openFn?: typeof openSync;
  } = {},
): AudioInputCapCheck {
  let fileSize: number;
  try {
    fileSize = statSync(path).size;
  } catch {
    return { ok: false, missing: true };
  }

  const explicitMaxBytes =
    opts.maxBytes !== undefined && Number.isFinite(opts.maxBytes) && opts.maxBytes > 0
      ? opts.maxBytes
      : readPositiveEnvOverride(AUDIO_MAX_FILE_BYTES_ENV, AUDIO_MAX_FILE_BYTES);

  if (explicitMaxBytes !== null && fileSize > explicitMaxBytes) {
    return {
      ok: false,
      missing: false,
      result: mcpStructuredError(
        "audio_file_too_large",
        `Audio file "${path}" is ${fileSize} bytes, exceeding the ${explicitMaxBytes}-byte limit.`,
        `Trim the WAV, or raise ${AUDIO_MAX_FILE_BYTES_ENV} (default fallback ceiling ${AUDIO_MAX_FILE_BYTES} bytes).`,
      ),
    };
  }

  const maxDurationSec = resolveAudioMaxDurationSec(opts.maxDurationSec);
  const header = peekWavHeader(path, fileSize, opts.openFn);
  if (header !== null) {
    if (header.durationSec > maxDurationSec) {
      return {
        ok: false,
        missing: false,
        result: mcpStructuredError(
          "audio_duration_too_long",
          `Audio file "${path}" (${fileSize} bytes) decodes to ${header.durationSec.toFixed(2)} s, exceeding the ${maxDurationSec} s duration limit.`,
          `Pass a shorter recording or raise ${AUDIO_MAX_DURATION_SEC_ENV} (default ${AUDIO_MAX_DURATION_SEC} s).`,
        ),
      };
    }

    const derivedMaxBytes = Math.min(
      bufferConstants.MAX_LENGTH,
      Math.ceil(header.channels * header.sampleRate * header.bytesPerSample * maxDurationSec) +
        AUDIO_HEADER_SLACK_BYTES,
    );
    if (fileSize > derivedMaxBytes) {
      return {
        ok: false,
        missing: false,
        result: mcpStructuredError(
          "audio_file_too_large",
          `Audio file "${path}" is ${fileSize} bytes, exceeding the ${derivedMaxBytes}-byte limit derived for ${maxDurationSec} s of ${header.channels}ch ${header.sampleRate} Hz ${header.bitDepth}-bit audio.`,
          `Trim excess trailing metadata or raise ${AUDIO_MAX_DURATION_SEC_ENV} (default ${AUDIO_MAX_DURATION_SEC} s).`,
        ),
      };
    }

    return { ok: true };
  }

  // Fallback fixed ceiling when the header cannot be parsed as PCM/float WAV.
  const fallbackCeiling = AUDIO_MAX_FILE_BYTES;
  if (fileSize > fallbackCeiling) {
    return {
      ok: false,
      missing: false,
      result: mcpStructuredError(
        "audio_file_too_large",
        `Audio file "${path}" is ${fileSize} bytes, exceeding the ${fallbackCeiling}-byte limit.`,
        `Ensure the file is a valid WAV within ${maxDurationSec} s / ${fallbackCeiling} bytes, or raise ${AUDIO_MAX_FILE_BYTES_ENV}.`,
      ),
    };
  }

  return { ok: true };
}
