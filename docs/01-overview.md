# 01 — Overview

## The problem

Working on a car means hundreds of fasteners, each with its own torque spec. You usually don't
know the OEM name of the bolt in your hand — you know *where it is*. "Rear sway bar bottom bolt."

Searching the web or asking a general-purpose LLM works most of the time. "Most of the time" is
the problem. Observed failures:

- A blatantly wrong number, delivered confidently.
- Two contradictory numbers in one answer, with no indication which applies.

For a fastener, a wrong number is a stripped thread, a snapped bolt, or a wheel leaving the car.
There is no acceptable error rate.

## The goal

Natural-language lookup against a vehicle-filtered database that returns:

- the torque spec, with every stage and both printed units
- **where the number came from** and how trustworthy that source is
- **how confident the system is that it found your bolt** — separately
- nearby fasteners in the same assembly
- a diagram with the bolt called out

…and that **refuses to answer** rather than guess.

Target vehicle: 2003 base Corvette (C5, LS1). The architecture generalizes to any vehicle.

## Does this already exist?

No — not with this accuracy posture.

| Category | Examples | Why it falls short |
|---|---|---|
| AI mechanic chatbots | TorqueBot, MECH AI, Check Engine Chat | The number is *generated* by an LLM. Same hallucination mode you already hit. |
| Spec databases | FastSpecs, ALLDATA DIY, Mitchell 1 DIY | Accurate, but dropdown navigation only. No natural language, no provenance, no confidence, no abstain. |

Nothing combines natural-language input with a **non-generative** answer path, provenance
tracking, and an explicit "I don't know" state. That gap is this project.

## The core principle

> **The LLM never produces, repeats, or touches a number. It only helps choose which database
> row you meant. The number is rendered server-side from typed columns by a string template.**

Every design decision in these docs follows from that one rule. See
[04 — Accuracy Architecture](04-accuracy-architecture.md).

## How it works, end to end

```
  You pick the vehicle (hard filter, never inferred from text)
                │
  "what's the torque on my rear sway bar bottom bolt?"
                │
                ▼
  ┌─────────────────────────────────────────────┐
  │  Hybrid retrieval over fasteners for THIS   │   BM25 + vector, one SQL query
  │  vehicle only                               │
  └─────────────────────────────────────────────┘
                │ top ~20 candidates
                ▼
  ┌─────────────────────────────────────────────┐
  │  Cross-encoder rerank                       │
  └─────────────────────────────────────────────┘
                │
                ▼
  ┌─────────────────────────────────────────────┐
  │  ABSTAIN GATE                               │
  │   · score + margin thresholds (calibrated)  │
  │   · position gate   (rear? lower? LH?)      │   ← deterministic, not a score
  │   · LLM verifier    (yes | no | unsure)     │
  │   · not flagged conflicting                 │
  │   · provenance tier acceptable              │
  └─────────────────────────────────────────────┘
          │ all pass                  │ anything fails
          ▼                           ▼
   Single answer card          Ranked candidate list
   rendered from DB            + diagram — you pick
   columns, no LLM             (your pick becomes an alias)
                │
                ▼
   OUTPUT GUARD: every numeral in the response must exist
   in the retrieved record, or the request fails closed
```

## Three findings that shaped the design

1. **GM prints both N·m and lb-ft in every spec table.** Every row self-validates:
   `N·m × 0.7376 ≈ lb-ft`. A misread digit almost always breaks the relation. This is a nearly
   free automatic correctness check on extraction. See [06 — Ingestion](06-ingestion.md).

2. **A 2005 GM service bulletin revised the C5 ball-joint torque specs for 1997–2005.** The
   factory service manual alone is **not** truth. Without supersession modeling the system will
   serve a stale number with total confidence — the most dangerous possible failure, because
   every provenance signal says "OEM, verified." See [03 — Data Model](03-data-model.md).

3. **LS1 head bolts are torque-to-yield: 22 lb-ft → 90° → 90°/50°, and single-use.** A bare
   number is *itself* a wrong answer here. Multi-stage sequences, angle stages, and
   do-not-reuse warnings are schema columns, not a notes field.

## Document map

| Doc | Contents |
|---|---|
| [02 — Data Sources](02-data-sources.md) | Where the numbers come from, provenance tiers, the agreement rule |
| [03 — Data Model](03-data-model.md) | Schema, and why a spec is not `(name, value)` |
| [04 — Accuracy Architecture](04-accuracy-architecture.md) | The rules, the two confidence axes, failure modes |
| [05 — Retrieval & Abstain](05-retrieval-and-abstain.md) | The query pipeline and the gate |
| [06 — Ingestion](06-ingestion.md) | Extraction, validators, human review |
| [07 — Stack & Running](07-stack-and-running.md) | Fully-local stack, how to run it, garage use |
| [08 — Eval Harness](08-eval-harness.md) | How accuracy stays a property instead of a hope |
| [09 — Roadmap](09-roadmap.md) | Build phases |
