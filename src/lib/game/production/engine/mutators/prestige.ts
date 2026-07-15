// Server-authoritative prestige mutation.
//
// Assumes validator verified: ≥5 buildings, computed CP is finite non-negative,
// canonical reset shape fetched from server. Returns full reset shape merged
// with prestige counters; preserves lastOnlineTimestamp.

import type { ServerGameData } from "../../../shared/types/types";

export interface PrestigeMutationInput {
  pointsEarned: number;
  canonical: ServerGameData;
}

export function applyPrestigeMutation(
  input: PrestigeMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { pointsEarned, canonical } = input;

  const existingPrestige = state.prestigeState ?? {
    corporationPoints: 0,
    totalPrestiges: 0,
    megaFactoryUnlocked: false,
    bonuses: [],
  };

  return {
    ...canonical,
    prestigeState: {
      ...existingPrestige,
      corporationPoints:
        (existingPrestige.corporationPoints ?? 0) + pointsEarned,
      totalPrestiges: (existingPrestige.totalPrestiges ?? 0) + 1,
    },
    lastOnlineTimestamp:
      typeof state.lastOnlineTimestamp === "number"
        ? state.lastOnlineTimestamp
        : canonical.lastOnlineTimestamp,
  };
}