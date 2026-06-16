// ============================================
// FACTORY DOMINION — Global Market Engine
// ============================================

const PRESSURE_FACTOR = 0.0005;
const VOLATILITY_DECAY = 0.95;
const MIN_PRICE = 1;
const MAX_PRICE = 1000000;
const EVENT_THRESHOLD = 0.04;
const SPIKE_CAP = 0.40;
const BREAKER_COOLDOWN = 5;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function tick(prices, pressure, volatility = 0, breakers = {}) {
  const newPrices = [];
  const events = [];
  const newBreakers = { ...breakers };

  for (const entry of prices) {
    const res = entry.resource;
    const p = pressure[res] || { buyVol: 0, sellVol: 0 };
    const br = breakers[res] || { cooldown: 0, spikes: 0, soldOut: false };
    let netPressure = p.buyVol - p.sellVol;
    const oldPrice = entry.currentPrice;

    const isSoldOut = (p.sellVol === 0 && p.buyVol > 0 && netPressure > 0);
    if (isSoldOut) {
      br.soldOut = true;
      br.cooldown = BREAKER_COOLDOWN;
      netPressure = 0;
    }

    if (br.cooldown > 0 && br.soldOut) {
      netPressure = 0;
      br.cooldown--;
    } else if (br.cooldown > 0) {
      netPressure = Math.min(0, netPressure);
      br.cooldown--;
    }

    const shift = Math.sign(netPressure) * Math.sqrt(Math.abs(netPressure)) * PRESSURE_FACTOR * (1 + volatility * 5);
    let newPrice = clamp(oldPrice + oldPrice * shift, MIN_PRICE, MAX_PRICE);

    const changePct = oldPrice > 0 ? (newPrice - oldPrice) / oldPrice : 0;
    if (Math.abs(changePct) > SPIKE_CAP) {
      const sign = changePct > 0 ? 1 : -1;
      newPrice = oldPrice * (1 + sign * SPIKE_CAP);
      br.spikes++;
      br.cooldown = BREAKER_COOLDOWN;
      const cappedPct = sign * SPIKE_CAP;
      events.push({
        type: 'price_move', resource: res,
        delta: `${cappedPct > 0 ? '+' : ''}${(Math.abs(cappedPct) * 100).toFixed(1)}%`,
        severity: 'high',
        context: {
          cause: `CIRCUIT BREAKER: ${(Math.abs(changePct) * 100).toFixed(0)}% spike capped at ${(SPIKE_CAP * 100).toFixed(0)}%${br.soldOut ? ' — SOLD OUT' : ''}`,
          trend: cappedPct > 0 ? 'up' : 'down',
          oldPrice: Math.round(oldPrice * 100) / 100,
          newPrice: Math.round(newPrice * 100) / 100,
          buyVolume: p.buyVol, sellVolume: p.sellVol,
        },
      });
    } else if (Math.abs(changePct) >= EVENT_THRESHOLD) {
      events.push({
        type: 'price_move', resource: res,
        delta: `${changePct > 0 ? '+' : ''}${(Math.abs(changePct) * 100).toFixed(1)}%`,
        severity: Math.abs(changePct) > 0.10 ? 'high' : Math.abs(changePct) > 0.06 ? 'medium' : 'low',
        context: {
          cause: netPressure > 0 ? 'buy pressure exceeding supply' : 'sell pressure exceeding demand',
          trend: changePct > 0 ? 'up' : 'down',
          oldPrice: Math.round(oldPrice * 100) / 100,
          newPrice: Math.round(newPrice * 100) / 100,
          buyVolume: p.buyVol, sellVolume: p.sellVol,
        },
      });
    }

    if (br.soldOut && p.sellVol > 0) {
      br.soldOut = false;
      br.cooldown = 0;
    }

    if (br.cooldown <= 0 && !br.soldOut) {
      br.spikes = 0;
    }

    newPrices.push({
      resource: res,
      currentPrice: Math.round(newPrice * 100) / 100,
      basePrice: entry.basePrice,
      trend: changePct > 0.01 ? 'up' : changePct < -0.01 ? 'down' : 'stable',
      volume: p.buyVol + p.sellVol,
    });

    newBreakers[res] = br;
  }

  return {
    prices: newPrices,
    events,
    volatility: clamp(volatility * VOLATILITY_DECAY + events.length * 0.02, 0, 1),
    breakers: newBreakers,
  };
}

export function createInitialPrices(resourceList) {
  return resourceList.map(r => ({
    resource: r.resource,
    currentPrice: r.basePrice,
    basePrice: r.basePrice,
    trend: 'stable',
    volume: 0,
  }));
}
