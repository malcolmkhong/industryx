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

export type BuildingConditionStatus = 'pristine' | 'good' | 'worn' | 'damaged' | 'critical' | 'broken';

export interface BuildingInstance {
  id: string;
  type: BuildingType;
  level: number;
  active: boolean;
  efficiency: number; // 0-1, affected by power, workers, transport
  placedAt: number; // tick when placed
  // Condition System Fields
  condition: number;       // 0-100, starts at 100 for new buildings
  lastDamageTick: number;  // game tick when last damaged (for repair cooldowns)
  deteriorationRate: number; // base deterioration per tick cycle (default: 0.01)
  // Map System Fields
  gridRow?: number;    // Row position on the grid (0-based)
  gridCol?: number;    // Column position on the grid (0-based)
  regionId?: string;   // Which region this building is placed in
}

// Safe condition value - ensures condition is always a valid number (0-100)
// null/undefined/NaN are treated as 100 (pristine), consistent with UI normalization
export function safeCondition(condition: number | null | undefined): number {
  if (condition == null || !Number.isFinite(condition)) return 100;
  return Math.max(0, Math.min(100, condition));
}

// Condition thresholds helper
export function getConditionStatus(condition: number): BuildingConditionStatus {
  if (condition >= 100) return 'pristine';
  if (condition >= 75) return 'good';
  if (condition >= 50) return 'worn';
  if (condition >= 25) return 'damaged';
  if (condition >= 1) return 'critical';
  return 'broken';
}

export function getConditionColor(condition: number): string {
  if (condition >= 75) return '#4ade80';   // green
  if (condition >= 50) return '#facc15';   // yellow
  if (condition >= 25) return '#f97316';   // orange
  if (condition >= 1) return '#ef4444';    // red
  return '#991b1b';                         // dark red (broken)
}

export function getConditionStatusLabel(status: BuildingConditionStatus): string {
  switch (status) {
    case 'pristine': return 'Pristine';
    case 'good': return 'Good';
    case 'worn': return 'Worn';
    case 'damaged': return 'Damaged';
    case 'critical': return 'Critical';
    case 'broken': return 'Broken';
  }
}

// --- Building Size / Footprint ---
export type BuildingFootprintSize = 1 | 2 | 3 | 4 | 5;

export interface BuildingFootprint {
  width: BuildingFootprintSize;
  height: BuildingFootprintSize;
  cells: number; // width * height, convenience
}

// --- Grid Map System ---
export interface GridTile {
  row: number;
  col: number;
  occupiedBy: string | null; // building instance ID
  regionId: string;
  terrain: 'flat' | 'rocky' | 'water' | 'forest' | 'mountain';
  bonus?: TileBonus;
}

export interface TileBonus {
  type: 'production' | 'power' | 'extraction' | 'efficiency';
  value: number; // multiplier bonus
  description: string;
}

// --- Region System ---
export type RegionId = 'grasslands' | 'industrial' | 'highlands' | 'quantum' | 'cosmic';

export interface Region {
  id: RegionId;
  name: string;
  emoji: string;
  description: string;
  color: string;       // Primary color for UI
  bgColor: string;     // Background color
  borderColor: string; // Border color
  gridRows: number;
  gridCols: number;
  maxBuildingSize: BuildingFootprintSize; // Largest building allowed
  minGameTier: number;  // Player must be at least this tier
  allowedCategories: Array<'extractor' | 'factory' | 'power' | 'storage'>;
  allowedResourceTiers: [number, number]; // [min, max] resource tier
  terrainDistribution: Record<GridTile['terrain'], number>; // 0-1 weights
  unlockCost: number;   // Money cost to unlock the region
  unlocked: boolean;
  bonuses: RegionBonus[];
  icon: string;         // Lucide icon name
}

export interface RegionBonus {
  type: 'production' | 'power' | 'extraction' | 'efficiency' | 'capacity';
  value: number;
  description: string;
  appliesTo?: string; // building type or category
}

// --- Logistics Route System ---
export interface LogisticsRoute {
  id: string;
  fromBuildingId: string;  // Source building instance ID
  toBuildingId: string;    // Destination building instance ID
  carriesResource: ResourceType;
  throughput: number;       // Units per tick
  maxThroughput: number;
  efficiency: number;      // 0-1 based on distance & upgrades
  active: boolean;
  routeType: 'conveyor' | 'pipe' | 'truck' | 'train' | 'drone';
}

export interface LogisticsNode {
  buildingId: string;
  regionId: string;
  gridRow: number;
  gridCol: number;
  connections: string[]; // Route IDs connected to this node
}

// --- Map View State ---
export type MapViewLayer = 'region' | 'grid' | 'logistics';
export type MapViewMode = 'view' | 'build' | 'route' | 'demolish';

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
  footprint?: BuildingFootprint; // Grid footprint size (defaults to 1x1 if not set)
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
export type ContractDifficulty = 'easy' | 'medium' | 'hard' | 'legendary';

export type ContractType = 'delivery' | 'supply' | 'construction' | 'military' | 'research';

export interface Contract {
  id: string;
  name: string;
  description: string;
  type: ContractType;
  requiredResources: ResourceAmount[];
  timeLimit: number; // ticks
  timeRemaining: number;
  reward: ContractReward;
  progress: number; // 0-1
  completed: boolean;
  failed: boolean;
  difficulty: number; // 1-5 numeric (legacy)
  difficultyTier: ContractDifficulty; // easy/medium/hard/legendary
  gameTier?: number; // 0-4, determines when contract becomes available
  emoji: string;
  accepted: boolean; // whether player has accepted this contract
  expiresAt: number; // tick when unaccepted contract expires from the board
  // Architecture metadata (4-Layer System)
  templateType: ContractType;     // Which base template was used
  validationPassed: boolean;      // Did Layer 4 validation pass?
  validationNotes?: string[];     // Any validation adjustments made
}

export interface ContractReward {
  money: number;
  researchPoints?: number;
  corporationPoints?: number;
  blueprints?: string[];
  unlockBuilding?: BuildingType;
  rareResources?: { resource: ResourceType; amount: number }[];
}

export const CONTRACT_DIFFICULTY_META: Record<ContractDifficulty, { label: string; icon: string; color: string; bgColor: string; borderColor: string; minGameTier: number; materialCount: [number, number]; deadlineMultiplier: number; rewardMultiplier: number; emoji: string }> = {
  easy: { label: 'Easy', icon: '🟢', color: '#22c55e', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30', minGameTier: 0, materialCount: [1, 2], deadlineMultiplier: 1.5, rewardMultiplier: 1.0, emoji: '📦' },
  medium: { label: 'Medium', icon: '🟡', color: '#eab308', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/30', minGameTier: 1, materialCount: [2, 4], deadlineMultiplier: 1.0, rewardMultiplier: 2.0, emoji: '📋' },
  hard: { label: 'Hard', icon: '🔴', color: '#ef4444', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30', minGameTier: 2, materialCount: [3, 6], deadlineMultiplier: 0.7, rewardMultiplier: 3.5, emoji: '⚔️' },
  legendary: { label: 'Legendary', icon: '💎', color: '#a855f7', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30', minGameTier: 3, materialCount: [5, 10], deadlineMultiplier: 0.4, rewardMultiplier: 6.0, emoji: '👑' },
};

// --- Contract Architecture (4-Layer System) ---

// Layer 1: Base Template
export interface ContractTypeTemplate {
  type: ContractType;
  namePatterns: string[];        // Name templates with {mat} placeholder
  descriptionPatterns: string[]; // Description templates with {mats} placeholder
  emoji: string;
  deadlineModifier: number;      // Multiplier on base deadline
  rewardModifier: number;        // Multiplier on base reward
  rpBonus: number;               // Extra RP bonus
  cpBonus: number;               // Extra CP bonus
  spawnWeight: number;           // Probability weight for random selection
}

// Layer 2: Tier Rules
export interface ContractTierRules {
  materialCount: [number, number];
  allowedResourceTiers: [number, number];
  maxResourceTierWeight: number;
  deadlineRange: [number, number];
  deadlineScaleByMaterials: number;
  rewardMultiplier: [number, number];
  rpRange: [number, number];
  cpRange: [number, number];
  rareResourceChance: number;
  rareResourceCount: [number, number];
  boardSlotCount: number;
  boardExpiration: number;
  minGameTier: number;
  spawnChance: number; // 0-1, for legendary only basically
}

// Layer 4: Validation
export interface ContractValidationResult {
  valid: boolean;
  completable: boolean;       // Can player produce all materials?
  chainSupported: boolean;    // Production chains exist?
  economyBalanced: boolean;   // Rewards within economy limits?
  notRedundant: boolean;      // Not too similar to existing contracts?
  warnings: string[];         // Non-fatal issues
  adjustments: string[];      // Changes made during validation
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
  emoji: string;
  stages: MegaProjectStage[];
  currentStage: number;
  progress: number; // ticks completed for current stage
  active: boolean;
  paused: boolean; // manually paused by player
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
  emoji: string;
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
  emoji: string;
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
  researchQueue: string[]; // Max 5 queued research items
  
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

  // Map System (Hybrid Grid + Logistics + Region)
  mapRegions: Region[];
  mapGrids: Record<string, GridTile[]>; // regionId → tiles
  logisticsRoutes: LogisticsRoute[];
  activeRegion: RegionId | null;
  mapViewLayer: MapViewLayer;
  mapViewMode: MapViewMode;

  // Computed rates (updated each tick)
  computedProductionRates: Record<string, number>;
  computedConsumptionRates: Record<string, number>;
  computedActualConsumptionRates: Record<string, number>; // Only actual consumption (excludes stalled factory demand)

  // Maintenance Log
  maintenanceLog: MaintenanceLogEntry[];
}

export type GameTab = 'dashboard' | 'factoryMap' | 'resources' | 'factories' | 'storage' | 'chains' | 'transport' | 'power' | 'market' | 'research' | 'workers' | 'buildingManagement' | 'contracts' | 'quests' | 'automation' | 'prestige' | 'events' | 'megaprojects' | 'statistics' | 'blueprints' | 'guide' | 'achievements' | 'leaderboard' | 'dailyRewards' | 'payouts' | 'droneDelivery' | 'notifications' | 'resourceMonitor' | 'settings';

// --- Maintenance Log ---
export interface MaintenanceLogEntry {
  id: string;
  tick: number;
  buildingId: string;
  buildingName: string;
  eventType: 'storm_damage' | 'earthquake_damage' | 'power_overload_damage' | 'deterioration' | 'condition_warning' | 'critical_warning' | 'broken' | 'repair' | 'self_repair';
  conditionChange: number; // negative for damage, positive for repair
  conditionAfter: number;
  repairCost?: number;
  details?: string;
}

// --- Production Chain Categories ---
export type ProductionChainCategory = 'basic' | 'industrial' | 'advanced' | 'hightech' | 'cosmic';

export const CHAIN_CATEGORY_META: Record<ProductionChainCategory, { label: string; icon: string; color: string; order: number }> = {
  basic: { label: 'Basic Materials', icon: '🪨', color: '#a0a0a0', order: 0 },
  industrial: { label: 'Industrial Materials', icon: '🏭', color: '#8db4e2', order: 1 },
  advanced: { label: 'Advanced Materials', icon: '⚙️', color: '#ff69b4', order: 2 },
  hightech: { label: 'High-Tech / Quantum', icon: '🔮', color: '#9400d3', order: 3 },
  cosmic: { label: 'Cosmic / Endgame', icon: '🌌', color: '#00ffcc', order: 4 },
};

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
