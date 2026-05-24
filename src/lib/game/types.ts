// ============================================
// FACTORY DOMINION: AUTOMATED EMPIRE
// Core Game Types
// ============================================

// --- Resources ---
export type RawResource = 'iron' | 'copper' | 'coal' | 'oil' | 'sand' | 'lithium' | 'water' | 'rareEarth';
export type Tier1Resource = 'ironPlate' | 'copperWire' | 'plastic' | 'glass' | 'carbon';
export type Tier2Resource = 'circuit' | 'engine' | 'battery' | 'gear' | 'steel';
export type Tier3Resource = 'aiChip' | 'robotics' | 'quantumPart' | 'advancedAlloy' | 'nanoMaterial';
export type ResourceType = RawResource | Tier1Resource | Tier2Resource | Tier3Resource;

export type CostResourceType = ResourceType | 'money';

export interface ResourceAmount {
  resource: CostResourceType;
  amount: number;
}

// --- Buildings ---
export type BuildingType = 
  | 'miningDrill' | 'oilPump' | 'waterExtractor' | 'quarry'
  | 'smelter' | 'wireMill' | 'chemicalPlant' | 'glassFurnace'
  | 'gearFactory' | 'circuitFactory' | 'engineFactory' | 'batteryFactory'
  | 'aiLab' | 'roboticsBay' | 'quantumLab' | 'alloyForge' | 'nanoLab'
  | 'coalGenerator' | 'solarPanel' | 'windTurbine' | 'nuclearReactor' | 'fusionReactor';

export type ExtractorType = 'miningDrill' | 'oilPump' | 'waterExtractor' | 'quarry';
export type FactoryType = 'smelter' | 'wireMill' | 'chemicalPlant' | 'glassFurnace' | 'gearFactory' | 'circuitFactory' | 'engineFactory' | 'batteryFactory' | 'aiLab' | 'roboticsBay' | 'quantumLab' | 'alloyForge' | 'nanoLab';
export type PowerPlantType = 'coalGenerator' | 'solarPanel' | 'windTurbine' | 'nuclearReactor' | 'fusionReactor';

export interface BuildingInstance {
  id: string;
  type: BuildingType;
  level: number;
  active: boolean;
  efficiency: number; // 0-1, affected by power, workers, transport
  placedAt: number; // tick when placed
}

export interface BuildingDefinition {
  type: BuildingType;
  name: string;
  description: string;
  category: 'extractor' | 'factory' | 'power' | 'storage';
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
  emoji: string;
}

// --- Transport ---
export type TransportType = 'conveyorBelt' | 'pipe' | 'truck' | 'cargoTrain' | 'drone' | 'cargoShip';

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
  emoji: string;
}

// --- Research ---
export type ResearchCategory = 'automation' | 'logistics' | 'energy' | 'ai' | 'robotics' | 'quantum';

export interface ResearchNode {
  id: string;
  name: string;
  description: string;
  category: ResearchCategory;
  tier: number;
  cost: number; // research points
  timeRequired: number; // ticks
  prerequisites: string[]; // research ids
  effects: ResearchEffect[];
  emoji: string;
}

export interface ResearchEffect {
  type: 'productionSpeed' | 'transportSpeed' | 'powerEfficiency' | 'unlockBuilding' | 'unlockTransport' | 'unlockAutomation' | 'marketBonus' | 'workerEfficiency' | 'storageBonus';
  target?: string; // building type, transport type, etc.
  value: number; // multiplier or flat bonus
}

// --- Workers ---
export type WorkerType = 'engineer' | 'mechanic' | 'transportManager' | 'aiSupervisor';

export interface Worker {
  id: string;
  type: WorkerType;
  level: number;
  experience: number;
  assignedTo: string | null; // building instance id
  efficiency: number;
  speed: number;
  maintenance: number;
}

export interface WorkerDefinition {
  type: WorkerType;
  name: string;
  description: string;
  baseHireCost: number;
  effects: {
    efficiency: number; // per level
    speed: number;
    maintenance: number;
  };
  emoji: string;
}

// --- Contracts ---
export interface Contract {
  id: string;
  name: string;
  description: string;
  type: 'delivery' | 'supply' | 'construction' | 'military' | 'research';
  requiredResources: ResourceAmount[];
  timeLimit: number; // ticks
  timeRemaining: number;
  reward: ContractReward;
  progress: number; // 0-1
  completed: boolean;
  failed: boolean;
  difficulty: number; // 1-5
  emoji: string;
}

export interface ContractReward {
  money: number;
  researchPoints?: number;
  corporationPoints?: number;
  blueprints?: string[];
  unlockBuilding?: BuildingType;
}

// --- Market ---
export interface MarketPrice {
  resource: ResourceType;
  basePrice: number;
  currentPrice: number;
  priceHistory: number[];
  demand: number; // 0-2 multiplier
  supply: number; // 0-2 multiplier
  trend: 'up' | 'down' | 'stable';
  volatility: number; // 0-1
}

// --- Power Grid ---
export interface PowerGrid {
  totalProduction: number;
  totalConsumption: number;
  efficiency: number; // 0-1 based on production/consumption ratio
  overload: boolean;
  plants: BuildingInstance[];
}

// --- Events ---
export type EventType = 'oilCrisis' | 'energyShortage' | 'aiRevolution' | 'economicBoom' | 'naturalDisaster' | 'techBreakthrough' | 'tradeWar' | 'greenInitiative' | 'spaceRace' | 'marketCrash';

export interface GameEvent {
  id: string;
  type: EventType;
  name: string;
  description: string;
  duration: number; // ticks
  remaining: number;
  effects: EventEffect[];
  emoji: string;
}

export interface EventEffect {
  type: 'productionMultiplier' | 'powerMultiplier' | 'marketPriceMultiplier' | 'transportSpeed' | 'researchSpeed';
  target?: string;
  value: number; // multiplier
}

// --- Automation ---
export type AutomationType = 'autoRouting' | 'autoBalancing' | 'selfRepair' | 'autoTrading' | 'autoExpansion' | 'smartStorage' | 'aiOptimization';

export interface AutomationUnlock {
  type: AutomationType;
  name: string;
  description: string;
  cost: number; // corporation points
  active: boolean;
  requiresResearch?: string;
  emoji: string;
}

// --- Prestige / Global Expansion ---
export interface PrestigeState {
  corporationPoints: number;
  totalPrestiges: number;
  megaFactoryUnlocked: boolean;
  bonuses: PrestigeBonus[];
}

export interface PrestigeBonus {
  id: string;
  name: string;
  description: string;
  cost: number;
  purchased: boolean;
  effect: {
    type: string;
    value: number;
  };
}

// --- Blueprints ---
export interface Blueprint {
  id: string;
  name: string;
  buildings: { type: BuildingType; position: { x: number; y: number } }[];
  transportLines: { type: TransportType; from: number; to: number }[];
  savedAt: number;
  shared: boolean;
  likes: number;
}

// --- Game State ---
export interface GameState {
  // Core
  money: number;
  totalMoneyEarned: number;
  gameTick: number;
  gameSpeed: number;
  paused: boolean;
  
  // Resources
  resources: Record<ResourceType, number>;
  resourceCapacity: Record<ResourceType, number>;
  
  // Buildings
  buildings: BuildingInstance[];
  
  // Transport
  transportLines: TransportLine[];
  
  // Power
  powerGrid: PowerGrid;
  
  // Research
  researchPoints: number;
  completedResearch: string[];
  activeResearch: string | null;
  researchProgress: number;
  
  // Workers
  workers: Worker[];
  
  // Market
  market: MarketPrice[];
  
  // Contracts
  contracts: Contract[];
  completedContracts: number;
  
  // Automation
  automationUnlocks: AutomationUnlock[];
  
  // Prestige
  prestigeState: PrestigeState;
  
  // Events
  activeEvents: GameEvent[];
  eventLog: GameEvent[];
  
  // Stats
  stats: {
    totalResourcesProduced: Record<ResourceType, number>;
    totalResourcesSold: Record<ResourceType, number>;
    peakEfficiency: number;
    factoriesBuilt: number;
    transportLinesBuilt: number;
    researchCompleted: number;
    contractsCompleted: number;
    playTime: number; // in ticks
  };
  
  // UI State
  activeTab: GameTab;
  selectedBuilding: string | null;
  notifications: GameNotification[];
}

export type GameTab = 'dashboard' | 'resources' | 'factories' | 'transport' | 'power' | 'market' | 'research' | 'workers' | 'contracts' | 'automation' | 'prestige' | 'events' | 'blueprints';

export interface GameNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  gameTick: number;
  read: boolean;
}
