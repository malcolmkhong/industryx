'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/lib/game/store';

interface MarketState {
  tick: number;
  prices: Array<{
    resource: string;
    currentPrice: number;
    basePrice: number;
    trend: 'up' | 'down' | 'stable';
    volume: number;
  }>;
  news: Array<{
    title: string;
    description: string;
    affectedResources: string[];
  }>;
  volatility: number;
}

const POLL_INTERVAL = 10000; // 10 seconds

export function useServerMarket() {
  const lastTick = useRef(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/market/state');
        if (!res.ok) return;
        const data: MarketState = await res.json();
        if (data.tick <= lastTick.current) return;
        lastTick.current = data.tick;

        useGameStore.setState({
          serverMarket: {
            prices: data.prices,
            news: data.news,
            tick: data.tick,
            volatility: data.volatility,
          },
        });
      } catch {
        // Network error — keep last known state
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return null;
}
