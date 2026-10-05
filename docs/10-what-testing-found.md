# 10 — What Testing Found

Every item here is a defect the test suite caught that inspection had missed.
It is recorded because the pattern matters more than the individual bugs: in a
system whose whole claim is "never wrong", the interesting failures are the ones
that look correct.

## The ingest pipeline

### The unit cross-check found 9 defects in GM's own document

The highest-value check in the system, and it cost nothing to build, because
the FSM prints both N·m and lb-ft on every row. Six are mislabelled units:

| Row | Printed | Problem |
|---|---|---|
| Fuel Tank Shield Mount Bolt | `25 N·m 18 lb in` | 25 N·m = 18.4 lb **ft** |
| Heater Pipe Bracket Retaining Nut | `10 N·m 89 lb ft` | 10 N·m = 88.5 lb **in** |
| Cylinder Line Valve End Fittings | `17 N·m 13 lb in` | 17 N·m = 12.5 lb **ft** |
| Number One Bow to Front Rail Nuts | `14 N·m 10 lb in` | 14 N·m = 10.3 lb **ft** |
| Number One Bow to Side Rail Nuts | `14 N·m 10 lb in` | same |
| Lower Retractor Bolt | `47 N·m 35 lb in` | 47 N·m = 34.7 lb **ft** |

Three more are unresolved by any relabelling (`Throttle Body Attaching Bolts
10 N·m 189 lb in`, where 10 N·m = 88.5 lb in and the leading "1" looks like a
text-extraction artifact).

**None were auto-corrected.** Each is shown with the printed value and a
"source document is internally inconsistent here" banner. The alternative —
silently writing what we think GM meant — would make the system a source of
invented numbers, which is the one thing it exists not to be.

### Four-line wrapped rows created a fastener out of nothing

The line joiner gave up after 3 lines. A four-line record overflowed, and its
orphaned tail glued onto the next row's name, producing the fastener
**"N·m 17 lb in Driver Knee Bolster Trim Panel Lower Retaining Screws"**.

Caught by a dataset test asserting no fastener name contains a unit string.
Fixed by raising the limit to 5 lines *and* adding a guard that rejects any
parsed name beginning with a unit or digit — the second fix matters more,
because it makes the whole class of mis-join detectable rather than this one
instance.

### The same fastener existed 10 times

The FSM repeats a spec in every procedure section whose work touches it.
`Negative Battery Cable Bolt` appeared in ten sections, so the first build
emitted ten identical records. Beyond clutter, this *caused false abstains*:
ten identical candidates have zero score margin between them, so the gate
correctly concluded it could not tell them apart.

Merging on identical name + position + every value collapsed 23 duplicate
display names to 12, and the survivors are legitimately distinct front/rear
pairs. The merged record keeps all ten sections as corroboration.

### A phantom conflict on the cylinder head bolts

`Cylinder Head Bolts` has two `Final Pass` stages — +90° for most M11 bolts and
+50° for the medium-length ones at each end of the head. Dropping the qualifier
text made them look like one stage with two contradictory values, so the record
was flagged `conflicting` and refused to answer.

Fixed by keying stage identity on label **and** qualifier. The lesson is that
discarding "redundant" source text is never free.

### `3 ½ flats` became `2 flats`

Unicode normalisation turns `½` into `1⁄2` with a FRACTION SLASH, and the
non-greedy count pattern then captured only the denominator. On the rear lower
ball joint — a wheel-retention fastener.

## The search engine

### A wrong answer, caught by the golden set

`"trailing arm pivot bolt"` (a C3 part) returned
**"Headlamp Motor/Actuator to Pivot Arm Nut"**. Unweighted coverage scored it
2-of-3 because "pivot" and "arm" are common, and "trailing" — the only word
that identifies the part, and absent from the entire dataset — counted the same
as them.

Two fixes, both principled:

1. **IDF-weighted coverage.** Missing a rare term now costs in proportion to
   how informative it is. Unknown terms count as maximally informative.
2. **The unknown-vocabulary gate.** If a third or more of the words the user
   typed appear nowhere in this vehicle's data *and* have no synonym mapping,
   the system will not auto-answer. Naming a part the car does not have is much
   stronger evidence than a merely low score.

### The "recall-only" guarantee was false, twice

[04](04-accuracy-architecture.md) claimed a weaker semantic layer could only
cost abstains, never correctness. The test `golden set — with the semantic layer
on › still ZERO WRONG ANSWERS` proved otherwise, and it took three separate
fixes to make the claim actually true:

1. **The semantic score was in the rerank sum.** Enabling the toggle changed
   `"rear axle nut"` from correct to "Cover Bolts and Stud" and made
   `"motor mount"` answer where it should have asked. Removed from ranking;
   it now feeds candidate generation only.
2. **BM25 was normalised against the candidate pool.** So adding candidates
   raised `bm25Max`, rescaled everyone's BM25 term, and shifted its balance
   against coverage — reordering candidates the semantic layer never touched.
   Now normalised against all documents.
3. **The pool was capped at the fused top-24.** Adding a third ranking changed
   every RRF score and could *evict* a lexically-strong candidate before it
   ever reached the reranker. A wrong answer caused by losing a candidate, not
   by misranking one. The pool is now the fused leaders unioned with the
   lexical leaders, so the lexical pool is always a subset.

This is the most important entry in this document. The architectural claim was
reasonable, written in good faith, and wrong — and no amount of re-reading the
code would have shown it. A test that enabled the feature and compared outcomes
did.

### "steering wheel nut" returned the lug nut spec

Two causes compounding:

- **A data bug.** The name-based assembly rule `\bwheel nuts?\b` matched
  "Steering Wheel Nut" and filed it under *Wheels and Tires*, so its indexed
  text contained "wheel" but not "steering". Fixed with a negative lookbehind.
- **A phrase-matching bug.** The synonym matcher rejected only *contained*
  overlaps, so in "steering **wheel nut**" the lug-nut group matched the
  trailing words and injected the entire lug-nut vocabulary into the query.
  Fixed by rejecting any overlap, which gives correct longest-match-wins.

### Position words read as foreign vocabulary

Having added the unknown-vocabulary gate, `"rear shock bottom bolt"` started
abstaining: GM never writes "bottom", always "Lower", so "bottom" looked like
an unknown part name. The gate now exempts anything the synonym table can
translate. Auto-answer rate went from 55% to 60% on that fix alone.

## The app

### Picking a candidate undid the user's choice

`pickFastener` set both the result *and* the submitted query. Setting the query
re-triggered the search effect, which overwrote the record the user had just
explicitly chosen — usually with an abstain, since the ambiguity that caused the
candidate list in the first place was still there.

So the one interaction that exists to let a human resolve ambiguity threw the
resolution away. Found by the Playwright test that clicks through from the
browse tree.

### The mockup's own data violated the output guard

Before any of the above, the first guard run caught the hand-written mockup
showing `100 N·m / 74 lb ft` on a card whose source quote contained neither
number. The guard's first live act was to catch its author.

## What this says about the approach

Of the defects above, **one** was found by reading code. The rest came from:

- a cheap arithmetic invariant on the source data (9 document defects)
- schema assertions over the real dataset (mis-joins, duplicates, phantom conflicts)
- a labelled query set with deliberate near-misses (2 wrong answers, 3 architecture leaks)
- a browser driving the real static build (1 interaction bug)

The accuracy of this system is a property of its test suite, not of its design
documents. Those documents describe intentions; several turned out to be wrong.
