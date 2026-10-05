/** The output guard.
 *
 * Every numeral that reaches the screen must exist in the record it came from.
 *
 * This is deliberately redundant with the architecture: no language model is in
 * the answer path at all, so in principle nothing can inject a number. The guard
 * exists so that if a future change ever puts one there — a "helpful summary",
 * a rephrasing step, a translation — the page fails closed instead of quietly
 * serving a plausible wrong torque value.
 *
 * Redundancy you never trigger is redundancy that's working.
 */

import type { Fastener } from "../types";

export class GuardViolation extends Error {
  constructor(
    message: string,
    readonly offending: string[],
    readonly fastenerId: string,
  ) {
    super(message);
    this.name = "GuardViolation";
  }
}

const NUMERAL = /\d+(?:\.\d+)?/g;

/** All numerals that legitimately belong to this fastener's record. */
export function allowedNumerals(f: Fastener): Set<string> {
  const allowed = new Set<string>();
  const harvest = (s: string | null | undefined) => {
    if (!s) return;
    for (const m of s.match(NUMERAL) ?? []) {
      allowed.add(m);
      // The source prints "8.0-14.0 N·m" but a renderer may show "8-14";
      // accept the trimmed form of any value the record genuinely contains.
      if (m.includes(".")) allowed.add(String(parseFloat(m)));
    }
  };

  for (const s of f.stages) {
    harvest(s.primary);
    harvest(s.secondary);
    harvest(s.detail);
    // The converted unit is part of the record, so it is allowed on screen —
    // but only because it was computed at ingest and stored, never produced
    // during rendering.
    harvest(s.derived?.value);
    if (s.angle != null) allowed.add(String(s.angle));
    allowed.add(String(s.no));
  }
  harvest(f.name);
  harvest(f.provenance.verbatim);
  for (const v of f.provenance.allVerbatim) harvest(v);
  for (const l of f.provenance.locators) harvest(l);
  for (const p of f.provenance.pages) allowed.add(String(p));
  for (const w of f.warnings) harvest(w.text);
  harvest(f.sequenceNote);
  for (const c of f.corroboration ?? []) {
    harvest(c.value);
    harvest(c.note);
  }
  if (f.supersedes) {
    harvest(f.supersedes.oldValue);
    harvest(f.supersedes.bulletin);
    harvest(f.supersedes.note);
  }
  for (const d of f.sourceDefects) harvest(d.detail);
  if (f.conflict) {
    for (const vals of Object.values(f.conflict.byStage)) {
      for (const v of vals) harvest(v);
    }
  }
  return allowed;
}

/**
 * Assert that `rendered` introduces no numeral absent from the record.
 *
 * Throws GuardViolation rather than returning a flag: a violation is not a
 * degraded answer to be shown with a warning, it is a bug that must not reach
 * a user who might torque a bolt to the result.
 */
export function assertNoInventedNumbers(rendered: string, f: Fastener): void {
  const allowed = allowedNumerals(f);
  const offending = (rendered.match(NUMERAL) ?? []).filter((n) => {
    if (allowed.has(n)) return false;
    if (allowed.has(String(parseFloat(n)))) return false;
    return true;
  });
  if (offending.length) {
    throw new GuardViolation(
      `Rendered output contains ${offending.length} numeral(s) absent from the source record: ${offending.join(", ")}`,
      offending,
      f.id,
    );
  }
}

/** Non-throwing form, for a UI that wants to render a safe fallback. */
export function checkNoInventedNumbers(
  rendered: string,
  f: Fastener,
): { ok: true } | { ok: false; offending: string[] } {
  try {
    assertNoInventedNumbers(rendered, f);
    return { ok: true };
  } catch (e) {
    if (e instanceof GuardViolation) return { ok: false, offending: e.offending };
    throw e;
  }
}
