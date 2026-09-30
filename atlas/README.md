# ai-jam-sessions: how it works

Mapped at 2026-09-30 from commit 6e89814 by Atlas 1.24.0.

## What this is

14 parts, mostly JSON data (1520 files) and Markdown (348); code in TypeScript (563), Python (48), JavaScript (32), shell (28), PowerShell (3), CSS (2), Astro (1) and HTML (1). Work enters through 10 doors; CI and Release each reach 5 parts, and CI is followed because a pull request goes through it. It publishes to the Hugging Face Hub and npm, a container image, and a record on Zenodo. It deploys a site to GitHub Pages. People run ai-jam-sessions and ai-jam-sessions-mcp. People import @mcptoolshop/ai-jam-sessions.

## What changed since 2026-09-25 (d92a167)

- CI's pull request trigger now also names `codecov.yml`.
- CI's push trigger now also names `codecov.yml`.
- CI now also runs files in apps/cockpit/.
- And 3 more changes to doors.
- .eval-checkpoints is now written by scripts/run-jam-actions-corpus-eval.ts.
- datasets/jam-actions-v0-public/ is now also written by scripts/run-jam-actions-corpus-eval.ts.
- datasets/jam-actions-v0-public/evals/ is now written by scripts/run-jam-actions-corpus-eval.ts.
- And 131 more new writers and readers of places.
- the site was authored and is now mixed.
- songs was generated and is now mixed.
- 17 files added and 1756 changed content, across 13 parts.

## What comes in

1. **CI.** On a pull request touching 21 paths; on a push to main touching 21 paths; or by hand. Runs src/mcp-server.ts, src/smoke.ts, apps/cockpit/src/ and 294 more; builds src/analysis/analyze.ts, src/analysis/baseline.ts, src/analysis/chord-id.ts and 92 more; checks scripts/analysis-chords.ts, scripts/analysis-patterns.ts, scripts/analysis-sections.ts and 57 more; packs LICENSE, README.md, logo.png and 377 more into an image.
2. **Release.** When a release is published; or by hand. Runs src/mcp-server.ts, apps/cockpit/src/capture.test.ts, apps/cockpit/src/clipboard.test.ts and 301 more; builds src/analysis/analyze.ts, src/analysis/baseline.ts, src/analysis/chord-id.ts and 93 more; packs LICENSE, README.md, logo.png and 377 more into an image.
3. **Deploy site to GitHub Pages.** On a push to main touching 3 paths; or by hand. Runs apps/cockpit/src/, apps/cockpit/vite.config.ts, site/astro.config.mjs and 2 more.
4. **Publish jam-actions-v0.** By hand. Runs scripts/check-release-gate.ts, scripts/verify-public-package-checksums.ts and src/dataset/published-evidence.test.ts.
5. **Push jam-actions adapters to HuggingFace.** By hand. Runs no file this map can see.
6. **Push jam-actions dataset to HuggingFace.** By hand. Runs no file this map can see.
7. **Zenodo edit record metadata.** By hand. Runs no file this map can see.
8. **@mcptoolshop/ai-jam-sessions** (the package people import). Loads src/index.ts.
9. **ai-jam-sessions** (a command people run). Runs src/cli.ts.
10. **ai-jam-sessions-mcp** (a command people run). Runs src/mcp-server.ts.

## What happens through CI

1. The workflow runs apps/cockpit/src/ and apps/cockpit/vite.config.ts in cockpit, 9 files in experiments, 4 files in scripts, and 69 files in src; it builds 95 files in src; it checks 5 files in scripts; it packs 7 files in the repository root, src/ in src, samples/vocal/ in samples, and songs/library/ in songs into an image.
   1. Inside src/mcp-server.ts, `main` does, in order: `shouldSuperviseStdio`, `userSongsDir`, `initializeFromLibrary`, `serverStatePath` and `openRpcOutputStream`.
   2. Or, when `shouldSuperviseStdio()`, `main` does `runStdioSupervisor` instead.
2. It uploads coverage to Codecov.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs src/mcp-server.ts, apps/cockpit/src/capture.test.ts, apps/cockpit/src/clipboard.test.ts and 301 more, builds src/analysis/analyze.ts, src/analysis/baseline.ts, src/analysis/chord-id.ts and 93 more, packs LICENSE, README.md, logo.png and 377 more into an image, and publishes to npm and a container image.

**Deploy site to GitHub Pages** runs apps/cockpit/src/, apps/cockpit/vite.config.ts, site/astro.config.mjs and 2 more, reaches src, writes to site/dist, which is not tracked, and deploys the site.

**Publish jam-actions-v0** runs scripts/check-release-gate.ts, scripts/verify-public-package-checksums.ts and src/dataset/published-evidence.test.ts, publishes to the Hugging Face Hub when run by hand with confirm_irreversible yes-mint-doi and mode publish, and publishes a record on Zenodo when run by hand with confirm_irreversible yes-mint-doi.

**Push jam-actions adapters to HuggingFace** runs no file this map can see and publishes to the Hugging Face Hub.

**Push jam-actions dataset to HuggingFace** runs no file this map can see and publishes to the Hugging Face Hub.

**Zenodo edit record metadata** runs no file this map can see and publishes a record on Zenodo.

**@mcptoolshop/ai-jam-sessions** (the package people import) loads src/index.ts.

**ai-jam-sessions** (a command people run) runs src/cli.ts.

**ai-jam-sessions-mcp** (a command people run) runs src/mcp-server.ts.

## What breaks what

- **src** is imported by 4 parts (cockpit, docs, experiments, scripts), is run as a child process by 2 parts (experiments, scripts), and sits on the path of 7 doors.
- **scripts** is run as a child process by 1 part (experiments) and sits on the path of 3 doors.
- **cockpit** is imported only from tests, by 1 part (src), and sits on the path of 3 doors.
- **experiments** is imported only from tests, by 1 part (src), and sits on the path of 2 doors.
- **the repository root** is imported by no other part and sits on the path of 2 doors.
- **experiments/rollout-arc/p4/runs/** is written by experiments and read by experiments, and by 2 tests; a hand edit reaches every reader.
- **songs/library/** is written by scripts and read by experiments, scripts and src, and by 6 tests; a hand edit reaches every reader.

## What tends to change together

No two source files, other than a file and its own test, changed together often enough to name.

2 files changed together with their own tests, as expected.

Window: 180 days; a pair counts from 3 shared commits, since 7 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **spaces** is imported by no test.

## Written but never read

- **datasets/jam-actions-v0/evals/e1-tool-use-results.json** is written by scripts/eval-jam-actions-tool-use.ts and read by nothing else in this repository.
- **datasets/jam-actions-v0/evals/e2-notes-present-results.json** is written by scripts/run-e2-notes-present-eval.ts and read by nothing else in this repository.
- **datasets/jam-actions-v0/evals/e3-annotation-grounding-results.json** is written by scripts/eval-jam-actions-annotation-grounding.ts and read by nothing else in this repository.
- **datasets/jam-actions-v0/evals/llm-in-the-loop-results.json** is written by scripts/run-llm-eval.ts and read by nothing else in this repository.
- **datasets/jam-actions-v0/pianoroll/bach-prelude-c-major-bwv846-m061-062.svg** is written by scripts/revise-jam-actions-v0-r001-bach-window.ts and read by nothing else in this repository.
- **datasets/jam-actions-v0/pianoroll/fur-elise-m001-008.svg** is written by scripts/build-record-fur-elise-m001-008.ts and read by nothing else in this repository.
- **datasets/jam-actions-v1-probe/PROVENANCE-NOTE.md** is written by src/dataset/acoustic-v1/generate-probe.ts and read by nothing else in this repository.
- **datasets/jam-actions-v1-probe/README.md** is written by src/dataset/acoustic-v1/generate-probe.ts and read by nothing else in this repository.

And 63 more places.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **buildAllRecords** is exported by experiments/_template/generate.ts (experiments) and src/dataset/search-v0/generate.ts (src); the two look alike.
- **buildRecord** is exported by experiments/_template/generate.ts (experiments) and src/dataset/search-v0/generate.ts (src); the two look alike.
- **buildRecord** is exported by experiments/_template/generate.ts (experiments) and src/dataset/synth-v0/generate.ts (src); the two look alike.
- **scorePredictions** is exported by experiments/acoustic-sft/eval.ts (experiments) and src/dataset/experiment/eval.ts (src); the two look alike.
- **toSftLine** is exported by experiments/acoustic-sft/format-sft.ts (experiments) and src/dataset/experiment/format-sft.ts (src); the two look alike.

And 2 more pairs.

## Generated, never hand-edited

- **datasets/jam-actions-acoustic-v0/** is written by src/dataset/acoustic/generate-corpus.ts.
- **datasets/jam-actions-v0-public/** is written by scripts/package-jam-actions-public.ts, scripts/regenerate-public-package-checksums.ts and scripts/run-jam-actions-corpus-eval.ts.
- **datasets/jam-actions-v0/** is written by scripts (6 files).
- **datasets/jam-actions-v0/evals/e1-tool-use-results.json** is written by scripts/eval-jam-actions-tool-use.ts.
- **datasets/jam-actions-v0/evals/e2-notes-present-results.json** is written by scripts/run-e2-notes-present-eval.ts.
- **datasets/jam-actions-v0/evals/e2-phrase-continuation-results.json** is written by scripts/eval-jam-actions-phrase-continuation.ts.
- **datasets/jam-actions-v0/evals/e3-annotation-grounding-results.json** is written by scripts/eval-jam-actions-annotation-grounding.ts.
- **datasets/jam-actions-v0/evals/llm-in-the-loop-results.json** is written by scripts/run-llm-eval.ts.
- **datasets/jam-actions-v0/manifest.json** is written by scripts/build-jam-actions-corpus.ts and scripts/verify-dataset-provenance-urls.ts.
- **datasets/jam-actions-v0/pianoroll/bach-prelude-c-major-bwv846-m061-062.svg** is written by scripts/revise-jam-actions-v0-r001-bach-window.ts.
- **datasets/jam-actions-v0/pianoroll/fur-elise-m001-008.svg** is written by scripts/build-record-fur-elise-m001-008.ts.
- **datasets/jam-actions-v0/provenance-scan.json** is written by scripts/scan-dataset-provenance.ts.
- **datasets/jam-actions-v0/provenance-verification.json** is written by scripts/verify-dataset-provenance-urls.ts.
- **datasets/jam-actions-v0/records/bach-prelude-c-major-bwv846-m057-060.json** has a block written by scripts/revise-jam-actions-v0-r001-bach-window.ts.
- **datasets/jam-actions-v0/records/bach-prelude-c-major-bwv846-m061-062.json** has a block written by scripts/revise-jam-actions-v0-r001-bach-window.ts.
- **datasets/jam-actions-v0/revisions/r001-bach-m061-window/receipt.json** is written by scripts/revise-jam-actions-v0-r001-bach-window.ts.
- **datasets/jam-actions-v0/revisions/r002-bach-annotation-prose/receipt.json** is written by scripts/revise-jam-actions-v0-r002-bach-annotation-prose.ts.
- **datasets/jam-actions-v0/splits.json** is written by scripts/build-jam-actions-corpus.ts and scripts/revise-jam-actions-v0-r001-bach-window.ts.
- **datasets/jam-actions-v1-probe/PROVENANCE-NOTE.md** is written by src/dataset/acoustic-v1/generate-probe.ts.
- **datasets/jam-actions-v1-probe/README.md** is written by src/dataset/acoustic-v1/generate-probe.ts.
- **datasets/jam-actions-v1-probe/applied.json** is written by src/dataset/acoustic-v1/generate-probe.ts.
- **datasets/jam-actions-v1-probe/checksums.sha256** is written by src/dataset/acoustic-v1/generate-probe.ts.
- **datasets/jam-actions-v1-probe/manifest.json** is written by src/dataset/acoustic-v1/generate-probe.ts.
- **datasets/jam-actions-v1-probe/records.jsonl** is written by src/dataset/acoustic-v1/generate-probe.ts.
- **datasets/jam-actions-v1-probe/records/** is written by src/dataset/acoustic-v1/generate-probe.ts.
- **datasets/jam-actions-v1-probe/splits.json** is written by src/dataset/acoustic-v1/generate-probe.ts.
- **datasets/jam-actions-v1/PROVENANCE-NOTE.md** is written by src/dataset/acoustic-v1/generate-corpus.ts.
- **datasets/jam-actions-v1/README.md** is written by src/dataset/acoustic-v1/generate-corpus.ts.
- **datasets/jam-actions-v1/checksums.sha256** is written by src/dataset/acoustic-v1/generate-corpus.ts.
- **datasets/jam-actions-v1/coverage.json** is written by src/dataset/acoustic-v1/generate-corpus.ts.
- **datasets/jam-actions-v1/manifest.json** is written by src/dataset/acoustic-v1/generate-corpus.ts.
- **datasets/jam-actions-v1/records.jsonl** is written by src/dataset/acoustic-v1/generate-corpus.ts.
- **datasets/jam-actions-v1/records/** is written by src/dataset/acoustic-v1/generate-corpus.ts.
- **datasets/jam-actions-v1/splits.json** is written by src/dataset/acoustic-v1/generate-corpus.ts.
- **docs/jam-actions-v0-provenance-scan.md** is written by scripts/scan-dataset-provenance.ts.
- **docs/jam-actions-v0-slice4-e1-eval.md** is written by scripts/eval-jam-actions-tool-use.ts.
- **docs/jam-actions-v0-slice6-e2-eval.md** is written by scripts/eval-jam-actions-phrase-continuation.ts.
- **docs/jam-actions-v0-slice7-5-llm-run.md** is written by scripts/run-llm-eval.ts.
- **docs/jam-actions-v0-slice7-e3-eval.md** is written by scripts/eval-jam-actions-annotation-grounding.ts.
- **experiments/acoustic-sft/data/sft-test.jsonl** is written by experiments/acoustic-sft/format-sft.ts.
- **experiments/acoustic-sft/data/sft-train.jsonl** is written by experiments/acoustic-sft/format-sft.ts.
- **experiments/acoustic-sft/runs/** is written by experiments/acoustic-sft/runpod.mjs.
- **experiments/analysis-arc/validation-results.json** is written by scripts/analysis-validate.ts.
- **experiments/coverage-v1-sft/data/gold-test.jsonl** is written by experiments/coverage-v1-sft/format-sft.ts.
- **experiments/coverage-v1-sft/data/sft-test.jsonl** is written by experiments/coverage-v1-sft/format-sft.ts.
- **experiments/coverage-v1-sft/data/sft-train.jsonl** is written by experiments/coverage-v1-sft/format-sft.ts.
- **experiments/finetune-arc-b2/data/P1b2-gate-report.json** is written by experiments/finetune-arc-b2/scripts/build-b2-data.ts.
- **experiments/finetune-arc-b2/data/rehearsal-b2-raw.jsonl** is written by experiments/finetune-arc-b2/scripts/gen-rehearsal-b2.ts.
- **experiments/finetune-arc-b2/data/sft-train-b2.jsonl** is written by experiments/finetune-arc-b2/scripts/build-b2-data.ts.
- **experiments/finetune-arc-b2/data/sft-val-abstention.jsonl** is written by experiments/finetune-arc-b2/scripts/build-b2-data.ts.
- **experiments/finetune-arc-b2/data/sft-val-grounding.jsonl** is written by experiments/finetune-arc-b2/scripts/build-b2-data.ts.
- **experiments/finetune-arc-b2/data/sft-val-jam.jsonl** is written by experiments/finetune-arc-b2/scripts/build-b2-data.ts.
- **experiments/finetune-arc-b2/data/tools-inspector9.json** is written by experiments/finetune-arc-b2/scripts/build-b2-data.ts.
- **experiments/finetune-arc-b2/data/tools-mcp41.json** is written by experiments/finetune-arc-b2/scripts/build-b2-data.ts.
- **experiments/finetune-arc-b2/data/transfer-slice-b2.jsonl** is written by experiments/finetune-arc-b2/scripts/transfer-slice-gen.ts.
- **experiments/finetune-arc-b2/evals/b2-prerun-gate.json** is written by experiments/finetune-arc-b2/scripts/run-b2-evals.mjs.
- **experiments/finetune-arc-b2/evals/b2-run.log** is written by experiments/finetune-arc-b2/scripts/run-b2-evals.mjs.
- **experiments/finetune-arc-v1/data/P1v1-gate-report.json** is written by experiments/finetune-arc-v1/scripts/build-v1-data.ts.
- **experiments/finetune-arc-v1/data/rehearsal-raw.jsonl** is written by experiments/finetune-arc-v1/scripts/gen-rehearsal.ts.
- **experiments/finetune-arc-v1/data/sft-train-v1.jsonl** is written by experiments/finetune-arc-v1/scripts/build-v1-data.ts.
- **experiments/finetune-arc-v1/data/sft-val-grounding.jsonl** is written by experiments/finetune-arc-v1/scripts/build-v1-data.ts.
- **experiments/finetune-arc-v1/data/sft-val-jam.jsonl** is written by experiments/finetune-arc-v1/scripts/build-v1-data.ts.
- **experiments/finetune-arc-v1/data/tools-inspector9.json** is written by experiments/finetune-arc-v1/scripts/build-v1-data.ts.
- **experiments/finetune-arc-v1/data/tools-mcp41.json** is written by experiments/finetune-arc-v1/scripts/build-v1-data.ts.
- **experiments/finetune-arc-v2/data/b1-cohort.json** is written by experiments/finetune-arc-v2/scripts/derive-b1-cohort.ts.
- **experiments/finetune-arc-v2/evals/b1-prerun-gate.json** is written by experiments/finetune-arc-v2/scripts/run-b1-evals.mjs.
- **experiments/finetune-arc-v2/evals/b1-run.log** is written by experiments/finetune-arc-v2/scripts/run-b1-evals.mjs.
- **experiments/finetune-arc/data/P1-gate-report.json** is written by experiments/finetune-arc/scripts/build-sft-data.ts.
- **experiments/finetune-arc/data/sft-inner-val.jsonl** is written by experiments/finetune-arc/scripts/build-sft-data.ts.
- **experiments/finetune-arc/data/sft-train.jsonl** is written by experiments/finetune-arc/scripts/build-sft-data.ts.
- **experiments/finetune-arc/data/tools.json** is written by experiments/finetune-arc/scripts/build-sft-data.ts.
- **experiments/jam-actions-v0-lora/train.jsonl** is written by experiments/jam-actions-v0-lora/generate_train_jsonl.py.
- **experiments/maker-arc/e2-gate/gate-summary.json** is written by scripts/e2-gate-summary.ts.
- **experiments/maker-arc/e2v2-gate/** is written by scripts/e2v2-gate.ts.
- **experiments/maker-arc/e2v2-premeasure/premeasure.json** is written by scripts/e2v2-premeasure.ts.
- **experiments/maker-arc/er-gate/gate-summary.json** is written by scripts/er-gate-summary.ts.
- **experiments/maker-arc/implied-chord-snapshot.json** is written by scripts/implied-chord-snapshot.ts.
- **experiments/maker-arc/phase-c-experiments/** is written by scripts/bass-aware-completeness.ts and scripts/er-experiments.ts.
- **experiments/rollout-arc/p1c/gold.jsonl** is written by experiments/rollout-arc/scripts/search-learnability.mjs.
- **experiments/rollout-arc/p1c/pin.json** is written by experiments/rollout-arc/scripts/search-learnability.mjs.
- **experiments/rollout-arc/p1c/preds-guess.jsonl** is written by experiments/rollout-arc/scripts/search-learnability.mjs.
- **experiments/rollout-arc/p1c/preds-pass8.jsonl** is written by experiments/rollout-arc/scripts/search-learnability.mjs.
- **experiments/rollout-arc/p2/compensator-drill.json** is written by experiments/rollout-arc/p2/scripts/compensator-drill.mjs.
- **experiments/rollout-arc/p3/runs/er-items.json** is written by experiments/rollout-arc/p3/scripts/emit-er-prompts.mts.
- **experiments/rollout-arc/p3/runs/er-probe-summary.json** is written by experiments/rollout-arc/p3/scripts/score-er-probe.mts.
- **experiments/rollout-arc/p3/runs/er-prompts.jsonl** is written by experiments/rollout-arc/p3/scripts/emit-er-prompts.mts.
- **experiments/rollout-arc/p4/REVIEW-PACKET.md** is written by experiments/rollout-arc/p4/scripts/emit-review-packet.mts.
- **experiments/rollout-arc/p4/fixtures/progressions-v1.json** is written by experiments/rollout-arc/p4/scripts/emit-progression-fixture.mts.
- **experiments/rollout-arc/p4/runs/** is written by experiments/rollout-arc/p4/scripts/score-curriculum.mts.
- **experiments/rollout-arc/p4/runs/fewshot-exemplar.txt** is written by experiments/rollout-arc/p4/scripts/make-fewshot.mts.
- **experiments/rollout-arc/p4/runs/prompts-heldout-v1.jsonl** is written by experiments/rollout-arc/p4/scripts/emit-prompts-from-fixture.mts.
- **experiments/rollout-arc/p4/runs/prompts-vs-heldout.jsonl** is written by experiments/rollout-arc/p4/scripts/emit-vs-prompts.mts.
- **experiments/rollout-arc/p4/runs/spec-4bar-prefixed.jsonl** is written by experiments/rollout-arc/p4/scripts/emit-exploring-starts.mts.
- **experiments/rollout-arc/p4/runs/spec-4bar-same-opening.jsonl** is written by experiments/rollout-arc/p4/scripts/emit-same-opening.mts.
- **experiments/rollout-arc/p4/runs/spec-probe-summary.json** is written by experiments/rollout-arc/p4/scripts/score-spec-probe.mts.
- **experiments/rollout-arc/p4/runs/vl-probe-summary.json** is written by experiments/rollout-arc/p4/scripts/score-vl-probe.mts.
- **experiments/rollout-arc/p4/runs/vl-prompts.jsonl** is written by experiments/rollout-arc/p4/scripts/emit-vl-prompts.mts.
- **samples/vocal/** is written by scripts/bake-carriers.ts, scripts/generate-carriers.ts and scripts/synth-carriers.ts.
- **scores/amazing-grace.score-clock.v1.json** is written by scripts/build-score-clock.mjs.
- **site/public/** is written by scripts/render-landing-pianoroll.ts.
- **songs/library/** is written by scripts/annotate-batch.ts and scripts/download-library.ts.
- **songs/library/.npmignore** is written by scripts/npm-ship-list.ts.
- **songs/library/folk/america-the-beautiful.json** is written by scripts/create-america-the-beautiful.ts.
- **songs/library/folk/america-the-beautiful.mid** is written by scripts/create-america-the-beautiful.ts.
- **songs/quarantine/** is written by scripts/provenance-audit.ts.
- **spaces/jam-actions-live/divergence.json** is written by spaces/jam-actions-live/gen-divergence.mjs.
- **src/dataset/tool-schemas.json** is written by scripts/extract-mcp-tool-schemas.ts.

## Hand-authored

People write .github/, plugin/ and the repository root; 48 writes with paths built at run time may land here.

- **spaces/jam-actions-live/demo_data.json** is written by spaces/jam-actions-live/extract-demo-data.mjs from inputs this repository does not keep, and by people.

## Where to start

.github/workflows/ci.yml → src/mcp-server.ts → src/stdio-supervisor.ts → src/state-home.ts → src/songs/config/loader.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 5 import sites name declared dependencies that share their names with local modules (datasets and spaces); they are read as the dependencies, which are not in this repository.
- 2 imports could not be resolved: `scripts/cast-kokoro-lock.mjs` imports a path built at run time; `scripts/cast-kokoro-lock.mjs` probes `kokoro-js`, which is not declared.
- 48 writes and 112 reads use paths built at run time and are not named here.
- 26 writes go to places this repository does not track, so they are not listed as generated.
- 100 writes and 376 reads go to a path their caller passes, not to this repository.
- 1 write and 18 reads go to the directory the command is run in, not to this repository.
- 3 writes and 11 reads go to the home directory (.ssh/), not to this repository.
- 8 writes and 4 reads go to a temporary directory, not to this repository.
- 1 write and 1 read go to the home directory (.ai-jam-sessions/) or a path their caller passes, not to this repository.
- 1 read goes to the directory the command is run in (tmp/) or a path its caller passes, not to this repository.
- 1 write goes to a temporary directory or a path its caller passes, not to this repository.
- 20 commands are built at run time and not followed, 2 of them in tests.
- There is a docker-compose.yml that no workflow runs; what deploys from it does so from outside this repository, and is not on this page.
- There is a Hugging Face Space under spaces/jam-actions-live/; what ships from it goes from outside this repository, and is not on this page.
- CI runs or checks 468 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.
- Release runs or checks 406 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
