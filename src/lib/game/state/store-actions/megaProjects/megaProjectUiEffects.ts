import type { MegaProject } from "../../../shared/types/types";
import type { GetFn } from "../_actionTypes";

export function createMegaProjectUiEffects(get: GetFn) {
  return {
    warn(message: string): void {
      get().addNotification("warning", message);
    },

    error(message: string): void {
      get().addNotification("error", message);
    },

    started(project: MegaProject): void {
      get().addNotification(
        "info",
        `Mega Project started: ${project.name}! Maintain required resources to keep construction progressing.`,
      );
    },

    resourcesMissing(stageName: string): void {
      get().addNotification(
        "error",
        `Not enough resources for ${stageName}! Resources must be held for construction to progress.`,
      );
    },

    resourcesConfirmed(project: MegaProject): void {
      const stage = project.stages[project.currentStage];
      if (!stage) return;

      get().addNotification(
        "info",
        `${project.name}: ${stage.name} - Resources confirmed. Construction will progress as long as resources remain available.`,
      );
    },
  };
}
