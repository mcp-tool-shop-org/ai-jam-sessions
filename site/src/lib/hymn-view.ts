// The three.js view of the sung hymns, loaded when the section comes near the viewport.
// One timeline per hymn: the sung line from its score clock (the clock the voice was placed on)
// above the piano bed's notes from the same arrangement. Notes light as the recording reaches
// them, and the line being sung shows underneath with its current syllable marked.
import * as THREE from 'three';
import data from '../data/hymns.visual.json';

type Song = {
  id: string;
  title: string;
  duration: number;
  melody: number[][]; // [t, dur, midi, syllable]
  syllables: [number, string, string, number, number][]; // [t, text, word, end, position in word]
  lines: number[][]; // [t0, t1, from, to]
  piano: number[][]; // [t, dur, midi, velocity]
};

const SONGS = (data as unknown as { songs: Song[] }).songs;
const XS = 3; // scene units per second
const PS = 0.24; // per semitone
const GAP = 2.2; // between the voice lane and the piano lane
const BG = new THREE.Color('#09090b');
const VOICE = ['#ffc857', '#7cc4ff'].map((c) => new THREE.Color(c));
const PIANO = new THREE.Color('#9b8cff');

interface Built {
  group: THREE.Group;
  lanes: { mesh: THREE.InstancedMesh; xs: number[]; bright: THREE.Color; dim: THREE.Color; lit: number }[];
  width: number;
  height: number;
}

function build(song: Song, voice: THREE.Color): Built {
  const group = new THREE.Group();
  const vMin = Math.min(...song.melody.map((n) => n[2])) - 2;
  const vMax = Math.max(...song.melody.map((n) => n[2])) + 2;
  const pMin = Math.min(...song.piano.map((n) => n[2])) - 1;
  const pMax = Math.max(...song.piano.map((n) => n[2])) + 1;
  const pianoH = (pMax - pMin + 1) * PS * 0.6;
  const voiceH = (vMax - vMin + 1) * PS;
  const voiceY = pianoH + GAP;
  const height = voiceY + voiceH;
  const width = song.duration * XS;

  // A band per sung line, edge to edge (each runs to the next line's start), so verses and
  // phrases read at a glance; the piano's introduction gets its own shade.
  const starts = [0, ...song.lines.map((l) => l[0]), song.duration];
  starts.slice(0, -1).forEach((t0, i) => {
    const w = Math.max(0.5, (starts[i + 1] - t0) * XS);
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(w, height + 1.2),
      new THREE.MeshBasicMaterial({ color: i === 0 ? '#0c0c10' : i % 2 ? '#111118' : '#16161f' }),
    );
    band.position.set(t0 * XS + w / 2, height / 2, -0.05);
    group.add(band);
  });

  function lane(notes: number[][], y: (m: number) => number, h: number, bright: THREE.Color, depthOf: (n: number[]) => number) {
    const sorted = [...notes].sort((a, b) => a[0] - b[0]);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), sorted.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const xs = sorted.map((n, k) => {
      const x0 = n[0] * XS;
      const w = Math.max(0.08, n[1] * XS - 0.05);
      const d = depthOf(n);
      p.set(x0 + w / 2, y(n[2]), d / 2);
      s.set(w, h, d);
      mesh.setMatrixAt(k, m.compose(p, q, s));
      mesh.setColorAt(k, bright);
      return x0;
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return { mesh, xs, bright, dim: bright.clone().lerp(BG, 0.72), lit: sorted.length };
  }

  const lanes = [
    lane(song.melody, (mm) => voiceY + (mm - vMin) * PS, PS * 0.85, voice, () => 1.4),
    lane(song.piano, (mm) => (mm - pMin) * PS * 0.6, PS * 0.5, PIANO, (n) => 0.15 + (n[3] / 127) ** 2 * 0.9),
  ];
  return { group, lanes, width, height };
}

export function start(root: HTMLElement): void {
  const stage = root.querySelector<HTMLElement>('.hy-stage')!;
  const canvas = stage.querySelector('canvas')!;
  const lineEl = stage.querySelector<HTMLElement>('.hy-line')!;
  const titleEl = stage.querySelector<HTMLElement>('.hy-now')!;
  const modes = [...root.querySelectorAll<HTMLButtonElement>('.hy-modes button')];
  const picks = [...root.querySelectorAll<HTMLButtonElement>('.hy-picks button')];
  const audios = [...root.querySelectorAll<HTMLAudioElement>('audio')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    stage.classList.add('hy-nogl');
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = BG;
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(-30, 50, 80);
  scene.add(sun);

  const built = SONGS.map((s, i) => build(s, VOICE[i % VOICE.length]));
  // The playhead: a bright bar with a soft glow, wide enough to read from the camera's distance.
  const head = new THREE.Group();
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 1, 2.6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 })));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.05 }));
  glow.position.z = 0.02;
  head.add(glow);
  scene.add(head);

  const camera = new THREE.PerspectiveCamera(32, 2, 0.1, 10_000);
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const tilt = new THREE.Vector2();
  let mode: 'follow' | 'whole' = 'follow';
  let current = -1;
  let active: HTMLAudioElement | null = null;
  let first = true;
  let shownLine = -2;
  let shownSyl = -2;

  function select(i: number) {
    if (i === current) return;
    if (current >= 0) scene.remove(built[current].group);
    current = i;
    const b = built[i];
    scene.add(b.group);
    head.scale.y = b.height + 1.6;
    head.position.y = b.height / 2;
    picks.forEach((p, k) => p.setAttribute('aria-pressed', String(k === i)));
    titleEl.textContent = SONGS[i].title;
    shownLine = shownSyl = -2;
    first = true;
  }

  function time(): number {
    return active && active.dataset.song === SONGS[current].id ? active.currentTime : -1;
  }

  function goal(x: number, b: Built): [THREE.Vector3, THREE.Vector3] {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    if (mode === 'whole') {
      return [
        new THREE.Vector3(-b.width * 0.15 + tilt.x * 20, b.height * 1.4 + tilt.y * 12, b.width * 0.12),
        new THREE.Vector3(b.width * 0.3, b.height / 2, 0),
      ];
    }
    const d = (b.height * 1.35) / 2 / t;
    const half = (b.height * 1.35 * camera.aspect) / 2;
    const cx = Math.min(Math.max(x, half - 10), Math.max(half - 10, b.width - half - 10));
    return [new THREE.Vector3(cx - 8 + tilt.x * 6, b.height / 2 + 4 + tilt.y * 4, d), new THREE.Vector3(cx + 10, b.height / 2, 0)];
  }

  function light(b: Built, x: number) {
    for (const lane of b.lanes) {
      let n = lane.lit;
      while (n < lane.xs.length && lane.xs[n] <= x) n++;
      while (n > 0 && lane.xs[n - 1] > x) n--;
      if (n === lane.lit) continue;
      const [from, to, c] = n > lane.lit ? [lane.lit, n, lane.bright] : [n, lane.lit, lane.dim];
      for (let k = from; k < to; k++) lane.mesh.setColorAt(k, c);
      lane.mesh.instanceColor!.needsUpdate = true;
      lane.lit = n;
    }
  }

  // The sing-along line: the line being sung (or the next one), its syllables as spans.
  function lyric(t: number) {
    const s = SONGS[current];
    let li = s.lines.findIndex((l) => t < l[1] + 0.4);
    if (li < 0) li = s.lines.length - 1;
    if (t < 0) li = 0;
    const [, , from, to] = s.lines[li];
    let si = -1;
    for (let k = from; k <= to; k++) if (s.syllables[k][0] <= t) si = k;
    if (li === shownLine && si === shownSyl) return;
    if (li !== shownLine) {
      lineEl.replaceChildren(
        ...Array.from({ length: to - from + 1 }, (_, k) => {
          const syl = s.syllables[from + k];
          const next = s.syllables[from + k + 1];
          const span = document.createElement('span');
          span.textContent = syl[1] + (next && next[4] !== 0 && from + k < to ? '' : ' ');
          return span;
        }),
      );
    }
    [...lineEl.children].forEach((el, k) => {
      el.classList.toggle('hy-sung', from + k < si);
      el.classList.toggle('hy-on', from + k === si);
    });
    shownLine = li;
    shownSyl = si;
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let visible = true;
  function frame() {
    if (!visible) return;
    const b = built[current];
    const t = time();
    // Before anything plays, frame the first sung line rather than the piano's introduction.
    const x = (t < 0 ? SONGS[current].lines[0][0] : t) * XS;
    head.position.x = x;
    head.visible = t >= 0;
    light(b, t < 0 ? Infinity : x);
    lyric(t);
    const [p, l] = goal(x, b);
    const k = reduce || first ? 1 : 0.08;
    first = false;
    pos.lerp(p, k);
    look.lerp(l, k);
    camera.position.copy(pos);
    camera.lookAt(look);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  audios.forEach((a) =>
    a.addEventListener('play', () => {
      active = a;
      audios.forEach((o) => o !== a && o.pause());
      select(SONGS.findIndex((s) => s.id === a.dataset.song));
      setMode('follow');
    }),
  );
  picks.forEach((p, i) => p.addEventListener('click', () => select(i)));

  function setMode(m: 'follow' | 'whole') {
    mode = m;
    modes.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  }
  modes.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode as 'follow' | 'whole')));

  if (!reduce) {
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      tilt.set((e.clientX - r.left) / r.width - 0.5, 0.5 - (e.clientY - r.top) / r.height);
    });
    stage.addEventListener('pointerleave', () => tilt.set(0, 0));
  }

  // A recording started before this module loaded never sent us its play event.
  const playing = audios.find((a) => !a.paused);
  if (playing) active = playing;
  select(playing ? Math.max(0, SONGS.findIndex((s) => s.id === playing.dataset.song)) : 0);
  new ResizeObserver(resize).observe(stage);
  resize();
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) requestAnimationFrame(frame);
  }).observe(stage);
  requestAnimationFrame(frame);
}
