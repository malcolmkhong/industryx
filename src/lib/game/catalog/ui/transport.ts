// ============================================
// IndustryaX: UI Catalog — Transport
// Static presentation metadata only (no game-logic Master fields).
// Split from uiCatalog.ts — behavior-identical data move.
// ============================================

import type { TransportType } from '../../shared/types/types';

export type TransportUIMeta = {
  type: TransportType;
  name: string;
  description: string;
  icon: string;
};

export const TRANSPORT_UI: Record<string, TransportUIMeta> = {
  conveyorBelt: {
    "type": "conveyorBelt",
    "name": "Conveyor Belt",
    "description": "Basic automated belt system for moving materials",
    "icon": "game-icons:tread",
  },
  pipe: {
    "type": "pipe",
    "name": "Pipe",
    "description": "Transports liquids and gases between buildings",
    "icon": "game-icons:pipes",
  },
  truck: {
    "type": "truck",
    "name": "Truck",
    "description": "Motorized transport for medium loads",
    "icon": "game-icons:cargo-ship",
  },
  cargoTrain: {
    "type": "cargoTrain",
    "name": "Cargo Train",
    "description": "High-capacity rail transport system",
    "icon": "game-icons:steam-locomotive",
  },
  drone: {
    "type": "drone",
    "name": "Drone",
    "description": "Fast aerial transport for small loads",
    "icon": "game-icons:ufo",
  },
  cargoShip: {
    "type": "cargoShip",
    "name": "Cargo Ship",
    "description": "Massive maritime transport for bulk materials",
    "icon": "game-icons:cargo-ship",
  }
} as Record<string, TransportUIMeta>;

