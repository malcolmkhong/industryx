// ============================================
// FACTORY DOMINION: NEWS BUILDER
// Compatibility barrel. News generation logic lives in split modules.
// ============================================

export { NEWS_CONFIG, type NewsConfig } from "./newsConfig";
export type { EventPacket } from "./eventPacketTypes";
export {
  BULLISH_OUTLOOKS,
  BEARISH_OUTLOOKS,
  DOWN_INSIGHTS,
  NEUTRAL_INSIGHTS,
  NEUTRAL_OUTLOOKS,
  TITLE_PRICE_DOWN,
  TITLE_PRICE_UP,
  TITLE_SECTOR,
  TITLE_TRADE,
  TITLE_VOLATILITY,
  UP_INSIGHTS,
} from "./phraseBank";
export {
  PRICE_MOVE_DOWN_TEMPLATES,
  PRICE_MOVE_UP_TEMPLATES,
  SECTOR_DOWNTURN_TEMPLATES,
  SECTOR_RALLY_TEMPLATES,
  TRADE_BUY_HEAVY_TEMPLATES,
  TRADE_SELL_HEAVY_TEMPLATES,
  VOLATILITY_CHAIN_TEMPLATES,
  VOLATILITY_MACRO_TEMPLATES,
  VOLATILITY_MICRO_TEMPLATES,
} from "./templates";
export {
  ANTI_REPEAT_WINDOW,
  selectTemplate,
  type TemplateCategory,
} from "./templateSelector";
export { generateFallbackText } from "./fallbackText";
export {
  buildEventPacketFromPriceMove,
  buildEventPacketFromSector,
  buildEventPacketFromTrade,
  buildEventPacketFromVolatility,
} from "./eventPackets";
export { eventPacketToMarketNews } from "./marketNewsFactory";
export { generateNewsId } from "./newsIds";
