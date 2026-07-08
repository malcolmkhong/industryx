// ============================================
// IndustryaX: UI Catalog
// Static, hand-curated UI metadata for game entities.
// No game-logic (Master) fields — only presentation data
// (name, description, icon, category, tier, color).
//
// Why static:
//   Per Phase 5 (data.ts → Supabase refactor), game logic lives
//   server-side in Supabase. UI presentation strings are stable
//   display content that does NOT need to vary per-build, so we
//   ship a static hand-written catalog to the client. This:
//     1. Removes data.ts (8533 lines) from the client bundle.
//     2. Keeps UI text/icons fast (no async fetch needed for labels).
//     3. Aligns with the architecture principle: client renders UI,
//        server is authoritative for game state.
//
// Source of truth for Master Data (cost, production, power, etc.):
//   Supabase `game_config_*` tables → /api/game/definitions
//   → configCache (live bindings) → game logic only.
//
// If you need to update a UI string/icon, edit the literal below.
// If you need to add a new entity, add it here AND add the Master
// fields to the corresponding Supabase table via migration.
// ============================================

import type {
  BuildingType,
  ResourceType,
  TransportType,
  WeatherDefinition,
  WeatherType,
} from './types';

// ─── Resources (PURE UI — name/icon/tier/color) ─────────────────────────

export const RESOURCE_META: Record<
  ResourceType,
  { name: string; icon: string; tier: number; color: string }
> = {
  iron: {
    "name": "Iron Ore",
    "icon": "game-icons:mine-wagon",
    "tier": 0,
    "color": "#a0a0a0",
  },
  copper: {
    "name": "Copper Ore",
    "icon": "game-icons:ore",
    "tier": 0,
    "color": "#b87333",
  },
  coal: {
    "name": "Coal",
    "icon": "game-icons:coal-wagon",
    "tier": 0,
    "color": "#333333",
  },
  oil: {
    "name": "Crude Oil",
    "icon": "game-icons:oil-rig",
    "tier": 0,
    "color": "#1a1a2e",
  },
  sand: {
    "name": "Sand",
    "icon": "game-icons:desert",
    "tier": 0,
    "color": "#c2b280",
  },
  lithium: {
    "name": "Lithium",
    "icon": "game-icons:crystal-cluster",
    "tier": 0,
    "color": "#7b68ee",
  },
  water: {
    "name": "Water",
    "icon": "game-icons:water-drop",
    "tier": 0,
    "color": "#4488ff",
  },
  rareEarth: {
    "name": "Rare Earth",
    "icon": "game-icons:sparkles",
    "tier": 0,
    "color": "#9932cc",
  },
  clay: {
    "name": "Clay",
    "icon": "game-icons:brick-pile",
    "tier": 0,
    "color": "#c2855a",
  },
  limestone: {
    "name": "Limestone",
    "icon": "game-icons:stone-pile",
    "tier": 0,
    "color": "#d4c5a9",
  },
  gravel: {
    "name": "Gravel",
    "icon": "game-icons:stone-block",
    "tier": 0,
    "color": "#8b8b8b",
  },
  bauxite: {
    "name": "Bauxite",
    "icon": "game-icons:peaks",
    "tier": 0,
    "color": "#cd853f",
  },
  wolframite: {
    "name": "Wolframite",
    "icon": "game-icons:dark-squad",
    "tier": 0,
    "color": "#4a4a4a",
  },
  silver: {
    "name": "Silver",
    "icon": "game-icons:metal-disc",
    "tier": 0,
    "color": "#c0c0c0",
  },
  gold: {
    "name": "Gold",
    "icon": "game-icons:gold-bar",
    "tier": 0,
    "color": "#ffd700",
  },
  ironPlate: {
    "name": "Iron Plate",
    "icon": "game-icons:metal-plate",
    "tier": 1,
    "color": "#c0c0c0",
  },
  copperWire: {
    "name": "Copper Wire",
    "icon": "game-icons:electric",
    "tier": 1,
    "color": "#daa520",
  },
  plastic: {
    "name": "Plastic",
    "icon": "game-icons:plastic-duck",
    "tier": 1,
    "color": "#ff6b6b",
  },
  glass: {
    "name": "Glass",
    "icon": "game-icons:glass-celebration",
    "tier": 1,
    "color": "#87ceeb",
  },
  carbon: {
    "name": "Carbon Fiber",
    "icon": "game-icons:coal-pile",
    "tier": 1,
    "color": "#2d2d2d",
  },
  bricks: {
    "name": "Bricks",
    "icon": "game-icons:brick-wall",
    "tier": 1,
    "color": "#b5533a",
  },
  concrete: {
    "name": "Concrete",
    "icon": "game-icons:concrete-bag",
    "tier": 1,
    "color": "#95a5a6",
  },
  fertilizer: {
    "name": "Fertilizer",
    "icon": "game-icons:fertilizer-bag",
    "tier": 1,
    "color": "#7cb342",
  },
  steel: {
    "name": "Steel",
    "icon": "game-icons:steel-claws",
    "tier": 1,
    "color": "#708090",
  },
  fossilFuel: {
    "name": "Fossil Fuel",
    "icon": "game-icons:fuel-tank",
    "tier": 1,
    "color": "#3e2723",
  },
  circuit: {
    "name": "Circuit Board",
    "icon": "game-icons:circuitry",
    "tier": 2,
    "color": "#00cc66",
  },
  engine: {
    "name": "Engine",
    "icon": "game-icons:gear-stick",
    "tier": 2,
    "color": "#ff8c00",
  },
  battery: {
    "name": "Battery",
    "icon": "game-icons:battery-75",
    "tier": 2,
    "color": "#32cd32",
  },
  gear: {
    "name": "Gear",
    "icon": "game-icons:big-gear",
    "tier": 2,
    "color": "#808080",
  },
  silicon: {
    "name": "Silicon",
    "icon": "game-icons:processor",
    "tier": 2,
    "color": "#8db4e2",
  },
  aluminium: {
    "name": "Aluminium",
    "icon": "game-icons:metal-disc",
    "tier": 2,
    "color": "#c0c0c0",
  },
  insecticide: {
    "name": "Insecticide",
    "icon": "game-icons:poison",
    "tier": 2,
    "color": "#76ff03",
  },
  copperIngot: {
    "name": "Copper Ingot",
    "icon": "game-icons:gold-bar",
    "tier": 2,
    "color": "#e67e22",
  },
  titanium: {
    "name": "Titanium",
    "icon": "game-icons:shield-impact",
    "tier": 2,
    "color": "#778899",
  },
  coolant: {
    "name": "Coolant",
    "icon": "game-icons:snowflake-2",
    "tier": 2,
    "color": "#00bfff",
  },
  fiberOptics: {
    "name": "Fiber Optics",
    "icon": "game-icons:laser-burst",
    "tier": 2,
    "color": "#f0e68c",
  },
  solarCell: {
    "name": "Solar Cell",
    "icon": "game-icons:solar-power",
    "tier": 2,
    "color": "#ffd700",
  },
  powerCell: {
    "name": "Power Cell",
    "icon": "game-icons:battery-100",
    "tier": 2,
    "color": "#00e676",
  },
  reinforcedConcrete: {
    "name": "Reinforced Concrete",
    "icon": "game-icons:concrete-bag",
    "tier": 2,
    "color": "#78909c",
  },
  refinedSilver: {
    "name": "Refined Silver",
    "icon": "game-icons:metal-disc",
    "tier": 2,
    "color": "#e0e0e0",
  },
  refinedGold: {
    "name": "Refined Gold",
    "icon": "game-icons:gold-bar",
    "tier": 2,
    "color": "#ffb300",
  },
  aiChip: {
    "name": "AI Chip",
    "icon": "game-icons:brain",
    "tier": 3,
    "color": "#00ffff",
  },
  robotics: {
    "name": "Robotics",
    "icon": "game-icons:robot-grab",
    "tier": 3,
    "color": "#ff69b4",
  },
  quantumPart: {
    "name": "Quantum Part",
    "icon": "game-icons:atom",
    "tier": 3,
    "color": "#9400d3",
  },
  advancedAlloy: {
    "name": "Adv. Alloy",
    "icon": "game-icons:metal-bar",
    "tier": 3,
    "color": "#4169e1",
  },
  nanoMaterial: {
    "name": "Nano Material",
    "icon": "game-icons:nano-bot",
    "tier": 3,
    "color": "#ff1493",
  },
  electronics: {
    "name": "Electronics",
    "icon": "game-icons:smartphone",
    "tier": 3,
    "color": "#00cc66",
  },
  medicalTech: {
    "name": "Medical Tech",
    "icon": "game-icons:hospital-cross",
    "tier": 3,
    "color": "#ff6b6b",
  },
  jewellery: {
    "name": "Jewellery",
    "icon": "game-icons:diamond-ring",
    "tier": 3,
    "color": "#e91e63",
  },
  tungsten: {
    "name": "Tungsten",
    "icon": "game-icons:iron-cross",
    "tier": 3,
    "color": "#5c5c5c",
  },
  weapons: {
    "name": "Weapons",
    "icon": "game-icons:ak47",
    "tier": 3,
    "color": "#b71c1c",
  },
  scanDrone: {
    "name": "Scan Drone",
    "icon": "game-icons:space-shuttle",
    "tier": 3,
    "color": "#00e5ff",
  },
  artifactDetector: {
    "name": "Artifact Detector",
    "icon": "game-icons:satellite",
    "tier": 3,
    "color": "#ff6f00",
  },
  neuralNetwork: {
    "name": "Neural Network",
    "icon": "game-icons:thought-bubble",
    "tier": 3,
    "color": "#ff6347",
  },
  carbonComposite: {
    "name": "Carbon Composite",
    "icon": "game-icons:rope-coil",
    "tier": 3,
    "color": "#37474f",
  },
  structuralFrame: {
    "name": "Structural Frame",
    "icon": "game-icons:steel-claws",
    "tier": 3,
    "color": "#546e7a",
  },
  fusionCell: {
    "name": "Fusion Cell",
    "icon": "game-icons:nuclear-bomb",
    "tier": 3,
    "color": "#ffab00",
  },
  solarPanel: {
    "name": "Solar Panel",
    "icon": "game-icons:solar-power",
    "tier": 3,
    "color": "#ffc107",
  },
  creditChip: {
    "name": "Credit Chip",
    "icon": "game-icons:id-card",
    "tier": 3,
    "color": "#26a69a",
  },
  singularityCore: {
    "name": "Singularity Core",
    "icon": "game-icons:vortex",
    "tier": 4,
    "color": "#00ffcc",
  },
  darkMatterCell: {
    "name": "Dark Matter Cell",
    "icon": "game-icons:hole",
    "tier": 4,
    "color": "#1a0033",
  },
  warpDrive: {
    "name": "Warp Drive",
    "icon": "game-icons:rocket-thruster",
    "tier": 4,
    "color": "#ff4500",
  },
  antimatter: {
    "name": "Antimatter",
    "icon": "game-icons:lightning-frequency",
    "tier": 4,
    "color": "#ff00ff",
  },
  chronoPart: {
    "name": "Chrono Part",
    "icon": "game-icons:hourglass",
    "tier": 4,
    "color": "#ffd700",
  },
  plasmaCore: {
    "name": "Plasma Core",
    "icon": "game-icons:flame-tunnel",
    "tier": 4,
    "color": "#ff6600",
  },
  megaStructure: {
    "name": "Mega Structure",
    "icon": "game-icons:castle",
    "tier": 4,
    "color": "#4169e1",
  },
  voidCrystal: {
    "name": "Void Crystal",
    "icon": "game-icons:implosion",
    "tier": 4,
    "color": "#9400d3",
  },
  arcologyModule: {
    "name": "Arcology Module",
    "icon": "game-icons:modern-city",
    "tier": 4,
    "color": "#4fc3f7",
  },
  habitatModule: {
    "name": "Habitat Module",
    "icon": "game-icons:house",
    "tier": 4,
    "color": "#81c784",
  },
  stellarEnergy: {
    "name": "Stellar Energy",
    "icon": "game-icons:star-formation",
    "tier": 4,
    "color": "#fff176",
  },
  luxuryGoods: {
    "name": "Luxury Goods",
    "icon": "game-icons:crown",
    "tier": 4,
    "color": "#f48fb1",
  },
  tradeContract: {
    "name": "Trade Contract",
    "icon": "game-icons:scroll-unfurled",
    "tier": 4,
    "color": "#a5d6a7",
  },
  teleporterNode: {
    "name": "Teleporter Node",
    "icon": "game-icons:teleport",
    "tier": 4,
    "color": "#b39ddb",
  },
  researchMatrix: {
    "name": "Research Matrix",
    "icon": "game-icons:circuitry",
    "tier": 5,
    "color": "#00e5ff",
  },
  worldCore: {
    "name": "World Core",
    "icon": "game-icons:planet-core",
    "tier": 5,
    "color": "#ff6e40",
  },
  shieldMatrix: {
    "name": "Shield Matrix",
    "icon": "game-icons:round-shield",
    "tier": 5,
    "color": "#69f0ae",
  },
  stellarForge: {
    "name": "Stellar Forge",
    "icon": "game-icons:anvil-impact",
    "tier": 5,
    "color": "#ffd740",
  },
  voidEnergy: {
    "name": "Void Energy",
    "icon": "game-icons:hole",
    "tier": 5,
    "color": "#7c4dff",
  },
  marketDominance: {
    "name": "Market Dominance",
    "icon": "game-icons:crown",
    "tier": 5,
    "color": "#ff5252",
  },
  corpCapital: {
    "name": "Corp Capital",
    "icon": "game-icons:bank",
    "tier": 5,
    "color": "#448aff",
  },
  dimensionalGate: {
    "name": "Dimensional Gate",
    "icon": "game-icons:gate",
    "tier": 5,
    "color": "#e040fb",
  },
  armadaFleet: {
    "name": "Armada Fleet",
    "icon": "game-icons:spaceship",
    "tier": 5,
    "color": "#ff6d00",
  }
} as Record<ResourceType, { name: string; icon: string; tier: number; color: string }>;

// ─── Buildings (UI subset) ──────────────────────────────────────────────

export type BuildingUIMeta = {
  type: BuildingType;
  name: string;
  description: string;
  category: 'extractor' | 'factory' | 'power' | 'storage';
  tier: number;
  icon: string;
};

export const BUILDING_UI: Record<string, BuildingUIMeta> = {
  ironMine: {
    "type": "ironMine",
    "name": "Iron Mine",
    "description": "Extracts iron ore from mineral deposits",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:mine-wagon",
  },
  oilPump: {
    "type": "oilPump",
    "name": "Oil Pump",
    "description": "Pumps crude oil from underground reserves",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:oil-rig",
  },
  waterExtractor: {
    "type": "waterExtractor",
    "name": "Water Extractor",
    "description": "Extracts and purifies water from the environment",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:water-recycling",
  },
  sandMine: {
    "type": "sandMine",
    "name": "Sand Mine",
    "description": "Extracts sand for glass and silicon production",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:desert",
  },
  clayPit: {
    "type": "clayPit",
    "name": "Clay Pit",
    "description": "Extracts clay for brick and concrete production",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:clay-brick",
  },
  limestoneQuarry: {
    "type": "limestoneQuarry",
    "name": "Limestone Quarry",
    "description": "Quarries limestone for construction and chemistry",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:stone-bridge",
  },
  gravelPit: {
    "type": "gravelPit",
    "name": "Gravel Pit",
    "description": "Extracts gravel for concrete production",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:stone-crafting",
  },
  bauxiteMine: {
    "type": "bauxiteMine",
    "name": "Bauxite Mine",
    "description": "Mines bauxite ore for aluminium production",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:mining-helmet",
  },
  wolframiteMine: {
    "type": "wolframiteMine",
    "name": "Wolframite Mine",
    "description": "Mines wolframite for tungsten extraction",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:obelisk",
  },
  rareEarthExtractor: {
    "type": "rareEarthExtractor",
    "name": "Rare Earth Extractor",
    "description": "Specialized extraction facility that processes mineral deposits for rare earth elements",
    "category": "extractor",
    "tier": 1,
    "icon": "game-icons:crystal-shine",
  },
  copperMine: {
    "type": "copperMine",
    "name": "Copper Mine",
    "description": "Extracts copper ore from mineral veins",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:ore",
  },
  coalMine: {
    "type": "coalMine",
    "name": "Coal Mine",
    "description": "Mines coal from underground seams for fuel and carbon processing",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:coal-wagon",
  },
  lithiumMine: {
    "type": "lithiumMine",
    "name": "Lithium Mine",
    "description": "Mines lithium deposits for battery and advanced tech production",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:crystal-cluster",
  },
  silverMine: {
    "type": "silverMine",
    "name": "Silver Mine",
    "description": "Extracts silver ore from mineral veins",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:shield-impact",
  },
  goldMine: {
    "type": "goldMine",
    "name": "Gold Mine",
    "description": "Mines gold deposits for luxury and economic production",
    "category": "extractor",
    "tier": 0,
    "icon": "game-icons:gold-bar",
  },
  smelter: {
    "type": "smelter",
    "name": "Smelter",
    "description": "Smelts iron ore into iron plates for manufacturing",
    "category": "factory",
    "tier": 1,
    "icon": "game-icons:furnace",
  },
  wireMill: {
    "type": "wireMill",
    "name": "Wire Mill",
    "description": "Draws copper ore into fine copper wire",
    "category": "factory",
    "tier": 1,
    "icon": "game-icons:wire-coil",
  },
  chemicalPlant: {
    "type": "chemicalPlant",
    "name": "Chemical Plant",
    "description": "Processes oil into plastic and coal into carbon fiber",
    "category": "factory",
    "tier": 1,
    "icon": "game-icons:chemical-drop",
  },
  glassFurnace: {
    "type": "glassFurnace",
    "name": "Glass Furnace",
    "description": "Melts sand into glass panes",
    "category": "factory",
    "tier": 1,
    "icon": "game-icons:glass-celebration",
  },
  steelForge: {
    "type": "steelForge",
    "name": "Steel Forge",
    "description": "Forges iron and coal into strong steel alloys",
    "category": "factory",
    "tier": 1,
    "icon": "game-icons:anvil-impact",
  },
  carbonProcessor: {
    "type": "carbonProcessor",
    "name": "Carbon Processor",
    "description": "Processes coal into high-grade carbon fiber for advanced manufacturing",
    "category": "factory",
    "tier": 1,
    "icon": "game-icons:coal-pile",
  },
  brickFactory: {
    "type": "brickFactory",
    "name": "Brick Factory",
    "description": "Bakes clay into sturdy bricks",
    "category": "factory",
    "tier": 1,
    "icon": "game-icons:brick-wall",
  },
  concreteFactory: {
    "type": "concreteFactory",
    "name": "Concrete Factory",
    "description": "Mixes gravel and limestone into concrete",
    "category": "factory",
    "tier": 1,
    "icon": "game-icons:concrete-bag",
  },
  fertilizerFactory: {
    "type": "fertilizerFactory",
    "name": "Fertilizer Factory",
    "description": "Produces fertilizer from limestone",
    "category": "factory",
    "tier": 1,
    "icon": "game-icons:seedling",
  },
  oilRefinery: {
    "type": "oilRefinery",
    "name": "Oil Refinery",
    "description": "Refines crude oil into fossil fuel",
    "category": "factory",
    "tier": 1,
    "icon": "game-icons:refinery",
  },
  gearFactory: {
    "type": "gearFactory",
    "name": "Gear Factory",
    "description": "Manufactures precision gears from iron plates",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:big-gear",
  },
  circuitFactory: {
    "type": "circuitFactory",
    "name": "Circuit Factory",
    "description": "Assembles circuit boards from copper wire and plastic",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:circuitry",
  },
  engineFactory: {
    "type": "engineFactory",
    "name": "Engine Factory",
    "description": "Builds powerful engines from gears and steel",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:gear-stick",
  },
  batteryFactory: {
    "type": "batteryFactory",
    "name": "Battery Factory",
    "description": "Produces batteries from lithium and carbon fiber",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:battery-75",
  },
  siliconRefinery: {
    "type": "siliconRefinery",
    "name": "Silicon Refinery",
    "description": "Refines quartz sand and clay into silicon wafers",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:processor",
  },
  aluminiumFactory: {
    "type": "aluminiumFactory",
    "name": "Aluminium Factory",
    "description": "Smelts bauxite into lightweight aluminium",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:metal-disc",
  },
  insecticideFactory: {
    "type": "insecticideFactory",
    "name": "Insecticide Factory",
    "description": "Produces insecticides from copper and limestone",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:poison",
  },
  copperRefinery: {
    "type": "copperRefinery",
    "name": "Copper Refinery",
    "description": "Refines raw copper ore into pure copper ingots",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:metal-scales",
  },
  titaniumRefinery: {
    "type": "titaniumRefinery",
    "name": "Titanium Refinery",
    "description": "Processes rare earth elements to extract titanium compounds",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:shield-impact",
  },
  coolantPlant: {
    "type": "coolantPlant",
    "name": "Coolant Plant",
    "description": "Processes water and oil into industrial coolant",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:snowflake-2",
  },
  opticsLab: {
    "type": "opticsLab",
    "name": "Optics Lab",
    "description": "Manufactures fiber optics from glass and copper wire",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:laser-burst",
  },
  solarCellFactory: {
    "type": "solarCellFactory",
    "name": "Solar Cell Factory",
    "description": "Produces solar cells from glass and silicon",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:solar-power",
  },
  displayFactory: {
    "type": "displayFactory",
    "name": "Electro-Optics Plant",
    "description": "Manufactures fiber optics and circuit boards from glass, copper wire, and plastic — a versatile optoelectronics facility",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:tv",
  },
  hydrogenPlant: {
    "type": "hydrogenPlant",
    "name": "Hydrogen Fuel Plant",
    "description": "Extracts hydrogen from water through electrolysis to produce synthetic fossil fuel with coolant as byproduct",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:h2o",
  },
  reinforcedConcretePlant: {
    "type": "reinforcedConcretePlant",
    "name": "Reinforced Concrete Plant",
    "description": "Reinforces concrete with steel for mega construction",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:concrete-bag",
  },
  powerCellPlant: {
    "type": "powerCellPlant",
    "name": "Power Cell Plant",
    "description": "Manufactures power cells from batteries and fossil fuel — the backbone of the energy tier system",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:battery-100",
  },
  silverRefinery: {
    "type": "silverRefinery",
    "name": "Silver Refinery",
    "description": "Refines raw silver into high-purity refined silver for jewellery and electronics",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:shield-impact",
  },
  goldRefinery: {
    "type": "goldRefinery",
    "name": "Gold Refinery",
    "description": "Refines raw gold into pure refined gold for luxury production",
    "category": "factory",
    "tier": 2,
    "icon": "game-icons:gold-bar",
  },
  aiLab: {
    "type": "aiLab",
    "name": "AI Lab",
    "description": "Creates advanced AI chips from circuits and batteries",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:brain",
  },
  roboticsBay: {
    "type": "roboticsBay",
    "name": "Robotics Bay",
    "description": "Assembles robotic units from AI chips and engines",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:robot-grab",
  },
  quantumLab: {
    "type": "quantumLab",
    "name": "Quantum Lab",
    "description": "Produces quantum components using AI chips and rare earth",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:atom",
  },
  alloyForge: {
    "type": "alloyForge",
    "name": "Alloy Forge",
    "description": "Forges advanced alloys from steel and lithium",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:metal-bar",
  },
  nanoLab: {
    "type": "nanoLab",
    "name": "Nano Lab",
    "description": "Synthesizes nano materials from advanced alloys and quantum parts",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:nano-bot",
  },
  electronicsFactory: {
    "type": "electronicsFactory",
    "name": "Electronics Factory",
    "description": "Assembles advanced electronics from circuits, plastics, and silicon",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:smartphone",
  },
  medicalTechLab: {
    "type": "medicalTechLab",
    "name": "Medical Tech Lab",
    "description": "Produces medical technology from titanium, plastics, and electronics",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:hospital-cross",
  },
  jewelleryForge: {
    "type": "jewelleryForge",
    "name": "Jewellery Forge",
    "description": "Forges precious jewellery from refined gold, silver, and rare earth elements",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:diamond-ring",
  },
  tungstenSmelter: {
    "type": "tungstenSmelter",
    "name": "Tungsten Smelter",
    "description": "Smelts wolframite into tough tungsten with fossil fuel and limestone",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:iron-cross",
  },
  armsFactory: {
    "type": "armsFactory",
    "name": "Arms Factory",
    "description": "Manufactures weapons from steel, aluminium, and batteries",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:ak47",
  },
  droneShipyard: {
    "type": "droneShipyard",
    "name": "Drone Shipyard",
    "description": "Builds scan drones from electronics, titanium, and batteries",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:space-shuttle",
  },
  detectorFactory: {
    "type": "detectorFactory",
    "name": "Detector Factory",
    "description": "Builds artifact detectors from batteries, electronics, and tungsten",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:satellite",
  },
  neuralLab: {
    "type": "neuralLab",
    "name": "Neural Lab",
    "description": "Constructs neural networks from fiber optics and AI chips",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:thought-bubble",
  },
  quantumAssembler: {
    "type": "quantumAssembler",
    "name": "Quantum Assembler",
    "description": "Alternative quantum part producer — assembles quantum components from AI chips, rare earth, and fibre optics without requiring deep artifact detector chains",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:atom",
  },
  opticalComputingLab: {
    "type": "opticalComputingLab",
    "name": "Optical Computing Lab",
    "description": "Alternative AI Chip production using fiber optics and silicon — bypasses the copper bottleneck",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:laser-burst",
  },
  carbonCompositePlant: {
    "type": "carbonCompositePlant",
    "name": "Carbon Composite Plant",
    "description": "Combines carbon fiber with advanced alloys for ultra-strong composite materials",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:rope-coil",
  },
  structuralFrameFactory: {
    "type": "structuralFrameFactory",
    "name": "Structural Frame Factory",
    "description": "Assembles structural frames from steel and reinforced concrete for mega construction",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:bridge",
  },
  fusionReactor: {
    "type": "fusionReactor",
    "name": "Fusion Reactor",
    "description": "Generates fusion cells — an alternative high-tier energy source using lithium and power cells",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:nuclear-bomb",
  },
  solarPanelFactory: {
    "type": "solarPanelFactory",
    "name": "Solar Panel Factory",
    "description": "Assembles solar panels from solar cells, circuits, and aluminium — feeds the Dyson Collector",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:solar-power",
  },
  creditMint: {
    "type": "creditMint",
    "name": "Credit Mint",
    "description": "Mints credit chips from jewellery and advanced electronics — the foundation of the economy lane",
    "category": "factory",
    "tier": 3,
    "icon": "game-icons:credit-card",
  },
  singularityForge: {
    "type": "singularityForge",
    "name": "Singularity Forge",
    "description": "Forges singularity cores from quantum parts, nano materials, and AI chips",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:vortex",
  },
  darkMatterLab: {
    "type": "darkMatterLab",
    "name": "Dark Matter Lab",
    "description": "Synthesizes dark matter cells from nano materials and advanced alloys under extreme coolant conditions",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:hole",
  },
  warpDriveFactory: {
    "type": "warpDriveFactory",
    "name": "Warp Drive Factory",
    "description": "Constructs FTL warp drives from engines, robotics, and quantum parts",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:rocket-thruster",
  },
  antimatterReactor: {
    "type": "antimatterReactor",
    "name": "Antimatter Reactor",
    "description": "Produces antimatter fuel from advanced electronics, quantum components, and coolant under controlled conditions",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:lightning-frequency",
  },
  chronoLab: {
    "type": "chronoLab",
    "name": "Chrono Lab",
    "description": "Manufactures temporal components from singularity cores and neural networks",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:hourglass",
  },
  plasmaForge: {
    "type": "plasmaForge",
    "name": "Plasma Forge",
    "description": "Creates plasma cores from advanced alloys, fossil fuel, and coolant at extreme temperatures",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:flame-tunnel",
  },
  megaStructureFactory: {
    "type": "megaStructureFactory",
    "name": "Mega Structure Factory",
    "description": "Assembles massive construction modules from reinforced concrete, steel, advanced alloys, and robotics",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:castle",
  },
  voidCrystallizer: {
    "type": "voidCrystallizer",
    "name": "Void Crystallizer",
    "description": "Crystallizes void energy from rare earth, nano materials, and quantum parts",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:implosion",
  },
  quantumResonanceLab: {
    "type": "quantumResonanceLab",
    "name": "Quantum Resonance Lab",
    "description": "Alternative quantum part production using plasma energy — bypasses the artifact detector bottleneck",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:atom",
  },
  arcologyBuilder: {
    "type": "arcologyBuilder",
    "name": "Arcology Builder",
    "description": "Constructs arcology modules — self-contained mega-habitats for millions",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:modern-city",
  },
  habitatModuleFactory: {
    "type": "habitatModuleFactory",
    "name": "Habitat Module Factory",
    "description": "Manufactures habitat modules from carbon composites and advanced alloys for orbital construction",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:house",
  },
  luxuryGoodsFactory: {
    "type": "luxuryGoodsFactory",
    "name": "Luxury Goods Factory",
    "description": "Produces luxury goods from jewellery, carbon composites, and solar panels for the premium market",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:diamond-ring",
  },
  tradeHub: {
    "type": "tradeHub",
    "name": "Trade Hub",
    "description": "Processes credit chips, luxury goods, and fiber optics into trade contracts",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:hand",
  },
  teleporterGate: {
    "type": "teleporterGate",
    "name": "Teleporter Gate",
    "description": "Constructs teleporter nodes using quantum parts and fiber optics — enables instant resource transport",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:teleport",
  },
  dysonCollector: {
    "type": "dysonCollector",
    "name": "Dyson Collector",
    "description": "Harvests stellar energy using solar panels and structural frames — produces stellar energy",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:solar-system",
  },
  quantumTeleporter: {
    "type": "quantumTeleporter",
    "name": "Quantum Teleporter",
    "description": "Generates research points through quantum entanglement — requires continuous inputs",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:teleport",
  },
  dimensionalGateway: {
    "type": "dimensionalGateway",
    "name": "Dimensional Gateway",
    "description": "Opens portals to other dimensions using void crystals and dark matter — generates corporation points",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:portal",
  },
  timeDistorter: {
    "type": "timeDistorter",
    "name": "Time Distorter",
    "description": "Bends time using chrono parts and plasma — generates money and research points",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:hourglass",
  },
  galacticForge: {
    "type": "galacticForge",
    "name": "Galactic Forge",
    "description": "The ultimate factory — combines singularity, warp, and void technology for immense output",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:castle",
  },
  omniscienceArray: {
    "type": "omniscienceArray",
    "name": "Omniscience Array",
    "description": "The pinnacle of tech ascension — produces research matrices for total knowledge domination",
    "category": "factory",
    "tier": 5,
    "icon": "game-icons:brain",
  },
  worldEngine: {
    "type": "worldEngine",
    "name": "World Engine",
    "description": "Planetary-scale construction engine — builds world cores from arcology modules and stellar energy",
    "category": "factory",
    "tier": 5,
    "icon": "game-icons:planet-core",
  },
  planetaryShield: {
    "type": "planetaryShield",
    "name": "Planetary Shield",
    "description": "Constructs a shield matrix — the ultimate defense and production multiplier for your entire empire",
    "category": "factory",
    "tier": 5,
    "icon": "game-icons:shield-impact",
  },
  starReactor: {
    "type": "starReactor",
    "name": "Star Reactor",
    "description": "Harnesses antimatter and fusion to create stellar forges — the peak of energy mastery",
    "category": "factory",
    "tier": 5,
    "icon": "game-icons:star-formation",
  },
  voidEngine: {
    "type": "voidEngine",
    "name": "Void Engine",
    "description": "Generates void energy from dark matter and quantum parts — the ultimate power source that fuels all T5 systems",
    "category": "factory",
    "tier": 5,
    "icon": "game-icons:hole",
  },
  quantumExchange: {
    "type": "quantumExchange",
    "name": "Quantum Exchange",
    "description": "Quantum-powered trading platform — creates market dominance from trade contracts and singularity cores",
    "category": "factory",
    "tier": 5,
    "icon": "game-icons:chart",
  },
  megaCorpHQ: {
    "type": "megaCorpHQ",
    "name": "Mega Corp HQ",
    "description": "The ultimate corporate headquarters — generates massive wealth using world cores and stellar forges",
    "category": "factory",
    "tier": 5,
    "icon": "game-icons:bank",
  },
  dimensionalNexus: {
    "type": "dimensionalNexus",
    "name": "Dimensional Nexus",
    "description": "Opens dimensional gates using teleporter nodes and void energy — enables exploration of new realities",
    "category": "factory",
    "tier": 5,
    "icon": "game-icons:portal",
  },
  galacticArmada: {
    "type": "galacticArmada",
    "name": "Galactic Armada",
    "description": "Builds the ultimate fleet from warp drives, robotics, and stellar forges — dominates the galaxy",
    "category": "factory",
    "tier": 5,
    "icon": "game-icons:spaceship",
  },
  coalGenerator: {
    "type": "coalGenerator",
    "name": "Coal Generator",
    "description": "Burns coal to generate electricity. Reliable but dirty.",
    "category": "power",
    "tier": 0,
    "icon": "game-icons:refinery",
  },
  solarFarm: {
    "type": "solarFarm",
    "name": "Solar Farm",
    "description": "Clean energy from the sun. Low output but free fuel.",
    "category": "power",
    "tier": 0,
    "icon": "game-icons:solar-power",
  },
  windTurbine: {
    "type": "windTurbine",
    "name": "Wind Turbine",
    "description": "Harnesses wind power. Variable output.",
    "category": "power",
    "tier": 0,
    "icon": "game-icons:wind-turbine",
  },
  nuclearReactor: {
    "type": "nuclearReactor",
    "name": "Nuclear Reactor",
    "description": "Massive power output. Expensive to build.",
    "category": "power",
    "tier": 2,
    "icon": "game-icons:nuclear",
  },
  antimatterPowerPlant: {
    "type": "antimatterPowerPlant",
    "name": "Antimatter Power Plant",
    "description": "Generates enormous power from antimatter annihilation. The ultimate energy source.",
    "category": "power",
    "tier": 4,
    "icon": "game-icons:lightning-frequency",
  },
  // ─── Tier-4.5 endgame resource producers (Phase B of TIER5_WIRING_PLAN) ───
  arcologyModuleAssembler: {
    "type": "arcologyModuleAssembler",
    "name": "Arcology Module Assembler",
    "description": "Assembles advanced arcology modules from structural components",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:city",
  },
  stellarForgeModule: {
    "type": "stellarForgeModule",
    "name": "Stellar Forge Module",
    "description": "Forges stellar components from fusion energy and mega structures",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:star-swirl",
  },
  voidEnergyCollector: {
    "type": "voidEnergyCollector",
    "name": "Void Energy Collector",
    "description": "Harvests void energy from antimatter and quantum fluctuations",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:void",
  },
  tradeContractBroker: {
    "type": "tradeContractBroker",
    "name": "Trade Contract Broker",
    "description": "Brokerage that converts luxury goods into binding trade contracts",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:scroll-quill",
  },
  marketDominanceCenter: {
    "type": "marketDominanceCenter",
    "name": "Market Dominance Center",
    "description": "Establishes market dominance through credit chips and trade contracts",
    "category": "factory",
    "tier": 4,
    "icon": "game-icons:crown",
  },
} as Record<string, BuildingUIMeta>;

// ─── Transport ──────────────────────────────────────────────────────────

export type TransportUIMeta = {
  type: TransportType;
  name: string;
  description: string;
  icon: string;
};

export const TRANSPORT_UI: Record<string, TransportUIMeta> = {
  conveyorBelt: {
    "type": "conveyorBelt",
    "name": "Conveyor Belt",
    "description": "Basic automated belt system for moving materials",
    "icon": "game-icons:tread",
  },
  pipe: {
    "type": "pipe",
    "name": "Pipe",
    "description": "Transports liquids and gases between buildings",
    "icon": "game-icons:pipes",
  },
  truck: {
    "type": "truck",
    "name": "Truck",
    "description": "Motorized transport for medium loads",
    "icon": "game-icons:cargo-ship",
  },
  cargoTrain: {
    "type": "cargoTrain",
    "name": "Cargo Train",
    "description": "High-capacity rail transport system",
    "icon": "game-icons:steam-locomotive",
  },
  drone: {
    "type": "drone",
    "name": "Drone",
    "description": "Fast aerial transport for small loads",
    "icon": "game-icons:ufo",
  },
  cargoShip: {
    "type": "cargoShip",
    "name": "Cargo Ship",
    "description": "Massive maritime transport for bulk materials",
    "icon": "game-icons:cargo-ship",
  }
} as Record<string, TransportUIMeta>;

// ─── Workers ────────────────────────────────────────────────────────────

export type WorkerUIMeta = {
  type: string;
  name: string;
  description: string;
  icon: string;
};

export const WORKER_UI: Record<string, WorkerUIMeta> = {
  engineer: {
    "type": "engineer",
    "name": "Engineer",
    "description": "Boosts factory production speed and efficiency",
    "icon": "game-icons:overhead",
  },
  mechanic: {
    "type": "mechanic",
    "name": "Mechanic",
    "description": "Reduces maintenance costs and prevents breakdowns",
    "icon": "game-icons:wrench",
  },
  transportManager: {
    "type": "transportManager",
    "name": "Transport Manager",
    "description": "Optimizes transport routes and increases throughput",
    "icon": "game-icons:railway",
  },
  aiSupervisor: {
    "type": "aiSupervisor",
    "name": "AI Supervisor",
    "description": "Enhances automation systems and AI optimization",
    "icon": "game-icons:robot-golem",
  }
} as Record<string, WorkerUIMeta>;

// ─── Research ───────────────────────────────────────────────────────────

export type ResearchUIMeta = {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: number;
  icon: string;
};

export const RESEARCH_UI: ResearchUIMeta[] = [
  {
    "id": "basicAutomation",
    "name": "Basic Automation",
    "description": "+15% production speed for all extractors",
    "category": "automation",
    "tier": 1,
    "icon": "game-icons:gear-hammer",
  },
  {
    "id": "advancedAutomation",
    "name": "Advanced Automation",
    "description": "+25% production speed for all factories",
    "category": "automation",
    "tier": 2,
    "icon": "game-icons:mechanical-arm",
  },
  {
    "id": "basicMachining",
    "name": "Basic Machining",
    "description": "Unlocks Gear Factory",
    "category": "automation",
    "tier": 1,
    "icon": "game-icons:gear-hammer",
  },
  {
    "id": "sandExtraction",
    "name": "Sand Extraction",
    "description": "Unlocks Sand Mine — extract sand for glass and silicon production",
    "category": "automation",
    "tier": 1,
    "icon": "game-icons:desert",
  },
  {
    "id": "bauxiteExtraction",
    "name": "Bauxite Extraction",
    "description": "Unlocks Bauxite Mine — mine bauxite ore for aluminium production",
    "category": "automation",
    "tier": 1,
    "icon": "game-icons:mining-helmet",
  },
  {
    "id": "lithiumExtraction",
    "name": "Lithium Extraction",
    "description": "Unlocks Lithium Mine — mine lithium for battery and advanced tech",
    "category": "energy",
    "tier": 1,
    "icon": "game-icons:crystal-cluster",
  },
  {
    "id": "logistics1",
    "name": "Efficient Transport",
    "description": "+20% transport throughput for all lines",
    "category": "logistics",
    "tier": 1,
    "icon": "game-icons:truck",
  },
  {
    "id": "advancedLogistics",
    "name": "Advanced Logistics",
    "description": "+30% transport throughput, unlock Cargo Train",
    "category": "logistics",
    "tier": 2,
    "icon": "game-icons:steam-locomotive",
  },
  {
    "id": "energyEfficiency",
    "name": "Energy Efficiency",
    "description": "-15% power consumption for all buildings",
    "category": "energy",
    "tier": 1,
    "icon": "game-icons:lightning-storm",
  },
  {
    "id": "nuclearPower",
    "name": "Nuclear Power",
    "description": "Unlocks Nuclear Reactor",
    "category": "energy",
    "tier": 2,
    "icon": "game-icons:nuclear",
  },
  {
    "id": "fusionEnergy",
    "name": "Fusion Energy",
    "description": "Unlocks Fusion Reactor - limitless clean power",
    "category": "energy",
    "tier": 3,
    "icon": "game-icons:reactor",
  },
  {
    "id": "electronics",
    "name": "Electronics",
    "description": "Unlocks Circuit Factory",
    "category": "ai",
    "tier": 1,
    "icon": "game-icons:circuitry",
  },
  {
    "id": "energyStorage",
    "name": "Energy Storage",
    "description": "Unlocks Battery Factory",
    "category": "ai",
    "tier": 2,
    "icon": "game-icons:battery-75",
  },
  {
    "id": "artificialIntelligence",
    "name": "Artificial Intelligence",
    "description": "Unlocks AI Lab - the heart of advanced technology",
    "category": "ai",
    "tier": 2,
    "icon": "game-icons:brain",
  },
  {
    "id": "mechanicalEngineering",
    "name": "Mechanical Engineering",
    "description": "Unlocks Engine Factory",
    "category": "robotics",
    "tier": 1,
    "icon": "game-icons:wrench",
  },
  {
    "id": "roboticsTech",
    "name": "Robotics Technology",
    "description": "Unlocks Robotics Bay",
    "category": "robotics",
    "tier": 2,
    "icon": "game-icons:robot-grab",
  },
  {
    "id": "advancedMetallurgy",
    "name": "Advanced Metallurgy",
    "description": "Unlocks Alloy Forge",
    "category": "robotics",
    "tier": 2,
    "icon": "game-icons:metal-bar",
  },
  {
    "id": "advancedDrilling",
    "name": "Advanced Drilling",
    "description": "+20% extractor production speed",
    "category": "automation",
    "tier": 2,
    "icon": "game-icons:mining",
  },
  {
    "id": "efficientSmelting",
    "name": "Efficient Smelting",
    "description": "+15% T1 factory production speed",
    "category": "automation",
    "tier": 2,
    "icon": "game-icons:furnace",
  },
  {
    "id": "advancedElectronics",
    "name": "Advanced Electronics",
    "description": "+15% T2 factory production speed",
    "category": "ai",
    "tier": 2,
    "icon": "game-icons:processor",
  },
  {
    "id": "powerOptimization",
    "name": "Power Optimization",
    "description": "-10% power consumption for all factories",
    "category": "energy",
    "tier": 2,
    "icon": "game-icons:lightning-frequency",
  },
  {
    "id": "cargoDrones",
    "name": "Cargo Drones",
    "description": "+25% transport throughput, unlock Drone transport",
    "category": "logistics",
    "tier": 2,
    "icon": "game-icons:ufo",
  },
  {
    "id": "quantumPhysics",
    "name": "Quantum Physics",
    "description": "Unlocks Quantum Lab",
    "category": "quantum",
    "tier": 3,
    "icon": "game-icons:atom",
  },
  {
    "id": "nanotechnology",
    "name": "Nanotechnology",
    "description": "Unlocks Nano Lab - the ultimate production facility",
    "category": "quantum",
    "tier": 3,
    "icon": "game-icons:nano-bot",
  },
  {
    "id": "marketAnalysis",
    "name": "Market Analysis",
    "description": "+20% better sell prices on the market",
    "category": "automation",
    "tier": 1,
    "icon": "game-icons:profit",
  },
  {
    "id": "workerTraining",
    "name": "Worker Training",
    "description": "+25% worker efficiency across all workers",
    "category": "automation",
    "tier": 2,
    "icon": "game-icons:overhead",
  },
  {
    "id": "storageExpansion",
    "name": "Storage Expansion",
    "description": "+50% resource storage capacity",
    "category": "logistics",
    "tier": 2,
    "icon": "game-icons:warehouse",
  },
  {
    "id": "aiOptimization",
    "name": "AI Optimization",
    "description": "+20% AI Lab and Neural Lab speed",
    "category": "ai",
    "tier": 3,
    "icon": "game-icons:brain",
  },
  {
    "id": "advancedRobotics",
    "name": "Advanced Robotics",
    "description": "+25% Robotics Bay and Drone Shipyard speed",
    "category": "robotics",
    "tier": 3,
    "icon": "game-icons:robot-golem",
  },
  {
    "id": "quantumComputing",
    "name": "Quantum Computing",
    "description": "+30% Quantum Lab speed",
    "category": "quantum",
    "tier": 3,
    "icon": "game-icons:cpu",
  },
  {
    "id": "metabolicEngineering",
    "name": "Metabolic Engineering",
    "description": "+20% all T3 factory production speed",
    "category": "automation",
    "tier": 3,
    "icon": "game-icons:dna1",
  },
  {
    "id": "megaStorage",
    "name": "Mega Storage",
    "description": "+100% storage capacity",
    "category": "logistics",
    "tier": 3,
    "icon": "game-icons:warehouse",
  },
  {
    "id": "singularityTheory",
    "name": "Singularity Theory",
    "description": "Unlocks Singularity Forge — the first step beyond known physics",
    "category": "quantum",
    "tier": 4,
    "icon": "game-icons:vortex",
  },
  {
    "id": "antimatterPhysics",
    "name": "Antimatter Physics",
    "description": "Unlocks Antimatter Reactor and Antimatter Power Plant",
    "category": "energy",
    "tier": 4,
    "icon": "game-icons:lightning-frequency",
  },
  {
    "id": "warpTechnology",
    "name": "Warp Technology",
    "description": "Unlocks Warp Drive Factory — bend spacetime for FTL travel",
    "category": "robotics",
    "tier": 4,
    "icon": "game-icons:rocket-thruster",
  },
  {
    "id": "plasmaDynamics",
    "name": "Plasma Dynamics",
    "description": "Unlocks Plasma Forge — harness superheated plasma",
    "category": "energy",
    "tier": 4,
    "icon": "game-icons:flame-tunnel",
  },
  {
    "id": "chronoEngineering",
    "name": "Chrono Engineering",
    "description": "Unlocks Chrono Lab — manipulate the flow of time",
    "category": "quantum",
    "tier": 4,
    "icon": "game-icons:hourglass",
  },
  {
    "id": "voidCrystallography",
    "name": "Void Crystallography",
    "description": "Unlocks Void Crystallizer and Dark Matter Lab — study the void",
    "category": "quantum",
    "tier": 4,
    "icon": "game-icons:implosion",
  },
  {
    "id": "megaConstruction",
    "name": "Mega Construction",
    "description": "Unlocks Mega Structure Factory — build on an unprecedented scale",
    "category": "robotics",
    "tier": 4,
    "icon": "game-icons:castle",
  },
  {
    "id": "dimensionalPhysics",
    "name": "Dimensional Physics",
    "description": "Unlocks Dyson Collector, Quantum Teleporter, and Dimensional Gateway",
    "category": "quantum",
    "tier": 4,
    "icon": "game-icons:portal",
  },
  {
    "id": "galacticManufacturing",
    "name": "Galactic Manufacturing",
    "description": "Unlocks Time Distorter and Galactic Forge — the pinnacle of industrial civilization",
    "category": "quantum",
    "tier": 4,
    "icon": "game-icons:galaxy",
  }
];

// ─── Automation Unlocks ─────────────────────────────────────────────────

export type AutomationUIMeta = {
  type: string;
  name: string;
  description: string;
  icon: string;
};

export const AUTOMATION_UI: AutomationUIMeta[] = [
  {
    "type": "autoRouting",
    "name": "Auto-Routing",
    "description": "Automatically optimizes transport routes",
    "icon": "game-icons:tread",
  },
  {
    "type": "autoBalancing",
    "name": "Auto-Balancing",
    "description": "Balances production across factories",
    "icon": "game-icons:scales",
  },
  {
    "type": "selfRepair",
    "name": "Self-Repair Bots",
    "description": "Buildings automatically repair over time",
    "icon": "game-icons:wrench",
  },
  {
    "type": "autoTrading",
    "name": "Auto-Trading",
    "description": "AI trades resources on the market automatically",
    "icon": "game-icons:profit",
  },
  {
    "type": "autoExpansion",
    "name": "Auto-Expansion",
    "description": "AI suggests and builds new production lines",
    "icon": "game-icons:castle",
  },
  {
    "type": "smartStorage",
    "name": "Smart Storage",
    "description": "Automatically distributes resources to where they are needed",
    "icon": "game-icons:warehouse",
  },
  {
    "type": "aiOptimization",
    "name": "AI Optimization",
    "description": "Full AI control over factory optimization",
    "icon": "game-icons:brain",
  }
];

// ─── Prestige Bonuses ───────────────────────────────────────────────────

export type PrestigeUIMeta = {
  id: string;
  name: string;
  description: string;
};

export const PRESTIGE_UI: PrestigeUIMeta[] = [
  {
    "id": "prodBoost1",
    "name": "Production Boost I",
    "description": "+25% all production",
  },
  {
    "id": "powerBoost1",
    "name": "Power Boost I",
    "description": "+30% power generation",
  },
  {
    "id": "speedBoost1",
    "name": "Speed Boost I",
    "description": "+20% game speed",
  },
  {
    "id": "marketBoost1",
    "name": "Market Boost I",
    "description": "+25% sell prices",
  },
  {
    "id": "storageBoost1",
    "name": "Storage Boost I",
    "description": "+50% storage capacity",
  },
  {
    "id": "researchBoost1",
    "name": "Research Boost I",
    "description": "+30% research speed",
  },
  {
    "id": "prodBoost2",
    "name": "Production Boost II",
    "description": "+50% all production",
  },
  {
    "id": "powerBoost2",
    "name": "Power Boost II",
    "description": "+60% power generation",
  },
  {
    "id": "megaFactory",
    "name": "Mega Factory",
    "description": "Unlock Mega Factory buildings",
  },
  {
    "id": "offProdBoost",
    "name": "Offline Production",
    "description": "+100% offline production rate",
  },
  {
    "id": "prodBoost3",
    "name": "Production Boost III",
    "description": "+100% all production",
  },
  {
    "id": "powerBoost3",
    "name": "Power Boost III",
    "description": "+150% power generation",
  },
  {
    "id": "timeWarp",
    "name": "Time Warp",
    "description": "+50% game speed permanently",
  },
  {
    "id": "marketBoost2",
    "name": "Market Boost II",
    "description": "+50% sell prices",
  },
  {
    "id": "researchBoost2",
    "name": "Research Boost II",
    "description": "+60% research speed",
  }
];

// ─── Event Templates ────────────────────────────────────────────────────

export type EventUIMeta = {
  type: string;
  name: string;
  description: string;
  icon: string;
};

export const EVENT_UI: EventUIMeta[] = [
  {
    "type": "oilCrisis",
    "name": "Oil Crisis",
    "description": "Global oil supplies disrupted! Oil prices soar while production slows.",
    "icon": "game-icons:oil-rig",
  },
  {
    "type": "energyShortage",
    "name": "Energy Shortage",
    "description": "Power grid under strain! All buildings consume 30% more power.",
    "icon": "game-icons:lightning-storm",
  },
  {
    "type": "aiRevolution",
    "name": "AI Revolution",
    "description": "AI breakthrough! Research speed doubled, AI chip demand surges.",
    "icon": "game-icons:brain",
  },
  {
    "type": "economicBoom",
    "name": "Economic Boom",
    "description": "The economy is booming! All sell prices increased by 50%.",
    "icon": "game-icons:profit",
  },
  {
    "type": "naturalDisaster",
    "name": "Natural Disaster",
    "description": "Earthquake damages infrastructure! Production reduced 25%.",
    "icon": "game-icons:tornado",
  },
  {
    "type": "techBreakthrough",
    "name": "Tech Breakthrough",
    "description": "Scientific breakthrough! All research progresses 50% faster.",
    "icon": "game-icons:erlenmeyer",
  },
  {
    "type": "tradeWar",
    "name": "Trade War",
    "description": "International tensions rise! Rare earth prices double.",
    "icon": "game-icons:sword-clash",
  },
  {
    "type": "greenInitiative",
    "name": "Green Initiative",
    "description": "Environmental regulations boost clean energy production!",
    "icon": "game-icons:sprout",
  },
  {
    "type": "spaceRace",
    "name": "Space Race",
    "description": "Space program demands advanced materials! Quantum and nano prices skyrocket.",
    "icon": "game-icons:rocket-thruster",
  },
  {
    "type": "marketCrash",
    "name": "Market Crash",
    "description": "Financial crisis! All prices drop 40%.",
    "icon": "game-icons:falling",
  }
];

// ─── Rank Thresholds ────────────────────────────────────────────────────

export type RankUIMeta = {
  name: string;
  icon: string;
  color: string;
};

export const RANK_UI: RankUIMeta[] = [
  {
    "name": "Apprentice",
    "icon": "game-icons:overhead",
    "color": "#a0a0a0",
  },
  {
    "name": "Foreman",
    "icon": "game-icons:heavy-helm",
    "color": "#4ade80",
  },
  {
    "name": "Manager",
    "icon": "game-icons:tie",
    "color": "#22d3ee",
  },
  {
    "name": "Director",
    "icon": "game-icons:medal",
    "color": "#facc15",
  },
  {
    "name": "VP of Operations",
    "icon": "game-icons:trophy",
    "color": "#fb923c",
  },
  {
    "name": "CEO",
    "icon": "game-icons:crown",
    "color": "#f472b6",
  },
  {
    "name": "Tycoon",
    "icon": "game-icons:diamond-ring",
    "color": "#a78bfa",
  },
  {
    "name": "Magnate",
    "icon": "game-icons:star-formation",
    "color": "#fbbf24",
  },
  {
    "name": "Industrial Legend",
    "icon": "game-icons:lightning-frequency",
    "color": "#00fff2",
  },
  {
    "name": "Cosmic Industrialist",
    "icon": "game-icons:crystal-growth",
    "color": "#00ffcc",
  },
  {
    "name": "Galactic Emperor",
    "icon": "game-icons:imperial-crown",
    "color": "#ff4500",
  },
  {
    "name": "Universal Dominion",
    "icon": "game-icons:galaxy",
    "color": "#ff00ff",
  }
];

// ─── Production Chains ──────────────────────────────────────────────────

export type ProductionChainUIMeta = {
  name: string;
  color: string;
};

export const PRODUCTION_CHAIN_UI: ProductionChainUIMeta[] = [
  {
    "name": "Basic Iron",
    "color": "#a0a0a0",
  },
  {
    "name": "Steel Production",
    "color": "#708090",
  },
  {
    "name": "Brick Making",
    "color": "#b5533a",
  },
  {
    "name": "Concrete Production",
    "color": "#95a5a6",
  },
  {
    "name": "Fertilizer",
    "color": "#7cb342",
  },
  {
    "name": "Oil Refining",
    "color": "#3e2723",
  },
  {
    "name": "Carbon Fiber",
    "color": "#2d2d2d",
  },
  {
    "name": "Oil Products",
    "color": "#ff6b6b",
  },
  {
    "name": "Electronics",
    "color": "#00cc66",
  },
  {
    "name": "Silicon Tech",
    "color": "#8db4e2",
  },
  {
    "name": "Aluminium",
    "color": "#c0c0c0",
  },
  {
    "name": "Copper Refining",
    "color": "#e67e22",
  },
  {
    "name": "Titanium",
    "color": "#778899",
  },
  {
    "name": "Glass Production",
    "color": "#87ceeb",
  },
  {
    "name": "Coolant Production",
    "color": "#00bfff",
  },
  {
    "name": "Solar Energy",
    "color": "#ffd700",
  },
  {
    "name": "Advanced Materials",
    "color": "#4169e1",
  },
  {
    "name": "Quantum Tech",
    "color": "#9400d3",
  },
  {
    "name": "Robotics",
    "color": "#ff69b4",
  },
  {
    "name": "Tungsten",
    "color": "#5c5c5c",
  },
  {
    "name": "Weapons",
    "color": "#b71c1c",
  },
  {
    "name": "Scan Drones",
    "color": "#00e5ff",
  },
  {
    "name": "Medical Technology",
    "color": "#ff6b6b",
  },
  {
    "name": "Neural Computing",
    "color": "#ff6347",
  },
  {
    "name": "Jewellery",
    "color": "#e91e63",
  },
  {
    "name": "Insecticide",
    "color": "#76ff03",
  },
  {
    "name": "Singularity",
    "color": "#00ffcc",
  },
  {
    "name": "Dark Matter",
    "color": "#1a0033",
  },
  {
    "name": "Warp Drive",
    "color": "#ff4500",
  },
  {
    "name": "Antimatter",
    "color": "#ff00ff",
  },
  {
    "name": "Plasma Core",
    "color": "#ff6600",
  },
  {
    "name": "Mega Structure",
    "color": "#4169e1",
  },
  {
    "name": "Void Crystal",
    "color": "#9400d3",
  },
  {
    "name": "Chrono Tech",
    "color": "#ffd700",
  },
  {
    "name": "Galactic Production",
    "color": "#00ffcc",
  },
  {
    "name": "Omniscience",
    "color": "#00e5ff",
  },
  {
    "name": "World Engine",
    "color": "#ff6e40",
  },
  {
    "name": "Planetary Shield",
    "color": "#69f0ae",
  },
  {
    "name": "Stellar Forge",
    "color": "#ffd740",
  },
  {
    "name": "Void Engine",
    "color": "#7c4dff",
  },
  {
    "name": "Quantum Exchange",
    "color": "#ff5252",
  },
  {
    "name": "Mega Corp HQ",
    "color": "#448aff",
  },
  {
    "name": "Dimensional Nexus",
    "color": "#e040fb",
  },
  {
    "name": "Galactic Armada",
    "color": "#ff6d00",
  }
];

// ─── Mega Projects ──────────────────────────────────────────────────────

export type MegaProjectUIMeta = {
  type: string;
  name: string;
  description: string;
  icon: string;
};

export const MEGA_PROJECT_UI: MegaProjectUIMeta[] = [
  {
    "type": "spaceElevator",
    "name": "Space Elevator",
    "description": "Construct a towering tether to orbit, revolutionizing transport capacity across your entire empire.",
    "icon": "game-icons:rocket-thruster",
  },
  {
    "type": "dysonSphere",
    "name": "Dyson Sphere",
    "description": "Encase a star in a megastructure to harvest unimaginable quantities of energy for your factories.",
    "icon": "game-icons:solar-system",
  },
  {
    "type": "quantumInternet",
    "name": "Quantum Internet",
    "description": "Build an interlocking quantum network that accelerates research beyond the speed of conventional computing.",
    "icon": "game-icons:spider-web",
  },
  {
    "type": "fusionCity",
    "name": "Fusion City",
    "description": "Construct a self-sustaining metropolis powered by fusion, doubling all production across your dominion.",
    "icon": "game-icons:bank",
  },
  {
    "type": "terraformingEngine",
    "name": "Terraforming Engine",
    "description": "Reshape entire worlds to your specifications. Removes all resource storage limits forever.",
    "icon": "game-icons:crystal-growth",
  },
  {
    "type": "galacticTradeHub",
    "name": "Galactic Trade Hub",
    "description": "Construct an interstellar commerce nexus that commands premium prices across all galactic markets.",
    "icon": "game-icons:shop",
  },
  {
    "type": "deepCoreExtractor",
    "name": "Deep Core Extractor",
    "description": "Bore into the planet's mantle with a mega-drill that dramatically accelerates all raw material extraction.",
    "icon": "game-icons:mining",
  },
  {
    "type": "neuralCommandCenter",
    "name": "Neural Command Center",
    "description": "Deploy a planet-wide neural network that synchronizes and supercharges every worker in your empire.",
    "icon": "game-icons:brain",
  },
  {
    "type": "nanoAssemblyMatrix",
    "name": "Nano Assembly Matrix",
    "description": "Build a molecular-scale fabrication swarm that slashes construction costs across your entire dominion.",
    "icon": "game-icons:nano-bot",
  }
];

// ─── Seasonal Events ────────────────────────────────────────────────────

export type SeasonalUIMeta = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
};

export const SEASONAL_UI: SeasonalUIMeta[] = [
  {
    "id": "doubleProduction",
    "name": "Production Frenzy",
    "description": "All factories produce 2x for a limited time!",
    "icon": "game-icons:flame-tunnel",
    "color": "#ff6600",
  },
  {
    "id": "researchBoom",
    "name": "Research Boom",
    "description": "Research points accumulate 3x faster!",
    "icon": "game-icons:erlenmeyer",
    "color": "#a855f7",
  },
  {
    "id": "marketSurge",
    "name": "Market Surge",
    "description": "All sell prices increased by 50%!",
    "icon": "game-icons:profit",
    "color": "#22c55e",
  },
  {
    "id": "powerBoost",
    "name": "Power Boost",
    "description": "All power plants produce 2x more energy!",
    "icon": "game-icons:lightning-frequency",
    "color": "#facc15",
  }
];

// ─── Weather ────────────────────────────────────────────────────────────

export type WeatherUIMeta = Pick<
  WeatherDefinition,
  'name' | 'icon' | 'description'
>;

export const WEATHER_UI: Record<WeatherType, WeatherUIMeta> = {
  clear: {
    "name": "Clear Skies",
    "icon": "game-icons:sun",
    "description": "Normal conditions. No weather effects.",
  },
  sunny: {
    "name": "Sunny",
    "icon": "game-icons:sun",
    "description": "Bright sunshine! Solar output +40%, wind -30%, production +5%.",
  },
  rainy: {
    "name": "Rainy",
    "icon": "game-icons:heavy-rain",
    "description": "Heavy rain reduces solar by 70%. Wind +20%, production -10%.",
  },
  stormy: {
    "name": "Stormy",
    "icon": "game-icons:lightning-storm",
    "description": "Dangerous storm! Production -25%, solar -90%, but wind +80%!",
  },
  foggy: {
    "name": "Foggy",
    "icon": "game-icons:fog",
    "description": "Dense fog. Solar -50%, wind -40%, production -15%.",
  },
  snowy: {
    "name": "Snowy",
    "icon": "game-icons:snowflake-2",
    "description": "Snowfall. Production -20%, solar -60%. Beautiful but cold.",
  }
} as Record<string, WeatherUIMeta>;

// ─── Quests (UI subset) ────────────────────────────────────────────────

export type QuestUIMeta = {
  id: string;
  name: string;
  description: string;
  icon: string;
};

export const QUEST_UI: QuestUIMeta[] = [
  {
    "id": "tut_build1",
    "name": "First Steps",
    "description": "Build your first Iron Mine to start producing resources.",
    "icon": "game-icons:mine-wagon",
  },
  {
    "id": "tut_power1",
    "name": "Power Up",
    "description": "Build a Coal Generator to power your factory.",
    "icon": "game-icons:factory",
  },
  {
    "id": "tut_sell1",
    "name": "First Sale",
    "description": "Sell some resources on the market to earn money.",
    "icon": "game-icons:coins",
  },
  {
    "id": "tut_extractor2",
    "name": "Expanding Operations",
    "description": "Build 3 extractors and 2 power plants to grow your resource production.",
    "icon": "game-icons:mining",
  },
  {
    "id": "tut_oil_water",
    "name": "Diversify Resources",
    "description": "Build an Oil Pump and Water Extractor to access more raw materials.",
    "icon": "game-icons:oil-rig",
  },
  {
    "id": "tut_transport1",
    "name": "Logistics Begin",
    "description": "Build your first transport line to connect a producer to a consumer.",
    "icon": "game-icons:tread",
  },
  {
    "id": "t1_smelter",
    "name": "Processing Begins",
    "description": "Build a Smelter to process raw iron into iron plates.",
    "icon": "game-icons:furnace",
  },
  {
    "id": "t1_allfactories",
    "name": "Industrial Foundation",
    "description": "Build all basic processing factories: Smelter, Wire Mill, Chemical Plant, Glass Furnace.",
    "icon": "game-icons:factory",
  },
  {
    "id": "t1_research",
    "name": "Knowledge is Power",
    "description": "Start and complete your first research project.",
    "icon": "game-icons:erlenmeyer",
  },
  {
    "id": "t1_steel_forge",
    "name": "Steel Strong",
    "description": "Build a Steel Forge to create advanced steel alloys from iron and coal.",
    "icon": "game-icons:anvil-impact",
  },
  {
    "id": "t1_construction",
    "name": "Construction Empire",
    "description": "Build Brick Factory and Concrete Factory for construction materials.",
    "icon": "game-icons:castle",
  },
  {
    "id": "t1_produce_ironplate",
    "name": "Iron Plate Milestone",
    "description": "Produce 50 iron plates in your smelters.",
    "icon": "game-icons:metal-plate",
  },
  {
    "id": "t1_sell_processed",
    "name": "Value Added",
    "description": "Sell processed Tier 1 resources on the market.",
    "icon": "game-icons:coins",
  },
  {
    "id": "t1_contract_first",
    "name": "Contractor",
    "description": "Complete your first contract to build business relationships.",
    "icon": "game-icons:scroll-unfurled",
  },
  {
    "id": "t1_carbon",
    "name": "Carbon Fiber Pioneer",
    "description": "Build a Carbon Processor to convert coal into high-grade carbon fiber.",
    "icon": "game-icons:coal-pile",
  },
  {
    "id": "t1_oil_refinery",
    "name": "Fuel Refinement",
    "description": "Build an Oil Refinery to process crude oil into fossil fuel.",
    "icon": "game-icons:refinery",
  },
  {
    "id": "t1_fertilizer",
    "name": "Green Revolution",
    "description": "Build a Fertilizer Factory to produce fertilizer from limestone and water.",
    "icon": "game-icons:fertilizer-bag",
  },
  {
    "id": "t1_produce_copperwire",
    "name": "Copper Wire Milestone",
    "description": "Produce 50 copper wires in your wire mill.",
    "icon": "game-icons:electric",
  },
  {
    "id": "t1_produce_plastic",
    "name": "Plastic Milestone",
    "description": "Produce 30 plastic in your chemical plant.",
    "icon": "game-icons:plastic-duck",
  },
  {
    "id": "t1_produce_glass",
    "name": "Glass Milestone",
    "description": "Produce 40 glass in your glass furnace.",
    "icon": "game-icons:glass-celebration",
  },
  {
    "id": "t1_produce_steel",
    "name": "Steel Milestone",
    "description": "Produce 25 steel in your steel forge.",
    "icon": "game-icons:steel-claws",
  },
  {
    "id": "t1_produce_bricks",
    "name": "Bricks Milestone",
    "description": "Produce 50 bricks in your brick factory.",
    "icon": "game-icons:brick-wall",
  },
  {
    "id": "t1_produce_concrete",
    "name": "Concrete Milestone",
    "description": "Produce 20 concrete in your concrete factory.",
    "icon": "game-icons:concrete-bag",
  },
  {
    "id": "t1_produce_carbon",
    "name": "Carbon Fiber Milestone",
    "description": "Produce 20 carbon fiber in your carbon processor.",
    "icon": "game-icons:coal-pile",
  },
  {
    "id": "t1_produce_fossilfuel",
    "name": "Fossil Fuel Milestone",
    "description": "Produce 30 fossil fuel in your oil refinery.",
    "icon": "game-icons:fuel-tank",
  },
  {
    "id": "t1_daily_raw_sell",
    "name": "Raw Material Trader",
    "description": "Sell raw resources (iron, copper, coal, oil) on the market.",
    "icon": "game-icons:coins",
  },
  {
    "id": "t1_daily_t1_sell",
    "name": "Processed Goods Trader",
    "description": "Sell Tier 1 processed resources (iron plates, copper wire, etc.) on the market.",
    "icon": "game-icons:coins",
  },
  {
    "id": "t2_gearfactory",
    "name": "Precision Engineering",
    "description": "Research Basic Machining and build a Gear Factory.",
    "icon": "game-icons:big-gear",
  },
  {
    "id": "t2_circuitfactory",
    "name": "Silicon Valley",
    "description": "Research Electronics and build a Circuit Factory.",
    "icon": "game-icons:circuitry",
  },
  {
    "id": "t2_batteryfactory",
    "name": "Energy Storage",
    "description": "Research Energy Storage and build a Battery Factory for power storage solutions.",
    "icon": "game-icons:battery-75",
  },
  {
    "id": "t2_enginefactory",
    "name": "Mechanical Heart",
    "description": "Research Mechanical Engineering and build an Engine Factory.",
    "icon": "game-icons:gear-stick",
  },
  {
    "id": "t2_nuclear",
    "name": "Nuclear Age",
    "description": "Research Nuclear Power and build a Nuclear Reactor for massive energy.",
    "icon": "game-icons:nuclear",
  },
  {
    "id": "t2_hire_workers",
    "name": "Workforce",
    "description": "Hire workers to boost your factory efficiency.",
    "icon": "game-icons:overhead",
  },
  {
    "id": "t2_transport5",
    "name": "Logistics Network",
    "description": "Build 5 transport lines to create a proper supply chain.",
    "icon": "game-icons:truck",
  },
  {
    "id": "t2_produce_circuit",
    "name": "Circuit Board Milestone",
    "description": "Produce 25 circuit boards in your factory.",
    "icon": "game-icons:circuitry",
  },
  {
    "id": "t2_contract3",
    "name": "Reliable Partner",
    "description": "Complete 3 contracts to establish your reputation.",
    "icon": "game-icons:scroll-unfurled",
  },
  {
    "id": "t2_earn_50k",
    "name": "Profit Margin",
    "description": "Earn $50,000 total to expand operations.",
    "icon": "game-icons:coins",
  },
  {
    "id": "t2_aluminium",
    "name": "Light Metal",
    "description": "Build a Bauxite Mine and Aluminium Factory for lightweight manufacturing.",
    "icon": "game-icons:metal-disc",
  },
  {
    "id": "t2_silicon_refinery",
    "name": "Silicon Valley Expansion",
    "description": "Research Electronics and build a Silicon Refinery for silicon wafers.",
    "icon": "game-icons:processor",
  },
  {
    "id": "t2_copper_refinery",
    "name": "Pure Copper",
    "description": "Research Electronics and build a Copper Refinery for copper ingots.",
    "icon": "game-icons:metal-scales",
  },
  {
    "id": "t2_titanium_refinery",
    "name": "Titanium Strength",
    "description": "Research Advanced Metallurgy and build a Titanium Refinery for rare earth processing.",
    "icon": "game-icons:shield-impact",
  },
  {
    "id": "t2_coolant_plant",
    "name": "Cool Running",
    "description": "Build a Coolant Plant to produce industrial coolant from water and oil.",
    "icon": "game-icons:snowflake-2",
  },
  {
    "id": "t2_optics_lab",
    "name": "Light Speed",
    "description": "Research Electronics and build an Optics Lab for fiber optics.",
    "icon": "game-icons:laser-burst",
  },
  {
    "id": "t2_solar_cell",
    "name": "Sun Power",
    "description": "Research Energy Storage and build a Solar Cell Factory.",
    "icon": "game-icons:solar-power",
  },
  {
    "id": "t2_display_factory",
    "name": "Screen Time",
    "description": "Research Electronics and build a Display Factory for display panels.",
    "icon": "game-icons:tv",
  },
  {
    "id": "t2_hydrogen_plant",
    "name": "Hydrogen Economy",
    "description": "Research Energy Storage and build a Hydrogen Plant for hydrogen fuel.",
    "icon": "game-icons:h2o",
  },
  {
    "id": "t2_insecticide",
    "name": "Pest Control",
    "description": "Research Basic Machining and build an Insecticide Factory.",
    "icon": "game-icons:poison",
  },
  {
    "id": "t2_quarry",
    "name": "Quarry Operations",
    "description": "Build a Sand Mine to extract sand for glass and silicon production.",
    "icon": "game-icons:desert",
  },
  {
    "id": "t2_wolframite_mine",
    "name": "Tungsten Source",
    "description": "Research Advanced Metallurgy and build a Wolframite Mine for tungsten production.",
    "icon": "game-icons:obelisk",
  },
  {
    "id": "t2_produce_gear",
    "name": "Gear Milestone",
    "description": "Produce 20 gears in your gear factory.",
    "icon": "game-icons:big-gear",
  },
  {
    "id": "t2_produce_silicon",
    "name": "Silicon Milestone",
    "description": "Produce 15 silicon in your silicon refinery.",
    "icon": "game-icons:processor",
  },
  {
    "id": "t2_produce_aluminium",
    "name": "Aluminium Milestone",
    "description": "Produce 15 aluminium in your aluminium factory.",
    "icon": "game-icons:metal-disc",
  },
  {
    "id": "t2_produce_coolant",
    "name": "Coolant Milestone",
    "description": "Produce 25 coolant in your coolant plant.",
    "icon": "game-icons:snowflake-2",
  },
  {
    "id": "t2_produce_fiberoptics",
    "name": "Fiber Optics Milestone",
    "description": "Produce 15 fiber optics in your optics lab.",
    "icon": "game-icons:laser-burst",
  },
  {
    "id": "t2_produce_solarcell",
    "name": "Solar Cell Milestone",
    "description": "Produce 10 solar cells in your solar cell factory.",
    "icon": "game-icons:solar-power",
  },
  {
    "id": "t2_produce_copperingot",
    "name": "Copper Ingot Milestone",
    "description": "Produce 20 copper ingots in your copper refinery.",
    "icon": "game-icons:gold-bar",
  },
  {
    "id": "t2_produce_insecticide",
    "name": "Insecticide Milestone",
    "description": "Produce 15 insecticide in your insecticide factory.",
    "icon": "game-icons:poison",
  },
  {
    "id": "t3_ailab",
    "name": "Artificial Minds",
    "description": "Research Artificial Intelligence and build an AI Lab.",
    "icon": "game-icons:brain",
  },
  {
    "id": "t3_robotics",
    "name": "Rise of Machines",
    "description": "Research Robotics Tech and build a Robotics Bay to assemble robotic units.",
    "icon": "game-icons:robot-grab",
  },
  {
    "id": "t3_quantum",
    "name": "Quantum Leap",
    "description": "Research Quantum Physics and build a Quantum Lab.",
    "icon": "game-icons:atom",
  },
  {
    "id": "t3_electronics",
    "name": "Electronics Age",
    "description": "Build an Electronics Factory to assemble advanced electronics from circuits and silicon.",
    "icon": "game-icons:smartphone",
  },
  {
    "id": "t3_alloy",
    "name": "Advanced Metallurgy",
    "description": "Research Advanced Metallurgy and build an Alloy Forge for advanced alloys.",
    "icon": "game-icons:metal-bar",
  },
  {
    "id": "t3_fusion",
    "name": "Fusion Power",
    "description": "Research Fusion Energy and build a Fusion Reactor — the pinnacle of clean energy.",
    "icon": "game-icons:reactor",
  },
  {
    "id": "t3_megaproject",
    "name": "Mega Aspirations",
    "description": "Start a Mega Project and make progress toward completion.",
    "icon": "game-icons:castle",
  },
  {
    "id": "t3_efficiency",
    "name": "Peak Performance",
    "description": "Achieve 90%+ power efficiency across your factory.",
    "icon": "game-icons:lightning-frequency",
  },
  {
    "id": "t3_produce_aichip",
    "name": "AI Chip Milestone",
    "description": "Produce 10 AI chips in your labs.",
    "icon": "game-icons:brain",
  },
  {
    "id": "t3_transport10",
    "name": "Supply Chain Master",
    "description": "Build 10 transport lines and connect your entire factory network.",
    "icon": "game-icons:steam-locomotive",
  },
  {
    "id": "t3_contract5",
    "name": "Corporate Contractor",
    "description": "Complete 5 contracts to become a trusted corporate supplier.",
    "icon": "game-icons:scroll-unfurled",
  },
  {
    "id": "t3_earn_500k",
    "name": "Half Million",
    "description": "Earn $500,000 total to become a major industrial power.",
    "icon": "game-icons:coins",
  },
  {
    "id": "t3_nanola",
    "name": "Nano Scale",
    "description": "Research Nanotechnology and build a Nano Lab — the ultimate production facility.",
    "icon": "game-icons:nano-bot",
  },
  {
    "id": "t3_medtech",
    "name": "Medical Revolution",
    "description": "Research Advanced Metallurgy and build a Medical Tech Lab for life-saving technology.",
    "icon": "game-icons:hospital-cross",
  },
  {
    "id": "t3_goldsmith",
    "name": "Jewel Crafter",
    "description": "Research Nanotechnology and build a Goldsmith for precious jewellery production.",
    "icon": "game-icons:diamond-ring",
  },
  {
    "id": "t3_tungsten",
    "name": "Tungsten Titan",
    "description": "Research Advanced Metallurgy and build a Tungsten Smelter for tungsten production.",
    "icon": "game-icons:iron-cross",
  },
  {
    "id": "t3_arms",
    "name": "Arms Manufacturer",
    "description": "Research Mechanical Engineering and build an Arms Factory for weapons production.",
    "icon": "game-icons:ak47",
  },
  {
    "id": "t3_drone_shipyard",
    "name": "Drone Commander",
    "description": "Research Robotics Tech and build a Drone Shipyard for scan drone production.",
    "icon": "game-icons:space-shuttle",
  },
  {
    "id": "t3_detector",
    "name": "Artifact Hunter",
    "description": "Research Quantum Physics and build a Detector Factory for artifact detectors.",
    "icon": "game-icons:satellite",
  },
  {
    "id": "t3_neural",
    "name": "Neural Network",
    "description": "Research Artificial Intelligence and build a Neural Lab for neural network construction.",
    "icon": "game-icons:thought-bubble",
  },
  {
    "id": "t3_produce_advancedalloy",
    "name": "Advanced Alloy Milestone",
    "description": "Produce 10 advanced alloys in your alloy forge.",
    "icon": "game-icons:metal-bar",
  },
  {
    "id": "t3_produce_nanomaterial",
    "name": "Nano Material Milestone",
    "description": "Produce 5 nano materials in your nano lab.",
    "icon": "game-icons:nano-bot",
  },
  {
    "id": "t3_produce_medicaltech",
    "name": "Medical Tech Milestone",
    "description": "Produce 5 medical tech in your medical tech lab.",
    "icon": "game-icons:hospital-cross",
  },
  {
    "id": "t3_produce_jewellery",
    "name": "Jewellery Milestone",
    "description": "Produce 3 jewellery in your goldsmith.",
    "icon": "game-icons:diamond-ring",
  },
  {
    "id": "t3_produce_tungsten",
    "name": "Tungsten Milestone",
    "description": "Produce 10 tungsten in your tungsten smelter.",
    "icon": "game-icons:iron-cross",
  },
  {
    "id": "t3_produce_weapons",
    "name": "Weapons Milestone",
    "description": "Produce 5 weapons in your arms factory.",
    "icon": "game-icons:ak47",
  },
  {
    "id": "t3_produce_scandrone",
    "name": "Scan Drone Milestone",
    "description": "Produce 3 scan drones in your drone shipyard.",
    "icon": "game-icons:space-shuttle",
  },
  {
    "id": "t3_produce_artifactdetector",
    "name": "Artifact Detector Milestone",
    "description": "Produce 2 artifact detectors in your detector factory.",
    "icon": "game-icons:satellite",
  },
  {
    "id": "t3_produce_neuralnetwork",
    "name": "Neural Network Milestone",
    "description": "Produce 5 neural networks in your neural lab.",
    "icon": "game-icons:thought-bubble",
  },
  {
    "id": "t3_produce_quantumpart",
    "name": "Quantum Part Milestone",
    "description": "Produce 5 quantum parts in your quantum lab.",
    "icon": "game-icons:atom",
  },
  {
    "id": "t3_research15",
    "name": "Research Master",
    "description": "Complete 15 research projects to master the technology tree.",
    "icon": "game-icons:erlenmeyer",
  },
  {
    "id": "t3_earn_2m",
    "name": "Two Million Club",
    "description": "Earn $2,000,000 total — an industrial powerhouse.",
    "icon": "game-icons:coins",
  },
  {
    "id": "t4_singularity",
    "name": "The Singularity",
    "description": "Research Singularity Theory and build a Singularity Forge — the ultimate production facility.",
    "icon": "game-icons:vortex",
  },
  {
    "id": "t4_darkmatter",
    "name": "Dark Matter Discovery",
    "description": "Research Void Crystallography and build a Dark Matter Lab.",
    "icon": "game-icons:hole",
  },
  {
    "id": "t4_warp",
    "name": "Faster Than Light",
    "description": "Research Warp Technology and build a Warp Drive Factory.",
    "icon": "game-icons:rocket-thruster",
  },
  {
    "id": "t4_antimatter",
    "name": "Antimatter Revolution",
    "description": "Research Antimatter Physics and build an Antimatter Reactor.",
    "icon": "game-icons:lightning-frequency",
  },
  {
    "id": "t4_chrono",
    "name": "Time Bender",
    "description": "Research Chrono Engineering and build a Chrono Lab to manipulate time itself.",
    "icon": "game-icons:hourglass",
  },
  {
    "id": "t4_plasma",
    "name": "Plasma Master",
    "description": "Research Plasma Dynamics and build a Plasma Forge.",
    "icon": "game-icons:flame-tunnel",
  },
  {
    "id": "t4_void_crystal",
    "name": "Void Crystal Harvest",
    "description": "Build a Void Crystallizer to harvest void energy from quantum parts and nano materials.",
    "icon": "game-icons:implosion",
  },
  {
    "id": "t4_megastructure",
    "name": "Mega Builder",
    "description": "Build a Mega Structure Factory to construct massive modules from concrete, steel, and advanced alloys.",
    "icon": "game-icons:castle",
  },
  {
    "id": "t4_dyson",
    "name": "Stellar Harvester",
    "description": "Build a Dyson Collector to harvest stellar energy — requires Dimensional Physics research and 2 prestiges.",
    "icon": "game-icons:solar-system",
  },
  {
    "id": "t4_galactic_forge",
    "name": "Galactic Forge",
    "description": "Build the ultimate Galactic Forge — converts T4 resources into immeasurable wealth. Requires 5 prestiges.",
    "icon": "game-icons:galaxy",
  },
  {
    "id": "t4_produce_singularity",
    "name": "Singularity Core Milestone",
    "description": "Produce 5 Singularity Cores — the key to transcending ordinary physics.",
    "icon": "game-icons:vortex",
  },
  {
    "id": "t4_earn_5m",
    "name": "Multi-Millionaire",
    "description": "Earn $5,000,000 total — a true industrial empire.",
    "icon": "game-icons:coins",
  },
  {
    "id": "t4_research_all",
    "name": "Complete Knowledge",
    "description": "Complete 10 research projects to unlock the full technology tree.",
    "icon": "game-icons:erlenmeyer",
  },
  {
    "id": "t4_prestige",
    "name": "Global Expansion",
    "description": "Prestige to expand your corporation globally and unlock permanent bonuses.",
    "icon": "game-icons:crystal-growth",
  },
  {
    "id": "t4_antimatter_power",
    "name": "Antimatter Power",
    "description": "Build an Antimatter Power Plant — the ultimate energy source producing 1000 MW.",
    "icon": "game-icons:lightning-frequency",
  },
  {
    "id": "t4_quantum_teleporter",
    "name": "Quantum Teleportation",
    "description": "Research Dimensional Physics and prestige 2 times, then build a Quantum Teleporter.",
    "icon": "game-icons:teleport",
  },
  {
    "id": "t4_dimensional_gateway",
    "name": "Dimensional Rift",
    "description": "Research Dimensional Physics and prestige 3 times, then build a Dimensional Gateway.",
    "icon": "game-icons:portal",
  },
  {
    "id": "t4_time_distorter",
    "name": "Time Bender Supreme",
    "description": "Research Galactic Manufacturing and prestige 3 times, then build a Time Distorter.",
    "icon": "game-icons:hourglass",
  },
  {
    "id": "t4_produce_darkmatter",
    "name": "Dark Matter Cell Milestone",
    "description": "Produce 3 dark matter cells — harness the void.",
    "icon": "game-icons:hole",
  },
  {
    "id": "t4_produce_warpdrive",
    "name": "Warp Drive Milestone",
    "description": "Produce 2 warp drives — bend spacetime.",
    "icon": "game-icons:rocket-thruster",
  },
  {
    "id": "t4_produce_antimatter",
    "name": "Antimatter Milestone",
    "description": "Produce 5 antimatter — the ultimate energy source.",
    "icon": "game-icons:lightning-frequency",
  },
  {
    "id": "t4_produce_chronopart",
    "name": "Chrono Part Milestone",
    "description": "Produce 3 chrono parts — manipulate time.",
    "icon": "game-icons:hourglass",
  },
  {
    "id": "t4_produce_plasmacore",
    "name": "Plasma Core Milestone",
    "description": "Produce 5 plasma cores — harness superheated plasma.",
    "icon": "game-icons:flame-tunnel",
  },
  {
    "id": "t4_produce_megastructure",
    "name": "Mega Structure Milestone",
    "description": "Produce 3 mega structures — build on an unprecedented scale.",
    "icon": "game-icons:castle",
  },
  {
    "id": "t4_produce_voidcrystal",
    "name": "Void Crystal Milestone",
    "description": "Produce 3 void crystals — study the void.",
    "icon": "game-icons:implosion",
  },
  {
    "id": "t4_prestige_3",
    "name": "Triple Expansion",
    "description": "Prestige 3 times to expand your corporation across multiple dimensions.",
    "icon": "game-icons:crystal-growth",
  },
  {
    "id": "t4_research_all_complete",
    "name": "Complete All Research",
    "description": "Complete all 26 research projects to achieve total technological supremacy.",
    "icon": "game-icons:erlenmeyer",
  },
  {
    "id": "t4_earn_50m",
    "name": "Fifty Million",
    "description": "Earn $50,000,000 total — the ultimate industrial empire.",
    "icon": "game-icons:coins",
  },
  {
    "id": "t4_build_50",
    "name": "Build 50 Buildings",
    "description": "Build 50 buildings total — an empire spanning the globe.",
    "icon": "game-icons:castle",
  },
  {
    "id": "t4_contract_20",
    "name": "Contract Veteran",
    "description": "Complete 20 contracts — the most trusted supplier in the galaxy.",
    "icon": "game-icons:scroll-unfurled",
  },
  {
    "id": "daily_build",
    "name": "Daily Builder",
    "description": "Build 3 new buildings today to expand your empire.",
    "icon": "game-icons:factory",
  },
  {
    "id": "daily_earn",
    "name": "Daily Earnings",
    "description": "Earn $5,000 from sales today.",
    "icon": "game-icons:coins",
  },
  {
    "id": "daily_sell",
    "name": "Daily Trader",
    "description": "Sell 10 resources on the market today.",
    "icon": "game-icons:shop",
  },
  {
    "id": "daily_contract",
    "name": "Daily Contract",
    "description": "Complete 1 contract today to maintain your reputation.",
    "icon": "game-icons:scroll-unfurled",
  },
  {
    "id": "daily_research",
    "name": "Daily Researcher",
    "description": "Complete 1 research project today to advance your technology.",
    "icon": "game-icons:erlenmeyer",
  },
  {
    "id": "daily_produce",
    "name": "Daily Producer",
    "description": "Produce 100 resources total today across all factories.",
    "icon": "game-icons:wooden-crate",
  },
  {
    "id": "daily_power",
    "name": "Daily Power Manager",
    "description": "Keep your power efficiency above 80% today — maintain optimal grid performance.",
    "icon": "game-icons:lightning-frequency",
  },
  {
    "id": "weekly_industrialist",
    "name": "Weekly Industrialist",
    "description": "A week of expansion: build 10 buildings, complete 3 contracts, and earn $50,000.",
    "icon": "game-icons:factory",
  },
  {
    "id": "weekly_researcher",
    "name": "Weekly Scholar",
    "description": "Complete 3 research projects and produce 50 advanced resources this week.",
    "icon": "game-icons:erlenmeyer",
  },
  {
    "id": "weekly_transport",
    "name": "Weekly Logistics",
    "description": "Build 8 transport lines and connect all your active buildings this week.",
    "icon": "game-icons:truck",
  },
  {
    "id": "weekly_mega",
    "name": "Weekly Mega Builder",
    "description": "Build T3+ factories, reach high efficiency, and make progress on a Mega Project.",
    "icon": "game-icons:castle",
  },
  {
    "id": "weekly_singularity",
    "name": "Weekly Singularity",
    "description": "Produce T4 resources, complete research, and earn massive profits.",
    "icon": "game-icons:galaxy",
  },
  {
    "id": "weekly_arms_dealer",
    "name": "Weekly Arms Dealer",
    "description": "Produce T3 weapons and defense resources: weapons, scan drones, and advanced alloys.",
    "icon": "game-icons:ak47",
  },
  {
    "id": "weekly_void_explorer",
    "name": "Weekly Void Explorer",
    "description": "Produce T4 resources and complete endgame activities: dark matter, void crystals, and galactic manufacturing.",
    "icon": "game-icons:galaxy",
  }
];

// ─── Tier Info (from icons/tiers.ts; kept as a separate module) ─────────

export { TIER_INFO } from './icons/tiers';

// ─── Re-exports for ergonomics ─────────────────────────────────────────

export type { BuildingType, ResourceType, TransportType, WeatherType } from './types';
