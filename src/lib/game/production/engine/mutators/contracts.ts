// Server-authoritative contract fulfillment mutation.
//
// Assumes validator verified: contract exists, not completed/failed, all
// required resources affordable, reward configuration valid.

import type { ServerGameData } from "../../../shared/types/types";

export interface FulfillContractMutationInput {
  contractIdx: number;
}

export function applyFulfillContractMutation(
  input: FulfillContractMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { contractIdx } = input;
  const contracts = state.contracts ?? [];
  const contract = contracts[contractIdx];

  const resources = state.resources ?? {};
  const money = state.money ?? 0;
  const totalMoneyEarned = state.totalMoneyEarned ?? 0;
  const researchPoints = state.researchPoints ?? 0;
  const corpPoints = state.prestigeState?.corporationPoints ?? 0;
  const completedContracts = state.completedContracts ?? 0;
  const contractsCompletedStat = state.stats?.contractsCompleted ?? 0;
  const reward = contract.reward;

  // Deduct required resources. Money-required flows through moneyDelta.
  const newResources: Record<string, number> = { ...resources };
  let moneyDelta = 0;
  for (const required of contract.requiredResources) {
    if (required.resource === "money") {
      moneyDelta -= required.amount;
    } else {
      const current = newResources[required.resource] ?? 0;
      newResources[required.resource] = current - required.amount;
    }
  }
  moneyDelta += reward.money;

  const completedContract = {
    ...contract,
    completed: true,
    progress: 1,
  };
  const nextContracts = contracts.map((c, i) =>
    i === contractIdx ? completedContract : c,
  );

  return {
    money: money + moneyDelta,
    totalMoneyEarned: totalMoneyEarned + reward.money,
    researchPoints: researchPoints + (reward.researchPoints ?? 0),
    resources: newResources,
    contracts: nextContracts,
    completedContracts: completedContracts + 1,
    stats: {
      ...(state.stats ?? {
        totalResourcesProduced: {} as Record<string, number>,
        totalResourcesSold: {} as Record<string, number>,
        peakEfficiency: 0,
        factoriesBuilt: 0,
        transportLinesBuilt: 0,
        researchCompleted: 0,
        contractsCompleted: 0,
        tradesCompleted: 0,
        playTime: 0,
      }),
      contractsCompleted: contractsCompletedStat + 1,
    },
    prestigeState: {
      totalPrestiges: state.prestigeState?.totalPrestiges ?? 0,
      megaFactoryUnlocked: state.prestigeState?.megaFactoryUnlocked ?? false,
      bonuses: state.prestigeState?.bonuses ?? [],
      corporationPoints: corpPoints + (reward.corporationPoints ?? 0),
    },
  };
}