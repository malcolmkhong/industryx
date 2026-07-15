// ============================================
// resources.ts — resource domain types.
// ============================================
//
// Raw + processed tiers, the unified ResourceType union, and the
// cost representation used across buildings, contracts, mega-projects,
// and production rules.
// ============================================

export type RawResource =
  | "iron"
  | "copper"
  | "coal"
  | "oil"
  | "sand"
  | "lithium"
  | "water"
  | "rareEarth"
  | "clay"
  | "limestone"
  | "gravel"
  | "bauxite"
  | "wolframite"
  | "silver"
  | "gold";

export type Tier1Resource =
  | "ironPlate"
  | "copperWire"
  | "plastic"
  | "glass"
  | "carbon"
  | "bricks"
  | "concrete"
  | "fertilizer"
  | "steel"
  | "fossilFuel";

export type Tier2Resource =
  | "circuit"
  | "engine"
  | "battery"
  | "gear"
  | "silicon"
  | "aluminium"
  | "insecticide"
  | "copperIngot"
  | "titanium"
  | "coolant"
  | "fiberOptics"
  | "solarCell"
  | "powerCell"
  | "reinforcedConcrete"
  | "refinedSilver"
  | "refinedGold";

export type Tier3Resource =
  | "aiChip"
  | "robotics"
  | "quantumPart"
  | "advancedAlloy"
  | "nanoMaterial"
  | "electronics"
  | "medicalTech"
  | "jewellery"
  | "tungsten"
  | "weapons"
  | "scanDrone"
  | "artifactDetector"
  | "neuralNetwork"
  | "carbonComposite"
  | "structuralFrame"
  | "fusionCell"
  | "solarPanel"
  | "creditChip";

export type Tier4Resource =
  | "singularityCore"
  | "darkMatterCell"
  | "warpDrive"
  | "antimatter"
  | "chronoPart"
  | "plasmaCore"
  | "megaStructure"
  | "voidCrystal"
  | "arcologyModule"
  | "habitatModule"
  | "stellarEnergy"
  | "luxuryGoods"
  | "tradeContract"
  | "teleporterNode";

export type Tier5Resource =
  | "researchMatrix"
  | "worldCore"
  | "shieldMatrix"
  | "stellarForge"
  | "voidEnergy"
  | "marketDominance"
  | "corpCapital"
  | "dimensionalGate"
  | "armadaFleet";

/** All in-game resources (raw through end-game). */
export type ResourceType =
  | RawResource
  | Tier1Resource
  | Tier2Resource
  | Tier3Resource
  | Tier4Resource
  | Tier5Resource;

/** Cost-line resource — resource OR currency (money/RP/CP). */
export type CostResourceType =
  | ResourceType
  | "money"
  | "researchPoints"
  | "corporationPoints";

export interface ResourceAmount {
  resource: CostResourceType;
  amount: number;
}
