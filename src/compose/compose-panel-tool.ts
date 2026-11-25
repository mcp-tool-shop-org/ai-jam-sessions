// ─── Compose: the compose_panel tool core (injected systems + judges) ─────────
//
// The logic behind the compose_panel MCP tool + the CLI panel subcommand, factored
// out of the server so it is unit-testable with STUB judges + STUB systems (no
// live Ollama). It validates the panel is well-formed (enough songs, systems, and
// ≥3 cross-family judges), runs runVoiceLeadingPanel, and returns a readable report
// + a structured payload — or a structured {code,message,hint} error.
//
// The Ollama glue (building OllamaBwsJudge families + the engine proposer + probing
// for reachability — Ollama is OPTIONAL) stays in mcp-server.ts / the CLI; this
// core is dependency-injected and deterministic given deterministic inputs.
// ─────────────────────────────────────────────────────────────────────────────

import {
  runVoiceLeadingPanel,
  type PanelDropsReport,
  type PanelJudge,
  type PanelJudgeSummary,
  type PanelSystemSpec,
  type VoidedSong,
} from "./panel-run.js";
import type { ChordProgression } from "./realize.js";
import { MIN_PANEL_JUDGES, type PanelScore } from "./bws.js";

export interface ComposePanelToolInput {
  progressions: Array<{ id: string; progression: ChordProgression }>;
  systems: PanelSystemSpec[];
  judges: PanelJudge[];
  /** System ids for the discrimination anchors + engine. Default floor/refined/engine. */
  anchors?: { floor: string; valid: string; engine: string };
  /** A label carried into the payload/report (e.g. the style the engine used). */
  style?: string;
  floorMargin?: number;
  minJudges?: number;
  bootstrap?: number;
  seed?: number;
  signal?: AbortSignal;
  onProgress?: (mark: string) => void;
  onVoteStep?: (info: {
    songId: string;
    judgeFamily: string;
    judgeModel?: string;
    step: number;
    total: number;
    dropped: boolean;
  }) => void | Promise<void>;
}

export interface ComposePanelPayload {
  style?: string;
  /** True iff the discrimination-floor gate passed (else the verdict is uninterpretable). */
  interpretable: boolean;
  verdict: string;
  ranking: string[];
  familyAgreement: number;
  scores: PanelScore[];
  minJudgesPerSong: number;
  validSongs: string[];
  voidedSongs: VoidedSong[];
  votesCollected: number;
  votesCounted: number;
  votesPossible: number;
  drops: PanelDropsReport;
  songs: string[];
  judges: PanelJudgeSummary[];
}

export type ComposePanelToolResult =
  | { ok: true; text: string; payload: ComposePanelPayload }
  | { ok: false; code: "no_songs" | "too_few_systems" | "too_few_judges" | "missing_anchor"; message: string; hint: string };

/**
 * Run + validate a cross-family voice-leading panel. NEVER a quality claim — a
 * directional symbolic smoke-screen with a discrimination-floor gate (bws.ts).
 * Deterministic given deterministic systems + judges.
 */
export async function runComposePanelTool(input: ComposePanelToolInput): Promise<ComposePanelToolResult> {
  const anchors = input.anchors ?? { floor: "floor", valid: "refined", engine: "engine" };
  const minJudges = input.minJudges ?? MIN_PANEL_JUDGES;

  if (input.progressions.length === 0) {
    return { ok: false, code: "no_songs", message: "No songs to run the panel over.", hint: "Pass at least one library song id (browse with list_songs)." };
  }
  if (input.systems.length < 2) {
    return { ok: false, code: "too_few_systems", message: `A panel needs ≥2 systems to compare; got ${input.systems.length}.`, hint: "Include at least the floor + engine systems." };
  }
  if (input.judges.length < minJudges) {
    return {
      ok: false,
      code: "too_few_judges",
      message: `An honest cross-family panel needs ≥${minJudges} reachable judge families; got ${input.judges.length}.`,
      hint: "Start more local Ollama models (e.g. mistral-small:24b, granite4.1:30b, gemma4:31b) — none should be the generator family.",
    };
  }
  const ids = new Set(input.systems.map((s) => s.id));
  for (const role of [anchors.floor, anchors.valid, anchors.engine]) {
    if (!ids.has(role)) {
      return { ok: false, code: "missing_anchor", message: `The discrimination anchor system "${role}" is not among the systems.`, hint: `Include a system with id "${role}", or set anchors to existing system ids.` };
    }
  }

  const report = await runVoiceLeadingPanel({
    progressions: input.progressions,
    systems: input.systems,
    judges: input.judges,
    anchors,
    floorMargin: input.floorMargin,
    minJudges,
    bootstrap: input.bootstrap,
    seed: input.seed,
    signal: input.signal,
    onProgress: input.onProgress,
    onVoteStep: input.onVoteStep,
  });

  const payload: ComposePanelPayload = {
    style: input.style,
    interpretable: report.result.interpretable,
    verdict: report.result.verdict,
    ranking: report.result.ranking,
    familyAgreement: report.result.familyAgreement,
    scores: report.result.scores,
    minJudgesPerSong: report.minJudges,
    validSongs: report.validSongs,
    voidedSongs: report.voidedSongs,
    votesCollected: report.votesCollected,
    votesCounted: report.votesCounted,
    votesPossible: report.votesPossible,
    drops: report.drops,
    songs: report.songIds,
    judges: report.judges,
  };

  const text = `${report.text}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
  return { ok: true, text, payload };
}
