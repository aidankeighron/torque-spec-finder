/** Deterministic rendering of a fastener record into display strings.
 *
 * Every function here is a pure template over typed fields. No value is
 * computed, converted, rounded, or inferred — what the source printed is what
 * the screen shows. The one derived number anywhere in this app is the
 * cross-check used at INGEST time to detect source defects, and it never
 * reaches a user as a torque value.
 */

import type { Fastener, Stage, Tier } from "../types";

export const TIER_LABEL: Record<Tier, string> = {
  A: "OEM, verified",
  B: "OEM, machine-extracted",
  C: "Licensed secondary",
  D: "Community",
  E: "Generic chart",
};

export const TIER_BLURB: Record<Tier, string> = {
  A: "From a GM document and either human-verified or corroborated by two or more independent sources.",
  B: "From the official GM specification tables, extracted automatically. Passed the N·m / lb-ft cross-check.",
  C: "From a licensed secondary publisher rather than GM directly.",
  D: "From community sources. Shown only as corroboration, never as the sole basis for an answer.",
  E: "A generic value by thread size and grade. NOT specific to this vehicle.",
};

/** One column of the unit row. */
export interface UnitColumn {
  /** Number only, e.g. "100", "8.9", "8-14". */
  value: string;
  /** Unit label, e.g. "lb ft". */
  unit: string;
  /** false when the value was converted at ingest rather than printed by GM. */
  printed: boolean;
}

/** Display order: foot-pounds, then inch-pounds, then Newton-metres.
 *
 *  lb-ft first because that is what the wrench in your hand reads. N·m last
 *  because it is the source's primary and therefore the one you'd only check
 *  when cross-referencing the manual. */
const UNIT_ORDER = ["lb ft", "lb in", "N·m"] as const;

function splitValue(text: string): { value: string; unit: string } | null {
  // "100 lb ft" -> { value: "100", unit: "lb ft" }; "+90°" -> null
  const m = /^([\d.\-–]+)\s*(N·m|lb ft|lb in)$/.exec(text.trim());
  return m ? { value: m[1], unit: m[2] } : null;
}

/**
 * The unit columns for one torque stage, in display order.
 *
 * Returns [] for angle and turn-count stages, which have no units — those are
 * rendered as their own thing rather than squeezed into this layout.
 */
export function unitColumns(s: Stage): UnitColumn[] {
  if (s.kind !== "torque") return [];
  const found = new Map<string, UnitColumn>();

  for (const text of [s.primary, s.secondary]) {
    if (!text) continue;
    const parsed = splitValue(text);
    if (parsed) found.set(parsed.unit, { ...parsed, printed: true });
  }
  if (s.derived && !found.has(s.derived.unit)) {
    found.set(s.derived.unit, { value: s.derived.value, unit: s.derived.unit, printed: false });
  }

  return UNIT_ORDER.map((u) => found.get(u)).filter((c): c is UnitColumn => !!c);
}

/** The primary line, e.g. "80 N·m" / "60 lb ft", or a stage count. */
export function headline(f: Fastener): { primary: string; secondary: string | null } {
  if (f.stages.length === 1) {
    const s = f.stages[0];
    return { primary: s.primary, secondary: s.secondary };
  }
  return {
    primary: `${f.stages.length} stages`,
    secondary: "all stages required — a single number would be wrong here",
  };
}

export function stageLine(s: Stage): string {
  const parts = [s.primary];
  if (s.secondary) parts.push(`(${s.secondary})`);
  return parts.join(" ");
}

export function stageName(s: Stage): string {
  if (s.label) return s.label;
  return s.no === 1 ? "Torque" : `Stage ${s.no}`;
}

/** One printed unit for a stage, preferring lb-ft, then lb-in, then N·m.
 *  Used in lists where there is only room for one figure. */
export function compactValue(s: Stage): string {
  const cols = unitColumns(s).filter((c) => c.printed);
  if (!cols.length) return s.primary;
  return `${cols[0].value} ${cols[0].unit}`;
}

/** Short one-line summary used in candidate lists, nearby, and browse. */
export function compactSpec(f: Fastener): string {
  if (!f.stages.length) return "—";
  return f.stages.map((s) => compactValue(s)).join(" → ");
}

export function assemblyCrumbs(f: Fastener): string[] {
  return f.assembly.split(">").map((s) => s.trim());
}

export function positionSummary(f: Fastener): string[] {
  const out: string[] = [];
  const p = f.position;
  if (p.longitude) out.push(p.longitude);
  if (p.vertical) out.push(p.vertical);
  if (p.lateral) out.push(p.lateral);
  if (p.radial) out.push(p.radial);
  return out;
}

/** Everything the answer card will display, as one string. Passing this to the
 *  guard checks the whole card at once rather than field by field. */
export function renderedTextForGuard(f: Fastener): string {
  const h = headline(f);
  return [
    f.name,
    f.assembly,
    h.primary,
    h.secondary ?? "",
    ...f.stages.map((s) => `${stageName(s)} ${stageLine(s)} ${s.detail}`),
    ...f.stages.flatMap((s) => unitColumns(s).map((c) => `${c.value} ${c.unit}`)),
    f.sequenceNote,
    ...f.warnings.map((w) => w.text),
    f.provenance.verbatim,
    ...f.provenance.locators,
    ...(f.corroboration ?? []).map((c) => `${c.value} ${c.note ?? ""}`),
    f.supersedes ? `${f.supersedes.oldValue} ${f.supersedes.note ?? ""}` : "",
    ...f.sourceDefects.map((d) => d.detail),
    compactSpec(f),
    ...positionSummary(f),
  ].join(" \n ");
}

export interface ConfidenceView {
  matchLabel: string;
  matchNote: string;
  tier: Tier;
  tierLabel: string;
  tierNote: string;
  corroborationNote: string;
}

/** The two confidence axes, never blended into one score. */
export function confidence(
  f: Fastener,
  diagnostics: { top1: number; margin: number; thresholds: { top1: number; margin: number } },
): ConfidenceView {
  const { top1, margin, thresholds } = diagnostics;
  const strong = top1 >= thresholds.top1 + 0.18 && margin >= thresholds.margin * 2;
  const agreeing = (f.corroboration ?? []).filter((c) => c.agrees).length;
  const disagreeing = (f.corroboration ?? []).filter((c) => !c.agrees).length;

  let corroborationNote: string;
  if (f.supersedes) {
    corroborationNote = "Value comes from a GM bulletin that revised the manual.";
  } else if (agreeing >= 2) {
    corroborationNote = `Confirmed by ${agreeing} independent sources.`;
  } else if (agreeing === 1) {
    corroborationNote = "Confirmed by 1 independent source.";
  } else {
    corroborationNote = `Single source: the GM specification tables (${f.provenance.corroboratingSections > 1 ? `listed in ${f.provenance.corroboratingSections} sections` : "one section"}).`;
  }
  if (disagreeing) {
    corroborationNote += ` ${disagreeing} source disagrees — see Sources.`;
  }

  return {
    matchLabel: strong ? "Confident match" : "Probable match",
    matchNote: strong
      ? "Clear leader, and no position conflict with your wording."
      : "Best match, but the gap to the next candidate is modest. Check the name.",
    tier: f.provenance.tier,
    tierLabel: TIER_LABEL[f.provenance.tier],
    tierNote: TIER_BLURB[f.provenance.tier],
    corroborationNote,
  };
}
