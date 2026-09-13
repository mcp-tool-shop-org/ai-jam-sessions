# Retrieval oracle, second provider: Semantic Scholar. Mechanism-diverse from the arXiv API
# (different operator, different infrastructure) and still deterministic -- no LLM anywhere.
# Same non-negotiable: transport failure prints UNVERIFIED, never "does not exist".
import sys, json, time, urllib.request, urllib.error

IDS = [l.strip() for l in open(sys.argv[1]) if l.strip() and not l.startswith("#")]
BODY = json.dumps({"ids": [f"ARXIV:{i}" for i in IDS]}).encode()
URL = "https://api.semanticscholar.org/graph/v1/paper/batch?fields=title,authors,year,externalIds"

data = None
for attempt, wait in enumerate([0, 10, 30, 60]):
    if wait:
        print(f"  backing off {wait}s", flush=True); time.sleep(wait)
    try:
        req = urllib.request.Request(URL, data=BODY, method="POST",
            headers={"Content-Type": "application/json", "User-Agent": "rollout-arc-citation-oracle/1.0"})
        data = json.load(urllib.request.urlopen(req, timeout=90))
        break
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}", flush=True)
    except Exception as e:
        print(f"  {type(e).__name__}: {e}", flush=True)

if data is None:
    print("\nORACLE UNAVAILABLE (provider 2) -- NOT a verdict on any citation.")
    sys.exit(2)

ok = 0
nomatch = []
for i, rec in zip(IDS, data):
    if not rec:
        nomatch.append(i); print(f"[NO-MATCH] arXiv:{i}   <-- provider returned null"); continue
    ok += 1
    auth = rec.get("authors") or []
    first = auth[0]["name"] if auth else "?"
    print(f"[OK]       arXiv:{i}  {rec.get('year')}  {first} (+{max(0,len(auth)-1)})")
    print(f"           {rec.get('title')}")
print(f"\nresolved {ok}/{len(IDS)}; no-match: {nomatch if nomatch else 'none'}")
