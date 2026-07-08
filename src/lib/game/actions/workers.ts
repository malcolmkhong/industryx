import type { WorkerType, Worker } from "../types";
import { WORKER_DEFS } from "../configCache";
import { generateId } from "../utils/generateId";
import { formatNumber } from "../utils/formatNumber";
import { soundEngine } from "../soundEngine";

type SetFn = (
  partial: Record<string, unknown> | ((state: any) => Record<string, unknown>),
) => void;
type GetFn = () => any;

export function createWorkerActions(set: SetFn, get: GetFn) {
  return {
    hireWorker: async (type: WorkerType) => {
      const state = get();
      const def = WORKER_DEFS[type];
      if (!def) return;

      // Phase 6: server-authoritative hire. Server validates against
      // config.workers baseHireCost (immune to client tampering), generates
      // the worker ID, and returns the updated workers array.
      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer(
          "hire_worker",
          { workerType: type },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          validation.error ?? `Hiring ${def.name} rejected by server`,
        );
        return;
      }

      // Apply server-authoritative state. Defensive fallback: if server
      // omitted correctedState, construct a new worker locally.
      const serverWorkers = (validation.correctedState?.workers ?? [
        ...state.workers,
        {
          id: generateId(),
          type,
          level: 1,
          experience: 0,
          assignedTo: null,
          efficiency: 1,
          speed: 1,
          maintenance: 0,
        } as Worker,
      ]) as Worker[];
      const serverMoney =
        validation.correctedState?.money ?? state.money - def.baseHireCost;

      set({
        money: serverMoney,
        workers: serverWorkers,
      });
      get().addNotification("success", `Hired ${def.name}`);
      get().updateQuestProgress("worker", 1);
    },

    assignWorker: async (workerId: string, buildingId: string | null) => {
      const state = get();

      // Phase 6: server-authoritative assign. Server validates worker and
      // building existence, returns the updated workers array.
      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer(
          "assign_worker",
          { workerId, buildingId },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          validation.error ?? "Worker assignment rejected by server",
        );
        return;
      }

      // Apply server-authoritative state.
      const serverWorkers = (validation.correctedState?.workers ??
        state.workers.map((w) =>
          w.id === workerId ? { ...w, assignedTo: buildingId } : w,
        )) as Worker[];

      set({
        workers: serverWorkers,
      });
    },

    levelUpWorker: (_workerId: string) => {
      // Workers level up automatically based on experience
    },
  };
}
