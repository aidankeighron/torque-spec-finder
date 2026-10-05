# 11 — Showing Where The Fastener Is

> **Status: Phase A is BUILT.** Phases B-D remain a plan. See [NEXT-STEPS.md](../NEXT-STEPS.md)
> for diagram sources found, and for why an exploded view cannot be auto-mapped to these records.

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

## Phase A — Make the location you already have legible ✅ BUILT

*No new data. Highest value per hour.*

Implemented in [`lib/render/location.ts`](../website/lib/render/location.ts) and
[`components/LocationView.tsx`](../website/components/LocationView.tsx), with 17 unit tests and
4 end-to-end tests. The central invariant — **never narrow further than the data supports** — is
asserted directly: when the source gives no side, both sides light up rather than one being
guessed.

Position used to show as three grey chips (`rear`, `lower`). It is now a **small plan-view car
schematic**, inline SVG, drawn from above with the nose pointing up — the orientation in which
the driver's side of the car appears on the left of the picture, so nothing has to be mentally
rotated. The relevant zone is lit:

```
        ┌───────────────┐
   LH   │  ▓▓       ░░  │     ▓ = highlighted zone
        │  ░░       ░░  │     ░ = rest of car
   RH   │  ░░       ░░  │
        └───────────────┘
          front     rear
```

- Derived entirely from `position` + the assembly path, so it is correct by construction and
  needs no new data.
- One inline SVG, ~2 KB, driven by CSS classes. All 254 fasteners with axes get a specific
  region; the other 454 get the subsystem area **and an explicit note saying that is all the
  source supports**, rather than implying precision that isn't there.
- A spelled-out sentence — *"Rear of the car, lower / underneath, both sides."* — because "LH"
  is ambiguous when you are lying under the car facing backwards, and "inboard" is worth
  expanding to "toward the centreline".

**Not done:** surfacing `alsoListedUnder` ("also listed under Engine Exhaust" is a real
location clue GM gave us for free). It is still in the data and worth adding; it just was not
part of this pass.

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
