/** The optional semantic layer.
 *
 * Two implementations, selected at runtime:
 *
 *  1. CONCEPT VECTORS (default, always available, zero download).
 *     Each synonym group in synonyms.ts becomes one dimension of a concept
 *     space. A fastener and a query are both projected into it, and cosine
 *     similarity measures shared *concepts* rather than shared tokens. This
 *     catches paraphrases with no lexical overlap at all — "what holds the
 *     anti-roll bar to the chassis" shares zero tokens with "Stabilizer Shaft
 *     Insulator Clamp Bolts" but shares two concepts.
 *
 *     This is NOT a neural embedding and is not labelled as one. It is a
 *     deterministic, inspectable projection — which for a 735-row corpus of
 *     short technical names is a reasonable trade: no 30 MB download, no
 *     WebGPU dependency, and every dimension has a name you can read.
 *
 *  2. ONNX (opt-in, requires self-hosted model files).
 *     If a real sentence embedder is installed under /models, it is used
 *     instead. The hook exists so the upgrade is a drop-in; see
 *     docs/07-stack-and-running.md.
 *
 * CRITICAL: this layer feeds CANDIDATE GENERATION only. It is deliberately
 * absent from the rerank sum in engine.ts, so it can widen the candidate pool
 * but never reorder it. That makes the guarantee structural: a weaker, broken
 * or missing semantic layer costs RECALL (more abstains) and can never turn a
 * safe abstain into a wrong answer.
 *
 * This was found by test, not by reasoning. With the semantic score inside the
 * rerank sum, enabling the toggle changed "rear axle nut" from correct to
 * "Cover Bolts and Stud" and made "motor mount" answer where it should have
 * asked. See docs/04-accuracy-architecture.md.
 */

import type { Fastener } from "../types";
import { SYNONYM_GROUPS } from "./synonyms";
import { normalise } from "./lexical";

export interface Embedder {
  readonly kind: "concept" | "onnx";
  readonly label: string;
  readonly dims: number;
  embed(text: string): Promise<Float32Array>;
}

/* ------------------------------------------------------------------ */
/* Concept space                                                       */
/* ------------------------------------------------------------------ */

/** Extra dimensions beyond the synonym groups: position and major subsystem.
 *  These let a query like "something at the back, underneath" contribute
 *  signal even when it names no part at all. */
const EXTRA_CONCEPTS: Array<[string, string[]]> = [
  ["pos:upper", ["upper", "top"]],
  ["pos:lower", ["lower", "bottom", "underneath"]],
  ["pos:front", ["front", "forward"]],
  ["pos:rear", ["rear", "back", "behind"]],
  ["pos:left", ["left", "lh", "driver"]],
  ["pos:right", ["right", "rh", "passenger"]],
  ["pos:inner", ["inner", "inboard", "inside"]],
  ["pos:outer", ["outer", "outboard", "outside"]],
  ["sys:suspension", ["suspension", "chassis", "ride", "handling", "alignment"]],
  ["sys:brakes", ["brake", "brakes", "braking", "stopping"]],
  ["sys:engine", ["engine", "motor", "block", "internal", "mechanical"]],
  ["sys:driveline", ["driveline", "drivetrain", "transmission", "axle", "differential"]],
  ["sys:steering", ["steering", "steer"]],
  ["sys:body", ["body", "panel", "trim", "bumper", "door", "roof"]],
  ["sys:electrical", ["electrical", "wiring", "lamp", "light", "sensor"]],
  ["sys:cooling", ["cooling", "coolant", "radiator", "thermostat"]],
  ["sys:exhaust", ["exhaust", "muffler", "pipe", "catalytic"]],
  ["sys:fuel", ["fuel", "injector", "tank", "pump"]],
  ["attr:fastener", ["bolt", "nut", "screw", "stud", "clamp", "bracket"]],
];

/** Dimension name -> index. Stable because SYNONYM_GROUPS is a literal. */
const CONCEPT_INDEX = new Map<string, number>();
/** Surface phrase -> dimension indices it activates. */
const PHRASE_TO_DIMS = new Map<string, number[]>();

function registerPhrase(phrase: string, dim: number): void {
  const existing = PHRASE_TO_DIMS.get(phrase);
  if (existing) {
    if (!existing.includes(dim)) existing.push(dim);
  } else {
    PHRASE_TO_DIMS.set(phrase, [dim]);
  }
}

(() => {
  let dim = 0;
  for (const group of SYNONYM_GROUPS) {
    const name = `grp:${group[0].replace(/\s+/g, "_")}`;
    CONCEPT_INDEX.set(name, dim);
    for (const phrase of group) registerPhrase(phrase, dim);
    dim++;
  }
  for (const [name, phrases] of EXTRA_CONCEPTS) {
    CONCEPT_INDEX.set(name, dim);
    for (const phrase of phrases) registerPhrase(phrase, dim);
    dim++;
  }
})();

export const CONCEPT_DIMS = CONCEPT_INDEX.size;

/** Phrases sorted longest-first so "sway bar link" claims its span before
 *  "sway bar" does. */
const CONCEPT_PHRASES = [...PHRASE_TO_DIMS.keys()].sort((a, b) => b.length - a.length);

/** Project text into the concept space and L2-normalise, so cosine is a plain
 *  dot product at query time. */
export function conceptVector(text: string): Float32Array {
  const v = new Float32Array(CONCEPT_DIMS);
  const hay = ` ${normalise(text)} `;
  const claimed: Array<[number, number]> = [];

  for (const phrase of CONCEPT_PHRASES) {
    const needle = ` ${phrase} `;
    let from = 0;
    for (;;) {
      const at = hay.indexOf(needle, from);
      if (at === -1) break;
      from = at + 1;
      const span: [number, number] = [at, at + needle.length];
      // Longest-match-wins: reject any overlap, not just containment. Same
      // reasoning as expandPhrases in synonyms.ts.
      if (claimed.some(([s, e]) => span[0] < e - 1 && s < span[1] - 1)) continue;
      claimed.push(span);
      for (const d of PHRASE_TO_DIMS.get(phrase)!) v[d] += 1;
    }
  }

  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  if (norm > 0) {
    const inv = 1 / Math.sqrt(norm);
    for (let i = 0; i < v.length; i++) v[i] *= inv;
  }
  return v;
}

/** Text used to project a fastener. Mirrors engine.indexedText but is kept
 *  separate so changing one cannot silently skew the other.
 *  Note the absence of any torque value. */
export function fastenerConceptText(f: Fastener): string {
  return [
    f.name,
    f.assembly.replace(/>/g, " "),
    ...(f.aliases ?? []),
    f.position.vertical ?? "",
    f.position.longitude ?? "",
    f.position.lateral ?? "",
    f.position.radial ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildConceptVectors(fasteners: Fastener[]): Float32Array[] {
  return fasteners.map((f) => conceptVector(fastenerConceptText(f)));
}

const conceptEmbedder: Embedder = {
  kind: "concept",
  label: "Concept vectors (offline, no download)",
  dims: CONCEPT_DIMS,
  embed: (text: string) => Promise.resolve(conceptVector(text)),
};

/* ------------------------------------------------------------------ */
/* Optional ONNX upgrade                                               */
/* ------------------------------------------------------------------ */

/** A real sentence embedder can be registered by an optional script that the
 *  page loads from /models. Nothing in the bundle depends on it, so the build
 *  has no heavyweight dependency and Vercel has nothing extra to serve unless
 *  the files are actually added. */
interface OnnxProvider {
  label?: string;
  dims: number;
  embed(text: string): Promise<Float32Array> | Float32Array;
}

declare global {
  interface Window {
    __torqueEmbedder?: OnnxProvider;
  }
}

function onnxEmbedderIfPresent(): Embedder | null {
  if (typeof window === "undefined") return null;
  const p = window.__torqueEmbedder;
  if (!p || typeof p.embed !== "function" || !p.dims) return null;
  return {
    kind: "onnx",
    label: p.label ?? `Self-hosted sentence embedder (${p.dims}d)`,
    dims: p.dims,
    embed: async (text: string) => {
      const out = await p.embed(text);
      return out instanceof Float32Array ? out : new Float32Array(out);
    },
  };
}

/**
 * Resolve the best available semantic backend.
 *
 * Never rejects for "no model installed" — the concept backend is always
 * there. It rejects only if a registered ONNX provider is itself broken, so a
 * genuine failure is visible rather than silently downgraded.
 */
export async function loadEmbedder(): Promise<Embedder> {
  const onnx = onnxEmbedderIfPresent();
  if (!onnx) return conceptEmbedder;
  // Prove the provider works before handing it to the search path.
  const probe = await onnx.embed("test");
  if (!(probe instanceof Float32Array) || probe.length !== onnx.dims) {
    throw new Error(
      `Registered embedder returned ${probe?.length ?? "nothing"} values, expected ${onnx.dims}`,
    );
  }
  return onnx;
}
