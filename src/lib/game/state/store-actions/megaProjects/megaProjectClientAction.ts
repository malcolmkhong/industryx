import type { MegaProjectType } from "../../../shared/types/types";
import type { SetFn, GetFn } from "../_actionTypes";
import {
  canMaintainMegaProjectStage,
  findMegaProject,
  getMegaProjectStartError,
} from "./megaProjectValidation";
import type { createMegaProjectUiEffects } from "./megaProjectUiEffects";

type MegaProjectUiEffects = ReturnType<typeof createMegaProjectUiEffects>;

export function createMegaProjectClientAction(
  set: SetFn,
  get: GetFn,
  effects: MegaProjectUiEffects,
) {
  return {
    startMegaProject: (type: MegaProjectType) => {
      const project = findMegaProject(get, type);
      if (!project) return;

      const error = getMegaProjectStartError(get, project);
      if (error) {
        if (project.active || project.completed) effects.warn(error);
        else effects.error(error);
        return;
      }

      set({
        megaProjects: get().megaProjects.map((candidate) =>
          candidate.type === type ? { ...candidate, active: true } : candidate,
        ),
      });
      effects.started(project);
    },

    contributeToMegaProject: (type: MegaProjectType) => {
      const project = findMegaProject(get, type);
      if (!project || !project.active || project.completed) return;

      const stage = project.stages[project.currentStage];
      if (!stage || stage.completed) return;

      if (!canMaintainMegaProjectStage(get, project)) {
        effects.resourcesMissing(stage.name);
        return;
      }

      effects.resourcesConfirmed(project);
    },
  };
}
