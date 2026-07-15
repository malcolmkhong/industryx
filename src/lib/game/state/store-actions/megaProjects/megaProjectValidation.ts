import type { MegaProject, MegaProjectType } from "../../../shared/types/types";
import type { GetFn } from "../_actionTypes";

export function findMegaProject(get: GetFn, type: MegaProjectType): MegaProject | undefined {
  return get().megaProjects.find((project) => project.type === type);
}

export function getMegaProjectStartError(get: GetFn, project: MegaProject): string | null {
  const state = get();

  if (project.active) return `${project.name} is already active!`;
  if (project.completed) return `${project.name} is already completed!`;

  const req = project.unlockRequirement;
  if (req.buildings && state.buildings.length < req.buildings) {
    return `Need ${req.buildings} buildings! Have ${state.buildings.length}`;
  }
  if (req.research && state.completedResearch.length < req.research) {
    return `Need ${req.research} research! Have ${state.completedResearch.length}`;
  }
  if (req.prestige && state.prestigeState.totalPrestiges < req.prestige) {
    return `Need ${req.prestige} prestiges! Have ${state.prestigeState.totalPrestiges}`;
  }

  return null;
}

export function canMaintainMegaProjectStage(get: GetFn, project: MegaProject): boolean {
  const state = get();
  const stage = project.stages[project.currentStage];
  if (!stage || stage.completed) return false;

  return stage.requiredResources.every((requirement) => {
    if (requirement.resource === "money") return state.money >= requirement.amount;
    return state.resources[requirement.resource] >= requirement.amount;
  });
}
