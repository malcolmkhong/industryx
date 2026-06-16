// ============================================
// FACTORY DOMINION — Global Market Engine
// ============================================
// Runs inside Cloudflare Worker (cron trigger).
// Calculates new prices from aggregate player pressure,
// generates events when thresholds are crossed,
// and returns structured data for AI news generation.
// ============================================

const PRESSURE_FACTOR = 0.0005;  // sqrt(volume) for diminishing returns
const VOLATILITY_DECAY = 0.95;   // Volatility decays each tick
const MIN_PRICE = 1;             // Floor price
const MAX_PRICE = 1_000_000;     // Ceiling price
const EVENT_THRESHOLD = 0.04;    // 4% price change = generate event

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Calculate new prices from current state + aggregate player pressure.
 *
 * @param {Array<{resource: string, currentPrice: number, basePrice: number}>} prices
 * @param {Record<string, {buyVol: number, sellVol: number}>} pressure
 * @param {number} volatility
 * @returns {{ prices: Array, events: Array, volatility: number }}
 */
export function tick(prices, pressure, volatility = 0.0) {
  const newPrices = [];
  const events = [];

  for (const entry of prices) {
    const res = entry.resource;
    const p = pressure[res] || { buyVol: 0, sellVol: 0 };
    const netPressure = p.buyVol - p.sellVol;

    // Price moves opposite to player pressure:
    // More selling (surplus) → price drops
    // More buying (deficit) → price rises
    const oldPrice = entry.currentPrice;
    const shift = Math.sign(netPressure) * Math.sqrt(Math.abs(netPressure)) * PRESSURE_FACTOR * (1 + volatility * 5);
    const newPrice = clamp(
      oldPrice + oldPrice * shift,
      MIN_PRICE,
      MAX_PRICE
    );

    // Check if price change crosses threshold
    const changePct = oldPrice > 0 ? (newPrice - oldPrice) / oldPrice : 0;
    if (Math.abs(changePct) >= EVENT_THRESHOLD) {
      const sign = changePct > 0 ? '+' : '';
      const direction = changePct > 0 ? 'up' : 'down';

      events.push({
        type: 'price_move',
        resource: res,
        delta: `${sign}${(Math.abs(changePct) * 100).toFixed(1)}%`,
        severity: Math.abs(changePct) > 0.10 ? 'high'
          : Math.abs(changePct) > 0.06 ? 'medium'
          : 'low',
        context: {
          cause: netPressure > 0
            ? 'buy pressure exceeding supply'
            : 'sell pressure exceeding demand',
          trend: direction,
          oldPrice: Math.round(oldPrice * 100) / 100,
          newPrice: Math.round(newPrice * 100) / 100,
          buyVolume: p.buyVol,
          sellVolume: p.sellVol,
        },
      });
    }

    newPrices.push({
      resource: res,
      currentPrice: Math.round(newPrice * 100) / 100,
      basePrice: entry.basePrice,
      trend: changePct > 0.01 ? 'up' : changePct < -0.01 ? 'down' : 'stable',
      volume: p.buyVol + p.sellVol,
    });
  }

  // Volatility adjusts based on event count
  const newVolatility = clamp(
    volatility * VOLATILITY_DECAY + events.length * 0.02,
    0,
    1
  );

  return { prices: newPrices, events, volatility: newVolatility };
}

/**
 * Create initial market entries from a resource list.
 *
 * @param {Array<{resource: string, basePrice: number}>} resourceList
 * @returns {Array}
 */
export function createInitialPrices(resourceList) {
  return resourceList.map(r => ({
    resource: r.resource,
    currentPrice: r.basePrice,
    basePrice: r.basePrice,
    trend: 'stable',
    volume: 0,
  }));
}
