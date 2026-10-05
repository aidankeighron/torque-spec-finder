import { describe, expect, it } from "vitest";
import {
  GuardViolation,
  allowedNumerals,
  assertNoInventedNumbers,
  checkNoInventedNumbers,
} from "@/lib/render/guard";
import { renderedTextForGuard } from "@/lib/render/format";
import type { Fastener } from "@/lib/types";
import { VEHICLES } from "@/lib/registry";

const base: Fastener = {
  id: "c5-2003-base/test",
  name: "Stabilizer Shaft Link Nuts",
  assembly: "Chassis > Rear Suspension",
  position: { vertical: null, longitude: "rear", lateral: null, radial: null },
  stages: [
    { no: 1, label: "", kind: "torque", primary: "72 N·m", secondary: "53 lb ft", angle: null, detail: "" },
  ],
  multiStage: false,
  sequenceNote: "",
  warnings: [],
  provenance: {
    tier: "B", status: "machine_extracted", sourceIds: ["c5-fsm-2003-fasteners"],
    locators: ["Rear Suspension, p.25"], sections: ["Rear Suspension"], pages: [25],
    verbatim: "Stabilizer Shaft Link Nuts 72 N·m 53 lb ft",
    allVerbatim: ["Stabilizer Shaft Link Nuts 72 N·m 53 lb ft"],
    corroboratingSections: 1,
  },
  conflict: null,
  sourceDefects: [],
};

describe("allowedNumerals", () => {
  it("harvests every numeral the record legitimately contains", () => {
    const allowed = allowedNumerals(base);
    expect(allowed.has("72")).toBe(true);
    expect(allowed.has("53")).toBe(true);
    expect(allowed.has("25")).toBe(true); // page
    expect(allowed.has("1")).toBe(true); // stage no
    expect(allowed.has("99")).toBe(false);
  });

  it("accepts the trimmed form of a decimal the source printed", () => {
    const f: Fastener = {
      ...base,
      stages: [{ ...base.stages[0], primary: "8.0 N·m", secondary: "6 lb ft" }],
    };
    const allowed = allowedNumerals(f);
    expect(allowed.has("8.0")).toBe(true);
    expect(allowed.has("8")).toBe(true);
  });
});

describe("assertNoInventedNumbers", () => {
  it("passes the record's own rendered text", () => {
    expect(() => assertNoInventedNumbers(renderedTextForGuard(base), base)).not.toThrow();
  });

  it("THROWS on a numeral absent from the record", () => {
    // The exact failure this guard exists to prevent: a plausible but
    // unsourced torque value reaching the screen.
    expect(() => assertNoInventedNumbers("Torque to 95 N·m", base)).toThrow(GuardViolation);
  });

  it("names the offending numerals so the bug is diagnosable", () => {
    try {
      assertNoInventedNumbers("values 95 and 162", base);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(GuardViolation);
      const v = e as GuardViolation;
      expect(v.offending).toEqual(["95", "162"]);
      expect(v.fastenerId).toBe(base.id);
    }
  });

  it("fails closed rather than degrading, via the non-throwing form", () => {
    const ok = checkNoInventedNumbers("72 N·m", base);
    expect(ok.ok).toBe(true);
    const bad = checkNoInventedNumbers("87 N·m", base);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.offending).toContain("87");
  });

  it("allows a superseded record to show BOTH old and new values", () => {
    const f: Fastener = {
      ...base,
      stages: [
        { no: 1, label: "First Pass", kind: "torque", primary: "30 N·m", secondary: "22 lb ft", angle: null, detail: "" },
        { no: 2, label: "Final Pass", kind: "angle", primary: "+180°", secondary: null, angle: 180, detail: "" },
      ],
      supersedes: {
        oldValue: "20 N·m (15 lb ft) → 80 N·m (60 lb ft)",
        oldSource: "2003 Corvette Fastener Tightening Specifications",
        bulletin: "gm-tsb-05-03-08-004",
      },
    };
    expect(() => assertNoInventedNumbers(renderedTextForGuard(f), f)).not.toThrow();
    const allowed = allowedNumerals(f);
    for (const n of ["30", "22", "180", "20", "15", "80", "60"]) {
      expect(allowed.has(n), `expected ${n} to be allowed`).toBe(true);
    }
  });
});

describe("every shipped record survives its own guard", () => {
  // The real regression test: render all 700+ records and assert none of them
  // produces a numeral absent from its source data.
  for (const vehicle of VEHICLES) {
    it(`${vehicle.id} (${vehicle.dataset.fasteners.length} fasteners)`, () => {
      const failures: string[] = [];
      for (const f of vehicle.dataset.fasteners) {
        const res = checkNoInventedNumbers(renderedTextForGuard(f), f);
        if (!res.ok) failures.push(`${f.id}: ${res.offending.join(", ")}`);
      }
      expect(failures, failures.slice(0, 10).join("\n")).toEqual([]);
    });
  }
});
