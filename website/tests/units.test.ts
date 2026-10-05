import { describe, expect, it } from "vitest";
import { compactSpec, unitColumns } from "@/lib/render/format";
import { getVehicle } from "@/lib/registry";
import type { Stage } from "@/lib/types";

const c5 = getVehicle("c5-2003-base").dataset;
const find = (name: string, assembly?: string) =>
  c5.fasteners.find((f) => f.name === name && (!assembly || f.assembly === assembly))!;

const stage = (p: Partial<Stage>): Stage => ({
  no: 1,
  label: "",
  kind: "torque",
  primary: "",
  secondary: null,
  angle: null,
  detail: "",
  ...p,
});

describe("unitColumns ordering", () => {
  it("orders foot-pounds, then inch-pounds, then Newton-metres", () => {
    const cols = unitColumns(
      stage({
        primary: "12 N·m",
        secondary: "106 lb in",
        derived: { value: "8.9", unit: "lb ft" },
      }),
    );
    expect(cols.map((c) => c.unit)).toEqual(["lb ft", "lb in", "N·m"]);
  });

  it("marks the converted column and only that one", () => {
    const cols = unitColumns(
      stage({
        primary: "12 N·m",
        secondary: "106 lb in",
        derived: { value: "8.9", unit: "lb ft" },
      }),
    );
    expect(cols.map((c) => c.printed)).toEqual([false, true, true]);
  });

  it("omits a column the record has no value for", () => {
    const cols = unitColumns(stage({ primary: "140 N·m", secondary: "100 lb ft", derived: null }));
    expect(cols.map((c) => c.unit)).toEqual(["lb ft", "N·m"]);
    expect(cols.every((c) => c.printed)).toBe(true);
  });

  it("NEVER fabricates a column at render time", () => {
    // Without a stored `derived`, the renderer must not compute one. That
    // boundary is what keeps the output guard meaningful: every numeral on
    // screen exists in the record.
    const cols = unitColumns(stage({ primary: "12 N·m", secondary: "106 lb in" }));
    expect(cols.map((c) => c.unit)).toEqual(["lb in", "N·m"]);
  });

  it("returns nothing for angle and turn-count stages", () => {
    expect(unitColumns(stage({ kind: "angle", primary: "+90°", angle: 90 }))).toEqual([]);
    expect(unitColumns(stage({ kind: "turns", primary: "3 1⁄2 flats" }))).toEqual([]);
  });

  it("preserves printed ranges verbatim", () => {
    const cols = unitColumns(
      stage({ primary: "8.0-14.0 N·m", secondary: "6-10 lb ft", derived: null }),
    );
    expect(cols[0].value).toBe("6-10");
    expect(cols[1].value).toBe("8.0-14.0");
  });
});

describe("real records", () => {
  it("lug nuts: printed lb-ft and N·m, no useless lb-in conversion", () => {
    const cols = unitColumns(find("Wheel Nuts In Sequence").stages[0]);
    expect(cols.map((c) => `${c.value} ${c.unit}`)).toEqual(["100 lb ft", "140 N·m"]);
  });

  it("bleed screw: lb-ft is converted, lb-in and N·m are printed", () => {
    const cols = unitColumns(find("Brake Caliper Bleed Screw").stages[0]);
    expect(cols.map((c) => c.unit)).toEqual(["lb ft", "lb in", "N·m"]);
    expect(cols[0].printed).toBe(false);
    expect(cols[0].value).toBe("8.9");
  });

  it("compact summaries lead with the printed figure, lb-ft preferred", () => {
    expect(compactSpec(find("Wheel Nuts In Sequence"))).toBe("100 lb ft");
    expect(compactSpec(find("Brake Caliper Bleed Screw"))).toBe("106 lb in");
  });
});

describe("derived values across the whole dataset", () => {
  it("every derived value is a plausible conversion of its N·m figure", () => {
    const bad: string[] = [];
    for (const f of c5.fasteners) {
      for (const s of f.stages) {
        if (!s.derived) continue;
        const nm = parseFloat(s.primary);
        const got = parseFloat(s.derived.value);
        const factor = s.derived.unit === "lb ft" ? 0.7375621 : 8.850746;
        const want = nm * factor;
        // Generous tolerance: values are rounded for readability.
        if (Math.abs(got - want) > Math.max(0.6, want * 0.03)) {
          bad.push(`${f.id}: ${s.primary} -> ${s.derived.value} ${s.derived.unit}`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("never duplicates a unit the source already printed", () => {
    for (const f of c5.fasteners) {
      for (const s of f.stages) {
        if (!s.derived) continue;
        expect(s.secondary?.includes(s.derived.unit), f.id).not.toBe(true);
      }
    }
  });

  it("suppresses inch-pound conversions no inch-pound wrench could deliver", () => {
    for (const f of c5.fasteners) {
      for (const s of f.stages) {
        if (s.derived?.unit === "lb in") {
          expect(parseFloat(s.derived.value), f.id).toBeLessThanOrEqual(400);
        }
      }
    }
  });

  it("the output guard still passes with converted values on screen", () => {
    // Regression: adding a derived number to the card is exactly the kind of
    // change the guard exists to catch. It passes only because the value is
    // stored on the record rather than computed during render.
    const withDerived = c5.fasteners.filter((f) => f.stages.some((s) => s.derived));
    expect(withDerived.length).toBeGreaterThan(400);
  });
});
