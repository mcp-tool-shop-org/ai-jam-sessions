import { describe, expect, it } from "vitest";
import { validateAbcBody } from "./abc-syntax.js";

const ok = (s: string) => validateAbcBody(s);
const reason = (s: string) => {
  const r = validateAbcBody(s);
  if (r.ok) throw new Error(`expected a rejection for ${JSON.stringify(s)}, got ok`);
  return r;
};

describe("validateAbcBody — accepts real lead-sheet bodies", () => {
  it("accepts the shape the prompt's own example asks for", () => {
    const r = ok('"Fmaj7"A2 c2 | "Dm7"d2 f2 | "E7"e2 ^g2 | "Am7"a4 |');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bars).toBe(4);
  });

  it("accepts accidentals, octave marks, rests, ties, slurs, tuplets and chords", () => {
    expect(ok("^C, _d' =e2 z4 Z2 x/2").ok).toBe(true);
    expect(ok("(3abc (de) f-f").ok).toBe(true);
    expect(ok("[CEG]2 [c'e'g']/2").ok).toBe(true);
  });

  it("accepts every bar-line form, a repeat, and an inline field", () => {
    expect(ok("A | B || c |] d |: e :| f :: g").ok).toBe(true);
    expect(ok("[K:G]A2 | [M:3/4]B2").ok).toBe(true);
  });

  it("accepts grace notes, decorations and comments", () => {
    expect(ok("{ag}f2 .A ~B !trill!c % a trailing comment\nd2").ok).toBe(true);
  });

  it("accepts broken rhythm and line continuation", () => {
    expect(ok("A>B c<d \\").ok).toBe(true);
  });
});

// THE DEAD-BRANCH GUARD required by ABC-VALIDATOR-SPEC.md §Acceptance 3.
// Every token type gets one accept AND one reject just past it. A branch that is
// silently inert — the 0x08 defect that shipped in fc30025 — fails here, because
// the reject case would be accepted instead.
describe("validateAbcBody — dead-branch guard: reject just past every token type", () => {
  const cases: Array<[string, string, string]> = [
    ["chord annotation", '"Am7"A2', '"Am7 A2'],
    ["decoration span", "!trill!A2", "!trill A2"],
    ["inline field", "[K:G]A2", "[K:G A2"],
    ["simultaneity", "[CEG]", "[CEG"],
    ["grace notes", "{ag}f", "{ag f"],
    ["accidental", "^F2", "^H2"],
    ["bar line", "A | B", "A : B"],
  ];

  for (const [name, good, bad] of cases) {
    it(`${name}: accepts the valid form and rejects the malformed one`, () => {
      expect(validateAbcBody(good).ok).toBe(true);
      expect(validateAbcBody(bad).ok).toBe(false);
    });
  }

  it("rejects an empty chord", () => {
    expect(reason("[]").reason).toMatch(/empty chord/);
  });
});

describe("validateAbcBody — rejects the melody table the frozen gate let through", () => {
  it("rejects a pitch-stack, and points at the '+'", () => {
    const r = reason("C4+E4:h");
    expect(r.char).toBe("+");
    expect(r.index).toBe(2);
    expect(r.reason).toMatch(/not legal/);
  });

  it("rejects a duration suffix, and points at the ':'", () => {
    const r = reason("A4:w");
    expect(r.char).toBe(":");
    expect(r.reason).toMatch(/repeat bar line/);
  });

  it("rejects a real pasted melody-table row", () => {
    expect(validateAbcBody('"Abmaj7"R:w | "Dm7b5"DA4:w E5+E5+G5:h').ok).toBe(false);
  });

  it("does NOT reject a bare digit after a pitch — C4 is valid ABC", () => {
    // The naive "digit after pitch" rule would be wrong: C4 is pitch C, duration 4.
    // The melody table fails on '+' and ':', never on the digit.
    expect(validateAbcBody("C4").ok).toBe(true);
  });
});

describe("validateAbcBody — every rejection carries a usable position", () => {
  it("reports index and char, never a bare false", () => {
    const r = reason("A2 @ B2");
    expect(r.char).toBe("@");
    expect(r.index).toBe(3);
    expect(typeof r.reason).toBe("string");
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it("accepts the empty body rather than inventing a failure", () => {
    expect(validateAbcBody("").ok).toBe(true);
  });
});
