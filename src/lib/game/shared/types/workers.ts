// ============================================
// workers.ts — worker domain types.
// ============================================

export type WorkerType =
  | "engineer"
  | "mechanic"
  | "transportManager"
  | "aiSupervisor";

export interface Worker {
  id: string;
  type: WorkerType;
  level: number;
  experience: number;
  assignedTo: string | null; // building instance id
  efficiency: number;
  speed: number;
  maintenance: number;
}

export interface WorkerDefinition {
  type: WorkerType;
  name: string;
  description: string;
  baseHireCost: number;
  effects: {
    efficiency: number; // per level
    speed: number;
    maintenance: number;
  };
  icon: string;
}
