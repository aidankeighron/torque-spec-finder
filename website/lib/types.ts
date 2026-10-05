/** Shapes of the baked datasets and of search results.
 *
 * Note what is absent: there is no field anywhere that holds a
 * model-generated sentence. Every string shown to a user is either copied
 * verbatim from a source document or assembled by a template in lib/render.
 */

export type Tier = "A" | "B" | "C" | "D" | "E";

export type VerificationStatus =
  | "machine_extracted"
  | "dual_verified"
  | "human_verified"
  | "conflicting"
  | "superseded";

/** Position axes. `null` means the source did not qualify this axis, which is
 *  NOT the same as contradicting a query hint. See lib/search/position.ts. */
export interface Position {
  vertical: "upper" | "lower" | null;
  longitude: "front" | "rear" | null;
  lateral: "LH" | "RH" | null;
  radial: "inboard" | "outboard" | null;
}

export type StageKind = "torque" | "angle" | "turns";

export interface Stage {
  no: number;
  label: string; // 'First Pass' | 'Final Pass' | ''
  kind: StageKind;
  /** Verbatim as printed, e.g. "80 N·m", "+90°", "3 1⁄2 flats". */
  primary: string;
  /** Verbatim second unit as printed, e.g. "60 lb ft". Null for non-torque. */
  secondary: string | null;
  angle: number | null;
  /** Which bolts this stage applies to, when the source qualifies it. */
  detail: string;
}

export interface Warning {
  kind: "single_use" | "torque_angle" | "sequence" | "precondition";
  text: string;
}

export interface Provenance {
  tier: Tier;
  status: VerificationStatus;
  sourceIds: string[];
  locators: string[];
  sections: string[];
  pages: number[];
  /** The original source line. This is what makes an answer auditable. */
  verbatim: string;
  allVerbatim: string[];
  corroboratingSections: number;
}

export interface SourceDefect {
  stage: number;
  kind: "unit_label_defect" | "mismatch";
  detail: string;
}

export interface Fastener {
  id: string;
  name: string;
  assembly: string;
  position: Position;
  stages: Stage[];
  multiStage: boolean;
  sequenceNote: string;
  warnings: Warning[];
  provenance: Provenance;
  conflict: { byStage: Record<string, string[]>; reason: string } | null;
  sourceDefects: SourceDefect[];
  /** Extra names for this fastener, from corroborating sources. */
  aliases?: string[];
  /** Independent sources that agree, raising the tier. */
  corroboration?: Corroboration[];
  /** Set when a service bulletin revised this spec. `stages` above already
   *  holds the REVISED values; this records what they replaced, so the UI can
   *  show the change and a user can recognise a stale number they've seen
   *  elsewhere. Shape matches ingest/build_dataset.py::apply_overlay. */
  supersedes?: {
    /** The manual's original stages, kept verbatim. */
    oldStages?: Stage[];
    /** Flattened one-line form of the above, for compact display. */
    oldValue: string;
    oldSource: string;
    /** Source id of the bulletin; look up in Dataset.sources. */
    bulletin: string;
    note?: string;
  } | null;
}

export interface Corroboration {
  sourceId: string;
  value: string;
  agrees: boolean;
  url?: string;
  note?: string;
}

export interface SourceDoc {
  id: string;
  tier: Tier;
  kind: "fsm" | "tsb" | "secondary" | "community" | "generic_chart";
  title: string;
  publisher?: string;
  revision?: string;
  url?: string;
  sha256?: string;
  note?: string;
}

export interface Assembly {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
}

export interface VehicleMeta {
  id: string;
  label: string;
  shortLabel: string;
  platform: string;
  generation: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  engine: string;
  transmissions: string[];
  yearsCovered: string;
  notes: string;
}

export interface Dataset {
  vehicle: VehicleMeta;
  sources: SourceDoc[];
  assemblies: Assembly[];
  fasteners: Fastener[];
  stats: Record<string, number>;
}

/* ---------- search ---------- */

export interface Candidate {
  fastener: Fastener;
  score: number;
  /** Normalised 0-1 for threshold comparison. */
  norm: number;
  signals: {
    bm25: number;
    coverage: number;
    positionBonus: number;
    fuzzy: number;
    embedding: number | null;
    exactName: boolean;
  };
  /** Set when the deterministic position gate blocked this candidate. */
  blockedBy: string | null;
}

export type Outcome =
  | "answer"
  | "abstain"
  | "conflict"
  | "not_found";

export interface SearchResult {
  outcome: Outcome;
  query: string;
  vehicleId: string;
  /** Present for 'answer' and 'conflict'. */
  fastener: Fastener | null;
  /** Ranked alternatives. Always populated when abstaining. */
  candidates: Candidate[];
  /** Why the gate abstained, in plain language, from a fixed set of strings. */
  reason: string;
  positionHints: Record<string, string>;
  /** Fasteners in the same assembly as the top candidate. */
  nearby: Fastener[];
  diagnostics: {
    top1: number;
    top2: number;
    margin: number;
    gatePassed: boolean;
    blocked: number;
    totalScanned: number;
    usedEmbeddings: boolean;
    thresholds: { top1: number; margin: number };
  };
}
