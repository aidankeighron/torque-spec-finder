/** Tokenisation, BM25, and fuzzy matching.
 *
 * BM25 is here rather than embeddings-only because fastener queries live on
 * exact tokens: M10x1.5, LS1, Z51, LH, "M11", part names. Embeddings blur
 * exactly those. The semantic layer (lib/search/embeddings.ts) is an optional
 * addition on top, never a replacement.
 */

import { GENERIC_TERMS, STOPWORDS } from "./synonyms";

export interface Doc {
  id: string;
  /** Tokens, already normalised. */
  tokens: string[];
  /** Character trigrams, for typo tolerance. */
  trigrams: Set<string>;
  text: string;
}

export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[·∙]/g, " ")
    .replace(/[^a-z0-9.\s/x-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Light stemmer: plural and common suffix folding. Deliberately conservative —
 *  over-stemming merges distinct fasteners. */
export function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 6) return w.slice(0, -3);
  return w;
}

export function tokenize(s: string, keepStopwords = false): string[] {
  return normalise(s)
    .split(" ")
    .filter(Boolean)
    .filter((w) => keepStopwords || !STOPWORDS.has(w))
    .map(stem)
    .filter(Boolean);
}

export function trigrams(s: string): Set<string> {
  const t = ` ${normalise(s).replace(/\s+/g, " ")} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

/* ---------------- BM25 ---------------- */

const K1 = 1.4;
const B = 0.7;

export class Bm25 {
  private readonly docs: Doc[];
  private readonly df = new Map<string, number>();
  private readonly avgLen: number;
  private readonly tfCache: Array<Map<string, number>> = [];

  /** Number of indexed documents. */
  get size(): number {
    return this.docs.length;
  }

  constructor(docs: Doc[]) {
    this.docs = docs;
    let total = 0;
    for (const d of docs) {
      total += d.tokens.length;
      const tf = new Map<string, number>();
      for (const t of d.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      this.tfCache.push(tf);
      for (const t of new Set(d.tokens)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avgLen = docs.length ? total / docs.length : 0;
  }

  /** Standard BM25 idf, floored at a small positive value so a term appearing
   *  in most documents still contributes a little. Public because coverage
   *  weighting needs it too. */
  idf(term: string): number {
    const n = this.docs.length;
    const df = this.df.get(term) ?? 0;
    return Math.max(0.01, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
  }

  /** True when the term appears in no document at all. */
  isUnknown(term: string): boolean {
    return !this.df.has(term);
  }

  /** `weights` lets the caller down-weight generic words and expansions. */
  score(queryTerms: string[], weights?: Map<string, number>): Float64Array {
    const out = new Float64Array(this.docs.length);
    for (let i = 0; i < this.docs.length; i++) {
      const tf = this.tfCache[i];
      const len = this.docs[i].tokens.length || 1;
      let s = 0;
      for (const term of queryTerms) {
        const f = tf.get(term);
        if (!f) continue;
        const w = weights?.get(term) ?? 1;
        const denom = f + K1 * (1 - B + (B * len) / (this.avgLen || 1));
        s += w * this.idf(term) * ((f * (K1 + 1)) / denom);
      }
      out[i] = s;
    }
    return out;
  }
}

/* ---------------- coverage & fuzzy ---------------- */

/**
 * How much of what the user asked for the document actually contains,
 * weighted by how informative each term is.
 *
 * Plain unweighted coverage treats all words as equal, which produced a real
 * wrong answer: "trailing arm pivot bolt" scored 2-of-3 against "Headlamp
 * Motor/Actuator to Pivot Arm Nut", because "pivot" and "arm" are common and
 * "trailing" — the word that actually identifies the part, and which appears
 * nowhere in this vehicle's data — counted the same as them.
 *
 * Weighting by IDF makes missing a rare term expensive. An unknown term (df=0)
 * is treated as maximally informative, so a query naming a part this vehicle
 * does not have cannot reach a high coverage score.
 */
export function coverage(queryTerms: string[], doc: Doc, bm25?: Bm25): number {
  const informative = queryTerms.filter((t) => !GENERIC_TERMS.has(t));
  if (!informative.length) return 0;
  const present = new Set(doc.tokens);

  if (!bm25) {
    let hit = 0;
    for (const t of informative) if (present.has(t)) hit++;
    return hit / informative.length;
  }

  // An unknown term is as informative as the rarest known one can be.
  const maxIdf = Math.log(1 + (bm25.size + 0.5) / 0.5);
  let got = 0;
  let total = 0;
  for (const t of informative) {
    const w = bm25.isUnknown(t) ? maxIdf : bm25.idf(t);
    total += w;
    if (present.has(t)) got += w;
  }
  return total > 0 ? got / total : 0;
}

/** Jaccard similarity over character trigrams. Catches typos and spacing
 *  differences ("swaybar" vs "sway bar", "stabalizer" vs "stabilizer"). */
export function trigramSim(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const g of small) if (large.has(g)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Reciprocal Rank Fusion.
 *
 *  Used rather than a weighted sum because BM25 scores are unbounded while
 *  trigram and cosine similarities are bounded — any weighted blend would
 *  require inventing a conversion between incomparable scales. Fusing by RANK
 *  needs no such invention. */
export function rrf(rankings: number[][], k = 60): Map<number, number> {
  const fused = new Map<number, number>();
  for (const ranking of rankings) {
    ranking.forEach((docIdx, rank) => {
      fused.set(docIdx, (fused.get(docIdx) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return fused;
}

/** Indices of the top `n` entries of `scores`, descending, excluding zeros. */
export function topIndices(scores: ArrayLike<number>, n: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i < scores.length; i++) if (scores[i] > 0) idx.push(i);
  idx.sort((a, b) => scores[b] - scores[a]);
  return idx.slice(0, n);
}
