/**
 * Commission a piano arrangement of a hymn from a model, for a sung exemplar: the
 * method that made the Battle Hymn's and Amazing Grace's pianos, in one command.
 *
 *   pnpm exec tsx scripts/arrange-hymn.ts --song <hymn id>            # write the brief, print the estimate
 *   pnpm exec tsx scripts/arrange-hymn.ts --song <hymn id> --yes      # ... and spend: ask, compile, import
 *   pnpm exec tsx scripts/arrange-hymn.ts --song <hymn id> --compile  # recompile an answer fixed by hand, and import
 *       [--model moonshotai/kimi-k3] [--max-tokens 200000]
 *
 * 1. The brief is built from src/vocal/hymns.ts: the tune bar by bar in LilyPond (the
 *    written key), its harmony, every stanza, a shape that builds verse by verse, and the
 *    rules that keep the answer machine-readable. The singer must find every sung note
 *    in the piano at the same moment, so the melody is required in every pass.
 * 2. The model answers on OpenRouter (Director's word, 2026-10-08: Kimi-K3 there, for
 *    arrangements only; key from OPENROUTER_API_KEY). Before spending, the worst case
 *    (max tokens at the output price) is printed; nothing is sent without --yes. The
 *    charge OpenRouter reports is recorded in meta.json.
 * 3. The answer is compiled with LilyPond 2.24 ($LILYPOND). If it does not compile, it
 *    stops: fix answer.ly by hand into <id>.ly, note the change in meta.json's `fixes`
 *    (as si-jam-sessions' receipts do), and rerun with --compile.
 * 4. The MIDI is imported (scripts/import-arrangement.ts), each verse's upbeat found by
 *    matching the verse's melody against the piano, and every sung note checked.
 *
 * Everything lands in src/vocal/arrangements/source/<arrangement id>/ (the brief, the
 * system prompt, the raw answer, the compiled .ly and meta.json), committed, so the
 * arrangement can be traced to the exact request. The MIDI is not committed.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getHymn, parseChords, parseMelody, verseSection, type Hymn, type HymnSection } from "../src/vocal/hymns.js";

const args = process.argv.slice(2);
const opt = (name: string, dflt?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const songId = opt("song");
const model = opt("model", "moonshotai/kimi-k3")!;
const maxTokens = Number(opt("max-tokens", "200000"));
const spend = args.includes("--yes");
const compileOnly = args.includes("--compile");
const lilypond = process.env.LILYPOND ?? "E:/AI/si-jam-work/tools/lilypond-2.24.4/bin/lilypond.exe";

const hymn = songId ? getHymn(songId) : undefined;
if (!hymn) {
  console.error(`usage: arrange-hymn.ts --song <hymn id> [--yes | --compile]; known: ${["america-the-beautiful-materna", "amazing-grace-new-britain", "battle-hymn-of-the-republic"].join(", ")}`);
  process.exit(2);
}
const slug = model.split("/").pop()!.replace(/[^a-z0-9.-]/gi, "-").toLowerCase();
const arrangementId = `${hymn.id.split("-").slice(0, -1).join("-") || hymn.id}-${slug}`;
const dir = join("src", "vocal", "arrangements", "source", arrangementId);
mkdirSync(dir, { recursive: true });

// ─── the brief ───────────────────────────────────────────────────────────────

const NAMES = ["c", "cs", "d", "ef", "e", "f", "fs", "g", "af", "a", "bf", "b"];
const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb"]);

/** A MIDI pitch as an absolute LilyPond pitch, English names (`g'` is G4). */
export function lyPitch(midi: number, flats: boolean): string {
  const pc = midi % 12;
  let name = NAMES[pc];
  if (!flats && name.endsWith("f") && name.length === 2) name = NAMES[pc - 1] + "s";   // ef -> ds in a sharp key
  if (flats && name.endsWith("s")) name = NAMES[(pc + 1) % 12] + "f";
  const octave = Math.floor(midi / 12) - 1;                                              // C4 = 60 = c'
  return name + (octave >= 3 ? "'".repeat(octave - 3) : ",".repeat(3 - octave));
}

/** Beats as a LilyPond duration (whole = 4 beats); throws on one LilyPond cannot write as a single note. */
export function lyDuration(beats: number): string {
  const table: Record<string, string> = { "4": "1", "3": "2.", "2": "2", "1.5": "4.", "1": "4", "0.75": "8.", "0.5": "8", "0.25": "16" };
  const d = table[String(beats)];
  if (!d) throw new Error(`no single LilyPond duration for ${beats} beats`);
  return d;
}

/** One section's melody as LilyPond bars, each with its chords: `bar N:  <notes>  <chords>`. */
export function lyBars(section: HymnSection, beatsPerBar: number, flats: boolean, firstBar = 1): string[] {
  const mel = parseMelody(section.melody, beatsPerBar);
  const chords = parseChords(section.chords, beatsPerBar);
  const nBars = Math.max(...mel.map((e) => e.bar)) + 1;
  const out: string[] = [];
  for (let b = 0; b < nBars; b++) {
    const notes = mel.map((e, i) => ({ e, i })).filter(({ e }) => e.bar === b);
    const parts = notes.map(({ e, i }) => {
      if (e.midi === null) return `r${lyDuration(e.beats)}`;
      const next = mel[i + 1];
      let s = lyPitch(e.midi, flats) + lyDuration(e.beats);
      if (next?.held && next.midi === e.midi) s += "~";                                 // a tie: one note held over
      else if (next?.held && !e.held) s += "(";                                        // a melisma starts
      if (e.held && e.midi !== null && !(next?.held) && mel[i - 1]?.midi !== e.midi) s += ")";
      return s;
    });
    let beat = 0;
    const harm = chords.filter((c) => c.bar === b).map((c) => {
      const label = `${c.name} (beat${c.beats > 1 ? "s" : ""} ${beat + 1}${c.beats > 1 ? `-${beat + c.beats}` : ""})`;
      beat += c.beats;
      return label;
    });
    out.push(`bar ${String(b + firstBar).padStart(2)}:  ${parts.join(" ").padEnd(34)}  ${harm.length === 1 ? harm[0].split(" (")[0] : harm.join(", ")}`);
  }
  return out;
}

const keyName = hymn.sourceKey.split(" ")[0];
const flats = FLAT_KEYS.has(keyName);
const lyKey = `\\key ${keyName.toLowerCase().replace("b", "f").replace("#", "s")} \\${hymn.sourceKey.includes("minor") ? "minor" : "major"}`;
const stanzas = hymn.verses.map((v, i) => `${i + 1}. ${v.replace(/-/g, "")}`);

const TEXTURES = [
  "*p*, simple and chordal, close to a hymnal setting",
  "*mp*, flowing broken chords in the left hand",
  "*mf*, fuller: the melody in octaves in the right hand over a moving bass",
  "*mp*, a hushed chorale in four parts",
  "*f* to *ff*, the melody in octaves over full chords and a moving bass",
];
/** Each verse's texture: quiet to full, the last always the fullest. */
export function texturePlan(n: number): string[] {
  if (n === 1) return [TEXTURES[4]];
  const middle = [TEXTURES[1], TEXTURES[2], TEXTURES[3]].slice(0, Math.max(0, n - 2));
  return [TEXTURES[0], ...middle, ...Array(Math.max(0, n - 2 - middle.length)).fill(TEXTURES[2]), TEXTURES[4]].slice(0, n);
}

function brief(h: Hymn): string {
  const verseFirst = h.firstVerse ? lyBars(h.firstVerse, h.beatsPerBar, flats, 0) : null;
  const verse = lyBars(h.verse, h.beatsPerBar, flats, 0);
  const intro = lyBars(h.intro, h.beatsPerBar, flats, 1);
  const plan = texturePlan(h.verses.length);
  return `# Arrange "${h.title}" (tune: ${h.tune}) for solo grand piano

Write a complete arrangement for solo grand piano, the whole hymn through, as one LilyPond 2.24 file. It will be
this project's exemplar: rendered on a sampled Yamaha C5 grand and published, with a singer performing the hymn
over it. It must sound rich, warm and expressive, and it must compile without errors or warnings.

## The source you must follow

The tune is ${h.tune} by ${h.composer}; the words are by ${h.textAuthor}. Both are public domain. Below are the
melody and harmony you must follow, in ${h.sourceKey}, ${h.beatsPerBar}/4, as LilyPond absolute pitches with English
note names (\`c'\` is middle C). Notes joined with \`(\` \`)\` are one syllable sung over several notes; \`~\` is a tie.
Do not use any later version of the hymn: no "familiar" 20th-century harmonisations, reharmonisations,
countermelodies or modulations.

${verseFirst ? "The first verse's music:\n\n```\n" + verseFirst.join("\n") + "\n```\n\nThe music of every later verse:\n" : "The music of one verse, bar by bar:"}

\`\`\`
${verse.join("\n")}
\`\`\`

Bar 0 is the bar before the verse's first full bar: its rests are where the singer is silent and the piano plays
on, and its notes are the verse's upbeat. Each verse begins with its own bar 0: write it as a complete bar, the
last bar before that verse (the end of the introduction, or a bar after the previous verse's last note).

The ${h.verses.length} stanzas (one pass each):

${stanzas.join("\n")}

## The shape

1. **Introduction**: these bars, voiced for full piano, then verse 1's bar 0:

   \`\`\`
${intro.map((l) => "   " + l).join("\n")}
   \`\`\`
2. **${h.verses.length} passes of the verse**, one for each stanza, each with its own accompaniment, building
   from quiet to full:
${plan.map((t, i) => `   - verse ${i + 1}, ${t};`).join("\n")}
3. **Coda**: two to four bars after the last verse, a final cadence, broadened, ending on a full tonic chord,
   let ring.

**The melody must sound in every pass, every note, at exactly the written rhythm and position, as the top voice
of the right hand** (in octaves where you double it). A singer performs over this and must find each of their
notes in the piano at the same moment. You may vary everything around it: texture, voicing, inner voices, bass
lines, the register of the accompaniment. Never change the melody's notes or rhythm, or the harmony's roots.
Give every verse its own accompaniment: no two passes alike.

## LilyPond rules (the file is compiled and played by machine)

- \`\\version "2.24.0"\` and \`\\language "english"\`; the key as \`${lyKey}\` (with the backslash before the mode).
- One \`\\score\` with a \`\\new PianoStaff << \\new Staff = "upper" { … } \\new Staff = "lower" { … } >>\`, and both a
  \`\\layout { }\` and a \`\\midi { }\` block.
- \`\\tempo 4 = ${h.bpm}\` at the start and steady through every pass; the coda may broaden with explicit \`\\tempo\`
  changes (the MIDI has no rit.).
- Dynamics and hairpins on the upper staff only, with a \`\\new Dynamics\` context if you like; they drive the MIDI
  velocities.
- **No sustain pedal marks.** Write sustained sound out as note lengths and ties, so the notes themselves carry
  the resonance.
- \`\\time ${h.beatsPerBar}/4\` once. **No \`\\partial\` anywhere**: the piece starts on a downbeat and every bar is
  complete (an upbeat is the end of a full bar, as above).
- No repeats (write each pass out), no grace notes, no tuplets, no \`\\ottava\`, and no text that could fail to
  parse.
- Range A0 to C8. At most ten notes sounding at once, and hands a pianist could play.
- \`\\header\` with \`title = "${h.title}"\`, \`subtitle = "for solo piano"\`, \`poet = "Words: ${h.textAuthor}"\`,
  \`composer = "Tune: ${h.tune} (${h.composer})"\`, \`arranger = "Arrangement: ai-jam-sessions"\`,
  \`copyright = "CC0 1.0"\`, and \`tagline = ##f\`.

Output only the LilyPond file.
`;
}

const SYSTEM = `You are a skilled concert arranger and a meticulous LilyPond engraver. You write complete, compilable LilyPond
source for solo grand piano. You follow the given public-domain source exactly for melody and harmony, and you
never borrow from any arrangement published after 1930, because those are still in copyright. You output only
the LilyPond file, with no commentary before or after it.`;

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const briefText = brief(hymn);
const briefPath = join(dir, "BRIEF.md");
const metaPath = join(dir, "meta.json");
const answerPath = join(dir, "answer.ly");
const lyPath = join(dir, `${arrangementId}.ly`);

// ─── the request ─────────────────────────────────────────────────────────────

async function ask(): Promise<void> {
  const models = (await (await fetch("https://openrouter.ai/api/v1/models")).json()) as { data: { id: string; pricing: { prompt: string; completion: string } }[] };
  const m = models.data.find((x) => x.id === model);
  if (!m) throw new Error(`${model} is not on OpenRouter`);
  const inUsd = Number(m.pricing.prompt) * 1e6;
  const outUsd = Number(m.pricing.completion) * 1e6;
  const promptTokens = Math.ceil((SYSTEM.length + briefText.length) / 3);
  const worst = (promptTokens * inUsd + maxTokens * outUsd) / 1e6;
  console.log(`${model}: $${inUsd}/M in, $${outUsd}/M out; worst case $${worst.toFixed(2)} (${maxTokens} output tokens). Amazing Grace cost $0.30.`);
  if (!spend) {
    console.log(`brief written to ${briefPath}; nothing sent (pass --yes to spend)`);
    return;
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "ai-jam-sessions arrangement" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: briefText }], temperature: 0,
      max_tokens: maxTokens, reasoning: { effort: "high" }, stream: true, usage: { include: true } }),
  });
  if (!res.ok || !res.body) throw new Error(`OpenRouter answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  let answer = "", reasoning = 0, usage: unknown = null, genId: string | null = null, provider: string | null = null, finish: string | null = null, buf = "", last = Date.now();
  const decoder = new TextDecoder();
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      const ev = JSON.parse(data);
      if (ev.error) throw new Error(`OpenRouter: ${JSON.stringify(ev.error).slice(0, 300)}`);
      genId = ev.id ?? genId;
      provider = ev.provider ?? provider;
      for (const ch of ev.choices ?? []) {
        answer += ch.delta?.content ?? "";
        reasoning += (ch.delta?.reasoning ?? "").length;
        finish = ch.finish_reason ?? finish;
      }
      if (ev.usage) usage = ev.usage;
    }
    if (Date.now() - last > 60_000) {
      console.log(`${Math.round((Date.now() - t0) / 1000)}s: thinking ${reasoning} chars, answer ${answer.length} chars`);
      last = Date.now();
    }
  }
  answer = answer.trim().replace(/^```[a-z]*\n/, "").replace(/\n```$/, "") + "\n";
  writeFileSync(answerPath, answer);
  writeFileSync(lyPath, answer);
  const meta = {
    schema: "ai-jam-sessions/arrangement-request/v1", arrangement_id: arrangementId, hymn: hymn!.id, model_requested: model, provider,
    generation_id: genId, temperature: 0, reasoning_effort: "high", max_tokens: maxTokens,
    system_sha256: sha(SYSTEM), brief_sha256: sha(briefText), answer_sha256: sha(answer), usage, finish_reason: finish,
    reasoning_chars: reasoning, wall_s: Math.round((Date.now() - t0) / 100) / 10, started: new Date(t0).toISOString(), fixes: [] as string[],
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
  console.log(`answer ${answer.length} chars, cost $${(usage as { cost?: number } | null)?.cost ?? "?"}, ${meta.wall_s}s -> ${answerPath}`);
}

// ─── compile, import, check ──────────────────────────────────────────────────

/** Where each verse's upbeat is: the first place after the previous verse where every note of the verse's melody
 * starts on a piano note of its pitch class. */
export function findUpbeats(h: Hymn, notes: { tick: number; midi: number }[], ppq: number): number[] {
  const at = new Map<number, Set<number>>();
  for (const n of notes) (at.get(n.tick) ?? at.set(n.tick, new Set()).get(n.tick)!).add(((n.midi % 12) + 12) % 12);
  const out: number[] = [];
  let from = 0;
  h.verses.forEach((_, v) => {
    const ev = parseMelody(verseSection(h, v).melody, h.beatsPerBar);
    const first = ev.findIndex((e) => e.midi !== null);
    const rel: { t: number; pc: number }[] = [];
    let t = 0;
    for (const e of ev.slice(first)) {
      if (e.midi !== null && !e.held) rel.push({ t: Math.round(t * ppq), pc: e.midi % 12 });
      t += e.beats;
    }
    const span = Math.round(t * ppq);
    const starts = [...at.keys()].filter((k) => k >= from).sort((a, b) => a - b);
    const hit = starts.find((s) => rel.every((r) => at.get(s + r.t)?.has(r.pc)));
    if (hit === undefined) throw new Error(`verse ${v + 1}: the melody is not in the piano after tick ${from}`);
    out.push(hit);
    from = hit + span;
  });
  return out;
}

function compileAndImport(): void {
  if (!existsSync(lyPath)) throw new Error(`no ${lyPath}: run with --yes first`);
  const outBase = join("tmp", "arrangements", arrangementId);
  mkdirSync(join("tmp", "arrangements"), { recursive: true });
  const lp = spawnSync(lilypond, ["--loglevel=WARNING", "-o", outBase, lyPath], { encoding: "utf8" });
  if (lp.status !== 0 || /error|warning/i.test(lp.stderr)) {
    console.error(lp.stderr.trim());
    console.error(`${lyPath} did not compile cleanly: fix it by hand, add the change to ${metaPath} "fixes", and rerun with --compile`);
    process.exit(1);
  }
  const midi = `${outBase}.mid`;
  const out = join("src", "vocal", "arrangements", `${arrangementId}.json`);
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
  const credit = `${model} on OpenRouter, for ai-jam-sessions (brief ${dir}/BRIEF.md)`;
  const base = ["--midi", midi, "--out", out, "--id", arrangementId, "--licence", "CC0-1.0", "--credit", credit,
    "--source-url", `${dir.replace(/\\/g, "/")}/${arrangementId}.ly`, "--source-commit", "this-repo", "--beats-per-bar", String(hymn!.beatsPerBar)];
  execFileSync("npx", ["tsx", "scripts/import-arrangement.ts", ...base], { stdio: "inherit", shell: true });
  const a = JSON.parse(readFileSync(out, "utf8"));
  const upbeats = findUpbeats(hymn!, a.notes, a.ppq);
  execFileSync("npx", ["tsx", "scripts/import-arrangement.ts", ...base, "--pickups", upbeats.join(",")], { stdio: "inherit", shell: true });
  meta.ly_sha256 = sha(readFileSync(lyPath));
  meta.verse_upbeats = upbeats;
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
  console.log(`verse upbeats at ticks ${upbeats.join(", ")}. Set "arrangement: \\"${arrangementId}\\"" on the hymn, then build its score clock.`);
}

writeFileSync(briefPath, briefText);
writeFileSync(join(dir, "SYSTEM.md"), SYSTEM + "\n");
if (compileOnly) compileAndImport();
else ask().then(() => { if (spend) compileAndImport(); }).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
