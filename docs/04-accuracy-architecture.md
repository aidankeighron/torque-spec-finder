# 04 — Accuracy Architecture

## The one rule

> **The LLM never produces, repeats, or touches a number. It only helps choose which database
> row you meant. The number is rendered server-side from typed columns by a string template.**

A language model cannot emit a wrong torque spec if it is never in a position to emit a torque
spec. This is a structural guarantee, not a prompt instruction — prompts are requests, and
requests get ignored under distribution shift.

Concretely, the LLM sees: the user's question, and candidate fastener **names, assembly paths,
and positions**. It never sees a torque value. It returns an enum-constrained verdict. The
renderer then reads columns from SQLite and formats them.

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
| LLM verifier == `yes` | Semantic mismatch the scores missed | Model, fails closed |
| Not `conflicting` | Sources disagree | Data property |
| Tier acceptable | Insufficient provenance | Data property |

**All must pass.** Any failure → candidate list, you pick.

The position gate is the one that addresses failure #4, and it's deliberately *not* a score.
Position hints are extracted from the query by a **deterministic keyword pass** before any model
runs. If you said "rear" and "lower," a candidate whose `position` or assembly path contradicts
either one cannot be auto-answered — regardless of how high it scored.

`T1` and `T_margin` are not guessed. They're fit to data; see [08 — Eval Harness](08-eval-harness.md).

## Defense in depth

Four layers, each sufficient to prevent a wrong number on its own:

1. **Schema** — the number lives in a typed column; nothing generative can write there.
2. **Ingest validators** — unit cross-check, plausibility bands, dual extraction
   ([06](06-ingestion.md)).
3. **Abstain gate** — above.
4. **Output guard** — every numeral in the outgoing payload is regex-extracted and asserted to
   exist in the retrieved record. Mismatch → fail closed, never serve.

Layer 4 is deliberately redundant with layer 1. If a future refactor ever lets a model near the
output path, the guard catches it. Redundancy you never trigger is redundancy that's working.

## Why fully-local costs abstains, never correctness

This is the property that makes running everything on your own machine safe.

The embedder and reranker only **narrow candidates**. The LLM only **confirms or declines**. The
number comes from a column. So a weaker local model can only fail in one direction: it ranks the
right bolt lower, or declines to confirm a match — and the system **abstains and asks you to
pick from a list**.

**A weaker model buys you more taps, not wrong numbers.** Degradation is bounded by
construction. There is no accuracy argument for paying for cloud inference here.

Secondary benefit that matters more than it sounds: threshold calibration runs the eval set
hundreds of times. With a metered cloud reranker that costs money and quietly discourages
re-tuning. Local, it's free, so you'll actually do it.

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
| Fastener simply isn't in the data | Tier-E generic chart, explicitly labeled not vehicle-specific — never silent |
| Model hallucinates a number anyway | Output guard, fails closed |

## The accuracy claim, stated honestly

This system cannot be *proven* never to be wrong. What it can do, and what the eval harness
enforces on every build:

- **Zero wrong answers on the golden set** — every query returns the correct fastener or abstains.
- Every served number traceable to a verbatim source quote.
- Every uncertainty surfaced rather than smoothed over.

The design target is not "always answers." It's **never wrong, and loudly unsure when unsure.**
