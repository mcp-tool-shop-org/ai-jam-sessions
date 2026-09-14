# RETRIEVAL ORACLE, three providers, one pass. Deterministic. No LLM anywhere.
#
# WHY THIS EXISTS. verify-arxiv.py (export.arxiv.org API) and verify-s2.py (Semantic Scholar
# BATCH endpoint) both returned HTTP 429 on 2026-09-13 and exited 2 with no verdict -- correct
# behaviour, and a dead end for a gate that has to run. Probing showed the throttle is
# endpoint-specific, not provider-specific:
#
#     export.arxiv.org/api/query        429
#     api.semanticscholar.org  BATCH    429
#     api.semanticscholar.org  single   200   <- per-paper GET is not throttled
#     api.openalex.org                  200   <- a third operator entirely
#
# So this queries PER PAPER across three independent operators with polite spacing.
#
# THE NON-NEGOTIABLE, inherited from verify-arxiv.py: A TRANSPORT FAILURE IS NEVER REPORTED AS
# A MISSING PAPER. Every provider outcome is one of FOUND / NOT_FOUND / TRANSPORT. Only
# NOT_FOUND is evidence about a citation; TRANSPORT is evidence about the network. Reporting a
# rate-limit as "does not resolve" manufactures a fabrication verdict against a real paper,
# which is the exact error class this gate exists to catch.
#
# VERDICTS
#   CONFIRMED         >= 2 providers FOUND and their titles agree (normalised)
#   TITLE-CONFLICT    >= 2 providers FOUND and their titles DISAGREE  -> halt, inspect
#   SINGLE-PROVIDER   exactly 1 provider FOUND; the rest TRANSPORT    -> weaker than the gate
#   NOT-FOUND         >= 2 providers say NOT_FOUND and none says FOUND -> a real verdict
#   COVERAGE-GAP      exactly 1 NOT_FOUND, rest TRANSPORT -> NOT a verdict (indexing lag)
#   UNVERIFIED        0 FOUND and 0 NOT_FOUND (everything was TRANSPORT) -> NOT a verdict
#
# Exit 0 only when every id is CONFIRMED. Anything else exits non-zero so a caller cannot
# read silence as success.
#
#   python verify-multi.py <ids-file> [--sleep 1.5]
import sys, json, time, urllib.request, urllib.error, xml.etree.ElementTree as ET

UA = {"User-Agent": "rollout-arc-citation-oracle/2.0 (mailto:64996768+mcp-tool-shop@users.noreply.github.com)"}
FOUND, NOT_FOUND, TRANSPORT = "FOUND", "NOT_FOUND", "TRANSPORT"


def _get(url, timeout=10):
    """Returns (bytes, None) or (None, reason). A 404 is data; everything else is transport."""
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read(), None
    except urllib.error.HTTPError as e:
        return (None, "404") if e.code == 404 else (None, f"HTTP {e.code}")
    except Exception as e:
        return None, type(e).__name__


def norm(t):
    return " ".join("".join(c.lower() if c.isalnum() or c.isspace() else " " for c in (t or "")).split())


def openalex(aid):
    raw, err = _get(f"https://api.openalex.org/works/doi:10.48550/arXiv.{aid}")
    if raw is None:
        return (NOT_FOUND, None) if err == "404" else (TRANSPORT, err)
    d = json.loads(raw)
    auth = [a["author"]["display_name"] for a in (d.get("authorships") or [])][:4]
    return FOUND, {"title": d.get("title"), "authors": auth, "year": d.get("publication_year")}


def semanticscholar(aid):
    raw, err = _get(f"https://api.semanticscholar.org/graph/v1/paper/arXiv:{aid}?fields=title,authors,year")
    if raw is None:
        return (NOT_FOUND, None) if err == "404" else (TRANSPORT, err)
    d = json.loads(raw)
    return FOUND, {"title": d.get("title"), "authors": [a["name"] for a in (d.get("authors") or [])][:4], "year": d.get("year")}


def arxiv_api(aid):
    raw, err = _get(f"https://export.arxiv.org/api/query?max_results=1&id_list={aid}")
    if raw is None:
        return TRANSPORT, err
    ns = {"a": "http://www.w3.org/2005/Atom"}
    e = ET.fromstring(raw).find("a:entry", ns)
    # The arXiv API answers a bad id with an entry titled "Error"; that IS a verdict.
    if e is None:
        return NOT_FOUND, None
    title = " ".join((e.find("a:title", ns).text or "").split())
    if title.lower().startswith("error"):
        return NOT_FOUND, None
    auth = [a.find("a:name", ns).text for a in e.findall("a:author", ns)][:4]
    pub = (e.find("a:published", ns).text or "")[:10]
    return FOUND, {"title": title, "authors": auth, "year": pub}


def datacite(aid):
    raw, err = _get(f"https://api.datacite.org/dois/10.48550/arXiv.{aid}")
    if raw is None:
        return (NOT_FOUND, None) if err == "404" else (TRANSPORT, err)
    a = json.loads(raw)["data"]["attributes"]
    titles = a.get("titles") or [{}]
    return FOUND, {"title": titles[0].get("title"), "authors": [c.get("name") for c in (a.get("creators") or [])][:4],
                   "year": a.get("publicationYear")}


PROVIDERS = [("openalex", openalex), ("datacite", datacite), ("semanticscholar", semanticscholar), ("arxiv-api", arxiv_api)]

ids = [l.split("#")[0].strip() for l in open(sys.argv[1], encoding="utf-8")]
ids = [i for i in ids if i]
sleep = float(sys.argv[sys.argv.index("--sleep") + 1]) if "--sleep" in sys.argv else 1.5

rows, tally = [], {}
for aid in ids:
    res = {}
    for name, fn in PROVIDERS:
        res[name] = fn(aid)
        time.sleep(sleep)
    hits = {n: p for n, (s, p) in res.items() if s == FOUND}
    nf = [n for n, (s, _) in res.items() if s == NOT_FOUND]
    tr = {n: p for n, (s, p) in res.items() if s == TRANSPORT}
    titles = {n: norm(p["title"]) for n, p in hits.items()}
    if len(hits) >= 2:
        verdict = "CONFIRMED" if len(set(titles.values())) == 1 else "TITLE-CONFLICT"
    elif len(hits) == 1:
        verdict = "SINGLE-PROVIDER"   # one provider's silence never outvotes another's record
    elif len(nf) >= 2:
        verdict = "NOT-FOUND"         # two independent registries with no record IS a verdict
    elif nf:
        verdict = "COVERAGE-GAP"      # one registry has no record, the rest unreachable
    else:
        verdict = "UNVERIFIED"
    tally[verdict] = tally.get(verdict, 0) + 1
    rows.append((aid, verdict, hits, nf, tr))

    any_p = next(iter(hits.values()), None)
    print(f"\n{aid}  [{verdict}]")
    if any_p:
        print(f"  title   {any_p['title']}")
        print(f"  authors {'; '.join(a for a in any_p['authors'] if a)}   year {any_p['year']}")
    for n, _ in PROVIDERS:
        s, p = res[n]
        note = "" if s != TRANSPORT else f"  ({p})"
        if s == FOUND and verdict == "TITLE-CONFLICT":
            note = f"  -> {p['title']}"
        print(f"  {n:16} {s}{note}")

print("\n" + "=" * 74)
print("  ".join(f"{k}={v}" for k, v in sorted(tally.items())))
bad = [r[0] for r in rows if r[1] != "CONFIRMED"]
if bad:
    print(f"\nNOT CLEAN. Non-CONFIRMED ids: {', '.join(bad)}")
    print("UNVERIFIED is a statement about the network, NOT a verdict on any citation.")
    sys.exit(1)
print("\nALL CONFIRMED by at least two independent providers with agreeing titles.")
