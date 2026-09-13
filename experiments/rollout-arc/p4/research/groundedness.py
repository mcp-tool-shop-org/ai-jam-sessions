# Step 4 stage 2 -- GROUNDEDNESS. Does the source actually claim what it was cited for?
#
# Reasoning-stripped by construction: the lens receives the bare claim and the bare abstract.
# It never sees why the claim was included, what it would be used to justify, or that a
# previous lens agreed. Different model family from the synthesiser (Claude) in every case.
import json, sys, urllib.request

MODEL = sys.argv[1]
claims = json.load(open("claims.json"))
abstracts = json.load(open("abstracts.json"))

SYS = ("You check whether a scientific abstract supports a specific claim. "
       "Answer with exactly one line: VERDICT: SUPPORTED or VERDICT: PARTIAL or VERDICT: NOT_SUPPORTED, "
       "then one line: WHY: <one sentence>. "
       "SUPPORTED means the abstract states or directly entails the claim. "
       "PARTIAL means the abstract is about this topic but does not establish the claim as worded. "
       "NOT_SUPPORTED means the abstract does not support it or is about something else.")

results = {}
for cid, claim in claims.items():
    rec = abstracts.get(cid)
    if not rec:
        print(f"{cid}  NO ABSTRACT -- cannot check"); continue
    prompt = f"ABSTRACT (title: {rec['title']}):\n{rec['abstract']}\n\nCLAIM:\n{claim}\n\nDoes the abstract support the claim?"
    body = json.dumps({"model": MODEL, "stream": False, "options": {"temperature": 0},
                       "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": prompt}]}).encode()
    try:
        req = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=body,
                                     headers={"Content-Type": "application/json"})
        txt = json.load(urllib.request.urlopen(req, timeout=300))["message"]["content"]
    except Exception as e:
        print(f"{cid}  LENS UNAVAILABLE ({type(e).__name__}) -- not a verdict"); continue
    v = "UNPARSED"
    for tok in ("NOT_SUPPORTED", "PARTIAL", "SUPPORTED"):
        if tok in txt.upper(): v = tok; break
    why = ""
    for line in txt.splitlines():
        if line.strip().upper().startswith("WHY"): why = line.split(":", 1)[-1].strip()[:160]
    results[cid] = v
    print(f"{cid}  {v:<14} {why}")
json.dump(results, open(f"groundedness-{MODEL.replace(':','_').replace('/','_')}.json", "w"), indent=1)
print(f"\n[{MODEL}] " + " ".join(f"{k}={v}" for k, v in sorted(results.items())))
