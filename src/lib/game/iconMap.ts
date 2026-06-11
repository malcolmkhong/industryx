// ============================================
// FACTORY DOMINION: ICON MAPPING
// Maps every game entity key to an Iconify icon ID
// ============================================

// --- Resource Icons ---
// Maps ResourceType keys to Iconify icon IDs
export const RESOURCE_ICON_MAP: Record<string, string> = {
  // Raw (Tier 0)
  iron: 'gi:mine-wagon',
  copper: 'gi:ore',
  coal: 'gi:coal-wagon',
  oil: 'gi:oil-rig',
  sand: 'gi:desert',
  lithium: 'gi:crystal-cluster',
  water: 'gi:water-drop',
  rareEarth: 'gi:sparkles',
  clay: 'gi:brick-pile',
  limestone: 'gi:stone-pile',
  gravel: 'gi:stone-block',
  bauxite: 'gi:peaks',
  wolframite: 'gi:dark-squad',

  // Tier 1
  ironPlate: 'gi:metal-plate',
  copperWire: 'gi:electric',
  plastic: 'gi:plastic-duck',
  glass: 'gi:glass-celebration',
  carbon: 'gi:coal-pile',
  bricks: 'gi:brick-wall',
  concrete: 'gi:concrete-bag',
  fertilizer: 'gi:fertilizer-bag',
  steel: 'gi:steel-claws',
  fossilFuel: 'gi:fuel-tank',

  // Tier 2
  circuit: 'gi:circuitry',
  engine: 'gi:gear-stick',
  battery: 'gi:battery-75',
  gear: 'gi:big-gear',
  silicon: 'gi:processor',
  aluminium: 'gi:metal-disc',
  insecticide: 'gi:poison',
  copperIngot: 'gi:gold-bar',
  titanium: 'gi:shield-impact',
  coolant: 'gi:snowflake-2',
  fiberOptics: 'gi:laser-burst',
  solarCell: 'gi:solar-power',

  // Tier 3
  aiChip: 'gi:brain',
  robotics: 'gi:robot-grab',
  quantumPart: 'gi:atom',
  advancedAlloy: 'gi:metal-bar',
  nanoMaterial: 'gi:nano-bot',
  electronics: 'gi:smartphone',
  medicalTech: 'gi:hospital-cross',
  jewellery: 'gi:diamond-ring',
  tungsten: 'gi:iron-cross',
  weapons: 'gi:ak47',
  scanDrone: 'gi:space-shuttle',
  artifactDetector: 'gi:satellite',
  neuralNetwork: 'gi:thought-bubble',

  // Tier 4
  singularityCore: 'gi:vortex',
  darkMatterCell: 'gi:hole',
  warpDrive: 'gi:rocket-thruster',
  antimatter: 'gi:lightning-frequency',
  chronoPart: 'gi:hourglass',
  plasmaCore: 'gi:flame-tunnel',
  megaStructure: 'gi:castle',
  voidCrystal: 'gi:implosion',

  // Special
  money: 'gi:money-stack',
  researchPoints: 'gi:magnifying-glass',
  corporationPoints: 'gi:briefcase',
};

// --- Building Icons ---
// Maps building type keys to Iconify icon IDs
export const BUILDING_ICON_MAP: Record<string, string> = {
  // Extractors
  ironMine: 'gi:mine-wagon',
  copperMine: 'gi:ore',
  coalMine: 'gi:coal-wagon',
  oilPump: 'gi:oil-rig',
  waterExtractor: 'gi:water-recycling',
  sandMine: 'gi:desert',
  lithiumMine: 'gi:crystal-cluster',
  clayPit: 'gi:clay-brick',
  limestoneQuarry: 'gi:stone-bridge',
  gravelPit: 'gi:stone-crafting',
  bauxiteMine: 'gi:mining-helmet',
  wolframiteMine: 'gi:obelisk',
  rareEarthExtractor: 'gi:crystal-shine',
  silverMine: 'gi:round-silver-shield',
  goldMine: 'gi:gold-bar',

  // Tier 1 Factories
  smelter: 'gi:furnace',
  wireMill: 'gi:wire-coil',
  chemicalPlant: 'gi:chemical-drop',
  glassFurnace: 'gi:glass-celebration',
  steelForge: 'gi:anvil-impact',
  carbonProcessor: 'gi:coal-pile',
  brickFactory: 'gi:brick-wall',
  concreteFactory: 'gi:concrete-bag',
  fertilizerFactory: 'gi:seedling',
  oilRefinery: 'gi:refinery',

  // Tier 2 Factories
  gearFactory: 'gi:big-gear',
  circuitFactory: 'gi:circuitry',
  engineFactory: 'gi:gear-stick',
  batteryFactory: 'gi:battery-75',
  siliconRefinery: 'gi:processor',
  aluminiumFactory: 'gi:metal-disc',
  insecticideFactory: 'gi:poison',
  copperRefinery: 'gi:metal-scales',
  titaniumRefinery: 'gi:shield-impact',
  coolantPlant: 'gi:snowflake-2',
  opticsLab: 'gi:laser-burst',
  solarCellFactory: 'gi:solar-power',
  displayFactory: 'gi:tv',
  hydrogenPlant: 'gi:h2o',
  reinforcedConcretePlant: 'gi:concrete-bag',
  powerCellPlant: 'gi:battery-100',
  silverRefinery: 'gi:round-silver-shield',
  goldRefinery: 'gi:gold-bar',

  // Tier 3 Factories
  aiLab: 'gi:brain',
  roboticsBay: 'gi:robot-grab',
  quantumLab: 'gi:atom',
  alloyForge: 'gi:metal-bar',
  nanoLab: 'gi:nano-bot',
  electronicsFactory: 'gi:smartphone',
  medicalTechLab: 'gi:hospital-cross',
  jewelleryForge: 'gi:diamond-ring',
  tungstenSmelter: 'gi:iron-cross',
  armsFactory: 'gi:ak47',
  droneShipyard: 'gi:space-shuttle',
  detectorFactory: 'gi:satellite',
  neuralLab: 'gi:thought-bubble',
  quantumAssembler: 'gi:atom',
  opticalComputingLab: 'gi:laser-burst',
  carbonCompositePlant: 'gi:carbon-fiber',
  structuralFrameFactory: 'gi:bridge',
  fusionReactor: 'gi:nuclear-bomb',
  solarPanelFactory: 'gi:solar-power',
  creditMint: 'gi:credit-card',

  // Tier 4 Factories
  singularityForge: 'gi:vortex',
  darkMatterLab: 'gi:hole',
  warpDriveFactory: 'gi:rocket-thruster',
  antimatterReactor: 'gi:lightning-frequency',
  chronoLab: 'gi:hourglass',
  plasmaForge: 'gi:flame-tunnel',
  megaStructureFactory: 'gi:castle',
  voidCrystallizer: 'gi:implosion',
  quantumResonanceLab: 'gi:atom',
  arcologyBuilder: 'gi:city',
  habitatModuleFactory: 'gi:home',
  luxuryGoodsFactory: 'gi:diamond',
  tradeHub: 'gi:handshake',
  teleporterGate: 'gi:teleport',

  // Tier 4 Endgame Buildings
  dysonCollector: 'gi:solar-system',
  quantumTeleporter: 'gi:teleport',
  dimensionalGateway: 'gi:portal',
  timeDistorter: 'gi:hourglass',
  galacticForge: 'gi:galaxy',

  // Tier 5 Transcendent
  omniscienceArray: 'gi:brain',
  worldEngine: 'gi:earth',
  planetaryShield: 'gi:shield',
  starReactor: 'gi:star',
  voidEngine: 'gi:hole',
  quantumExchange: 'gi:chart',
  megaCorpHQ: 'gi:bank',
  dimensionalNexus: 'gi:portal',
  galacticArmada: 'gi:spaceship',

  // Power Plants
  coalGenerator: 'gi:factory',
  solarFarm: 'gi:solar-power',
  windTurbine: 'gi:wind-turbine',
  nuclearReactor: 'gi:nuclear',
  antimatterPowerPlant: 'gi:lightning-frequency',
};

// --- Transport Icons ---
export const TRANSPORT_ICON_MAP: Record<string, string> = {
  conveyorBelt: 'gi:tread',
  pipe: 'gi:pipes',
  truck: 'gi:cargo-ship',
  cargoTrain: 'gi:steam-locomotive',
  drone: 'gi:ufo',
  cargoShip: 'gi:cargo-ship',
};

// --- Worker Icons ---
export const WORKER_ICON_MAP: Record<string, string> = {
  engineer: 'gi:overhead',
  mechanic: 'gi:wrench',
  transportManager: 'gi:railway',
  aiSupervisor: 'gi:robot-golem',
};

// --- Research Icons ---
export const RESEARCH_ICON_MAP: Record<string, string> = {
  // Automation
  basicAutomation: 'gi:gear-hammer',
  advancedAutomation: 'gi:mechanical-arm',
  basicMachining: 'gi:gear-hammer',

  // Logistics
  logistics1: 'gi:truck',
  advancedLogistics: 'gi:steam-locomotive',

  // Energy
  energyEfficiency: 'gi:lightning-storm',
  nuclearPower: 'gi:nuclear',
  fusionEnergy: 'gi:reactor',

  // Electronics & AI
  electronics: 'gi:circuitry',
  energyStorage: 'gi:battery-75',
  artificialIntelligence: 'gi:brain',

  // Robotics
  mechanicalEngineering: 'gi:wrench',
  roboticsTech: 'gi:robot-grab',
  advancedMetallurgy: 'gi:metal-bar',

  // T2 Bonus Researches
  advancedDrilling: 'gi:mining',
  efficientSmelting: 'gi:furnace',
  advancedElectronics: 'gi:processor',
  powerOptimization: 'gi:lightning-frequency',
  cargoDrones: 'gi:ufo',

  // Quantum
  quantumPhysics: 'gi:atom',
  nanotechnology: 'gi:nano-bot',

  // Market & Bonuses
  marketAnalysis: 'gi:profit',
  workerTraining: 'gi:overhead',
  storageExpansion: 'gi:warehouse',

  // T3 Bonus Researches
  aiOptimization: 'gi:brain',
  advancedRobotics: 'gi:robot-golem',
  quantumComputing: 'gi:cpu',
  metabolicEngineering: 'gi:dna1',
  megaStorage: 'gi:warehouse',

  // Tier 4 Research
  singularityTheory: 'gi:vortex',
  antimatterPhysics: 'gi:lightning-frequency',
  warpTechnology: 'gi:rocket-thruster',
  plasmaDynamics: 'gi:flame-tunnel',
  chronoEngineering: 'gi:hourglass',
  voidCrystallography: 'gi:implosion',
  megaConstruction: 'gi:castle',
  dimensionalPhysics: 'gi:portal',
  galacticManufacturing: 'gi:galaxy',
};

// --- Mega Project Icons ---
export const MEGA_PROJECT_ICON_MAP: Record<string, string> = {
  spaceElevator: 'gi:rocket-thruster',
  dysonSphere: 'gi:solar-system',
  quantumInternet: 'gi:spider-web',
  fusionCity: 'gi:bank',
  terraformingEngine: 'gi:crystal-growth',
  galacticTradeHub: 'gi:shop',
  deepCoreExtractor: 'gi:mining',
  neuralCommandCenter: 'gi:brain',
  nanoAssemblyMatrix: 'gi:nano-bot',
};

// --- Weather Icons ---
export const WEATHER_ICON_MAP: Record<string, string> = {
  clear: 'gi:sun',
  sunny: 'gi:sun',
  rainy: 'gi:heavy-rain',
  stormy: 'gi:lightning-storm',
  foggy: 'gi:fog',
  snowy: 'gi:snowflake-2',
};

// --- UI Icons ---
// General-purpose icons used throughout the game UI
export const UI_ICON_MAP: Record<string, string> = {
  // Core resources
  money: 'gi:money-stack',
  researchPoints: 'gi:magnifying-glass',
  corporationPoints: 'gi:briefcase',

  // Actions
  build: 'gi:hammer-drop',
  sell: 'gi:sell-card',
  buy: 'gi:buy-card',
  upgrade: 'mdi:arrow-up',
  demolish: 'gi:demolish',
  repair: 'gi:wrench',
  produce: 'gi:factory',

  // Status
  power: 'gi:lightning-frequency',
  production: 'gi:factory',
  efficiency: 'gi:profit',
  speed: 'gi:fast-arrow',
  maintenance: 'gi:wrench',

  // Categories
  extractor: 'gi:mining',
  factory: 'gi:factory',
  powerPlant: 'gi:nuclear',
  transport: 'gi:cargo-crane',
  research: 'gi:magnifying-glass',
  worker: 'gi:overhead',
  market: 'gi:trade',
  contract: 'mdi:clipboard-text-outline',
  quest: 'gi:scroll-unfurled',
  megaProject: 'gi:castle',
  event: 'gi:lightning-storm',
  prestige: 'gi:crown',
  automation: 'gi:robot-grab',

  // Tier icons
  tier0: 'gi:mining',
  tier1: 'gi:wrench',
  tier2: 'gi:big-gear',
  tier3: 'gi:brain',
  tier4: 'gi:galaxy',

  // Navigation
  home: 'gi:house',
  settings: 'gi:gear-hammer',
  help: 'gi:help',
  info: 'gi:info',
  close: 'gi:cross-mark',
  back: 'mdi:arrow-left',
  forward: 'mdi:arrow-right',
  menu: 'gi:hamburger-menu',

  // Game UI
  pause: 'gi:pause-button',
  play: 'gi:play-button',
  fastForward: 'gi:fast-forward-button',
  save: 'gi:save',
  load: 'gi:cloud-upload',
  reset: 'gi:spinning-wheel',

  // Rank icons
  apprentice: 'gi:overhead',
  foreman: 'gi:heavy-helm',
  manager: 'gi:tie',
  director: 'gi:medal',
  vp: 'gi:trophy',
  ceo: 'gi:crown',
  tycoon: 'gi:diamond-ring',
  magnate: 'gi:star-formation',
  legend: 'gi:lightning-frequency',
  cosmic: 'gi:crystal-growth',
  emperor: 'gi:imperial-crown',
  dominion: 'gi:galaxy',

  // Event icons
  oilCrisis: 'gi:oil-rig',
  energyShortage: 'gi:lightning-storm',
  aiRevolution: 'gi:brain',
  economicBoom: 'gi:profit',
  naturalDisaster: 'gi:tornado',
  techBreakthrough: 'gi:erlenmeyer',
  tradeWar: 'gi:sword-clash',
  greenInitiative: 'gi:sprout',
  spaceRace: 'gi:rocket-thruster',
  marketCrash: 'gi:falling',

  // Automation unlock icons
  autoRouting: 'gi:tread',
  autoBalancing: 'gi:scales',
  selfRepair: 'gi:wrench',
  autoTrading: 'gi:profit',
  autoExpansion: 'gi:castle',
  smartStorage: 'gi:warehouse',
  aiOptimization: 'gi:brain',

  // Seasonal event icons
  doubleProduction: 'gi:flame-tunnel',
  researchBoom: 'gi:chemical-drop',
  marketSurge: 'gi:profit',
  powerBoost: 'gi:lightning-frequency',

  // Daily reward
  dailyReward: 'gi:present',
  streak: 'gi:flame',

  // Quest type icons
  tutorial: 'gi:book-cover',
  challenge: 'gi:trophy',
  milestone: 'gi:finish-line',
  daily: 'gi:calendar',
  earn: 'gi:money-stack',
  military: 'gi:ak47',
  delivery: 'gi:cargo-ship',
  supply: 'gi:cargo-crane',
  construction: 'gi:castle',

  // Prestige
  prestigeReset: 'gi:spinning-sword',
  productionMultiplier: 'gi:factory',
  powerMultiplier: 'gi:lightning-frequency',
  gameSpeed: 'gi:fast-arrow',
  marketMultiplier: 'gi:profit',
  storageMultiplier: 'gi:cardboard-box',
  researchMultiplier: 'gi:magnifying-glass',
  offlineMultiplier: 'gi:moon',
  unlockMegaFactory: 'gi:castle',

  // Misc
  package: 'gi:cardboard-box',
  link: 'mdi:link-variant',
  clock: 'gi:clockwork',
  star: 'gi:sparkles',
  diamond: 'gi:diamond-hard',
  flame: 'gi:flame',
  scroll: 'gi:scroll-unfurled',
  trophy: 'gi:trophy',
  crown: 'gi:crown',
  globe: 'gi:planet-core',
  laptop: 'gi:laptop',
  tv: 'gi:tv',
  dollar: 'gi:money-stack',
  dollarBill: 'gi:cash',
};
