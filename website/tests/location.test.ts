import { describe, expect, it } from "vitest";
import { locationView, regionLabel } from "@/lib/render/location";
import { getVehicle } from "@/lib/registry";
import type { Fastener, Position } from "@/lib/types";

const c5 = getVehicle("c5-2003-base").dataset;
const find = (name: string, assembly?: string) =>
  c5.fasteners.find((f) => f.name === name && (!assembly || f.assembly === assembly))!;

function fake(assembly: string, position: Partial<Position> = {}): Fastener {
  return {
    id: "c5-2003-base/x",
    name: "Test Bolt",
    assembly,
    position: { vertical: null, longitude: null, lateral: null, radial: null, ...position },
    stages: [],
    multiStage: false,
    sequenceNote: "",
    warnings: [],
    provenance: {
      tier: "B", status: "machine_extracted", sourceIds: [], locators: [],
      sections: [], pages: [], verbatim: "", allVerbatim: [], corroboratingSections: 1,
    },
    conflict: null,
    sourceDefects: [],
  };
}

describe("regionLabel", () => {
  it("takes the most specific path segment", () => {
    expect(regionLabel("Chassis > Brakes > Disc Brakes")).toBe("Disc Brakes");
    expect(regionLabel("Engine > Engine Mechanical")).toBe("Engine Mechanical");
  });
});

describe("never narrows further than the data supports", () => {
  it("lights BOTH sides when the source gives no side", () => {
    // The central safety property here: an invented "driver side" sitting next
    // to a verified torque figure would be confidently wrong.
    const v = locationView(fake("Chassis > Rear Suspension", { longitude: "rear" }));
    expect(v.sides).toEqual(["LH", "RH"]);
    expect(v.sentence).toContain("both sides");
  });

  it("narrows to one side only when the source said so", () => {
    const v = locationView(fake("Chassis > Front Suspension", { lateral: "LH" }));
    expect(v.sides).toEqual(["LH"]);
    expect(v.sentence).toContain("driver side");
    expect(v.sentence).not.toContain("passenger");
  });

  it("falls back to the subsystem region when no axis is known", () => {
    const v = locationView(fake("Interior > Instrument Panel"));
    expect(v.approximate).toBe(true);
    expect(v.sentence).toMatch(/doesn't give a position/i);
    expect(v.bands.length).toBeGreaterThan(1);
  });

  it("is not approximate once any axis is known", () => {
    expect(locationView(fake("Interior > Trim", { vertical: "lower" })).approximate).toBe(false);
  });
});

describe("band derivation", () => {
  it("uses the fastener's own longitude when present", () => {
    expect(locationView(fake("Engine > Engine Mechanical", { longitude: "rear" })).bands)
      .toEqual(["rear"]);
  });

  it("falls back to where the subsystem physically lives", () => {
    expect(locationView(fake("Chassis > Front Suspension")).bands).toEqual(["front"]);
    expect(locationView(fake("Driveline > Rear Drive Axle")).bands).toEqual(["rear"]);
    expect(locationView(fake("Driveline > Propeller Shaft")).bands).toEqual(["mid"]);
  });

  it("lights several bands for things that exist at both ends", () => {
    expect(locationView(fake("Chassis > Wheels and Tires")).bands).toEqual(["front", "rear"]);
    expect(locationView(fake("Chassis > Brakes > Disc Brakes")).bands).toEqual(["front", "rear"]);
  });
});

describe("the sentence is spelled out, not abbreviated", () => {
  it("writes driver/passenger rather than LH/RH", () => {
    // "LH" is ambiguous when you are lying under the car facing backwards.
    const v = locationView(fake("Chassis > Front Suspension", { lateral: "RH", longitude: "front" }));
    expect(v.sentence).toContain("passenger side");
    expect(v.sentence).not.toMatch(/\bRH\b/);
  });

  it("describes 'lower' in the way you'd actually look for it", () => {
    const v = locationView(fake("Chassis > Rear Suspension", { vertical: "lower", longitude: "rear" }));
    expect(v.sentence).toContain("underneath");
  });

  it("explains inboard and outboard rather than assuming they're understood", () => {
    expect(locationView(fake("Driveline > Wheel Drive Shafts", { radial: "inboard" })).sentence)
      .toContain("centreline");
    expect(locationView(fake("Driveline > Wheel Drive Shafts", { radial: "outboard" })).sentence)
      .toContain("wheel");
  });

  it("always ends as a readable sentence", () => {
    for (const f of c5.fasteners) {
      const v = locationView(f);
      expect(v.sentence.length, f.id).toBeGreaterThan(8);
      expect(v.sentence.endsWith("."), f.id).toBe(true);
      expect(v.sentence[0], f.id).toBe(v.sentence[0].toUpperCase());
    }
  });
});

describe("real records", () => {
  it("rear shock lower bolt reads as rear, underneath, both sides", () => {
    const v = locationView(find("Shock Absorber Lower Mounting Bolt", "Chassis > Rear Suspension"));
    expect(v.bands).toEqual(["rear"]);
    expect(v.vertical).toBe("lower");
    expect(v.sentence).toMatch(/rear of the car/i);
    expect(v.sentence).toMatch(/underneath/i);
  });

  it("front upper ball joint reads as front, upper", () => {
    const v = locationView(find("Upper Control Arm Ball Joint Stud Nut", "Chassis > Front Suspension"));
    expect(v.bands).toEqual(["front"]);
    expect(v.vertical).toBe("upper");
  });

  it("lug nuts show all four corners rather than inventing one", () => {
    const v = locationView(find("Wheel Nuts In Sequence"));
    expect(v.bands).toEqual(["front", "rear"]);
    expect(v.sides).toEqual(["LH", "RH"]);
  });
});

describe("whole-dataset coverage", () => {
  it("every fastener gets a view with at least one lit zone", () => {
    for (const f of c5.fasteners) {
      const v = locationView(f);
      expect(v.bands.length, f.id).toBeGreaterThan(0);
      expect(v.sides.length, f.id).toBeGreaterThan(0);
    }
  });

  it("roughly a third have a real position, and the rest say so honestly", () => {
    const views = c5.fasteners.map(locationView);
    const precise = views.filter((v) => !v.approximate).length;
    expect(precise).toBeGreaterThan(200);
    // The remainder must be explicitly labelled approximate, never silently vague.
    for (const v of views.filter((v) => v.approximate)) {
      expect(v.sentence).toMatch(/doesn't give a position/i);
    }
  });
});
