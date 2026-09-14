# THE SINGLE SOURCE of every dollar figure in POD-LEDGER.md. $0 to run, no GPU, no pod.
#
# Two rules, same shape as pil-readout.mts:
#   1. Every WALL input is a measured receipt, cited inline. Nothing is estimated from a
#      rate measured in one condition and spent in another -- that is the error that made
#      the four-arm session's held-out evals cost 6x their estimate.
#   2. A SKU whose throughput we have never measured is priced at factor 1.0 and LABELLED
#      as an assumption, with the break-even slowdown printed next to it. The RTX 5090 is
#      the only card this arc has a measured wall for.
import json, urllib.request, os, sys

# ---- measured walls, all from receipts in this repo -------------------------------
# train: p4/runs/gate/arm-{C,PIL}{7,8,9}L/run.json  ->  wall_seconds
TRAIN_C   = (2963 + 2855 + 3045) / 3          # prefix-mode none  (arm C shape)
TRAIN_PIL = (1742 + 1761 + 1789) / 3          # heterogeneous + --prefix-in-loss
# eval: p4/runs/gate/{gate,pil}-eval.log  ->  START/DONE stamps, G=64, 75 held-out items
EVAL_ADP  = (2363 + 2367 + 2376 + 2405 + 2361 + 2365) / 6   # with adapter (PEFT fwd cost)
EVAL_BASE = 2144                                            # no adapter
# pod-vs-local throughput on the SAME card model: p4/runs/pod-4arm/arm-C.json 15.83 s/step
# against the local C mean 14.76 s/step. The pod 5090 is ~7% slower.
POD_FACTOR = 15.83 / ((14.80 + 14.27 + 15.22) / 3)
# staging + routing + termination tail, from the four-arm receipts:
#   STAGE0.DONE +171 s warm; $0.245 lost to 19.7 min of routing across three killed pods;
#   $0.0403 billed AFTER the balance was read (termination tail, see live API below).
OVERHEAD_H = 0.35

# ---- the spend ledger, reconciled against the live account -------------------------
PROJECT_BUDGET   = 25.00
SPENT_PRE_P4POD  = 11.25   # rollout-arc/HANDOFF.md:41  (p2 $10.40 + p4 VOID Blackwell $0.85)
FOURARM_MEASURED = 5.4423  # p4/FOUR-ARM-RESULTS.md:162-164, balance $24.0403 -> $18.5980
BAL_AFTER_DOC    = 18.5980 # p4/FOUR-ARM-RESULTS.md:164

def live():
    k = os.environ.get("RUNPOD_API_KEY")
    if not k:
        return None
    q = {"query": "query { myself { clientBalance currentSpendPerHr pods { id } networkVolumes { id } } }"}
    r = urllib.request.Request("https://api.runpod.io/graphql", data=json.dumps(q).encode(),
        headers={"Authorization": f"Bearer {k}", "Content-Type": "application/json",
                 # urllib's default User-Agent is rejected by the API edge (403); curl is not.
                 "User-Agent": "rollout-arc-ledger/1.0"})
    try:
        return json.load(urllib.request.urlopen(r, timeout=30))["data"]["myself"]
    except Exception as e:
        # A transport failure is NEVER reported as "nothing is billing" -- same rule the
        # citation oracle runs on. The ledger says UNVERIFIED and falls back to the docs.
        print(f"  LIVE ACCOUNT UNVERIFIED ({type(e).__name__}: {e}) -- not a verdict that nothing bills", file=sys.stderr)
        return None

m = live()
print("=" * 78)
print("SPEND LEDGER -- reconciled from receipts, then against the live account")
print("=" * 78)
spent = SPENT_PRE_P4POD + FOURARM_MEASURED
print(f"  pre-four-arm (p2 $10.40 + p4 void Blackwell $0.85)   {SPENT_PRE_P4POD:>8.2f}")
print(f"  four-arm session, measured as an account delta        {FOURARM_MEASURED:>8.4f}")
print(f"  everything since (gate C7/8/9L, PIL7/8/9L, VS, all local 5090)   0.0000")
print(f"  {'SPENT':<52} {spent:>8.4f}")
print(f"  {'REMAINING of $25 project budget':<52} {PROJECT_BUDGET - spent:>8.4f}")
if m:
    tail = BAL_AFTER_DOC - m["clientBalance"]
    print(f"\n  LIVE account balance                                  {m['clientBalance']:>8.4f}")
    print(f"  currentSpendPerHr                                     {m['currentSpendPerHr']:>8.4f}")
    print(f"  pods / network volumes                                {len(m['pods'])} / {len(m['networkVolumes'])}")
    print(f"  billed after FOUR-ARM-RESULTS read the balance        {tail:>8.4f}  <- termination tail")
REMAIN = PROJECT_BUDGET - spent

# ---- live SKU prices ---------------------------------------------------------------
SKUS = [  # (label, $/hr, GB, throughput measured on this card?)
    ("RTX 5090 32GB  community", 0.69, 32, True),
    ("RTX 5090 32GB  secure   ", 0.99, 32, True),   # the four-arm pod's effective rate
    ("RTX 6000 Ada 48GB comm  ", 0.74, 48, False),
    ("RTX 6000 Ada 48GB secure", 0.84, 48, False),
    ("RTX PRO 6000 96GB comm  ", 1.69, 96, False),
    ("RTX PRO 6000 96GB secure", 2.09, 96, False),
    ("RTX A6000 48GB community", 0.33, 48, False),  # cheapest 48GB; Ampere, sm_86
]
CELLS = [
    ("(i)   8 PIL seeds, train+eval, + 1 pod base eval",  8, TRAIN_PIL, 8),
    ("(ii) 14 PIL seeds, train+eval, + 1 pod base eval", 14, TRAIN_PIL, 14),
    ("(iii) 3-seed new-objective arm, scored vs LOCAL C",  3, TRAIN_C,    3),
    # platform-concentration.mts: the pod-vs-local contrast on CONCENTRATION is
    # +11.79pp [+8.79, +14.91]. Whatever its cause -- platform or the single-run spread
    # this arc has already documented -- a pod arm's PRIMARY may not be scored against
    # the local C runs. A pod cell has to carry its own C control, and that is this row.
    ("(iv)  SAME, but carrying its own 3-seed C control",  6, TRAIN_C,    6),
]
print("\n" + "=" * 78)
print(f"PRICED CELLS   remaining ${REMAIN:.2f}   pod/local throughput factor {POD_FACTOR:.3f}")
print(f"peak reserved 23,282 MiB on the four-arm pod's 5090 of 32,109 -- every SKU above fits")
print("=" * 78)
for label, n_tr, tr_s, n_ev in CELLS:
    gpu_h = (n_tr * tr_s + n_ev * EVAL_ADP + EVAL_BASE) * POD_FACTOR / 3600 + OVERHEAD_H
    print(f"\n{label}")
    print(f"  GPU-hours {gpu_h:.2f}  ({n_tr} train x {tr_s/60:.1f}min + {n_ev} eval x {EVAL_ADP/60:.1f}min"
          f" + base {EVAL_BASE/60:.1f}min, x{POD_FACTOR:.3f}, + {OVERHEAD_H}h staging)")
    for sku, rate, gb, measured in SKUS:
        cost = gpu_h * rate
        fits = "FITS" if cost <= REMAIN else "OVER BUDGET"
        # break-even slowdown vs the measured-throughput 5090 community price
        be = (REMAIN / (gpu_h * rate)) if cost > 0 else 0
        tag = "" if measured else f"  [wall ASSUMED = 5090; breaks budget above {be:.2f}x slowdown]" if cost <= REMAIN else "  [wall ASSUMED = 5090]"
        print(f"    {sku}  ${rate:>4.2f}/h  ->  ${cost:>6.2f}   {fits}{tag}")

# ---- dead-man sizing, derived from the remaining budget not a legacy ceiling --------
print("\n" + "=" * 78)
print("DEAD-MAN CAP -- derived from REMAINING budget, not the retired $10 P2 ceiling")
print("=" * 78)
STORAGE_H = 0.014  # 100GB container/network volume ~= $0.10/GB/month (p2/BUILD.md:348)
for sku, rate, gb, measured in SKUS:
    runway_h = (REMAIN - 0.20) / (rate + STORAGE_H)   # $0.20 held back for the termination tail
    cap_h = int(runway_h)                              # floor to a whole hour
    print(f"  {sku}  ${rate:>4.2f}/h  runway {runway_h:5.2f} h  -> cap {cap_h:>2} h "
          f"({cap_h*3600:>6} s)  worst case ${cap_h*(rate+STORAGE_H)+0.20:>5.2f} of ${REMAIN:.2f}")
print("\n  powershell -File p2/scripts/deadman-p2.ps1 -PodId <id> -CapSeconds <above> -Label <cell>")
print("  NO network volume: none exists on the account today and an auto-created one bills")
print("  after the pod dies (LoRA playbook). Container disk only.")
