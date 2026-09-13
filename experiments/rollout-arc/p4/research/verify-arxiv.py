# Step 4 stage 1 -- the RETRIEVAL ORACLE. Deterministic, mechanism-diverse, no LLM.
#
# TWO PROPERTIES THAT MATTER MORE THAN SPEED:
#  1. https, not http. arXiv 301-redirects the http scheme; a client that does not follow
#     it reads as "no data", which is indistinguishable from "no such paper".
#  2. A TRANSPORT FAILURE IS NEVER REPORTED AS A MISSING PAPER. 429/timeout/5xx exits
#     non-zero and prints UNVERIFIED. Reporting a rate-limit as "does not resolve" would
#     manufacture a fabrication verdict against a real citation -- the exact error class
#     this whole gate exists to catch.
import sys, urllib.request, urllib.error, xml.etree.ElementTree as ET, time

IDS = [l.strip() for l in open(sys.argv[1]) if l.strip() and not l.startswith("#")]
NS = {"a": "http://www.w3.org/2005/Atom"}
URL = "https://export.arxiv.org/api/query?max_results=200&id_list=" + ",".join(IDS)

raw = None
for attempt, wait in enumerate([0, 20, 45, 90]):
    if wait:
        print(f"  backing off {wait}s (attempt {attempt+1})", flush=True)
        time.sleep(wait)
    try:
        req = urllib.request.Request(URL, headers={"User-Agent": "rollout-arc-citation-oracle/1.0"})
        raw = urllib.request.urlopen(req, timeout=90).read()
        break
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}", flush=True)
    except Exception as e:
        print(f"  {type(e).__name__}: {e}", flush=True)

if raw is None:
    print("\nORACLE UNAVAILABLE -- transport failed after retries. NOT a verdict on any citation.")
    sys.exit(2)

root = ET.fromstring(raw)
out = {}
for e in root.findall("a:entry", NS):
    eid = e.find("a:id", NS).text.rsplit("/", 1)[-1]
    base = eid.split("v")[0]
    out[base] = (
        " ".join(e.find("a:title", NS).text.split()),
        [a.find("a:name", NS).text for a in e.findall("a:author", NS)],
        e.find("a:published", NS).text[:10],
    )

print(f"requested {len(IDS)} - resolved {len(out)}\n", flush=True)
missing = []
for i in IDS:
    if i in out:
        t, a, p = out[i]
        print(f"[OK]       arXiv:{i}  {p}  {a[0] if a else '?'} (+{max(0,len(a)-1)})")
        print(f"           {t}")
    else:
        missing.append(i)
        print(f"[NO-MATCH] arXiv:{i}   <-- returned no entry")
print(f"\nresolved {len(out)}/{len(IDS)}; no-match: {missing if missing else 'none'}")
