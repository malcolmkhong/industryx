// ============================================
// buildings.ts — building + blueprint domain types.
// ============================================
//
// All building type unions, the active-instance representation, the
// static definition shape loaded from config, and saved Blueprints.
// Cross-domain refs to TransportType are intentional (Blueprint
// references both buildings and transport lines).
// ============================================

import type { ResourceType, ResourceAmount } from "./resources";
import type { TransportType } from "./transport";

// --- Building Type Catalogue ---
// Single source for all building-type string literals. Subset unions
// (Extractor / Factory / Power) derive from the same vocabulary so
// the compiler catches typos when a subset is widened later.

export type BuildingType =
  // Extractors
  | "ironMine"
  | "oilPump"
  | "waterExtractor"
  | "sandMine"
  | "clayPit"
  | "limestoneQuarry"
  | "gravelPit"
  | "bauxiteMine"
  | "wolframiteMine"
  | "rareEarthExtractor"
  | "copperMine"
  | "coalMine"
  | "lithiumMine"
  | "silverMine"
  | "goldMine"
  // Factories
  | "smelter"
  | "wireMill"
  | "chemicalPlant"
  | "glassFurnace"
  | "carbonProcessor"
  | "brickFactory"
  | "concreteFactory"
  | "fertilizerFactory"
  | "steelForge"
  | "oilRefinery"
  | "gearFactory"
  | "circuitFactory"
  | "engineFactory"
  | "batteryFactory"
  | "siliconRefinery"
  | "aluminiumFactory"
  | "insecticideFactory"
  | "copperRefinery"
  | "titaniumRefinery"
  | "coolantPlant"
  | "opticsLab"
  | "solarCellFactory"
  | "displayFactory"
  | "hydrogenPlant"
  | "reinforcedConcretePlant"
  | "powerCellPlant"
  | "silverRefinery"
  | "goldRefinery"
  | "aiLab"
  | "roboticsBay"
  | "quantumLab"
  | "alloyForge"
  | "nanoLab"
  | "electronicsFactory"
  | "medicalTechLab"
  | "jewelleryForge"
  | "tungstenSmelter"
  | "armsFactory"
  | "droneShipyard"
  | "detectorFactory"
  | "neuralLab"
  | "quantumAssembler"
  | "opticalComputingLab"
  | "carbonCompositePlant"
  | "structuralFrameFactory"
  | "fusionReactor"
  | "solarPanelFactory"
  | "creditMint"
  | "singularityForge"
  | "darkMatterLab"
  | "warpDriveFactory"
  | "antimatterReactor"
  | "chronoLab"
  | "plasmaForge"
  | "megaStructureFactory"
  | "voidCrystallizer"
  | "quantumResonanceLab"
  | "arcologyBuilder"
  | "habitatModuleFactory"
  | "luxuryGoodsFactory"
  | "tradeHub"
  | "teleporterGate"
  | "arcologyModuleAssembler"
  | "stellarForgeModule"
  | "voidEnergyCollector"
  | "tradeContractBroker"
  | "marketDominanceCenter"
  | "dysonCollector"
  | "quantumTeleporter"
  | "dimensionalGateway"
  | "timeDistorter"
  | "galacticForge"
  | "omniscienceArray"
  | "worldEngine"
  | "planetaryShield"
  | "starReactor"
  | "voidEngine"
  | "quantumExchange"
  | "megaCorpHQ"
  | "dimensionalNexus"
  | "galacticArmada"
  // Power plants
  | "coalGenerator"
  | "solarFarm"
  | "windTurbine"
  | "nuclearReactor"
  | "antimatterPowerPlant";

export type ExtractorType =
  | "ironMine"
  | "oilPump"
  | "waterExtractor"
  | "sandMine"
  | "clayPit"
  | "limestoneQuarry"
  | "gravelPit"
  | "bauxiteMine"
  | "wolframiteMine"
  | "rareEarthExtractor"
  | "copperMine"
  | "coalMine"
  | "lithiumMine"
  | "silverMine"
  | "goldMine";

export type FactoryType =
  | "smelter"
  | "wireMill"
  | "chemicalPlant"
  | "glassFurnace"
  | "carbonProcessor"
  | "brickFactory"
  | "concreteFactory"
  | "fertilizerFactory"
  | "steelForge"
  | "oilRefinery"
  | "gearFactory"
  | "circuitFactory"
  | "engineFactory"
  | "batteryFactory"
  | "siliconRefinery"
  | "aluminiumFactory"
  | "insecticideFactory"
  | "copperRefinery"
  | "titaniumRefinery"
  | "coolantPlant"
  | "opticsLab"
  | "solarCellFactory"
  | "displayFactory"
  | "hydrogenPlant"
  | "reinforcedConcretePlant"
  | "powerCellPlant"
  | "silverRefinery"
  | "goldRefinery"
  | "aiLab"
  | "roboticsBay"
  | "quantumLab"
  | "alloyForge"
  | "nanoLab"
  | "electronicsFactory"
  | "medicalTechLab"
  | "jewelleryForge"
  | "tungstenSmelter"
  | "armsFactory"
  | "droneShipyard"
  | "detectorFactory"
  | "neuralLab"
  | "quantumAssembler"
  | "opticalComputingLab"
  | "carbonCompositePlant"
  | "structuralFrameFactory"
  | "fusionReactor"
  | "solarPanelFactory"
  | "creditMint"
  | "singularityForge"
  | "darkMatterLab"
  | "warpDriveFactory"
  | "antimatterReactor"
  | "chronoLab"
  | "plasmaForge"
  | "megaStructureFactory"
  | "voidCrystallizer"
  | "quantumResonanceLab"
  | "arcologyBuilder"
  | "habitatModuleFactory"
  | "luxuryGoodsFactory"
  | "tradeHub"
  | "teleporterGate"
  | "arcologyModuleAssembler"
  | "stellarForgeModule"
  | "voidEnergyCollector"
  | "tradeContractBroker"
  | "marketDominanceCenter"
  | "dysonCollector"
  | "quantumTeleporter"
  | "dimensionalGateway"
  | "timeDistorter"
  | "galacticForge"
  | "omniscienceArray"
  | "worldEngine"
  | "planetaryShield"
  | "starReactor"
  | "voidEngine"
  | "quantumExchange"
  | "megaCorpHQ"
  | "dimensionalNexus"
  | "galacticArmada";

export type PowerPlantType =
  | "coalGenerator"
  | "solarFarm"
  | "windTurbine"
  | "nuclearReactor"
  | "antimatterPowerPlant";

export interface BuildingInstance {
  id: string;
  type: BuildingType;
  level: number;
  active: boolean;
  efficiency: number; // 0-1, affected by power, workers, transport
  placedAt: number; // tick when placed
}

/** Active building instance with optional cost metadata for UI cards. */
export type Building = BuildingInstance & { buildCost?: number };

export interface BuildingDefinition {
  type: BuildingType;
  name: string;
  description: string;
  category: "extractor" | "factory" | "power" | "storage";
  tier: number;
  baseCost: ResourceAmount[];
  costMultiplier: number; // cost increases per level
  basePowerConsumption: number; // MW
  basePowerProduction: number; // MW (for power plants)
  baseProductionRate: number; // units per tick
  inputs?: ResourceAmount[]; // required inputs per tick
  outputs?: ResourceAmount[]; // produced outputs per tick
  fuel?: ResourceType; // for coal generator
  fuelRate?: number; // fuel consumed per tick
  unlockRequirement?: { research?: string; level?: number; prestige?: number };
  icon: string;
}

// --- Blueprints ---
export interface Blueprint {
  id: string;
  name: string;
  buildings: { type: BuildingType; count: number }[];
  transportLines: { type: TransportType; count: number }[];
  savedAt: number;
  shared: boolean;
  likes: number;
}
