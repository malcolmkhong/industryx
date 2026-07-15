// Server-authoritative transport mutations (build line + upgrade line).
//
// Assumes validator verified: transport type valid, buildings exist + are
// configured, money affordable.

import { generateTransportLineId } from "../ids";
import type {
  ResourceType,
  ServerGameData,
  TransportLine,
  TransportType,
} from "../../../shared/types/types";

export interface TransportMutationInput {
  transportType: string;
  fromBuildingId: string;
  toBuildingId: string;
  resource: string;
  moneyCost: number;
  throughput: number;
  maxThroughput: number;
}

export function applyTransportMutation(
  input: TransportMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const {
    transportType,
    fromBuildingId,
    toBuildingId,
    resource,
    moneyCost,
    throughput,
    maxThroughput,
  } = input;

  const money = state.money ?? 0;
  const existingLines = state.transportLines ?? [];
  const existingStats = state.stats;

  const newLine: TransportLine = {
    id: generateTransportLineId(
      transportType,
      fromBuildingId,
      toBuildingId,
      existingLines.length,
    ),
    type: transportType as TransportType,
    level: 1,
    fromBuilding: fromBuildingId,
    toBuilding: toBuildingId,
    carriesResource: resource as ResourceType,
    throughput,
    maxThroughput,
    active: true,
  };

  return {
    money: money - moneyCost,
    transportLines: [...existingLines, newLine],
    stats: existingStats
      ? {
          ...existingStats,
          transportLinesBuilt: (existingStats.transportLinesBuilt ?? 0) + 1,
        }
      : undefined,
  };
}

export interface UpgradeTransportLineMutationInput {
  lineId: string;
  newLevel: number;
  newThroughput: number;
  cost: number;
}

export function applyUpgradeTransportLineMutation(
  input: UpgradeTransportLineMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { lineId, newLevel, newThroughput, cost } = input;
  const lines = state.transportLines ?? [];
  const money = state.money ?? 0;

  const updatedLines: TransportLine[] = lines.map((l) =>
    l.id === lineId
      ? { ...l, level: newLevel, throughput: newThroughput }
      : l,
  );

  return {
    money: money - cost,
    transportLines: updatedLines,
  };
}