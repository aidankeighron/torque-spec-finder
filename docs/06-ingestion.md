# 06 — Ingestion

> **Superseded in part.** This document was written for the original local-first design
> (SQLite + FastAPI + a local LLM). The brief later changed to web-only, and the shipped system
> is a static Next.js site with no backend, no database and no language model — see
> [07 — Stack & Running](07-stack-and-running.md). The *reasoning* below still holds and is why
> the current design looks as it does; the named technologies do not. Where this document and
> [10 — What Testing Found](10-what-testing-found.md) disagree, 10 is correct.

**This is the real project.** The search layer is a few hundred lines. The reason this system
can be trusted and a chatbot can't is entirely in this pipeline.

## Stages

```
register  ->  extract  ->  dual-check  ->  validate  ->  review  ->  embed  ->  supersede
```

### 1. `register-source`

Hash the file (sha256), record publisher, title, revision date, tier. Nothing enters the
database without a `source_id`. There is no path to insert an unattributed spec.

### 2. `extract`

Routed by document type, cheapest-and-most-exact first:

| Input | Method | Error surface |
|---|---|---|
| HTML (GMSI captures) | Structural table parse (`selectolax`) | ~None. Tables are tables. |
| Text PDFs | `pdfplumber` table extraction | Low. Column misalignment. |
| Scanned PDFs | Page render → vision model **and** OCR, independently | Real. Hence stage 3. |

Most C5 FSM PDFs circulating online are text-layer PDFs, so `pdfplumber` carries most of the
load. Scanned pages get the expensive treatment.

### 3. Dual extraction + agreement

For anything not structurally exact, run **two independent extractors** on the same page. A row
only advances if the numbers agree. Disagreement → review queue, flagged with both readings.

Two independent methods making the *same* digit error is far less likely than either making one.

### 4. Automatic validators — the cheap, high-yield win

These run on every row and catch most extraction errors with no human involvement.

**Unit cross-check.** GM prints both units, so every row self-validates:

```
assert abs(value_nm * 0.73756 - value_lbft) <= rounding_tolerance
```

This is the highest-value check in the system. `37 lb ft` misread as `87 lb ft` no longer
matches `50 N·m` and is rejected automatically. Most single-digit OCR errors break the relation.
Free, deterministic, no model involved.

**Plausibility bands by thread size.** An M6 bolt is not 370 lb-ft. Bands are generous — they
catch magnitude errors, not subtle ones.

**Outlier sign-off.** Genuine extremes exist (the C5 pinion nut really is ~370 lb-ft). These
aren't rejected; they're flagged for explicit human confirmation so a real outlier and a decimal
error can't be confused.

**Completeness.**
- Multi-stage specs must have every stage present and ordered
- Torque-to-yield rows must set `reusable = false`
- Angle stages must have `angle_degrees`
- A spec with no `applicability` rows cannot be served

### 5. `review` — the human gate

A local web UI, keyboard-driven:

```
┌──────────────────────────┬──────────────────────────────┐
│  crop of the source page │  parsed row, editable        │
│  (the actual table)      │  validator results           │
│                          │  [A]pprove [E]dit [R]eject   │
└──────────────────────────┴──────────────────────────────┘
                     [Shift+A] approve entire table
```

**Bulk-approve a whole table when all rows pass validators.** This is what makes full-FSM
coverage tractable rather than a month of typing. FSM spec tables are clean and uniform; you're
confirming a table looks right, not transcribing it.

Nothing reaches `human_verified` without passing through here. The API's default policy serves
only `human_verified` or `dual_verified` rows.

### 6. `embed`

Approved rows only. Embeds `canonical_name + aliases + assembly path + position + thread_size`.

**The torque value is never embedded.** There is no path by which indexed content becomes answer
content.

### 7. Supersession pass

Ingest TSBs, link `superseded_by_id`, re-flag affected specs.

This stage is not optional. A 2005 GM bulletin revised the C5 ball-joint torque specs for
1997–2005 — the FSM value is wrong, and every provenance signal on it says "OEM, verified."
That's the most dangerous failure the system can have, and the only defense is ingesting the
bulletins.

## Conflict detection

After each ingest, for every `(fastener_id, vehicle_config_id, stage_no)`:

```
non-superseded specs with differing normalized values
    -> flag ALL of them `conflicting`
    -> API refuses a single answer; shows both with origins
```

Conversely, **agreement promotes**: a spec corroborated by 2+ *independent* sources with
matching values is promoted to tier A. See [02](02-data-sources.md) for what "independent" means.

Most conflicts turn out to be applicability differences (year, trim, RPO). Resolving them
improves the data rather than leaving a standoff.

## Ingest order

Full-FSM coverage is the goal, but it's thousands of rows, so order by what you actually wrench
on. Everything already ingested is fully usable while the rest fills in.

1. Rear suspension *(pilot — proves the pipeline end to end)*
2. Front suspension, wheels, hubs
3. Brakes
4. Driveline — differential, half-shafts, torque tube
5. Engine accessories, intake, exhaust
6. Engine internals
7. Interior, body, electrical

Unlisted hardware falls back to the tier-E generic chart with a clear label — never silently
missing.

## Commands

```bash
uv run torque ingest register   data/sources/c5-fsm-rear-suspension.pdf --tier B
uv run torque ingest extract    <source_id>
uv run torque ingest validate   <source_id>
uv run torque ingest review     <source_id>        # opens the review UI
uv run torque ingest embed
uv run torque ingest supersede  data/sources/tsb-05-03-10-003.pdf
uv run torque ingest conflicts                     # report
```
