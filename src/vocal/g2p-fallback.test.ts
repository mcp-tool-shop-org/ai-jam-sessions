import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadEngineG2P } from "./g2p.js";

const phon = vi.hoisted(() => ({
  seen: [] as string[],
  words: [] as Array<{ word: string; phonemes: Array<{ symbol: string; kind: "vowel" | "consonant" }> }>,
  syllables: [] as Array<{
    onset: Array<{ symbol: string }>;
    nucleus: { symbol: string };
    coda: Array<{ symbol: string }>;
  }>,
}));

vi.mock("vocal-synth-engine/src/phonemize/index.js", () => ({
  textToPhonemes: (text: string) => {
    phon.seen.push(text);
    return phon.words;
  },
  syllabify: () => phon.syllables,
}));

const AH = { onset: [], nucleus: "AH", coda: [] };

describe("loadEngineG2P fallbacks", () => {
  beforeEach(() => {
    phon.seen = [];
    phon.words = [];
    phon.syllables = [];
  });

  it("uses an AH syllable when syllabify returns nothing", async () => {
    phon.words = [{ word: "hm", phonemes: [{ symbol: "M", kind: "consonant" }] }];
    phon.syllables = [];
    const g2p = await loadEngineG2P();
    expect(g2p.wordToSyllables("hm")).toEqual([AH]);
    expect(phon.seen).toEqual(["hm"]);
  });

  it("maps onset, nucleus, and coda symbols from the engine syllable", async () => {
    phon.words = [{ word: "cat", phonemes: [{ symbol: "K", kind: "consonant" }, { symbol: "AE", kind: "vowel" }, { symbol: "T", kind: "consonant" }] }];
    phon.syllables = [{
      onset: [{ symbol: "K" }],
      nucleus: { symbol: "AE" },
      coda: [{ symbol: "T" }],
    }];
    const g2p = await loadEngineG2P();
    expect(g2p.wordToSyllables("cat")).toEqual([{ onset: ["K"], nucleus: "AE", coda: ["T"] }]);
    expect(phon.seen).toEqual(["cat"]);
  });

  it("uses an AH syllable when the engine returns no words", async () => {
    phon.words = [];
    const g2p = await loadEngineG2P();
    expect(g2p.wordToSyllables("...")).toEqual([AH]);
    expect(phon.seen).toEqual(["..."]);
  });
});
