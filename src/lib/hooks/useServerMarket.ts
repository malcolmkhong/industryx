'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/lib/game/state/store';
import type { MarketNews } from '@/lib/game/market/marketSimulator';
import type { ResourceType } from '@/lib/game/shared/types/types';

type ServerNewsCategory =
  | 'price_move'
  | 'volatility'
  | 'correlation'
  | 'sector'
  | 'trade';

interface ServerMarketNewsItem {
  id?: string;
  title: string;
  description: string;
  affectedResources: string[];
  impactSummary?: string;
  severity?: 'low' | 'medium' | 'high';
  category?: ServerNewsCategory;
  textSource?: 'llm' | 'fallback';
  gameTick?: number;
}

interface MarketState {
  tick: number;
  prices: Array<{
    resource: string;
    currentPrice: number;
    basePrice: number;
    trend: 'up' | 'down' | 'stable';
    volume: number;
  }>;
  news: ServerMarketNewsItem[];
  volatility: number;
}

const POLL_INTERVAL = 10000; // 10 seconds

export function normalizeServerMarketNews(
  news: ServerMarketNewsItem[],
  tick: number,
): MarketNews[] {
  return news.map((item, index) => {
    const affectedResources = item.affectedResources.filter(
      Boolean,
    ) as ResourceType[];
    const firstResource = affectedResources[0] ?? 'market';

    return {
      id: item.id ?? `server-market-${tick}-${index}`,
      title: item.title,
      description: item.description,
      affectedResources,
      impactSummary: item.impactSummary ?? `${firstResource} market update`,
      severity: item.severity ?? 'medium',
      gameTick: item.gameTick ?? tick,
      category: item.category ?? 'price_move',
      textSource: item.textSource ?? 'llm',
    };
  });
}

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
          marketNews: normalizeServerMarketNews(data.news, data.tick),
        });
      } catch {
        // Network error: keep last known server market snapshot.
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return null;
}
