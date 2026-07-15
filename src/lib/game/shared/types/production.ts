// ============================================
// production.ts — production engine + weather types.
// ============================================
//
// PowerGrid + weather shapes only. ProductionSnapshot stays defined
// in `productionCalculator.ts`; consumers (e.g. state.ts) import it
// directly when needed.
// ============================================

import type { BuildingInstance } from "./buildings";

// --- Power Grid ---
export interface PowerGrid {
  totalProduction: number;
  totalConsumption: number;
  efficiency: number; // 0-1 based on production/consumption ratio
  overload: boolean;
  plants: BuildingInstance[];
}

// --- Weather ---
export type WeatherType =
  | "clear"
  | "rainy"
  | "stormy"
  | "sunny"
  | "foggy"
  | "snowy";

export interface WeatherState {
  current: WeatherType;
  intensity: number; // 0-1, how strong the weather effect is
  remaining: number; // ticks remaining
  nextChange: number; // tick when weather will change
}

export interface WeatherDefinition {
  name: string;
  icon: string;
  productionMultiplier: number;
  solarMultiplier: number;
  windMultiplier: number;
  description: string;
}
