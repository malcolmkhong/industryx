// ============================================
// FACTORY DOMINION: NEWS MODULE INDEX
// Preferred barrel for `src/lib/game/market/news`.
// ============================================

export { NEWS_CONFIG, type NewsConfig, type EventPacket } from './newsBuilder';

export {
  buildEventPacketFromPriceMove,
  buildEventPacketFromVolatility,
  buildEventPacketFromSector,
  buildEventPacketFromTrade,
} from './eventPackets';

export {
  generateFallbackText,
} from './fallbackText';

export {
  ANTI_REPEAT_WINDOW,
  type TemplateCategory,
  selectTemplate,
} from './templateSelector';

export { generateNewsId } from './newsIds';
