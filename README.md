# Torque Spec Finder

Natural-language torque spec lookup that **refuses to guess**.

Ask *"what's the torque on my rear sway bar bottom bolt?"* and get the spec, where the number
came from, how confident the system is that it found **your** bolt, nearby fasteners, and a
diagram — or an honest "I'm not sure, pick one of these."

Built for a 2003 base Corvette (C5, LS1). The architecture generalizes to any vehicle.

---

## Why this exists

General-purpose AI gets torque specs right most of the time. For a fastener, "most of the time"
is a stripped thread or a wheel leaving the car. Observed failures from a general LLM: a
confidently wrong number, and two contradictory numbers in one answer with no indication which
applied.

## The one rule

> **The LLM never produces, repeats, or touches a number. It only helps choose which database
> row you meant. The number is rendered from typed database columns by a string template.**

A language model cannot emit a wrong torque spec if it is never in a position to emit one. The
LLM sees candidate fastener *names* and returns an enum-constrained verdict. It never sees a
torque value.

## Two confidence ratings, never blended

| | |
|---|---|
| **Match confidence** | Did we find *your* bolt? Computed per query. |
| **Source confidence** | Where did the number come from? Tier A (OEM, verified) → E (generic chart). Fixed at ingest. |

A blended score would hide the distinction that matters. "Definitely your bolt, but the number
is from a forum" and "straight from GM, but we're unsure which bolt" demand different actions.

## What makes it accurate

- **Hybrid retrieval** — BM25 + vector in one SQLite query, with the vehicle as a hard SQL filter
- **Deterministic position gate** — if you said *lower*, a candidate marked *upper* cannot be
  auto-answered, regardless of score. This catches adjacent-bolt confusion, which is the only
  realistic wrong-answer mode and the one a similarity threshold is blind to.
- **Unit cross-check at ingest** — GM prints both N·m and lb-ft, so every row self-validates.
  Catches most OCR digit errors for free.
- **Conflict detection at ingest** — disagreeing sources are flagged in the database, so the
  system *knows* it's a conflict and names each origin instead of waffling.
- **TSB supersession** — a 2005 bulletin revised the C5 ball-joint specs. The manual value is
  wrong and looks maximally trustworthy. Bulletins are first-class.
- **Multi-stage + torque-to-yield modeling** — LS1 head bolts are 22 lb-ft → 90° → 90°/50°, and
  single-use. A bare number is itself a wrong answer there.
- **Output guard** — every numeral in a response must exist in the retrieved record, or the
  request fails closed.
- **Zero-wrong-answers CI gate** — any wrong answer on the golden eval set fails the build.
  Abstain rate is a UX metric; wrong-answer rate is a hard constraint.

## Stack

Fully local. No cloud account, no Docker, **$0/month**.

SQLite (FTS5 + `sqlite-vec`) · `bge-small-en-v1.5` embeddings · `bge-reranker-base`
cross-encoder · Ollama for intent/verification (swappable, optional) · FastAPI · plain HTML.

Models run on CPU. A weaker model can only cause **more abstains, never wrong numbers** — the
degradation is bounded by construction, which is why local is a free choice rather than a
compromise.

## Status

**P0 complete** — design, schema, and UI mockup. No data ingested yet.

| Phase | |
|---|---|
| **P0** Foundation — docs, schema, mockup | ✅ |
| **P1** Pilot ingest: rear suspension | |
| **P2** Retrieval + abstain gate + API | |
| **P3** Eval harness ⚠️ *gates everything after* | |
| **P4** Full C5 ingest | |
| **P5** TSB supersession pass | |
| **P6** Figures + diagram callouts | |
| **P7** Offline PWA *(optional)* | |

## Try the mockup

Open [`website/index.html`](website/index.html) in a browser. Static data, no backend. The state
switcher shows all five cases: confident answer, ambiguous (abstain), source conflict,
superseded-by-bulletin, and multi-stage torque-to-yield.

## Set up the database

```bash
python db/migrate.py            # creates data/torque.db
python db/migrate.py --status   # list applied / pending migrations
```

`sqlite-vec` is optional until P2 — lexical search and the full schema work without it.

## Documentation

| Doc | |
|---|---|
| [01 — Overview](docs/01-overview.md) | The problem, prior art, end-to-end flow |
| [02 — Data Sources](docs/02-data-sources.md) | Where numbers come from, provenance tiers, the agreement rule |
| [03 — Data Model](docs/03-data-model.md) | Schema, and why a spec is not `(name, value)` |
| [04 — Accuracy Architecture](docs/04-accuracy-architecture.md) | The rules, the two axes, failure modes |
| [05 — Retrieval & Abstain](docs/05-retrieval-and-abstain.md) | Query pipeline and the gate |
| [06 — Ingestion](docs/06-ingestion.md) | Extraction, validators, human review |
| [07 — Stack & Running](docs/07-stack-and-running.md) | Local stack, garage use |
| [08 — Eval Harness](docs/08-eval-harness.md) | How accuracy stays measurable |
| [09 — Roadmap](docs/09-roadmap.md) | Phases and non-goals |

## Non-goals

Automatic ingestion of arbitrary vehicles (no bulk source exists — anyone offering it is
generating numbers) · scaling, accounts, multi-tenancy · diagnostics and repair procedures ·
being a chatbot · always having an answer.

The target is **never wrong**, not *never silent*.

## Data

Source documents are copyrighted service manuals, kept in `data/sources/` and gitignored.
Personal use for your own vehicle; not redistributed.
