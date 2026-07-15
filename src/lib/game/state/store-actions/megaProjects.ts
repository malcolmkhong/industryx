import type { SetFn, GetFn } from "./_actionTypes";
import { createMegaProjectClientAction } from "./megaProjects/megaProjectClientAction";
import { createMegaProjectUiEffects } from "./megaProjects/megaProjectUiEffects";

export function createMegaProjectActions(set: SetFn, get: GetFn) {
  const effects = createMegaProjectUiEffects(get);
  return createMegaProjectClientAction(set, get, effects);
}
