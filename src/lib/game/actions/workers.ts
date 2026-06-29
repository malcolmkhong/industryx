import type { WorkerType, Worker } from '../types';
import { WORKER_DEFS } from '../configCache';
import { generateId } from '../utils/generateId';
import { formatNumber } from '../utils/formatNumber';
import { soundEngine } from '../soundEngine';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createWorkerActions(set: SetFn, get: GetFn) {
  return {
    hireWorker: async (type: WorkerType) => {
      const state = get();
      const def = WORKER_DEFS[type];
      if (!def) return;

      if (state.money < def.baseHireCost) {
        get().addNotification('error', `Not enough money! Need $${formatNumber(def.baseHireCost)}`);
        return;
      }

      const validation = await import('../actionValidator').then(m =>
        m.validateActionWithServer('hire_worker', { workerType: type, count: 1 }, generateId())
      );
      if (!validation.approved) {
        soundEngine.play('error', 'ui');
        get().addNotification('error', validation.error ?? `Hiring ${def.name} rejected by server`);
        return;
      }

      const worker: Worker = {
        id: generateId(),
        type,
        level: 1,
        experience: 0,
        assignedTo: null,
        efficiency: 1,
        speed: 1,
        maintenance: 0,
      };

      set({
        money: state.money - def.baseHireCost,
        workers: [...state.workers, worker],
      });
      get().addNotification('success', `Hired ${def.name}`);
      get().updateQuestProgress('worker', 1);
    },

    assignWorker: async (workerId: string, buildingId: string | null) => {
      const state = get();

      const validation = await import('../actionValidator').then(m =>
        m.validateActionWithServer('assign_worker', { workerId, buildingId }, generateId())
      );
      if (!validation.approved) {
        soundEngine.play('error', 'ui');
        get().addNotification('error', validation.error ?? 'Worker assignment rejected by server');
        return;
      }

      set({
        workers: state.workers.map(w =>
          w.id === workerId ? { ...w, assignedTo: buildingId } : w
        ),
      });
    },

    levelUpWorker: (_workerId: string) => {
      // Workers level up automatically based on experience
    },
  };
}
