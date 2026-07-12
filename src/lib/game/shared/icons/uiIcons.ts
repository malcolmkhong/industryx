// ============================================
// FACTORY DOMINION: UI / TRANSPORT / WORKER ICON MAPS
// Split from mappings.ts (static icon IDs only).
// ============================================

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

export const TRANSPORT_ICON_MAP: Record<string, string> = {
  conveyorBelt: 'game-icons:tread',
  pipe: 'game-icons:pipes',
  truck: 'game-icons:cargo-ship',
  cargoTrain: 'game-icons:steam-locomotive',
  drone: 'game-icons:ufo',
  cargoShip: 'game-icons:cargo-ship',
};

export const WORKER_ICON_MAP: Record<string, string> = {
  engineer: 'game-icons:overhead',
  mechanic: 'game-icons:wrench',
  transportManager: 'game-icons:railway',
  aiSupervisor: 'game-icons:robot-golem',
};

