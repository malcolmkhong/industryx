// ============================================
// INDUSTRIAX: Building ID Migration
// Maps old hardcoded building IDs to new Supabase IDs
// ============================================
//
// When the game data moved from hardcoded data.ts to Supabase,
// some building IDs were renamed for consistency. This module
// handles migrating existing save data that uses old IDs.
//
// Usage:
//   import { migrateBuildingId, migrateSaveBuildings } from './idMigration';
//
//   // Single ID migration
//   const newId = migrateBuildingId('miningDrill'); // → 'ironMine'
//
//   // Batch migration of save state buildings
//   const migratedBuildings = migrateSaveBuildings(savedState.buildings);

// Maps old hardcoded building IDs to new Supabase IDs
export const BUILDING_ID_MAP: Record<string, string> = {
  miningDrill: 'ironMine',
  quarry: 'sandMine',       // quarry was a multi-resource extractor; Supabase splits into sandMine, lithiumMine
  goldsmith: 'jewelleryForge',
};

// Reverse map: new Supabase ID → old hardcoded ID
// Useful for backwards compatibility when loading old saves
export const REVERSE_BUILDING_ID_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(BUILDING_ID_MAP).map(([oldId, newId]) => [newId, oldId])
);

/**
 * Migrate a single building type ID from old to new format.
 * If the ID is not in the migration map, it is returned unchanged.
 */
export function migrateBuildingId(oldId: string): string {
  return BUILDING_ID_MAP[oldId] || oldId;
}

/**
 * Reverse-migrate a building type ID from new format back to old.
 * Useful when we need to display old IDs for legacy save compatibility.
 * If the ID is not in the reverse map, it is returned unchanged.
 */
export function reverseMigrateBuildingId(newId: string): string {
  return REVERSE_BUILDING_ID_MAP[newId] || newId;
}

/**
 * Check if a building ID is an old hardcoded ID that needs migration.
 */
export function isOldBuildingId(id: string): boolean {
  return id in BUILDING_ID_MAP;
}

/**
 * Check if a building ID is a new Supabase ID that was migrated from an old one.
 */
export function isMigratedBuildingId(id: string): boolean {
  return id in REVERSE_BUILDING_ID_MAP;
}

/**
 * Migrate all buildings in a save state's building array.
 * Each building object must have a `type` field.
 * Returns a new array with migrated type IDs.
 */
export function migrateSaveBuildings(
  buildings: Array<{ type: string; [key: string]: unknown }>
): Array<{ type: string; [key: string]: unknown }> {
  return buildings.map(b => ({
    ...b,
    type: migrateBuildingId(b.type),
  }));
}

/**
 * Migrate research IDs.
 * Research IDs mostly match between hardcoded and Supabase,
 * but this function is here for future-proofing.
 */
export function migrateResearchId(oldId: string): string {
  // Research IDs currently match between hardcoded and Supabase
  // Add migration mappings here if they diverge in the future
  return oldId;
}

/**
 * Migrate a full save state object, applying all ID migrations.
 * This handles buildings, and can be extended for other entity types.
 */
export function migrateSaveState(saveState: {
  buildings?: Array<{ type: string; [key: string]: unknown }>;
  completedResearch?: string[];
  [key: string]: unknown;
}): {
  buildings?: Array<{ type: string; [key: string]: unknown }>;
  completedResearch?: string[];
  [key: string]: unknown;
} {
  const result = { ...saveState };

  // Migrate building type IDs
  if (result.buildings && Array.isArray(result.buildings)) {
    result.buildings = migrateSaveBuildings(result.buildings);
  }

  // Migrate research IDs
  if (result.completedResearch && Array.isArray(result.completedResearch)) {
    result.completedResearch = result.completedResearch.map(migrateResearchId);
  }

  return result;
}
