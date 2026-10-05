# 1979 C3 Corvette — Research Archive (PAUSED)

**Status: research complete, ingest not started.** Work was paused to finish the C5 first.

Target vehicle: **1979 Chevrolet Corvette, base, automatic (TH350/TH400), L48 350 ci V8**.
Dataset id: `c3-1979-base-auto`. A valid but **empty** dataset ships at
[`website/data/c3-1979-base-auto.json`](../../website/data/c3-1979-base-auto.json) so the
vehicle selector works and honestly reports "no data yet" rather than borrowing another
car's numbers.

## Files here

| File | Contents |
|---|---|
| [sources.md](sources.md) | Every source found, with **independence caveats** — read this first |
| [suspension-chassis-wheels.md](suspension-chassis-wheels.md) | Front/rear suspension, wheels, body/frame |
| [engine-driveline-brakes-steering.md](engine-driveline-brakes-steering.md) | SBC 350, TH350/400, brakes, steering |
| [conflicts-and-suspect.md](conflicts-and-suspect.md) | **The safety-critical file.** Disagreements, suspect values, and what must not be ingested |
| [ingest-plan.md](ingest-plan.md) | How to turn this into a dataset when work resumes |

## The headline finding, before anything else

**The C3 is a fundamentally different data problem than the C5.**

The C5 had one authoritative GM document (the Fastener Tightening Specifications tables) that
is internally consistent and self-validating via its printed N·m/lb-ft pairs. The C3 has no
such artifact in reach. What exists is a scatter of third-party manuals, vendor catalogs, and
forum posts that **systematically disagree on safety-critical fasteners**:

| Fastener | Spread found |
|---|---|
| Upper ball joint stud nut | 45 · 50 · **80** lb-ft |
| Lower ball joint stud nut | 75 · 80 · 90 lb-ft |
| Rear camber cam nut | 15–22 · 55–77 · 70 · 100 · **130** lb-ft (≈9×) |
| Strut rod bracket to carrier | 15–22 · 30 · 35 · 45 lb-ft |
| Front caliper housing/bridge bolts | **130** (GM bulletin) vs **60–80** (1979 AIM) |
| Pitman shaft nut | 140 · 150 · 185 lb-ft |
| Differential rear cover bolts | **20** vs **50** lb-ft |
| Lug nuts | 75 · 80 · 90 · 95–120 lb-ft |

Consequence: **most C3 records will correctly resolve to `conflicting`, not to answers.** The
UI will show two or three sourced values side by side and refuse to pick. That is the system
working as designed, not a defect — but it means the C3 experience is "here is what each
source says" rather than "here is the number."

Getting past that requires the **1979 GM Corvette Shop Manual** itself. Until then, no amount
of additional forum searching will resolve these; it will only add more voices.

## Second critical finding: false corroboration

The most widely reproduced C3 chassis torque list appears on at least four sites
(Van Steel's own page, a CorvetteForum thread, Corvette Legends, Vette Registry/C3VR).
**It is one source, not four** — the forum poster states outright that the table came from
"VANSTEEL parts catalogue (page 9)", and the other copies are numerically identical.

Any agreement rule applied naively to these would promote a single vendor catalog to tier A on
the strength of its own echoes. The ingest plan treats the whole Van Steel lineage as **one**
source. See [sources.md](sources.md).

## Third finding: some "torque specs" are not torque specs

Several of the most-requested C3 numbers are adjustment procedures, and returning a bare
figure for them would be actively wrong:

- **Front wheel bearing** — not a torque spec. Sequence: torque to 12 lb-ft while spinning,
  back off, hand-snug, loosen to align cotter pin. Target is **end play 0.001–0.005 in**.
- **Rear spindle bearing** — end play **0.001–0.008 in** via shims (0.097–0.145 in,
  0.003 in increments). The spindle nut is **single use** — discard and fit a new one.
- **Pinion nut** — 1980 GM manual gives 200–220 lb-ft; the 1973 Chevrolet Overhaul Manual says
  tighten until **rotating preload** reaches 20–30 in-lb (new bearings) or 5–15 in-lb (used).
  These are irreconcilable, and a flat 200–220 can crush new bearings. Preload governs.
- **Rocker arm nuts** — "zero lash plus 1/2 turn", not a torque figure.
- **Rotor to hub** — factory riveted; no spec exists and none should be invented.

The schema already models `preconditions` and multi-stage sequences, but these cases need a
**procedure** record type rather than a stage list. Noted in [ingest-plan.md](ingest-plan.md).

## Hard rule carried forward

No value in these files was invented, estimated, interpolated, or reasoned out. Every figure
has a citable URL. Where a value could not be sourced, the subsystem is listed as a gap rather
than filled from a generic thread-size chart. That rule holds for the ingest too.
