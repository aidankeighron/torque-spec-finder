# 02 — Data Sources

## The blunt answer

**No clean structured torque dataset exists to download, for any car. There is no public API.**

The data exists as *documents* — factory service manuals, service bulletins, spec tables. Every
commercial product in this space (ALLDATA, Mitchell 1, FastSpecs, MOTOR) is a company that
licensed those documents and parsed them. There is no shortcut and no free database to import.

So the build is: **collect documents → extract → verify → store with provenance.**

This is why the ingestion pipeline ([06](06-ingestion.md)) is the real project, and the search
layer is comparatively easy.

## Provenance tiers

Every stored spec carries a tier, assigned at ingest, fixed at query time.

| Tier | Meaning | Served? |
|---|---|---|
| **A** | OEM FSM or TSB, human-verified — **or** corroborated by 2+ independent sources with matching values | Yes |
| **B** | OEM FSM, machine-extracted, all validators passed, not yet human-reviewed | Yes, labeled |
| **C** | Licensed secondary (ALLDATA / Chilton / Haynes derived) | Yes, labeled |
| **D** | Community (forum spec sheets, wiki pages) | **Never served alone** — corroboration only |
| **E** | Generic fastener chart by thread size + grade | Yes, explicitly labeled *not vehicle-specific* |

The API's default policy serves only rows that are `human_verified` or `dual_verified`. Tier is
displayed on every answer; it is never averaged into a single score.

## Sources for the C5

Budget is free-first, under ~$20/yr. That constraint is satisfiable because the C5 is old enough
that its documentation circulates widely.

| Source | Cost | Tier | Role |
|---|---|---|---|
| C5 FSM PDFs located online | $0 | B → A after review | **Primary corpus**, all subsystems |
| Corvette Action Center TSB archive | $0 | A | **Supersessions** — critical, see finding #2 in [01](01-overview.md) |
| NHTSA TSB / recall API | $0 | A | Free structured bulletin metadata, cross-reference |
| CorvetteForum / LS1Tech "all specs on one page" sheets | $0 | D | Corroboration only |
| Generic GM fastener chart (thread size + grade) | $0 | E | Labeled fallback for unlisted hardware |
| ACDelco TDS — GM's own GMSI, what ALLDATA licenses | $20 / 3 days | A | *Optional:* spot-check the ~50 highest-stakes fasteners |
| ALLDATA DIY, single vehicle | ~$20/yr | C | *Optional:* second independent source |

### Note on the paid options

Neither is required. They are listed because they're the cheapest route to a genuinely
independent second opinion, and because ACDelco TDS is unusually good value: **$20 for 3 days**
of GM's actual service information, covering Corvettes back to 1998, delivered as HTML pages
with real `Fastener Tightening Specifications` tables. HTML parses exactly — no OCR error
surface at all. If you ever want to harden the ~50 fasteners that could hurt you (suspension,
brakes, wheels, driveline), one $20 window is enough.

## The agreement rule — the main accuracy mechanism

Without a single authoritative subscription, **corroboration replaces authority**:

- A spec confirmed by **2+ independent sources** with matching normalized values is promoted
  to **tier A**.
- Sources that **disagree** flag the spec `conflicting`. The API then refuses to serve a single
  answer and shows both values with their origins.

This is what turns "I found four copies of the C5 manual online" from redundancy into the
primary accuracy mechanism — and it's why collecting all the source *types* above is worth the
effort, even the free ones you'd otherwise dismiss.

Two sources are "independent" only if they don't derive from the same upstream. Two scans of the
same FSM are one source. An FSM plus an ALLDATA page plus a TSB are three.

## Conflicts are usually a data bug, not a contradiction

In practice, most apparent conflicts turn out to be **applicability differences** — a value that
changed mid-year, or differs by trim, or by RPO option. Chasing each conflict down improves the
`applicability` data rather than leaving an unresolvable disagreement.

That's the structural fix for the "it gave me two contradicting options" failure: the system
*knows* it's a conflict, names each origin, and the resolution process makes the database better
instead of leaving you to guess.

## Scaling to other vehicles — the honest answer

**Auto-adding arbitrary cars is not achievable at this accuracy bar**, because no bulk source
exists to add them *from*. Anyone claiming otherwise is generating numbers.

Onboarding is per-vehicle: collect that car's manual, run the pipeline, review. What makes it
cheap:

- the **review tooling** (bulk-approve a whole validated table in one keystroke)
- **`applicability` expansion** — one C5 ingest already covers 1997–2004 across trims, so you get
  ~8 model years from one pass

The durable asset is the verification pipeline, not the row count.

## Legal note

Personal use of your own car's service manual is ordinary. Don't redistribute the corpus —
`data/sources/` is gitignored for that reason. If this ever became a product, it would need a
real data license (MOTOR, ALLDATA, and Mitchell 1 all license B2B).
