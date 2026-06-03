import { NextResponse } from 'next/server';

// In-memory cache for icon data
let cachedData: Record<string, unknown> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 3600 * 1000; // 1 hour server-side cache
// Reset cache timestamp so new icon IDs are fetched on next request
cacheTimestamp = 0;

// All unique icon IDs used in the game
const ALL_ICON_IDS = [
  // Resources - Raw (Tier 0)
  'mine-wagon', 'ore', 'coal-wagon', 'oil-rig', 'desert', 'crystal-cluster',
  'water-drop', 'sparkles', 'brick-pile', 'stone-pile', 'stone-block',
  'peaks', 'dark-squad',
  // Resources - Tier 1
  'metal-plate', 'electric', 'plastic-duck', 'glass-celebration', 'coal-pile',
  'brick-wall', 'concrete-bag', 'fertilizer-bag', 'steel-claws', 'fuel-tank',
  // Resources - Tier 2
  'circuitry', 'gear-stick', 'battery-75', 'big-gear', 'processor',
  'metal-disc', 'poison', 'gold-bar', 'shield-impact', 'snowflake-2',
  'laser-burst', 'solar-power',
  // Resources - Tier 3
  'brain', 'robot-grab', 'atom', 'metal-bar', 'nano-bot', 'smartphone',
  'hospital-cross', 'diamond-ring', 'iron-cross', 'ak47', 'space-shuttle',
  'satellite', 'thought-bubble',
  // Resources - Tier 4
  'vortex', 'hole', 'rocket-thruster', 'lightning-frequency', 'hourglass',
  'flame-tunnel', 'castle', 'implosion',
  // Special resources
  'money-stack', 'magnifying-glass', 'briefcase',
  // Buildings - Extractors
  'mining', 'water-recycling', 'mountain-cave', 'clay-brick', 'stone-bridge',
  'stone-crafting', 'mining-helmet', 'obelisk', 'crystal-shine',
  // Buildings - T1 Factories
  'furnace', 'wire-coil', 'chemical-drop', 'anvil-impact', 'seedling', 'refinery',
  // Buildings - T2 Factories
  'tv', 'h2o', 'metal-scales',
  // Buildings - T4 Endgame
  'solar-system', 'teleport', 'portal', 'galaxy',
  // Power Plants
  'factory', 'wind-turbine', 'nuclear', 'reactor',
  // Transport
  'tread', 'pipes', 'cargo-ship', 'steam-locomotive', 'ufo', 'truck',
  // Workers
  'overhead', 'wrench', 'railway', 'robot-golem',
  // Research
  'gear-hammer', 'mechanical-arm', 'profit', 'warehouse', 'cpu', 'dna1',
  // Mega Projects
  // (using icons already listed above)
  // Weather
  'sun', 'heavy-rain', 'lightning-storm', 'fog',
  // Events
  'tornado', 'erlenmeyer', 'sword-clash', 'sprout', 'falling',
  // UI
  'hammer-drop', 'sell-card', 'buy-card', 'demolish', 'fast-arrow',
  'medal', 'tie', 'trophy', 'crown', 'finish-line', 'present', 'flame',
  'check-mark', 'cross-mark', 'info', 'hazard-sign', 'light-bulb', 'clockwork',
  'help', 'pause-button', 'fast-forward-button', 'spinning-wheel', 'save',
  'cloud-upload', 'spinning-sword', 'moon', 'cardboard-box', 'scales',
  'book-cover', 'calendar', 'scroll-unfurled', 'party-popper', 'hamburger-menu',
  'play-button', 'cash', 'laptop', 'planet-core', 'diamond-hard', 'slot-machine',
  'padlock', 'trade', 'cargo-crane',
  // Tier icons (already listed above)
  // Rank icons
  'heavy-helm', 'imperial-crown', 'star-formation', 'crystal-growth',
  // Automation
  // (using icons already listed above)
  // Additional
  'bank', 'shop', 'spider-web', 'wooden-crate', 'chart',
  // Missing icons found in codebase but not in original list
  'air-zigzag', 'coins', 'crosshair', 'fire', 'gem-chain',
  'helicopter', 'house', 'linked-rings', 'open-book', 'podium-winner',
  'race-car', 'radioactive', 'sleepy', 'stopwatch', 'world',
];

async function fetchIconData() {
  if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedData;
  }

  try {
    const iconsParam = ALL_ICON_IDS.join(',');
    const url = `https://api.iconify.design/game-icons.json?icons=${iconsParam}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'FactoryDominion/1.0' },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`Iconify API returned ${response.status}`);
    }

    const data = await response.json();
    cachedData = data;
    cacheTimestamp = Date.now();
    return data;
  } catch (error) {
    console.error('Failed to fetch icon data:', error);
    return cachedData || { prefix: 'game-icons', icons: {} };
  }
}

export async function GET() {
  const data = await fetchIconData();
  // CRITICAL: Change prefix from 'game-icons' to 'gi' because our icon IDs use 'gi:' prefix.
  // The Iconify API returns prefix='game-icons' but our code references icons as 'gi:mining', etc.
  // The Icon component resolves 'gi:mining' as prefix='gi', name='mining',
  // so addCollection needs the data registered under prefix='gi'.
  const remappedData = {
    ...data,
    prefix: 'gi',
  };
  return NextResponse.json(remappedData, {
    headers: {
      // Use no-store to prevent browsers/CDNs from caching stale icon data
      // where prefix was 'game-icons' instead of remapped 'gi'
      'Cache-Control': 'public, max-age=0, s-maxage=0, must-revalidate',
    },
  });
}
