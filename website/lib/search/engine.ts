/** The search pipeline and the abstain gate.
 *
 *   0. vehicle comes from the selector    -> dataset is already scoped
 *   1. deterministic position parse       -> hints, before anything else runs
 *   2. synonym expansion                  -> "sway bar" reaches "Stabilizer Shaft"
 *   3. candidates: BM25 + trigram (+ optional embeddings)
 *   4. RRF fusion
 *   5. rerank on explainable features
 *   6. POSITION GATE (hard, deterministic)
 *   7. decide: answer | abstain | conflict | not_found
 *
 * Nothing in this file generates a torque value. It selects a record; the
 * record's own verbatim fields are rendered by lib/render.
 */

import type { Candidate, Dataset, Fastener, SearchResult } from "../types";
import {
  Bm25,
  coverage,
  type Doc,
  normalise,
  rrf,
  stem,
  topIndices,
  tokenize,
  trigramSim,
  trigrams,
} from "./lexical";
import { extractPositionHints, positionGate, positionScore, type Axis } from "./position";
import { expandPhrases, GENERIC_TERMS, isKnownVocabulary } from "./synonyms";
import { buildConceptVectors } from "./embeddings";

/** Calibrated on the golden set in tests/golden.ts. Raising `top1` or `margin`
 *  trades auto-answers for abstains; it can never trade for correctness,
 *  because the gate below is independent of them. */
export const THRESHOLDS = {
  /** Minimum normalised rerank score for the top hit. */
  top1: 0.42,
  /** Minimum gap between top-1 and top-2. The signal that distinguishes
   *  "found it" from "found four of them". */
  margin: 0.08,
  /** Below this, we say not-found rather than offering candidates. */
  floor: 0.12,
};

const MAX_CANDIDATES = 24;
const SHOWN_CANDIDATES = 6;

export interface SearchIndex {
  dataset: Dataset;
  docs: Doc[];
  bm25: Bm25;
  /** Parallel to docs. */
  fasteners: Fastener[];
  embeddings?: Float32Array[];
}

/** Text that gets indexed for a fastener.
 *
 *  The torque VALUE is deliberately absent — there is no path by which
 *  searchable content can become answer content. */
export function indexedText(f: Fastener): string {
  const parts = [
    f.name,
    f.assembly.replace(/>/g, " "),
    ...(f.aliases ?? []),
    f.position.vertical ?? "",
    f.position.longitude ?? "",
    f.position.lateral ?? "",
    f.position.radial ?? "",
    // section names from the source give extra vocabulary ("Disc Brakes")
    ...f.provenance.sections,
    // From stage qualifiers, take ONLY the hardware designations (M8, M11,
    // 7/16-20). Someone who knows the bolt size searches by it, and without
    // this "M11 head bolts" tripped the unknown-word gate on a fastener the
    // data plainly describes.
    //
    // The surrounding prose is deliberately excluded: indexing whole qualifier
    // sentences ("all Bolts in Sequence", "at the Front and Rear of Each
    // Cylinder Head") injected enough common tokens to flatten the ranking,
    // and turned "rear shock bottom bolt" from a clean answer into an abstain.
    ...f.stages.flatMap((s) => s.detail.match(/\bM\d+(?:x[\d.]+)?\b|\b\d+\/\d+-\d+\b/gi) ?? []),
  ];
  return parts.filter(Boolean).join(" ");
}

export function buildIndex(dataset: Dataset): SearchIndex {
  const fasteners = dataset.fasteners;
  const docs: Doc[] = fasteners.map((f) => {
    const text = indexedText(f);
    return { id: f.id, text, tokens: tokenize(text), trigrams: trigrams(text) };
  });
  return {
    dataset,
    docs,
    bm25: new Bm25(docs),
    fasteners,
    // Concept vectors are cheap to compute and tiny to hold (a few hundred KB
    // for the whole C5), so there is no reason to defer them. They are only
    // CONSULTED when the semantic toggle is on and a query vector is supplied.
    embeddings: buildConceptVectors(fasteners),
  };
}

interface ParsedQuery {
  raw: string;
  terms: string[];
  weights: Map<string, number>;
  hints: Partial<Record<Axis, string>>;
  expandedPhrases: string[];
}

/** Informative words the user actually typed (not synonym expansions). Used
 *  to detect that a query names something this vehicle's data has never heard
 *  of, which is much stronger evidence than a merely low score. */
function typedInformativeTerms(raw: string): string[] {
  return tokenize(raw).filter((t) => !GENERIC_TERMS.has(t));
}

export function parseQuery(raw: string): ParsedQuery {
  // Position hints come from the RAW text first, so the gate never depends on
  // tokenisation choices or synonym expansion.
  const hints = extractPositionHints(raw);

  const base = tokenize(raw);
  const { matched, expansions } = expandPhrases(raw);

  const weights = new Map<string, number>();
  const terms: string[] = [];

  const add = (tok: string, w: number) => {
    if (!tok) return;
    terms.push(tok);
    weights.set(tok, Math.max(weights.get(tok) ?? 0, w));
  };

  for (const t of base) add(t, GENERIC_TERMS.has(t) ? 0.25 : 1);
  // Synonym expansions are real evidence but weaker than what the user typed.
  for (const phrase of expansions) {
    for (const t of tokenize(phrase)) add(t, GENERIC_TERMS.has(t) ? 0.15 : 0.75);
  }

  return { raw, terms: [...new Set(terms)], weights, hints, expandedPhrases: matched };
}

/** An exact hit on the canonical name, or on one of the record's aliases.
 *
 *  Aliases exist precisely to capture the words a user actually types, so an
 *  exact alias match is as strong a signal as an exact name match — stronger,
 *  arguably, since someone deliberately recorded that phrasing for this part.
 *  Without this, "rear axle nut" lost to "Cover Bolts and Stud" purely on BM25
 *  document-length normalisation, despite being a verbatim alias. */
function exactNameMatch(f: Fastener, raw: string): boolean {
  const q = normalise(raw);
  if (!q) return false;
  const n = normalise(f.name);
  if (q === n || (n.includes(q) && q.length >= 8)) return true;
  return (f.aliases ?? []).some((a) => normalise(a) === q);
}

/** Explainable rerank. Each term is a feature a human can check, which is why
 *  this is auditable in a way a neural reranker's logit is not. */
function rerankScore(
  f: Fastener,
  doc: Doc,
  q: ParsedQuery,
  bm25Index: Bm25,
  bm25Raw: number,
  bm25Max: number,
  fuzzy: number,
  embedding: number | null,
): { score: number; signals: Candidate["signals"] } {
  const bm25 = bm25Max > 0 ? bm25Raw / bm25Max : 0;
  const cov = coverage(q.terms, doc, bm25Index);
  const posBonus = positionScore(f, q.hints);
  const exact = exactNameMatch(f, q.raw);

  // Coverage dominates: answering the whole question matters more than
  // matching one rare token very strongly.
  //
  // Note what is NOT in this sum: the semantic score. The concept vectors
  // contribute to CANDIDATE GENERATION only (see the RRF stage below), never
  // to ranking. That is what makes the architectural claim in docs/04 true by
  // construction rather than by hope: a weaker or absent semantic layer can
  // surface fewer candidates, or widen the pool and shrink the top-1/top-2
  // margin — both of which cause MORE ABSTAINS. It cannot reorder the
  // survivors and so cannot turn a safe abstain into a wrong answer.
  //
  // This was not theoretical. With the semantic term inside this sum, turning
  // the toggle on changed "rear axle nut" from a correct answer to
  // "Cover Bolts and Stud", and made "motor mount" answer where it should
  // have asked. The golden set caught both.
  let score =
    0.34 * bm25 +
    0.40 * cov +
    0.10 * fuzzy +
    0.06 * Math.max(0, Math.min(1, posBonus / 2));

  if (exact) score += 0.15;
  // A contradicted axis is penalised here AND blocked by the gate. Belt and braces.
  if (posBonus < 0) score -= 0.25;
  // Prefer verified, higher-tier records when otherwise equal.
  if (f.provenance.tier === "A") score += 0.02;

  return {
    score: Math.max(0, score),
    signals: { bm25, coverage: cov, positionBonus: posBonus, fuzzy, embedding, exactName: exact },
  };
}

export interface SearchOptions {
  /** Optional query embedding for the semantic layer. */
  queryEmbedding?: Float32Array | null;
  thresholds?: typeof THRESHOLDS;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are stored pre-normalised
}

export function search(
  index: SearchIndex,
  rawQuery: string,
  opts: SearchOptions = {},
): SearchResult {
  const thresholds = opts.thresholds ?? THRESHOLDS;
  const q = parseQuery(rawQuery);
  const empty = (outcome: SearchResult["outcome"], reason: string): SearchResult => ({
    outcome,
    query: rawQuery,
    vehicleId: index.dataset.vehicle.id,
    fastener: null,
    candidates: [],
    reason,
    positionHints: q.hints as Record<string, string>,
    nearby: [],
    diagnostics: {
      top1: 0, top2: 0, margin: 0, gatePassed: false, blocked: 0,
      totalScanned: index.docs.length, usedEmbeddings: !!opts.queryEmbedding,
      thresholds: { top1: thresholds.top1, margin: thresholds.margin },
    },
  });

  if (!rawQuery.trim()) return empty("not_found", "Enter a search to begin.");
  if (!q.terms.length) {
    return empty("not_found", "That query had no searchable terms. Try naming the part.");
  }
  // A query made only of generic fastener words ("that bolt near the thing")
  // carries no identifying information. BM25 will still rank something first,
  // so without this check the gate sees a plausible-looking score for a query
  // that named nothing at all.
  if (!q.terms.some((t) => !GENERIC_TERMS.has(t))) {
    return empty(
      "not_found",
      "That only named a fastener type, not a part. Say which component it's on — " +
        "for example \"rear sway bar link\" rather than \"that bolt\".",
    );
  }

  // --- candidate generation -------------------------------------------
  const bm25Scores = index.bm25.score(q.terms, q.weights);
  const bm25Rank = topIndices(bm25Scores, MAX_CANDIDATES * 2);

  const qTri = trigrams(rawQuery);
  const fuzzyScores = new Float64Array(index.docs.length);
  for (let i = 0; i < index.docs.length; i++) {
    fuzzyScores[i] = trigramSim(qTri, index.docs[i].trigrams);
  }
  const fuzzyRank = topIndices(fuzzyScores, MAX_CANDIDATES);

  const rankings = [bm25Rank, fuzzyRank];
  const embScores = new Float64Array(index.docs.length);
  if (opts.queryEmbedding && index.embeddings) {
    for (let i = 0; i < index.embeddings.length; i++) {
      embScores[i] = cosine(opts.queryEmbedding, index.embeddings[i]);
    }
    rankings.push(topIndices(embScores, MAX_CANDIDATES));
  }

  const fused = rrf(rankings);
  if (!fused.size) {
    return empty(
      "not_found",
      "No fastener in this vehicle's data matched that. It may not be in the source document — see Coverage.",
    );
  }

  // The pool is the fused leaders UNION the lexical leaders.
  //
  // Taking only the fused top-N was the second half of the recall-only leak:
  // adding the semantic ranking changes every RRF score, which could push a
  // lexically-strong candidate out of the capped pool entirely. It then never
  // reached the reranker, and a weaker candidate won — a wrong answer caused
  // by *losing* a candidate, not by reordering one.
  //
  // Unioning the lexical top lists guarantees the lexical-only pool is always
  // a subset of the semantic pool, so enabling the semantic layer can only
  // ever ADD candidates. Adding candidates can lower the top1/top2 margin and
  // cause an abstain; it cannot remove the right answer.
  const poolSet = new Set<number>([
    ...[...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CANDIDATES).map(([i]) => i),
    ...bm25Rank.slice(0, MAX_CANDIDATES),
    ...fuzzyRank.slice(0, MAX_CANDIDATES),
  ]);
  const pool = [...poolSet];

  // Normalise BM25 against ALL documents, not just the candidate pool.
  //
  // Pool-relative normalisation leaked pool membership into the ranking: the
  // semantic layer adds candidates, which could raise bm25Max, which rescaled
  // every candidate's bm25 term and shifted its balance against coverage —
  // flipping the order of candidates the semantic layer never touched. That
  // broke the "recall-only" guarantee in a way that was invisible by
  // inspection; the golden set caught it as "rear axle nut" turning from a
  // safe abstain into a wrong answer when the toggle was enabled.
  let bm25Max = 0;
  for (let i = 0; i < bm25Scores.length; i++) {
    if (bm25Scores[i] > bm25Max) bm25Max = bm25Scores[i];
  }

  // --- rerank ----------------------------------------------------------
  let candidates: Candidate[] = pool.map((i) => {
    const f = index.fasteners[i];
    const { score, signals } = rerankScore(
      f,
      index.docs[i],
      q,
      index.bm25,
      bm25Scores[i],
      bm25Max,
      fuzzyScores[i],
      opts.queryEmbedding && index.embeddings ? embScores[i] : null,
    );
    const gate = positionGate(f, q.hints);
    return {
      fastener: f,
      score,
      norm: Math.min(1, score),
      signals,
      blockedBy: gate.passed ? null : gate.reason,
    };
  });

  candidates.sort((a, b) => b.score - a.score);

  const blocked = candidates.filter((c) => c.blockedBy).length;
  // Blocked candidates are kept in the list (the user may have mis-stated a
  // position) but can never be the auto-answer, and are ranked below eligible ones.
  const eligible = candidates.filter((c) => !c.blockedBy);

  const top1 = eligible[0]?.norm ?? 0;
  const top2 = eligible[1]?.norm ?? 0;
  const margin = top1 - top2;

  const diagnostics = {
    top1, top2, margin,
    gatePassed: !!eligible.length,
    blocked,
    totalScanned: index.docs.length,
    usedEmbeddings: !!(opts.queryEmbedding && index.embeddings),
    thresholds: { top1: thresholds.top1, margin: thresholds.margin },
  };

  const shown = candidates.slice(0, SHOWN_CANDIDATES);
  const nearbyOf = (f: Fastener) =>
    index.fasteners
      .filter((o) => o.assembly === f.assembly && o.id !== f.id)
      .slice(0, 8);

  if (!eligible.length || top1 < thresholds.floor) {
    return {
      ...empty(
        "not_found",
        blocked > 0
          ? "Every close match contradicts the position you gave. Nothing here is safe to return."
          : "No fastener in this vehicle's data matched that. It may not be in the source document — see Coverage.",
      ),
      candidates: shown,
      diagnostics,
    };
  }

  const best = eligible[0];

  // --- the gate --------------------------------------------------------
  const reasons: string[] = [];
  if (top1 < thresholds.top1) reasons.push("no single match scored high enough");
  if (eligible.length > 1 && margin < thresholds.margin) {
    reasons.push("several fasteners matched about equally well");
  }

  // UNKNOWN-VOCABULARY GATE.
  //
  // If a meaningful share of the words the user actually typed appear nowhere
  // in this vehicle's data, they are describing a part this car does not have
  // — and whatever did match, matched on the leftovers.
  //
  // This caught a genuine wrong answer: "trailing arm pivot bolt" (a C3 part)
  // returned "Headlamp Motor/Actuator to Pivot Arm Nut", because "pivot" and
  // "arm" are present and only "trailing" was missing. Down-weighting the
  // missing term by IDF narrowed the gap but did not close it; treating
  // unknown vocabulary as disqualifying does.
  const typed = typedInformativeTerms(rawQuery);
  // A term only counts as unknown if the INDEX lacks it AND we have no
  // synonym mapping for it. Otherwise position words and slang the project
  // understands ("bottom", "lugnut", "banjo") would read as foreign parts.
  const unknown = typed.filter((t) => index.bm25.isUnknown(t) && !isKnownVocabulary(t));
  if (typed.length && unknown.length / typed.length >= 1 / 3) {
    reasons.push(
      `this vehicle's data has no "${unknown.join('", "')}" — that may be a part it doesn't have`,
    );
  }

  if (best.fastener.conflict) {
    return {
      outcome: "conflict",
      query: rawQuery,
      vehicleId: index.dataset.vehicle.id,
      fastener: best.fastener,
      candidates: shown,
      reason: best.fastener.conflict.reason,
      positionHints: q.hints as Record<string, string>,
      nearby: nearbyOf(best.fastener),
      diagnostics,
    };
  }

  if (reasons.length) {
    return {
      outcome: "abstain",
      query: rawQuery,
      vehicleId: index.dataset.vehicle.id,
      fastener: null,
      candidates: shown,
      reason: `Not confident which fastener you mean — ${reasons.join(", and ")}. Pick the one you're looking at.`,
      positionHints: q.hints as Record<string, string>,
      nearby: nearbyOf(best.fastener),
      diagnostics,
    };
  }

  return {
    outcome: "answer",
    query: rawQuery,
    vehicleId: index.dataset.vehicle.id,
    fastener: best.fastener,
    candidates: shown,
    reason: "",
    positionHints: q.hints as Record<string, string>,
    nearby: nearbyOf(best.fastener),
    diagnostics,
  };
}

/** Browse support: every fastener in an assembly, for the tree view. */
export function byAssembly(dataset: Dataset): Map<string, Fastener[]> {
  const out = new Map<string, Fastener[]>();
  for (const f of dataset.fasteners) {
    const list = out.get(f.assembly) ?? [];
    list.push(f);
    out.set(f.assembly, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export { stem };
