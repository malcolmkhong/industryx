'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { useGameStore, formatNumber, getBuildingCost, isBuildingUnlocked } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, RESEARCH_TREE, RANK_THRESHOLDS, WEATHER_DEFS } from '@/lib/game/configCache';
import { PanelStatCard } from '@/components/game/shared/PanelStatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Factory, Users, Zap, TrendingUp, AlertTriangle, FlaskConical,
  Activity, Pickaxe, Cog, Shield, Clock, Bell,
  ArrowUpRight, ArrowDownRight, Minus, Timer, Power, Sparkles,
  Database, Wrench, Globe, ArrowRight, Trophy, Package,
  Hammer, CheckCircle2, XCircle, Flame, CloudSun, Pin, X as XIcon,
  Gauge, Wallet, BarChart3, CircleDot, DollarSign, Gem, Crown, Star
} from 'lucide-react';
import { BuildingType, ResourceType, WeatherType } from '@/lib/game/types';
import { motion, AnimatePresence } from 'framer-motion';
import { ProductionChainPanel } from '@/components/game/ProductionChainPanel';
import { GameIcon } from '@/components/game/shared/GameIcon';

export function DashboardPanel() {
  // H1 FIX: Use specific selectors instead of full-store subscription.
  // Each useGameStore((s) => s.X) creates a subscription that only re-renders
  // when that specific slice changes. This eliminates the "10-100 rerenders/sec"
  // class of full-store subscription and is the highest-impact render fix.
  const buildings = useGameStore((s) => s.buildings);
  const resources = useGameStore((s) => s.resources);
  const resourceCapacity = useGameStore((s) => s.resourceCapacity);
  const money = useGameStore((s) => s.money);
  const totalMoneyEarned = useGameStore((s) => s.totalMoneyEarned);
  const powerGrid = useGameStore((s) => s.powerGrid);
  const researchPoints = useGameStore((s) => s.researchPoints);
  const completedResearch = useGameStore((s) => s.completedResearch);
  const prestigeState = useGameStore((s) => s.prestigeState);
  const workers = useGameStore((s) => s.workers);
  const productionSnapshot = useGameStore((s) => s.productionSnapshot);
  const gameTick = useGameStore((s) => s.gameTick);
  const activeResearch = useGameStore((s) => s.activeResearch);
  const researchProgress = useGameStore((s) => s.researchProgress);
  const notifications = useGameStore((s) => s.notifications);
  const loginStreak = useGameStore((s) => s.loginStreak);
  const quests = useGameStore((s) => s.quests);
  const trackedQuest = useGameStore((s) => s.trackedQuest);
  const activeEvents = useGameStore((s) => s.activeEvents);
  const weather = useGameStore((s) => s.weather);
  const stats = useGameStore((s) => s.stats);
  const buildBuilding = useGameStore((s) => s.buildBuilding);
  const clearNotifications = useGameStore((s) => s.clearNotifications);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const setTrackedQuest = useGameStore((s) => s.setTrackedQuest);
  const getCurrentRank = useGameStore((s) => s.getCurrentRank);

  // Computed values
  const totalBuildings = buildings.length;
  const activeBuildings = buildings.filter(b => b.active).length;
  const totalWorkers = workers.length;
  const assignedWorkers = workers.filter(w => w.assignedTo).length;
  const workerEfficiency = totalWorkers > 0
    ? workers.reduce((s, w) => s + w.efficiency, 0) / totalWorkers
    : 0;

  const powerPercent = powerGrid.totalConsumption > 0
    ? Math.min(100, (powerGrid.totalProduction / powerGrid.totalConsumption) * 100)
    : powerGrid.totalProduction > 0 ? 100 : 0;

  const powerSurplus = powerGrid.totalProduction - powerGrid.totalConsumption;

  // Top resources by value
  // L3 FIX: include all tiers (Tier 0-5) so finished/refined products are visible,
  // not just raw materials. Sort by amount to surface the most-stocked items.
  const topResources = useMemo(() => {
    return (Object.keys(resources) as ResourceType[])
      .map(r => ({
        resource: r,
        amount: resources[r],
        capacity: resourceCapacity[r],
        meta: RESOURCE_META[r],
      }))
      .filter(r => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [resources, resourceCapacity]);

  // Production rates — use store's computed rates which include all bonuses
  // (mega project, prestige, research, worker, event, weather, etc.)
  const productionRates = productionSnapshot.production;

  // Production rate summary items
  const topProductionRates = useMemo(() => {
    return (Object.entries(productionRates) as [ResourceType, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [productionRates]);

  // Category counts
  const extractorCount = buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor').length;
  const factoryCount = buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory').length;
  const powerCount = buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power').length;

  // Active research info
  const activeResearchInfo = useMemo(() => {
    if (!activeResearch) return null;
    const node = RESEARCH_TREE.find(r => r.id === activeResearch);
    if (!node) return null;
    return {
      name: node.name,
      icon: node.icon,
      progress: Math.min(100, (researchProgress / node.timeRequired) * 100),
      timeRequired: node.timeRequired,
    };
  }, [activeResearch, researchProgress]);

  // Recent notifications (last 5)
  const recentNotifications = notifications.slice(0, 5);

  // Activity Feed - last 8 game events from notifications
  const activityFeed = useMemo(() => {
    return notifications.slice(0, 8).map(n => ({
      ...n,
      icon: n.type === 'success' ? 'lucide:check-circle-2' :
            n.type === 'warning' ? 'lucide:alert-triangle' :
            n.type === 'error' ? 'lucide:x-circle' :
            'lucide:bell',
    }));
  }, [notifications]);

  // RP accumulation rate
  // M4 FIX: use productionSnapshot.researchPointsPerTick (includes all bonuses:
  // prestige, research, weather, events, workers) instead of a hardcoded formula
  // that only counted aiLab buildings.
  const rpPerTick = useMemo(() => {
    return productionSnapshot.researchPointsPerTick || 0;
  }, [productionSnapshot.researchPointsPerTick]);

  // Quick build options
  const quickBuildTypes: BuildingType[] = ['ironMine', 'waterExtractor', 'coalGenerator', 'smelter'];

  const handleBuild = (type: BuildingType) => {
    buildBuilding(type);
  };

  // Check if there's an unclaimed daily reward
  const hasUnclaimedDailyReward = useMemo(() => {
    const ls = loginStreak;
    if (!ls.lastLoginDate) return false;
    const currentDay = ((ls.currentStreak - 1) % 7) + 1;
    return ls.weeklyRewards.some(r => r.day === currentDay && !r.claimed);
  }, [loginStreak]);

  // Empire Score calculation
  const empireScore = useMemo(() => {
    return Math.floor(
      totalBuildings * 10 +
      activeBuildings * 20 +
      completedResearch.length * 50 +
      money / 1000 +
      totalMoneyEarned / 10000
    );
  }, [totalBuildings, activeBuildings, completedResearch.length, money, totalMoneyEarned]);

  // Empire tier info
  const empireTier = useMemo(() => {
    if (empireScore >= 50000) return { name: 'Diamond', color: '#b9f2ff', bgColor: 'bg-cyan-100', borderColor: 'border-brand', textColor: 'text-cyan-200', icon: <Gem className="w-4 h-4" />, nextThreshold: null, progress: 1 };
    if (empireScore >= 10000) return { name: 'Platinum', color: '#e5e4e2', bgColor: 'bg-gray-200', borderColor: 'border-gray-400', textColor: 'text-subtle', icon: <Crown className="w-4 h-4" />, nextThreshold: 50000, progress: (empireScore - 10000) / 40000 };
    if (empireScore >= 2000) return { name: 'Gold', color: '#ffd700', bgColor: 'bg-warning', borderColor: 'border-warning', textColor: 'text-warning', icon: <Trophy className="w-4 h-4" />, nextThreshold: 10000, progress: (empireScore - 2000) / 8000 };
    if (empireScore >= 500) return { name: 'Silver', color: '#c0c0c0', bgColor: 'bg-gray-400', borderColor: 'border-muted-label', textColor: 'text-subtle', icon: <Star className="w-4 h-4" />, nextThreshold: 2000, progress: (empireScore - 500) / 1500 };
    return { name: 'Bronze', color: '#cd7f32', bgColor: 'bg-amber-600', borderColor: 'border-amber-600', textColor: 'text-warning', icon: <Shield className="w-4 h-4" />, nextThreshold: 500, progress: empireScore / 500 };
  }, [empireScore]);

  // Economy summary values
  const economySummary = useMemo(() => {
    const payoutPerCycle = productionSnapshot.payoutPerCycle || 0;
    const netIncomePerMin = payoutPerCycle * 6; // 6 cycles per minute (tick every 10s)
    
    // Total assets: sum of resources * estimated value (tier-based pricing)
    const resourceValues: Record<number, number> = { 0: 1, 1: 5, 2: 20, 3: 100 };
    let totalAssetsValue = money;
    for (const [res, amount] of Object.entries(resources)) {
      const meta = RESOURCE_META[res as ResourceType];
      if (meta && amount > 0) {
        const valuePerUnit = resourceValues[meta.tier] || 1;
        totalAssetsValue += amount * valuePerUnit;
      }
    }
    
    // Storage utilization - weighted by tier cap so high-tier resources
    // (which have larger storage upgrades) count proportionally more.
    // M5 FIX: weight by (tier + 1) so tier-3 resources count 4x more than tier-0.
    let totalStored = 0;
    let totalCapacity = 0;
    for (const res of Object.keys(resources) as ResourceType[]) {
      const meta = RESOURCE_META[res];
      const tierWeight = (meta?.tier ?? 0) + 1;
      totalStored += (resources[res] || 0) * tierWeight;
      totalCapacity += (resourceCapacity[res] || 0) * tierWeight;
    }
    const storageUtilization = totalCapacity > 0 ? (totalStored / totalCapacity) * 100 : 0;
    
    return { netIncomePerMin, totalAssetsValue, storageUtilization };
  }, [productionSnapshot.payoutPerCycle, money, resources, resourceCapacity]);

  return (
    <div className="space-y-4">
      {/* DAILY REWARD AVAILABLE BANNER */}
      {hasUnclaimedDailyReward && (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, type: 'spring' }}
          onClick={() => setActiveTab('dailyRewards')}
          className="w-full bg-gradient-to-r from-pink-900/25 via-purple-900/20 to-fuchsia-900/25 border border-premium/30 rounded-xl p-3 flex items-center justify-between group hover:border-pink-400/50 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <GameIcon icon="gi:present" size={24} className="animate-bounce" />
            <div className="text-left">
              <p className="text-sm font-bold text-premium group-hover:text-pink-200 transition-colors">Daily Reward Available!</p>
              <p className="text-[10px] text-subtle">Click to claim your daily login bonus</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-premium/70 uppercase tracking-wider font-semibold">Day {((loginStreak.currentStreak - 1) % 7) + 1}</span>
            <ArrowRight className="w-4 h-4 text-premium/50 group-hover:text-premium group-hover:translate-x-0.5 transition-all" />
          </div>
        </motion.button>
      )}

      {/* RANK BAR */}
      <RankBar />

      {/* EMPIRE SCORE CARD */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="game-card rounded-xl bg-card p-4 border border-border relative overflow-hidden"
        style={{ borderColor: `${empireTier.color}30` }}
      >
        <div className="absolute inset-0 opacity-[0.03]" style={{ background: `radial-gradient(ellipse at 30% 50%, ${empireTier.color}, transparent 70%)` }} />
        <div className="relative z-10 flex items-center gap-4">
          {/* Tier icon */}
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center border"
            style={{
              borderColor: `${empireTier.color}44`,
              backgroundColor: `${empireTier.color}15`,
              boxShadow: `0 0 24px ${empireTier.color}20`,
            }}
          >
            <div className="flex flex-col items-center">
              <div style={{ color: empireTier.color }}>{empireTier.icon}</div>
              <span className="text-[8px] font-bold mt-0.5" style={{ color: empireTier.color }}>{empireTier.name}</span>
            </div>
          </div>
          {/* Score info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-subtle">Empire Score</h3>
              <Badge
                variant="outline"
                className="text-[9px] font-bold"
                style={{
                  borderColor: `${empireTier.color}55`,
                  color: empireTier.color,
                  backgroundColor: `${empireTier.color}15`,
                }}
              >
                {empireTier.name}
              </Badge>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold font-mono" style={{ color: empireTier.color }}>
                {formatNumber(empireScore)}
              </span>
              <span className="text-[10px] text-muted-label">points</span>
            </div>
            {/* Progress bar to next tier */}
            {empireTier.nextThreshold !== null ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-label">Next: {empireTier.name === 'Bronze' ? 'Silver' : empireTier.name === 'Silver' ? 'Gold' : empireTier.name === 'Gold' ? 'Platinum' : 'Diamond'}</span>
                  <span className="text-[10px] font-mono" style={{ color: empireTier.color }}>
                    {formatNumber(empireTier.nextThreshold - empireScore)} pts to go
                  </span>
                </div>
                <div className="h-2 bg-muted-label rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: empireTier.color,
                      boxShadow: `0 0 8px ${empireTier.color}66`,
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, empireTier.progress * 100)}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: empireTier.color }}>MAX TIER ACHIEVED</span>
                <Sparkles className="w-3.5 h-3.5" style={{ color: empireTier.color }} />
              </div>
            )}
          </div>
          {/* Score breakdown mini-stats */}
          <div className="hidden md:flex flex-col gap-1 text-[10px]">
            <div className="flex items-center gap-1.5 text-muted-label">
              <Factory className="w-3 h-3" />
              <span>{totalBuildings}×10</span>
              <span className="text-subtle font-mono">= {totalBuildings * 10}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-label">
              <Activity className="w-3 h-3" />
              <span>{activeBuildings}×20</span>
              <span className="text-subtle font-mono">= {activeBuildings * 20}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-label">
              <FlaskConical className="w-3 h-3" />
              <span>{completedResearch.length}×50</span>
              <span className="text-subtle font-mono">= {completedResearch.length * 50}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* TRACKED QUEST INDICATOR */}
      {trackedQuest && (() => {
        const trackedQuestData = quests.find(q => q.id === trackedQuest);
        if (!trackedQuestData || trackedQuestData.claimed) return null;
        const tProgress = trackedQuestData.steps.length > 0 
          ? trackedQuestData.steps.reduce((sum, s) => sum + Math.min(1, s.current / Math.max(1, s.target)), 0) / trackedQuestData.steps.length 
          : 0;
        const currentStep = trackedQuestData.steps.find(s => !s.completed);
        return (
          <motion.div
            className="bg-gradient-to-r from-cyan-900/15 to-teal-900/10 border border-brand/25 rounded-xl p-3"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Pin className="w-3 h-3 text-brand" />
                <span className="text-[10px] text-brand uppercase tracking-wider font-semibold">Tracked Quest</span>
              </div>
              <button
                onClick={() => setTrackedQuest(null)}
                className="text-muted-label hover:text-subtle p-0.5 rounded hover:bg-muted-label/50 transition-colors"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              <GameIcon icon={trackedQuestData.icon} size={20} className="inline-flex" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-subtle font-medium truncate">{trackedQuestData.name}</p>
                {currentStep && (
                  <p className="text-[10px] text-muted-label truncate">{currentStep.description}: {Math.min(currentStep.current, currentStep.target)}/{currentStep.target}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] text-brand font-mono">{Math.round(tProgress * 100)}%</div>
                <div className="w-16 h-1 bg-muted-label rounded-full overflow-hidden mt-0.5">
                  <div className="h-full bg-brand rounded-full" style={{ width: `${tProgress * 100}%` }} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-[9px]">
              {trackedQuestData.reward.money > 0 && <span className="text-success"><GameIcon icon="gi:money-stack" size={14} className="inline" /> ${formatNumber(trackedQuestData.reward.money)}</span>}
              {trackedQuestData.reward.researchPoints && trackedQuestData.reward.researchPoints > 0 && <span className="text-research"><GameIcon icon="gi:magnifying-glass" size={14} className="inline" /> {trackedQuestData.reward.researchPoints}RP</span>}
              {trackedQuestData.reward.corporationPoints && trackedQuestData.reward.corporationPoints > 0 && <span className="text-premium"><GameIcon icon="gi:briefcase" size={14} className="inline" /> {trackedQuestData.reward.corporationPoints}CP</span>}
            </div>
          </motion.div>
        );
      })()}

      {/* GET STARTED CARD - only show when no buildings */}
      {totalBuildings === 0 && (
        <div className="relative rounded-xl p-8 text-center border border-brand/20 bg-gradient-to-br from-cyan-900/15 via-[#111827] to-teal-900/10 overflow-hidden">
          {/* Radial gradient overlay for visual depth */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,242,0.06)_0%,transparent_70%)]" />
          {/* Animated diagonal line pattern background */}
          <div className="absolute inset-0 overflow-hidden opacity-[0.03]">
            <motion.div
              className="absolute inset-0"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  -45deg,
                  transparent,
                  transparent 8px,
                  rgba(0,255,242,0.4) 8px,
                  rgba(0,255,242,0.4) 9px
                )`,
                backgroundSize: '20px 20px',
              }}
              animate={{ backgroundPositionX: ['0px', '28px'] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            />
          </div>
          {/* Decorative background elements */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-4 left-8"><GameIcon icon="gi:mining" size={48} /></div>
            <div className="absolute bottom-4 right-8"><GameIcon icon="gi:factory" size={48} /></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"><GameIcon icon="gi:castle" size={64} /></div>
          </div>
          <div className="relative z-10">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="mb-4"><GameIcon icon="gi:castle" size={48} /></div>
            </motion.div>
            <h3 className="text-xl font-bold text-brand neon-glow-cyan mb-2">Build Your First Factory!</h3>
            <p className="text-sm text-subtle mb-6 max-w-md mx-auto">
              Start by building a Coal Generator to power your empire, then add Mining Drills to extract resources.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <motion.div
                animate={{ boxShadow: ['0 0 0px rgba(234,179,8,0)', '0 0 16px rgba(234,179,8,0.4)', '0 0 0px rgba(234,179,8,0)'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="rounded-md"
              >
                <Button
                  className="bg-yellow-600 hover:bg-warning text-white font-semibold px-5 py-2.5 text-xs"
                  onClick={() => setActiveTab('power')}
                >
                  <Zap className="w-4 h-4 mr-1.5" />
                  Build Power First
                </Button>
              </motion.div>
              <motion.div
                animate={{ boxShadow: ['0 0 0px rgba(6,182,212,0)', '0 0 16px rgba(6,182,212,0.4)', '0 0 0px rgba(6,182,212,0)'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                className="rounded-md"
              >
                <Button
                  className="bg-brand hover:bg-brand text-white font-semibold px-5 py-2.5 text-xs"
                  onClick={() => setActiveTab('resources')}
                >
                  <Pickaxe className="w-4 h-4 mr-1.5" />
                  Go to Extraction
                </Button>
              </motion.div>
            </div>
            <div className="mt-6 flex items-center justify-center gap-4 text-[10px] text-muted-label">
              <motion.div
                className="flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2"
                whileHover={{ scale: 1.05, borderColor: 'rgba(234,179,8,0.5)' }}
              >
                <span className="w-5 h-5 rounded-full bg-yellow-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                <span className="text-warning font-medium">Build Power</span>
              </motion.div>
              <ArrowRight className="w-3 h-3 text-dim" />
              <motion.div
                className="flex items-center gap-2 bg-brand/20 border border-brand/30 rounded-lg px-3 py-2"
                whileHover={{ scale: 1.05, borderColor: 'rgba(6,182,212,0.5)' }}
              >
                <span className="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center text-[10px] font-bold">2</span>
                <span className="text-brand font-medium">Build Drills</span>
              </motion.div>
              <ArrowRight className="w-3 h-3 text-dim" />
              <motion.div
                className="flex items-center gap-2 bg-domain/20 border border-domain/30 rounded-lg px-3 py-2"
                whileHover={{ scale: 1.05, borderColor: 'rgba(249,115,22,0.5)' }}
              >
                <span className="w-5 h-5 rounded-full bg-domain text-white flex items-center justify-center text-[10px] font-bold">3</span>
                <span className="text-domain font-medium">Build Factories</span>
              </motion.div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-xl font-bold text-brand neon-glow-cyan tracking-wide flex items-center gap-2">Factory Overview
              {activeBuildings > 0 && (
                <motion.span
                  className="inline-flex items-center gap-1"
                >
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
                  </span>
                  <span className="text-[9px] text-success/70 font-normal tracking-normal">RUNNING</span>
                </motion.span>
              )}
            </h2>
            <p className="text-xs text-muted-label mt-0.5">Command center for your industrial empire</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeEvents.length > 0 && (
            <Badge variant="outline" className="border-domain/50 text-domain bg-domain/20 text-xs neon-pulse">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {activeEvents.length} Event{activeEvents.length > 1 ? 's' : ''}
            </Badge>
          )}
          {powerGrid.overload && (
            <Badge variant="outline" className="border-danger/50 text-danger bg-danger/20 text-xs" style={{ animation: 'breathe-glow 2s ease-in-out infinite' }}>
              <Zap className="w-3 h-3 mr-1" />
              POWER OVERLOAD
            </Badge>
          )}
        </div>
      </div>

      {/* TOP STATS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <motion.div
            key={i}
          >
            {i === 0 && <PanelStatCard
              icon={<Factory className="w-4 h-4" />}
              label="Buildings"
              value={totalBuildings.toString()}
              subtext={totalBuildings === 0 ? 'None built yet' : `${activeBuildings} active of ${totalBuildings} built`}
              color="cyan"
              trend={stats.factoriesBuilt > 0 ? 'up' : 'neutral'}
            />}
            {i === 1 && <PanelStatCard
              icon={<Users className="w-4 h-4" />}
              label="Workers"
              value={totalWorkers.toString()}
              subtext={totalWorkers === 0 ? 'No workers yet' : `${assignedWorkers} assigned of ${totalWorkers} hired`}
              color="green"
              trend={workerEfficiency >= 1 ? 'up' : workerEfficiency > 0 ? 'neutral' : 'down'}
            />}
            {i === 2 && <EfficiencyRing
              efficiency={powerGrid.totalProduction === 0 && powerGrid.totalConsumption === 0 ? -1 : powerGrid.efficiency}
              overload={powerGrid.overload}
            />}
            {i === 3 && <PanelStatCard
              icon={<FlaskConical className="w-4 h-4" />}
              label="Research"
              value={completedResearch.length.toString()}
              subtext={`${formatNumber(researchPoints)} RP`}
              color="purple"
              trend={rpPerTick > 0.1 ? 'up' : 'neutral'}
            />}
          </motion.div>
        ))}
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4">
          {/* POWER GRID STATUS */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-warning" />
                <h3 className="text-sm font-semibold text-warning">Power Grid</h3>
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  powerGrid.totalProduction === 0 && powerGrid.totalConsumption === 0
                    ? 'border-muted-label/50 text-subtle bg-muted-label/20'
                    : powerSurplus >= 0
                      ? 'border-success/50 text-success bg-success/20'
                      : 'border-danger/50 text-danger bg-danger/20'
                }`}
              >
                {powerGrid.totalProduction === 0 && powerGrid.totalConsumption === 0 ? (
                  <>NO GRID</>
                ) : powerSurplus >= 0 ? (
                  <><ArrowUpRight className="w-2.5 h-2.5 mr-0.5" /> SURPLUS</>
                ) : (
                  <><ArrowDownRight className="w-2.5 h-2.5 mr-0.5" /> DEFICIT</>
                )}
              </Badge>
            </div>

            {/* No Power Grid State */}
            {powerGrid.totalProduction === 0 && powerGrid.totalConsumption === 0 ? (
              <div className="text-center py-4">
                <div className="mb-2"><GameIcon icon="gi:lightning-frequency" size={28} /></div>
                <p className="text-sm text-subtle font-medium mb-1">NO POWER GRID</p>
                <p className="text-xs text-muted-label mb-3">Build a Coal Generator or Solar Panel to start generating power</p>
                <Button
                  className="glow-button-cyan bg-yellow-600 hover:bg-warning text-white text-xs font-semibold px-4 py-1.5"
                  onClick={() => setActiveTab('power')}
                >
                  <Zap className="w-3 h-3 mr-1" />
                  Go to Power
                </Button>
              </div>
            ) : (
            <>
            {/* Power Gauge */}
            <div className="relative mb-3">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-subtle">
                  <span className="text-success font-mono font-bold">{formatNumber(powerGrid.totalProduction)}</span> MW production
                </span>
                <span className="text-subtle">
                  <span className="text-domain font-mono font-bold">{formatNumber(powerGrid.totalConsumption)}</span> MW demand
                </span>
              </div>
              <div className="h-4 bg-muted-label rounded-full overflow-hidden relative">
                <div
                  className="absolute inset-y-0 left-0 bg-domain/30 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, (powerGrid.totalConsumption / Math.max(1, powerGrid.totalProduction)) * 100)}%` }}
                />
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                    powerPercent >= 80 ? 'bg-gradient-to-r from-green-600 to-green-400' :
                    powerPercent >= 50 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' :
                    'bg-gradient-to-r from-red-600 to-red-400'
                  }`}
                  style={{ width: `${Math.min(100, powerPercent)}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                </div>
                <div className="absolute inset-0 overflow-hidden rounded-full">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[conveyorFlow_2s_linear_infinite]" />
                </div>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-label">
                  {powerSurplus >= 0 ? `+${formatNumber(powerSurplus)}` : formatNumber(powerSurplus)} MW net
                </span>
                <span className="text-[10px] text-muted-label">
                  {powerCount} power plant{powerCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Power breakdown mini-stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <PanelStatCard
                icon={<Gauge className="w-4 h-4" />}
                label="Efficiency"
                value={`${(powerGrid.efficiency * 100).toFixed(1)}%`}
                subtext="Current"
                color={powerGrid.efficiency >= 0.8 ? 'green' : powerGrid.efficiency >= 0.5 ? 'yellow' : 'red'}
                trend={powerGrid.efficiency >= 0.8 ? 'up' : powerGrid.efficiency >= 0.5 ? 'neutral' : 'down'}
              />
              <PanelStatCard
                icon={<TrendingUp className="w-4 h-4" />}
                label="Peak"
                value={`${(stats.peakEfficiency * 100).toFixed(1)}%`}
                subtext="All-time best"
                color="cyan"
              />
              <PanelStatCard
                icon={<Zap className="w-4 h-4" />}
                label="Load"
                value={`${powerPercent.toFixed(0)}%`}
                subtext="Utilization"
                color={powerPercent >= 80 ? 'green' : powerPercent >= 50 ? 'yellow' : 'red'}
              />
            </div>
            </>
            )}
          </div>

          {/* ECONOMY SUMMARY */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-success" />
                <h3 className="text-sm font-semibold text-success">Economy Summary</h3>
              </div>
              <span className="text-[10px] text-muted-label">financial overview</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Net Income */}
              <div className="bg-[#0a0e17] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-md bg-success/30 flex items-center justify-center">
                    <TrendingUp className="w-3.5 h-3.5 text-success" />
                  </div>
                  <span className="text-[10px] text-muted-label">Net Income</span>
                </div>
                <div className="text-sm font-bold font-mono text-success">
                  ${formatNumber(economySummary.netIncomePerMin)}/min
                </div>
                <div className="text-[9px] text-muted-label mt-0.5">
                  {economySummary.netIncomePerMin > 0 ? 'Profitable' : economySummary.netIncomePerMin === 0 ? 'No income' : 'Losing money'}
                </div>
              </div>
              {/* Total Assets */}
              <div className="bg-[#0a0e17] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-md bg-brand/30 flex items-center justify-center">
                    <Wallet className="w-3.5 h-3.5 text-brand" />
                  </div>
                  <span className="text-[10px] text-muted-label">Total Assets</span>
                </div>
                <div className="text-sm font-bold font-mono text-brand">
                  ${formatNumber(economySummary.totalAssetsValue)}
                </div>
                <div className="text-[9px] text-muted-label mt-0.5">
                  Cash: ${formatNumber(money)}
                </div>
              </div>
              {/* Storage Utilization */}
              <div className="bg-[#0a0e17] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-md bg-amber-900/30 flex items-center justify-center">
                    <BarChart3 className="w-3.5 h-3.5 text-warning" />
                  </div>
                  <span className="text-[10px] text-muted-label">Storage Used</span>
                </div>
                <div className={`text-sm font-bold font-mono ${
                  economySummary.storageUtilization > 90 ? 'text-danger' :
                  economySummary.storageUtilization > 70 ? 'text-domain' :
                  economySummary.storageUtilization > 50 ? 'text-warning' :
                  'text-success'
                }`}>
                  {economySummary.storageUtilization.toFixed(1)}%
                </div>
                <div className="h-1.5 bg-muted-label rounded-full overflow-hidden mt-1.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      economySummary.storageUtilization > 90 ? 'bg-danger' :
                      economySummary.storageUtilization > 70 ? 'bg-domain' :
                      'bg-success'
                    }`}
                    style={{ width: `${Math.min(100, economySummary.storageUtilization)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* TOP RESOURCES */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-semibold text-brand">Resource Storage</h3>
              </div>
              <span className="text-[10px] text-muted-label">{topResources.length} raw materials</span>
            </div>
            {/* Resource Overview Summary */}
            {(() => {
              const totalStored = topResources.reduce((sum, r) => sum + r.amount, 0);
              const totalCapacity = topResources.reduce((sum, r) => sum + r.capacity, 0);
              const overallPct = totalCapacity > 0 ? (totalStored / totalCapacity) * 100 : 0;
              return (
                <div className="mb-3 bg-[#0a0e17] rounded-lg p-3">
                  <div className="flex items-center justify-between text-[10px] mb-1.5">
                    <div className="flex items-center gap-3">
                      <span className="text-subtle">Total Stored: <span className="text-brand font-mono font-bold">{formatNumber(totalStored)}</span></span>
                      <span className="text-muted-label">|</span>
                      <span className="text-subtle">Capacity: <span className={`font-mono font-bold ${overallPct > 80 ? 'text-domain' : overallPct > 50 ? 'text-warning' : 'text-success'}`}>{overallPct.toFixed(1)}%</span></span>
                    </div>
                    <span className="text-muted-label font-mono">{formatNumber(totalStored)}/{formatNumber(totalCapacity)}</span>
                  </div>
                  <div className="h-2 bg-muted-label rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        overallPct > 90 ? 'bg-danger' :
                        overallPct > 70 ? 'bg-domain' :
                        overallPct > 50 ? 'bg-warning' :
                        'bg-gradient-to-r from-cyan-600 to-cyan-400'
                      }`}
                      style={{ width: `${Math.min(100, overallPct)}%` }}
                    />
                  </div>
                </div>
              );
            })()}
            <div className="space-y-2">
              {topResources.map(({ resource, amount, capacity, meta }) => {
                const pct = capacity > 0 ? (amount / capacity) * 100 : 0;
                const isLow = pct > 80;
                return (
                  <div key={resource} className="group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5">
                        <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                        <span className="text-subtle font-medium">{meta.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono ${isLow ? 'text-domain' : 'text-subtle'}`}>
                          {formatNumber(amount)}
                        </span>
                        <span className="text-muted-label">/</span>
                        <span className="text-muted-label font-mono text-[10px]">{formatNumber(capacity)}</span>
                        {productionRates[resource] > 0 && (
                          <span className="text-success/70 text-[10px]">
                            +{formatNumber(productionRates[resource])}/s
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted-label rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full resource-bar-premium resource-bar-animated transition-all duration-500 ${
                          pct > 90 ? 'bg-danger' :
                          pct > 70 ? 'bg-domain' :
                          'bg-gradient-to-r from-cyan-600 to-cyan-400'
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PRODUCTION RATE SUMMARY */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-success" />
                <h3 className="text-sm font-semibold text-success">Production Rates</h3>
              </div>
              <span className="text-[10px] text-muted-label">per second</span>
            </div>
            {topProductionRates.length === 0 ? (
              <div className="text-center py-6">
                <Cog className="w-8 h-8 text-dim mx-auto mb-2" />
                <p className="text-xs text-muted-label">No active production</p>
                <p className="text-[10px] text-muted-label mt-1">Build extractors and factories to start producing</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {topProductionRates.map(([resource, rate]) => {
                  const meta = RESOURCE_META[resource];
                  return (
                    <PanelStatCard
                      key={resource}
                      icon={<GameIcon icon={meta.icon} size={14} />}
                      label={meta.name}
                      value={`+${formatNumber(rate)}`}
                      subtext="per second"
                      color="green"
                      trend="up"
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* PRODUCTION CHAINS VISUALIZATION - SVG flow diagram with building details */}
          <ProductionChainPanel productionRates={productionRates} />

          {/* ACTIVITY FEED */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-semibold text-brand">Activity Feed</h3>
              </div>
              <span className="text-[10px] text-muted-label">Live events</span>
            </div>
            {activityFeed.length === 0 ? (
              <div className="text-center py-4">
                <Activity className="w-6 h-6 text-dim mx-auto mb-1.5" />
                <p className="text-xs text-muted-label">No recent activity</p>
                <p className="text-[10px] text-muted-label mt-0.5">Start building to see events here</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto game-scrollbar">
                <AnimatePresence initial={false}>
                  {activityFeed.map((entry, i) => (
                    <motion.div
                      key={entry.id}
                      className={`flex items-start gap-2 py-1.5 px-2 rounded text-[11px] border-l-2 ${
                        entry.type === 'success' ? 'text-success bg-success/5 border-l-green-500' :
                        entry.type === 'warning' ? 'text-warning bg-yellow-900/5 border-l-yellow-500' :
                        entry.type === 'error' ? 'text-danger bg-danger/5 border-l-red-500' :
                        'text-subtle bg-muted-label/5 border-l-gray-600'
                      }`}
                    >
                      <div className="flex-shrink-0 mt-0.5 text-current">
                        {entry.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {entry.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5" />}
                        {entry.type === 'error' && <XCircle className="w-3.5 h-3.5" />}
                        {entry.type === 'info' && <Bell className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="truncate block">{entry.message}</span>
                      </div>
                      <span className="text-[9px] text-muted-label flex-shrink-0 mt-0.5">
                        t:{entry.gameTick}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          {/* INCOME SPARKLINE CHART */}
          <IncomeChart productionRates={productionRates} />

          {/* BUILDING BREAKDOWN */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Factory className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-semibold text-brand">Building Breakdown</h3>
            </div>
            <div className="space-y-2">
              <BuildingCategoryRow
                icon={<Pickaxe className="w-3.5 h-3.5" />}
                label="Extractors"
                count={extractorCount}
                total={totalBuildings}
                color="text-warning"
                bgColor="bg-warning"
              />
              <BuildingCategoryRow
                icon={<Cog className="w-3.5 h-3.5" />}
                label="Factories"
                count={factoryCount}
                total={totalBuildings}
                color="text-domain"
                bgColor="bg-domain"
              />
              <BuildingCategoryRow
                icon={<Zap className="w-3.5 h-3.5" />}
                label="Power Plants"
                count={powerCount}
                total={totalBuildings}
                color="text-warning"
                bgColor="bg-warning"
              />
            </div>
          </div>

          {/* WEATHER INFO CARD */}
          <WeatherInfoCard />

          {/* ACTIVE RESEARCH */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical className="w-4 h-4 text-research" />
              <h3 className="text-sm font-semibold text-research">Active Research</h3>
            </div>
            {activeResearchInfo ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <GameIcon icon={activeResearchInfo.icon} size={20} className="inline-flex" />
                  <div>
                    <p className="text-xs text-subtle font-medium">{activeResearchInfo.name}</p>
                    <p className="text-[10px] text-muted-label">
                      <Timer className="w-2.5 h-2.5 inline mr-0.5" />
                      {formatNumber(researchProgress)} / {formatNumber(activeResearchInfo.timeRequired)} ticks
                    </p>
                  </div>
                </div>
                <div className="h-2 bg-muted-label rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-300"
                    style={{ width: `${activeResearchInfo.progress}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                  </div>
                </div>
                <div className="text-right mt-1">
                  <span className="text-[10px] text-research font-mono">{activeResearchInfo.progress.toFixed(1)}%</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <FlaskConical className="w-6 h-6 text-dim mx-auto mb-1.5" />
                <p className="text-xs text-muted-label">No active research</p>
                <p className="text-[10px] text-muted-label mt-0.5">Visit Research tab to start</p>
              </div>
            )}
          </div>

          {/* ACTIVE EVENTS TICKER */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-domain" />
              <h3 className="text-sm font-semibold text-domain">Active Events</h3>
            </div>
            {activeEvents.length === 0 ? (
              <div className="text-center py-4">
                <Shield className="w-6 h-6 text-dim mx-auto mb-1.5" />
                <p className="text-xs text-muted-label">No active events</p>
                <p className="text-[10px] text-muted-label mt-0.5">Events occur periodically</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto game-scrollbar">
                {activeEvents.map(event => (
                  <div key={event.id} className="bg-[#0a0e17] rounded-lg p-3 border border-domain/30">
                    <div className="flex items-center gap-2 mb-1">
                      <GameIcon icon={event.icon} size={14} className="inline-flex" />
                      <span className="text-xs text-domain font-medium">{event.name}</span>
                    </div>
                    <p className="text-[10px] text-subtle mb-1.5 line-clamp-2">{event.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-muted-label" />
                        <span className="text-[10px] text-muted-label">{event.remaining} ticks left</span>
                      </div>
                      <div className="h-1 w-16 bg-muted-label rounded-full overflow-hidden">
                        <div
                          className="h-full bg-domain rounded-full"
                          style={{ width: `${(event.remaining / event.duration) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RECENT NOTIFICATIONS */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-subtle" />
                <h3 className="text-sm font-semibold text-subtle">Notifications</h3>
              </div>
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] text-muted-label hover:text-subtle px-1"
                  onClick={clearNotifications}
                >
                  Clear
                </Button>
              )}
            </div>
            {recentNotifications.length === 0 ? (
              <div className="text-center py-3">
                <p className="text-xs text-muted-label">No notifications</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-36 overflow-y-auto game-scrollbar">
                {recentNotifications.map(n => (
                  <div
                    key={n.id}
                    className={`text-[11px] py-1.5 px-2 rounded ${
                      n.type === 'success' ? 'text-success bg-success/10' :
                      n.type === 'warning' ? 'text-warning bg-yellow-900/10' :
                      n.type === 'error' ? 'text-danger bg-danger/10' :
                      'text-subtle bg-muted-label/10'
                    }`}
                  >
                    {n.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* QUICK ACTIONS */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-semibold text-brand">Quick Build</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {quickBuildTypes.map(type => {
                const def = BUILDING_DEFS[type];
                if (!def) return null;
                const count = buildings.filter(b => b.type === type).length;
                const cost = getBuildingCost(type, count);
                const canAfford = money >= cost;
                const unlocked = isBuildingUnlocked(type, completedResearch, prestigeState);
                return (
                  <Button
                    key={type}
                    variant="outline"
                    size="sm"
                    className={`h-auto py-2 px-2 flex flex-col items-center gap-1 text-[10px] ${
                      !unlocked
                        ? 'border-muted-label text-muted-label opacity-50'
                        : canAfford
                          ? 'border-brand/50 text-brand hover:bg-brand/20 hover:border-brand/50'
                          : 'border-muted-label text-muted-label'
                    }`}
                    onClick={() => handleBuild(type)}
                    disabled={!canAfford || !unlocked}
                  >
                    <GameIcon icon={def.icon} size={16} />
                    <span className="font-medium">{def.name}</span>
                    <span className="text-[9px] text-muted-label">${formatNumber(cost)}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* PRESTIGE / GLOBAL STATS */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-premium" />
              <h3 className="text-sm font-semibold text-premium">Empire Stats</h3>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-label">Total Earned</span>
                <span className="text-success font-mono">${formatNumber(totalMoneyEarned)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-label">Peak Efficiency</span>
                <span className="text-brand font-mono">{(stats.peakEfficiency * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-label">Buildings Built</span>
                <span className="text-subtle font-mono">{stats.factoriesBuilt}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-label">Research Done</span>
                <span className="text-research font-mono">{stats.researchCompleted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-label">Contracts Done</span>
                <span className="text-danger font-mono">{stats.contractsCompleted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-label">Play Time</span>
                <span className="text-subtle font-mono">{formatNumber(stats.playTime)} ticks</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function BuildingCategoryRow({
  icon,
  label,
  count,
  total,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  total: number;
  color: string;
  bgColor: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <div className={`${color} w-5 flex-shrink-0`}>{icon}</div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs text-subtle">{label}</span>
          <span className="text-xs text-subtle font-mono">{count}</span>
        </div>
        <div className="h-1 bg-muted-label rounded-full overflow-hidden">
          <div
            className={`h-full ${bgColor} rounded-full transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// --- Rank Bar Component ---
function RankBar() {
  const getCurrentRank = useGameStore((s) => s.getCurrentRank);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const rank = getCurrentRank();

  return (
    <div
      className="game-card rounded-xl bg-card p-4 border border-border relative overflow-hidden"
      style={{ borderColor: `${rank.color}30` }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{ background: `radial-gradient(ellipse at 20% 50%, ${rank.color}, transparent 70%)` }}
      />

      <div className="relative z-10 flex items-center gap-4">
        {/* Rank emoji */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl border"
          style={{
            borderColor: `${rank.color}44`,
            backgroundColor: `${rank.color}15`,
            boxShadow: `0 0 20px ${rank.color}20`,
          }}
        >
          <GameIcon icon={rank.icon} size={24} />
        </div>

        {/* Rank info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-bold tracking-wide" style={{ color: rank.color }}>
              {rank.name}
            </h3>
            <span className="text-[10px] text-muted-label font-mono">
              Score: {formatNumber(rank.score)}
            </span>
          </div>

          {/* Progress bar to next rank */}
          {rank.nextRankScore !== null ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-label">
                  Next: <GameIcon icon={RANK_THRESHOLDS.find(r => r.minScore === rank.nextRankScore)?.icon} size={14} className="inline-flex" /> {RANK_THRESHOLDS.find(r => r.minScore === rank.nextRankScore)?.name}
                </span>
                <span className="text-[10px] font-mono" style={{ color: rank.color }}>
                  {formatNumber(rank.nextRankScore - rank.score)} pts to go
                </span>
              </div>
              <div className="h-2 bg-muted-label rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${rank.progress * 100}%`,
                    backgroundColor: rank.color,
                    boxShadow: `0 0 8px ${rank.color}66`,
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: rank.color }}>
                MAX RANK ACHIEVED
              </span>
              <Sparkles className="w-3.5 h-3.5" style={{ color: rank.color }} />
            </div>
          )}
        </div>

        {/* Quick storage upgrade button */}
        <div className="hidden sm:flex flex-col items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[10px] border-fuchsia-800/50 text-premium hover:bg-fuchsia-900/20"
            onClick={() => setActiveTab('resources')}
          >
            <Package className="w-3 h-3 mr-1" />
            Upgrade Storage
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Weather Info Card Component ---
function WeatherInfoCard() {
  const weather = useGameStore((s) => s.weather);
  const gameTickLocal = useGameStore((s) => s.gameTick);
  const currentWeather = weather.current as WeatherType;
  const weatherDef = WEATHER_DEFS[currentWeather];
  if (!weatherDef) return null;

  const ticksUntilChange = Math.max(0, weather.nextChange - gameTickLocal);
  const isEffectActive = currentWeather !== 'clear' && weather.remaining > 0;

  // Gradient backgrounds based on weather type
  const weatherGradients: Record<string, string> = {
    clear: 'from-slate-800/30 to-slate-900/20',
    sunny: 'from-yellow-900/25 to-orange-900/15',
    rainy: 'from-blue-900/25 to-slate-900/20',
    stormy: 'from-purple-900/30 to-slate-900/25',
    foggy: 'from-gray-700/25 to-gray-900/20',
    snowy: 'from-blue-200/10 to-indigo-900/15',
  };

  // Border colors based on weather
  const weatherBorders: Record<string, string> = {
    clear: 'border-slate-700/40',
    sunny: 'border-yellow-600/40',
    rainy: 'border-brand/40',
    stormy: 'border-research/40',
    foggy: 'border-muted-label/40',
    snowy: 'border-brand/30',
  };

  const prodEffect = weatherDef.productionMultiplier - 1;
  const solarEffect = weatherDef.solarMultiplier - 1;
  const windEffect = weatherDef.windMultiplier - 1;

  // Animated weather particles
  const renderWeatherParticles = () => {
    if (currentWeather === 'clear') return null;
    
    const particles = [];
    const count = currentWeather === 'stormy' ? 12 : currentWeather === 'rainy' ? 8 : 6;
    
    for (let i = 0; i < count; i++) {
      const left = `${(i / count) * 100}%`;
      const delay = `${i * 0.15}s`;
      const duration = currentWeather === 'stormy' ? '0.6s' : currentWeather === 'rainy' ? '0.8s' : '1.5s';
      
      let particleClass = '';
      if (currentWeather === 'rainy' || currentWeather === 'stormy') {
        particleClass = 'weather-rain-drop';
      } else if (currentWeather === 'snowy') {
        particleClass = 'weather-snow-flake';
      } else if (currentWeather === 'sunny') {
        particleClass = 'weather-sun-ray';
      } else if (currentWeather === 'foggy') {
        particleClass = 'weather-fog-wisp';
      }
      
      particles.push(
        <div
          key={i}
          className={`absolute ${particleClass}`}
          style={{ 
            left, 
            animationDelay: delay, 
            animationDuration: duration,
            top: currentWeather === 'sunny' ? '0' : '0',
          }}
        />
      );
    }
    return particles;
  };

  return (
    <div className={`weather-card-${currentWeather} game-card rounded-xl bg-gradient-to-br ${weatherGradients[currentWeather] || ''} p-4 border ${weatherBorders[currentWeather] || 'border-border'} relative overflow-hidden`}>
      {/* Animated weather particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {renderWeatherParticles()}
      </div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CloudSun className="w-4 h-4 text-brand" />
            <h3 className="text-sm font-semibold text-brand">Weather</h3>
          </div>
          {isEffectActive && (
            <Badge variant="outline" className="text-[9px] border-domain/40 text-domain bg-domain/20">
              ACTIVE
            </Badge>
          )}
        </div>

        {/* Current weather display */}
        <div className="flex items-center gap-3 mb-3">
          <div className="text-3xl"><GameIcon icon={weatherDef.icon} size={32} /></div>
          <div>
            <p className="text-sm font-bold text-subtle">{weatherDef.name}</p>
            <p className="text-[10px] text-subtle line-clamp-2">{weatherDef.description}</p>
          </div>
        </div>

        {/* Multiplier effects */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-[#0a0e17]/60 rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-label mb-0.5">Production</div>
            <div className={`text-xs font-bold font-mono flex items-center justify-center gap-0.5 ${
              prodEffect > 0 ? 'text-success' : prodEffect < 0 ? 'text-danger' : 'text-subtle'
            }`}>
              {prodEffect > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : prodEffect < 0 ? <ArrowDownRight className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
              {prodEffect >= 0 ? '+' : ''}{(prodEffect * 100).toFixed(0)}%
            </div>
          </div>
          <div className="bg-[#0a0e17]/60 rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-label mb-0.5">Solar</div>
            <div className={`text-xs font-bold font-mono flex items-center justify-center gap-0.5 ${
              solarEffect > 0 ? 'text-success' : solarEffect < 0 ? 'text-danger' : 'text-subtle'
            }`}>
              {solarEffect > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : solarEffect < 0 ? <ArrowDownRight className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
              {solarEffect >= 0 ? '+' : ''}{(solarEffect * 100).toFixed(0)}%
            </div>
          </div>
          <div className="bg-[#0a0e17]/60 rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-label mb-0.5">Wind</div>
            <div className={`text-xs font-bold font-mono flex items-center justify-center gap-0.5 ${
              windEffect > 0 ? 'text-success' : windEffect < 0 ? 'text-danger' : 'text-subtle'
            }`}>
              {windEffect > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : windEffect < 0 ? <ArrowDownRight className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
              {windEffect >= 0 ? '+' : ''}{(windEffect * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Time until next change */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-label flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {isEffectActive ? 'Weather ends in' : 'Next change in'}
          </span>
          <span className="text-brand font-mono">
            {isEffectActive ? formatTicksToTime(weather.remaining) : formatTicksToTime(ticksUntilChange)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Helper to format ticks to a readable time string
function formatTicksToTime(ticks: number): string {
  if (ticks <= 0) return 'Now';
  if (ticks < 60) return `${ticks} ticks`;
  const minutes = Math.floor(ticks / 60);
  const seconds = ticks % 60;
  if (minutes < 60) return `~${minutes}m ${seconds > 0 ? `${seconds}s` : ''}`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `~${hours}h ${remMinutes > 0 ? `${remMinutes}m` : ''}`;
}

// --- Income Sparkline Chart Component ---
function IncomeChart({ productionRates }: { productionRates: Record<string, number> }) {
  const productionSnapshot = useGameStore((s) => s.productionSnapshot);
  const totalMoneyEarned = useGameStore((s) => s.totalMoneyEarned);
  // Generate projected income data points for sparkline based on current rates
  const sparklineData = useMemo(() => {
    const payoutPerCycle = productionSnapshot.payoutPerCycle || 0;
    const currentIncome = payoutPerCycle * 6; // per minute
    const totalEarned = totalMoneyEarned;
    
    // Create a projected trend: simulate growth from low to current income
    // Use current production rates to build a realistic curve
    const points: number[] = [];
    const numPoints = 30;
    
    if (totalEarned === 0 && currentIncome === 0) {
      // No data - flat line at zero
      return Array(numPoints).fill(0);
    }
    
    // Build a growth curve: starts small, accelerates, reaches current rate
    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1); // 0 to 1
      // Sigmoid-like growth curve that ends at currentIncome
      const growthFactor = 1 / (1 + Math.exp(-6 * (t - 0.4)));
      // Add some noise for visual interest
      const noise = (Math.sin(i * 2.7 + totalEarned * 0.001) * 0.1 + 1);
      const value = currentIncome * growthFactor * noise;
      points.push(Math.max(0, value));
    }
    
    return points;
  }, [productionSnapshot.payoutPerCycle, totalMoneyEarned]);

  const payoutPerCycle = productionSnapshot.payoutPerCycle || 0;
  const incomePerMin = payoutPerCycle * 6;

  // SVG sparkline dimensions
  const width = 200;
  const height = 60;
  const padding = 4;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const maxVal = Math.max(...sparklineData, 1);
  const minVal = Math.min(...sparklineData, 0);

  // Generate SVG path
  const points = sparklineData.map((val, i) => {
    const x = padding + (i / (sparklineData.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((val - minVal) / (maxVal - minVal || 1)) * chartHeight;
    return `${x},${y}`;
  });

  const linePath = `M${points.join(' L')}`;
  const areaPath = `${linePath} L${padding + chartWidth},${padding + chartHeight} L${padding},${padding + chartHeight} Z`;

  return (
    <div className="game-card rounded-xl bg-card p-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-success" />
          <h3 className="text-sm font-semibold text-success">Income Trend</h3>
        </div>
        <span className="text-[10px] text-muted-label">projected</span>
      </div>
      <div className="flex items-center gap-4">
        <svg width={width} height={height} className="flex-shrink-0">
          <defs>
            <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="incomeLineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#16a34a" stopOpacity="0.5" />
              <stop offset="50%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#4ade80" />
            </linearGradient>
          </defs>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={padding}
              y1={padding + chartHeight * ratio}
              x2={padding + chartWidth}
              y2={padding + chartHeight * ratio}
              stroke="#1f2937"
              strokeWidth="0.5"
            />
          ))}
          {/* Area fill */}
          <path d={areaPath} fill="url(#incomeGradient)" />
          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke="url(#incomeLineGradient)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* End dot */}
          {points.length > 0 && (
            <circle
              cx={points[points.length - 1].split(',')[0]}
              cy={points[points.length - 1].split(',')[1]}
              r="3"
              fill="#22c55e"
              stroke="#0a0e17"
              strokeWidth="1.5"
            />
          )}
        </svg>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-success font-mono">
            ${formatNumber(incomePerMin)}/min
          </div>
          <div className="text-[10px] text-muted-label mt-0.5">
            Total earned: ${formatNumber(totalMoneyEarned)}
          </div>
          {incomePerMin > 0 && (
            <div className="text-[9px] text-muted-label mt-0.5">
              ~${formatNumber(incomePerMin * 60)}/hr
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Production Efficiency Ring Component ---
function EfficiencyRing({ efficiency, overload }: { efficiency: number; overload: boolean }) {
  // efficiency: -1 means no power grid, 0-1 is the actual efficiency
  const hasGrid = efficiency >= 0;
  const pct = hasGrid ? Math.min(100, Math.max(0, efficiency * 100)) : 0;

  // Color based on efficiency
  const getColor = () => {
    if (!hasGrid) return '#6b7280'; // gray
    if (overload) return '#ef4444'; // red
    if (pct >= 80) return '#22c55e'; // green
    if (pct >= 60) return '#eab308'; // yellow
    if (pct >= 30) return '#f97316'; // orange
    return '#ef4444'; // red
  };
  const color = getColor();

  // SVG ring dimensions
  const size = 64;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="game-card rounded-xl bg-card p-3 border border-border flex flex-col items-center justify-center" style={{ minHeight: '90px' }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1f2937"
            strokeWidth={strokeWidth}
          />
          {/* Progress ring */}
          {hasGrid && (
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1, ease: 'easeOut' }}
              style={{ filter: `drop-shadow(0 0 4px ${color}66)` }}
            />
          )}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-sm font-bold font-mono ${!hasGrid ? 'text-muted-label' : ''}`} style={hasGrid ? { color } : undefined}>
            {!hasGrid ? 'N/A' : `${pct.toFixed(0)}%`}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-muted-label mt-1">Efficiency</span>
      {hasGrid && overload && (
        <span className="text-[8px] text-danger font-semibold">OVERLOAD</span>
      )}
    </div>
  );
}
