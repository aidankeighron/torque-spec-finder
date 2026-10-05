# Torque Spec Finder

Natural-language torque spec lookup that **refuses to guess**.

Ask *"rear shock bottom bolt"* and get the spec, every stage of it, where the number came from,
how confident the system is that it found **your** fastener, and the neighbouring bolts — or an
honest *"I'm not sure which one you mean, pick from these."*

Built for a **2003 base Corvette (C5, LS1)** from GM's own `Fastener Tightening Specifications`
document. A fully segregated **1979 C3** dataset is registered but empty; its research is
archived in [research/c3-1979/](research/c3-1979/README.md).

Static Next.js site. **No backend, no database, no external services, no language model.**

---

## Why this exists

General-purpose AI gets torque specs right most of the time. For a fastener, "most of the time"
is a stripped thread or a wheel leaving the car. The failures that prompted this: a confidently
wrong number, and two contradictory numbers in one answer with no indication which applied.

## The one rule

> **Nothing generative ever produces, repeats, or touches a number. Search only selects which
> stored record you meant. The number is rendered from typed fields by a string template.**

The shipped system goes further than the original design and contains **no language model at
runtime at all** — query understanding is a synonym table plus a deterministic position parser,
so the answer path has no non-deterministic component.

## Two confidence ratings, never blended

| | |
|---|---|
| **Match confidence** | Did we find *your* fastener? Computed per query. |
| **Source confidence** | Where did the number come from? Tier A (OEM, verified) → E. Fixed at ingest. |

"Definitely your bolt, but the number is from a forum" and "straight from GM, but unsure which
bolt" demand different actions. One blended percentage can say neither.

---

## Status

| | |
|---|---|
| Fasteners (C5) | **708** across 52 assemblies |
| Source | GM 2003 Corvette Fastener Tightening Specifications, 30 pages, sha256-pinned |
| Supersessions applied | 5 (two GM bulletins — ball joints ×4, connecting rod bolts) |
| Independently corroborated | 24 values · 3 promoted to tier A |
| Source defects detected | **9 in GM's own document**, surfaced not corrected |
| Unit tests | **87 passing**, incl. the zero-wrong-answers gate |
| End-to-end tests | **32 passing** against the real static build |
| Golden set | 62 queries, 28 deliberate traps · **0 wrong** · 60% auto-answer · 32% abstain · 8% not-found |

## What makes it accurate

- **Unit cross-check at ingest.** GM prints both N·m and lb-ft, so every row self-validates.
  This found **9 genuine defects in the source document** — six are mislabelled units like
  `25 N·m 18 lb in` where 25 N·m is 18.4 lb **ft**. None were auto-corrected; each is shown with
  a "source is internally inconsistent here" banner.
- **Deterministic position gate.** Say "lower" and a candidate marked "upper" cannot be
  auto-answered, whatever it scored. Adjacent-bolt confusion is the only realistic wrong-answer
  mode and the one a similarity threshold is blind to.
- **Unknown-vocabulary gate.** If a third of the words you typed appear nowhere in this
  vehicle's data and have no synonym mapping, it won't answer. Added after the golden set caught
  a C3 "trailing arm pivot bolt" returning a headlamp actuator nut.
- **TSB supersession.** A 2005 GM bulletin revised the C5 ball-joint specs. The manual's value
  is wrong and looks maximally trustworthy. The revised value is served; the stale one is shown
  struck through so you recognise it if you've seen it elsewhere.
- **Multi-stage and torque-to-yield modelling.** LS1 head bolts are 30 N·m → +90° → +90°/+50°
  and single-use. A bare number is itself a wrong answer there.
- **Conflict detection.** Disagreeing values are flagged in the data, so the system *knows* and
  names each origin instead of waffling.
- **Output guard.** Every numeral on screen must exist in the record it came from, or the card
  refuses to render. Deliberately redundant — its first live act was catching a bug in its own
  author's mockup data.
- **Zero-wrong-answers CI gate.** Any wrong answer fails the build. Abstain rate is a UX metric;
  wrong-answer rate is a hard constraint.

See **[10 — What Testing Found](docs/10-what-testing-found.md)** for every defect the tests
caught that inspection missed — including three separate ways the semantic layer could produce a
wrong answer, which no amount of re-reading the code would have revealed.

---

## Run it

```bash
cd website
npm install
npm run dev            # http://localhost:3000
npm run test:all       # typecheck + 87 unit + build + 32 e2e
```

Rebuild the data (only when a source or overlay changes):

```bash
pip install pypdf
python ingest/parse_fsm.py       # PDF text -> data/parsed/
python ingest/build_dataset.py   # parsed + overlay -> website/data/
```

## Deploy

Vercel, framework preset **Next.js**, root directory **`website`**. `output: "export"` means
static files on the CDN — no serverless functions, no env vars, no secrets, free tier.

---

## Documentation

| Doc | |
|---|---|
| [01 — Overview](docs/01-overview.md) | The problem, prior art, end-to-end flow |
| [02 — Data Sources](docs/02-data-sources.md) | Provenance tiers and the agreement rule |
| [03 — Data Model](docs/03-data-model.md) | Why a spec is not `(name, value)` |
| [04 — Accuracy Architecture](docs/04-accuracy-architecture.md) | The rules, the two axes, failure modes |
| [05 — Retrieval & Abstain](docs/05-retrieval-and-abstain.md) | Query pipeline and the gate |
| [06 — Ingestion](docs/06-ingestion.md) | Extraction and validators |
| [07 — Stack & Running](docs/07-stack-and-running.md) | **Current** stack, running, deploying |
| [08 — Eval Harness](docs/08-eval-harness.md) | How accuracy stays measurable |
| [09 — Roadmap](docs/09-roadmap.md) | Phases and non-goals |
| [10 — What Testing Found](docs/10-what-testing-found.md) | **Every defect the tests caught** |
| [11 — Location & Diagrams](docs/11-location-and-diagrams.md) | Showing *where* the fastener is — Phase A built |
| [NEXT-STEPS.md](NEXT-STEPS.md) | Diagram sources, and why callouts need a manual mapping |

Docs 03, 05, 06, 08 and 09 were written for the original local-first design and carry a banner
saying so. Their reasoning is why the current design looks as it does; their named technologies
are superseded by 07.

## Units

Values read **foot-pounds, then inch-pounds, then Newton-metres**, side by side in white.

GM prints only two of those three per row — N·m plus *either* lb-ft *or* lb-in. The third is
converted from the N·m figure at ingest, stored on the record, and marked `≈ converted` on
screen. Converted inch-pound figures above 400 lb-in are suppressed, because no inch-pound
wrench delivers them and a lug nut is not usefully "1239 lb in".

## Known limitations

- **C3 is empty.** Not an oversight — its sources systematically disagree on safety-critical
  fasteners (the upper ball joint nut is cited as 45, 50 **and** 80 lb-ft), and the most-copied
  C3 spec list turns out to be one vendor catalog mirrored four times. Resolving it needs the
  1979 GM shop manual. See [research/c3-1979/](research/c3-1979/README.md).
- **No exploded diagrams yet.** Answers now show a plan-view car schematic with the region lit
  and the location spelled out, which narrows it to a corner of the car. Going further needs a
  real diagram: the source document has no illustrations, and the records carry **no part numbers
  or callout identifiers**, so a parts-catalog diagram cannot be auto-mapped — see
  [NEXT-STEPS.md](NEXT-STEPS.md).
- **Semantic toggle uses concept vectors, not neural embeddings.** It is a real vector space and
  works offline with no download, but it is not a learned sentence embedder. A drop-in hook
  exists for one; the model files are not included.
- **Z06 is not covered** and differs on several suspension and brake specs.
- **Three source defects remain unresolved** — shown with warnings rather than guessed at.

## Non-goals

Automatic ingestion of arbitrary vehicles (no bulk source exists — anyone offering it is
generating numbers) · diagnostics and repair procedures · being a chatbot · always having an
answer.

The target is **never wrong**, not *never silent*.

## Data

`data/sources/` is gitignored — those are copyrighted service documents, kept for personal use
and not redistributed. The baked JSON in `website/data/` **is** committed: it is the product.

**Verify every value against your own manual before turning a wrench.**
