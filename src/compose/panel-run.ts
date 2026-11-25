// ─── Compose: the panel orchestration (one source for script / tool / CLI) ────
//
// The reusable core behind the quality smoke-screen FEATURE (the director's ask:
// users — and we, over time — run cross-family LLM panels with different models
// and songs; ongoing; NO quality promises). It is SYSTEM- and JUDGE-injected so
// it is deterministic + unit-testable with stubs (no live Ollama), and so the
// script, the MCP tool, and the CLI all drive the identical logic and can never
// drift (like the maker's shared brief + loop).
//
// It stays honest by construction (bws.ts): the discrimination-floor gate can
// return UNINTERPRETABLE, and INCONCLUSIVE is a first-class outcome. This module
// only orchestrates + renders the shared text report; the judgment math lives in
// bws.ts, the LLM judge in ollama-bws-judge.ts. No LLM, no HTTP here.
// ─────────────────────────────────────────────────────────────────────────────

import {
  renderVoicingText,
  shuffledOrder,
  makeRng,
  aggregatePanel,
  interpretPanel,
  MIN_PANEL_JUDGES,
  INSUFFICIENT_JUDGES_CODE,
  type PanelSystem,
  type BwsVote,
  type PanelResult,
} from "./bws.js";
import type { JudgeCallOutcome, JudgeDropReason } from "./ollama-bws-judge.js";
import { throwIfAborted } from "../cancel.js";
import type { ChordProgression } from "./realize.js";
import type { Realization } from "./types.js";

/** A system under test + how to realize it (deterministic realizer or model proposer). */
export interface PanelSystemSpec extends PanelSystem {
  realize: (progression: ChordProgression, signal?: AbortSignal) => Promise<Realization> | Realization;
}

/** A judge family (OllamaBwsJudge satisfies this; a stub does in tests). */
export interface PanelJudge {
  family: string;
  model?: string;
  thinkSetting?: () => boolean | null;
  judge(
    key: string,
    options: string[],
    tupleSeed: number,
    signal?: AbortSignal,
  ): Promise<{ best: number; worst: number } | null>;
  judgeDetailed?(
    key: string,
    options: string[],
    tupleSeed: number,
    signal?: AbortSignal,
  ): Promise<JudgeCallOutcome>;
}

/** One dropped tuple attributed to its song, shuffled option order, and failure reason. */
export interface DroppedTupleRecord {
  songId: string;
  tupleSeed: number;
  tuple: string[];
  reason: JudgeDropReason;
  detail?: string;
}

/** Per-judge drop summary reported by `runVoiceLeadingPanel` / `compose_panel`. */
export interface JudgeDropSummary {
  family: string;
  model?: string;
  droppedCount: number;
  byReason: Record<JudgeDropReason, number>;
  tuples: DroppedTupleRecord[];
}

/** Panel-wide drop attribution across all judges and reasons. */
export interface PanelDropsReport {
  total: number;
  byReason: Record<JudgeDropReason, number>;
  byJudge: JudgeDropSummary[];
}

/** A song excluded from aggregation because drops left it below `minJudges`. */
export interface VoidedSong {
  songId: string;
  votesCast: number;
  minJudges: number;
  reason: string;
  droppedJudges: Array<{ family: string; model?: string; reason: JudgeDropReason }>;
}

/** Per-judge descriptor including the resolved `think` flag (`false` or `null` when omitted). */
export interface PanelJudgeSummary {
  family: string;
  model?: string;
  think: boolean | null;
}

export interface PanelRunOptions {
  progressions: Array<{ id: string; progression: ChordProgression }>;
  systems: PanelSystemSpec[];
  judges: PanelJudge[];
  /** Which system ids are the discrimination anchors + the engine under test. */
  anchors: { floor: string; valid: string; engine: string };
  floorMargin?: number;
  minJudges?: number;
  bootstrap?: number;
  seed?: number;
  /** Optional abort signal cancelling further realizations and judge calls. */
  signal?: AbortSignal;
  /** Progress callback (a dot per collected vote, an "x" per dropped) — optional. */
  onProgress?: (mark: string) => void;
  /** Per judge × song step (P9-004). Optional; existing onProgress dots stay. */
  onVoteStep?: (info: {
    songId: string;
    judgeFamily: string;
    judgeModel?: string;
    step: number;
    total: number;
    dropped: boolean;
    /** "start" = realization or a judgment is beginning; "done" = a vote completed. */
    phase?: "start" | "done";
  }) => void | Promise<void>;
}

export interface PanelReport {
  result: PanelResult;
  systems: PanelSystem[];
  judges: PanelJudgeSummary[];
  songIds: string[];
  validSongs: string[];
  voidedSongs: VoidedSong[];
  minJudges: number;
  votesCollected: number;
  votesCounted: number;
  votesPossible: number;
  drops: PanelDropsReport;
  text: string;
}

function emptyReasonCounts(): Record<JudgeDropReason, number> {
  return {
    timeout: 0,
    empty_reply: 0,
    parse_failure: 0,
    unreachable: 0,
  };
}

/**
 * Run a cross-family best-worst panel: realize each system per progression ONCE,
 * then have every judge best-worst an anonymized, shuffled view; enforce the
 * minimum-judges quorum per song (voiding under-quorum songs rather than
 * silently skewing aggregation), aggregate + interpret through the
 * discrimination-floor gate. Returns the structured result + drop/void report.
 */
export async function runVoiceLeadingPanel(opts: PanelRunOptions): Promise<PanelReport> {
  const { progressions, systems, judges, anchors } = opts;
  const minJudges = opts.minJudges ?? MIN_PANEL_JUDGES;
  const countedVotes: BwsVote[] = [];
  const countedTupleSystems: string[][] = [];
  const validSongs: string[] = [];
  const voidedSongs: VoidedSong[] = [];
  let totalCollected = 0;

  const byReason = emptyReasonCounts();
  const byJudge: JudgeDropSummary[] = judges.map((j) => ({
    family: j.family,
    model: j.model,
    droppedCount: 0,
    byReason: emptyReasonCounts(),
    tuples: [],
  }));

  const votesPossible = progressions.length * judges.length;
  let step = 0;

  for (let si = 0; si < progressions.length; si++) {
    throwIfAborted(opts.signal, "compose_panel cancelled");
    const { id: songId, progression } = progressions[si];
    // Start events keep progress notifications flowing from the first second
    // (P9-004): realization and a cold first judgment can each run past the
    // SDK's 60s default client window if the stream were completion-only.
    await opts.onVoteStep?.({
      songId,
      judgeFamily: "realize",
      step,
      total: votesPossible,
      dropped: false,
      phase: "start",
    });
    const real: Record<string, Realization> = {};
    for (const s of systems) {
      throwIfAborted(opts.signal, "compose_panel cancelled");
      real[s.id] = await s.realize(progression, opts.signal);
    }

    const songVotes: BwsVote[] = [];
    const songTupleSystems: string[][] = [];
    const songDrops: Array<{ family: string; model?: string; reason: JudgeDropReason }> = [];

    for (let fi = 0; fi < judges.length; fi++) {
      throwIfAborted(opts.signal, "compose_panel cancelled");
      const judge = judges[fi];
      await opts.onVoteStep?.({
        songId,
        judgeFamily: judge.family,
        judgeModel: judge.model,
        step,
        total: votesPossible,
        dropped: false,
        phase: "start",
      });
      const order = shuffledOrder(systems.length, makeRng(1000 * (si + 1) + 31 * (fi + 1)));
      const orderedIds = order.map((k) => systems[k].id);
      const optionsText = orderedIds.map((id) => renderVoicingText(real[id]));
      const tupleSeed = si * 10 + fi;

      let outcome: JudgeCallOutcome;
      if (judge.judgeDetailed) {
        outcome = await judge.judgeDetailed(progression.key, optionsText, tupleSeed, opts.signal);
      } else {
        const rawVote = await judge.judge(progression.key, optionsText, tupleSeed, opts.signal);
        outcome = rawVote
          ? { ok: true, vote: rawVote }
          : { ok: false, reason: "parse_failure", detail: "Judge returned null." };
      }
      throwIfAborted(opts.signal, "compose_panel cancelled");

      if (outcome.ok) {
        totalCollected += 1;
        songVotes.push({ options: order, best: outcome.vote.best, worst: outcome.vote.worst, family: judge.family });
        songTupleSystems.push(orderedIds);
      } else {
        byReason[outcome.reason] += 1;
        byJudge[fi].droppedCount += 1;
        byJudge[fi].byReason[outcome.reason] += 1;
        byJudge[fi].tuples.push({
          songId,
          tupleSeed,
          tuple: orderedIds,
          reason: outcome.reason,
          ...(outcome.detail ? { detail: outcome.detail } : {}),
        });
        songDrops.push({
          family: judge.family,
          ...(judge.model ? { model: judge.model } : {}),
          reason: outcome.reason,
        });
      }

      opts.onProgress?.(outcome.ok ? "." : "x");
      step += 1;
      await opts.onVoteStep?.({
        songId,
        judgeFamily: judge.family,
        judgeModel: judge.model,
        step,
        total: votesPossible,
        dropped: !outcome.ok,
        phase: "done",
      });
    }

    if (songVotes.length < minJudges) {
      voidedSongs.push({
        songId,
        votesCast: songVotes.length,
        minJudges,
        reason: `${INSUFFICIENT_JUDGES_CODE}: ${songVotes.length} of ${minJudges} judges voted`,
        droppedJudges: songDrops,
      });
    } else {
      validSongs.push(songId);
      countedVotes.push(...songVotes);
      countedTupleSystems.push(...songTupleSystems);
    }
  }

  const dropTotal = byReason.timeout + byReason.empty_reply + byReason.parse_failure + byReason.unreachable;
  const drops: PanelDropsReport = { total: dropTotal, byReason, byJudge };

  const judgeSummaries: PanelJudgeSummary[] = judges.map((j) => ({
    family: j.family,
    model: j.model,
    think: j.thinkSetting ? j.thinkSetting() : null,
  }));

  const bareSystems: PanelSystem[] = systems.map(({ id, note }) => ({ id, note }));
  const agg = aggregatePanel(bareSystems, countedVotes, countedTupleSystems, {
    bootstrap: opts.bootstrap ?? 500,
    seed: opts.seed ?? 42,
  });
  const result =
    validSongs.length === 0
      ? {
          ...agg,
          interpretable: false,
          verdict:
            `UNINTERPRETABLE — all ${progressions.length} songs were voided below the ` +
            `${minJudges}-judge minimum (${voidedSongs.map((v) => `${v.songId}: ${v.reason}`).join("; ")}).`,
        }
      : interpretPanel(agg, anchors, { floorMargin: opts.floorMargin });

  const text = renderPanelReport({
    result,
    songIds: progressions.map((p) => p.id),
    validSongs,
    voidedSongs,
    minJudges,
    judges: judgeSummaries,
    votesCollected: totalCollected,
    votesCounted: countedVotes.length,
    votesPossible,
    drops,
  });

  return {
    result,
    systems: bareSystems,
    judges: judgeSummaries,
    songIds: progressions.map((p) => p.id),
    validSongs,
    voidedSongs,
    minJudges,
    votesCollected: totalCollected,
    votesCounted: countedVotes.length,
    votesPossible,
    drops,
    text,
  };
}

/** The shared human-readable report (script / tool / CLI all print this). */
export function renderPanelReport(r: {
  result: PanelResult;
  songIds: string[];
  validSongs?: string[];
  voidedSongs?: VoidedSong[];
  minJudges?: number;
  judges: Array<{ family: string; model?: string; think?: boolean | null }>;
  votesCollected: number;
  votesCounted?: number;
  votesPossible: number;
  drops?: PanelDropsReport;
}): string {
  const lines: string[] = [];
  const judgeLabels = r.judges.map((j) => {
    const thinkTag = j.think === false ? "think=false" : j.think === true ? "think=true" : "think=omitted";
    return j.think !== undefined ? `${j.family} [${thinkTag}]` : j.family;
  });
  lines.push(
    `Cross-family LLM voice-leading panel — ${r.songIds.length} songs, ` +
      `${r.judges.length} judge families (${judgeLabels.join(", ")}).`,
  );
  const voided = r.voidedSongs ?? [];
  const validCount = r.validSongs?.length ?? Math.max(0, r.songIds.length - voided.length);
  const counted = r.votesCounted ?? r.votesCollected;
  const voteTail = voided.length > 0 ? ` (${counted} counted across ${validCount}/${r.songIds.length} valid songs)` : "";
  lines.push(
    `Collected ${r.votesCollected}/${r.votesPossible} votes${voteTail} (x = dropped vote attributed below).`,
  );

  if (r.drops) {
    if (r.drops.total === 0) {
      lines.push("Dropped votes: 0.");
    } else {
      const reasons: JudgeDropReason[] = ["timeout", "empty_reply", "parse_failure", "unreachable"];
      const summary = reasons.map((k) => `${k}: ${r.drops!.byReason[k]}`).join(", ");
      lines.push(`Dropped votes: ${r.drops.total} (${summary})`);
      for (const jd of r.drops.byJudge) {
        if (jd.droppedCount === 0) continue;
        const label = jd.model ? `${jd.family}(${jd.model})` : jd.family;
        const perReason = reasons
          .filter((k) => jd.byReason[k] > 0)
          .map((k) => `${k}=${jd.byReason[k]}`)
          .join(", ");
        const tuples = jd.tuples
          .map((t) => `${t.songId}#${t.tupleSeed}[${t.tuple.join("/")}]->${t.reason}`)
          .join("; ");
        lines.push(`  - ${label}: ${jd.droppedCount} dropped (${perReason}) — ${tuples}`);
      }
    }
  }

  if (voided.length > 0) {
    lines.push("Voided songs (below minimum-judge quorum):");
    for (const v of voided) {
      lines.push(`  - ${v.songId}: VOIDED — ${v.reason}`);
    }
  }

  lines.push("");
  lines.push(`${"system".padEnd(10)} ${"BWS".padStart(7)} ${"95% CI".padStart(16)} ${"BT".padStart(7)} ${"best".padStart(6)} ${"worst".padStart(6)}`);
  lines.push("─".repeat(60));
  for (const s of r.result.scores) {
    lines.push(
      `${s.id.padEnd(10)} ${s.bwsScore.toFixed(2).padStart(7)} ` +
        `${`[${s.ci[0].toFixed(2)}, ${s.ci[1].toFixed(2)}]`.padStart(16)} ` +
        `${s.btStrength.toFixed(2).padStart(7)} ${String(s.best).padStart(6)} ${String(s.worst).padStart(6)}`,
    );
  }
  lines.push("");
  lines.push(`Ranking (best→worst): ${r.result.ranking.join(" > ")}`);
  lines.push(`Inter-family agreement on the top pick: ${(r.result.familyAgreement * 100).toFixed(0)}%`);
  if (r.minJudges !== undefined || voided.length > 0) {
    const minJ = r.minJudges ?? MIN_PANEL_JUDGES;
    if (voided.length === 0) {
      lines.push(`Minimum-judges gate: PASSED (${validCount}/${r.songIds.length} songs met >=${minJ} judges)`);
    } else if (validCount === 0) {
      lines.push(`Minimum-judges gate: FAILED (${voided.map((v) => `${v.songId}: ${v.reason}`).join("; ")})`);
    } else {
      lines.push(`Minimum-judges gate: VOIDED (${voided.length}/${r.songIds.length} songs voided — ${voided.map((v) => `${v.songId}: ${v.reason}`).join("; ")})`);
    }
  }
  lines.push(`Discrimination-floor gate: ${r.result.interpretable ? "PASSED" : "FAILED"}`);
  lines.push("");
  lines.push(`⇒ ${r.result.verdict}`);
  lines.push("");
  lines.push(
    "This ranking is directional only. Local models judging note-names cannot hear the music — " +
      "the human-audio panel is the quality claim.",
  );
  return lines.join("\n");
}
