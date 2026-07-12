// ============================================
// IndustryaX: UI Catalog — Workers + Automation
// Static presentation metadata only (no game-logic Master fields).
// Split from uiCatalog.ts — behavior-identical data move.
// ============================================

export type WorkerUIMeta = {
  type: string;
  name: string;
  description: string;
  icon: string;
};

export const WORKER_UI: Record<string, WorkerUIMeta> = {
  engineer: {
    "type": "engineer",
    "name": "Engineer",
    "description": "Boosts factory production speed and efficiency",
    "icon": "game-icons:overhead",
  },
  mechanic: {
    "type": "mechanic",
    "name": "Mechanic",
    "description": "Reduces maintenance costs and prevents breakdowns",
    "icon": "game-icons:wrench",
  },
  transportManager: {
    "type": "transportManager",
    "name": "Transport Manager",
    "description": "Optimizes transport routes and increases throughput",
    "icon": "game-icons:railway",
  },
  aiSupervisor: {
    "type": "aiSupervisor",
    "name": "AI Supervisor",
    "description": "Enhances automation systems and AI optimization",
    "icon": "game-icons:robot-golem",
  }
} as Record<string, WorkerUIMeta>;

export type AutomationUIMeta = {
  type: string;
  name: string;
  description: string;
  icon: string;
};

export const AUTOMATION_UI: AutomationUIMeta[] = [
  {
    "type": "autoRouting",
    "name": "Auto-Routing",
    "description": "Automatically optimizes transport routes",
    "icon": "game-icons:tread",
  },
  {
    "type": "autoBalancing",
    "name": "Auto-Balancing",
    "description": "Balances production across factories",
    "icon": "game-icons:scales",
  },
  {
    "type": "selfRepair",
    "name": "Self-Repair Bots",
    "description": "Buildings automatically repair over time",
    "icon": "game-icons:wrench",
  },
  {
    "type": "autoTrading",
    "name": "Auto-Trading",
    "description": "AI trades resources on the market automatically",
    "icon": "game-icons:profit",
  },
  {
    "type": "autoExpansion",
    "name": "Auto-Expansion",
    "description": "AI suggests and builds new production lines",
    "icon": "game-icons:castle",
  },
  {
    "type": "smartStorage",
    "name": "Smart Storage",
    "description": "Automatically distributes resources to where they are needed",
    "icon": "game-icons:warehouse",
  },
  {
    "type": "aiOptimization",
    "name": "AI Optimization",
    "description": "Full AI control over factory optimization",
    "icon": "game-icons:brain",
  }
];

