'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchGameConfig, GameConfig } from '@/lib/game/config';
import { updateFromSupabase, configSource, configVersion } from '@/lib/game/configCache';

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
      // Try the new /api/game/definitions endpoint first (processed config)
      const defsRes = await fetch('/api/game/definitions');
      if (defsRes.ok) {
        const defsData = await defsRes.json();
        if (defsData.buildings && Object.keys(defsData.buildings).length > 0) {
          // Build a GameConfig from the processed definitions response
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

          // Update the configCache (which feeds store.ts and all panels)
          updateFromSupabase(supabaseConfig);

          setConfig(supabaseConfig);
          setLastUpdated(Date.now());
          console.log('[GameConfigProvider] Loaded from /api/game/definitions:', Object.keys(defsData.buildings).length, 'buildings');
          return;
        }
      }

      // Fallback: try the old /api/config endpoint
      const supabaseConfig = await fetchGameConfig();
      if (supabaseConfig) {
        // Update the configCache with Supabase data
        updateFromSupabase(supabaseConfig);
        setConfig(supabaseConfig);
        setLastUpdated(Date.now());
      } else {
        // Use fallback — configCache already has data.ts defaults
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
