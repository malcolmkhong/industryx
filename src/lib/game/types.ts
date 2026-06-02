// ============================================
// FACTORY DOMINION: AUTOMATED EMPIRE
// Core Game Types
// ============================================

// --- Resources ---
export type RawResource = 'iron' | 'copper' | 'coal' | 'oil' | 'sand' | 'lithium' | 'water' | 'rareEarth' | 'clay' | 'limestone' | 'gravel' | 'bauxite' | 'wolframite';
export type Tier1Resource = 'ironPlate' | 'copperWire' | 'plastic' | 'glass' | 'carbon' | 'bricks' | 'concrete' | 'fertilizer' | 'steel' | 'fossilFuel';
export type Tier2Resource = 'circuit' | 'engine' | 'battery' | 'gear' | 'silicon' | 'aluminium' | 'insecticide' | 'copperIngot' | 'titanium' | 'coolant' | 'fiberOptics' | 'solarCell';
export type Tier3Resource = 'aiChip' | 'robotics' | 'quantumPart' | 'advancedAlloy' | 'nanoMaterial' | 'electronics' | 'medicalTech' | 'jewellery' | 'tungsten' | 'weapons' | 'scanDrone' | 'artifactDetector' | 'neuralNetwork';
export type Tier4Resource = 'singularityCore' | 'darkMatterCell' | 'warpDrive' | 'antimatter' | 'chronoPart' | 'plasmaCore' | 'megaStructure' | 'voidCrystal';
export type ResourceType = RawResource | Tier1Resource | Tier2Resource | Tier3Resource | Tier4Resource;

export type CostResourceType = ResourceType | 'money';

export interface ResourceAmount {
  resource: CostResourceType;
  amount: number;
}

// --- Buildings ---
export type BuildingType = 
  | 'miningDrill' | 'oilPump' | 'waterExtractor' | 'quarry' | 'clayPit' | 'limestoneQuarry' | 'gravelPit' | 'bauxiteMine' | 'wolframiteMine' | 'rareEarthExtractor'
  | 'smelter' | 'wireMill' | 'chemicalPlant' | 'glassFurnace' | 'carbonProcessor' | 'brickFactory' | 'concreteFactory' | 'fertilizerFactory' | 'steelForge' | 'oilRefinery'
  | 'gearFactory' | 'circuitFactory' | 'engineFactory' | 'batteryFactory' | 'siliconRefinery' | 'aluminiumFactory' | 'insecticideFactory' | 'copperRefinery' | 'titaniumRefinery' | 'coolantPlant' | 'opticsLab' | 'solarCellFactory' | 'displayFactory' | 'hydrogenPlant'
  | 'aiLab' | 'roboticsBay' | 'quantumLab' | 'alloyForge' | 'nanoLab' | 'electronicsFactory' | 'medicalTechLab' | 'goldsmith' | 'tungstenSmelter' | 'armsFactory' | 'droneShipyard' | 'detectorFactory' | 'neuralLab'
  | 'singularityForge' | 'darkMatterLab' | 'warpDriveFactory' | 'antimatterReactor' | 'chronoLab' | 'plasmaForge' | 'megaStructureFactory' | 'voidCrystallizer'
  | 'dysonCollector' | 'quantumTeleporter' | 'dimensionalGateway' | 'timeDistorter' | 'galacticForge'
  | 'coalGenerator' | 'solarPanel' | 'windTurbine' | 'nuclearReactor' | 'fusionReactor' | 'antimatterPowerPlant';

export type ExtractorType = 'miningDrill' | 'oilPump' | 'waterExtractor' | 'quarry' | 'clayPit' | 'limestoneQuarry' | 'gravelPit' | 'bauxiteMine' | 'wolframiteMine' | 'rareEarthExtractor';
export type FactoryType = 'smelter' | 'wireMill' | 'chemicalPlant' | 'glassFurnace' | 'carbonProcessor' | 'brickFactory' | 'concreteFactory' | 'fertilizerFactory' | 'steelForge' | 'oilRefinery' | 'gearFactory' | 'circuitFactory' | 'engineFactory' | 'batteryFactory' | 'siliconRefinery' | 'aluminiumFactory' | 'insecticideFactory' | 'copperRefinery' | 'titaniumRefinery' | 'coolantPlant' | 'opticsLab' | 'solarCellFactory' | 'displayFactory' | 'hydrogenPlant' | 'aiLab' | 'roboticsBay' | 'quantumLab' | 'alloyForge' | 'nanoLab' | 'electronicsFactory' | 'medicalTechLab' | 'goldsmith' | 'tungstenSmelter' | 'armsFactory' | 'droneShipyard' | 'detectorFactory' | 'neuralLab' | 'singularityForge' | 'darkMatterLab' | 'warpDriveFactory' | 'antimatterReactor' | 'chronoLab' | 'plasmaForge' | 'megaStructureFactory' | 'voidCrystallizer' | 'dysonCollector' | 'quantumTeleporter' | 'dimensionalGateway' | 'timeDistorter' | 'galacticForge';
export type PowerPlantType = 'coalGenerator' | 'solarPanel' | 'windTurbine' | 'nuclearReactor' | 'fusionReactor' | 'antimatterPowerPlant';

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
  icon: string;
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
  icon: string;
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
  icon: string;
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
  icon: string;
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
  gameTier?: number; // 0-3, determines when contract becomes available
  icon: string;
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
  icon: string;
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
  icon: string;
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

// --- MegaProjects ---
export type MegaProjectType = 'spaceElevator' | 'dysonSphere' | 'quantumInternet' | 'fusionCity' | 'terraformingEngine' | 'galacticTradeHub' | 'deepCoreExtractor' | 'neuralCommandCenter' | 'nanoAssemblyMatrix';

export type MegaProjectBonusType = 'transportMultiplier' | 'powerMultiplier' | 'researchMultiplier' | 'productionMultiplier' | 'unlimitedStorage' | 'marketMultiplier' | 'extractionMultiplier' | 'workerEfficiency' | 'buildingCostReduction';

export interface MegaProjectStage {
  name: string;
  requiredResources: ResourceAmount[];
  timeRequired: number; // ticks
  completed: boolean;
}

export interface MegaProject {
  type: MegaProjectType;
  name: string;
  description: string;
  icon: string;
  stages: MegaProjectStage[];
  currentStage: number;
  progress: number; // 0-1 for current stage
  active: boolean;
  completed: boolean;
  bonus: {
    type: MegaProjectBonusType;
    description: string;
    value: number;
  };
  unlockRequirement: {
    buildings?: number;
    research?: number;
    prestige?: number;
  };
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

// --- Leaderboard ---
export interface LeaderboardEntry {
  id: string;
  rank: number;
  score: number;
  corporationName: string;
  buildingsBuilt: number;
  researchCompleted: number;
  contractsCompleted: number;
  totalMoneyEarned: number;
  playTime: number;
  prestigeCount: number;
  achievedAt: number; // game tick
  rankName: string; // from RANK_THRESHOLDS
}

// --- Weather ---
export type WeatherType = 'clear' | 'rainy' | 'stormy' | 'sunny' | 'foggy' | 'snowy';

export interface WeatherState {
  current: WeatherType;
  intensity: number; // 0-1, how strong the weather effect is
  remaining: number; // ticks remaining
  nextChange: number; // tick when weather will change
}

export interface WeatherDefinition {
  name: string;
  icon: string;
  productionMultiplier: number;
  solarMultiplier: number;
  windMultiplier: number;
  description: string;
}

// --- Quests ---
export type QuestType = 'build' | 'produce' | 'sell' | 'research' | 'earn' | 'reach' | 'contract' | 'transport' | 'worker' | 'prestige' | 'megaProject';

export interface QuestStep {
  description: string;
  target: number;
  current: number;
  completed: boolean;
}

export interface Quest {
  id: string;
  name: string;
  description: string;
  type: QuestType;
  category: 'tutorial' | 'daily' | 'weekly' | 'challenge' | 'milestone';
  gameTier?: number; // 0-4, determines when quest becomes available
  steps: QuestStep[];
  reward: { money: number; researchPoints?: number; corporationPoints?: number };
  completed: boolean;
  claimed: boolean;
  expiresAt?: number; // tick for daily/weekly quests
  icon: string;
  /** Optional target resource/building for specific tracking */
  targetResource?: ResourceType;
  targetBuilding?: BuildingType;
}

// --- Daily Rewards ---
export interface DailyReward {
  day: number; // 1-7 (resets weekly)
  type: 'money' | 'researchPoints' | 'resources' | 'corporationPoints';
  amount: number;
  resource?: ResourceType; // only for type='resources'
  claimed: boolean;
}

export interface LoginStreak {
  currentStreak: number;
  longestStreak: number;
  lastLoginDate: string; // YYYY-MM-DD format
  totalLogins: number;
  weeklyRewards: DailyReward[]; // 7 rewards for current week
}

// --- Payout ---
export interface PayoutConfig {
  basePayoutInterval: number; // ticks between payouts (e.g., 100 ticks = ~100 seconds at 1x)
  lastPayoutTick: number;
  totalPayoutsReceived: number;
  autoCollect: boolean; // whether payouts are auto-collected
}

export interface PayoutRecord {
  tick: number;
  amount: number;
  buildingCount: number;
  efficiency: number;
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
  
  // MegaProjects
  megaProjects: MegaProject[];

  // Blueprints
  blueprints: Blueprint[];

  // Production History
  productionHistory: {
    timestamp: number;
    resources: Record<ResourceType, number>;
    money: number;
    powerProduction: number;
    powerConsumption: number;
  }[];

  // Auto-Sell Resources
  autoSellResources: ResourceType[];

  // Storage Upgrades
  storageUpgradeLevels: Record<ResourceType, number>;

  // Offline Progress
  lastOnlineTimestamp: number;

  // Leaderboard
  leaderboardEntries: LeaderboardEntry[];

  // Login Streak
  loginStreak: LoginStreak;

  // Weather
  weather: WeatherState;

  // Quests
  quests: Quest[];

  // Payout System
  payoutConfig: PayoutConfig;
  pendingPayout: number;
  payoutHistory: PayoutRecord[];

  // Tracked Quest
  trackedQuest: string | null; // quest id that is being tracked/pinned

  // Drone Delivery
  drones: {
    fleet: Drone[];
    completedMissions: number;
    totalEarned: number;
  };

  // UI State
  activeTab: GameTab;
  selectedBuilding: string | null;
  notifications: GameNotification[];

  // Computed rates (updated each tick)
  computedProductionRates: Record<string, number>;
  computedConsumptionRates: Record<string, number>;
  computedActualConsumptionRates: Record<string, number>; // Only actual consumption (excludes stalled factory demand)

  // Production snapshot — single source of truth for all economy data (Phase 2)
  // UI should read from this instead of the three computed* fields above
  productionSnapshot: import('./productionCalculator').ProductionSnapshot;
}

export type GameTab = 'dashboard' | 'factoryMap' | 'resourceMonitor' | 'resources' | 'factories' | 'storage' | 'transport' | 'power' | 'market' | 'research' | 'workers' | 'contracts' | 'quests' | 'automation' | 'prestige' | 'events' | 'megaprojects' | 'statistics' | 'blueprints' | 'guide' | 'achievements' | 'leaderboard' | 'dailyRewards' | 'payouts' | 'droneDelivery' | 'notifications' | 'settings';

// --- Drone Delivery ---
export interface Drone {
  id: string;
  status: 'idle' | 'delivering';
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
  reward: { money: number; resources?: { resource: ResourceType; amount: number }[]; researchPoints?: number };
  fuelCost: number;
  baseTicks: number; // base duration in ticks
}

export interface GameNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  gameTick: number;
  read: boolean;
}
