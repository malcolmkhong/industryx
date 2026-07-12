// ============================================
// FACTORY DOMINION: ICON MAPPINGS
// Compatibility barrel — domain maps live in split modules.
// Single source of truth for all icon ID mappings.
// SVG icons use Iconify IDs (game-icons: prefix → game-icons CDN collection).
// ============================================

export { RESOURCE_ICON_MAP } from './resourceIcons';

export { BUILDING_ICON_MAP, MEGA_PROJECT_ICON_MAP } from './buildingIcons';

export { RESEARCH_ICON_MAP } from './researchIcons';

export {
  UI_ICON_MAP,
  TRANSPORT_ICON_MAP,
  WORKER_ICON_MAP,
} from './uiIcons';

export { WEATHER_ICON_MAP, TIER_EMOJI_MAP } from './effectIcons';
