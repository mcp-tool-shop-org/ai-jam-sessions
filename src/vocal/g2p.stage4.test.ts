import { beforeEach, describe, expect, it, vi } from "vitest";

const phon = vi.hoisted(() => ({
  textToPhonemes: vi.fn(),
  syllabify: vi.fn(),
}));

vi.mock("vocal-synth-engine/src/phonemize/index.js", () => phon);

import { loadEngineG2P } from "./g2p.js";

describe("loadEngineG2P", () => {
  beforeEach(() => {
    phon.textToPhonemes.mockReset();
    phon.syllabify.mockReset();
  });

  it("maps a syllable's onset, nucleus, and coda symbols", async () => {
    phon.textToPhonemes.mockReturnValue([
      { word: "cat", phonemes: [{ symbol: "K", kind: "consonant" }] },
    ]);
    phon.syllabify.mockReturnValue([
      {
        onset: [{ symbol: "K" }],
        nucleus: { symbol: "AE" },
        coda: [{ symbol: "T" }],
      },
    ]);
    const g2p = await loadEngineG2P();
    expect(g2p.wordToSyllables("cat")).toEqual([
      { onset: ["K"], nucleus: "AE", coda: ["T"] },
    ]);
  });

  it("uses AH when a word has phonemes but no syllables", async () => {
    phon.textToPhonemes.mockReturnValue([{ word: "hmm", phonemes: [] }]);
    phon.syllabify.mockReturnValue([]);
    const g2p = await loadEngineG2P();
    expect(g2p.wordToSyllables("hmm")).toEqual([
      { onset: [], nucleus: "AH", coda: [] },
    ]);
  });

  it("uses AH when the engine returns no words", async () => {
    phon.textToPhonemes.mockReturnValue([]);
    const g2p = await loadEngineG2P();
    expect(g2p.wordToSyllables("")).toEqual([
      { onset: [], nucleus: "AH", coda: [] },
    ]);
    expect(phon.syllabify).not.toHaveBeenCalled();
  });
});
