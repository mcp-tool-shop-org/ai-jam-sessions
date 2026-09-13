# Citation verdicts — the literature pass, gated

Retrieval oracle: arXiv API, Semantic Scholar (batch + search), Crossref, arXiv abs pages.
Groundedness: two lenses from model families outside the synthesiser's, reasoning stripped.

## Load-bearing (existence + both lenses SUPPORTED)

arXiv:2108.13264 Agarwal 2021 | arXiv:2504.13837 Yue 2025 | arXiv:2606.15455 Yuan 2026
arXiv:2510.20817 GX-Chen 2025 | arXiv:2505.24864 Liu 2025 | arXiv:2605.07689 Nie 2026
arXiv:2510.01171 Zhang 2025 | arXiv:2506.10947 Shao 2025 | arXiv:2509.26114 Park 2025
doi:10.1198/000313006X152649 Gelman & Stern 2006

## Real, but NOT load-bearing here

- **arXiv:2011.09468** Pezeshki 2020 (NeurIPS 2021), *Gradient Starvation: A Learning
  Proclivity in Neural Networks*. CONFIRMED by title and author. But it concerns feature
  learning under cross-entropy -- "capturing only a subset of features relevant for the task"
  -- not gradient-masked tokens ossifying a prior in RL. Adjacent, not the mechanism.
  The paper that DOES carry our case is Nie et al. arXiv:2605.07689, which borrows the term
  in its own title.
- **arXiv:2509.26114** Park 2025, clip-low/clip-high. Real and SUPPORTED, but FALSIFIED AS
  APPLICABLE on our own logs: clip_ratio is identically 0 across all 800 steps of the
  four-arm run and on a fresh local run, because num_iterations defaults to 1.

## DROPPED

- **"A Theoretical Analysis of Mode Collapse in RLHF" (Wang et al. 2024)** -- two failed
  resolutions. Title search: no match. The supplied id **arXiv:2402.04477** resolves to
  Hamilton, Sil (single author), 2024-02-06, *Detecting Mode Collapse in Language Models via
  Narration*, about authorial voice in narration -- a different paper that does not contain
  the claim. Per protocol, not attempted a third time. **The claim it carried -- that RL
  provably cannot flatten a dominant prior -- is WITHDRAWN.** What remains for that argument
  is GX-Chen arXiv:2510.20817 plus our own masked-token receipts.
- **"The Danger of Averaging in Benchmark Evaluations" (Ethayarajh 2022)** -- title does not
  exist. Real paper is arXiv:2110.08420, *Understanding Dataset Difficulty with V-Usable
  Information*, 2021. Real author, invented title, wrong year.
- **"Understanding the Effects of Freezing Parameters in Deep Learning" (Raghu 2019)** --
  title does not exist. Raghu 2019 is arXiv:1902.07208, *Transfusion: Understanding Transfer
  Learning for Medical Imaging*, which is about medical-imaging transfer learning.
- **"Simpson's Paradox in Evaluation of Machine Learning Models" (Kiefer 2020)** -- no match.
  A relevant real paper surfaced instead: Yuan et al. 2021, *Simpson's Bias in NLP Training*,
  arXiv:2103.11795 (not verified for groundedness; not used).

## The pattern, recorded once

Every dropped citation was **plausible, on-topic, and wrong** -- a real author welded to a
title that does not exist, or a real title welded to the wrong claim. It arrived that way from
a text model AND from this advisor (the Nie over-attribution, corrected the same day). The
failure is invisible from the inside of whoever produced it, which is the entire argument for
a mechanical resolver rather than a careful reader.
