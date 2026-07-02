// ============================================
// FACTORY DOMINION: ICON MAPPINGS
// Single source of truth for all icon ID mappings.
// SVG icons use Iconify IDs (game-icons: prefix → game-icons CDN collection).
// ============================================

// --- Resource Icons ---
export const RESOURCE_ICON_MAP: Record<string, string> = {
  // Raw (Tier 0)
  iron: 'game-icons:mine-wagon',
  copper: 'game-icons:ore',
  coal: 'game-icons:coal-wagon',
  oil: 'game-icons:oil-rig',
  sand: 'game-icons:desert',
  lithium: 'game-icons:crystal-cluster',
  water: 'game-icons:water-drop',
  rareEarth: 'game-icons:sparkles',
  clay: 'game-icons:brick-pile',
  limestone: 'game-icons:stone-pile',
  gravel: 'game-icons:stone-block',
  bauxite: 'game-icons:peaks',
  wolframite: 'game-icons:dark-squad',

  // Tier 1
  ironPlate: 'game-icons:metal-plate',
  copperWire: 'game-icons:electric',
  plastic: 'game-icons:plastic-duck',
  glass: 'game-icons:glass-celebration',
  carbon: 'game-icons:coal-pile',
  bricks: 'game-icons:brick-wall',
  concrete: 'game-icons:concrete-bag',
  fertilizer: 'game-icons:fertilizer-bag',
  steel: 'game-icons:steel-claws',
  fossilFuel: 'game-icons:fuel-tank',

  // Tier 2
  circuit: 'game-icons:circuitry',
  engine: 'game-icons:gear-stick',
  battery: 'game-icons:battery-75',
  gear: 'game-icons:big-gear',
  silicon: 'game-icons:processor',
  aluminium: 'game-icons:metal-disc',
  insecticide: 'game-icons:poison',
  copperIngot: 'game-icons:gold-bar',
  titanium: 'game-icons:shield-impact',
  coolant: 'game-icons:snowflake-2',
  fiberOptics: 'game-icons:laser-burst',
  solarCell: 'game-icons:solar-power',

  // Tier 3
  aiChip: 'game-icons:brain',
  robotics: 'game-icons:robot-grab',
  quantumPart: 'game-icons:atom',
  advancedAlloy: 'game-icons:metal-bar',
  nanoMaterial: 'game-icons:nano-bot',
  electronics: 'game-icons:smartphone',
  medicalTech: 'game-icons:hospital-cross',
  jewellery: 'game-icons:diamond-ring',
  tungsten: 'game-icons:iron-cross',
  weapons: 'game-icons:ak47',
  scanDrone: 'game-icons:space-shuttle',
  artifactDetector: 'game-icons:satellite',
  neuralNetwork: 'game-icons:thought-bubble',

  // Tier 4
  singularityCore: 'game-icons:vortex',
  darkMatterCell: 'game-icons:hole',
  warpDrive: 'game-icons:rocket-thruster',
  antimatter: 'game-icons:lightning-frequency',
  chronoPart: 'game-icons:hourglass',
  plasmaCore: 'game-icons:flame-tunnel',
  megaStructure: 'game-icons:castle',
  voidCrystal: 'game-icons:implosion',

  // Special resources
  money: 'game-icons:money-stack',
  researchPoints: 'game-icons:magnifying-glass',
  corporationPoints: 'game-icons:briefcase',
};

// --- Building Icons ---
export const BUILDING_ICON_MAP: Record<string, string> = {
  // Extractors
  ironMine: 'game-icons:mine-wagon',
  copperMine: 'game-icons:ore',
  coalMine: 'game-icons:coal-wagon',
  oilPump: 'game-icons:oil-rig',
  waterExtractor: 'game-icons:water-recycling',
  sandMine: 'game-icons:desert',
  lithiumMine: 'game-icons:crystal-cluster',
  clayPit: 'game-icons:clay-brick',
  limestoneQuarry: 'game-icons:stone-bridge',
  gravelPit: 'game-icons:stone-crafting',
  bauxiteMine: 'game-icons:mining-helmet',
  wolframiteMine: 'game-icons:obelisk',
  rareEarthExtractor: 'game-icons:crystal-shine',
  silverMine: 'game-icons:round-shield',
  goldMine: 'game-icons:gold-bar',

  // Tier 1 Factories
  smelter: 'game-icons:furnace',
  wireMill: 'game-icons:wire-coil',
  chemicalPlant: 'game-icons:chemical-drop',
  glassFurnace: 'game-icons:glass-celebration',
  steelForge: 'game-icons:anvil-impact',
  carbonProcessor: 'game-icons:coal-pile',
  brickFactory: 'game-icons:brick-wall',
  concreteFactory: 'game-icons:concrete-bag',
  fertilizerFactory: 'game-icons:seedling',
  oilRefinery: 'game-icons:refinery',

  // Tier 2 Factories
  gearFactory: 'game-icons:big-gear',
  circuitFactory: 'game-icons:circuitry',
  engineFactory: 'game-icons:gear-stick',
  batteryFactory: 'game-icons:battery-75',
  siliconRefinery: 'game-icons:processor',
  aluminiumFactory: 'game-icons:metal-disc',
  insecticideFactory: 'game-icons:poison',
  copperRefinery: 'game-icons:metal-scales',
  titaniumRefinery: 'game-icons:shield-impact',
  coolantPlant: 'game-icons:snowflake-2',
  opticsLab: 'game-icons:laser-burst',
  solarCellFactory: 'game-icons:solar-power',
  displayFactory: 'game-icons:tv',
  hydrogenPlant: 'game-icons:h2o',
  reinforcedConcretePlant: 'game-icons:concrete-bag',
  powerCellPlant: 'game-icons:battery-100',
  silverRefinery: 'game-icons:round-shield',
  goldRefinery: 'game-icons:gold-bar',

  // Tier 3 Factories
  aiLab: 'game-icons:brain',
  roboticsBay: 'game-icons:robot-grab',
  quantumLab: 'game-icons:atom',
  alloyForge: 'game-icons:metal-bar',
  nanoLab: 'game-icons:nano-bot',
  electronicsFactory: 'game-icons:smartphone',
  medicalTechLab: 'game-icons:hospital-cross',
  jewelleryForge: 'game-icons:diamond-ring',
  tungstenSmelter: 'game-icons:iron-cross',
  armsFactory: 'game-icons:ak47',
  droneShipyard: 'game-icons:space-shuttle',
  detectorFactory: 'game-icons:satellite',
  neuralLab: 'game-icons:thought-bubble',
  quantumAssembler: 'game-icons:atom',
  opticalComputingLab: 'game-icons:laser-burst',
  carbonCompositePlant: 'game-icons:rope-coil',
  structuralFrameFactory: 'game-icons:bridge',
  fusionReactor: 'game-icons:nuclear-bomb',
  solarPanelFactory: 'game-icons:solar-power',
  creditMint: 'game-icons:id-card',

  // Tier 4 Factories
  singularityForge: 'game-icons:vortex',
  darkMatterLab: 'game-icons:hole',
  warpDriveFactory: 'game-icons:rocket-thruster',
  antimatterReactor: 'game-icons:lightning-frequency',
  chronoLab: 'game-icons:hourglass',
  plasmaForge: 'game-icons:flame-tunnel',
  megaStructureFactory: 'game-icons:castle',
  voidCrystallizer: 'game-icons:implosion',
  quantumResonanceLab: 'game-icons:atom',
  arcologyBuilder: 'game-icons:modern-city',
  habitatModuleFactory: 'game-icons:house',
  luxuryGoodsFactory: 'game-icons:cut-diamond',
  tradeHub: 'game-icons:hand',
  teleporterGate: 'game-icons:teleport',

  // Tier 4 Endgame Buildings
  dysonCollector: 'game-icons:solar-system',
  quantumTeleporter: 'game-icons:teleport',
  dimensionalGateway: 'game-icons:portal',
  timeDistorter: 'game-icons:hourglass',
  galacticForge: 'game-icons:galaxy',

  // Tier 5 Transcendent
  omniscienceArray: 'game-icons:brain',
  worldEngine: 'game-icons:planet-core',
  planetaryShield: 'game-icons:round-shield',
  starReactor: 'game-icons:round-star',
  voidEngine: 'game-icons:hole',
  quantumExchange: 'game-icons:chart',
  megaCorpHQ: 'game-icons:bank',
  dimensionalNexus: 'game-icons:portal',
  galacticArmada: 'game-icons:spaceship',

  // Power Plants
  coalGenerator: 'game-icons:refinery',
  solarFarm: 'game-icons:solar-power',
  windTurbine: 'game-icons:wind-turbine',
  nuclearReactor: 'game-icons:nuclear',
  antimatterPowerPlant: 'game-icons:lightning-frequency',
};

// --- Transport Icons ---
export const TRANSPORT_ICON_MAP: Record<string, string> = {
  conveyorBelt: 'game-icons:tread',
  pipe: 'game-icons:pipes',
  truck: 'game-icons:cargo-ship',
  cargoTrain: 'game-icons:steam-locomotive',
  drone: 'game-icons:ufo',
  cargoShip: 'game-icons:cargo-ship',
};

// --- Worker Icons ---
export const WORKER_ICON_MAP: Record<string, string> = {
  engineer: 'game-icons:overhead',
  mechanic: 'game-icons:wrench',
  transportManager: 'game-icons:railway',
  aiSupervisor: 'game-icons:robot-golem',
};

// --- Research Icons ---
export const RESEARCH_ICON_MAP: Record<string, string> = {
  // Automation
  basicAutomation: 'game-icons:gear-hammer',
  advancedAutomation: 'game-icons:mechanical-arm',
  basicMachining: 'game-icons:gear-hammer',

  // Logistics
  logistics1: 'game-icons:truck',
  advancedLogistics: 'game-icons:steam-locomotive',

  // Energy
  energyEfficiency: 'game-icons:lightning-storm',
  nuclearPower: 'game-icons:nuclear',
  fusionEnergy: 'game-icons:reactor',

  // Electronics & AI
  electronics: 'game-icons:circuitry',
  energyStorage: 'game-icons:battery-75',
  artificialIntelligence: 'game-icons:brain',

  // Robotics
  mechanicalEngineering: 'game-icons:wrench',
  roboticsTech: 'game-icons:robot-grab',
  advancedMetallurgy: 'game-icons:metal-bar',

  // T2 Bonus Researches
  advancedDrilling: 'game-icons:mining',
  efficientSmelting: 'game-icons:furnace',
  advancedElectronics: 'game-icons:processor',
  powerOptimization: 'game-icons:lightning-frequency',
  cargoDrones: 'game-icons:ufo',

  // Quantum
  quantumPhysics: 'game-icons:atom',
  nanotechnology: 'game-icons:nano-bot',

  // Market & Bonuses
  marketAnalysis: 'game-icons:profit',
  workerTraining: 'game-icons:overhead',
  storageExpansion: 'game-icons:warehouse',

  // T3 Bonus Researches
  aiOptimization: 'game-icons:brain',
  advancedRobotics: 'game-icons:robot-golem',
  quantumComputing: 'game-icons:cpu',
  metabolicEngineering: 'game-icons:dna1',
  megaStorage: 'game-icons:warehouse',

  // Tier 4 Research
  singularityTheory: 'game-icons:vortex',
  antimatterPhysics: 'game-icons:lightning-frequency',
  warpTechnology: 'game-icons:rocket-thruster',
  plasmaDynamics: 'game-icons:flame-tunnel',
  chronoEngineering: 'game-icons:hourglass',
  voidCrystallography: 'game-icons:implosion',
  megaConstruction: 'game-icons:castle',
  dimensionalPhysics: 'game-icons:portal',
  galacticManufacturing: 'game-icons:galaxy',
};

// --- Mega Project Icons ---
export const MEGA_PROJECT_ICON_MAP: Record<string, string> = {
  spaceElevator: 'game-icons:rocket-thruster',
  dysonSphere: 'game-icons:solar-system',
  quantumInternet: 'game-icons:spider-web',
  fusionCity: 'game-icons:bank',
  terraformingEngine: 'game-icons:crystal-growth',
  galacticTradeHub: 'game-icons:hand',
  deepCoreExtractor: 'game-icons:mining',
  neuralCommandCenter: 'game-icons:brain',
  nanoAssemblyMatrix: 'game-icons:nano-bot',
};

// --- Weather Icons ---
export const WEATHER_ICON_MAP: Record<string, string> = {
  clear: 'game-icons:sun',
  sunny: 'game-icons:sun',
  rainy: 'game-icons:heavy-rain',
  stormy: 'game-icons:lightning-storm',
  foggy: 'game-icons:fog',
  snowy: 'game-icons:snowflake-2',
};

// --- UI Icons ---
export const UI_ICON_MAP: Record<string, string> = {
  // Core resources
  money: 'game-icons:money-stack',
  researchPoints: 'game-icons:magnifying-glass',
  corporationPoints: 'game-icons:briefcase',

  // Actions
  build: 'game-icons:hammer-drop',
  sell: 'game-icons:sell-card',
  buy: 'game-icons:buy-card',
  demolish: 'game-icons:demolish',
  repair: 'game-icons:wrench',
  produce: 'game-icons:refinery',

  // Status
  power: 'game-icons:lightning-frequency',
  production: 'game-icons:refinery',
  efficiency: 'game-icons:profit',
  speed: 'game-icons:fast-arrow',
  maintenance: 'game-icons:wrench',

  // Categories
  extractor: 'game-icons:mining',
  factory: 'game-icons:refinery',
  powerPlant: 'game-icons:nuclear',
  transport: 'game-icons:cargo-crane',
  research: 'game-icons:magnifying-glass',
  worker: 'game-icons:overhead',
  market: 'game-icons:trade',
  contract: 'game-icons:scroll-unfurled',
  quest: 'game-icons:scroll-unfurled',
  megaProject: 'game-icons:castle',
  event: 'game-icons:lightning-storm',
  prestige: 'game-icons:crown',
  automation: 'game-icons:robot-grab',

  // Tier icons
  tier0: 'game-icons:mining',
  tier1: 'game-icons:wrench',
  tier2: 'game-icons:big-gear',
  tier3: 'game-icons:brain',
  tier4: 'game-icons:galaxy',

  // Navigation
  home: 'game-icons:house',
  settings: 'game-icons:gear-hammer',
  help: 'game-icons:help',
  info: 'game-icons:info',
  close: 'game-icons:cross-mark',
  menu: 'game-icons:hamburger-menu',

  // Game UI
  pause: 'game-icons:pause-button',
  play: 'game-icons:play-button',
  fastForward: 'game-icons:fast-forward-button',
  save: 'game-icons:save',
  load: 'game-icons:cloud-upload',
  reset: 'game-icons:spinning-wheel',

  // Rank icons
  apprentice: 'game-icons:overhead',
  foreman: 'game-icons:heavy-helm',
  manager: 'game-icons:tie',
  director: 'game-icons:medal',
  vp: 'game-icons:trophy',
  ceo: 'game-icons:crown',
  tycoon: 'game-icons:diamond-ring',
  magnate: 'game-icons:star-formation',
  legend: 'game-icons:lightning-frequency',
  cosmic: 'game-icons:crystal-growth',
  emperor: 'game-icons:imperial-crown',
  dominion: 'game-icons:galaxy',

  // Event icons
  oilCrisis: 'game-icons:oil-rig',
  energyShortage: 'game-icons:lightning-storm',
  aiRevolution: 'game-icons:brain',
  economicBoom: 'game-icons:profit',
  naturalDisaster: 'game-icons:tornado',
  techBreakthrough: 'game-icons:erlenmeyer',
  tradeWar: 'game-icons:sword-clash',
  greenInitiative: 'game-icons:sprout',
  spaceRace: 'game-icons:rocket-thruster',
  marketCrash: 'game-icons:falling',

  // Automation unlock icons
  autoRouting: 'game-icons:tread',
  autoBalancing: 'game-icons:scales',
  selfRepair: 'game-icons:wrench',
  autoTrading: 'game-icons:profit',
  autoExpansion: 'game-icons:castle',
  smartStorage: 'game-icons:warehouse',
  aiOptimization: 'game-icons:brain',

  // Seasonal event icons
  doubleProduction: 'game-icons:flame-tunnel',
  researchBoom: 'game-icons:chemical-drop',
  marketSurge: 'game-icons:profit',
  powerBoost: 'game-icons:lightning-frequency',

  // Daily reward
  dailyReward: 'game-icons:present',
  streak: 'game-icons:flame',

  // Quest type icons
  tutorial: 'game-icons:book-cover',
  challenge: 'game-icons:trophy',
  milestone: 'game-icons:finish-line',
  daily: 'game-icons:calendar',
  earn: 'game-icons:money-stack',
  military: 'game-icons:ak47',
  delivery: 'game-icons:cargo-ship',
  supply: 'game-icons:cargo-crane',
  construction: 'game-icons:castle',

  // Prestige
  prestigeReset: 'game-icons:spinning-sword',
  productionMultiplier: 'game-icons:refinery',
  powerMultiplier: 'game-icons:lightning-frequency',
  gameSpeed: 'game-icons:fast-arrow',
  marketMultiplier: 'game-icons:profit',
  storageMultiplier: 'game-icons:cardboard-box',
  researchMultiplier: 'game-icons:magnifying-glass',
  offlineMultiplier: 'game-icons:moon',
  unlockMegaFactory: 'game-icons:castle',

  // Misc
  package: 'game-icons:cardboard-box',
  clock: 'game-icons:clockwork',
  star: 'game-icons:sparkles',
  diamond: 'game-icons:diamond-hard',
  flame: 'game-icons:flame',
  scroll: 'game-icons:scroll-unfurled',
  trophy: 'game-icons:trophy',
  crown: 'game-icons:crown',
  globe: 'game-icons:planet-core',
  laptop: 'game-icons:laptop',
  tv: 'game-icons:tv',
  dollar: 'game-icons:money-stack',
  dollarBill: 'game-icons:cash',
};

// --- Tier Emojis ---
// Used for status indicators, panel labels, and visual flair.
export const TIER_EMOJI_MAP: Record<number, string> = {
  0: '🏗️',
  1: '🔧',
  2: '⚙️',
  3: '🧠',
  4: '🌌',
  5: '🔮',
};
