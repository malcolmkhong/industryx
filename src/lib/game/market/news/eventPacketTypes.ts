// ============================================
// FACTORY DOMINION: EVENT PACKET TYPES
// Split from newsBuilder.ts.
// ============================================

export interface EventPacket {
  type: "price_move" | "volatility" | "sector" | "trade";
  resource: string;
  delta: string;
  severity: "low" | "medium" | "high";
  context: {
    cause?: string;
    region?: string;
    sectorName?: string;
    source?: string;
    volume?: number;
    trend?: string;
    oldPrice?: number;
    newPrice?: number;
    basePrice?: number;
    prodRate?: number;
    consRate?: number;
  };
}
