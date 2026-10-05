# 11 — Showing Where The Fastener Is

> **Status: plan, not built.** Nothing in this document is implemented yet.

## The actual problem

The premise of this project is that you know *where* a bolt is but not what GM calls it. The
search side now handles that well. The **answer** side still doesn't: it tells you the name and
the number, and leaves you to confirm you're looking at the right bolt.

That confirmation step is where a wrong torque actually happens. The system can be completely
correct and you can still tighten the wrong fastener.

## What the data already supports

Measured, not assumed:

| Signal | Coverage |
|---|---|
| At least one position axis | **254 / 708** fasteners |
| …front/rear | 195 |
| …upper/lower | 65 |
| …LH/RH | 27 |
| …inboard/outboard | 16 |
| Assembly path (every record) | 708, across 52 assemblies |
| Explicit GM location phrase in the name | **5** ("- at Oil Pan", "- near the Harness Ground") |

So: the assembly path is universal, position axes cover a third, and GM's own prose location
hints are almost nonexistent. **There are no illustrations in the source document at all** — the
Fastener Tightening Specifications PDF is 30 pages of tables. Any diagram has to come from
somewhere else.

That constraint drives everything below.

---

## Phase A — Make the location you already have legible

*No new data. Highest value per hour.*

Right now position shows as three grey chips (`rear`, `lower`). Replace with a **small top-down
car schematic**, hand-drawn as inline SVG, with the relevant zone lit up:

```
        ┌───────────────┐
   LH   │  ▓▓       ░░  │     ▓ = highlighted zone
        │  ░░       ░░  │     ░ = rest of car
   RH   │  ░░       ░░  │
        └───────────────┘
          front     rear
```

- Derived entirely from `position` + the top-level assembly group, so it is correct by
  construction and needs no new data.
- One SVG, ~2 KB, driven by CSS classes. Works for all 254 fasteners with axes; for the other
  454 it shows the subsystem region only (Engine / Chassis / Driveline / Body / Interior).
- Add a **"view from"** line: `rear of car, underneath, driver side` — spelled out rather than
  abbreviated, because "LH" is ambiguous when you're lying under the car facing backwards.

Also in Phase A: surface `alsoListedUnder` (already in the data). "Also listed under Engine
Exhaust" tells you the bolt is reachable while doing exhaust work — a genuine location clue
GM gave us for free.

**Effort: small. Risk: none. Covers: every fastener, at low resolution.**

---

## Phase B — Hand-authored assembly schematics

*The honest version of "a diagram".*

Author a simple SVG per assembly for the subsystems you actually work on, with numbered callout
dots mapped to `fastener.id`. Start with six:

1. Front suspension (control arms, ball joints, shock, sway bar, hub)
2. Rear suspension (same, plus the spring and camber hardware)
3. Brakes — caliper, bracket, bleeder, hose fitting
4. Driveline — differential, half-shafts, torque tube
5. Engine front (balancer, water pump, accessory drive)
6. Engine top (intake, rail, coils, valve covers)

Those six cover roughly 200 fasteners — the ones anyone actually looks up.

**Why hand-drawn rather than sourced:**

- It's fully owned. No licensing question, no redistribution risk, no dead link in two years.
- It's schematic rather than photographic, which is *better* for this job — you need "the lower
  bolt on the inboard side", not a photorealistic render.
- It's tiny (a few KB each) and works offline, which matters for a static site.
- Callouts can be positioned precisely against the parts the data already names.

The schema for this already exists — `figure` and `callout` tables are in
[`db/migrations/001_init.sql`](../db/migrations/001_init.sql) with `bbox` for highlighting. That
was designed in from the start; it just has no rows.

**Effort: moderate and front-loaded — the drawing is the work, the wiring is trivial.**

---

## Phase C — Visual navigation (input side)

Once Phase B schematics exist, invert them: let the diagram be a **way in**, not just a
confirmation.

- Click the rear suspension region → list every fastener in it, each with its spec
- Hover a callout → that fastener's name and torque
- Abstain cards get the diagram with **all tied candidates lit at once**, so instead of reading
  four similar names you see four dots and recognise yours

This is the piece that would most directly solve the original problem. "Rear sway bar bottom
bolt" currently abstains with three plausible candidates — a diagram with three lit dots
resolves that in under a second, where three text labels do not.

---

## Phase D — Real photographs *(optional, highest fidelity)*

Photograph your own car, one shot per assembly, then click to place callouts in a small
authoring tool. Advantages: it is *your* car, with your hardware and your wear, and there is no
licensing question at all. Cost: a Saturday with a camera, and it only works for areas you can
see with the car apart.

Worth doing for the handful of fasteners that are genuinely hard to identify in a schematic —
the rear suspension cluster especially.

---

## What I'd deliberately avoid

**Parts-catalog exploded views** (GM Parts Direct, Zip, Ecklers). Tempting — they're exactly the
right kind of image and they already have callout numbers. But:

- redistributing them on a hosted site is a copyright question I don't want sitting under a
  tool whose entire value proposition is trustworthiness;
- their callout numbering maps to *part numbers*, not to torque specs, so the mapping work is
  nearly as large as drawing a schematic;
- they vanish. Vendor URLs rot faster than anything else in this project.

**AI-generated diagrams.** A generated image of a suspension assembly would be plausible and
subtly wrong, which is the exact failure mode this entire project exists to avoid. A diagram
that misplaces a bolt is worse than no diagram, because it invites confident misidentification.
Not negotiable.

**Inferring position for the 454 fasteners that lack axes.** Guessing that a given bolt is
"probably on the left" from its name would put invented spatial data next to verified torque
data. Those fasteners get the subsystem region and nothing more.

---

## Recommended order

1. **Phase A** — a day's work, improves every single answer, zero risk.
2. **Phase C's abstain-card diagram**, once one or two Phase B schematics exist — it attacks the
   original problem most directly.
3. **Phase B** for the remaining subsystems, in the order you actually wrench on them.
4. **Phase D** only where a schematic proves insufficient.

The useful property of this ordering: Phase A ships something real immediately and the rest
degrades gracefully. A fastener with no schematic still shows its region and its spelled-out
location, rather than a broken image.
