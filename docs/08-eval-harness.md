# 08 — Eval Harness

## Why this doc exists

"Unbelievably accurate" is not a design goal you can ship. It's a property you have to
**measure on every build**, or it quietly decays the first time someone tunes a threshold.

This is the mechanism that makes the accuracy claim testable.

## The golden set

`eval/golden.yaml` — 150–300 queries in **your own** phrasing, each mapped to the correct
`fastener_id`.

```yaml
- query: "rear sway bar bottom bolt"
  vehicle: c5-2003-base
  expect: fastener/rear-stabilizer-link-lower
  trap: adjacent          # the upper link bolt is the near-miss

- query: "what do I torque the rear shock bottom bolt to"
  vehicle: c5-2003-base
  expect: fastener/rear-shock-lower-mount

- query: "head bolts"
  vehicle: c5-2003-base
  expect: fastener/cylinder-head-bolt
  must_include: [multi_stage, angle, single_use]

- query: "ball joint nut"
  vehicle: c5-2003-base
  expect: fastener/front-lower-ball-joint-stud-nut
  must_include: [superseded_banner]     # revised by 2005 TSB

- query: "that bolt near the thing"
  vehicle: c5-2003-base
  expect: ABSTAIN                       # genuinely unanswerable
```

### Trap cases are the point

A golden set of easy queries proves nothing. At least a third should be deliberate near-misses,
because adjacent-bolt confusion is the only realistic wrong-answer mode
([04](04-accuracy-architecture.md)):

- **upper vs. lower** — sway bar links, shock mounts, control arms
- **front vs. rear** — same part name at both ends of the car
- **LH vs. RH** — where specs actually differ
- **inboard vs. outboard** — half-shaft bolts
- **adjacent in the same assembly** — bracket-to-frame vs. bracket-to-bar
- **unanswerable** — queries that *must* abstain

## The hard gate

`eval/run_eval.py`, run in CI and before every commit touching retrieval:

```
for each golden query:
    result = system(query, vehicle)
    if result.auto_answered and result.fastener_id != expected:
        WRONG_ANSWER        # build fails
    elif result.abstained:
        ABSTAIN             # acceptable
    else:
        CORRECT
```

```
assert wrong_answers == 0
```

**Any wrong answer fails the build.** Not a warning, not a regression percentage. Zero.

Abstain rate and auto-answer rate are reported as **UX metrics** — worth improving, never worth
trading a wrong answer for. That asymmetry is the whole philosophy, encoded as a test.

## Calibration

`eval/calibrate.py` sweeps `T1` × `T_margin` over the golden set and picks:

> the thresholds that **maximize auto-answer rate, subject to `wrong_answers == 0`**

This is a constrained optimization, not a judgement call. It's also why local models matter
practically: the sweep runs the full set hundreds of times. Metered cloud inference would make
this cost money and you'd quietly stop doing it.

Output goes to `config.toml`, not into code:

```toml
[thresholds]
rerank_top1 = 0.62
rerank_margin = 0.14
# calibrated 2026-10-04 · 214 queries · 0 wrong · 81% auto-answer · 19% abstain
```

Recalibrate after any data ingest or model change. The comment line is the audit trail.

## Reported metrics

| Metric | Target | Status |
|---|---|---|
| **Wrong answers** | **0** | **Hard constraint — build fails otherwise** |
| Auto-answer rate | as high as possible | Soft, UX |
| Abstain rate | as low as possible | Soft, UX |
| Trap-case wrong answers | 0 | Hard, subset of the above |
| Coverage (fasteners with a tier A/B spec) | grows per ingest | Tracking |

## Adversarial checks

Beyond the golden set, specific regression tests:

- `"rear sway bar bottom bolt"` → returns the **lower** fastener or abstains; **never** the upper
- LS1 head bolt query → all stages + angle + single-use warning; never a bare number
- A fastener with a known TSB revision → revised value, supersession banner
- Ball-joint query → the 2005-bulletin value, **not** the original FSM value
- A deliberately `conflicting` spec → no single answer; both values with origins
- Vehicle filter → a C6-only fastener is unreachable with a C5 vehicle selected

## Guard tests

Testing the safety net itself, not just the happy path:

- Inject a mismatched numeral into the render path → request **fails closed**
- Corrupt a digit in a source table → the N·m ↔ lb-ft validator **rejects** it at ingest
- An un-reviewed (`machine_extracted`) row → **not served** under default policy
- LLM backend set to `none` → system still works, always returns a candidate list
- LLM returns malformed output → treated as `unsure` → abstain, never a crash or a guess
