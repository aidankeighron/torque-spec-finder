/** The deterministic position gate.
 *
 * This is the single most important check in the system, and it is deliberately
 * NOT a score.
 *
 * Adjacent-bolt confusion is the only wrong answer this system will realistically
 * produce. "Rear sway bar UPPER bolt" and "rear sway bar LOWER bolt" are one token
 * apart and semantically enormous — any similarity measure, lexical or neural,
 * rates them nearly identically. A threshold cannot separate them. A hard
 * constraint can.
 *
 * Asymmetry that matters:
 *   query says 'lower', candidate says 'upper'   -> CONTRADICTION, blocked
 *   query says 'lower', candidate says nothing   -> allowed
 *
 * Silence is not disagreement. Most fasteners carry no position qualifier, so
 * blocking on absence would abstain constantly for no safety gain.
 */

import type { Fastener, Position } from "../types";

export type Axis = "vertical" | "longitude" | "lateral" | "radial";

/** Query words -> the canonical axis value they assert. */
const AXIS_WORDS: Record<Axis, Record<string, string>> = {
  vertical: {
    upper: "upper", up: "upper", top: "upper", uppermost: "upper",
    lower: "lower", low: "lower", bottom: "lower", underneath: "lower",
    under: "lower", beneath: "lower",
  },
  longitude: {
    front: "front", fwd: "front", forward: "front", foward: "front",
    rear: "rear", back: "rear", behind: "rear", aft: "rear", rearward: "rear",
  },
  lateral: {
    left: "LH", lh: "LH", driver: "LH", drivers: "LH", "driver's": "LH",
    right: "RH", rh: "RH", passenger: "RH", passengers: "RH", "passenger's": "RH",
  },
  radial: {
    inner: "inboard", inboard: "inboard", inside: "inboard", medial: "inboard",
    outer: "outboard", outboard: "outboard", outside: "outboard", lateral: "outboard",
  },
};

export const AXIS_LABEL: Record<Axis, string> = {
  vertical: "upper/lower",
  longitude: "front/rear",
  lateral: "left/right",
  radial: "inner/outer",
};

/**
 * Extract position assertions from the raw query.
 *
 * Runs BEFORE any scoring or model involvement, on the raw user text, so the
 * gate can never be influenced by a ranking decision.
 *
 * If a query asserts BOTH values on one axis ("front and rear brakes"), that
 * axis is dropped rather than guessed — the user genuinely wants both.
 */
export function extractPositionHints(query: string): Partial<Record<Axis, string>> {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);

  const hits: Record<string, Set<string>> = {};
  for (const word of words) {
    for (const axis of Object.keys(AXIS_WORDS) as Axis[]) {
      const val = AXIS_WORDS[axis][word];
      if (val) (hits[axis] ??= new Set()).add(val);
    }
  }

  const out: Partial<Record<Axis, string>> = {};
  for (const [axis, vals] of Object.entries(hits)) {
    if (vals.size === 1) out[axis as Axis] = [...vals][0];
  }
  return out;
}

/** Position values present on a candidate, from its own axes plus its
 *  assembly path (a fastener inside "Rear Suspension" is at the rear even if
 *  its own name omits the word). */
export function effectivePosition(f: Fastener): Position {
  const pos: Position = { ...f.position };
  const path = f.assembly.toLowerCase();
  if (!pos.longitude) {
    if (/\bfront\b/.test(path)) pos.longitude = "front";
    else if (/\brear\b/.test(path)) pos.longitude = "rear";
  }
  return pos;
}

export interface GateResult {
  passed: boolean;
  /** Human-readable reason, from a fixed set — never model-generated. */
  reason: string | null;
  contradictedAxis: Axis | null;
}

/**
 * The gate itself. Returns whether `f` may be auto-answered given the hints.
 */
export function positionGate(
  f: Fastener,
  hints: Partial<Record<Axis, string>>,
): GateResult {
  const pos = effectivePosition(f);
  for (const axis of Object.keys(hints) as Axis[]) {
    const want = hints[axis]!;
    const have = pos[axis];
    if (have && have !== want) {
      return {
        passed: false,
        contradictedAxis: axis,
        reason: `You asked for "${want}" but this fastener is "${have}" (${AXIS_LABEL[axis]}).`,
      };
    }
  }
  return { passed: true, reason: null, contradictedAxis: null };
}

/** Small ranking bonus for candidates that positively match a hint, and a
 *  penalty for those that contradict one. Separate from the gate: this nudges
 *  ordering, the gate decides eligibility. */
export function positionScore(
  f: Fastener,
  hints: Partial<Record<Axis, string>>,
): number {
  const pos = effectivePosition(f);
  let score = 0;
  for (const axis of Object.keys(hints) as Axis[]) {
    const want = hints[axis]!;
    const have = pos[axis];
    if (!have) continue;
    score += have === want ? 1 : -2;
  }
  return score;
}
