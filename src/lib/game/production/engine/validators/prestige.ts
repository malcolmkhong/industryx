// Server-authoritative prestige validator.

import { applyPrestigeMutation } from "../mutators/prestige";
import { fetchCanonicalInitialState } from "@/lib/db/infra/initialState.server";
import { getBalance } from "../../../config/balance/balanceConfig";
import type { ServerGameData } from "../../../shared/types/types";

export async function validatePrestigeAction(
  state: Partial<ServerGameData>,
): Promise<{
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
}> {
  const buildings = state.buildings ?? [];
  if (buildings.length < 5) {
    return {
      valid: false,
      error: `Need at least 5 buildings to prestige. Have ${buildings.length}.`,
    };
  }

  const completedResearch = state.completedResearch ?? [];
  const contractsCompleted =
    (state.stats as { contractsCompleted?: number } | undefined)
      ?.contractsCompleted ?? 0;

  const cpPerBuilding = getBalance().prestige.cpPerBuilding;
  const pointsEarned = Math.floor(
    buildings.length * cpPerBuilding +
      completedResearch.length * 2 +
      contractsCompleted,
  );

  if (!Number.isFinite(pointsEarned) || pointsEarned < 0) {
    return {
      valid: false,
      error: `Computed corporation points is invalid (${pointsEarned})`,
    };
  }

  // Fetch the canonical reset shape server-side. Fail-closed.
  let canonical: ServerGameData;
  try {
    canonical = await fetchCanonicalInitialState();
  } catch (err) {
    return {
      valid: false,
      error: `Cannot build canonical reset state: ${
        err instanceof Error ? err.message : "unknown"
      }`,
    };
  }

  return {
    valid: true,
    correctedState: applyPrestigeMutation({ pointsEarned, canonical }, state),
  };
}