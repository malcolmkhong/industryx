// ============================================
// notifications.ts — UI notification + game-event types.
// ============================================
//
// Toast notifications the store surfaces to the UI plus the random
// event shape the engine emits during play. Both flow into the same
// UI layer (the notification center), so they share this domain.
// ============================================

export interface GameNotification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  gameTick: number;
  read: boolean;
}

// --- Events ---
export interface GameEvent {
  id: string;
  type: string;
  name: string;
  description: string;
  duration: number; // ticks
  remaining: number;
  effects: EventEffect[];
  icon: string;
}

export interface EventEffect {
  /** Stable identifier assigned at config-load time. The runtime emits this
   *  on every effect so consumers can use it as a React list key. Generated
   *  deterministically as `${eventTemplateId}-effect-${index}`. */
  id: string;
  type:
    | "productionMultiplier"
    | "powerMultiplier"
    | "marketPriceMultiplier"
    | "transportSpeed"
    | "researchSpeed";
  target?: string;
  value: number; // multiplier
}
