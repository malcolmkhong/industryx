'use client';

import { useCallback, useRef } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGameStore } from '@/lib/game/store';

interface CloudSyncState {
  saveToCloud: () => Promise<{ success: boolean; error?: string }>;
  loadFromCloud: () => Promise<{ success: boolean; data?: unknown; error?: string; isNew?: boolean }>;
  lastSyncAt: number | null;
  isSyncing: boolean;
}

export function useCloudSync(): CloudSyncState {
  const { user } = useAuth();
  const isSyncing = useRef(false);
  const lastSyncAt = useRef<number | null>(null);

  const saveToCloud = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not authenticated' };
    if (isSyncing.current) return { success: false, error: 'Already syncing' };

    isSyncing.current = true;
    try {
      const state = useGameStore.getState();
      const gameState = {
        money: state.money,
        totalMoneyEarned: state.totalMoneyEarned,
        gameTick: state.gameTick,
        buildings: state.buildings,
        resources: state.resources,
        resourceCapacity: state.resourceCapacity,
        transportLines: state.transportLines,
        powerGrid: state.powerGrid,
        researchPoints: state.researchPoints,
        completedResearch: state.completedResearch,
        activeResearch: state.activeResearch,
        researchProgress: state.researchProgress,
        workers: state.workers,
        market: state.market,
        contracts: state.contracts,
        completedContracts: state.completedContracts,
        automationUnlocks: state.automationUnlocks,
        prestigeState: state.prestigeState,
        activeEvents: state.activeEvents,
        stats: state.stats,
        megaProjects: state.megaProjects,
        blueprints: state.blueprints,
        autoSellResources: state.autoSellResources,
        storageUpgradeLevels: state.storageUpgradeLevels,
        lastOnlineTimestamp: state.lastOnlineTimestamp,
        loginStreak: state.loginStreak,
        weather: state.weather,
        quests: state.quests,
        payoutConfig: state.payoutConfig,
        pendingPayout: state.pendingPayout,
        payoutHistory: state.payoutHistory,
        trackedQuest: state.trackedQuest,
        drones: state.drones,
        notifications: state.notifications,
        gameSpeed: state.gameSpeed,
        paused: state.paused,
      };

      const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Commander';

      const res = await fetch('/api/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, gameState, displayName }),
      });

      const data = await res.json();
      if (data.saved) {
        lastSyncAt.current = Date.now();
        return { success: true };
      }
      return { success: false, error: data.error || 'Save failed' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    } finally {
      isSyncing.current = false;
    }
  }, [user]);

  const loadFromCloud = useCallback(async (): Promise<{ success: boolean; data?: unknown; error?: string; isNew?: boolean }> => {
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
      const res = await fetch(`/api/player?userId=${user.id}`);
      const data = await res.json();

      if (data.isNew) {
        return { success: true, isNew: true };
      }

      if (data.data?.game_state) {
        lastSyncAt.current = Date.now();
        return { success: true, data: data.data.game_state };
      }

      return { success: false, error: 'No game state found' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }, [user]);

  return {
    saveToCloud,
    loadFromCloud,
    lastSyncAt: lastSyncAt.current,
    isSyncing: isSyncing.current,
  };
}
