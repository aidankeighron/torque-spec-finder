# C3 1979 — Ingest Plan (for when work resumes)

The C5 pipeline does not transfer directly. This file records what has to change and why.

## What the C5 pipeline assumes that is false for the C3

| C5 assumption | C3 reality |
|---|---|
| One authoritative GM document | ~40 third-party sources, systematically disagreeing |
| Source prints **both** N·m and lb-ft, so every row self-validates | Almost everything is lb-ft only. **The single highest-value automatic validator is unavailable.** |
| A row is a `(name, value)` pair in a clean table | Many are prose inside a procedure, or an adjustment sequence with no torque target |
| Independent sources are genuinely independent | The most-copied list is one vendor catalog mirrored four times |
| Most records resolve to an answer | Most records will correctly resolve to `conflicting` |

## Replacement validators

Losing the unit cross-check is the big one. Substitutes:

1. **Thread-size plausibility bands** (already designed, never implemented). The C3 data gives
   thread sizes far more often than the C5 did — `7/16-20`, `3/8-16`, `11/16-16`, `1/2-20`,
   socket sizes. This becomes the primary automatic check instead of the secondary one.
   It would have caught, unaided: the 165 lb-ft oil pan bolt, the 20 lb-ft lower ball joint nut,
   the 85 lb-ft 1/2-20 balancer, and the 1/2-20 oil pan entry.
2. **Cross-source spread check.** Flag any fastener whose sourced values span more than ~1.5×.
   That single rule surfaces nearly every entry in
   [conflicts-and-suspect.md](conflicts-and-suspect.md) Part 3 automatically.
3. **Lineage de-duplication, applied before any agreement rule.** Collapse the Van Steel mirrors
   to one source. Without this the agreement rule manufactures tier A out of an echo.
4. **Unit-magnitude check.** lb-in vs lb-ft confusion is the dominant failure mode in this corpus
   (oil pan 165, sway bar 126 lb-in vs 20 lb-ft, valve cover 3 lb-ft vs 55 lb-in). Flag any
   value that becomes plausible for its thread size only after a ×12 or ÷12 conversion.

## Schema additions needed

The current `Fastener` type in [`website/lib/types.ts`](../../website/lib/types.ts) covers
stages, warnings, provenance, conflict and supersession. The C3 needs three more things:

### 1. A `procedure` record kind

For fasteners where the answer is a sequence, not a number. Required for at least:

- Front wheel bearing — torque 12 lb-ft while spinning → back off → hand-snug → loosen to cotter
  pin → **verify end play 0.001–0.005 in**
- Rear spindle bearing — shimmed, **end play 0.001–0.008 in**, shims 0.097–0.145 in in 0.003 steps
- Pinion nut — tighten incrementally until **rotating preload** 20–30 lb-in (new) / 5–15 lb-in (used)
- Rocker arm nuts — "zero lash plus 1/2 turn"

Returning a bare number for any of these is a wrong answer even if the number is cited.

### 2. `threadCondition` on a stage

The C3 sources are explicit and disagree about this, and it changes clamp load materially:
`dry` · `oiled` · `anti-seize` · `sealant` · `thread-locker`. Summit states its values assume
light engine oil on threads and bolt head underside; the brake sources state theirs are dry and
that lubricant requires reducing the value. A value without its thread condition is ambiguous.

### 3. `maintenanceNote`

Distinct from a precondition — advice that applies after assembly. Needed for Chilton's:
*"The carrier support bracket bolts frequently work loose, causing vibration and rear axle hop.
Periodic torquing of these four bolts will eliminate this problem."*

### 4. A per-source `lineage` field

So the agreement rule can collapse mirrors. `sourceIds` is not enough; two ids can share a lineage.

## Tier mapping for this corpus

| Tier | Meaning here |
|---|---|
| A | Reserved. **Nothing qualifies until the 1979 GM FSM is in hand.** |
| B | GM document quoted verbatim on a forum with a specific citation (manual year + section) |
| C | Chilton 1963–83; published restoration books |
| D | Van Steel lineage; magazine/vendor tech pages; uncited forum posts |
| E | Generic SBC charts — correct engine family, **wrong specificity**. Label "not Corvette-specific". |

Note this is stricter than the C5 mapping, where machine-extracted FSM rows were tier B. Here
even the best source is third-party.

## Suggested build order

1. **Lineage de-duplication + source registry** — before any value is loaded, so the agreement
   rule can never be fooled by mirrors.
2. **Thread-size plausibility bands** — the replacement for the unit cross-check.
3. **Ingest the Chilton procedures first.** They are the most valuable records in the corpus
   (curb-height requirements, single-use spindle nut, criss-cross patterns, end-play targets) and
   they are the ones no other source carries.
4. **Ingest everything else as multi-value `conflicting` records.** Do not try to resolve.
5. **Mark the exclusion list** from [conflicts-and-suspect.md](conflicts-and-suspect.md) Part 1 as
   `notIngested` entries so the Coverage tab shows what was found and rejected, and why. The C5
   dataset already has this field and the UI already renders it.
6. Only after the 1979 FSM is acquired: promote records to tier A/B and resolve conflicts.

## Expected outcome, stated plainly

With the current corpus the C3 dataset will be roughly:

- a few dozen **answerable** records (where Chilton, a GM quote, and a book agree — caliper
  mounting bolts at 70, drive spindle support at 30, drive spindle nut at 100, half-shaft
  U-bolts at 14–18, trailing arm pivot at 50, steering wheel nut at 30)
- a larger set of **`conflicting`** records showing 2–5 sourced values each
- a handful of **procedure** records
- a documented **exclusion list**
- several subsystems honestly **empty**

That is a useful tool — it tells you what every source says and where they diverge, which is
strictly better than the status quo of searching four forums yourself. It is not the clean
single-answer experience the C5 gives, and it should not pretend to be.
