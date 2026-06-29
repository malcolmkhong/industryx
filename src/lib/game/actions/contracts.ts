import type { Contract, ResourceType } from '../types';
import { generateId } from '../utils/generateId';
import { formatNumber } from '../utils/formatNumber';
import { soundEngine } from '../soundEngine';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createContractActions(set: SetFn, get: GetFn) {
  return {
    acceptContract: (contract: Contract) => {
      const state = get();
      if (state.contracts.filter(c => !c.completed && !c.failed).length >= 5) {
        get().addNotification('warning', 'Too many active contracts!');
        return;
      }
      set({ contracts: [...state.contracts, contract] });
      get().addNotification('info', `Accepted contract: ${contract.name}`);
    },

    fulfillContract: (id: string) => {
      const state = get();
      const contract = state.contracts.find(c => c.id === id);
      if (!contract || contract.completed || contract.failed) return;

      const canFulfill = contract.requiredResources.every(r => {
        if (r.resource === 'money') return true;
        return (state.resources[r.resource as ResourceType] ?? 0) >= r.amount;
      });
      if (!canFulfill) {
        soundEngine.play('error', 'ui');
        get().addNotification('error', 'Not enough resources to fulfill contract!');
        return;
      }

      const newResources = { ...state.resources };
      contract.requiredResources.forEach(r => {
        if (r.resource !== 'money') {
          newResources[r.resource as ResourceType] -= r.amount;
        }
      });

      set({
        resources: newResources,
        money: state.money + contract.reward.money,
        totalMoneyEarned: state.totalMoneyEarned + contract.reward.money,
        researchPoints: state.researchPoints + (contract.reward.researchPoints ?? 0),
        prestigeState: {
          ...state.prestigeState,
          corporationPoints: state.prestigeState.corporationPoints + (contract.reward.corporationPoints ?? 0),
        },
        contracts: state.contracts.map(c =>
          c.id === id ? { ...c, completed: true, progress: 1 } : c
        ),
        completedContracts: state.completedContracts + 1,
        stats: { ...state.stats, contractsCompleted: state.stats.contractsCompleted + 1 },
      });
      soundEngine.play('contractCompleted', 'events');
      get().addNotification('success', `Contract fulfilled: ${contract.name}! +$${formatNumber(contract.reward.money)}`);
      get().updateQuestProgress('contract', 1);
    },
  };
}
