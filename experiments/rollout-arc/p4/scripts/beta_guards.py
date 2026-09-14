"""Hard guards for the B0-vs-C cell. Exits 9 and says why, or exits 0 and says so.

Complements `arm_guards.py` (population + forcing) with the objective pins this cell turns
on. Same two house rules:

  1. A SEPARATE FILE, NOT A HEREDOC. A heredoc can only be exercised by paying for a GPU to
     reach it. This runs against a receipt already on disk, for nothing.
  2. EVERY CHECK IS DIRECTIONAL. `arm_guards.py` once asserted `masked == total`
     unconditionally and VOIDED a valid run whose whole point was the other direction
     (fixed in c25867c). Here the same trap is one line away: B0 must have NO KL series and
     C must HAVE one, and a guard that only knew how to assert "no KL" would void the
     control.

THE CHECK THAT MATTERS. `beta` on the receipt records the REQUEST. It does not prove the
reference-KL path was skipped. TRL appends the `kl` metric series only `if self.beta != 0.0`
(`grpo_trainer.py:3360`) and skips the reference log-prob forward pass on the same condition
(`:2732`), so the PRESENCE OR ABSENCE OF THE `kl` SERIES is the consequence, measured. That
is why `train.py` now records `trl_metrics.kl_logged`; a receipt without that field predates
the fix and cannot be used in this cell.

    python beta_guards.py arm ../runs/gate/arm-C7L/run.json C
    python beta_guards.py arm ../runs/pod-b0/arm-B07/run.json B0
    python beta_guards.py cell ../runs/pod-b0          # six adapters + G=64 evals
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

# Pinned IDENTICALLY on both arms. beta is the one lever and is handled separately.
SHARED_PINS = {
    "loss_type": "dapo",
    "scale_rewards": "group",
    "num_iterations": 1,
    "entropy_coef": 0.0,
    "use_adaptive_entropy": False,
    "num_generations": 8,
    "epsilon": 0.2,
    "epsilon_high": 0.28,
}
ARM_BETA = {"C": 1e-4, "B0": 0.0}
EVAL_G = 64
EVAL_ROWS = 75
CELL_ROWS = 32


def check_arm(receipt: dict, arm: str) -> list[str]:
    bad: list[str] = []
    cfg = receipt.get("config") or {}
    want_beta = ARM_BETA[arm]

    # --- the lever, as requested ---
    got = cfg.get("beta")
    if got is None:
        bad.append("config.beta is missing: the one lever of this cell is unrecorded")
    elif float(got) != want_beta:
        bad.append(f"config.beta {got!r} != {want_beta!r} for arm {arm}")

    # --- the lever, as APPLIED. Directional: absence is correct for exactly one arm. ---
    tm = receipt.get("trl_metrics")
    if tm is None:
        bad.append(
            "receipt has no trl_metrics block: it predates the capture added for this cell, "
            "so whether the reference-KL path ran is unrecorded and cannot be inferred"
        )
    else:
        kl = tm.get("kl_logged")
        if arm == "B0":
            if kl is not False:
                bad.append(
                    f"arm B0 but kl_logged={kl!r}: TRL emitted a KL series, which it does only "
                    f"when beta != 0 -- the reference forward pass ran and this is not B0"
                )
        else:
            if kl is not True:
                bad.append(
                    f"arm C but kl_logged={kl!r}: the control is supposed to carry the KL term "
                    f"this cell removes, and its absence makes the control a second B0"
                )
        if tm.get("entropy_coef_logged"):
            bad.append("entropy_coef was logged: an entropy bonus is live and this cell has one lever")
        if not tm.get("log_history_entries"):
            bad.append("trl_metrics.log_history_entries is 0: nothing was logged, so nothing is asserted")

    # --- everything that must NOT differ between the arms ---
    for key, want in SHARED_PINS.items():
        if key not in cfg:
            bad.append(f"config.{key} is unrecorded: it cannot be shown identical across arms")
        elif cfg[key] != want:
            bad.append(f"config.{key} {cfg[key]!r} != {want!r}")

    if receipt.get("dataset_rows") != CELL_ROWS:
        bad.append(f"dataset_rows {receipt.get('dataset_rows')} != {CELL_ROWS}")

    v = receipt.get("versions") or {}
    for key in ("trl", "torch", "python", "device"):
        if not v.get(key):
            bad.append(f"versions.{key} missing: the run is not replayable")
    if v.get("trl") and v["trl"] != "1.13.0":
        bad.append(f"trl {v['trl']} != 1.13.0: every line number this cell's guards cite moves")

    return bad


def _sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def check_cell(root: Path) -> list[str]:
    """Six distinct adapters, and six evals that are actually G=64 on the held-out pool."""
    bad: list[str] = []

    adapters = sorted(root.glob("adapter-*/adapter_model.safetensors"))
    if len(adapters) != 6:
        bad.append(f"{len(adapters)} adapters under {root}, expected 6 (3 C + 3 B0)")
    digests: dict[str, list[str]] = {}
    for a in adapters:
        digests.setdefault(_sha(a), []).append(a.parent.name)
    for d, names in digests.items():
        if len(names) > 1:
            bad.append(f"adapters {', '.join(names)} are BYTE-IDENTICAL ({d[:12]}): a run was reused")
    print(f"[b0] {len(adapters)} adapters, {len(digests)} distinct SHA-256")

    evals = sorted(root.glob("mc64-heldout-*.jsonl"))
    if not evals:
        bad.append(f"no mc64-heldout-*.jsonl under {root}: nothing to read the primary from")
    for e in evals:
        rows = [json.loads(l) for l in e.read_text(encoding="utf-8").splitlines() if l.strip()]
        if len(rows) != EVAL_ROWS:
            bad.append(f"{e.name}: {len(rows)} rows != {EVAL_ROWS} held-out items")
        widths = {len(r.get("completions") or []) for r in rows}
        if widths != {EVAL_G}:
            bad.append(f"{e.name}: generations per item {sorted(widths)} != [{EVAL_G}] -- not a G=64 eval")
        # The pod does not score; the readout runs locally. So the only silent-failure this
        # file can catch on the pod is an eval that produced the right SHAPE and no CONTENT --
        # 75 x 64 empty strings is a structurally perfect file worth nothing. An all-empty
        # eval is void; a merely low-yield one is reported and left alone, because "the model
        # emitted little" is a result and not a defect.
        comps = [c for r in rows for c in (r.get("completions") or [])]
        empty = sum(1 for c in comps if not (c or "").strip())
        if comps and empty == len(comps):
            bad.append(f"{e.name}: every one of {len(comps)} completions is empty -- generation produced nothing")
        elif widths == {EVAL_G}:
            print(f"[b0] {e.name}: {len(rows)} rows x G={EVAL_G}, {empty}/{len(comps)} empty")
    return bad


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__.strip().splitlines()[-3], file=sys.stderr)
        print("usage: beta_guards.py arm <run.json> <C|B0>   |   beta_guards.py cell <runs-dir>", file=sys.stderr)
        return 2
    mode = sys.argv[1]
    if mode == "arm":
        path, arm = sys.argv[2], sys.argv[3]
        if arm not in ARM_BETA:
            print(f"unknown arm {arm!r}; expected one of {sorted(ARM_BETA)}", file=sys.stderr)
            return 2
        receipt = json.load(open(path, encoding="utf-8"))
        cfg = receipt.get("config") or {}
        tm = receipt.get("trl_metrics") or {}
        print(
            f"[b0] beta guards: arm={arm} beta={cfg.get('beta')!r} kl_logged={tm.get('kl_logged')!r} "
            f"loss_type={cfg.get('loss_type')!r} scale_rewards={cfg.get('scale_rewards')!r} "
            f"entropy_coef={cfg.get('entropy_coef')!r} rows={receipt.get('dataset_rows')}"
        )
        bad = check_arm(receipt, arm)
    elif mode == "cell":
        bad = check_cell(Path(sys.argv[2]))
    else:
        print(f"unknown mode {mode!r}; expected 'arm' or 'cell'", file=sys.stderr)
        return 2

    if bad:
        print("[b0] VOID: " + "; ".join(bad))
        return 9
    print("[b0] beta guards ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
