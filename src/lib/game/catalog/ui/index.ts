// ============================================
// IndustryaX: UI Catalog — Index
// Static presentation metadata only (no game-logic Master fields).
// Split from uiCatalog.ts — behavior-identical data move.
// ============================================

export { RESOURCE_META } from './resources';

export {
  BUILDING_UI,
  MEGA_PROJECT_UI,
  type BuildingUIMeta,
  type MegaProjectUIMeta,
} from './buildings';

export {
  TRANSPORT_UI,
  type TransportUIMeta,
} from './transport';

export {
  WORKER_UI,
  AUTOMATION_UI,
  type WorkerUIMeta,
  type AutomationUIMeta,
} from './workers';

export {
  RESEARCH_UI,
  type ResearchUIMeta,
} from './research';

export {
  PRESTIGE_UI,
  RANK_UI,
  type PrestigeUIMeta,
  type RankUIMeta,
} from './prestige';

export {
  EVENT_UI,
  SEASONAL_UI,
  WEATHER_UI,
  type EventUIMeta,
  type SeasonalUIMeta,
  type WeatherUIMeta,
} from './events';

export {
  QUEST_UI,
  type QuestUIMeta,
} from './quests';

export {
  PRODUCTION_CHAIN_UI,
  type ProductionChainUIMeta,
} from './market';

export { TIER_INFO } from '../../progression/tiers';

export type { BuildingType, ResourceType, TransportType, WeatherType } from '../../shared/types/types';
