'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchGameConfig, GameConfig } from '@/lib/game/config';
import { BUILDING_DEFS, RESOURCE_META, WEATHER_DEFS } from '@/lib/game/data';

// Fallback config built from hardcoded data
function createFallbackConfig(): GameConfig {
  return {
    buildings: BUILDING_DEFS,
    resources: Object.fromEntries(
      Object.entries(RESOURCE_META).map(([key, val]) => [key, { ...val, category: '' }])
    ),
    research: [],
    market: [],
    weather: Object.fromEntries(
      Object.entries(WEATHER_DEFS).map(([key, val]) => [key, val])
    ),
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
      const supabaseConfig = await fetchGameConfig();
      if (supabaseConfig) {
        // Merge Supabase config with fallback for missing data
        const merged: GameConfig = {
          ...createFallbackConfig(),
          ...supabaseConfig,
          // For buildings, prefer Supabase but keep fallback entries not in Supabase
          buildings: { ...BUILDING_DEFS, ...supabaseConfig.buildings },
          // Same for resources
          resources: {
            ...Object.fromEntries(
              Object.entries(RESOURCE_META).map(([key, val]) => [key, { ...val, category: '' }])
            ),
            ...supabaseConfig.resources,
          },
          // Same for weather
          weather: { ...WEATHER_DEFS, ...supabaseConfig.weather },
        };
        setConfig(merged);
        setLastUpdated(Date.now());
      } else {
        // Use fallback
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
