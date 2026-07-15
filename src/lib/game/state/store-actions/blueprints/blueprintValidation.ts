// ============================================
// blueprintValidation.ts
//
// Pure validation of decoded blueprint payloads. Returns a
// discriminated `ValidateResult` so the mutation layer can dispatch
// the correct notification (oversize vs empty vs structural failure)
// without re-implementing the bounds checks.
// ============================================

import type {
  BuildingType,
  TransportType,
} from "../../../shared/types/types";
import { BUILDING_DEFS } from "../../../config/configCache";

// M8 FIX — bounds kept identical to the original monolithic implementation.
export const BLUEPRINT_MAX_BUILDINGS = 500;
export const BLUEPRINT_MAX_TRANSPORT = 200;
export const BLUEPRINT_MAX_COUNT_PER_TYPE = 1000;

// M8 FIX — transport allowlist kept identical to the original.
export const VALID_TRANSPORT_TYPES = new Set<string>([
  "conveyorBelt",
  "pipe",
  "truck",
  "cargoTrain",
  "drone",
  "cargoShip",
]);

export type ValidationWarning =
  | { kind: "unknownBuilding"; type: string }
  | { kind: "unknownTransport"; type: string };

export interface ValidatedBlueprint {
  name: string;
  /** defaults to "Imported Layout" when the payload omits a name */
  shared: boolean;
  validBuildings: Array<{ type: BuildingType; count: number }>;
  validTransport: Array<{ type: TransportType; count: number }>;
  warnings: ValidationWarning[];
}

/**
 * Discriminated result of blueprint validation. The mutation layer
 * pattern-matches on `reason` to dispatch the right notification.
 */
export type ValidateResult =
  | { ok: true; blueprint: ValidatedBlueprint }
  | { ok: false; reason: "structure" }
  | { ok: false; reason: "oversizeBuildings"; count: number; limit: number }
  | { ok: false; reason: "oversizeTransport"; count: number; limit: number }
  | { ok: false; reason: "empty" };

/**
 * Validate a decoded blueprint payload. Returns a `ValidateResult`
 * so the caller knows which failure case to surface (oversize, empty,
 * structural). Returns `{ ok: true, ... }` with any per-entry
 * warnings otherwise.
 */
export function validateBlueprint(data: unknown): ValidateResult {
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "structure" };
  }
  const d = data as {
    b?: unknown;
    t?: unknown;
    n?: unknown;
  };
  if (!Array.isArray(d.b) || !Array.isArray(d.t)) {
    return { ok: false, reason: "structure" };
  }

  // M8 FIX: Bounds — reject oversize arrays before allocating.
  if (d.b.length > BLUEPRINT_MAX_BUILDINGS) {
    return {
      ok: false,
      reason: "oversizeBuildings",
      count: d.b.length,
      limit: BLUEPRINT_MAX_BUILDINGS,
    };
  }
  if (d.t.length > BLUEPRINT_MAX_TRANSPORT) {
    return {
      ok: false,
      reason: "oversizeTransport",
      count: d.t.length,
      limit: BLUEPRINT_MAX_TRANSPORT,
    };
  }

  const validBuildings: Array<{ type: BuildingType; count: number }> = [];
  const validTransport: Array<{ type: TransportType; count: number }> = [];
  const warnings: ValidationWarning[] = [];

  // M8 FIX: Validate each building — type must exist in BUILDING_DEFS,
  // count must be finite and in [1, 1000].
  for (const b of d.b) {
    if (typeof b !== "object" || b === null) continue;
    const t = (b as { t?: unknown }).t;
    const c = (b as { c?: unknown }).c;
    if (typeof t !== "string") continue;
    if (
      !Number.isFinite(c) ||
      (c as number) < 1 ||
      (c as number) > BLUEPRINT_MAX_COUNT_PER_TYPE
    )
      continue;
    if (!(t in BUILDING_DEFS)) {
      warnings.push({ kind: "unknownBuilding", type: t });
      continue;
    }
    validBuildings.push({
      type: t as BuildingType,
      count: Math.floor(c as number),
    });
  }

  // M8 FIX: Validate each transport — same hardening.
  for (const t of d.t) {
    if (typeof t !== "object" || t === null) continue;
    const typeStr = (t as { t?: unknown }).t;
    const c = (t as { c?: unknown }).c;
    if (typeof typeStr !== "string") continue;
    if (
      !Number.isFinite(c) ||
      (c as number) < 1 ||
      (c as number) > BLUEPRINT_MAX_COUNT_PER_TYPE
    )
      continue;
    if (!VALID_TRANSPORT_TYPES.has(typeStr)) {
      warnings.push({ kind: "unknownTransport", type: typeStr });
      continue;
    }
    validTransport.push({
      type: typeStr as TransportType,
      count: Math.floor(c as number),
    });
  }

  if (validBuildings.length === 0 && validTransport.length === 0) {
    return { ok: false, reason: "empty" };
  }

  return {
    ok: true,
    blueprint: {
      name: typeof d.n === "string" ? d.n : "Imported Layout",
      shared: true,
      validBuildings,
      validTransport,
      warnings,
    },
  };
}
