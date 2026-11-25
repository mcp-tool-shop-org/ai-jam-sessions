// ─── Input size & duration caps for the six audio inspection tools ─────────────
//
// Prevents unbounded synchronous readFileSync + decodeWav Float64Array
// allocations on huge recordings.
//
// Defaults derived from the repository's largest legitimate audio inputs:
//   - Shipped WAV fixtures (samples/vocal/carrier-*.wav): 192,044 bytes (2 s,
//     48 kHz 16-bit mono).
//   - Sung hymn exemplars (src/vocal/arrangements/*.json): up to ~274 s
//     (Battle Hymn, ~26.3 MB mono / ~52.6 MB stereo as 48 kHz 16-bit WAV).
//   - Longest shipped library MIDI (songs/library/ragtime/the-easy-winners.mid):
//     304 s (~58.4 MB as 48 kHz 16-bit stereo WAV).
//
// 64 MiB (67,108,864 bytes) and 600 s (10 minutes, ~2x the 304 s song for
// slow practice takes) accept every legitimate repo input while bounding memory.
// ─────────────────────────────────────────────────────────────────────────────

import { closeSync, openSync, readSync, statSync } from "node:fs";
import { mcpStructuredError } from "./mcp-error.js";

/** Default max audio file size in bytes (64 MiB). */
export const AUDIO_MAX_FILE_BYTES = 64 * 1024 * 1024;

/** Env override for the audio inspection file-size cap in bytes. */
export const AUDIO_MAX_FILE_BYTES_ENV = "AJS_AUDIO_MAX_FILE_BYTES";

/** Default max decoded audio duration in seconds (10 minutes). */
export const AUDIO_MAX_DURATION_SEC = 600;

/** Env override for the audio inspection duration cap in seconds. */
export const AUDIO_MAX_DURATION_SEC_ENV = "AJS_AUDIO_MAX_DURATION_SEC";

const FORMAT_PCM = 0x0001;
const FORMAT_IEEE_FLOAT = 0x0003;
const FORMAT_EXTENSIBLE = 0xfffe;
const MAX_CHUNKS_WALKED = 256;

function resolvePositiveEnvNumber(
  envName: string,
  defaultValue: number,
  explicit?: number,
): number {
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
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
  return defaultValue;
}

/** Resolve the max WAV file size in bytes (explicit -> env -> 64 MiB). */
export function resolveAudioMaxFileBytes(explicit?: number): number {
  return resolvePositiveEnvNumber(AUDIO_MAX_FILE_BYTES_ENV, AUDIO_MAX_FILE_BYTES, explicit);
}

/** Resolve the max decoded audio duration in seconds (explicit -> env -> 600 s). */
export function resolveAudioMaxDurationSec(explicit?: number): number {
  return resolvePositiveEnvNumber(AUDIO_MAX_DURATION_SEC_ENV, AUDIO_MAX_DURATION_SEC, explicit);
}

/**
 * Cheaply inspect only the RIFF/WAVE chunk headers of `path` (never reading the
 * audio sample payload) and return the decoded duration in seconds, or `null`
 * if the header is not uncompressed PCM/IEEE-float WAV.
 */
export function peekWavDurationSec(
  path: string,
  fileSize: number,
  openFn: typeof openSync = openSync,
): number | null {
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
          size === 0 || body + size > fileSize ? fileSize - body : size;
      }

      if (formatCode >= 0 && dataLength >= 0) break;
      cursor = body + size + (size % 2);
    }

    if (
      (formatCode !== FORMAT_PCM && formatCode !== FORMAT_IEEE_FLOAT) ||
      !(channels > 0) ||
      !(sampleRate > 0) ||
      dataLength < 0
    ) {
      return null;
    }

    const bytesPerSample = bitDepth / 8;
    if (!Number.isInteger(bytesPerSample) || bytesPerSample < 1) return null;
    const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
    return frameCount / sampleRate;
  } finally {
    try {
      closeSync(fd);
    } catch {
      /* ok */
    }
  }
}

export type AudioInputCapCheck =
  | { ok: true }
  | { ok: false; missing: true }
  | { ok: false; missing: false; result: ReturnType<typeof mcpStructuredError> };

/**
 * Enforce byte-size and decoded-duration limits before reading a WAV file into memory.
 * Accepts files exactly at the limit (`<=`); rejects files strictly over it (`>`).
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

  const maxBytes = resolveAudioMaxFileBytes(opts.maxBytes);
  if (fileSize > maxBytes) {
    return {
      ok: false,
      missing: false,
      result: mcpStructuredError(
        "audio_file_too_large",
        `Audio file "${path}" is ${fileSize} bytes, exceeding the ${maxBytes}-byte limit.`,
        `Trim or downsample the WAV, or raise ${AUDIO_MAX_FILE_BYTES_ENV} (default ${AUDIO_MAX_FILE_BYTES} bytes).`,
      ),
    };
  }

  const maxDurationSec = resolveAudioMaxDurationSec(opts.maxDurationSec);
  const durationSec = peekWavDurationSec(path, fileSize, opts.openFn);
  if (durationSec !== null && durationSec > maxDurationSec) {
    return {
      ok: false,
      missing: false,
      result: mcpStructuredError(
        "audio_duration_too_long",
        `Audio file "${path}" (${fileSize} bytes) decodes to ${durationSec.toFixed(2)} s, exceeding the ${maxDurationSec} s duration limit.`,
        `Pass a shorter recording or raise ${AUDIO_MAX_DURATION_SEC_ENV} (default ${AUDIO_MAX_DURATION_SEC} s).`,
      ),
    };
  }

  return { ok: true };
}
