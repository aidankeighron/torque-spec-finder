# 04 — Accuracy Architecture

## The one rule

> **Nothing generative ever produces, repeats, or touches a number. Search only selects which
> stored record you meant. The number is rendered from typed fields by a string template.**

A component cannot emit a wrong torque spec if it is never in a position to emit one. This is a
structural guarantee, not a prompt instruction — prompts are requests, and requests get ignored
under distribution shift.

The shipped system goes further than the original design: it contains **no language model at
runtime at all**. Query understanding is a synonym table plus a deterministic position parser,
so the answer path has no non-deterministic component. Scoring sees fastener **names, assembly
paths, aliases and positions** — never a torque value, which is why there is no path by which
searchable content can become answer content.

## Two independent confidence axes — never combined

Your instinct to rate both the answer *and* the number was right. They are different things and
are displayed separately.

### Axis 1 — Provenance tier (property of the row)

Assigned at ingest, fixed at query time. See [02 — Data Sources](02-data-sources.md).
*"How much do we trust this number?"*

### Axis 2 — Match confidence (computed per query)

Produced by the retrieval pipeline. *"Did we find **your** bolt?"*

### Why not blend them

A tier-A spec can have low match confidence, and a high-confidence match can point at a tier-D
forum post. A single blended percentage would hide exactly the distinction that matters:

- **High match, low provenance** → "This is definitely your bolt, but the number is from a
  forum. Verify before trusting it."
- **Low match, high provenance** → "These numbers are straight from GM, but we're not sure which
  one is your bolt. Pick one."

Those demand different actions from you. One number can't say both.

## Why the "95% cosine similarity" threshold doesn't work

The suggested design gated on cosine similarity ≥ 0.95. That doesn't hold up:

1. **Cosine similarity is not a probability.** 0.95 isn't "95% confident" — it's a geometric
   relationship with no calibrated meaning.
2. **Scores aren't comparable across queries.** A verbose question and a two-word question
   produce different score distributions. A fixed cutoff means different strictness per query.
3. **Cosine discards magnitude by design**, throwing away whatever confidence signal the
   embedding model encoded there.
4. **It cannot catch the failure that actually matters.** "Rear sway bar *upper* bolt" and "rear
   sway bar *lower* bolt" are near-identical in embedding space. Both score ~0.97 against either
   query. The threshold passes, and you get the wrong bolt with high confidence.

Failure #4 is the whole ballgame. A score threshold filters out *unrelated* results. It is
nearly blind to *adjacent, plausible, wrong* results — which is the only kind of wrong answer
this system is realistically going to produce.

## What replaces it: a gate with four independent checks

Full pipeline in [05 — Retrieval & Abstain](05-retrieval-and-abstain.md). The gate:

| Check | Catches | Type |
|---|---|---|
| Rerank score ≥ `T1` | Nothing relevant found | Calibrated |
| Top-1 − top-2 margin ≥ `T_margin` | Several equally-plausible candidates | Calibrated |
| **Position gate** | **upper/lower, front/rear, LH/RH mismatch** | **Deterministic** |
| **Unknown-vocabulary gate** | **A part this vehicle does not have** | **Deterministic** |
| Not `conflicting` | Sources disagree | Data property |

The shipped system has **no LLM verifier** — the synonym table and the deterministic position
parser do that work, which removes the last non-deterministic component from the answer path.

The unknown-vocabulary gate was added after the golden set caught a real wrong answer: asking
for a C3 "trailing arm pivot bolt" returned a headlamp actuator nut, because "pivot" and "arm"
matched and only "trailing" — the word that identified the part — was missing. If a third or
more of the words you typed appear nowhere in this vehicle's data *and* have no synonym mapping,
the system will not auto-answer.

**All must pass.** Any failure → candidate list, you pick.

The position gate is the one that addresses failure #4, and it's deliberately *not* a score.
Position hints are extracted from the query by a **deterministic keyword pass** before any model
runs. If you said "rear" and "lower," a candidate whose `position` or assembly path contradicts
either one cannot be auto-answered — regardless of how high it scored.

`T1` and `T_margin` are not guessed. They're fit to data; see [08 — Eval Harness](08-eval-harness.md).

## Defense in depth

Four layers, each sufficient to prevent a wrong number on its own:

1. **Typed data** — the number lives in a typed field; nothing generative can write there.
2. **Ingest validators** — the unit cross-check, which found 9 real defects in GM's own
   document, plus mis-join and completeness checks ([06](06-ingestion.md), [10](10-what-testing-found.md)).
3. **Abstain gate** — above.
4. **Output guard** — every numeral in the outgoing payload is regex-extracted and asserted to
   exist in the retrieved record. Mismatch → fail closed, never serve.

Layer 4 is deliberately redundant with layer 1. If a future refactor ever lets a model near the
output path, the guard catches it. Redundancy you never trigger is redundancy that's working.

## Why the semantic layer costs abstains, never correctness

The number comes from a typed field, so no scoring component can alter it. But ranking is a
different matter, and the first version of this section was **wrong**.

The original claim was that a weaker semantic layer "can only rank the right bolt lower", so
degradation is bounded to recall. That is true of the *value*, and false of the *ranking* —
scores interact. Testing found three separate paths by which enabling the semantic layer
produced a wrong answer. See [10 — What Testing Found](10-what-testing-found.md).

The guarantee now holds because it is enforced in three places, not assumed:

1. **The semantic score is absent from the rerank sum.** It contributes one ranking to
   candidate *generation* only.
2. **BM25 is normalised against all documents, not the candidate pool**, so pool membership
   cannot rescale anyone's score.
3. **The pool is the fused leaders unioned with the lexical leaders**, so the lexical-only pool
   is always a subset of the semantic pool.

Together: enabling the semantic layer can only ADD candidates. Added candidates can shrink the
top-1/top-2 margin and cause an **abstain**. They cannot evict or reorder the right answer.

**A weaker semantic layer buys you more taps, not wrong numbers** — now by construction rather
than by hope. The regression test `golden set — with the semantic layer on` asserts it on every
build, which is the only reason to believe it.

## Known failure modes and their mitigations

| Failure | Mitigation |
|---|---|
| Adjacent-bolt confusion (upper vs. lower) | Deterministic position gate |
| Stale FSM value superseded by a TSB | `superseded_by_id`, TSB ingest pass, supersession banner |
| OCR digit error (37 → 87) | N·m ↔ lb-ft cross-check; dual extraction |
| Right number, wrong procedure (TTY bolt reused) | `reusable` column, single-use warning on the card |
| Right number, wrong state (suspension hanging) | `precondition` column, shown on the card |
| Spec differs by trim/RPO and we served the wrong one | `applicability` rows expanded at ingest; vehicle is a hard filter |
| Two sources disagree | Detected at ingest, flagged `conflicting`, both shown with origins |
| Fastener simply isn't in the data | Reported as absent; nothing is estimated or substituted |
| Query names a part the car lacks | Unknown-vocabulary gate — never auto-answers |
| A future change puts a generator in the answer path | Output guard, fails closed |

## The accuracy claim, stated honestly

This system cannot be *proven* never to be wrong. What it can do, and what the eval harness
enforces on every build:

- **Zero wrong answers on the golden set** — 62 queries, 28 of them deliberate near-miss traps;
  every one returns the correct fastener or declines. Asserted on every build, lexically and with
  the semantic layer enabled.
- Every served number traceable to a verbatim source quote.
- Every uncertainty surfaced rather than smoothed over.

The design target is not "always answers." It's **never wrong, and loudly unsure when unsure.**
