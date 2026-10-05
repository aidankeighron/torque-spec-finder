/** Turning the position axes into something you can actually orient by.
 *
 * Phase A of docs/11-location-and-diagrams.md: no new data, no new sources.
 * Everything here is derived from fields the dataset already carries —
 * `position` (254 of 708 fasteners) and `assembly` (all 708) — so it is
 * correct by construction.
 *
 * The one rule that matters: **never narrow further than the data supports.**
 * If the source did not say which side of the car a fastener is on, both sides
 * light up. An invented "driver side" next to a verified torque figure would be
 * exactly the kind of confident-and-wrong detail this project exists to avoid.
 */

import type { Fastener, Position } from "../types";
import { effectivePosition } from "../search/position";

/** Plan-view zones, as seen from above with the nose pointing up. */
export type Band = "front" | "mid" | "rear";
export type Side = "LH" | "RH";

export interface LocationView {
  /** Longitudinal bands to highlight. More than one means "we don't know". */
  bands: Band[];
  /** Sides to highlight. Both means the source didn't say. */
  sides: Side[];
  /** 'upper' | 'lower' | null — not representable in a plan view, shown separately. */
  vertical: "upper" | "lower" | null;
  radial: "inboard" | "outboard" | null;
  /** Spelled-out sentence. Written out because "LH" is ambiguous when you are
   *  lying under the car facing backwards. */
  sentence: string;
  /** True when the only thing we know is the subsystem, not a position. */
  approximate: boolean;
  /** Short label for the highlighted region, e.g. "Rear Suspension". */
  regionLabel: string;
}

/** Where a subsystem physically lives, when the fastener itself doesn't say.
 *  Keyed on the assembly path prefix; first match wins. */
const ASSEMBLY_BANDS: Array<[RegExp, Band[]]> = [
  [/^Chassis > Front Suspension/, ["front"]],
  [/^Chassis > Rear Suspension/, ["rear"]],
  [/^Chassis > Wheels and Tires/, ["front", "rear"]],
  [/^Chassis > Wheel Alignment/, ["front", "rear"]],
  [/^Chassis > Brakes/, ["front", "rear"]],
  [/^Chassis > Electronic Suspension/, ["front", "rear"]],
  [/^Steering/, ["front", "mid"]],
  [/^Engine/, ["front"]],
  [/^HVAC/, ["front", "mid"]],
  [/^Driveline > Rear Drive Axle/, ["rear"]],
  [/^Driveline > Wheel Drive Shafts/, ["rear"]],
  [/^Driveline > Propeller Shaft/, ["mid"]],
  [/^Driveline > Manual Transmission/, ["mid", "rear"]],
  [/^Driveline > Automatic Transmission/, ["mid", "rear"]],
  [/^Driveline > Clutch/, ["mid"]],
  [/^Driveline/, ["mid", "rear"]],
  [/^Body > Front End/, ["front"]],
  [/^Body > Bumpers/, ["front", "rear"]],
  [/^Body > Rear End/, ["rear"]],
  [/^Body > Roof/, ["mid"]],
  [/^Body > Doors/, ["mid"]],
  [/^Body > Stationary Windows/, ["mid"]],
  [/^Body > Frame/, ["front", "mid", "rear"]],
  [/^Interior > Seat/, ["mid"]],
  [/^Interior > Instrument Panel/, ["front", "mid"]],
  [/^Interior/, ["mid"]],
  [/^Electrical > Lighting/, ["front", "rear"]],
  [/^Electrical/, ["front", "mid"]],
];

function bandsForAssembly(assembly: string): Band[] {
  for (const [re, bands] of ASSEMBLY_BANDS) {
    if (re.test(assembly)) return bands;
  }
  return ["front", "mid", "rear"];
}

const SIDE_WORDS: Record<Side, string> = {
  LH: "driver side",
  RH: "passenger side",
};

/** Last path segment, e.g. "Chassis > Rear Suspension" -> "Rear Suspension". */
export function regionLabel(assembly: string): string {
  const parts = assembly.split(">").map((p) => p.trim());
  return parts[parts.length - 1] || assembly;
}

function buildSentence(
  pos: Position,
  bands: Band[],
  sides: Side[],
  region: string,
  known: boolean,
): string {
  if (!known) {
    return `Somewhere in the ${region.toLowerCase()} — the source doesn't give a position for this one.`;
  }

  const parts: string[] = [];

  if (pos.longitude) {
    parts.push(pos.longitude === "front" ? "front of the car" : "rear of the car");
  } else if (bands.length === 1) {
    parts.push(bands[0] === "mid" ? "middle of the car" : `${bands[0]} of the car`);
  }

  if (pos.vertical) {
    parts.push(pos.vertical === "lower" ? "lower / underneath" : "upper");
  }

  if (sides.length === 1) {
    parts.push(SIDE_WORDS[sides[0]]);
  } else if (pos.lateral === null) {
    parts.push("both sides");
  }

  if (pos.radial) {
    parts.push(pos.radial === "inboard" ? "inboard (toward the centreline)" : "outboard (toward the wheel)");
  }

  if (!parts.length) return `In the ${region.toLowerCase()}.`;
  // Capitalise the first part only; the rest reads as a comma list.
  const text = parts.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

export function locationView(f: Fastener): LocationView {
  const pos = effectivePosition(f);
  const region = regionLabel(f.assembly);

  const bands: Band[] = pos.longitude ? [pos.longitude] : bandsForAssembly(f.assembly);
  // Unknown side means BOTH sides, never a guess.
  const sides: Side[] = pos.lateral ? [pos.lateral] : ["LH", "RH"];

  const known = !!(pos.longitude || pos.vertical || pos.lateral || pos.radial);

  return {
    bands,
    sides,
    vertical: pos.vertical,
    radial: pos.radial,
    sentence: buildSentence(pos, bands, sides, region, known),
    approximate: !known,
    regionLabel: region,
  };
}
