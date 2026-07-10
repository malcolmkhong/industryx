import type { WorkerType, Worker } from "../types";
import { WORKER_DEFS } from "../configCache";
import { generateId } from "../utils/generateId";
import { soundEngine } from "../soundEngine";
import type { SetFn, GetFn } from "./_actionTypes";

export function createWorkerActions(set: SetFn, get: GetFn) {
  return {
    hireWorker: async (type: WorkerType) => {
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

      const corrected = validation.correctedState;
      if (
        !Array.isArray(corrected?.workers) ||
        typeof corrected.money !== "number"
      ) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Worker hire could not be confirmed by server. Please retry.",
        );
        return;
      }
      const serverWorkers = corrected.workers as Worker[];
      const serverMoney = corrected.money;

      set({
        money: serverMoney,
        workers: serverWorkers,
      });
      get().addNotification("success", `Hired ${def.name}`);
      get().updateQuestProgress("worker", 1);
    },

    assignWorker: async (workerId: string, buildingId: string | null) => {
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
      const serverWorkers = validation.correctedState?.workers;
      if (!Array.isArray(serverWorkers)) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Worker assignment could not be confirmed by server. Please retry.",
        );
        return;
      }

      set({
        workers: serverWorkers as Worker[],
      });
    },

    levelUpWorker: async (workerId: string) => {
      const state = get();
      const worker = state.workers.find((w) => w.id === workerId);
      if (!worker) {
        soundEngine.play("error", "ui");
        get().addNotification("error", "Worker not found");
        return;
      }

      // Phase 6: server-authoritative upgrade. Server reads the worker's
      // current XP/level, validates against the levelUpXpBase threshold
      // (server-driven via balanceConfig → game_config_game), and returns
      // the updated workers array with level +1 and experience reset.
      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer(
          "upgrade_worker",
          { workerId },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          validation.error ?? "Worker upgrade rejected by server",
        );
        return;
      }

      const serverWorkers = validation.correctedState?.workers;
      if (!Array.isArray(serverWorkers)) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Worker upgrade could not be confirmed by server. Please retry.",
        );
        return;
      }

      set({ workers: serverWorkers as Worker[] });
      get().addNotification("success", `Worker leveled up to Lv.${worker.level + 1}`);
    },
  };
}
