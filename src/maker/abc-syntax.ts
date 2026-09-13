// ─── ABC tune-body syntax validator ──────────────────────────────────────────
//
// P3 hard restriction 1. The probe that established the generative substrate used
// a regex BLOCKLIST to decide whether a completion was a real ABC lead sheet, and
// it shipped with a literal 0x08 byte where a word boundary belonged: half the
// pattern was inert, nothing in the output said so, and the gate simply reported a
// higher pass rate. See experiments/rollout-arc/p3/ABC-VALIDATOR-SPEC.md.
//
// The design rule that replaces it: ALLOWLIST BY TOTAL TOKENIZATION. A body is
// well-formed iff every character is consumed by a known token. An unanticipated
// construct is REJECTED with a position, never silently accepted, so a dead branch
// shows up as a rejection a test can assert on rather than as a drifting rate.
//
// Scope: this answers "is this body ABC at all". Chord-symbol vocabulary belongs to
// parseAbcChords and the voicer; musical quality belongs to verifyHarmony.
// ─────────────────────────────────────────────────────────────────────────────

export interface AbcSyntaxOk {
  ok: true;
  /** Bars found, counting bar lines. Informational; not a validity condition. */
  bars: number;
}

export interface AbcSyntaxError {
  ok: false;
  /** 0-based index into the body of the first character no token could consume. */
  index: number;
  char: string;
  reason: string;
}

export type AbcSyntaxResult = AbcSyntaxOk | AbcSyntaxError;

const WHITESPACE = new Set([" ", "\t", "\r", "\n"]);
const PITCH = /[A-Ga-g]/;
const REST = /[zxZ]/;
/** Single-character decorations ABC permits before a note. */
const DECORATION = new Set([".", "~", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "u", "v"]);

/**
 * Validate an ABC tune body (everything after the `K:` header line).
 *
 * Returns the first unconsumable character rather than a boolean, because a
 * validator that can only say "no" cannot be distinguished from one whose branches
 * are dead — which is the defect this module exists to retire.
 */
export function validateAbcBody(body: string): AbcSyntaxResult {
  let i = 0;
  let bars = 0;
  const n = body.length;

  const fail = (reason: string): AbcSyntaxError => ({ ok: false, index: i, char: body[i] ?? "", reason });

  // A duration suffix: digits, slashes, or both (2, /2, 3/2, /, //).
  const eatDuration = (): void => {
    while (i < n && /[0-9]/.test(body[i]!)) i++;
    while (i < n && body[i] === "/") {
      i++;
      while (i < n && /[0-9]/.test(body[i]!)) i++;
    }
  };

  // [accidental] pitch [octave marks] [duration]
  const eatNote = (): AbcSyntaxError | null => {
    if (body[i] === "^" || body[i] === "_") {
      i++;
      if (body[i] === body[i - 1]) i++; // ^^ / __
    } else if (body[i] === "=") {
      i++;
    }
    if (i >= n || !PITCH.test(body[i]!)) {
      return fail("accidental not followed by a pitch A-G or a-g");
    }
    i++;
    while (i < n && (body[i] === "," || body[i] === "'")) i++;
    eatDuration();
    return null;
  };

  while (i < n) {
    const c = body[i]!;

    if (WHITESPACE.has(c)) {
      i++;
      continue;
    }

    // Comment / stylesheet directive to end of line.
    if (c === "%") {
      while (i < n && body[i] !== "\n") i++;
      continue;
    }

    // Line continuation.
    if (c === "\\") {
      i++;
      continue;
    }

    // Chord annotation or free text: "Am7"
    if (c === '"') {
      const close = body.indexOf('"', i + 1);
      if (close === -1) return fail("unterminated chord annotation — no closing double quote");
      i = close + 1;
      continue;
    }

    // Decoration spanning !...!
    if (c === "!") {
      const close = body.indexOf("!", i + 1);
      if (close === -1) return fail("unterminated !decoration!");
      i = close + 1;
      continue;
    }

    // Bar lines. Longest match first so |] and |: are not read as a bare |.
    if (c === "|" || c === ":") {
      if (body.startsWith("|]", i) || body.startsWith("|:", i) || body.startsWith("||", i)) {
        bars++;
        i += 2;
        continue;
      }
      if (body.startsWith(":|", i) || body.startsWith("::", i)) {
        bars++;
        i += 2;
        continue;
      }
      if (c === "|") {
        bars++;
        i++;
        continue;
      }
      return fail("stray ':' — a colon is only legal in a repeat bar line (|: :| ::)");
    }

    if (c === "[") {
      // Inline field: [K:G], [M:3/4]
      if (/[A-Za-z]/.test(body[i + 1] ?? "") && body[i + 2] === ":") {
        const close = body.indexOf("]", i);
        if (close === -1) return fail("unterminated inline field — no closing ]");
        i = close + 1;
        continue;
      }
      // Start-of-line repeat: [|
      if (body[i + 1] === "|") {
        bars++;
        i += 2;
        continue;
      }
      // Simultaneity: [CEG]
      i++;
      let notes = 0;
      while (i < n && body[i] !== "]") {
        if (WHITESPACE.has(body[i]!)) {
          i++;
          continue;
        }
        const err = eatNote();
        if (err) return err;
        notes++;
      }
      if (i >= n) return fail("unterminated chord — no closing ]");
      if (notes === 0) return fail("empty chord []");
      i++; // consume ]
      eatDuration();
      continue;
    }

    // Grace notes {ABC}
    if (c === "{") {
      const close = body.indexOf("}", i);
      if (close === -1) return fail("unterminated grace-note group — no closing }");
      i = close + 1;
      continue;
    }

    // Tuplet (3 ... or slur open
    if (c === "(") {
      i++;
      if (i < n && /[0-9]/.test(body[i]!)) {
        while (i < n && /[0-9]/.test(body[i]!)) i++;
        // optional :n:n
        while (i < n && body[i] === ":") {
          i++;
          while (i < n && /[0-9]/.test(body[i]!)) i++;
        }
      }
      continue;
    }

    if (c === ")" || c === "-" || c === "<" || c === ">" || c === "&") {
      i++;
      continue;
    }

    // Rests
    if (REST.test(c)) {
      i++;
      eatDuration();
      continue;
    }

    // Notes, with or without a leading accidental
    if (PITCH.test(c) || c === "^" || c === "_" || c === "=") {
      const err = eatNote();
      if (err) return err;
      continue;
    }

    // Decorations that are a single character
    if (DECORATION.has(c)) {
      i++;
      continue;
    }

    return fail(`'${c}' is not legal in an ABC tune body`);
  }

  return { ok: true, bars };
}
