#!/usr/bin/env node
// ─── compensator-drill.mjs — prove the terminate path without renting ───────
//
// Lock §7 requires the dead-man and the babysitter ARMED before a pod launches.
// A compensator that has never run is not a compensator, so this exercises both
// end to end against a FAKE pod id, a FAKE ssh/scp pair and a MOCK RunPod API.
//
// Nothing here touches a real pod, a real API or a real dollar. The mock records
// every podTerminate it receives, so "did the compensator fire" is a fact in a
// receipt rather than a belief about a script.
//
//   node experiments/rollout-arc/p2/scripts/compensator-drill.mjs
//
// Scenarios:
//   A dead-man fires at the cap                  -> terminate recorded
//   B dead-man disarms on the cancel file        -> NO terminate
//   C babysitter happy path (ALL.DONE, verified) -> fetches, terminate, cancel, exit 0
//   D babysitter checksum mismatch               -> exit 4, NO terminate, pod left up
//   E babysitter liveness counts a busy GPU      -> does NOT stall while GPU > 10%
//   F babysitter stall (idle GPU, static log)    -> exit 2, NO terminate
//   G babysitter unreachable ssh                 -> exit 3, NO terminate
//   H dead-man fires MID-RUN under a live babysitter -> exactly one terminate,
//     babysitter exits 3 rather than claiming success, no cancel file, and a
//     half-fetched artifact is never reported as verified
//
// REQUIRES BASH. Five of the eight scenarios run babysit-p2.sh, so this must be
// invoked from a shell that resolves `bash` (Git Bash, WSL, or any Linux shell).
// It preflights that and refuses to run rather than reporting partial passes:
// a run from PowerShell without the preflight scores 9/17 with exit 127 on every
// babysitter scenario, which reads exactly like broken compensators.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../..");
const ROOT = join(REPO, "tmp", "p2-drill");
const BABYSIT = join(HERE, "babysit-p2.sh");
const DEADMAN = join(HERE, "deadman-p2.ps1");
const FAKE_POD = "fake-pod-000000000000";

const sh = (p) => p.replace(/\\/g, "/");

// ── the mock RunPod API ──────────────────────────────────────────────────────
const terminated = [];
const api = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const m = /podId:\s*\\?"([^"\\]+)\\?"/.exec(body);
    if (/podTerminate/.test(body)) terminated.push({ podId: m ? m[1] : null, at: new Date().toISOString() });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: { podTerminate: null } }));
  });
});
await new Promise((r) => api.listen(0, "127.0.0.1", r));
const API_URL = `http://127.0.0.1:${api.address().port}/graphql`;

// ── the fake pod ─────────────────────────────────────────────────────────────
rmSync(ROOT, { recursive: true, force: true });
const REMOTE = join(ROOT, "remote");
const REMOTE_ART = join(REMOTE, "artifacts");
const REMOTE_LOG = join(REMOTE, "run.log");
const STATE = join(ROOT, "state");
mkdirSync(REMOTE_ART, { recursive: true });
mkdirSync(STATE, { recursive: true });

const setGpu = (v) => writeFileSync(join(STATE, "gpu"), String(v));
const setLogSize = (n) => writeFileSync(REMOTE_LOG, "x".repeat(n));
const setSshDead = (dead) => writeFileSync(join(STATE, "ssh_dead"), dead ? "1" : "0");

// fake ssh: answers the babysitter's one state probe from files the drill owns.
writeFileSync(
  join(ROOT, "fake-ssh.sh"),
  `#!/usr/bin/env bash
if [ "$(cat ${sh(join(STATE, "ssh_dead"))} 2>/dev/null)" = "1" ]; then exit 255; fi
CMD="\${1:-}"
if [[ "$CMD" == *"===SIZE==="* ]]; then
  ls ${sh(REMOTE_ART)}/*.DONE 2>/dev/null | xargs -n1 basename 2>/dev/null
  echo '===SIZE==='
  stat -c %s ${sh(REMOTE_LOG)} 2>/dev/null || echo 0
  echo '===GPU==='
  cat ${sh(join(STATE, "gpu"))} 2>/dev/null || echo 0
else
  echo "fake tail: nothing to see"
fi
`,
);

// fake scp: last two args are "root@ip:/remote/path" and the local dest dir.
writeFileSync(
  join(ROOT, "fake-scp.sh"),
  `#!/usr/bin/env bash
DEST="\${@: -1}"
SRC="\${@: -2:1}"
SRC="\${SRC#*:}"
cp "$SRC" "$DEST" 2>/dev/null || exit 1
`,
);

const env = (extra = {}) => ({
  ...process.env,
  RUNPOD_API_URL: API_URL,
  RUNPOD_API_KEY: "drill-not-a-real-key",
  P2_SSH_CMD: `bash ${sh(join(ROOT, "fake-ssh.sh"))}`,
  P2_SCP_CMD: `bash ${sh(join(ROOT, "fake-scp.sh"))}`,
  P2_REMOTE_ART: sh(REMOTE_ART),
  P2_REMOTE_LOG: sh(REMOTE_LOG),
  P2_POLL_SECONDS: "1",
  P2_STALL_SECONDS: "4",
  P2_MAX_SSH_FAILS: "3",
  ...extra,
});

const run = (cmd, args, opts = {}) =>
  new Promise((res) => {
    const p = spawn(cmd, args, { env: opts.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (c) => (out += c));
    p.stderr.on("data", (c) => (out += c));
    const timer = opts.killAfter
      ? setTimeout(() => {
          p.kill("SIGKILL");
        }, opts.killAfter)
      : null;
    p.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      res({ code, signal, out });
    });
    if (opts.onStart) opts.onStart(p);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A missing bash produces exit 127 per scenario, which looks like a compensator
// failure and invites "fixing" something that is not broken. Fail loudly here.
{
  const probe = await new Promise((res) => {
    const c = spawn("bash", ["-c", "echo ok"], { stdio: ["ignore", "pipe", "pipe"] });
    c.on("error", () => res(null));
    let out = "";
    c.stdout?.on("data", (d) => (out += d));
    c.on("close", (code) => res(code === 0 ? out.trim() : null));
  });
  if (probe !== "ok") {
    console.error(
      "HALT: this drill needs bash, and it is not resolvable from this shell.\n" +
        "      Five of the eight scenarios run babysit-p2.sh. Without bash they exit 127,\n" +
        "      which scores 9/17 and reads like broken compensators rather than a wrong shell.\n" +
        "      Run it from Git Bash / WSL, or put bash on PATH, then re-run.",
    );
    api.close();
    process.exit(2);
  }
}
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const freshArt = (label) => {
  const dir = join(ROOT, "art", label);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
};
const clearRemote = () => {
  for (const f of readdirSync(REMOTE_ART)) rmSync(join(REMOTE_ART, f), { force: true });
};
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

// ── A: the dead-man fires ────────────────────────────────────────────────────
console.log("\nA. dead-man fires at the cap");
{
  const art = freshArt("deadmanA");
  const before = terminated.length;
  const r = await run(
    "powershell",
    ["-NoProfile", "-File", DEADMAN, "-PodId", FAKE_POD, "-CapSeconds", "2", "-Label", "drillA", "-ArtDir", art, "-ApiUrl", API_URL, "-TickSeconds", "1"],
    { env: env() },
  );
  const fired = terminated.slice(before);
  check("cap reached -> podTerminate posted", fired.length === 1 && fired[0].podId === FAKE_POD, `recorded ${JSON.stringify(fired)}`);
  check("dead-man exits 0 after terminating", r.code === 0, `exit ${r.code}`);
}

// ── B: the dead-man disarms ──────────────────────────────────────────────────
console.log("\nB. dead-man disarms on the cancel file");
{
  const art = freshArt("deadmanB");
  const before = terminated.length;
  const p = run(
    "powershell",
    ["-NoProfile", "-File", DEADMAN, "-PodId", FAKE_POD, "-CapSeconds", "20", "-Label", "drillB", "-ArtDir", art, "-ApiUrl", API_URL, "-TickSeconds", "1"],
    { env: env() },
  );
  await sleep(2500);
  writeFileSync(join(art, "DEADMAN_CANCEL_drillB"), "");
  const r = await p;
  check("cancel file -> NO podTerminate", terminated.length === before, `${terminated.length - before} recorded`);
  check("dead-man exits 0 when disarmed", r.code === 0, `exit ${r.code}`);
}

// ── C: babysitter happy path ─────────────────────────────────────────────────
console.log("\nC. babysitter: markers -> fetch -> verify -> terminate -> disarm");
{
  const art = freshArt("babysitC");
  clearRemote();
  setGpu(0);
  setLogSize(10);
  setSshDead(false);
  const before = terminated.length;

  const p = run("bash", [BABYSIT, "drillC", FAKE_POD, "1.2.3.4", "22", art], {
    env: env({ P2_CANCEL_DIR: sh(art) }),
  });

  await sleep(1500);
  writeFileSync(join(REMOTE_ART, "gpu.txt"), "L40S, 49140 MiB, 8.9\n");
  writeFileSync(join(REMOTE_ART, "pip-pins.txt"), "trl==1.13.0\n");
  writeFileSync(join(REMOTE_ART, "node-version.txt"), "v22.22.3\n");
  writeFileSync(join(REMOTE_ART, "bridge-health.json"), '{"ok":true}\n');
  writeFileSync(join(REMOTE_ART, "STAGE0.DONE"), "");
  await sleep(2000);
  writeFileSync(join(REMOTE_ART, "dry-run.json"), '{"stage":"dry","steps_timed":2}\n');
  writeFileSync(join(REMOTE_ART, "STAGE1.DONE"), "");
  await sleep(2000);
  writeFileSync(join(REMOTE_ART, "smoke-run.json"), '{"stage":"dry","mean_step_seconds":41.2}\n');
  writeFileSync(join(REMOTE_ART, "smoke.tar.gz"), "not really a tarball, but it hashes\n");
  writeFileSync(join(REMOTE_ART, "STAGE2.DONE"), "");
  await sleep(2000);

  const manifest = ["gpu.txt", "pip-pins.txt", "node-version.txt", "bridge-health.json", "dry-run.json", "smoke-run.json", "smoke.tar.gz"]
    .map((f) => `${sha(join(REMOTE_ART, f))} *${f}`)
    .join("\n");
  writeFileSync(join(REMOTE_ART, "artifacts.sha256"), manifest + "\n");
  writeFileSync(join(REMOTE_ART, "ALL.DONE"), "");

  const r = await p;
  const fired = terminated.slice(before);
  check("babysitter exits 0 on a verified fetch", r.code === 0, `exit ${r.code}`);
  check("every staged artifact was streamed off the pod", ["gpu.txt", "dry-run.json", "smoke-run.json", "smoke.tar.gz"].every((f) => existsSync(join(art, f))), readdirSync(art).join(", "));
  check("ALL.DONE -> podTerminate posted for the pod id", fired.length === 1 && fired[0].podId === FAKE_POD, JSON.stringify(fired));
  check("dead-man cancel file dropped", existsSync(join(art, "DEADMAN_CANCEL_drillC")), "");
}

// ── D: checksum mismatch leaves the pod up ───────────────────────────────────
console.log("\nD. babysitter: a checksum mismatch must NOT terminate");
{
  const art = freshArt("babysitD");
  clearRemote();
  setGpu(0);
  setLogSize(10);
  setSshDead(false);
  const before = terminated.length;

  const p = run("bash", [BABYSIT, "drillD", FAKE_POD, "1.2.3.4", "22", art], {
    env: env({ P2_CANCEL_DIR: sh(art) }),
  });
  await sleep(1500);
  writeFileSync(join(REMOTE_ART, "smoke-run.json"), '{"stage":"dry"}\n');
  writeFileSync(join(REMOTE_ART, "artifacts.sha256"), `${"0".repeat(64)} *smoke-run.json\n`);
  writeFileSync(join(REMOTE_ART, "STAGE2.DONE"), "");
  writeFileSync(join(REMOTE_ART, "ALL.DONE"), "");
  const r = await p;
  check("babysitter exits 4 on a mismatch", r.code === 4, `exit ${r.code}`);
  check("mismatch -> NO podTerminate (pod left for manual fetch)", terminated.length === before, `${terminated.length - before} recorded`);
  check("mismatch -> dead-man stays ARMED (no cancel file)", !existsSync(join(art, "DEADMAN_CANCEL_drillD")), "");
}

// ── E: liveness counts a busy GPU ────────────────────────────────────────────
console.log("\nE. babysitter: a busy GPU is progress, even with a silent log");
{
  const art = freshArt("babysitE");
  clearRemote();
  setGpu(97); // Python block-buffers stdout under nohup — the 2026-07-11 lesson
  setLogSize(10); // log never grows
  setSshDead(false);
  const before = terminated.length;
  const r = await run("bash", [BABYSIT, "drillE", FAKE_POD, "1.2.3.4", "22", art], {
    env: env({ P2_CANCEL_DIR: sh(art) }),
    killAfter: 9000, // well past the 4s stall window
  });
  check("busy GPU prevents a false stall", r.signal === "SIGKILL" || r.code === null, `exit ${r.code} signal ${r.signal}`);
  check("no terminate while merely waiting", terminated.length === before, "");
}

// ── F: a real stall ──────────────────────────────────────────────────────────
console.log("\nF. babysitter: idle GPU + static log = stall");
{
  const art = freshArt("babysitF");
  clearRemote();
  setGpu(0);
  setLogSize(10);
  setSshDead(false);
  const before = terminated.length;
  const r = await run("bash", [BABYSIT, "drillF", FAKE_POD, "1.2.3.4", "22", art], {
    env: env({ P2_CANCEL_DIR: sh(art) }),
  });
  check("babysitter exits 2 on a stall", r.code === 2, `exit ${r.code}`);
  check("stall -> NO podTerminate, dead-man still armed", terminated.length === before, "");
}

// ── G: unreachable ───────────────────────────────────────────────────────────
console.log("\nG. babysitter: ssh unreachable");
{
  const art = freshArt("babysitG");
  clearRemote();
  setSshDead(true);
  const before = terminated.length;
  const r = await run("bash", [BABYSIT, "drillG", FAKE_POD, "1.2.3.4", "22", art], {
    env: env({ P2_CANCEL_DIR: sh(art) }),
  });
  setSshDead(false);
  check("babysitter exits 3 when unreachable", r.code === 3, `exit ${r.code}`);
  check("unreachable -> NO podTerminate, dead-man still armed", terminated.length === before, "");
}

// ── H: the two compensators interacting ──────────────────────────────────────
// A-G exercise each compensator alone. The real question a short cap raises is
// what happens when the dead-man fires while the babysitter is still working.
console.log("\nH. dead-man fires mid-run, under a live babysitter");
{
  const art = freshArt("bothH");
  clearRemote();
  setGpu(97); // busy, so the babysitter is waiting rather than stalling
  setLogSize(10);
  setSshDead(false);
  const before = terminated.length;

  // A half-fetched artifact, as an interrupted scp would leave behind.
  writeFileSync(join(art, "smoke.tar.gz"), "truncated");

  writeFileSync(join(REMOTE_ART, "gpu.txt"), "L40S\n");
  writeFileSync(join(REMOTE_ART, "STAGE0.DONE"), "");

  const baby = run("bash", [BABYSIT, "drillH", FAKE_POD, "1.2.3.4", "22", art], {
    env: env({ P2_CANCEL_DIR: sh(art) }),
  });
  await sleep(1500);

  const dead = await run(
    "powershell",
    ["-NoProfile", "-File", DEADMAN, "-PodId", FAKE_POD, "-CapSeconds", "2", "-Label", "drillH", "-ArtDir", art, "-ApiUrl", API_URL, "-TickSeconds", "1"],
    { env: env() },
  );
  // The pod is gone the moment the dead-man terminates it.
  setSshDead(true);
  const r = await baby;
  setSshDead(false);

  const fired = terminated.slice(before);
  const log = existsSync(join(art, "babysit.log")) ? readFileSync(join(art, "babysit.log"), "utf8") : "";
  check("mid-run cap -> exactly one terminate (the dead-man's)", fired.length === 1 && fired[0].podId === FAKE_POD, JSON.stringify(fired));
  check("dead-man exits 0 after a mid-run terminate", dead.code === 0, `exit ${dead.code}`);
  check("babysitter notices the pod vanished and exits 3", r.code === 3, `exit ${r.code}`);
  check("babysitter never claims a verified fetch", !/checksums VERIFIED/.test(log), "");
  check("no cancel file from an interrupted run", !existsSync(join(art, "DEADMAN_CANCEL_drillH")), "");
  check("a half-fetched artifact is left, not reported as good", existsSync(join(art, "smoke.tar.gz")) && !/VERIFIED/.test(log), "");
}

// ── receipt ──────────────────────────────────────────────────────────────────
api.close();
const passed = results.filter((r) => r.pass).length;
const receipt = {
  drill: "P2 compensators",
  date: new Date().toISOString(),
  spend: 0,
  pod: "FAKE — no pod was rented, no real API was called",
  api_mock: API_URL,
  fake_pod_id: FAKE_POD,
  checks: results,
  passed,
  total: results.length,
  all_pass: passed === results.length,
  terminate_calls_recorded: terminated,
  terminate_calls_expected: 3,
  requires: "bash (5 of 8 scenarios run babysit-p2.sh); preflighted",
};
const outPath = join(HERE, "..", "compensator-drill.json");
writeFileSync(outPath, JSON.stringify(receipt, null, 2) + "\n");
console.log(`\n${passed}/${results.length} checks passed — receipt: ${sh(outPath)}`);
console.log(`podTerminate calls the mock recorded: ${terminated.length} (expected exactly 3: scenarios A, C and H)`);
rmSync(ROOT, { recursive: true, force: true });
process.exit(receipt.all_pass && terminated.length === 3 ? 0 : 1);
