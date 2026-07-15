// ============================================
// transport.ts — transport + drone domain types.
// ============================================
//
// Land/sea/air transport lines plus drone delivery. Blueprint
// serialization re-imports TransportType here.
// ============================================

import type { ResourceType, ResourceAmount } from "./resources";

export type TransportType =
  | "conveyorBelt"
  | "pipe"
  | "truck"
  | "cargoTrain"
  | "drone"
  | "cargoShip";

export interface TransportLine {
  id: string;
  type: TransportType;
  level: number;
  fromBuilding: string; // building instance id
  toBuilding: string; // building instance id
  carriesResource: ResourceType;
  throughput: number; // units per tick
  maxThroughput: number;
  active: boolean;
}

export interface TransportDefinition {
  type: TransportType;
  name: string;
  description: string;
  baseCost: ResourceAmount[];
  baseThroughput: number; // units per tick
  upgradeMultiplier: number;
  icon: string;
}

// --- Drone Delivery ---
export interface Drone {
  id: string;
  status: "idle" | "delivering";
  missionEndTick: number;
  missionId: string | null;
  speedLevel: number;
  capacityLevel: number;
  fuelEfficiencyLevel: number;
}

export interface DroneMission {
  id: string;
  fromBuilding: string; // building type name
  toBuilding: string; // building type name
  reward: {
    money: number;
    resources?: { resource: ResourceType; amount: number }[];
    researchPoints?: number;
  };
  fuelCost: number;
  baseTicks: number; // base duration in ticks
}
