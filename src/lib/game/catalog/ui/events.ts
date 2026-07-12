// ============================================
// IndustryaX: UI Catalog — Events + Seasonal + Weather
// Static presentation metadata only (no game-logic Master fields).
// Split from uiCatalog.ts — behavior-identical data move.
// ============================================

import type {
  WeatherDefinition,
  WeatherType,
} from '../../shared/types/types';

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

