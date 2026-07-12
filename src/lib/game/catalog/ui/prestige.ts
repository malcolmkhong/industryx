// ============================================
// IndustryaX: UI Catalog — Prestige + Ranks
// Static presentation metadata only (no game-logic Master fields).
// Split from uiCatalog.ts — behavior-identical data move.
// ============================================

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

