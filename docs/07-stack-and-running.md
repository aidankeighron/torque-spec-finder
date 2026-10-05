# 07 — Stack & Running

## Fully local. No cloud account, no Docker, no server to manage. $0/month.

| Layer | Choice | Why |
|---|---|---|
| Language | Python 3.12, `uv` | One toolchain for ingest, API, and eval |
| Database | **SQLite**, single `torque.db` file | No server. The file *is* the product. |
| Lexical search | **FTS5** (built into SQLite) | Real BM25, zero dependencies |
| Vector search | **`sqlite-vec`** | One pip install, same file, filters in-query |
| Embeddings | **`bge-small-en-v1.5`** via `fastembed` | ONNX, CPU, ~130 MB, no PyTorch |
| Reranker | **`bge-reranker-base`** cross-encoder, ONNX | The real ranking work; strong on short-text pairs |
| LLM (intent + verifier) | Pluggable — **Ollama** default | Offline. Fails closed to abstain. |
| API | FastAPI, local only | Also runs unchanged on Cloud Run if ever wanted |
| Frontend | Plain HTML + CSS + vanilla JS | No build step, no framework, no churn |
| Migrations | Numbered `.sql` files + ~30-line runner | Alembic is overkill for one file |
| Images | Plain files in `data/figures/` | Served by the local app |

### On model sizes

Fastener names are short strings. A small embedding model is genuinely sufficient for
**candidate generation**, which is all embeddings do here — the cross-encoder does the ranking
and the gate does the deciding.

And per [04](04-accuracy-architecture.md): a weaker model can only cause **more abstains, never
wrong numbers**. The degradation is bounded by construction, which is what makes going local a
free choice rather than a compromise.

### The LLM is swappable

```toml
[llm]
backend = "ollama"          # "ollama" | "gemini" | "anthropic" | "none"
model   = "qwen3:8b"
```

- `ollama` — fully offline, default
- `gemini` / `anthropic` — set a key; pennies/month at personal volume
- `none` — skips the verifier entirely, so **every** query returns a candidate list

`none` is a legitimate mode. The system is still fully useful without any LLM — you just always
pick from a ranked list. Nothing about correctness depends on the model being good.

## Setup

```bash
uv sync
uv run python db/migrate.py          # creates data/torque.db
uv run torque serve                  # http://localhost:8000
```

First run downloads the two ONNX models (~200 MB total), then never touches the network again
unless you choose a cloud LLM backend.

## Using it in the garage

### Now — phone over Wi-Fi

```bash
uv run torque serve --host 0.0.0.0
```

Open `http://<your-pc-ip>:8000` on your phone, same network. Zero deploy, zero cost, works
immediately. This covers the normal case: car in the garage, PC in the house.

### Later — offline PWA on the phone

The same app packages as a PWA with `torque.db` bundled: SQLite compiles to WASM, and query
embedding runs in-browser via `transformers.js`. Fully offline, no server, no laptop.

Worth doing once the data is built out — not before. It's a packaging exercise, not an
architecture change.

### Optional — reachable away from home

The FastAPI app runs unchanged on Cloud Run (scales to zero, free tier covers personal use).
Not required and not part of the plan; noted so the door stays open.

## Adding a vehicle

```bash
uv run torque ingest register data/sources/<manual>.pdf --tier B
# ... extract / validate / review / embed  (see 06)
```

Then copy the new `torque.db` wherever you use it. That's the whole update story — one file.

## Repository layout

```
torque-spec-finder/
  docs/        this documentation set
  db/          migrations/001_init.sql ... , migrate.py
  ingest/      sources/, extractors/, validators/, review_ui/
  api/         main.py, retrieval/, render/, guards/, llm/
  eval/        golden.yaml, run_eval.py, calibrate.py
  website/     index.html, styles.css, app.js, mock-data.js
  data/        torque.db · sources/ (gitignored) · figures/
  config.toml  thresholds, LLM backend, serving policy
```

## Running costs

| Item | Cost |
|---|---|
| Hosting | $0 — runs on your machine |
| Database | $0 — SQLite |
| Embeddings | $0 — local ONNX |
| Reranking | $0 — local ONNX |
| LLM | $0 with Ollama; pennies/month if you opt into a cloud key |
| Data | $0 from free sources; optional $20 one-time ACDelco TDS window |

Within the stated budget with room to spare, and nothing recurring.
