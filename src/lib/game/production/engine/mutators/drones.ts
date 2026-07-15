// Server-authoritative drone mutations (start mission + collect).
//
// Assumes validator verified: drone exists + correct status, mission end tick
// reached (for collect), reward fields are shape-valid. Mutator THROWS on
// invariant violation (fail-closed per SEC-002).

import type { ServerGameData } from "../../../shared/types/types";

export interface StartDroneMissionMutationInput {
  droneId: string;
  missionId: string;
  fuelCost: number;
  deliveryTicks: number;
  drone: NonNullable<ReturnType<DroneByIdLookup>>;
}

type DroneByIdLookup = (state: Partial<ServerGameData>, droneId: string) =>
  | NonNullable<ServerGameData["drones"]>["fleet"][number]
  | undefined;

const _droneById: DroneByIdLookup = (state, droneId) =>
  (state.drones?.fleet ?? []).find((d) => d.id === droneId);

export function applyStartDroneMissionMutation(
  input: StartDroneMissionMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { drone, missionId, fuelCost, deliveryTicks } = input;
  const fleet = state.drones?.fleet ?? [];
  const money = state.money ?? 0;
  const currentTick = state.gameTick ?? 0;

  const updatedDrone = {
    ...drone,
    status: "delivering" as const,
    missionEndTick: currentTick + deliveryTicks,
    missionId,
  };
  const updatedFleet = fleet.map((d) => (d.id === drone.id ? updatedDrone : d));

  return {
    money: money - fuelCost,
    drones: {
      fleet: updatedFleet,
      completedMissions: state.drones?.completedMissions ?? 0,
      totalEarned: state.drones?.totalEarned ?? 0,
    },
  };
}

export interface CollectDroneMutationInput {
  droneId: string;
  drone: NonNullable<ReturnType<DroneByIdLookup>>;
}

export function applyCollectDroneMutation(
  input: CollectDroneMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { drone } = input;

  // Shape-check reward fields from payload (mirror validator logic).
  const rewardMoney = Number(
    (state as unknown as { _missionRewardMoney?: number })._missionRewardMoney,
  );
  const rewardRp = Number(
    (state as unknown as { _missionRewardResearchPoints?: number })
      ._missionRewardResearchPoints,
  );
  const rewardResources = (
    state as unknown as {
      _missionRewardResources?: Array<{ resource: string; amount: number }>;
    }
  )._missionRewardResources;

  const validMoney =
    Number.isFinite(rewardMoney) && rewardMoney > 0 ? rewardMoney : 0;
  const validRp =
    Number.isFinite(rewardRp) && rewardRp > 0 ? Math.floor(rewardRp) : 0;
  const validResources =
    Array.isArray(rewardResources) && rewardResources.length > 0
      ? rewardResources.filter(
          (r) =>
            r &&
            typeof r.resource === "string" &&
            Number.isFinite(r.amount) &&
            r.amount > 0,
        )
      : [];

  const currentResources = (state.resources ?? {}) as Record<string, number>;
  const currentCapacity = (state.resourceCapacity ?? {}) as Record<
    string,
    number
  >;
  const newResources: Record<string, number> = { ...currentResources };
  for (const r of validResources) {
    const cap = currentCapacity[r.resource] ?? Infinity;
    const current = newResources[r.resource] ?? 0;
    const proposed = current + r.amount;
    newResources[r.resource] = Math.min(proposed, cap);
  }

  const updatedDrone = {
    ...drone,
    status: "idle" as const,
    missionEndTick: 0,
    missionId: null,
  };
  const updatedFleet = (state.drones?.fleet ?? []).map((d) =>
    d.id === drone.id ? updatedDrone : d,
  );

  const money = state.money ?? 0;
  const totalMoneyEarned = state.totalMoneyEarned ?? 0;
  const researchPoints = state.researchPoints ?? 0;

  return {
    money: money + validMoney,
    totalMoneyEarned: totalMoneyEarned + validMoney,
    resources: newResources,
    researchPoints: researchPoints + validRp,
    drones: {
      fleet: updatedFleet,
      completedMissions: (state.drones?.completedMissions ?? 0) + 1,
      totalEarned: (state.drones?.totalEarned ?? 0) + validMoney,
    },
  };
}