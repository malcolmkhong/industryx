// Server-authoritative contract fulfillment validator.

import { applyFulfillContractMutation } from "../mutators/contracts";
import type { ServerGameData } from "../../../shared/types/types";

export function validateFulfillContractAction(
  contractId: string,
  state: Partial<ServerGameData>,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!contractId || typeof contractId !== "string") {
    return { valid: false, error: "Missing contractId in payload" };
  }

  const contracts = state.contracts ?? [];
  const contractIdx = contracts.findIndex((c) => c.id === contractId);
  if (contractIdx < 0) {
    return {
      valid: false,
      error: `Contract "${contractId}" not found`,
    };
  }
  const contract = contracts[contractIdx];

  if (contract.completed) {
    return {
      valid: false,
      error: `Contract "${contractId}" already completed`,
    };
  }
  if (contract.failed) {
    return {
      valid: false,
      error: `Contract "${contractId}" already failed`,
    };
  }

  // Affordability check.
  const resources = state.resources ?? {};
  const money = state.money ?? 0;
  for (const required of contract.requiredResources) {
    if (required.resource === "money") {
      if (money < required.amount) {
        return {
          valid: false,
          error: `Not enough money to fulfill contract "${contractId}". Need $${required.amount}, have $${Math.floor(money)}`,
        };
      }
    } else {
      const available = resources[required.resource] ?? 0;
      if (available < required.amount) {
        return {
          valid: false,
          error: `Not enough ${required.resource} to fulfill contract "${contractId}". Need ${required.amount}, have ${Math.floor(available)}`,
        };
      }
    }
  }

  // Reward configuration validation.
  const reward = contract.reward;
  if (!reward || typeof reward.money !== "number" || reward.money < 0) {
    return {
      valid: false,
      error: `Contract "${contractId}" has invalid reward configuration`,
    };
  }

  return {
    valid: true,
    correctedState: applyFulfillContractMutation({ contractIdx }, state),
  };
}