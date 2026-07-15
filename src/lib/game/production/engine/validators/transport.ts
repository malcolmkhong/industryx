// Server-authoritative transport validators (build line + upgrade line).

import {
  applyTransportMutation,
  applyUpgradeTransportLineMutation,
} from "../mutators/transport";
import { getBalance } from "../../../config/balance/balanceConfig";
import type { GameConfig } from "../../../config/config";
import type { ServerGameData } from "../../../shared/types/types";

export function validateTransportAction(
  transportType: string,
  fromBuildingId: string,
  toBuildingId: string,
  resource: string,
  state: Partial<ServerGameData>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!transportType || typeof transportType !== "string") {
    return { valid: false, error: "Missing transportType in payload" };
  }
  if (!fromBuildingId || !toBuildingId) {
    return {
      valid: false,
      error: "Missing fromBuildingId or toBuildingId in payload",
    };
  }
  if (!resource) {
    return { valid: false, error: "Missing resource in payload" };
  }

  const transportDef = config.transport.find((t) => t.id === transportType);
  if (!transportDef) {
    return {
      valid: false,
      error: `Transport type "${transportType}" not found in config`,
    };
  }

  const buildings = state.buildings ?? [];
  const fromBuilding = buildings.find((b) => b.id === fromBuildingId);
  if (!fromBuilding) {
    return {
      valid: false,
      error: `Source building "${fromBuildingId}" not found`,
    };
  }
  const toBuilding = buildings.find((b) => b.id === toBuildingId);
  if (!toBuilding) {
    return {
      valid: false,
      error: `Destination building "${toBuildingId}" not found`,
    };
  }

  const fromDef = config.buildings[fromBuilding.type];
  if (!fromDef) {
    return {
      valid: false,
      error: `Source building type "${fromBuilding.type}" not found in config`,
    };
  }
  const toDef = config.buildings[toBuilding.type];
  if (!toDef) {
    return {
      valid: false,
      error: `Destination building type "${toBuilding.type}" not found in config`,
    };
  }

  // Server-side cost computation: money component only.
  const moneyCost = transportDef.baseCost
    .filter((c) => c.resource === "money")
    .reduce((sum, c) => sum + c.amount, 0);
  const money = state.money ?? 0;
  if (money < moneyCost) {
    return {
      valid: false,
      error: `Not enough money for transport line. Need $${moneyCost}, have $${Math.floor(money)}`,
    };
  }

  const throughput = transportDef.baseThroughput;
  const maxThroughput = transportDef.baseThroughput * 3;

  return {
    valid: true,
    correctedState: applyTransportMutation(
      {
        transportType,
        fromBuildingId,
        toBuildingId,
        resource,
        moneyCost,
        throughput,
        maxThroughput,
      },
      state,
    ),
  };
}

export function validateUpgradeTransportLineAction(
  lineId: string,
  state: Partial<ServerGameData>,
  config: GameConfig,
): {
  valid: boolean;
  error?: string;
  correctedState?: Partial<ServerGameData>;
} {
  if (!lineId || typeof lineId !== "string") {
    return { valid: false, error: "Missing lineId in payload" };
  }

  const lines = state.transportLines ?? [];
  const line = lines.find((l) => l.id === lineId);
  if (!line) {
    return { valid: false, error: `Transport line "${lineId}" not found` };
  }

  const transportDef = config.transport.find((t) => t.id === line.type);
  if (!transportDef) {
    return {
      valid: false,
      error: `Transport type "${line.type}" not found in config`,
    };
  }

  const baseCost = transportDef.baseCost
    .filter((c) => c.resource === "money")
    .reduce((sum, c) => sum + c.amount, 0);
  const upgradeCostExponent = getBalance().transport.upgradeCostExponent;
  const cost = Math.floor(baseCost * Math.pow(upgradeCostExponent, line.level));
  const money = state.money ?? 0;
  if (money < cost) {
    return {
      valid: false,
      error: `Not enough money to upgrade transport. Need $${cost}, have $${Math.floor(money)}`,
    };
  }

  const newLevel = line.level + 1;
  const newThroughput = Math.min(
    line.maxThroughput,
    transportDef.baseThroughput *
      Math.pow(transportDef.upgradeMultiplier, newLevel - 1),
  );

  return {
    valid: true,
    correctedState: applyUpgradeTransportLineMutation(
      { lineId, newLevel, newThroughput, cost },
      state,
    ),
  };
}