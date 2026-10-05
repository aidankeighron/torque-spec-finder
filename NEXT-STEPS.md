# Next Steps — Diagrams

Picking up from [docs/11 — Location & Diagrams](docs/11-location-and-diagrams.md).
**Phase A is built.** This file covers what comes after, and answers the question that
determines whether the exploded-view route works at all.

---

## First, the honest answer: no, there is no bolt-number mapping

I audited every record. The result:

| Identifier | Records that have it |
|---|---|
| GM part number | **0 of 708** |
| Figure or callout reference | **0 of 708** |
| Quantity | **0 of 708** |
| Thread size | **5 of 708** — and only incidentally, inside the prose name ("Oil Pan **M8** Bolts") |

A fastener record carries exactly this:

```
id · name · assembly · position · stages · warnings · provenance · conflict · sourceDefects
```

No part number. No callout index. The `provenance.pages` field points at the **table page** the
spec was read from, not at a figure.

That is not an oversight in my ingest — it is what the source document is. The
`Fastener Tightening Specifications` PDF is 30 pages of flat tables: a name and a torque, and
nothing else. It contains **no illustrations at all**.

## So can an exploded view give me red circles automatically?

**Not automatically, no.** Here is the shape of the problem.

An exploded view carries:

```
callout number  →  GM part number  →  part description
      7                11609365       "NUT, Front Stabilizer Shaft Link"
```

My data carries:

```
fastener name                      →  torque
"Stabilizer Shaft Link Nuts"          72 N·m / 53 lb ft
```

The only possible join is **description text ↔ fastener name**, and the two use different
vocabularies. The parts catalog writes `NUT,HEX M10X1.5` or `NUT, Front Stabilizer Shaft Link`;
the service manual writes `Stabilizer Shaft Link Nuts`. One is a procurement description, the
other is a service-procedure description, and they were written by different departments for
different purposes.

A fuzzy text join across those, on data where a mismatch means you torque the wrong bolt, is
exactly the thing this project refuses to do. It would reintroduce guessing at the one place the
whole architecture is built to exclude it.

## But a *manual* mapping works, and it is tractable

This is the good news, and it is better than it sounds.

The schema was built for it on day one —
[`db/migrations/001_init.sql`](db/migrations/001_init.sql) already has:

```sql
figure(id, assembly_id, source_id, image_path, caption)
callout(id, figure_id, fastener_id, number, bbox)   -- bbox = [x, y, w, h] normalised 0-1
```

`callout.bbox` is literally "where to draw the red circle". The table has no rows; nothing else
is missing.

**The work is one-time authoring, not engineering:**

1. Get a diagram for an assembly (sources below).
2. Open a small click-to-place tool — build once, ~150 lines.
3. For each fastener in that assembly, click where it is on the image.
4. The click writes a `callout` row with the normalised bbox.

Each click is a human looking at a picture and confirming "yes, that's the lower link nut".
That is a *verified* mapping, which is what the accuracy bar requires, and it is the only honest
way to get there.

**Scope:** the six assemblies worth doing cover roughly 200 fasteners. At a few seconds per
click with the fastener list beside the image, that is an evening or two — not a project.

The remaining ~500 are interior trim screws, HVAC ducting and body panel fasteners. Those keep
the Phase A region view, which is genuinely adequate for "the screw behind the ashtray".

---

## Diagram sources — what I found and what I think of each

### 1. Scanned GM C5 Parts Manual ⭐ strongest lead

- **1997–2002**, 1348 scanned pages, 124 MB — `shelor.net/Z/CorvetteForum/Docs/C5-PartsManual/`
- Also a smaller 1997–2001 edition, 856 pages, 46 MB

This is the GM illustrated parts catalog: exploded views with numbered callouts and part numbers,
which is exactly the artifact needed.

**Caveats, and they matter:**
- Delivered as `.part01.exe` + `.rar` split archives. **I did not download these** — a
  self-extracting executable from a personal file host is not something to run, and I would
  suggest the plain `.zip` instead if you pursue it.
- Scanned pages, so the diagrams are raster images. Fine for display and click-to-place; useless
  for automated text extraction.
- Copyright sits with GM. Fine for your own use; do not ship the images on a public URL.

I'd call this the best available option, with the `.zip` and a virus scan.

### 2. Keen Parts diagram catalog

`keenparts.com/diagram-category/suspension/` — live, organised by subsystem, clean vector-ish
diagrams. Easy to view, but they are a vendor's catalog images: hotlinking is rude, downloading
and republishing is a copyright question, and vendor URLs rot faster than anything else in this
project.

Usable as a **drawing reference** for authoring your own schematics. Not as shipped assets.

### 3. `parts.nalleygmc.com` / `gmpartsdirect.com` / `7zap.com`

Live GM parts catalogs with exploded views and VIN lookup. Same assessment as Keen: excellent
for *looking things up*, not something to embed.

7zap is worth knowing about as a free browsable catalog if you just want to identify a part.

### 4. Dead ends, recorded so nobody re-checks them

- `davidfarmerstuff.com/C5-PartsManual.pdf` — returns a 195-byte placeholder page. The domain
  still resolves but the file is gone. (Same David Farmer whose torque sheet corroborates several
  of our values — the host, not the data, is what died.)
- **C5-generation AIM (Assembly Instruction Manual)** — NCRS reprints appear to stop around 1982.
  The AIM is the ideal document for this (it is literally assembly illustrations), but it does
  not seem to exist in reprint for the C5.
- No open-licensed automotive exploded-diagram API exists. The one aggregator API I found
  explicitly disclaims manufacturer affiliation and limits itself to reference use.

### 5. Your own photographs

Still the option I would rank second, and first for the rear suspension cluster specifically.
No licensing question at all, it is *your* car with your hardware, and a photo of the actual
bolt removes every remaining ambiguity. Cost is a Saturday with a camera and the car on stands.

---

## What I would do, in order

1. **Use Phase A for a while first.** It may be enough more often than expected. The gap it
   leaves will tell you precisely which assemblies actually need a diagram, which beats guessing
   the list up front.
2. **Build the callout authoring tool** (~150 lines: image, fastener list, click to place, write
   JSON). Needed by every later option, so it is never wasted.
3. **Author the rear suspension first** — it is the assembly behind the original question, it is
   where the abstains cluster, and it is the hardest to identify by name alone.
4. **Then the abstain-card diagram** (Phase C in docs/11). Three lit dots resolve "rear sway bar
   bottom bolt" in a second; three text labels do not. This is the single highest-value feature
   left in the project.
5. Fill in the other five assemblies as you work on them.

## Two things I would not do

**Auto-match callouts to fasteners by text similarity.** Covered above — it is the one shortcut
that would undermine the thing the project is for.

**Generate diagrams with AI.** A generated suspension diagram would be plausible and subtly
wrong, which is strictly worse than no diagram: it invites confident misidentification of
exactly the bolt you were unsure about. A hand-drawn schematic that is crude but correct beats a
beautiful one that puts the shock mount in the wrong place.
