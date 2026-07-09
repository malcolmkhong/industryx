// ============================================
// Storage Actions Factory
// ============================================
import type { ResourceType } from "../types";
import { RESOURCE_META } from "../configCache";
import { formatNumber } from "../utils/formatNumber";
import { soundEngine } from "../soundEngine";
import { generateId } from "../utils/generateId";
import type { SetFn, GetFn } from "./_actionTypes";

export function createStorageActions(set: SetFn, get: GetFn) {
  return {
    upgradeStorage: async (resource: ResourceType, levels: number) => {
      const state = get();
      const currentLevel = state.storageUpgradeLevels[resource] ?? 0;

      // Phase 6: server-authoritative storage upgrade. Server computes the
      // log-dampened cost, applies the upgrade, and returns the new capacity
      // and level. Client applies the server's authoritative state verbatim.
      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer(
          "upgrade_storage",
          { resource, levels },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          validation.error ?? "Storage upgrade rejected by server",
        );
        return;
      }

      // Apply server-authoritative state. Defensive fallback to local
      // computation if the server omitted correctedState.
      const serverCapacity =
        validation.correctedState?.resourceCapacity ?? state.resourceCapacity;
      const serverLevels =
        validation.correctedState?.storageUpgradeLevels ??
        state.storageUpgradeLevels;
      const serverMoney = validation.correctedState?.money ?? state.money;
      const addedCapacity =
        serverCapacity[resource] - (state.resourceCapacity[resource] ?? 0);

      set({
        money: serverMoney,
        resourceCapacity: serverCapacity,
        storageUpgradeLevels: serverLevels,
      });
      soundEngine.play("buildingPlaced", "building");
      get().addNotification(
        "success",
        `Upgraded ${RESOURCE_META[resource].name} storage to +${Math.floor(addedCapacity)} capacity`,
      );
    },
  };
}
