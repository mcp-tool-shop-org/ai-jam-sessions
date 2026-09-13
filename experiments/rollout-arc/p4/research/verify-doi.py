# Crossref leg of the retrieval oracle -- the citations that are not arXiv preprints.
# Same rule as the arXiv leg: a transport failure prints UNVERIFIED and never reads as
# "this paper does not exist."
import sys, json, urllib.request, urllib.error, urllib.parse, time
DOIS = [l.strip() for l in open(sys.argv[1]) if l.strip() and not l.startswith("#")]
for d in DOIS:
    url = "https://api.crossref.org/works/" + urllib.parse.quote(d, safe="")
    got = None
    for wait in [0, 5, 15]:
        if wait: time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "rollout-arc-citation-oracle/1.0 (mailto:64996768+mcp-tool-shop@users.noreply.github.com)"})
            got = json.load(urllib.request.urlopen(req, timeout=45))["message"]
            break
        except urllib.error.HTTPError as e:
            if e.code == 404: print(f"[NO-MATCH] {d}  <-- Crossref 404"); got = "404"; break
            print(f"  HTTP {e.code} on {d}", flush=True)
        except Exception as e:
            print(f"  {type(e).__name__} on {d}", flush=True)
    if got == "404": continue
    if got is None:
        print(f"[UNVERIFIED] {d}  <-- transport failed; NOT a verdict", flush=True); continue
    auth = got.get("author", [])
    first = (auth[0].get("family", "?") if auth else "?")
    yr = (got.get("issued", {}).get("date-parts", [[None]])[0][0])
    title = (got.get("title") or ["(no title)"])[0]
    ctr = got.get("container-title") or [""]
    print(f"[OK]       {d}  {yr}  {first} (+{max(0,len(auth)-1)})")
    print(f"           {title}")
    print(f"           in: {ctr[0] if ctr else ''}")
