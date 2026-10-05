# 09 — Roadmap

> **Superseded in part.** This document was written for the original local-first design
> (SQLite + FastAPI + a local LLM). The brief later changed to web-only, and the shipped system
> is a static Next.js site with no backend, no database and no language model — see
> [07 — Stack & Running](07-stack-and-running.md). The *reasoning* below still holds and is why
> the current design looks as it does; the named technologies do not. Where this document and
> [10 — What Testing Found](10-what-testing-found.md) disagree, 10 is correct.

## Phases

### P0 — Foundation ✅

- `docs/` — this documentation set
- `db/migrations/001_init.sql` + `db/migrate.py`
- `website/` — static mockup of all five UI states, mock data, no backend

Deliverable: the design is written down and the UI is agreed before any data work.

> **Status note.** The brief changed mid-build from a local-first tool to a web-only static site,
> and the uploaded FSM document let the C5 ingest jump straight to full coverage. Actual delivery
> order was: P0 → full C5 ingest → retrieval + gate → eval harness → E2E. The C3 is paused with
> its research archived in [`research/c3-1979/`](../research/c3-1979/README.md).

### P1 — Pilot ingest: rear suspension

One section, end to end: extract → dual-check → validators → review UI → approved rows.

~40 fasteners. Proves the whole pipeline on the exact subsystem from the motivating example, and
shrinks the risk in P4 to near zero.

Deliverable: real, human-verified tier-A rows in `torque.db`.

### P2 — Retrieval and the gate

FTS5 + `sqlite-vec` + RRF + cross-encoder + the abstain gate + FastAPI endpoints.
Wire `website/` to the real API, replacing mock data.

Deliverable: ask a real question about rear suspension, get a real answer or a real abstain.

### P3 — Eval harness ⚠️ *gates everything after it*

Golden set, `run_eval.py`, `calibrate.py`, CI wiring.

**Nothing after this point ships without passing the zero-wrong-answers gate.** Building this
before the bulk ingest means P4 can proceed quickly and safely, because every batch gets
measured.

Deliverable: calibrated thresholds in `config.toml` and a failing build on any wrong answer.

### P4 — Full C5 ingest

Remaining subsystems in use-order ([06](06-ingestion.md)):
front suspension/wheels → brakes → driveline → engine accessories → engine internals →
interior/body/electrical.

This is the long phase, but it's mechanical and safe — nothing reaches the answer path without
clearing validators, review, and the eval gate.

Deliverable: full-FSM coverage for the C5.

### P5 — Supersession pass

Ingest TSBs, link `superseded_by_id`, supersession banners.

Not optional. The ball-joint case ([01](01-overview.md), finding #2) is a stale FSM value that
looks maximally trustworthy by every other signal.

### P6 — Figures and callouts

Extract diagrams, map `callout` bounding boxes to fasteners, highlight the specific bolt on the
answer card and in candidate lists.

This is where "I don't know what it's called, but it's *that one*" finally closes.

### P7 — Offline PWA *(optional)*

Package as a PWA with `torque.db` bundled — SQLite WASM + in-browser query embedding. Fully
offline on the phone, no laptop needed in the garage.

Packaging exercise, not an architecture change. Worth doing once the data justifies it.

## Critical path

```
P0 ──> P1 ──> P2 ──> P3 ──> P4 ──> P5
                      │
                      └─ the gate. everything downstream depends on it.

P6, P7 are independent and can land any time after P2.
```

P1–P3 are the real engineering. After P3, the remaining work is volume, not difficulty.

## Explicit non-goals

- **Automatic ingestion of arbitrary vehicles.** No bulk source exists. Anyone offering this is
  generating numbers. See [02](02-data-sources.md).
- **Scaling, multi-tenancy, accounts.** Personal tool. SQLite on one machine is the right answer
  and will remain so.
- **Repair procedures, diagnostics, parts lookup.** Adjacent and tempting; each one dilutes the
  single thing this does correctly.
- **Being a chatbot.** Conversational framing invites generated numbers. The interface is a
  search box and an answer card, deliberately.
- **Always having an answer.** The target is *never wrong*, not *never silent*.
