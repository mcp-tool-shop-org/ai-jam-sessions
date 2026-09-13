# Stage 2 input: abstracts for the groundedness lens.
# arxiv.org/abs/ is a different endpoint from the rate-limited export.arxiv.org/api.
# Polite: one request every 3.5s, single pass, no retry storm. A failure is recorded as
# a FETCH FAILURE, never as an absent or false citation.
import re, html, json, time, urllib.request, urllib.error
IDS = [l.strip() for l in open("ids-all.txt") if l.strip()]
out, failed = {}, []
for n, i in enumerate(IDS, 1):
    try:
        req = urllib.request.Request(f"https://arxiv.org/abs/{i}",
              headers={"User-Agent": "rollout-arc-citation-oracle/1.0 (groundedness check)"})
        s = urllib.request.urlopen(req, timeout=45).read().decode("utf-8", "replace")
        m = re.search(r'<blockquote class="abstract[^"]*">(.*?)</blockquote>', s, re.S)
        t = re.search(r'name="citation_title" content="([^"]*)"', s)
        if m:
            a = html.unescape(" ".join(re.sub(r"<[^>]+>", " ", m.group(1)).split()))
            a = re.sub(r"^Abstract:\s*", "", a)
            out[i] = {"title": t.group(1) if t else "", "abstract": a}
        else:
            failed.append(i)
    except Exception as e:
        failed.append(i)
        print(f"  fetch failure {i}: {type(e).__name__}", flush=True)
    if n % 10 == 0: print(f"  {n}/{len(IDS)}", flush=True)
    time.sleep(3.5)
json.dump(out, open("abstracts.json", "w"), indent=1)
print(f"\nabstracts: {len(out)}/{len(IDS)}; FETCH FAILURES (not verdicts): {failed if failed else 'none'}")
