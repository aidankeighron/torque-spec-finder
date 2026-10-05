# 03 — Data Model

## A spec is not `(name, value)`

The single biggest cause of wrong torque outcomes isn't a wrong number — it's a **correct number
applied wrongly**. The schema exists to make that impossible to represent.

Four things that are all "the right number" and all still failures:

| Situation | What a `(name, value)` row loses |
|---|---|
| LS1 head bolt | It's 22 lb-ft **then 90° then 90°/50°**, and the bolt is **single-use** |
| Rear sway bar / control arm bolt | Must be torqued **at curb height**, not hanging |
| C5 ball joint | FSM value was **superseded by a 2005 TSB** |
| Any lubricated fastener | Dry vs. lubed changes the clamp load substantially |

Every one of those is a first-class column below.

## Why one SQLite file instead of three databases

A whole C5 FSM is a few thousand fastener rows. One hundred vehicles would still be well under a
million. This is a small-data problem wearing a big-data costume.

- **Vector** → `sqlite-vec`, same file. Semantic ranking and the hard vehicle filter happen in
  **one query**. A separate vector store forces retrieve-then-filter, which silently drops
  correct matches when the filter is selective. Co-locating is simpler *and* more accurate.
- **Lexical** → SQLite **FTS5 has BM25 built in**. No Elasticsearch.
- **Graph** → unnecessary. The FSM already encodes adjacency: every fastener belongs to one
  assembly section and one figure. "Nearby bolts" = siblings in the assembly tree + co-members of
  the same diagram. One self-referencing FK, one recursive CTE. **Inferred spatial adjacency
  would be less accurate than the manual's own grouping.**

One file, no server. The `.db` file *is* the product — rebuild it when you add a vehicle, copy
it where you want it.

## Schema

Full DDL in [`db/migrations/001_init.sql`](../db/migrations/001_init.sql). Shape:

### Sources and vehicles

```sql
source(id, kind, title, publisher, revision_date, tier, file_path, sha256)

platform(id, name)                              -- 'C5 Corvette'
vehicle_config(id, platform_id, year, model, trim,
               engine_rpo, trans_rpo, drive, notes)
  -- 2003 / Corvette / Base / LS1 / MN6 / RWD
```

`vehicle_config` is the unit the UI selects and every query filters on. RPO codes matter on a
C5 — Z51, F45 selective ride, MN6 vs. M30 — and they change hardware.

### Assemblies and fasteners

```sql
assembly(id, platform_id, parent_id, name, path, aliases)
  -- Chassis > Rear Suspension > Stabilizer Bar
  -- the tree IS the "nearby bolts" feature

fastener(id, assembly_id, canonical_name, position, qty,
         thread_size, reusable, notes)
```

- `canonical_name` — **verbatim from the source**, never paraphrased
- `position` — `LH/RH`, `upper/lower`, `inboard/outboard`, `front/rear`; powers the
  deterministic position gate in [05](05-retrieval-and-abstain.md)
- `reusable` — `false` for torque-to-yield; drives the single-use warning

### The spec itself

```sql
torque_spec(
  id, fastener_id, source_id,

  stage_no, stage_kind,              -- multi-stage: torque | angle | torque_then_angle
  value_primary,   unit_primary,     -- exactly as printed:  50  'N·m'
  value_secondary, unit_secondary,   -- exactly as printed:  37  'lb ft'
  angle_degrees, tolerance,

  sequence_note,                     -- 'in the sequence shown in fig 3'
  precondition,                      -- 'vehicle at curb height', 'threads clean and dry'
  threadlocker,

  provenance_tier, verbatim_quote, source_locator,
  verification_status,               -- pending | machine_extracted | dual_verified
                                     --   | human_verified | conflicting | superseded
  superseded_by_id,                  -- FK -> torque_spec.id   (TSB supersession)
  effective_from, effective_to
)
```

**Both printed units are stored verbatim and never re-derived.** The display shows what the
manual shows. The `N·m × 0.7376 ≈ lb-ft` relation is used *only as a validator* at ingest, never
to compute a served value. This matters: rounding in the manual is authoritative, and a value we
computed ourselves is a value we could have computed wrong.

`verbatim_quote` + `source_locator` mean every answer can show the original sentence and where
it came from. That's what makes the system auditable instead of merely confident.

### Applicability

```sql
applicability(torque_spec_id, vehicle_config_id)
```

**Expanded at ingest, never inferred at query time.** A spec covering 1997–2004 across all trims
becomes explicit rows for every matching `vehicle_config`. Query time is then a plain
`WHERE vehicle_config_id = ?` — no reasoning about fitment at the moment it matters, and one C5
ingest covers ~8 model years at once.

### Diagrams and learned slang

```sql
figure(id, assembly_id, source_id, image_path, caption)
callout(id, figure_id, fastener_id, number, bbox)   -- highlight the specific bolt
alias(id, fastener_id, text, kind)                  -- your slang, learned over time
```

Every time the system abstains and you pick from the candidate list, your phrasing is written
back as an `alias` row. The system gets better at *your* vocabulary specifically — which is the
whole problem, since you don't know the OEM names.

### Search indexes — same file

```sql
fastener_fts  USING fts5(indexed_text, content='fastener')     -- BM25
fastener_vec  USING vec0(fastener_id INTEGER PRIMARY KEY,
                         embedding float[384])                 -- sqlite-vec
```

`indexed_text` = `canonical_name + aliases + assembly path + position + thread size`.
**The torque value is never embedded or indexed** — there is no path by which search content can
become answer content.

## Conflict detection happens at ingest

If two non-superseded specs for the same `(fastener_id, vehicle_config_id, stage_no)` disagree
after normalization, **both** are flagged `conflicting` and the API refuses to serve a single
answer.

This is checked when data is written, not when a question is asked — so the conflict is a known
property of the database rather than a surprise discovered mid-answer.
