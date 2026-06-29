import type { TransportType, TransportLine, ResourceType } from '../types';
import { TRANSPORT_DEFS } from '../configCache';
import { generateId } from '../utils/generateId';
import { formatNumber } from '../utils/formatNumber';
import { getBalance } from '../balanceConfig';
import { soundEngine } from '../soundEngine';
import { buildMultipliers } from '../productionCalculator';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createTransportActions(set: SetFn, get: GetFn) {
  return {
    buildTransportLine: (type: TransportType, from: string, to: string, resource: ResourceType) => {
      const state = get();
      const def = TRANSPORT_DEFS[type];
      if (!def) return;

      const cost = def.baseCost.reduce((sum, c) => sum + (c.resource === 'money' ? c.amount : 0), 0);
      if (state.money < cost) {
        soundEngine.play('error', 'ui');
        get().addNotification('error', `Not enough money! Need $${formatNumber(cost)}`);
        return;
      }

      // Use modifier engine for transport bonus (logistics1 + advancedLogistics + cargoDrones + mega)
      const cache = buildMultipliers(state);
      const transportBonus = cache.transportThroughputBonus;

      const line: TransportLine = {
        id: generateId(),
        type,
        level: 1,
        fromBuilding: from,
        toBuilding: to,
        carriesResource: resource,
        throughput: def.baseThroughput * (1 + transportBonus),
        maxThroughput: def.baseThroughput * 3,
        active: true,
      };

      set({
        money: state.money - cost,
        transportLines: [...state.transportLines, line],
        stats: { ...state.stats, transportLinesBuilt: state.stats.transportLinesBuilt + 1 },
      });
      soundEngine.play('buildingPlaced', 'building');
      get().addNotification('success', `Built ${def.name} for $${formatNumber(cost)}`);
      get().updateQuestProgress('transport', 1);
    },

    upgradeTransportLine: (id: string) => {
      const state = get();
      const line = state.transportLines.find(l => l.id === id);
      if (!line) return;

      const def = TRANSPORT_DEFS[line.type];
      const cost = Math.floor(def.baseCost.reduce((sum, c) => sum + (c.resource === 'money' ? c.amount : 0), 0) * Math.pow(getBalance().transport.upgradeCostExponent, line.level));
      if (state.money < cost) return;

      // Use modifier engine for transport bonus (logistics1 + advancedLogistics + cargoDrones + mega)
      const cache = buildMultipliers(state);
      const transportBonus = cache.transportThroughputBonus;

      set({
        money: state.money - cost,
        transportLines: state.transportLines.map(l =>
          l.id === id ? {
            ...l,
            level: l.level + 1,
            throughput: Math.min(l.maxThroughput, def.baseThroughput * Math.pow(def.upgradeMultiplier, l.level) * (1 + transportBonus)),
          } : l
        ),
      });
    },

    toggleTransportLine: (id: string) => {
      const state = get();
      set({
        transportLines: state.transportLines.map(l =>
          l.id === id ? { ...l, active: !l.active } : l
        ),
      });
    },
  };
}
