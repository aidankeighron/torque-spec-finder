# 07 — Stack & Running

> **This document was rewritten.** Earlier drafts described a local Python +
> SQLite + FastAPI + Ollama design. The brief changed to web-only, so the
> shipped app is a **static Next.js site with no backend, no database and no
> external services**. The ingest pipeline is still Python, but it runs at
> author time only and its output is baked into the bundle.

## Shape of the thing

```
  ingest (Python, author-time, run by you)
     FSM PDF  ->  parse_fsm.py  ->  build_dataset.py  ->  website/data/*.json
                                          ^
                                   overlays/*.json  (TSBs, corroboration, aliases)

  website (TypeScript, static, what users touch)
     next build --output export  ->  out/   ->  Vercel CDN
```

Nothing executes on a server at request time. A user's browser downloads HTML,
JS and the baked JSON, and every search runs locally in the tab.

## Runtime stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16**, `output: "export"` | Fully static. No API routes, no SSR, no edge functions. |
| UI | React 19, plain CSS | No component library, no CSS framework, no build-time theming. |
| Data | **Baked JSON** imported statically | `website/data/c5-2003-base.json` is ~1 MB and becomes part of the bundle. No database, no fetch. |
| Lexical search | Hand-written BM25 (`lib/search/lexical.ts`) | ~120 lines. Needed because fastener queries live on exact tokens: `M11`, `LH`, `M10x1.5`. |
| Vocabulary | Synonym table (`lib/search/synonyms.ts`) | The component that actually makes natural language work. You say "sway bar"; GM wrote "Stabilizer Shaft". |
| Fuzzy | Character-trigram Jaccard | Typo and spacing tolerance: "swaybar", "stabalizer". |
| Semantic | **Concept vectors** (`lib/search/embeddings.ts`) | Optional toggle. See below. |
| Deciding | Abstain gate (`lib/search/engine.ts`) | Thresholds + position gate + unknown-vocabulary gate. |
| Rendering | Templates over typed fields (`lib/render/format.ts`) | Plus the output guard in `lib/render/guard.ts`. |
| Tests | Vitest + Playwright | 57 unit, 21 end-to-end against the real static export. |

**No LLM is involved at runtime, at all.** The earlier design used one for
intent parsing and verification; the synonym table plus the deterministic
position parser do that job here, which removes the last non-deterministic
component from the answer path.

## The semantic toggle, honestly described

The toggle is labelled "Semantic boost" and is **off by default**. It uses
**concept vectors**, not neural embeddings: every synonym group becomes one
dimension of a ~100-dimensional space, a fastener and a query are both
projected into it, and cosine similarity measures shared *concepts* rather
than shared tokens.

That is a real vector space with real cosine similarity, and it needs no
download and no WebGPU. It is **not** a learned sentence embedding and is not
described as one anywhere in the UI.

A hook exists for upgrading to a real ONNX sentence embedder: if a script
registers `window.__torqueEmbedder` with `{dims, embed()}`, the app probes it
and uses it instead. Nothing in the bundle depends on it, so adding model files
to `public/` is purely additive. **Those files are not currently included** —
the toggle works today with concept vectors.

### Why the semantic layer cannot cause a wrong answer

This is enforced structurally, not by intention:

- the semantic score is **absent from the rerank sum** — it only contributes a
  ranking to the RRF candidate-generation stage
- BM25 is normalised against **all documents**, not the candidate pool, so pool
  membership cannot rescale anyone's score
- the candidate pool is the fused leaders **unioned with** the lexical leaders,
  so the lexical-only pool is always a subset of the semantic pool

Together those mean enabling the toggle can only ever *add* candidates. Adding
candidates can shrink the top-1/top-2 margin and cause an **abstain**; it
cannot remove or reorder the right answer.

All three properties were added in response to test failures, not foresight.
See [10 — What Testing Found](10-what-testing-found.md).

## Running it

```bash
cd website
npm install
npm run dev          # http://localhost:3000
```

Full verification, in the order CI should run it:

```bash
npm run typecheck    # tsc --noEmit
npm run test         # vitest: 57 tests, incl. the zero-wrong-answers gate
npm run build        # static export to out/
npm run test:e2e     # playwright against the built output
# or all four:
npm run test:all
```

## Rebuilding the data

Only needed when a source document or overlay changes:

```bash
pip install pypdf
python ingest/parse_fsm.py        # PDF text -> data/parsed/*.json
python ingest/build_dataset.py    # parsed + overlay -> website/data/*.json
```

`parse_fsm.py` reports its own health every run — rows parsed, rows needing
review, and the N·m ↔ lb-ft cross-check breakdown. `build_dataset.py` warns
loudly if an overlay entry matches no fastener, which is how four stale
`matchName` values were caught.

## Deploying to Vercel

Framework preset **Next.js**, root directory **`website`**. Everything else is
default. Because `output: "export"` is set, Vercel serves static files from the
CDN — there are no serverless functions, so cold starts and function limits do
not apply, and the free tier is comfortable.

No environment variables. No secrets. No external service to configure, which
also means nothing to leak and nothing to bill.

## Costs

| Item | Cost |
|---|---|
| Hosting | $0 — static files on Vercel's free tier |
| Database | none exists |
| Search | $0 — runs in the user's browser |
| Semantic layer | $0 — concept vectors, computed locally |
| LLM | none at runtime |
| Data | $0 — the FSM document was supplied; research used free sources |

## Repository layout

```
torque-spec-finder/
  docs/            this documentation set
  ingest/          parse_fsm.py, build_dataset.py, overlays/
  data/            sources/ (gitignored), parsed/
  research/
    c3-1979/       archived C3 research — paused, see its README
  website/
    app/           layout.tsx, page.tsx, globals.css
    components/    AnswerCard.tsx, Results.tsx
    lib/
      types.ts     dataset + result shapes
      registry.ts  vehicle registry and the segregation assertions
      search/      lexical.ts, synonyms.ts, position.ts, embeddings.ts, engine.ts
      render/      format.ts, guard.ts
    data/          baked datasets (committed — they ARE the product)
    tests/         vitest: position, guard, dataset, golden
    e2e/           playwright
  db/              legacy SQLite schema from the local-first design, kept for
                   reference; NOT used by the website
```

### On `db/`

`db/migrations/001_init.sql` and `db/migrate.py` are from the original
local-first design. They still apply cleanly and their schema documents the
data model well, but the website does not use them. They are kept because the
C3 ingest may want a staging database for conflict resolution, where the
relational constraints earn their place. Nothing in `website/` imports them.
