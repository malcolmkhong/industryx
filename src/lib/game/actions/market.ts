import type { ResourceType } from '../types';
import { RESOURCE_META } from '../configCache';
import { getGlobalPrice } from '../utils/gameMath';
import { computeSellMultiplier, buildMultipliers } from '../productionCalculator';
import { getBalance } from '../balanceConfig';
import { getCapacity } from '../utils/costCalculator';
import { generateId } from '../utils/generateId';
import { formatNumber } from '../utils/formatNumber';
import { soundEngine } from '../soundEngine';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createMarketActions(set: SetFn, get: GetFn) {
  return {
    sellResource: async (resource: ResourceType, amount: number) => {
      const state = get();
      if (state.resources[resource] < amount) {
        soundEngine.play('error', 'ui');
        get().addNotification('error', 'Not enough resources!');
        return;
      }

      const globalPrice = getGlobalPrice(state, resource);
      if (globalPrice <= 0) return;

      const sellPrice = globalPrice * amount * computeSellMultiplier(state, buildMultipliers(state));

      // Report trade to global market pressure pool
      fetch('/api/market/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource, type: 'sell', amount }),
      }).catch(() => {});

      const validation = await import('../actionValidator').then(m =>
        m.validateActionWithServer('sell', { resource, amount }, generateId())
      );
      if (!validation.approved) {
        soundEngine.play('error', 'ui');
        get().addNotification('error', validation.error ?? 'Sell rejected by server');
        return;
      }

      set({
        resources: { ...state.resources, [resource]: state.resources[resource] - amount },
        money: state.money + sellPrice,
        totalMoneyEarned: state.totalMoneyEarned + sellPrice,
        stats: { ...state.stats, totalResourcesSold: { ...state.stats.totalResourcesSold, [resource]: state.stats.totalResourcesSold[resource] + amount } },
      });
      soundEngine.play('moneyEarned', 'production');
      get().addNotification('success', `Sold ${formatNumber(amount)} ${RESOURCE_META[resource].name} for $${formatNumber(sellPrice)}`);
      get().updateQuestProgress('sell', 1);
    },

    buyResource: async (resource: ResourceType, amount: number) => {
      const state = get();
      const globalPrice = getGlobalPrice(state, resource);
      if (globalPrice <= 0) return;

      const cost = globalPrice * amount * getBalance().market.buyPriceMarkup;
      if (state.money < cost) {
        soundEngine.play('error', 'ui');
        get().addNotification('error', 'Not enough money!');
        return;
      }

      const newAmount = state.resources[resource] + amount;
      if (newAmount > getCapacity(state, resource)) {
        soundEngine.play('error', 'ui');
        get().addNotification('warning', 'Storage full!');
        return;
      }

      // Report trade to global market pressure pool
      fetch('/api/market/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource, type: 'buy', amount }),
      }).catch(() => {});

      const validation = await import('../actionValidator').then(m =>
        m.validateActionWithServer('buy', { resource, amount }, generateId())
      );
      if (!validation.approved) {
        soundEngine.play('error', 'ui');
        get().addNotification('error', validation.error ?? 'Buy rejected by server');
        return;
      }

      set({
        resources: { ...state.resources, [resource]: newAmount },
        money: state.money - cost,
      });
      get().addNotification('info', `Bought ${formatNumber(amount)} ${RESOURCE_META[resource].name} for $${formatNumber(cost)}`);
    },

    toggleAutoSell: (resource: ResourceType) => {
      const state = get();
      const current = state.autoSellResources;
      if (current.includes(resource)) {
        set({ autoSellResources: current.filter(r => r !== resource) });
      } else {
        set({ autoSellResources: [...current, resource] });
      }
    },
  };
}
