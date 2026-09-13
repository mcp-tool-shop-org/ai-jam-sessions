# Retrieval oracle, title-search leg. For citations given as a TITLE rather than an id --
# which is how fabricated and conflated references usually arrive.
# Same rule as every other leg: transport failure prints UNVERIFIED, never "does not exist".
import sys, json, time, urllib.request, urllib.parse, urllib.error
Q = [l.strip() for l in open(sys.argv[1], encoding="utf-8") if l.strip() and not l.startswith("#")]
BASE = "https://api.semanticscholar.org/graph/v1/paper/search?limit=3&fields=title,authors,year,externalIds&query="
for q in Q:
    data = None
    for w in [0, 30, 75, 150]:
        if w: time.sleep(w)
        try:
            req = urllib.request.Request(BASE + urllib.parse.quote(q),
                  headers={"User-Agent": "rollout-arc-citation-oracle/1.0"})
            data = json.load(urllib.request.urlopen(req, timeout=60)); break
        except urllib.error.HTTPError as e:
            print(f"  HTTP {e.code} on '{q[:50]}'", flush=True)
        except Exception as e:
            print(f"  {type(e).__name__} on '{q[:50]}'", flush=True)
    print(f"\nQUERY: {q}")
    if data is None:
        print("  UNVERIFIED -- transport failed, NOT a verdict"); continue
    hits = data.get("data") or []
    if not hits:
        print("  NO RESULTS")
        continue
    for h in hits:
        a = h.get("authors") or []
        ex = h.get("externalIds") or {}
        ident = ex.get("ArXiv") and f"arXiv:{ex['ArXiv']}" or ex.get("DOI") and f"doi:{ex['DOI']}" or "(no id)"
        print(f"  - {h.get('year')}  {a[0]['name'] if a else '?'}  {ident}")
        print(f"    {h.get('title')}")
    time.sleep(20)
