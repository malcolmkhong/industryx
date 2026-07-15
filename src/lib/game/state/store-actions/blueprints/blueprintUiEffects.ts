// ============================================
// blueprintUiEffects.ts
//
// Notification helpers for blueprint actions. No state mutation, no
// serialization — only observable side-effects. Wired by
// blueprintMutation.ts via the factory's `effects` parameter.
// ============================================

import type { GetFn } from "../_actionTypes";
import type { ValidationWarning } from "./blueprintValidation";

export interface BlueprintUiEffects {
  notifySaved(name: string): void;
  notifyLoaded(name: string, built: number, skipped: number): void;
  notifyDeleted(): void;
  notifyImported(name: string, bCount: number, tCount: number): void;
  notifyInvalidCode(): void;
  notifyBlueprintNotFound(): void;
  notifyEmptyBlueprint(): void;
  notifyOversizeBuildings(count: number, limit: number): void;
  notifyOversizeTransport(count: number, limit: number): void;
  notifyValidationWarning(warning: ValidationWarning): void;
}

export function createBlueprintUiEffects(get: GetFn): BlueprintUiEffects {
  return {
    notifySaved(name) {
      get().addNotification("success", `Blueprint saved: ${name}`);
    },
    notifyLoaded(name, built, skipped) {
      if (built > 0) {
        const skipSuffix = skipped > 0 ? ` (${skipped} skipped)` : "";
        get().addNotification(
          "success",
          `Loaded blueprint "${name}": Built ${built} buildings${skipSuffix}`,
        );
      } else {
        get().addNotification(
          "warning",
          `No new buildings needed from blueprint "${name}"`,
        );
      }
    },
    notifyDeleted() {
      get().addNotification("info", "Blueprint deleted");
    },
    notifyImported(name, bCount, tCount) {
      get().addNotification(
        "success",
        `Blueprint imported: ${name} (${bCount} buildings, ${tCount} transport)`,
      );
    },
    notifyInvalidCode() {
      get().addNotification("error", "Invalid blueprint code!");
    },
    notifyBlueprintNotFound() {
      get().addNotification("error", "Blueprint not found!");
    },
    notifyEmptyBlueprint() {
      get().addNotification("error", "Blueprint contained no valid entries!");
    },
    notifyOversizeBuildings(count, limit) {
      get().addNotification(
        "error",
        `Blueprint rejected: ${count} buildings exceeds limit of ${limit}`,
      );
    },
    notifyOversizeTransport(count, limit) {
      get().addNotification(
        "error",
        `Blueprint rejected: ${count} transport lines exceeds limit of ${limit}`,
      );
    },
    notifyValidationWarning(warning) {
      if (warning.kind === "unknownBuilding") {
        get().addNotification(
          "warning",
          `Skipped unknown building type: ${warning.type}`,
        );
      } else {
        get().addNotification(
          "warning",
          `Skipped unknown transport type: ${warning.type}`,
        );
      }
    },
  };
}
