// ─── P4 voice-leading bridge ─────────────────────────────────────────────────
//
// A SEPARATE server from p2-env-server.mjs, deliberately. That bridge is a
// committed receipt surface with 16 tests and the whole P2 record depends on it;
// the voice-leading task shares none of its machinery — no tools, no MCP child,
// no synth corpus — so entangling them would put the P2 receipts at risk to save
// a file. Decompose by what changes together.
//
// The trainer talks to this over the SAME contract reward.py already speaks:
//   GET  /cases?split=train&limit=N  -> dataset rows carrying `prompt` and `gold`
//   POST /score {gold, messages}     -> {reward, format_ok, correct, verdict, tool_turns}
// `gold` is the song id, and the progression lives server-side, so reward.py
// needs NO changes at all.
//
// Scoring is the same path the P4 probe measured:
//   parseSpecResponse -> renderSpecRealization -> verifyVoiceLeading(style).admitted
// ─────────────────────────────────────────────────────────────────────────────

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../../../src/songs/library.ts";
import { getAllSongs } from "../../../src/songs/registry.ts";
import { analyzeHarmony } from "../../../src/analysis/index.ts";
import {
  progressionFromAnalysis,
  specSystem,
  buildSpecUser,
  parseSpecResponse,
  renderSpecRealization,
  verifyVoiceLeading,
} from "../../../src/compose/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");

export const VL_STYLES = ["common-practice", "lead-sheet", "film-ambient"];

/** Deterministic shuffle (mulberry32) — the P4 pool was drawn this way, and a
 *  contiguous slice is NOT a random sample: this library is ordered by genre. */
export function shuffled(items, seed) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The first chord that actually carries a symbol — the measure a forced opening
 *  would pin. `N/C` measures render nothing, so they cannot be an opening. */
function firstNamedChord(progression) {
  return progression.chords.find((c) => c.chordSymbol && c.chordSymbol !== "N/C") ?? null;
}

/** Which degree tuples render `voices` real pitches on the first named measure?
 *
 *  Determined by RENDERING every candidate, never by guessing the chord's
 *  cardinality: a triad voiced [0,3] has no fourth chord note to sing, and the
 *  only authority on that is the renderer the verifier will see.
 *
 *  This is the OPENING ALPHABET and it must be identical wherever it is built —
 *  the exploring-starts probe derived its own copy, so the two are held together
 *  by a test against the committed run rather than by hoping they agree. */
export function validOpenings(progression, voices, maxDegree = 3) {
  const first = firstNamedChord(progression);
  if (!first) return [];
  const span = maxDegree + 1;
  const ok = [];
  for (let n = 0; n < span ** voices; n++) {
    const degrees = new Array(voices);
    let rest = n;
    // degrees[0] is the slowest-varying digit, so the enumeration order is
    // [0,0], [0,1], ... [1,0] — the order the probe used, which is what makes
    // `openings[i % openings.length]` reproducible across scripts.
    for (let v = voices - 1; v >= 0; v--) {
      degrees[v] = rest % span;
      rest = Math.floor(rest / span);
    }
    const real = renderSpecRealization(progression, [{ measure: first.measure, degrees }], voices);
    const frame = real.frames.find((f) => f.measure === first.measure);
    if (frame && frame.voices.length === voices) ok.push(degrees);
  }
  return ok;
}

/** The partial assistant turn a rollout is pre-filled with: valid JSON up to and
 *  including the first measure's object, cut mid-array so the model CONTINUES the
 *  answer rather than starting a new one. Built here because the bridge owns the
 *  format `parseSpecResponse` will have to read back. */
export function openingPrefix(progression, degrees) {
  const first = firstNamedChord(progression);
  if (!first) throw new Error("no named chord: this progression has no openable measure");
  return `[{"measure": ${first.measure}, "degrees": [${degrees.join(", ")}]},`;
}

/** The dataset row the trainer reads. `gold` is the lookup key, not an answer —
 *  there is no single correct voicing, which is the point of the task.
 *
 *  `openings` / `prefixes` ride along on every row whether or not the run forces
 *  them. They are derived from the same renderer the verifier uses, so a trainer
 *  that wants exploring starts never has to reimplement validity, and a run that
 *  does not force prefixes simply ignores two columns. */
export function vlCaseRow(songId, progression, voices, style) {
  const system = specSystem(voices);
  const user = buildSpecUser(progression, voices);
  const openings = validOpenings(progression, voices);
  return {
    id: songId,
    song_id: songId,
    split: "train",
    voices,
    style,
    chords: progression.chords.filter((c) => c.chordSymbol && c.chordSymbol !== "N/C").length,
    gold: songId,
    system,
    user,
    openings,
    prefixes: openings.map((d) => openingPrefix(progression, d)),
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

/** Score one completion. Mirrors the P4 probe's scorer exactly. */
export function scoreVoicing(progression, raw, voices, style) {
  const specs = parseSpecResponse(raw);
  const formatOk = specs.length > 0;
  const real = renderSpecRealization(progression, specs, voices);

  // STRUCTURE GATE, and it is load-bearing as a REWARD gate, not a nicety.
  // verifyVoiceLeading admits a realization with no sounding frames: with zero
  // frames every rule passes vacuously, so an UNPARSEABLE completion returns
  // admitted:true and would score 1.0. The shortest path to full reward would be
  // to emit nothing parseable, and a policy finds that quickly. Caught locally by
  // p4-vl-server.test.ts before any pod existed; the P4 measurements are unaffected
  // (unparsed was 0 across every published run).
  const named = progression.chords.filter((c) => c.chordSymbol && c.chordSymbol !== 'N/C');
  const sounding = real.frames.filter((f) => Array.isArray(f.voices) && f.voices.length > 0);
  const structureOk = formatOk && sounding.length === named.length;

  // Which measure the completion actually opens on. Under prefix forcing this is
  // the INDEPENDENT check that the forced opening reached the scorer: if the prefix
  // were stripped somewhere between generation and scoring, the first parsed spec
  // would be measure 2 and the reward would be judging everything except the measure
  // that was pinned. Nothing else in this file would notice.
  const firstMeasure = specs.length ? specs[0].measure : null;
  const expectedFirstMeasure = named.length ? named[0].measure : null;

  const verdict = verifyVoiceLeading(real, { style, requireVoiceCount: voices });
  const failing = Object.entries(verdict.hardGates)
    .filter(([, r]) => !r.pass)
    .map(([rule]) => rule);
  const admitted = structureOk && verdict.admitted;
  return {
    reward: admitted ? 1.0 : 0.0,
    format_ok: formatOk,
    correct: admitted,
    verdict: admitted ? 'admitted' : (!structureOk ? 'structure' : failing.join(',') || 'rejected'),
    failing_rules: structureOk ? failing : ['structure'],
    sounding_frames: sounding.length,
    expected_frames: named.length,
    first_measure: firstMeasure,
    first_measure_ok: firstMeasure !== null && firstMeasure === expectedFirstMeasure,
    voice_count: verdict.voiceCount,
    tool_turns: 0,
  };
}

/** Flatten a chat transcript to the assistant's last message — no tools here, so
 *  the completion IS the answer and there is no interleaving to reconstruct. */
export function lastAssistantText(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m && m.role === "assistant") {
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) return m.content.map((p) => (typeof p === "string" ? p : (p?.text ?? ""))).join("");
    }
  }
  // A bare completion string, which is what TRL hands a no-tool run.
  if (typeof messages === "string") return messages;
  return "";
}

/** Build the pool from the local song library. Only reachable without a fixture. */
function buildFromLibrary(pool, bars) {
  for (const song of getAllSongs()) {
    let progression;
    try {
      progression = progressionFromAnalysis(analyzeHarmony(song, { measureRange: [1, bars] }));
    } catch {
      continue;
    }
    const named = progression.chords.filter((c) => c.chordSymbol && c.chordSymbol !== "N/C");
    if (named.length < 4) continue;
    pool.push({ songId: song.id, progression });
  }
  return pool;
}

export async function startVlServer(opts = {}) {
  const args = {
    port: 8766,
    host: "127.0.0.1",
    voices: 2,
    style: "film-ambient",
    bars: 8,
    seed: 20260913,
    // Path to a frozen progression set. songs/library ships only 14 redistributable
    // songs; the other 94 are fetched from source and never enter git, so a FRESH
    // CLONE BUILDS A 14-SONG POOL where a dev rig builds 107. The P4 smoke run
    // discovered this by serving 14 rows to a trainer asking for 32.
    fixture: null,
    // Hard floor. The bridge EXITS rather than serve a pool smaller than the run
    // needs: a truncated pool is not a smaller experiment, it is a different one.
    requirePool: 0,
    ...opts,
  };
  if (!VL_STYLES.includes(args.style)) {
    throw new Error(`style must be one of ${VL_STYLES.join("|")}, got ${args.style}`);
  }

  let pool = [];
  let source = "library";

  if (args.fixture) {
    if (!existsSync(args.fixture)) {
      throw new Error(`HALT: fixture not found at ${args.fixture}`);
    }
    const fx = JSON.parse(readFileSync(args.fixture, "utf8"));
    if (fx.schema !== "p4-progressions/1") {
      throw new Error(`HALT: fixture schema ${fx.schema} is not p4-progressions/1`);
    }
    pool = fx.progressions.map((r) => ({ songId: r.songId, progression: r.progression }));
    source = "fixture";
  } else {
    initializeFromLibrary(join(REPO, "songs", "library"));
    buildFromLibrary(pool, args.bars);
  }

  if (pool.length < args.requirePool) {
    throw new Error(
      `HALT: pool is ${pool.length} but --require-pool is ${args.requirePool}. ` +
        (source === "library"
          ? "This clone's song library is not fully fetched (14 songs ship; 94 are fetched " +
            "from source). Pass --fixture to use the frozen set."
          : "The fixture is smaller than the run needs.")
    );
  }
  // A fixture is ALREADY the frozen draw; reshuffling it would defeat the point.
  const ordered = source === "fixture" ? pool : shuffled(pool, args.seed);
  const byId = new Map(ordered.map((p) => [p.songId, p.progression]));

  let scored = 0;
  let unparsed = 0;
  // Completions whose first parsed measure is not the progression's first named
  // measure. Under prefix forcing this must stay at 0: a non-zero delta over a
  // forced run means the forced opening never reached the scorer.
  let firstMeasureWrong = 0;

  /** Histogram of |valid openings| over the served pool, computed once. */
  let _openings = null;
  const openingsSummary = () => {
    if (_openings) return _openings;
    const hist = {};
    let min = Infinity;
    let max = 0;
    for (const p of ordered) {
      const n = validOpenings(p.progression, args.voices).length;
      hist[n] = (hist[n] ?? 0) + 1;
      if (n < min) min = n;
      if (n > max) max = n;
    }
    _openings = { min: Number.isFinite(min) ? min : 0, max, histogram: hist };
    return _openings;
  };

  const json = (res, code, body) => {
    const s = JSON.stringify(body);
    res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(s) });
    res.end(s);
  };
  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        try {
          resolve(b ? JSON.parse(b) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${args.host}:${args.port}`);

      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, {
          ok: true,
          task: "voice-leading/spec",
          voices: args.voices,
          style: args.style,
          bars: args.bars,
          seed: args.seed,
          pool_size: ordered.length,
          pool_source: source,
          tools: [],
          // The opening alphabet, summarised. A prefix-forced run needs to record
          // how many valid openings each item actually has: a group of G=16 that
          // spans a 4-opening item is four rollouts per opening, not one, and the
          // receipt must not leave that to be inferred later.
          openings: openingsSummary(),
          counters: { scored, unparsed, first_measure_wrong: firstMeasureWrong },
        });
      }

      if (req.method === "GET" && url.pathname === "/cases") {
        const limit = url.searchParams.get("limit");
        const n = limit == null ? ordered.length : Number(limit);
        if (!Number.isInteger(n) || n < 0) return json(res, 400, { error: "limit must be a non-negative integer" });
        // The pool is ALREADY shuffled across the full library, so a prefix here
        // is a random sample, not a genre block.
        // Serving fewer rows than requested is how a 14-song pool reached a trainer
        // asking for 32 and produced prompt_repeats 2.29. Refuse instead.
        if (n > ordered.length) {
          return json(res, 409, {
            error: `pool has ${ordered.length} cases but ${n} were requested`,
            pool_source: source,
            hint: source === "library" ? "pass --fixture; this clone's library is partial" : "raise the fixture size",
          });
        }
        const cases = ordered
          .slice(0, Math.min(n, ordered.length))
          .map((p) => vlCaseRow(p.songId, p.progression, args.voices, args.style));
        return json(res, 200, { n: cases.length, cases });
      }

      if (req.method === "POST" && url.pathname === "/score") {
        const body = await readBody(req);
        if (typeof body.gold !== "string" || !body.gold) return json(res, 400, { error: "gold is required" });
        const progression = byId.get(body.gold);
        if (!progression) return json(res, 404, { error: `unknown song id ${body.gold}` });
        const raw = lastAssistantText(body.messages ?? []);
        const out = scoreVoicing(progression, raw, args.voices, args.style);
        scored++;
        if (!out.format_ok) unparsed++;
        if (!out.first_measure_ok) firstMeasureWrong++;
        return json(res, 200, out);
      }

      if (req.method === "POST" && url.pathname === "/shutdown") {
        json(res, 200, { ok: true });
        setTimeout(() => server.close(), 10);
        return;
      }

      return json(res, 404, { error: `no route ${req.method} ${url.pathname}` });
    } catch (err) {
      return json(res, 500, { error: String(err?.message ?? err) });
    }
  });

  await new Promise((resolve) => server.listen(args.port, args.host, resolve));
  const addr = server.address();
  return {
    host: args.host,
    port: typeof addr === "object" && addr ? addr.port : args.port,
    pool: ordered,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// CLI
const isMain = process.argv[1] && process.argv[1].endsWith("p4-vl-server.mjs");
if (isMain) {
  const flag = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
  };
  const started = await startVlServer({
    port: Number(flag("port", 8766)),
    voices: Number(flag("voices", 2)),
    style: flag("style", "film-ambient"),
    bars: Number(flag("bars", 8)),
    seed: Number(flag("seed", 20260913)),
    fixture: flag("fixture", null),
    requirePool: Number(flag("require-pool", 0)),
  });
  console.log(`[p4-vl] listening on http://${started.host}:${started.port} — pool ${started.pool.length}`);
}
