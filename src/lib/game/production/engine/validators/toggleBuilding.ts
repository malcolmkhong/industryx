// Server-authoritative toggle building validator.
//
// The mutation (set `active` flag) is trivial inline; no separate mutator file.

import type { ServerGameData } from "../../../shared/types/types";

export function validateToggleBuildingAction(
  buildingId: string,
  enabled: boolean,
  state: Partial<ServerGameData>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  const buildings = state.buildings ?? [];
  const idx = buildings.findIndex((b) => b.id === buildingId);
  if (idx < 0) {
    return {
      valid: false,
      error: `Building instance "${buildingId}" not found`,
    };
  }

  const building = buildings[idx];
  if (typeof enabled !== "boolean") {
    return { valid: false, error: "Missing 'enabled' boolean in payload" };
  }

  // No-op: client toggled to the value the building already has.
  if (building.active === enabled) {
    return { valid: true, correctedState: { buildings } };
  }

  const nextBuildings = buildings.map((b, i) =>
    i === idx ? { ...b, active: enabled } : b,
  );
  return { valid: true, correctedState: { buildings: nextBuildings } };
}