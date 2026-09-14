"""Substrate probe, stage 2 -- sample G completions per prompt on the GENERATIVE surface.

Mirrors the P2 trainer's generation path: Qwen3-4B-Instruct-2507, bf16, transformers
(not Ollama -- the Ollama/transformers span divergence is unexplained and the trainer
is the transformers path), sampler read off the P2 GRPOConfig: temperature 1.0,
top_p 1.0, top_k 0.

Measures the gate the director named: distinct model-authored spans per group.
Scoring is NOT done here -- it happens in Node through the real E-R verifier.
"""
import argparse, json, os, time
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

ap = argparse.ArgumentParser()
ap.add_argument("--prompts", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--model", default="Qwen/Qwen3-4B-Instruct-2507")
ap.add_argument("--generations", type=int, default=8)
ap.add_argument("--max-new-tokens", type=int, default=1024)
ap.add_argument("--temperature", type=float, default=1.0)
ap.add_argument("--top-p", type=float, default=1.0)
ap.add_argument("--top-k", type=int, default=0)
ap.add_argument("--seed", type=int, default=0)
ap.add_argument("--limit", type=int, default=0)
ap.add_argument("--entropy", action="store_true", help="also measure mean per-token entropy")
ap.add_argument(
    "--adapter",
    default=None,
    help=(
        "path to a trained LoRA adapter. THE FALSIFIER NEEDS THIS. The preregistered "
        "primary outcome of a prefix-forced training run is top_first_measure_share on an "
        "UNCONDITIONED eval -- scaffolding off, nobody handing the model an opening -- and "
        "this script is the unconditioned path. Without it the run's own falsifier would "
        "have been unmeasurable after the spend."
    ),
)
ap.add_argument(
    "--eos-token-ids",
    default=None,
    help=(
        "comma-separated token ids to stop on, overriding the checkpoint's generation_config. "
        "THIS EXISTS BECAUSE OF A MEASURED TRAP. `generate()` below passes no eos_token_id, so "
        "HF falls back to generation_config.json -- NOT to the tokenizer's eos_token. "
        "Qwen3-4B-Instruct-2507 ships eos_token_id [151645, 151643] (<|im_end|>, <|endoftext|>); "
        "Qwen3-4B-Base ships 151643 ALONE, while the ChatML template it also ships closes every "
        "turn with <|im_end|>. Run the base checkpoint through our envelope without this flag "
        "and it never stops at the turn boundary: every rollout runs to max_new_tokens and "
        "trails continuation text past the JSON, which reads as 'the base model cannot emit the "
        "format' when the truth is that nobody told it to stop. Default None = unchanged "
        "behaviour, so every eval already published by this script is unaffected."
    ),
)
ap.add_argument(
    "--no-chat-template",
    action="store_true",
    help=(
        "concatenate system and user as PLAIN TEXT instead of calling apply_chat_template. "
        "Dr. GRPO (arXiv:2503.20783 Table 1) measures Qwen2.5 base checkpoints ~60%% better with "
        "no template than with one, and scores them 0.0 under a mismatched template -- so the "
        "un-enveloped prompt is a separate arm, not a fallback."
    ),
)
a = ap.parse_args()

rows = [json.loads(l) for l in open(a.prompts, encoding="utf-8") if l.strip()]
if a.limit:
    rows = rows[: a.limit]
print(f"prompts={len(rows)} G={a.generations} model={a.model}", flush=True)

tok = AutoTokenizer.from_pretrained(a.model)
model = AutoModelForCausalLM.from_pretrained(a.model, dtype=torch.bfloat16).to("cuda").eval()
if a.adapter:
    from peft import PeftModel

    model = PeftModel.from_pretrained(model, a.adapter).eval()
    # Say it loudly. A silent no-op here would compare the base model against itself and
    # report "no change" as a finding -- the same run, twice, with a different label.
    n_lora = sum(1 for n, _ in model.named_parameters() if "lora_" in n)
    if n_lora == 0:
        raise SystemExit(f"HALT: {a.adapter} loaded but contributed no LoRA parameters")
    print(f"adapter {a.adapter} | {n_lora} lora tensors", flush=True)
print(f"loaded | adapter={a.adapter or 'none (base)'} | cuda mem {torch.cuda.memory_allocated()/2**30:.2f} GiB", flush=True)

EOS_IDS = [int(x) for x in a.eos_token_ids.split(",")] if a.eos_token_ids else None
if EOS_IDS is not None:
    # Say it loudly and by NAME. An id that is not the token you think it is stops nothing,
    # and the symptom (completions running to the cap) is the same as not passing it at all.
    named = ", ".join(f"{i}={tok.convert_ids_to_tokens(i)!r}" for i in EOS_IDS)
    print(f"eos override | {named} | generation_config said {model.generation_config.eos_token_id}", flush=True)
print(f"prompt mode | {'PLAIN TEXT (no chat template)' if a.no_chat_template else 'chat template'}", flush=True)

torch.manual_seed(a.seed)
out_f = open(a.out, "w", encoding="utf-8")
t0 = time.time()
for i, r in enumerate(rows):
    msgs = [{"role": "system", "content": r["system"]}, {"role": "user", "content": r["user"]}]
    if a.no_chat_template:
        # The un-enveloped arm: the same two strings, no role markers, no generation prompt.
        text = f"{r['system']}\n\n{r['user']}\n\n"
    else:
        text = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    enc = tok([text], return_tensors="pt").to("cuda")
    with torch.no_grad():
        gen = model.generate(
            **enc,
            do_sample=True,
            temperature=a.temperature,
            top_p=a.top_p,
            top_k=a.top_k if a.top_k > 0 else 0,
            num_return_sequences=a.generations,
            max_new_tokens=a.max_new_tokens,
            pad_token_id=tok.pad_token_id or tok.eos_token_id,
            **({} if not a.eos_token_ids else {"eos_token_id": EOS_IDS}),
        )
    plen = enc["input_ids"].shape[1]
    comps = [tok.decode(g[plen:], skip_special_tokens=True) for g in gen]
    lens = [int((g[plen:] != (tok.pad_token_id or tok.eos_token_id)).sum()) for g in gen]

    ent = None
    if a.entropy:
        with torch.no_grad():
            logits = model(gen).logits[:, plen - 1 : -1, :].float()
            logp = torch.log_softmax(logits, dim=-1)
            e = -(logp.exp() * logp).sum(-1)
            mask = (gen[:, plen:] != (tok.pad_token_id or tok.eos_token_id)).float()
            ent = float((e * mask).sum() / mask.sum().clamp(min=1))
        del logits, logp, e
        torch.cuda.empty_cache()

    out_f.write(json.dumps({
        "itemId": r["itemId"], "songId": r["songId"],
        "completions": comps, "lengths": lens,
        "distinct_exact": len(set(comps)),
        "distinct_stripped": len(set(c.strip() for c in comps)),
        "mean_entropy": ent,
    }) + "\n")
    out_f.flush()
    if (i + 1) % 5 == 0 or i == 0:
        el = time.time() - t0
        print(f"  {i+1}/{len(rows)}  {el:.0f}s  ({el/(i+1):.1f}s/item)  distinct={len(set(comps))}/{a.generations}", flush=True)
out_f.close()
print(f"done in {time.time()-t0:.0f}s -> {a.out}", flush=True)
