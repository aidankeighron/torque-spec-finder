# 05 — Retrieval & Abstain

## The pipeline

```
0. VEHICLE comes from the UI selector -> hard SQL filter
     never parsed from text, never inferred

1. QUERY PARSE
     a. deterministic keyword pass  -> position_hints[]   (rear, lower, LH, inboard, ...)
        runs FIRST, so the gate in step 5 never depends on a model
     b. LLM enrich (optional)       -> assembly_hint, part_hint
        no numbers involved, failure here is non-fatal

2. CANDIDATE GENERATION  — both vehicle-filtered in SQL, single query each
     lexical:  FTS5 BM25        over fastener_fts
     semantic: sqlite-vec cosine over fastener_vec

3. FUSION
     Reciprocal Rank Fusion -> top ~20
     RRF because BM25 scores and cosine scores are not on a shared scale;
     fusing by RANK avoids inventing a comparison that doesn't exist

4. RERANK
     local cross-encoder (bge-reranker-base, ONNX, CPU, ~100ms for 20)
     joint query+candidate scoring — sees both at once, unlike embeddings

5. POSITION GATE                                   [deterministic]
     query said "rear" and "lower"
     -> candidate whose position or assembly path contradicts either
        CANNOT auto-answer, regardless of score

6. VERIFIER                                        [LLM, fails closed]
     input:  the question + candidate's canonical_name, assembly path, position
     output: {match: yes | no | unsure}   enum-constrained
     never sees a torque value

7. AUTO-ANSWER IFF ALL HOLD:
     rerank_top1          >= T1
     (top1 - top2)        >= T_margin
     position gate passed
     verifier             == yes
     status               != conflicting
     provenance tier      <= configured minimum

   OTHERWISE -> ranked candidate list + diagram, you pick
                your pick is written back as an alias row

8. RENDER
     number string-formatted from DB columns by a server-side template
     no LLM anywhere in this step

9. OUTPUT GUARD
     regex every numeral in the response payload
     assert each appears in the retrieved record
     mismatch -> 500 + log, never serve
```

## Why each stage earns its place

**Hybrid, not vector-only.** Fastener names are full of exact tokens that embeddings handle
badly — `M10x1.5`, `Z51`, part numbers, `LH`. BM25 nails those. Embeddings handle "the bolt that
holds the sway bar to the frame." You need both, and neither alone is close.

**Filter inside the query, not after.** The vehicle filter is applied in SQL alongside the
vector search. The common alternative — search a vector store, then filter results — silently
drops correct matches whenever the filter is selective, because the right answer fell outside
the top-k *before* filtering. Co-locating the vector index in SQLite makes this a non-issue.

**RRF over score-blending.** BM25 scores are unbounded; cosine is [-1,1]. Any weighted sum
requires inventing a conversion. Fusing by rank doesn't.

**Cross-encoder over bi-encoder.** The embedding model encodes query and document separately and
compares vectors. A cross-encoder reads them *together*, which is exactly what's needed to
distinguish "rear sway bar **upper**" from "rear sway bar **lower**" — a distinction that is one
token wide and semantically enormous.

**Margin, not just score.** A high top-1 score means something relevant was found. It says
nothing about whether *three other candidates scored just as high*. The margin is what
distinguishes "found it" from "found four of them." For a bolt lookup, the second case must
abstain.

## The position gate in detail

This is the single most important check, because adjacent-bolt confusion is the realistic
failure mode. See [04](04-accuracy-architecture.md) for why scores can't catch it.

```python
AXES = {
    "vertical":  {"upper", "top", "lower", "bottom"},
    "longitude": {"front", "forward", "rear", "back"},
    "lateral":   {"left", "lh", "driver", "right", "rh", "passenger"},
    "radial":    {"inner", "inboard", "outer", "outboard"},
}
OPPOSITES = {"upper": "lower", "front": "rear", "left": "right", "inner": "outer", ...}
```

For each axis the query constrains, the candidate must **not contradict** it. Note the
asymmetry:

- Query says `lower`, candidate says `upper` → **contradiction, blocked**
- Query says `lower`, candidate says nothing → **not a contradiction, allowed**

Silence is not disagreement. Blocking on absence would make the system abstain constantly for no
safety gain, since most fasteners have no position qualifier at all.

Synonyms are normalized (`bottom`→`lower`, `driver`→`LH` on a US-market LHD car — this mapping is
per-platform, stored on `platform`, not hardcoded).

## When it abstains

The candidate list is a feature, not a failure. It shows:

- ranked candidates with their torque specs **already visible** — no second round-trip
- the assembly diagram with each candidate called out
- **nearby fasteners** in the same assembly (recursive CTE over `assembly.parent_id`)
- why it abstained in plain language — "several bolts in this assembly matched"

Your pick is written back as an `alias` row, so the same phrasing resolves directly next time.
This is the loop that makes the system learn *your* vocabulary, which is the actual problem —
you don't know the OEM names, and now you don't have to.

## Thresholds

`T1` and `T_margin` are fit to a labeled eval set, chosen to maximize auto-answer rate **subject
to zero wrong answers**. They are not intuition and not copied from a blog post. See
[08 — Eval Harness](08-eval-harness.md).

They're stored in `config.toml`, not in code, so recalibration after a data change is a
one-line diff.
