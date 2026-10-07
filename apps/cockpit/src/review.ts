// ─── Review mode — the listening review, in the cockpit ──────────────────────
//
// Fourth header mode. A person plays a sung mix and presses M wherever something
// sounds wrong. Before marking, they say who they are, what they are listening
// on, and set a comfortable volume against a level check; every mark carries
// that session. Every source plays at one loudness (TARGET_LUFS), so the volume
// they set for the check is the volume they review at. The logic lives in
// src/vocal/listening-review.ts; this file is the page around it.
//
// Input: a folder written by `python scripts/review_marks.py page` (review.json
// plus the FLAC files it names). Output: the JSON `review_marks.py report` reads.

import {
  CATEGORY_LABELS,
  DEVICE_LABELS,
  TARGET_LUFS,
  addMark,
  exportMarks,
  integratedLoudness,
  isDevice,
  isLevel,
  markContext,
  newMark,
  nudgeMark,
  parseBundle,
  peakOf,
  playbackGain,
  removeMark,
  sessionBlocker,
  startSession,
  syllableAt,
  toggleCategory,
  updateMark,
  type Device,
  type ReviewBundle,
  type ReviewEntry,
  type ReviewMark,
  type ReviewSession,
  type Reviewer,
} from "../../../src/vocal/listening-review.js";

export interface ReviewHost {
  ensureAudio(): Promise<AudioContext>;
}

type Source = "mix" | "vocal";

interface Stored {
  marks: Record<string, ReviewMark[]>;
  reviewer: Reviewer;
  device: Device | null;
  sessions: ReviewSession[];
}

const STORE_KEY = "cockpit-review:v1";
const ZOOM_S = 6;   // seconds shown around the playhead
const LEAD_S = 2;   // of which before it

const $ = (id: string) => document.getElementById(id)!;

let host: ReviewHost;
let bundle: ReviewBundle | null = null;
let files = new Map<string, Blob>();
let entry: ReviewEntry | null = null;
let store: Stored = loadStore();
let session: ReviewSession | null = null;
let levelSetAt: string | null = null;
let src: Source = "mix";
let rate = 1;
let active: string | null = null;
let pausedByMark = false;
let stopAt: number | null = null;
let overBase: ImageData | null = null;
let raf = 0;
let levelNode: AudioBufferSourceNode | null = null;
let levelPlayed = false;   // the volume can be confirmed only against the check itself

const audio: Record<Source, HTMLAudioElement> = { mix: new Audio(), vocal: new Audio() };
const gains: Partial<Record<Source, GainNode>> = {};
const urls: string[] = [];

function loadStore(): Stored {
  const empty: Stored = { marks: {}, reviewer: { name: "", level: "listener" }, device: null, sessions: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return empty;
    return {
      marks: raw.marks && typeof raw.marks === "object" ? raw.marks : {},
      reviewer: { name: String(raw.reviewer?.name ?? ""), level: isLevel(raw.reviewer?.level) ? raw.reviewer.level : "listener" },
      device: isDevice(raw.device) ? raw.device : null,
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    };
  } catch {
    return empty;
  }
}

function save(): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* private window: marks live for this page only */ }
}

const marks = (): ReviewMark[] => (entry ? store.marks[entry.key] ?? [] : []);
function setMarks(ms: ReviewMark[]): void {
  if (!entry) return;
  store.marks[entry.key] = ms;
  save();
}

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, "0")}`;
};
const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const takeHue = (t: string) => (parseInt(t.replace(/\D/g, "") || "0", 10) * 137.5) % 360;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function status(text: string, kind: "empty" | "loading" | "failed" | "ok" = "empty"): void {
  const el = $("review-status");
  el.textContent = text;
  el.className = `panel-banner ${kind}`;
  el.hidden = !text;
}

// ─── Loading a review folder ─────────────────────────────────────────────────

async function openFolder(list: FileList | null): Promise<void> {
  if (!list || !list.length) return;
  const all = [...list];
  const json = all
    .filter((f) => f.name === "review.json")
    .sort((a, b) => a.webkitRelativePath.split("/").length - b.webkitRelativePath.split("/").length)[0];
  if (!json) {
    status("That folder has no review.json. Build one with: python scripts/review_marks.py page --run <run> --variant <pick> --out <folder>", "failed");
    return;
  }
  const byName = new Map<string, Blob>(all.map((f) => [f.name, f]));
  await openBundle(await json.text(), async (name) => byName.get(name) ?? null);
}

/** The same folder served over HTTP, e.g. by the cockpit's dev server:
 * ?review=/@fs/<absolute path to the folder>/ opens it on load. */
export async function openUrl(base: string): Promise<void> {
  const root = base.endsWith("/") ? base : base + "/";
  status(`Loading ${root}review.json…`, "loading");
  try {
    const res = await fetch(root + "review.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await openBundle(await res.text(), async (name) => {
      const r = await fetch(root + encodeURIComponent(name));
      return r.ok ? r.blob() : null;
    });
  } catch (err) {
    status(`Could not load ${root}review.json: ${err instanceof Error ? err.message : String(err)}`, "failed");
  }
}

async function openBundle(text: string, getFile: (name: string) => Promise<Blob | null>): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    status("review.json is not valid JSON.", "failed");
    return;
  }
  const r = parseBundle(raw);
  if (!r.ok) {
    status(`${r.message} ${r.hint}`, "failed");
    return;
  }
  const names = [...new Set(r.value.entries.flatMap((e) => [e.files.mix, e.files.vocal]))];
  status(`Loading ${names.length} audio files…`, "loading");
  const got = await Promise.all(names.map(async (n) => [n, await getFile(n)] as const));
  const missing = got.filter(([, b]) => !b).map(([n]) => n);
  if (missing.length) {
    status(`The folder is missing ${missing.length} audio file(s) review.json names, e.g. ${missing[0]}.`, "failed");
    return;
  }
  bundle = r.value;
  files = new Map(got as [string, Blob][]);
  fillEntries();
  await loadEntry(0);
}

function fillEntries(): void {
  const sel = $("review-entry") as HTMLSelectElement;
  sel.innerHTML = "";
  bundle?.entries.forEach((e, i) => {
    const o = document.createElement("option");
    const n = (store.marks[e.key] ?? []).length;
    o.value = String(i);
    o.textContent = `${e.song} · ${e.variant}${n ? ` · ${n} marks` : ""}`;
    sel.appendChild(o);
  });
  const at = entry && bundle ? bundle.entries.indexOf(entry) : 0;
  sel.value = String(Math.max(0, at));
  sel.disabled = !bundle;
}

async function loadEntry(i: number): Promise<void> {
  if (!bundle) return;
  stop();
  entry = bundle.entries[i];
  active = null;
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  status(`Measuring loudness of ${entry.song} · ${entry.variant}…`, "loading");
  try {
    const ctx = await host.ensureAudio();
    for (const s of ["mix", "vocal"] as Source[]) {
      const file = files.get(entry.files[s])!;
      const url = URL.createObjectURL(file);
      urls.push(url);
      const el = audio[s];
      el.preload = "auto";
      el.src = url;
      el.load();
      el.preservesPitch = true;
      el.playbackRate = rate;
      if (!gains[s]) {
        const g = ctx.createGain();
        ctx.createMediaElementSource(el).connect(g).connect(ctx.destination);
        gains[s] = g;
      }
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      const ch = Array.from({ length: buf.numberOfChannels }, (_, k) => buf.getChannelData(k));
      const pg = playbackGain(integratedLoudness(ch, buf.sampleRate), peakOf(ch));
      gains[s]!.gain.value = pg.gain;
      if (s === "mix") {
        $("review-loudness").textContent = pg.capped
          ? `Plays at ${pg.playedLufs.toFixed(1)} LUFS (held under the peak ceiling; target ${TARGET_LUFS}).`
          : `Plays at ${TARGET_LUFS} LUFS.`;
      }
    }
    status("");
  } catch (err) {
    status(`Could not load this mix: ${err instanceof Error ? err.message : String(err)}`, "failed");
  }
  drawOver();
  renderMarks();
  tick();
}

// ─── Playback ────────────────────────────────────────────────────────────────

const el = () => audio[src];
const now = () => el().currentTime;

function stop(): void {
  audio.mix.pause();
  audio.vocal.pause();
  stopAt = null;
}

/** The context may have been made before any gesture (a ?review= load); resume it
 * from the click or key that wants sound, or the media elements play into silence. */
async function audible(): Promise<AudioContext> {
  const ctx = await host.ensureAudio();
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}

async function toggle(): Promise<void> {
  if (!entry) return;
  await audible();
  if (el().paused) {
    pausedByMark = false;
    await el().play();
  } else el().pause();
}

function seek(t: number): void {
  if (!entry) return;
  el().currentTime = Math.max(0, Math.min(entry.duration, t));
  tick();
}

/** Mix and vocal share one timeline: switching keeps the position and the play state. */
function setSource(s: Source): void {
  if (s === src) return;
  const from = el();
  const playing = !from.paused;
  const t = from.currentTime;
  from.pause();
  src = s;
  el().currentTime = t;
  el().playbackRate = rate;
  if (playing) void el().play();
  document.querySelectorAll<HTMLButtonElement>("[data-review-src]").forEach((b) => b.classList.toggle("active", b.dataset.reviewSrc === s));
}

function setRate(r: number): void {
  rate = r;
  audio.mix.playbackRate = r;
  audio.vocal.playbackRate = r;
  document.querySelectorAll<HTMLButtonElement>("[data-review-rate]").forEach((b) => b.classList.toggle("active", Number(b.dataset.reviewRate) === r));
}

function replay(m: ReviewMark | undefined): void {
  if (!m) return;
  active = m.id;
  seek(m.t - 2);
  pausedByMark = false;
  void audible().then(() => el().play());
  stopAt = m.t + 0.6;
  renderMarks();
}

// ─── Session setup ───────────────────────────────────────────────────────────

/** Pink noise (Paul Kellet's filter) at TARGET_LUFS: the loudness every mix plays at. */
async function playLevelCheck(): Promise<void> {
  const ctx = await audible();
  levelNode?.stop();
  const n = Math.round(ctx.sampleRate * 4);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    ch[0][i] = v;
    ch[1][i] = v;
  }
  const fade = Math.round(ctx.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) for (const c of ch) { c[i] *= i / fade; c[n - 1 - i] *= i / fade; }
  const g = 10 ** ((TARGET_LUFS - integratedLoudness(ch, ctx.sampleRate)) / 20);
  for (const c of ch) for (let i = 0; i < n; i++) c[i] *= g;
  stop();
  levelNode = ctx.createBufferSource();
  levelNode.buffer = buf;
  levelNode.connect(ctx.destination);
  levelNode.start();
  levelPlayed = true;
  renderSession();
  $("review-level-note").textContent = "Set your computer's volume so this is comfortable, then confirm. Leave the volume there while you review.";
}

function confirmLevel(): void {
  if (!levelPlayed) return;
  levelSetAt = new Date().toISOString();
  levelNode?.stop();
  levelNode = null;
  renderSession();
}

function readReviewer(): void {
  const level = ($("review-level") as HTMLSelectElement).value;
  store.reviewer = { name: ($("review-who") as HTMLInputElement).value, level: isLevel(level) ? level : "listener" };
  const dev = ($("review-device") as HTMLSelectElement).value;
  store.device = isDevice(dev) ? dev : null;
  save();
  renderSession();
}

function beginSession(): void {
  const block = sessionBlocker(store.reviewer, store.device, levelSetAt);
  if (block) {
    status(block, "failed");
    return;
  }
  session = startSession(store.reviewer, store.device!, levelSetAt!, new Date(), newId());
  store.sessions.push(session);
  save();
  status("");
  renderSession();
}

function renderSession(): void {
  const block = sessionBlocker(store.reviewer, store.device, levelSetAt);
  ($("review-start") as HTMLButtonElement).disabled = !!block || !!session;
  ($("review-level-ok") as HTMLButtonElement).disabled = !levelPlayed;
  $("review-level-state").textContent = levelSetAt ? `Volume set ${new Date(levelSetAt).toLocaleTimeString()}.` : "Not set yet.";
  $("review-session").textContent = session
    ? `Session started ${new Date(session.startedAt).toLocaleTimeString()} · ${DEVICE_LABELS[session.conditions.device]} · ${session.reviewer.level}`
    : block ?? "Ready to start.";
}

// ─── Marks ───────────────────────────────────────────────────────────────────

function mark(): void {
  if (!entry) return;
  if (!session) {
    status(sessionBlocker(store.reviewer, store.device, levelSetAt) ?? "Start a session first: marks record the conditions they were made under.", "failed");
    return;
  }
  const m = newMark(now(), session.reviewer, session.id, new Date(), newId());
  setMarks(addMark(marks(), m));
  active = m.id;
  const pause = ($("review-pause") as HTMLInputElement).checked;
  if (pause && !el().paused) {
    el().pause();
    pausedByMark = true;
  }
  renderMarks();
  fillEntries();
  drawOver();
  if (pause) document.querySelector<HTMLTextAreaElement>(`.review-card[data-id="${m.id}"] textarea`)?.focus();
}

function renderMarks(): void {
  const list = $("review-marks");
  list.innerHTML = "";
  const ms = marks();
  $("review-count").textContent = ms.length ? `${ms.length} in this mix` : "";
  if (!entry || !bundle) return;
  if (!ms.length) {
    list.innerHTML = '<p class="panel-note">No marks yet.</p>';
    return;
  }
  const e = entry;
  const b = bundle;
  ms.forEach((m, i) => {
    const card = document.createElement("div");
    card.className = "review-card" + (m.id === active ? " active" : "");
    card.dataset.id = m.id;
    const top = document.createElement("div");
    top.className = "review-card-top";
    top.innerHTML = `<b class="review-num">#${i + 1}</b><b>${fmt(m.t)}</b>`;
    const ctx = document.createElement("span");
    ctx.className = "panel-note";
    ctx.textContent = markContext(e, m.t, b.before, b.after);
    top.appendChild(ctx);
    card.appendChild(top);
    const chips = document.createElement("div");
    chips.className = "review-chips";
    for (const c of b.categories) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "panel-chip" + (m.cats.includes(c) ? " on" : "");
      chip.textContent = CATEGORY_LABELS[c] ?? c;
      chip.setAttribute("aria-pressed", String(m.cats.includes(c)));
      chip.onclick = () => { setMarks(toggleCategory(marks(), m.id, c)); active = m.id; renderMarks(); };
      chips.appendChild(chip);
    }
    card.appendChild(chips);
    const ta = document.createElement("textarea");
    ta.rows = 1;
    ta.placeholder = "What did you hear? (Enter to keep listening)";
    ta.value = m.note;
    ta.oninput = () => setMarks(updateMark(marks(), m.id, (x) => ({ ...x, note: ta.value })));
    ta.onkeydown = (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        ta.blur();
        if (pausedByMark) { pausedByMark = false; void el().play(); }
      } else if (ev.key === "Escape") ta.blur();
    };
    card.appendChild(ta);
    const btns = document.createElement("div");
    btns.className = "panel-transport";
    const acts: [string, () => void][] = [
      ["▶ Replay", () => replay(m)],
      ["−0.1 s", () => { setMarks(nudgeMark(marks(), m.id, -0.1, e.duration)); renderMarks(); drawOver(); }],
      ["+0.1 s", () => { setMarks(nudgeMark(marks(), m.id, 0.1, e.duration)); renderMarks(); drawOver(); }],
      ["Delete", () => { setMarks(removeMark(marks(), m.id)); if (active === m.id) active = null; renderMarks(); fillEntries(); drawOver(); }],
    ];
    for (const [label, fn] of acts) {
      const bt = document.createElement("button");
      bt.type = "button";
      bt.textContent = label;
      bt.onclick = fn;
      btns.appendChild(bt);
    }
    card.appendChild(btns);
    list.appendChild(card);
  });
}

function exportAll(): void {
  if (!bundle) return;
  const out = exportMarks(bundle, store.marks, store.reviewer, store.sessions, new Date());
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
  a.download = "review-marks.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

function drawOver(): void {
  const cv = $("review-over") as HTMLCanvasElement;
  const g = cv.getContext("2d")!;
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  overBase = null;
  if (!entry) return;
  const D = entry.duration;
  const x = (t: number) => (t / D) * W;
  entry.phrases.forEach((p, i) => {
    if (i % 2) { g.fillStyle = css("--surface2"); g.fillRect(x(p.start), 0, x(p.end) - x(p.start), H); }
  });
  g.fillStyle = css("--text-muted");
  const n = entry.peaks.length;
  const mid = (H - 14) / 2;
  entry.peaks.forEach((v, i) => {
    const h = Math.max(1, v * (H - 18));
    g.fillRect((i / n) * W, mid - h / 2, Math.max(1, W / n), h);
  });
  g.fillStyle = css("--accent");
  entry.joins.filter((j) => j.switch).forEach((j) => g.fillRect(x(j.t) - 1, H - 10, 2, 8));
  marks().forEach((m, i) => {
    g.fillStyle = css("--danger");
    g.fillRect(x(m.t) - 1, 0, 2, H - 12);
    g.font = "bold 11px system-ui";
    g.fillText(String(i + 1), x(m.t) + 3, 11);
  });
  overBase = g.getImageData(0, 0, W, H);
}

function drawZoom(t: number): void {
  const cv = $("review-zoom") as HTMLCanvasElement;
  const g = cv.getContext("2d")!;
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  if (!entry || !bundle) return;
  const a = t - LEAD_S, b = a + ZOOM_S;
  const x = (s: number) => ((s - a) / ZOOM_S) * W;
  const ms = marks();
  ms.forEach((m) => {
    g.fillStyle = css("--danger-dim");
    g.fillRect(x(m.t - bundle!.before), 0, x(m.t + bundle!.after) - x(m.t - bundle!.before), H);
  });
  g.textBaseline = "middle";
  for (const s of entry.syllables) {
    if (s.end < a || s.start > b) continue;
    g.fillStyle = `hsla(${takeHue(s.take)},65%,55%,.35)`;
    g.fillRect(x(s.start), 34, x(s.end) - x(s.start), 70);
    g.fillStyle = css("--text");
    g.font = "13px system-ui";
    g.fillText(s.lyric, x(s.start) + 3, 56);
    g.fillStyle = css("--text-muted");
    g.font = "11px system-ui";
    g.fillText(s.take.replace("take-", "t"), x(s.start) + 3, 88);
  }
  for (const j of entry.joins) {
    if (j.t < a || j.t > b) continue;
    g.strokeStyle = css("--accent");
    g.lineWidth = j.switch ? 2 : 1;
    g.setLineDash(j.switch ? [] : [4, 3]);
    g.beginPath(); g.moveTo(x(j.t), 28); g.lineTo(x(j.t), 110); g.stroke();
    g.setLineDash([]);
  }
  ms.forEach((m, i) => {
    if (m.t < a || m.t > b) return;
    g.strokeStyle = css("--danger");
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(x(m.t), 0); g.lineTo(x(m.t), H); g.stroke();
    g.fillStyle = css("--danger");
    g.font = "bold 12px system-ui";
    g.fillText(`#${i + 1}`, x(m.t) + 4, 12);
  });
  g.fillStyle = css("--text-muted");
  g.font = "11px system-ui";
  for (let s = Math.ceil(a); s <= b; s++) {
    g.fillRect(x(s), H - 8, 1, 8);
    g.fillText(fmt(s).replace(/\.0$/, ""), x(s) + 3, H - 18);
  }
  g.strokeStyle = css("--good");
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(x(t), 0); g.lineTo(x(t), H); g.stroke();
  g.lineWidth = 1;
}

function tick(): void {
  const t = now();
  if (stopAt !== null && t >= stopAt) { el().pause(); stopAt = null; }
  const cv = $("review-over") as HTMLCanvasElement;
  if (overBase && entry) {
    const g = cv.getContext("2d")!;
    g.putImageData(overBase, 0, 0);
    g.fillStyle = css("--good");
    g.fillRect((t / entry.duration) * cv.width - 1, 0, 2, cv.height);
  }
  drawZoom(t);
  const s = entry ? syllableAt(entry, t) : undefined;
  $("review-now").textContent = s ? `${s.word}  ·  ${s.take}` : "";
  $("review-clock").textContent = entry ? `${fmt(t)} / ${fmt(entry.duration)}` : "";
  $("review-play").textContent = el().paused ? "▶ Play" : "⏸ Pause";
}

function loop(): void {
  if (!el().paused) tick();
  raf = requestAnimationFrame(loop);
}

// ─── Wiring ──────────────────────────────────────────────────────────────────

export function bindReview(h: ReviewHost): void {
  host = h;
  const folder = $("review-folder") as HTMLInputElement;
  $("review-open").addEventListener("click", () => folder.click());
  folder.addEventListener("change", () => { void openFolder(folder.files); });
  $("review-entry").addEventListener("change", (e) => { void loadEntry(Number((e.target as HTMLSelectElement).value)); });
  const level = $("review-level") as HTMLSelectElement;
  for (const [k, label] of Object.entries({ listener: "Listener (no music training)", musician: "Musician", professional: "Vocal or audio professional" })) {
    level.add(new Option(label, k));
  }
  const device = $("review-device") as HTMLSelectElement;
  device.add(new Option("Choose…", ""));
  for (const [k, label] of Object.entries(DEVICE_LABELS)) device.add(new Option(label, k));
  ($("review-who") as HTMLInputElement).value = store.reviewer.name;
  level.value = store.reviewer.level;
  device.value = store.device ?? "";
  $("review-who").addEventListener("input", readReviewer);
  level.addEventListener("change", readReviewer);
  device.addEventListener("change", readReviewer);
  $("review-level-check").addEventListener("click", () => { void playLevelCheck(); });
  $("review-level-ok").addEventListener("click", confirmLevel);
  $("review-start").addEventListener("click", beginSession);
  $("review-export").addEventListener("click", exportAll);
  $("review-play").addEventListener("click", () => { void toggle(); });
  $("review-back").addEventListener("click", () => seek(now() - 5));
  $("review-fwd").addEventListener("click", () => seek(now() + 5));
  $("review-mark").addEventListener("click", mark);
  document.querySelectorAll<HTMLButtonElement>("[data-review-src]").forEach((b) => b.addEventListener("click", () => setSource(b.dataset.reviewSrc as Source)));
  document.querySelectorAll<HTMLButtonElement>("[data-review-rate]").forEach((b) => b.addEventListener("click", () => setRate(Number(b.dataset.reviewRate))));
  for (const cv of ["review-over", "review-zoom"]) {
    $(cv).addEventListener("click", (e) => {
      if (!entry) return;
      const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const f = ((e as MouseEvent).clientX - r.left) / r.width;
      seek(cv === "review-over" ? f * entry.duration : now() - LEAD_S + f * ZOOM_S);
    });
  }
  for (const s of ["mix", "vocal"] as Source[]) {
    audio[s].addEventListener("pause", tick);
    audio[s].addEventListener("play", tick);
    audio[s].addEventListener("seeked", tick);
  }
  renderSession();
  // What a test (or a curious console) can read; it changes nothing.
  (window as unknown as { __review: unknown }).__review = {
    state: () => ({ t: now(), ready: el().readyState, src, marks: marks().length, session: session?.id ?? null, entry: entry?.key ?? null }),
  };
}

export function enterReviewMode(): void {
  document.body.classList.add("review-mode");
  $("mode-review").classList.add("active");
  $("mode-review").setAttribute("aria-pressed", "true");
  for (const id of ["mode-instrument", "mode-vocal", "mode-panel"]) {
    $(id).classList.remove("active");
    $(id).setAttribute("aria-pressed", "false");
  }
  if (!bundle) status("Open a review folder to begin. Build one with: python scripts/review_marks.py page --run <run> --variant <pick> --out <folder>", "empty");
  renderSession();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

export function leaveReviewMode(): void {
  document.body.classList.remove("review-mode");
  $("mode-review").classList.remove("active");
  $("mode-review").setAttribute("aria-pressed", "false");
  stop();
  levelNode?.stop();
  levelNode = null;
  cancelAnimationFrame(raf);
}

/** @returns true when the event was handled (caller should preventDefault). */
export function handleReviewKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (k === " ") { void toggle(); return true; }
  if (k === "m") { mark(); return true; }
  if (k === "v") { setSource(src === "mix" ? "vocal" : "mix"); return true; }
  if (k === "r") { const ms = marks(); replay(ms.find((m) => m.id === active) ?? ms[ms.length - 1]); return true; }
  if (k === "arrowleft" || k === "arrowright") { seek(now() + (k === "arrowright" ? 1 : -1) * (e.shiftKey ? 5 : 2)); return true; }
  return false;
}
