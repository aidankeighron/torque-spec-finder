/** Vehicle registry — and the segregation guarantee.
 *
 * Each vehicle is an INDEPENDENT dataset file with its own namespaced IDs.
 * A search runs against exactly one dataset. There is no shared table that a
 * query could accidentally reach across, and no filter that a caller could
 * forget to apply: the wrong vehicle's rows are simply not in the index that
 * was built.
 *
 * `assertSegregation` enforces the invariant at load time and is also asserted
 * in tests, so a dataset whose IDs leak another vehicle's namespace cannot
 * silently ship.
 */

import type { Dataset } from "./types";
import { buildIndex, type SearchIndex } from "./search/engine";

import c5_2003_base from "../data/c5-2003-base.json";
import c3_1979_base_auto from "../data/c3-1979-base-auto.json";

export interface VehicleEntry {
  id: string;
  label: string;
  shortLabel: string;
  generation: string;
  /** Off by default — a vehicle must be chosen deliberately. */
  enabledByDefault: boolean;
  dataset: Dataset;
}

/* Datasets are imported statically so Next.js bakes them into the bundle at
   build time. No fetch, no database, no runtime dependency of any kind. */
const RAW: Array<Omit<VehicleEntry, "label" | "shortLabel" | "generation">> = [
  { id: "c5-2003-base", enabledByDefault: true, dataset: c5_2003_base as unknown as Dataset },
  { id: "c3-1979-base-auto", enabledByDefault: false, dataset: c3_1979_base_auto as unknown as Dataset },
];

export class SegregationError extends Error {}

/**
 * Every fastener id in a dataset must begin with that dataset's vehicle id.
 * This is what makes cross-vehicle contamination structurally impossible
 * rather than merely unlikely.
 */
export function assertSegregation(dataset: Dataset): void {
  const prefix = `${dataset.vehicle.id}/`;
  const bad = dataset.fasteners.filter((f) => !f.id.startsWith(prefix));
  if (bad.length) {
    throw new SegregationError(
      `${dataset.vehicle.id}: ${bad.length} fastener id(s) outside the vehicle namespace, ` +
        `e.g. "${bad[0].id}" (expected prefix "${prefix}")`,
    );
  }
  const dupes = new Set<string>();
  const seen = new Set<string>();
  for (const f of dataset.fasteners) {
    if (seen.has(f.id)) dupes.add(f.id);
    seen.add(f.id);
  }
  if (dupes.size) {
    throw new SegregationError(
      `${dataset.vehicle.id}: duplicate fastener id(s): ${[...dupes].slice(0, 3).join(", ")}`,
    );
  }
}

export const VEHICLES: VehicleEntry[] = RAW.map((entry) => {
  assertSegregation(entry.dataset);
  return {
    ...entry,
    label: entry.dataset.vehicle.label,
    shortLabel: entry.dataset.vehicle.shortLabel,
    generation: entry.dataset.vehicle.generation,
  };
});

export const DEFAULT_VEHICLE_ID =
  VEHICLES.find((v) => v.enabledByDefault)?.id ?? VEHICLES[0].id;

export function getVehicle(id: string): VehicleEntry {
  const found = VEHICLES.find((v) => v.id === id);
  if (!found) throw new Error(`Unknown vehicle id: ${id}`);
  return found;
}

/** One index per vehicle, built lazily and cached. Building the C5 index is a
 *  few milliseconds, so this is about avoiding repeat work, not about speed. */
const INDEX_CACHE = new Map<string, SearchIndex>();

export function getIndex(vehicleId: string): SearchIndex {
  const cached = INDEX_CACHE.get(vehicleId);
  if (cached) return cached;
  const built = buildIndex(getVehicle(vehicleId).dataset);
  INDEX_CACHE.set(vehicleId, built);
  return built;
}
