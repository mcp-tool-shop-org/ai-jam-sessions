import { defineConfig } from "vitest/config";

// ─── Coverage gate (C-B1-001, Stage C amend) ───────────────────────────────
//
// Before this file existed, `pnpm test:coverage` computed a report on every
// CI run (ci.yml, Node 22 leg) but nothing ever gated on it. This config adds
// a local, Codecov-independent floor so a real regression (coverage collection
// breaking, a large new module landing untested) fails the build on its own.
// codecov.yml blocks patch and project coverage at 90% lines (the project
// status allows a 1% drop). This floor is the local gate, so a regression
// fails here before the upload.
//
// Vitest 4 removed `coverage.all`; the explicit `include` below is its
// replacement — every file matching `include` appears in the report even
// with zero tests, instead of silently dropping out and inflating the
// average. That inclusion is what makes the gate meaningful against the
// "a large new module lands at 10% coverage and nobody notices" failure
// mode C-B1-001 called out.
//
// Threshold floor, measured 2026-10-06 with SKIP_DSP_VERIFICATION=1, which is
// what the coverage leg sets. Lines 16444/17368 (94.67%), statements
// 18326/19706 (92.99%), functions 2718/2856 (95.16%), branches 9690/11690
// (82.89%). Every included src file with executable lines is at 80% lines or
// better. The floor is that measurement minus 2 points, rounded down. It
// only moves up.
// ─── Test timeout ──────────────────────────────────────────────────────────
//
// Vitest's 5 s default is too tight for this repo, and the failure it produces
// is the worst kind: intermittent, and it lands on whichever test happens to
// sit nearest the line rather than on anything actually wrong.
//
// The audio layer synthesises and analyses real waveforms in-process — FFTs,
// constant-Q transforms, onset detection over multi-second buffers — and the
// dataset layer builds a 108-record corpus by rendering every take. Those run
// comfortably under 5 s uninstrumented and creep past it under `--coverage`,
// which is exactly the leg CI runs. `src/audio/stream.test.ts` measured 3.43 s
// of test time locally under coverage and timed out at 5 s on the runner.
//
// Seven test files had already worked around this with their own
// `vi.setConfig({ testTimeout: 30_000 })`. That is the per-case fix, and it
// loses: every new heavy test has to remember, and the one that forgets fails
// in CI rather than locally. The budget belongs here, once. The per-file calls
// are left in place — they are harmless and they document the intent locally.
//
// 30 s is generous per test while still catching a genuine hang; the whole
// suite runs in ~134 s wall under coverage.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Vendored third-party code (a bundled Web Audio synthesis engine) —
        // not ours to hold to a coverage bar.
        "src/vendor/**",
        // Manual dev script: requires a physical audio device, has no
        // callers from cli.ts/mcp-server.ts (confirmed by Stage A/B audit),
        // is not part of the shipped surface (absent from package.json's
        // "files").
        "src/test-sound.ts",
        // The product's own smoke-test harness, invoked directly via
        // `pnpm smoke` (both locally and in ci.yml's "Smoke" step) rather
        // than through vitest. Including it here would report it as
        // permanently 0%-covered even though it IS exercised for real on
        // every CI run, just not by this tool.
        "src/smoke.ts",
      ],
      reportsDirectory: "./coverage",
      // Keep "json" — ci.yml saves ./coverage/coverage-final.json for Codecov.
      reporter: ["text", "json", "json-summary", "html"],
      thresholds: {
        statements: 90,
        lines: 92,
        functions: 93,
        branches: 80,
      },
    },
  },
});
