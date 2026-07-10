import type { MegaProjectType, ResourceType } from '../types';
import type { SetFn, GetFn } from "./_actionTypes";

export function createMegaProjectActions(set: SetFn, get: GetFn) {
  return {
    startMegaProject: (type: MegaProjectType) => {
      const state = get();
      const project = state.megaProjects.find(p => p.type === type);
      if (!project) return;

      if (project.active) {
        get().addNotification('warning', `${project.name} is already active!`);
        return;
      }

      if (project.completed) {
        get().addNotification('warning', `${project.name} is already completed!`);
        return;
      }

      // Check unlock requirements
      const req = project.unlockRequirement;
      if (req.buildings && state.buildings.length < req.buildings) {
        get().addNotification('error', `Need ${req.buildings} buildings! Have ${state.buildings.length}`);
        return;
      }
      if (req.research && state.completedResearch.length < req.research) {
        get().addNotification('error', `Need ${req.research} research! Have ${state.completedResearch.length}`);
        return;
      }
      if (req.prestige && state.prestigeState.totalPrestiges < req.prestige) {
        get().addNotification('error', `Need ${req.prestige} prestiges! Have ${state.prestigeState.totalPrestiges}`);
        return;
      }

      set({
        megaProjects: state.megaProjects.map(p =>
          p.type === type ? { ...p, active: true } : p
        ),
      });
      get().addNotification('info', `Mega Project started: ${project.name}! Maintain required resources to keep construction progressing.`);
    },

    contributeToMegaProject: (type: MegaProjectType) => {
      const state = get();
      const project = state.megaProjects.find(p => p.type === type);
      if (!project || !project.active || project.completed) return;

      const stage = project.stages[project.currentStage];
      if (!stage || stage.completed) return;

      // Check if player has all required resources
      const canContribute = stage.requiredResources.every(r => {
        if (r.resource === 'money') return state.money >= r.amount;
        return state.resources[r.resource as ResourceType] >= r.amount;
      });

      if (!canContribute) {
        get().addNotification('error', `Not enough resources for ${stage.name}! Resources must be held for construction to progress.`);
        return;
      }

      // Resources are NOT deducted upfront — they must be maintained throughout construction.
      // Progress auto-ticks each game tick as long as all required resources are available.
      // Resources are deducted only when the stage completes.
      get().addNotification('info', `${project.name}: ${stage.name} — Resources confirmed. Construction will progress as long as resources remain available.`);
    },
  };
}
