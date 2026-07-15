// ============================================
// FACTORY DOMINION: MARKET NEWS FACTORY
// Split from newsBuilder.ts.
// ============================================

import { RESOURCE_META } from "../../config/configCache";
import type { ResourceType } from "../../shared/types/types";
import type { MarketNews } from "../marketSimulator";
import type { EventPacket } from "./eventPacketTypes";
import { generateFallbackText } from "./fallbackText";
import { generateNewsId } from "./newsIds";

function resourceName(resource: string): string {
  return RESOURCE_META[resource as ResourceType]?.name ?? resource;
}

export function eventPacketToMarketNews(
  packet: EventPacket,
  gameTick: number,
  affectedResources?: ResourceType[],
): MarketNews {
  const { title, description } = generateFallbackText(packet);
  const name = resourceName(packet.resource);

  return {
    id: generateNewsId(),
    title,
    description,
    affectedResources: affectedResources ?? [packet.resource as ResourceType],
    impactSummary: `${name} ${packet.delta}`,
    severity: packet.severity,
    gameTick,
    category:
      packet.type === "price_move"
        ? "price_move"
        : packet.type === "volatility"
          ? "volatility"
          : packet.type === "sector"
            ? "sector"
            : "trade",
  };
}
