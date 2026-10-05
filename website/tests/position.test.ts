import { describe, expect, it } from "vitest";
import {
  effectivePosition,
  extractPositionHints,
  positionGate,
  positionScore,
} from "@/lib/search/position";
import type { Fastener, Position } from "@/lib/types";

function fastener(
  partial: Omit<Partial<Fastener>, "position"> & { position?: Partial<Position> },
): Fastener {
  const position: Position = {
    vertical: null, longitude: null, lateral: null, radial: null,
    ...(partial.position ?? {}),
  };
  return {
    id: "test/f", name: "Test Bolt", assembly: "Chassis > Rear Suspension",
    stages: [{ no: 1, label: "", kind: "torque", primary: "50 N·m", secondary: "37 lb ft", angle: null, detail: "" }],
    multiStage: false, sequenceNote: "", warnings: [],
    provenance: {
      tier: "B", status: "machine_extracted", sourceIds: [], locators: [],
      sections: [], pages: [], verbatim: "", allVerbatim: [], corroboratingSections: 1,
    },
    conflict: null, sourceDefects: [],
    ...partial,
    position,
  };
}

describe("extractPositionHints", () => {
  it("reads the plain axis words", () => {
    expect(extractPositionHints("rear lower bolt")).toEqual({
      longitude: "rear", vertical: "lower",
    });
  });

  it("normalises colloquial synonyms", () => {
    expect(extractPositionHints("bottom bolt at the back")).toEqual({
      vertical: "lower", longitude: "rear",
    });
    expect(extractPositionHints("driver side")).toEqual({ lateral: "LH" });
    expect(extractPositionHints("passenger front")).toEqual({
      lateral: "RH", longitude: "front",
    });
  });

  it("drops an axis the query asserts BOTH ways, rather than guessing", () => {
    // "front and rear brakes" genuinely means both; picking one would be wrong.
    expect(extractPositionHints("front and rear brake caliper")).toEqual({});
  });

  it("returns nothing for a query with no position words", () => {
    expect(extractPositionHints("cylinder head bolts")).toEqual({});
  });

  it("is not confused by punctuation or hyphens", () => {
    expect(extractPositionHints("driver's-side, lower")).toEqual({
      lateral: "LH", vertical: "lower",
    });
  });
});

describe("positionGate", () => {
  it("blocks a direct contradiction", () => {
    const f = fastener({ position: { vertical: "upper" } });
    const g = positionGate(f, { vertical: "lower" });
    expect(g.passed).toBe(false);
    expect(g.contradictedAxis).toBe("vertical");
    expect(g.reason).toContain("lower");
    expect(g.reason).toContain("upper");
  });

  it("ALLOWS silence — an unqualified axis is not disagreement", () => {
    // This asymmetry is deliberate. Most fasteners carry no position
    // qualifier, so blocking on absence would abstain constantly for no gain.
    const f = fastener({ position: {}, assembly: "Engine > Engine Mechanical" });
    expect(positionGate(f, { vertical: "lower" }).passed).toBe(true);
  });

  it("passes a positive match", () => {
    const f = fastener({ position: { vertical: "lower", longitude: "rear" } });
    expect(positionGate(f, { vertical: "lower", longitude: "rear" }).passed).toBe(true);
  });

  it("blocks when ANY asserted axis contradicts, even if others match", () => {
    const f = fastener({ position: { vertical: "lower", longitude: "front" } });
    const g = positionGate(f, { vertical: "lower", longitude: "rear" });
    expect(g.passed).toBe(false);
    expect(g.contradictedAxis).toBe("longitude");
  });

  it("infers longitude from the assembly path when the name omits it", () => {
    const f = fastener({ position: {}, assembly: "Chassis > Front Suspension" });
    expect(effectivePosition(f).longitude).toBe("front");
    expect(positionGate(f, { longitude: "rear" }).passed).toBe(false);
  });

  it("passes everything when the query asserts no position", () => {
    const f = fastener({ position: { vertical: "upper", lateral: "LH" } });
    expect(positionGate(f, {}).passed).toBe(true);
  });
});

describe("positionScore", () => {
  it("rewards agreement and punishes contradiction asymmetrically", () => {
    const match = fastener({ position: { vertical: "lower" } });
    const clash = fastener({ position: { vertical: "upper" } });
    const silent = fastener({ position: {}, assembly: "Engine > Engine Mechanical" });
    expect(positionScore(match, { vertical: "lower" })).toBeGreaterThan(0);
    expect(positionScore(silent, { vertical: "lower" })).toBe(0);
    // Contradiction must cost more than agreement earns, so a wrong-position
    // candidate can never out-rank a right-position one on this signal.
    expect(positionScore(clash, { vertical: "lower" })).toBeLessThan(
      -positionScore(match, { vertical: "lower" }),
    );
  });
});
