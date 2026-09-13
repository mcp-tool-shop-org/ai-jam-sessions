"""Exploring starts: generate each rollout from a DIFFERENT forced opening.

Each rollout's assistant turn is pre-filled with its own opening voicing, so a group
of G spans the opening space by construction instead of collapsing onto the prior's
favourite. Sampler is unchanged -- temperature 1.0, top_p 1.0, top_k 0 -- because the
point is to change the CONDITIONING, not the sampling.

The resulting pass rate is P(complete correctly | forced opening). It is a conditional
and is not comparable to the unconditioned figure.
"""
import argparse, json, time
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

ap = argparse.ArgumentParser()
ap.add_argument("--prompts", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--model", default="Qwen/Qwen3-4B-Instruct-2507")
ap.add_argument("--max-new-tokens", type=int, default=384)
ap.add_argument("--temperature", type=float, default=1.0)
ap.add_argument("--top-p", type=float, default=1.0)
ap.add_argument("--seed", type=int, default=7)
ap.add_argument("--limit", type=int, default=0)
a = ap.parse_args()

rows = [json.loads(l) for l in open(a.prompts, encoding="utf-8") if l.strip()]
if a.limit:
    rows = rows[: a.limit]
print(f"items={len(rows)} model={a.model}", flush=True)

tok = AutoTokenizer.from_pretrained(a.model)
# Left padding: with different-length prefixes the generated continuation must start
# at the true end of each sequence, not after right-hand pad tokens.
tok.padding_side = "left"
if tok.pad_token_id is None:
    tok.pad_token = tok.eos_token
model = AutoModelForCausalLM.from_pretrained(a.model, dtype=torch.bfloat16).to("cuda").eval()
print(f"loaded | cuda {torch.cuda.memory_allocated()/2**30:.2f} GiB", flush=True)

torch.manual_seed(a.seed)
out_f = open(a.out, "w", encoding="utf-8")
t0 = time.time()

for i, r in enumerate(rows):
    msgs = [{"role": "system", "content": r["system"]}, {"role": "user", "content": r["user"]}]
    head = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    # One full input per rollout: shared prompt + that rollout's forced opening.
    texts = [head + pfx for pfx in r["prefixes"]]
    enc = tok(texts, return_tensors="pt", padding=True).to("cuda")
    with torch.no_grad():
        gen = model.generate(
            **enc,
            do_sample=True,
            temperature=a.temperature,
            top_p=a.top_p,
            top_k=0,
            max_new_tokens=a.max_new_tokens,
            pad_token_id=tok.pad_token_id,
        )
    plen = enc["input_ids"].shape[1]
    tails = [tok.decode(g[plen:], skip_special_tokens=True) for g in gen]
    # The scored completion is prefix + continuation: the forced opening is part of
    # the answer and must be judged, not discarded.
    comps = [pfx + tail for pfx, tail in zip(r["prefixes"], tails)]

    out_f.write(json.dumps({
        "itemId": r["itemId"],
        "songId": r["songId"],
        "prefixes": r["prefixes"],
        "completions": comps,
        "distinct_exact": len(set(comps)),
        "distinct_tails": len(set(tails)),
    }) + "\n")
    out_f.flush()
    if (i + 1) % 4 == 0 or i == 0:
        el = time.time() - t0
        print(f"  {i+1}/{len(rows)}  {el:.0f}s ({el/(i+1):.1f}s/item)", flush=True)

out_f.close()
print(f"done in {time.time()-t0:.0f}s -> {a.out}", flush=True)
