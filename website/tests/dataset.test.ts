/** Dataset integrity and segregation.
 *
 * These assertions encode the schema invariants from docs/03 so that a bad
 * ingest cannot ship quietly. They run against the real baked data, not
 * fixtures.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_VEHICLE_ID, VEHICLES, assertSegregation, getIndex, getVehicle } from "@/lib/registry";
import { search } from "@/lib/search/engine";
import type { Dataset } from "@/lib/types";

const c5 = getVehicle("c5-2003-base").dataset;

describe("registry and segregation", () => {
  it("registers both vehicles", () => {
    expect(VEHICLES.map((v) => v.id)).toEqual(["c5-2003-base", "c3-1979-base-auto"]);
  });

  it("defaults to the vehicle that actually has data", () => {
    expect(DEFAULT_VEHICLE_ID).toBe("c5-2003-base");
    expect(getVehicle(DEFAULT_VEHICLE_ID).dataset.fasteners.length).toBeGreaterThan(0);
  });

  it("every fastener id is namespaced to its own vehicle", () => {
    for (const v of VEHICLES) expect(() => assertSegregation(v.dataset)).not.toThrow();
  });

  it("rejects a dataset whose ids leak another vehicle's namespace", () => {
    const tainted = {
      ...c5,
      fasteners: [{ ...c5.fasteners[0], id: "c3-1979-base-auto/sneaky" }],
    } as Dataset;
    expect(() => assertSegregation(tainted)).toThrow(/outside the vehicle namespace/);
  });

  it("rejects duplicate fastener ids", () => {
    const dupe = { ...c5, fasteners: [c5.fasteners[0], c5.fasteners[0]] } as Dataset;
    expect(() => assertSegregation(dupe)).toThrow(/duplicate fastener id/);
  });

  it("CROSS-CONTAMINATION: a C3 search can never return a C5 record", () => {
    // The strongest statement of the isolation guarantee. The C3 index is
    // built from the C3 dataset alone, so there is no filter to forget.
    const c3 = getIndex("c3-1979-base-auto");
    for (const q of ["lug nuts", "head bolts", "ball joint", "sway bar", "pinion nut"]) {
      const r = search(c3, q);
      expect(r.vehicleId).toBe("c3-1979-base-auto");
      expect(r.fastener).toBeNull();
      expect(r.candidates).toEqual([]);
      expect(r.outcome).toBe("not_found");
    }
  });

  it("and the reverse: a C5 search only ever yields C5 ids", () => {
    const idx = getIndex("c5-2003-base");
    for (const q of ["lug nuts", "head bolts", "sway bar", "brake caliper"]) {
      const r = search(idx, q);
      const ids = [...r.candidates.map((c) => c.fastener.id), ...(r.fastener ? [r.fastener.id] : [])];
      for (const id of ids) expect(id.startsWith("c5-2003-base/")).toBe(true);
    }
  });
});

describe("C5 dataset integrity", () => {
  it("has the expected scale", () => {
    expect(c5.fasteners.length).toBeGreaterThan(650);
    expect(c5.assemblies.length).toBeGreaterThan(40);
  });

  it("every fastener has at least one stage with a printed primary value", () => {
    const bad = c5.fasteners.filter((f) => !f.stages.length || f.stages.some((s) => !s.primary));
    expect(bad.map((f) => f.id)).toEqual([]);
  });

  it("every torque stage prints BOTH units, as the source does", () => {
    const bad = c5.fasteners.flatMap((f) =>
      f.stages
        .filter((s) => s.kind === "torque" && !s.secondary)
        .map((s) => `${f.id} stage ${s.no}`),
    );
    expect(bad).toEqual([]);
  });

  it("every angle stage carries its degree value", () => {
    const bad = c5.fasteners.flatMap((f) =>
      f.stages.filter((s) => s.kind === "angle" && s.angle == null).map((s) => `${f.id} stage ${s.no}`),
    );
    expect(bad).toEqual([]);
  });

  it("stage numbers are contiguous from 1", () => {
    for (const f of c5.fasteners) {
      expect(f.stages.map((s) => s.no)).toEqual(f.stages.map((_, i) => i + 1));
    }
  });

  it("multiStage agrees with the actual stage count", () => {
    const bad = c5.fasteners.filter((f) => f.multiStage !== f.stages.length > 1);
    expect(bad.map((f) => f.id)).toEqual([]);
  });

  it("every fastener has provenance pointing at a declared source", () => {
    const ids = new Set(c5.sources.map((s) => s.id));
    for (const f of c5.fasteners) {
      expect(f.provenance.sourceIds.length).toBeGreaterThan(0);
      for (const sid of f.provenance.sourceIds) expect(ids.has(sid)).toBe(true);
      expect(f.provenance.verbatim.length).toBeGreaterThan(0);
    }
  });

  it("no torque VALUE leaks into the searchable text", () => {
    // Enforces the one-way boundary from docs/03: search content must never
    // become answer content.
    const withUnits = c5.fasteners.filter((f) => /N·m|lb ft|lb in/.test(f.name));
    expect(withUnits.map((f) => f.name)).toEqual([]);
  });

  it("no fastener name retains an FSM footnote digit", () => {
    const bad = c5.fasteners.filter((f) => /[a-z]\d$/.test(f.name));
    expect(bad.map((f) => f.name)).toEqual([]);
  });

  it("every angle-finished fastener carries the torque-angle warning", () => {
    for (const f of c5.fasteners) {
      if (f.stages.some((s) => s.kind === "angle")) {
        expect(f.warnings.some((w) => w.kind === "torque_angle"), f.id).toBe(true);
      }
    }
  });

  it("records the known source defects rather than silently correcting them", () => {
    const defective = c5.fasteners.filter((f) => f.sourceDefects.length);
    expect(defective.length).toBeGreaterThanOrEqual(6);
    for (const f of defective) {
      for (const d of f.sourceDefects) {
        expect(["unit_label_defect", "mismatch"]).toContain(d.kind);
        expect(d.detail.length).toBeGreaterThan(20);
      }
    }
  });

  it("the supersessions found in research are applied", () => {
    const superseded = c5.fasteners.filter((f) => f.supersedes);
    expect(superseded.length).toBe(5);
    for (const f of superseded) {
      // The stale value must be kept, not discarded — a user who has seen the
      // old number elsewhere needs to recognise it.
      expect(f.supersedes!.oldValue.length).toBeGreaterThan(0);
      expect(f.provenance.tier).toBe("A");
      expect(c5.sources.some((s) => s.id === f.supersedes!.bulletin)).toBe(true);
    }
  });

  it("the ball joint records carry the REVISED bulletin values, not the manual's", () => {
    const bj = c5.fasteners.filter((f) => f.name.includes("Ball Joint Stud Nut"));
    expect(bj.length).toBe(4);
    for (const f of bj) {
      expect(f.supersedes, f.id).toBeTruthy();
      expect(f.stages.some((s) => s.kind === "angle"), f.id).toBe(true);
    }
  });

  it("torque-to-yield fasteners are flagged single-use", () => {
    for (const name of ["Cylinder Head Bolts", "Connecting Rod Bolts", "Crankshaft Balancer Bolt"]) {
      const f = c5.fasteners.find((x) => x.name === name);
      expect(f, name).toBeTruthy();
      expect(f!.warnings.some((w) => w.kind === "single_use"), name).toBe(true);
    }
  });

  it("conflicts are declared, not hidden", () => {
    for (const f of c5.fasteners) {
      if (f.conflict) {
        expect(f.provenance.status).toBe("conflicting");
        expect(Object.keys(f.conflict.byStage).length).toBeGreaterThan(0);
      }
    }
  });

  it("documents what was found but deliberately not ingested", () => {
    const notIngested = (c5 as unknown as { notIngested?: unknown[] }).notIngested ?? [];
    expect(notIngested.length).toBeGreaterThan(0);
  });
});

describe("known values match the source document exactly", () => {
  const byName = (n: string, assembly?: string) =>
    c5.fasteners.find((f) => f.name === n && (!assembly || f.assembly === assembly));

  it("wheel nuts: 140 N·m / 100 lb ft", () => {
    const f = byName("Wheel Nuts In Sequence")!;
    expect(f.stages[0].primary).toBe("140 N·m");
    expect(f.stages[0].secondary).toBe("100 lb ft");
  });

  it("rear shock lower bolt: 220 N·m / 162 lb ft", () => {
    const f = byName("Shock Absorber Lower Mounting Bolt", "Chassis > Rear Suspension")!;
    expect(f.stages[0].primary).toBe("220 N·m");
    expect(f.stages[0].secondary).toBe("162 lb ft");
  });

  it("pinion nut: 500 N·m / 370 lb ft", () => {
    const f = byName("Pinion Nut")!;
    expect(f.stages[0].primary).toBe("500 N·m");
    expect(f.stages[0].secondary).toBe("370 lb ft");
  });

  it("head bolts: four stages, 30 N·m then three angles", () => {
    const f = byName("Cylinder Head Bolts")!;
    expect(f.stages.length).toBe(4);
    expect(f.stages[0].primary).toBe("30 N·m");
    expect(f.stages[0].secondary).toBe("22 lb ft");
    expect(f.stages.filter((s) => s.kind === "angle").map((s) => s.angle).sort()).toEqual([50, 90, 90]);
  });

  it("rear lower ball joint keeps the manual's turn-count stage on the superseded record", () => {
    const f = byName("Lower Control Arm Ball Joint Stud Nut", "Chassis > Rear Suspension")!;
    const old = f.supersedes!.oldStages ?? [];
    expect(old.some((s) => s.kind === "turns" && s.primary.includes("flats"))).toBe(true);
  });
});

describe("C3 dataset is registered but honestly empty", () => {
  const c3 = getVehicle("c3-1979-base-auto").dataset;
  it("has vehicle metadata and zero fasteners", () => {
    expect(c3.vehicle.year).toBe(1979);
    expect(c3.fasteners).toEqual([]);
    expect(c3.stats.fasteners).toBe(0);
  });
});
