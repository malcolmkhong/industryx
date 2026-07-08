// ============================================
// Game Tick Actions Factory
// ============================================
// The core game loop — runs every tick (1-10 Hz).
// Handles: resource production, power grid, research, contracts,
// workers, events, weather, auto-sell, payouts, drones, megaprojects,
// rank detection, quest progress, and the production snapshot.
// ============================================

import type {
  GameState,
  GameTab,
  ResourceType,
  BuildingInstance,
  BuildingType,
  TransportLine,
  TransportType,
  Worker,
  WorkerType,
  Contract,
  GameEvent,
  GameNotification,
  PowerGrid,
  MarketPrice,
  MegaProjectType,
  MegaProjectBonusType,
  Blueprint,
  LeaderboardEntry,
  LoginStreak,
  DailyReward,
  WeatherType,
  PayoutConfig,
  PayoutRecord,
  Drone,
  DroneMission,
} from "../types";
import {
  BUILDING_DEFS,
  TRANSPORT_DEFS,
  WORKER_DEFS,
  INITIAL_MARKET,
  RESEARCH_TREE,
  AUTOMATION_UNLOCKS,
  PRESTIGE_BONUSES,
  EVENT_TEMPLATES,
  CONTRACT_TEMPLATES,
  RESOURCE_META,
  INITIAL_MEGA_PROJECTS,
  RANK_THRESHOLDS,
  SEASONAL_EVENTS,
  WEEKLY_DAILY_REWARDS,
  getStreakMultiplier,
  WEATHER_DEFS,
  QUEST_DEFS,
} from "../configCache";
import { soundEngine } from "../soundEngine";
import { pickRandomArchetype, resolveArchetype } from "../eventArchetypes";
import {
  buildMultipliers,
  computePowerGrid,
  computeProduction,
  computeSellMultiplier,
  computePayout,
  computeEndgameIncome,
  emptyProductionSnapshot,
  ProductionSnapshot,
} from "../productionCalculator";
import { getBalance } from "../balanceConfig";
import { generateId } from "../utils/generateId";
import { formatNumber } from "../utils/formatNumber";
import { getGlobalPrice } from "../utils/gameMath";
import { getCapacity } from "../utils/costCalculator";
import { generateDroneMissionsFromState } from "../utils/saveMigration";

type SetFn = (
  partial: Record<string, unknown> | ((state: any) => Record<string, unknown>),
) => void;
type GetFn = () => any;

export function createGameTickActions(set: SetFn, get: GetFn) {
  return {
    gameTickAction: () => {
      const state = get();
      if (state.paused) return;

      const newTick = state.gameTick + 1;
      const newResources = { ...state.resources };
      // Phase 1 (C2 fix): live-consumption shadow passed to computeProduction
      // so factory #N sees the post-consumption state of factories #1..N-1
      // in this same tick. Without this, two identical factories would each
      // see the pre-loop snapshot and collectively drive inputs negative.
      const consumed = { ...newResources };
      const newStats = { ...state.stats, playTime: state.stats.playTime + 1 };
      const notifications: GameNotification[] = [];

      // Snapshot rate trackers (built during building processing, written to productionSnapshot)
      const snapshotProduction: Record<string, number> = {};
      const snapshotConsumption: Record<string, number> = {};
      const snapshotActualConsumption: Record<string, number> = {};

      // Phase 3 C3: track overflow auto-sold per resource per tick + total money earned.
      // Notification fires only when overflow happens AND once per ~50 ticks (no spam).
      const tickOverflowSold: Record<string, number> = {};
      let tickOverflowMoney = 0;

      // === Phase 2: Production Calculator (Single Source of Truth) ===
      const cache = buildMultipliers(state);

      // Local aliases from cache (used by non-production parts of tick)
      const weatherProductionMultiplier = cache.weatherProduction;
      const eventProductionMultiplier = cache.eventProductionGlobal;
      const eventResearchMultiplier = cache.eventResearch;
      let droneRpEarned = 0;

      // === Power Grid (via calculator) ===
      const powerResult = computePowerGrid(state, cache, newResources, newTick);
      cache.powerEfficiency = powerResult.efficiency;

      // Track fuel consumption in snapshot rate maps
      for (const fc of powerResult.fuelConsumption) {
        snapshotConsumption[fc.resource] =
          (snapshotConsumption[fc.resource] || 0) + fc.amount;
        snapshotActualConsumption[fc.resource] =
          (snapshotActualConsumption[fc.resource] || 0) + fc.actualAmount;
      }

      const totalProduction = powerResult.totalProduction;
      const totalConsumption = powerResult.totalConsumption;
      const effectivePowerEfficiency = powerResult.efficiency;
      const overload = powerResult.overload;
      const powerBuildings = state.buildings.filter(
        (b) => BUILDING_DEFS[b.type]?.category === "power" && b.active,
      );

      if (overload && !state.powerGrid.overload) {
        soundEngine.play("powerOverload", "events");
      }

      // Phase 3 C3: production output with soft-cap ramp-down + overflow auto-sell.
      // Returns the amount actually stored (at capacity) and the overflow sold at market.
      // softCapRatio (default 0.8) defines the fill % where production starts ramping down.
      // Without this, factories would dump full output and silently drop overflow.
      function applyOutputWithOverflow(
        resource: ResourceType,
        rawAmount: number,
        capacity: number,
      ): { stored: number; overflow: number } {
        if (capacity === Infinity || capacity <= 0) {
          return { stored: newResources[resource] + rawAmount, overflow: 0 };
        }
        const currentStored = newResources[resource] ?? 0;
        const fillRatio = currentStored / capacity;
        const softCap = Math.max(
          0.5,
          Math.min(1, getBalance().autoSell.softCapRatio),
        );
        let efficiency = 1;
        if (fillRatio >= softCap) {
          // Linear ramp from 1.0 (at softCapRatio) down to 0.5 (at 100% fill).
          // At >100% fill, hold at 0.5 so factories don't fully stall on heavy overflow.
          const overSoft =
            (fillRatio - softCap) / Math.max(0.0001, 1 - softCap);
          efficiency = Math.max(0.5, 1 - 0.5 * Math.min(1, overSoft));
        }
        const effectiveAmount = rawAmount * efficiency;
        const roomLeft = Math.max(0, capacity - currentStored);
        const stored = Math.min(capacity, currentStored + effectiveAmount);
        const overflow = effectiveAmount - (stored - currentStored);
        return { stored, overflow };
      }

      // Transport efficiency (for peak efficiency tracking — not production math)
      const transportBonus = cache.transportThroughputBonus;
      const transportEfficiency =
        state.transportLines.length > 0
          ? (state.transportLines.filter((t) => t.active).length /
              Math.max(1, state.transportLines.length)) *
            (1 + transportBonus + cache.transportMegaBonus)
          : 1;

      // === Building Production (via calculator) ===
      const snapshotBuildings: ProductionSnapshot["buildings"] = {};

      for (const b of state.buildings) {
        if (!b.active) continue;
        const def = BUILDING_DEFS[b.type];
        if (!def) continue;
        if (def.category === "power") continue;

        // Phase 1 (C2 fix): pass `consumed` not `newResources` so this
        // factory's canProduce check reflects what prior factories in
        // the same tick already ate.
        const result = computeProduction(b, cache, consumed);

        snapshotBuildings[b.id] = {
          outputs: result.outputs,
          inputs: result.inputs,
          efficiency: result.efficiency,
        };

        if (def.category === "extractor" && result.canProduce) {
          for (const output of result.outputs) {
            const res = output.resource as ResourceType;
            const { stored, overflow } = applyOutputWithOverflow(
              res,
              output.amount,
              getCapacity(state, res, undefined, cache),
            );
            newResources[res] = stored;
            if (overflow > 0) {
              tickOverflowSold[res] = (tickOverflowSold[res] ?? 0) + overflow;
              const marketPrice = getGlobalPrice(state, res);
              tickOverflowMoney +=
                overflow * marketPrice * computeSellMultiplier(state, cache);
            }
            newStats.totalResourcesProduced[res] += output.amount;
            snapshotProduction[res] =
              (snapshotProduction[res] || 0) + output.amount;
          }
        }

        if (def.category === "factory") {
          for (const input of result.inputs) {
            snapshotConsumption[input.resource] =
              (snapshotConsumption[input.resource] || 0) + input.amount;
          }

          if (result.canProduce) {
            for (const input of result.actualInputs) {
              const res = input.resource as ResourceType;
              newResources[res] -= input.amount;
              // C2 fix: propagate the consumption into the shadow array
              // so the next factory sees this reduction.
              consumed[res] = (consumed[res] ?? 0) - input.amount;
              snapshotActualConsumption[res] =
                (snapshotActualConsumption[res] || 0) + input.amount;
            }
            for (const output of result.outputs) {
              const res = output.resource as ResourceType;
              const { stored, overflow } = applyOutputWithOverflow(
                res,
                output.amount,
                getCapacity(state, res, undefined, cache),
              );
              newResources[res] = stored;
              if (overflow > 0) {
                tickOverflowSold[res] = (tickOverflowSold[res] ?? 0) + overflow;
                const marketPrice = getGlobalPrice(state, res);
                tickOverflowMoney +=
                  overflow * marketPrice * computeSellMultiplier(state, cache);
              }
              newStats.totalResourcesProduced[res] += output.amount;
              snapshotProduction[res] =
                (snapshotProduction[res] || 0) + output.amount;
            }
          }
        }
      }

      const workerEfficiencyBonus = cache.workerEfficiencyResearchBonus;
      const megaMarketBonus =
        cache.marketBonus -
        (cache.hasMarketAnalysis ? 0.2 : 0) -
        state.prestigeState.bonuses
          .filter((b) => b.purchased && b.effect.type === "marketMultiplier")
          .reduce((sum, b) => sum + b.effect.value, 0);

      let newMarket = state.market;
      let newSectorTrends = state.sectorTrends;
      if (newTick % 5 === 0 && state.serverMarket?.prices) {
        const globalPrices = state.serverMarket.prices;
        newMarket = state.market.map((m) => {
          const global = globalPrices.find((p) => p.resource === m.resource);
          return global
            ? {
                ...m,
                currentPrice: global.currentPrice,
                priceHistory: m.priceHistory,
              }
            : m;
        });
      }

      let newResearchProgress = state.researchProgress;
      let newActiveResearch = state.activeResearch;
      let newCompletedResearch = [...state.completedResearch];
      let newResearchPoints = state.researchPoints;

      if (newActiveResearch) {
        const node = RESEARCH_TREE.find((r) => r.id === newActiveResearch);
        if (node) {
          const researchSpeed = cache.eventResearch * (1 + cache.researchBonus);
          newResearchProgress += researchSpeed;
          if (newResearchProgress >= node.timeRequired) {
            newCompletedResearch.push(newActiveResearch);
            newActiveResearch = null;
            newResearchProgress = 0;
            newResearchPoints += Math.floor(
              node.cost * getBalance().rp.completionRefundRatio,
            );
            newStats.researchCompleted++;
            soundEngine.play("researchComplete", "events");
            notifications.push({
              id: generateId(),
              type: "success",
              message: `Research complete: ${node.name}!`,
              gameTick: newTick,
              read: false,
            });
          }
        }
      }

      let moneyIncomeThisTick = 0;
      let moneyExpenseThisTick = 0;
      let rpIncomeThisTick = 0;
      let rpExpenseThisTick = 0;
      let cpIncomeThisTick = 0;
      let cpExpenseThisTick = 0;

      const bal = getBalance();
      const passiveRpIncome =
        bal.rp.passiveBase *
        (1 +
          state.buildings.filter((b) => b.type === "aiLab" && b.active).length *
            bal.rp.aiLabBonus);
      newResearchPoints += passiveRpIncome;
      rpIncomeThisTick += passiveRpIncome;

      newResearchPoints += droneRpEarned;
      rpIncomeThisTick += droneRpEarned;

      const rpBuildingRates: Record<string, number> = {
        extractor: bal.rp.extractorRate,
        power: bal.rp.powerRate,
        "factory-t1": bal.rp.factoryT1Rate,
        "factory-t2": bal.rp.factoryT2Rate,
        "factory-t3": bal.rp.factoryT3Rate,
        "factory-t4": bal.rp.factoryT4Rate,
        "factory-t5": bal.rp.factoryT5Rate,
      };
      let buildingRpIncome = 0;
      state.buildings.forEach((b) => {
        if (!b.active) return;
        const def = BUILDING_DEFS[b.type];
        if (!def) return;
        const tierKey =
          def.category === "factory" ? `factory-t${def.tier}` : def.category;
        const rpRate = rpBuildingRates[tierKey];
        if (rpRate) {
          const income =
            rpRate * b.level * b.efficiency * effectivePowerEfficiency;
          newResearchPoints += income;
          buildingRpIncome += income;
        }
      });
      rpIncomeThisTick += buildingRpIncome;

      const newContracts = state.contracts.map((c) => {
        if (c.completed || c.failed) return c;
        const newRemaining = c.timeRemaining - 1;
        if (newRemaining <= 0) {
          return { ...c, timeRemaining: 0, failed: true };
        }
        return { ...c, timeRemaining: newRemaining };
      });

      const autoFulfill = state.automationUnlocks.find(
        (a) => a.type === "autoTrading" && a.active,
      );
      if (autoFulfill) {
        newContracts.forEach((c) => {
          if (c.completed || c.failed) return;
          const canFulfill = c.requiredResources.every((r) => {
            if (r.resource === "money") return true;
            return (newResources[r.resource as ResourceType] ?? 0) >= r.amount;
          });
          if (canFulfill) {
            c.requiredResources.forEach((r) => {
              if (r.resource !== "money") {
                newResources[r.resource as ResourceType] -= r.amount;
              }
            });
            c.completed = true;
            const moneyReward = c.reward.money;
            newStats.contractsCompleted++;
            notifications.push({
              id: generateId(),
              type: "success",
              message: `Contract completed: ${c.name}! +$${formatNumber(moneyReward)}`,
              gameTick: newTick,
              read: false,
            });
          }
        });
      }

      const newWorkers = state.workers.map((w) => ({
        ...w,
        experience:
          w.experience + bal.worker.xpPerTick * (1 + workerEfficiencyBonus),
        efficiency: Math.min(
          2,
          w.efficiency + bal.worker.efficiencyGainPerTick,
        ),
      }));

      newWorkers.forEach((w) => {
        const xpNeeded = w.level * 100;
        if (w.experience >= xpNeeded) {
          w.level++;
          w.experience -= xpNeeded;
        }
      });

      const newActiveEvents = state.activeEvents
        .map((e) => ({
          ...e,
          remaining: e.remaining - 1,
        }))
        .filter((e) => e.remaining > 0);

      if (
        newTick % 500 === 0 &&
        Math.random() < bal.event.randomTriggerChance &&
        newActiveEvents.length < 2
      ) {
        const archetype = pickRandomArchetype();
        const resourcePool = Object.keys(RESOURCE_META).filter(
          (k) => !["money", "researchPoints", "corporationPoints"].includes(k),
        ) as ResourceType[];
        const resolved = resolveArchetype(archetype, resourcePool);

        const newEvent: GameEvent = {
          id: generateId(),
          type: archetype.id,
          name: resolved.name,
          description: resolved.description,
          duration: 200 + Math.floor(Math.random() * 200),
          remaining: 200 + Math.floor(Math.random() * 200),
          effects: resolved.effects,
          icon: resolved.icon,
        };
        newActiveEvents.push(newEvent);
        soundEngine.play("eventTriggered", "events");
        notifications.push({
          id: generateId(),
          type: "warning",
          message: `Event: ${resolved.name} - ${resolved.description}`,
          gameTick: newTick,
          read: false,
        });

        for (const eff of resolved.effects) {
          if (eff.type === "marketPriceMultiplier" && eff.target) {
            const pressureAmount = Math.round(Math.abs(eff.value - 1) * 100);
            fetch("/api/market/action", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                resource: eff.target,
                type: eff.value > 1 ? "buy" : "sell",
                amount: pressureAmount,
              }),
            }).catch(() => {});
          }
        }
      }

      const hasActiveSeasonal = newActiveEvents.some((e) =>
        SEASONAL_EVENTS.some((se) => se.id === e.type),
      );
      if (!hasActiveSeasonal && newActiveEvents.length < 3) {
        for (const seasonal of SEASONAL_EVENTS) {
          if (Math.random() < seasonal.triggerChance) {
            const seasonalEvent: GameEvent = {
              id: generateId(),
              type: seasonal.id as GameEvent["type"],
              name: seasonal.name,
              description: seasonal.description,
              duration: seasonal.duration,
              remaining: seasonal.duration,
              effects: seasonal.effects,
              icon: seasonal.icon,
            };
            newActiveEvents.push(seasonalEvent);
            soundEngine.play("eventTriggered", "events");
            notifications.push({
              id: generateId(),
              type: "warning",
              message: `🌟 Seasonal: ${seasonal.name} - ${seasonal.description}`,
              gameTick: newTick,
              read: false,
            });
            break;
          }
        }
      }

      let newWeather = { ...state.weather };
      if (newWeather.remaining > 0) {
        newWeather.remaining = newWeather.remaining - 1;
      }
      if (newWeather.remaining <= 0 && newTick >= newWeather.nextChange) {
        const weatherTypes: WeatherType[] = [
          "clear",
          "sunny",
          "rainy",
          "stormy",
          "foggy",
          "snowy",
        ];
        const weights = [30, 25, 20, 10, 10, 5];
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let roll = Math.random() * totalWeight;
        let selectedWeather: WeatherType = "clear";
        for (let i = 0; i < weatherTypes.length; i++) {
          roll -= weights[i];
          if (roll <= 0) {
            selectedWeather = weatherTypes[i];
            break;
          }
        }
        newWeather = {
          current: selectedWeather,
          intensity:
            selectedWeather === "clear"
              ? 0
              : bal.weather.minIntensity +
                Math.random() * bal.weather.intensityRange,
          remaining:
            selectedWeather === "clear"
              ? 0
              : 100 + Math.floor(Math.random() * 300),
          nextChange: newTick + 200 + Math.floor(Math.random() * 400),
        };
        if (selectedWeather !== "clear") {
          const wDef = WEATHER_DEFS[selectedWeather];
          notifications.push({
            id: generateId(),
            type: "info",
            message: `Weather: ${wDef.name} - ${wDef.description}`,
            gameTick: newTick,
            read: false,
          });
        }
      }

      const playerGameTier = (() => {
        if (state.buildings.length === 0) return 0;
        const highestBuildingTier = Math.max(
          0,
          ...state.buildings.map((b) => BUILDING_DEFS[b.type]?.tier ?? 0),
        );
        const researchTier = Math.floor(state.completedResearch.length / 3);
        return Math.min(3, Math.max(highestBuildingTier, researchTier));
      })();

      let contractsToAdd: Contract[] = [];
      const activeContractCount = state.contracts.filter(
        (c) => !c.completed && !c.failed,
      ).length;
      if (newTick % 150 === 0 && activeContractCount < 4) {
        const availableTemplates = CONTRACT_TEMPLATES.filter(
          (t) => (t.gameTier ?? 0) <= playerGameTier,
        );
        const weightedTemplates = availableTemplates.flatMap((t) => {
          const tier = t.gameTier ?? 0;
          const weight =
            tier === playerGameTier ? 3 : tier === playerGameTier - 1 ? 2 : 1;
          return Array(weight).fill(t);
        });
        const template =
          weightedTemplates.length > 0
            ? weightedTemplates[
                Math.floor(Math.random() * weightedTemplates.length)
              ]
            : CONTRACT_TEMPLATES[0];
        const contractTier = template.gameTier ?? 0;
        const difficulty = Math.max(
          1,
          Math.min(
            5,
            contractTier + 1 + Math.floor(state.buildings.length / 8),
          ),
        );
        const tierMultiplier = 1 + contractTier * bal.contract.tierRewardCoeff;
        const reward = template.requiredResources.reduce((sum, r) => {
          const marketItem = INITIAL_MARKET.find(
            (m) => m.resource === r.resource,
          );
          return (
            sum +
            (marketItem?.basePrice ?? 10) *
              r.amount *
              tierMultiplier *
              (1 + difficulty * bal.contract.difficultyRewardCoeff)
          );
        }, 0);

        const contract: Contract = {
          id: generateId(),
          name: template.name,
          description: template.description,
          type: template.type,
          requiredResources: template.requiredResources.map((r) => ({
            resource: r.resource,
            amount: Math.floor(
              r.amount *
                (1 + (difficulty - 1) * bal.contract.difficultyResourceCoeff),
            ),
          })),
          timeLimit: template.timeLimit,
          timeRemaining: template.timeLimit,
          reward: {
            money: Math.floor(reward),
            researchPoints: Math.floor(difficulty * 15 * tierMultiplier),
            corporationPoints:
              contractTier >= 2
                ? Math.floor((contractTier - 1) * 3 + difficulty)
                : 0,
          },
          progress: 0,
          completed: false,
          failed: false,
          difficulty,
          gameTier: contractTier,
          icon: template.icon,
        };
        contractsToAdd = [contract];
      }

      let moneyEarned = 0;
      if (autoFulfill) {
        (Object.keys(newResources) as ResourceType[]).forEach((r) => {
          const excess =
            newResources[r] -
            getCapacity(state, r, undefined, cache) *
              bal.autoSell.thresholdRatio;
          if (excess > 0) {
            const marketPrice = getGlobalPrice(state, r);
            const sellPrice = marketPrice * computeSellMultiplier(state, cache);
            const sellAmount = Math.min(excess, 5);
            newResources[r] -= sellAmount;
            const earned = sellAmount * sellPrice;
            moneyEarned += earned;
            moneyIncomeThisTick += earned;
            newStats.totalResourcesSold[r] += sellAmount;
            // Phase 3 F1: report overflow auto-sell to market so it influences price
            fetch("/api/market/action", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                resource: r,
                type: "sell",
                amount: sellAmount,
              }),
            }).catch((err) =>
              console.warn(
                "[Market] Overflow auto-sell pressure report failed:",
                err,
              ),
            );
          }
        });
      }

      if (state.autoSellResources.length > 0) {
        state.autoSellResources.forEach((r) => {
          const capacity = getCapacity(state, r, undefined, cache);
          const threshold = capacity * bal.autoSell.thresholdRatio;
          const held = newResources[r];
          const excess = held - threshold;
          if (excess > 0) {
            const globalPrice = getGlobalPrice(state, r);
            if (globalPrice > 0) {
              const sellPrice =
                globalPrice * computeSellMultiplier(state, cache);
              const sellAmount = Math.max(
                1,
                Math.min(
                  Math.ceil(excess * bal.autoSell.excessSellRatio),
                  Math.ceil(capacity * bal.autoSell.maxSellCapacityRatio),
                ),
              );
              const actualSell = Math.min(sellAmount, held);
              newResources[r] -= actualSell;
              const autoSellEarned = actualSell * sellPrice;
              moneyEarned += autoSellEarned;
              moneyIncomeThisTick += autoSellEarned;
              newStats.totalResourcesSold[r] += actualSell;
              fetch("/api/market/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  resource: r,
                  type: "sell",
                  amount: actualSell,
                }),
              }).catch((err) =>
                console.warn("[Market] Auto-sell pressure report failed:", err),
              );
            }
          }
        });
      }

      const currentEfficiency =
        effectivePowerEfficiency *
        transportEfficiency *
        eventProductionMultiplier;
      const newPeakEfficiency = Math.max(
        state.stats.peakEfficiency,
        currentEfficiency,
      );

      let newHistory = state.productionHistory;
      if (newTick % 50 === 0) {
        const snapshot = {
          timestamp: Date.now(),
          resources: { ...newResources },
          money: state.money + moneyEarned,
          powerProduction: totalProduction,
          powerConsumption: totalConsumption,
        };
        newHistory = [...state.productionHistory.slice(-199), snapshot];
      }

      const megaProjectResourcesToDeduct: {
        resource: string;
        amount: number;
      }[] = [];
      const newMegaProjects = state.megaProjects.map((mp) => {
        if (!mp.active || mp.completed) return mp;
        const stage = mp.stages[mp.currentStage];
        if (!stage || stage.completed) return mp;

        const allResourcesAvailable = stage.requiredResources.every((r) => {
          if (r.resource === "money") return state.money >= r.amount;
          return (newResources[r.resource as ResourceType] ?? 0) >= r.amount;
        });

        if (!allResourcesAvailable) {
          return { ...mp, progress: mp.progress };
        }

        const increment = 1 / stage.timeRequired;
        const newProgress = mp.progress + increment;

        if (newProgress >= 1) {
          stage.requiredResources.forEach((r) => {
            megaProjectResourcesToDeduct.push({
              resource: r.resource,
              amount: r.amount,
            });
          });

          const updatedStages = mp.stages.map((s, i) =>
            i === mp.currentStage ? { ...s, completed: true } : s,
          );
          const nextStage = mp.currentStage + 1;
          const isCompleted = nextStage >= mp.stages.length;

          notifications.push({
            id: generateId(),
            type: isCompleted ? "success" : "info",
            message: isCompleted
              ? `🏆 MEGA PROJECT COMPLETE: ${mp.name}! ${mp.bonus.description}`
              : `⚡ ${mp.name} - Stage ${nextStage}/${mp.stages.length}: ${mp.stages[mp.currentStage]?.name} complete!`,
            gameTick: newTick,
            read: false,
          });

          soundEngine.play("levelUp", "events");

          return {
            ...mp,
            stages: updatedStages,
            currentStage: nextStage,
            progress: 0,
            completed: isCompleted,
            active: !isCompleted,
          };
        }

        return { ...mp, progress: newProgress };
      });

      let megaDeductMoney = 0;
      megaProjectResourcesToDeduct.forEach((r) => {
        if (r.resource === "money") {
          megaDeductMoney += r.amount;
        } else {
          newResources[r.resource as ResourceType] = Math.max(
            0,
            (newResources[r.resource as ResourceType] ?? 0) - r.amount,
          );
        }
      });
      if (megaDeductMoney > 0) {
        moneyEarned -= megaDeductMoney;
        moneyExpenseThisTick += megaDeductMoney;
      }

      const POWER_MILESTONES = [100, 500, 1000];
      POWER_MILESTONES.forEach((milestone) => {
        if (
          totalProduction >= milestone &&
          state.powerGrid.totalProduction < milestone
        ) {
          soundEngine.play("levelUp", "events");
        }
      });

      let newPayoutConfig = { ...state.payoutConfig };
      let newPendingPayout = state.pendingPayout;
      let newPayoutHistory = state.payoutHistory;
      let payoutMoneyEarned = 0;

      const ticksSinceLastPayout = newTick - newPayoutConfig.lastPayoutTick;
      if (
        ticksSinceLastPayout >= newPayoutConfig.basePayoutInterval &&
        state.buildings.length > 0
      ) {
        const payoutResult = computePayout(state, cache);
        const payoutAmount = payoutResult.amountPerCycle;

        const activeBuildings = state.buildings.filter((b) => b.active);
        const avgEfficiency =
          activeBuildings.length > 0
            ? activeBuildings.reduce((sum, b) => sum + b.efficiency, 0) /
              activeBuildings.length
            : 0;

        if (payoutAmount > 0) {
          if (newPayoutConfig.autoCollect) {
            payoutMoneyEarned = payoutAmount;
            notifications.push({
              id: generateId(),
              type: "success",
              message: `💰 Payout received: $${formatNumber(payoutAmount)}`,
              gameTick: newTick,
              read: false,
            });
          } else {
            newPendingPayout += payoutAmount;
            notifications.push({
              id: generateId(),
              type: "info",
              message: `💰 Payout ready: $${formatNumber(payoutAmount)} — Click to collect!`,
              gameTick: newTick,
              read: false,
            });
          }

          const record: PayoutRecord = {
            tick: newTick,
            amount: payoutAmount,
            buildingCount: activeBuildings.length,
            efficiency: avgEfficiency,
          };
          newPayoutHistory = [...state.payoutHistory.slice(-9), record];

          newPayoutConfig = {
            ...newPayoutConfig,
            lastPayoutTick: newTick,
            totalPayoutsReceived: newPayoutConfig.totalPayoutsReceived + 1,
          };

          soundEngine.play("moneyEarned", "building");

          const PAYOUT_MILESTONES = [1, 10, 25, 50, 100];
          const newTotalPayouts = newPayoutConfig.totalPayoutsReceived;
          PAYOUT_MILESTONES.forEach((milestone) => {
            if (newTotalPayouts === milestone) {
              soundEngine.play("levelUp", "events");
            }
          });
        }
      }

      moneyEarned += payoutMoneyEarned;
      moneyIncomeThisTick += payoutMoneyEarned;

      // Phase 3 C3: surface C3 silently-dropped overflow as money earned + notification.
      // Notification fires once per ~50 ticks (1% of game time at 10Hz) when overflow > 0.
      if (tickOverflowMoney > 0) {
        moneyEarned += tickOverflowMoney;
        moneyIncomeThisTick += tickOverflowMoney;
        if (newTick % 50 === 0) {
          const overflowedResources = Object.keys(tickOverflowSold).filter(
            (r) => (tickOverflowSold[r] ?? 0) > 0,
          );
          const totalUnits = Object.values(tickOverflowSold).reduce(
            (sum, v) => sum + (v ?? 0),
            0,
          );
          if (overflowedResources.length > 0 && totalUnits > 0.01) {
            const resourceNames = overflowedResources
              .slice(0, 3)
              .map((r) => RESOURCE_META[r as ResourceType]?.name ?? r)
              .join(", ");
            notifications.push({
              id: generateId(),
              type: "info",
              message: `📦 Storage overflow: ${formatNumber(totalUnits)} units of ${resourceNames} auto-sold for $${formatNumber(tickOverflowMoney)}. Upgrade storage to keep production.`,
              gameTick: newTick,
              read: false,
            });
          }
        }
      }

      let droneMoneyEarned = 0;
      droneRpEarned = 0;
      const droneResourceRewards: Partial<Record<ResourceType, number>> = {};
      let newDrones = state.drones;

      const deliveringDrones = state.drones.fleet.filter(
        (d) => d.status === "delivering" && d.missionEndTick <= newTick,
      );
      if (deliveringDrones.length > 0) {
        const missions = generateDroneMissionsFromState(state);
        const updatedFleet = state.drones.fleet.map((d) => {
          if (d.status !== "delivering" || d.missionEndTick > newTick) return d;
          const mission = missions.find((m) => m.id === d.missionId);
          if (mission) {
            const capacityMult =
              1 + (d.capacityLevel - 1) * bal.drone.capacityUpgradeCoeff;
            droneMoneyEarned += Math.floor(mission.reward.money * capacityMult);
            if (mission.reward.researchPoints)
              droneRpEarned += Math.floor(
                mission.reward.researchPoints * capacityMult,
              );
            if (mission.reward.resources) {
              mission.reward.resources.forEach((r) => {
                droneResourceRewards[r.resource] =
                  (droneResourceRewards[r.resource] || 0) +
                  Math.floor(r.amount * capacityMult);
              });
            }
          }
          return {
            ...d,
            status: "idle" as const,
            missionEndTick: 0,
            missionId: null,
          };
        });
        newDrones = {
          fleet: updatedFleet,
          completedMissions:
            state.drones.completedMissions + deliveringDrones.length,
          totalEarned: state.drones.totalEarned + droneMoneyEarned,
        };

        (Object.keys(droneResourceRewards) as ResourceType[]).forEach((r) => {
          const amount = droneResourceRewards[r] || 0;
          newResources[r] = Math.min(
            getCapacity(state, r),
            newResources[r] + amount,
          );
        });

        moneyEarned += droneMoneyEarned;
        moneyIncomeThisTick += droneMoneyEarned;
        if (droneMoneyEarned > 0) {
          soundEngine.play("moneyEarned", "building");
          notifications.push({
            id: generateId(),
            type: "success",
            message: `🚁 Drone delivery complete! +$${formatNumber(droneMoneyEarned)}${droneRpEarned > 0 ? ` +${droneRpEarned} RP` : ""}`,
            gameTick: newTick,
            read: false,
          });
        }
      }

      if (newTick % 30 === 0) {
        const prods = snapshotProduction as Record<string, number>;
        const conss = snapshotActualConsumption as Record<string, number>;
        const allResources = new Set([
          ...Object.keys(prods),
          ...Object.keys(conss),
        ]);
        for (const res of allResources) {
          const prod = prods[res] || 0;
          const cons = conss[res] || 0;
          const net = prod - cons;
          if (Math.abs(net) > 0.01) {
            fetch("/api/market/action", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                resource: res,
                type: net > 0 ? "sell" : "buy",
                amount: Math.round(Math.abs(net)),
              }),
            }).catch((err) =>
              console.warn(
                "[Market] Net-production pressure report failed:",
                err,
              ),
            );
          }
        }
      }

      let corpGained = 0;
      const endgameResult = computeEndgameIncome(state, cache);
      moneyEarned += endgameResult.moneyPerTick;
      moneyIncomeThisTick += endgameResult.moneyPerTick;
      newResearchPoints += endgameResult.researchPerTick;
      rpIncomeThisTick += endgameResult.researchPerTick;
      corpGained += endgameResult.corpPerTick;
      cpIncomeThisTick += endgameResult.corpPerTick;

      const prevScore = Math.floor(
        state.totalMoneyEarned +
          state.buildings.length * 100 +
          state.completedResearch.length * 200 +
          state.stats.contractsCompleted * 50 +
          state.prestigeState.totalPrestiges * 500,
      );
      const newTotalMoneyEarned = state.totalMoneyEarned + moneyEarned;
      const newScore = Math.floor(
        newTotalMoneyEarned +
          state.buildings.length * 100 +
          newCompletedResearch.length * 200 +
          newStats.contractsCompleted * 50 +
          state.prestigeState.totalPrestiges * 500,
      );
      let prevRankName = RANK_THRESHOLDS[0].name;
      let newRankName = RANK_THRESHOLDS[0].name;
      for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
        if (prevScore >= RANK_THRESHOLDS[i].minScore) {
          prevRankName = RANK_THRESHOLDS[i].name;
          break;
        }
      }
      for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
        if (newScore >= RANK_THRESHOLDS[i].minScore) {
          newRankName = RANK_THRESHOLDS[i].name;
          break;
        }
      }
      if (newRankName !== prevRankName) {
        soundEngine.play("levelUp", "events");
      }

      const payoutSnapshot = computePayout(state, cache);
      const productionSnapshot: ProductionSnapshot = {
        production: { ...snapshotProduction },
        consumption: { ...snapshotConsumption },
        actualConsumption: { ...snapshotActualConsumption },
        buildings: snapshotBuildings,
        powerProduction: powerResult.totalProduction,
        powerConsumption: powerResult.totalConsumption,
        powerEfficiency: powerResult.efficiency,
        powerOverload: powerResult.overload,
        payoutPerCycle: payoutSnapshot.amountPerCycle,
        payoutBreakdown: payoutSnapshot.breakdown,
        sellMultiplier: computeSellMultiplier(state, cache),
        endgameMoney: endgameResult.moneyPerTick,
        endgameResearch: endgameResult.researchPerTick,
        endgameCorp: endgameResult.corpPerTick,
        moneyIncomeRate: moneyIncomeThisTick,
        moneyExpenseRate: moneyExpenseThisTick,
        rpIncomeRate: rpIncomeThisTick,
        rpExpenseRate: rpExpenseThisTick,
        cpIncomeRate: cpIncomeThisTick,
        cpExpenseRate: cpExpenseThisTick,
      };

      set({
        gameTick: newTick,
        resources: newResources,
        money: state.money + moneyEarned,
        totalMoneyEarned: state.totalMoneyEarned + moneyEarned,
        powerGrid: {
          totalProduction,
          totalConsumption,
          efficiency: effectivePowerEfficiency,
          overload,
          plants: powerBuildings,
        },
        market: newMarket,
        sectorTrends: newSectorTrends,
        researchPoints: newResearchPoints,
        completedResearch: newCompletedResearch,
        activeResearch: newActiveResearch,
        researchProgress: newResearchProgress,
        workers: newWorkers,
        contracts: [...newContracts, ...contractsToAdd],
        activeEvents: newActiveEvents,
        stats: { ...newStats, peakEfficiency: newPeakEfficiency },
        megaProjects: newMegaProjects,
        productionHistory: newHistory,
        notifications: [...notifications, ...state.notifications.slice(-20)],
        lastOnlineTimestamp: Date.now(),
        weather: newWeather,
        payoutConfig: newPayoutConfig,
        pendingPayout: newPendingPayout,
        payoutHistory: newPayoutHistory,
        drones: newDrones,
        prestigeState:
          corpGained > 0
            ? {
                ...state.prestigeState,
                corporationPoints:
                  state.prestigeState.corporationPoints + corpGained,
              }
            : state.prestigeState,
        productionSnapshot,
      });

      if (newTick % 10 === 0) {
        get().updateQuestProgress("reach", 0);
        get().updateQuestProgress("earn", 0);
        const producedStats = newStats.totalResourcesProduced;
        const quests = get().quests;
        quests.forEach((q: any) => {
          if (
            q.type === "produce" &&
            !q.claimed &&
            !q.completed &&
            q.targetResource
          ) {
            const totalProduced = producedStats[q.targetResource] ?? 0;
            const maxStepCurrent = Math.max(
              ...q.steps.map((s: any) => s.current),
            );
            if (totalProduced > maxStepCurrent) {
              get().updateQuestProgress(
                "produce",
                totalProduced - maxStepCurrent,
                q.targetResource,
              );
            }
          }
        });
      }
    },
  };
}
