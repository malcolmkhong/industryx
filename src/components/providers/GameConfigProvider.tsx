'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchGameConfig, GameConfig } from '@/lib/game/config';
import { updateFromSupabase, configSource, configVersion } from '@/lib/game/configCache';

// Client-side config cache with 5-minute TTL
const CONFIG_CACHE_KEY = 'industriax_game_config';
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedConfig {
  data: GameConfig;
  timestamp: number;
  version: number;
}

function getCachedConfig(): GameConfig | null {
  try {
    const cached = localStorage.getItem(CONFIG_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as CachedConfig;
    if (Date.now() - parsed.timestamp > CONFIG_CACHE_TTL) {
      localStorage.removeItem(CONFIG_CACHE_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setCachedConfig(config: GameConfig): void {
  try {
    const cached: CachedConfig = {
      data: config,
      timestamp: Date.now(),
      version: configVersion + 1,
    };
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

// Fallback config — minimal, since configCache already has data.ts defaults
function createFallbackConfig(): GameConfig {
  return {
    buildings: {},
    resources: {},
    research: [],
    market: [],
    weather: {},
    workers: [],
    transport: [],
    automation: [],
    prestigeBonuses: [],
    rankThresholds: [],
    quests: [],
    dailyRewards: [],
    eventTemplates: [],
    seasonalEvents: [],
    megaProjects: [],
    gameConfig: {},
    balancingRules: [],
    productionChains: [],
    loadedAt: Date.now(),
    source: 'fallback',
  };
}

interface GameConfigState {
  config: GameConfig;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  isUsingSupabase: boolean;
  lastUpdated: number | null;
}

const GameConfigContext = createContext<GameConfigState>({
  config: createFallbackConfig(),
  loading: true,
  error: null,
  reload: async () => {},
  isUsingSupabase: false,
  lastUpdated: null,
});

export function useGameConfig() {
  return useContext(GameConfigContext);
}

export function GameConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<GameConfig>(createFallbackConfig());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Try localStorage cache first (instant load)
      const cachedConfig = getCachedConfig();
      if (cachedConfig && cachedConfig.source === 'supabase') {
        updateFromSupabase(cachedConfig);
        setConfig(cachedConfig);
        setLastUpdated(cachedConfig.loadedAt);
        setLoading(false);
        console.log('[GameConfigProvider] Loaded from cache:', Object.keys(cachedConfig.buildings).length, 'buildings');

        // Still fetch fresh data in background (stale-while-revalidate)
        fetchFreshConfig().then(freshConfig => {
          if (freshConfig) {
            updateFromSupabase(freshConfig);
            setConfig(freshConfig);
            setLastUpdated(Date.now());
            setCachedConfig(freshConfig);
          }
        }).catch(() => {});
        return;
      }

      // 2. No cache — fetch from API
      const freshConfig = await fetchFreshConfig();
      if (freshConfig) {
        updateFromSupabase(freshConfig);
        setConfig(freshConfig);
        setLastUpdated(Date.now());
        setCachedConfig(freshConfig);
      } else {
        setConfig(createFallbackConfig());
      }
    } catch (err) {
      console.error('[GameConfigProvider] Error loading config:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setConfig(createFallbackConfig());
    } finally {
      setLoading(false);
    }
  }, []);

  async function fetchFreshConfig(): Promise<GameConfig | null> {
    try {
      // Try the new /api/game/definitions endpoint first (processed config)
      const defsRes = await fetch('/api/game/definitions');
      if (defsRes.ok) {
        const defsData = await defsRes.json();
        if (defsData.buildings && Object.keys(defsData.buildings).length > 0) {
          const supabaseConfig: GameConfig = {
            buildings: defsData.buildings || {},
            resources: defsData.resources || {},
            research: defsData.research || [],
            market: defsData.market || [],
            weather: defsData.weather || {},
            workers: defsData.workers || [],
            transport: defsData.transport || [],
            automation: defsData.automation || [],
            prestigeBonuses: defsData.prestigeBonuses || [],
            rankThresholds: defsData.rankThresholds || [],
            quests: defsData.quests || [],
            dailyRewards: defsData.dailyRewards || [],
            eventTemplates: defsData.eventTemplates || [],
            seasonalEvents: defsData.seasonalEvents || [],
            megaProjects: defsData.megaProjects || [],
            gameConfig: defsData.gameConfig || {},
            balancingRules: defsData.balancingRules || [],
            productionChains: defsData.productionChains || [],
            loadedAt: Date.now(),
            source: 'supabase',
          };
          console.log('[GameConfigProvider] Fetched fresh config:', Object.keys(defsData.buildings).length, 'buildings');
          return supabaseConfig;
        }
      }

      // Fallback: try the old /api/config endpoint
      const supabaseConfig = await fetchGameConfig();
      if (supabaseConfig) {
        return supabaseConfig;
      }

      return null;
    } catch (err) {
      console.error('[GameConfigProvider] Fresh fetch error:', err);
      return null;
    }
  }

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const isUsingSupabase = config.source === 'supabase';

  return (
    <GameConfigContext.Provider value={{ config, loading, error, reload: loadConfig, isUsingSupabase, lastUpdated }}>
      {children}
    </GameConfigContext.Provider>
  );
}
