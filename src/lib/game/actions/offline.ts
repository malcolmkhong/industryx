// ============================================
// Offline Progress Actions Factory
// ============================================
import type { GameState, ResourceType } from '../types';
import { BUILDING_DEFS } from '../configCache';
import { getBalance } from '../balanceConfig';
import { buildMultipliers, computeSellMultiplier } from '../productionCalculator';
import { getCapacity } from '../utils/costCalculator';
import { initialResources } from '../constants/initialState';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createOfflineActions(set: SetFn, get: GetFn) {
  return {
    calculateOfflineProgress: () => {
      const state = get();
      const now = Date.now();
      const elapsed = now - state.lastOnlineTimestamp;
      if (elapsed < 5000) return null;

      const ticksElapsed = Math.min(Math.floor(elapsed / 1000), 36000);
      if (ticksElapsed <= 0) return null;

      const cache = buildMultipliers(state);
      const offlineRate = cache.modifierEngine?.resolve('offline.rate', 0.5) ?? 0.5;
      const effectiveOfflineRate = offlineRate * (1 + cache.productionBonus);

      const offlineResources: Record<string, number> = { ...initialResources };
      let offlineMoney = 0;
      const offlineTempResources: Record<string, number> = { ...state.resources };

      state.buildings.forEach((b: any) => {
        if (!b.active) return;
        const def = BUILDING_DEFS[b.type];
        if (!def || !def.outputs) return;

        if (def.category === 'extractor') {
          def.outputs.forEach((output: any) => {
            if (output.resource === 'money') return;
            const res = output.resource as ResourceType;
            const categoryBonus = def.category === 'extractor' ? cache.extractorBonus : cache.factoryBonus;
            const tierBonus = def.tier === 1 ? cache.t1FactoryBonus : def.tier === 2 ? cache.t2FactoryBonus : def.tier === 3 ? cache.t3FactoryBonus : 0;
            const buildingBonus = cache.specificBuildingBonuses.get(b.type) ?? 0;
            const produced = output.amount * def.baseProductionRate * b.level * b.efficiency
              * (1 + categoryBonus + tierBonus + buildingBonus)
              * cache.weatherProduction
              * cache.transportProductionBonus
              * effectiveOfflineRate * ticksElapsed;
            offlineResources[res] += produced;
            offlineTempResources[res] = (offlineTempResources[res] ?? 0) + produced;
          });
        }

        if (def.category === 'factory' && def.inputs && def.outputs) {
          const categoryBonus = cache.factoryBonus;
          const tierBonus = def.tier === 1 ? cache.t1FactoryBonus : def.tier === 2 ? cache.t2FactoryBonus : def.tier === 3 ? cache.t3FactoryBonus : 0;
          const buildingBonus = cache.specificBuildingBonuses.get(b.type) ?? 0;
          const efficiencyMultiplier = (1 + categoryBonus + tierBonus + buildingBonus)
            * cache.weatherProduction
            * cache.transportProductionBonus;

          const adjustedInputs = def.inputs.map((input: any) => {
            if (input.resource === 'money') return { resource: input.resource, amount: 0 };
            return {
              resource: input.resource,
              amount: input.amount * b.level * b.efficiency * effectiveOfflineRate * ticksElapsed,
            };
          }).filter((i: any) => i.resource !== 'money');

          let canProduce = true;
          for (const input of adjustedInputs) {
            const res = input.resource as ResourceType;
            if ((offlineTempResources[res] ?? 0) < input.amount) {
              canProduce = false;
              break;
            }
          }

          if (canProduce) {
            adjustedInputs.forEach((input: any) => {
              const res = input.resource as ResourceType;
              offlineTempResources[res] = (offlineTempResources[res] ?? 0) - input.amount;
              if (offlineResources[res] !== undefined) {
                offlineResources[res] = Math.max(0, offlineResources[res] - input.amount);
              }
            });
            def.outputs.forEach((output: any) => {
              if (output.resource === 'money') return;
              const res = output.resource as ResourceType;
              const produced = output.amount * def.baseProductionRate * b.level * b.efficiency
                * efficiencyMultiplier
                * effectiveOfflineRate * ticksElapsed;
              offlineResources[res] += produced;
              offlineTempResources[res] = (offlineTempResources[res] ?? 0) + produced;
            });
          }
        }
      });

      (Object.keys(offlineResources) as ResourceType[]).forEach(r => {
        offlineResources[r] = Math.min(offlineResources[r], Math.max(0, getCapacity(state, r, undefined, cache) - state.resources[r]));
      });

      if (state.automationUnlocks.find((a: any) => a.type === 'autoTrading' && a.active)) {
        (Object.keys(state.resources) as ResourceType[]).forEach(r => {
          const excess = state.resources[r] - getCapacity(state, r, undefined, cache) * getBalance().offline.autoTradeThresholdRatio;
          if (excess > 0) {
            const marketPrice = state.market.find((m: any) => m.resource === r)?.currentPrice ?? 0;
            const sellAmount = Math.min(excess, Math.floor(ticksElapsed * getBalance().offline.autoSellRate));
            const sellMultiplier = computeSellMultiplier(state, cache);
            offlineMoney += sellAmount * marketPrice * sellMultiplier;
          }
        });
      }

      return {
        resources: offlineResources,
        money: offlineMoney,
        ticksElapsed,
      };
    },

    collectOfflineProgress: (offlineData: { resources: Record<string, number>; money: number; ticksElapsed: number }) => {
      const state = get();
      const cache = buildMultipliers(state);
      const newResources = { ...state.resources };
      (Object.keys(offlineData.resources) as ResourceType[]).forEach(r => {
        newResources[r] = Math.min(getCapacity(state, r, undefined, cache), newResources[r] + offlineData.resources[r]);
      });

      set({
        resources: newResources,
        money: state.money + offlineData.money,
        totalMoneyEarned: state.totalMoneyEarned + offlineData.money,
        lastOnlineTimestamp: Date.now(),
      });
    },
  };
}
