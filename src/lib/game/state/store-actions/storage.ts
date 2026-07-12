// ============================================
// Storage Actions Factory
// ============================================
import type { ResourceType } from "../../shared/types/types";
import { RESOURCE_META } from "../../config/configCache";
import { soundEngine } from "../../audio/soundEngine";
import { generateId } from "../../shared/utils/generateId";
import type { SetFn, GetFn } from "./_actionTypes";

export function createStorageActions(set: SetFn, get: GetFn) {
  return {
    upgradeStorage: async (resource: ResourceType, levels: number) => {
      const state = get();

      // Phase 6: server-authoritative storage upgrade. Server computes the
      // log-dampened cost, applies the upgrade, and returns the new capacity
      // and level. Client applies the server's authoritative state verbatim.
      const validation = await import("../../actions/client/actionValidator").then((m) =>
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

      const corrected = validation.correctedState;
      if (
        !corrected?.resourceCapacity ||
        !corrected.storageUpgradeLevels ||
        typeof corrected.money !== "number"
      ) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Storage upgrade could not be confirmed by server. Please retry.",
        );
        return;
      }
      const serverCapacity = corrected.resourceCapacity;
      const serverLevels = corrected.storageUpgradeLevels;
      const serverMoney = corrected.money;
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
