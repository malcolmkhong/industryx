// ============================================
// blueprintSerialization.ts
//
// Pure encode/decode helpers for blueprint share codes. No mutation,
// no notifications, no side-effects — this module only translates
// between `Blueprint` and the compact share-code format.
// ============================================

import type { Blueprint } from "../../../shared/types/types";

/**
 * Compact share code format. Field names are abbreviated to keep the
 * base64 payload small.
 */
export interface SerializedBlueprint {
  /** name */
  n: string;
  /** buildings: { t: type, c: count }[] */
  b: Array<{ t: string; c: number }>;
  /** transport: { t: type, c: count }[] */
  t: Array<{ t: string; c: number }>;
  /** schema version */
  v: number;
}

/**
 * Encode a blueprint into a share code. Returns empty string on
 * serialization failure (caller can surface a UI message).
 */
export function serializeBlueprint(blueprint: Blueprint): string {
  try {
    const exportData: SerializedBlueprint = {
      n: blueprint.name,
      b: blueprint.buildings.map((b) => ({ t: b.type, c: b.count })),
      t: blueprint.transportLines.map((line) => ({
        t: line.type,
        c: line.count,
      })),
      v: 1,
    };
    const json = JSON.stringify(exportData);
    return btoa(encodeURIComponent(json));
  } catch {
    return "";
  }
}

/**
 * Decode a share code back into its structured form. Returns null on
 * any parse/decode failure; the caller (mutation) decides how to
 * notify the user.
 */
export function deserializeBlueprint(
  code: string,
): SerializedBlueprint | null {
  try {
    const json = decodeURIComponent(atob(code));
    const data = JSON.parse(json) as Partial<SerializedBlueprint>;
    // Defensive shape check — defer to validateBlueprint for the
    // full bounds + type checks. `n` may be omitted/missing; the
    // fallback "Imported Layout" is handled inside validateBlueprint.
    if (!Array.isArray(data.b) || !Array.isArray(data.t)) {
      return null;
    }
    return data as SerializedBlueprint;
  } catch {
    return null;
  }
}
